#!/usr/bin/env python3
"""Deploy the CLIENT view of one project to S3 (behind CloudFront).

    python deploy_s3.py --bucket my-bucket --project anandman --distribution E1ABCDEF2GHIJK

Only the client is deployed. The admin view needs server.py's /api/* endpoints (save,
upload, rename, export-bundle) and cannot work on static hosting — but the client never
calls them: initProjectBar() returns immediately when `!state.admin`, so a plain bucket is
enough. Nothing in index.html uses a root-absolute path either, so the tree is portable.

Requires the AWS CLI on PATH and credentials already configured (`aws configure`).

WHY THIS ISN'T JUST `aws s3 sync`:

  * Content-Type. The CLI guesses from the extension and gets `.webmanifest` and `.webp`
    wrong — the same two server.py had to register by hand. A wrong manifest type makes the
    browser ignore the PWA install entirely; a wrong image type stops the optimized WebP
    site-plan and panorama rendering at all.
  * Cache-Control. `sw.js` MUST NOT be long-cached: a stale service worker pins visitors to
    an old build forever, with no way to push them an update. Same for index.html.
    Media and /vendor/* on the other hand should be cached hard.
  * `.originals/` is ~950MB of pre-optimization backups sitting inside the project folder.
    Uploading it would triple the bill and serve nothing.
  * The version stamp (see stamp_index_html).

HTTPS IS NOT OPTIONAL. Service workers only run on HTTPS (or localhost), so on a bare S3
website endpoint there is no offline mode, no "Add to Home Screen" download and no cached
video — the whole PWA layer silently does not exist. Put CloudFront in front of the bucket
and pass --distribution so this script can invalidate it.
"""

import argparse
import mimetypes
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Explicit because the CLI's own guesses are wrong for exactly the types this app depends on.
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".pdf": "application/pdf",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}

# Revalidate every load. These are small, and being wrong here is expensive: a stale sw.js
# cannot be updated remotely, and a stale index.html pins the version stamp below.
NO_CACHE = "no-cache, must-revalidate"
# Content addressed by a deploy-stamped URL, or simply not worth re-fetching.
IMMUTABLE = "public, max-age=31536000, immutable"
MEDIA_CACHE = "public, max-age=86400"      # images/video/audio/pdf — a day
CONFIG_CACHE = "public, max-age=60"        # plots/landmarks/alignment — re-uploads should show up quickly
# The boot-curtain loading image (app.js's setBootImage, always saved as "loading.web.jpg")
# is the one media file NOT cache-busted with a `?v=` token — it has to be, so index.html's
# static <link rel="preload"> can target a fixed URL known before app.js even runs (see that
# comment for why). A short lifetime here is what stands in for the version token instead:
# an admin's replacement image shows up within a few minutes rather than potentially the
# full day MEDIA_CACHE would otherwise allow.
BOOT_IMAGE_CACHE = "public, max-age=300"   # 5 min

SHELL_FILES = ["index.html", "app.js", "styles.css", "sw.js", "manifest.webmanifest"]
# A published demo's offline file list (publish_s3.offline_list_bytes) — what a phone reads to
# see whether its saved copy is out of date, so it must never be served stale.
OFFLINE_LIST = "offline-files.json"
SHELL_DIRS = ["vendor", "icons"]
# Never uploaded: app.js imports ./vendor/three.module.min.js and sw.js precaches only that
# one, so the 1.3MB unminified dev build is pure bulk in a deployment. Keep it in the repo —
# it's the readable-stack-trace build for debugging THREE itself (see app.js's import note).
SKIP_FILES = {"vendor/three.module.js"}
# Mirrors app.js's OFFLINE_CONFIG_FILES — the small per-project files the menu needs.
CONFIG_EXT = {".json", ".csv", ".svg"}


def run(cmd, dry_run=False):
    printable = " ".join(str(c) for c in cmd)
    if dry_run:
        print("  [dry-run]", printable)
        return 0
    result = subprocess.run(cmd)
    if result.returncode != 0:
        sys.exit(f"FAILED: {printable}")
    return result.returncode


def content_type_for(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in CONTENT_TYPES:
        return CONTENT_TYPES[ext]
    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def cache_control_for(rel: str, path: Path) -> str:
    if rel in ("index.html", "sw.js", "app.js", "styles.css", "manifest.webmanifest", OFFLINE_LIST):
        # app.js/styles.css are revalidated rather than immutable because sw.js precaches them
        # by their BARE url (cacheKeyFor strips the query), so a hard-cached copy could outlive
        # a deploy. Revalidation costs one conditional request and answers 304 when unchanged.
        return NO_CACHE
    if rel.startswith(("vendor/", "icons/")):
        return IMMUTABLE
    if path.name == "loading.web.jpg":
        return BOOT_IMAGE_CACHE
    if path.suffix.lower() in CONFIG_EXT:
        return CONFIG_CACHE
    return MEDIA_CACHE


def stamp_index_html(src: Path, dest: Path, version: str) -> None:
    """Replace the two `?v=' + Date.now()` busters with a fixed per-deploy version.

    index.html ships as `app.js?v=${Date.now()}` / `styles.css?v=' + Date.now()`, which is
    right for local development — every reload is guaranteed fresh. On a CDN it is actively
    harmful: the URL is unique per page load, so the browser can never reuse its copy and
    CloudFront misses the edge cache every time. That is ~169KB (gzipped) of app.js +
    styles.css re-downloaded on EVERY visit, forever. Stamping one version per deploy keeps
    updates instant (the URL changes when you deploy) while letting repeat visits answer 304.
    Only the uploaded copy is rewritten; the working tree is untouched.
    """
    html, matched = stamp_index_text(src.read_text(encoding="utf-8"), version)
    if not matched:
        print("  ! version stamp did not match — index.html's cache-busting markup has changed.")
        print("    Deploying it as-is; app.js/styles.css will be re-fetched on every load.")
    dest.write_text(html, encoding="utf-8")


def stamp_index_text(html: str, version: str):
    """The text half of stamp_index_html → (html, matched). Shared with publish_s3.py (the
    admin's ☁ Publish), so both deploy paths stamp index.html identically."""
    before = html
    # styles.css is built by string concatenation inside document.write:
    #   href="styles.css?v=' + Date.now() + '"
    html = re.sub(r"styles\.css\?v='\s*\+\s*Date\.now\(\)\s*\+\s*'", f"styles.css?v={version}", html)
    # app.js is a template literal: `./app.js?v=${Date.now()}`
    html = re.sub(r"\./app\.js\?v=\$\{Date\.now\(\)\}", f"./app.js?v={version}", html)
    return html, html != before


def sync_file(local: Path, s3_url: str, rel: str, args) -> None:
    cmd = [
        "aws", "s3", "cp", str(local), s3_url,
        "--content-type", content_type_for(local),
        "--cache-control", cache_control_for(rel, local),
    ]
    if args.profile:
        cmd += ["--profile", args.profile]
    if args.region:
        cmd += ["--region", args.region]
    run(cmd, args.dry_run)


def sync_tree(root: Path, prefix: str, args, skip_dirs=()) -> int:
    """Upload a directory one file at a time so each gets its own type + cache headers."""
    count = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel_parts = path.relative_to(root).parts
        # Dot-directories are never served: `.originals/` alone is ~950MB of backups kept
        # beside the live files, and do_bundle skips them for the same reason.
        if any(part.startswith(".") for part in rel_parts):
            continue
        if rel_parts[0] in skip_dirs:
            continue
        rel = "/".join(rel_parts)
        if f"{prefix}{rel}" in SKIP_FILES:
            continue
        sync_file(path, f"s3://{args.bucket}/{prefix}{rel}", f"{prefix}{rel}", args)
        count += 1
    return count


def main() -> None:
    ap = argparse.ArgumentParser(description="Deploy the client view of one project to S3.")
    ap.add_argument("--bucket", required=True, help="target S3 bucket name")
    ap.add_argument("--project", default="anandman", help="project id under projects/ (default: anandman)")
    ap.add_argument("--distribution", help="CloudFront distribution id, to invalidate after upload")
    ap.add_argument("--profile", help="AWS CLI profile")
    ap.add_argument("--region", help="AWS region")
    ap.add_argument("--version", help="cache-busting stamp (default: derived from the git commit, else a timestamp)")
    ap.add_argument("--dry-run", action="store_true", help="print the commands without uploading")
    args = ap.parse_args()

    if not shutil.which("aws"):
        sys.exit("The AWS CLI is not on PATH. Install it and run `aws configure` first.")

    project_dir = HERE / "projects" / args.project
    if not project_dir.is_dir():
        sys.exit(f"No such project: {project_dir}")

    version = args.version
    if not version:
        try:
            version = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"], cwd=HERE,
                capture_output=True, text=True, check=True).stdout.strip()
        except Exception:
            version = None
    if not version:
        from datetime import datetime
        version = datetime.now().strftime("%Y%m%d%H%M%S")

    print(f"Deploying project '{args.project}' to s3://{args.bucket}  (version stamp: {version})")
    if args.dry_run:
        print("DRY RUN — nothing will be uploaded.\n")

    uploaded = 0
    with tempfile.TemporaryDirectory() as tmp:
        for name in SHELL_FILES:
            src = HERE / name
            if not src.exists():
                print(f"  ! missing shell file, skipping: {name}")
                continue
            if name == "index.html":
                stamped = Path(tmp) / "index.html"
                stamp_index_html(src, stamped, version)
                src = stamped
            sync_file(src, f"s3://{args.bucket}/{name}", name, args)
            uploaded += 1

        for d in SHELL_DIRS:
            if (HERE / d).is_dir():
                uploaded += sync_tree(HERE / d, f"{d}/", args)

        uploaded += sync_tree(project_dir, f"projects/{args.project}/", args)

    print(f"\n{uploaded} objects {'would be ' if args.dry_run else ''}uploaded.")

    if args.distribution:
        # Only the revalidating files need busting; media is addressed by a stable path and
        # a wildcard invalidation on a few hundred MB of objects is slow and billable.
        cmd = ["aws", "cloudfront", "create-invalidation",
               "--distribution-id", args.distribution,
               "--paths", "/index.html", "/sw.js", "/app.js", "/styles.css",
               "/manifest.webmanifest", f"/projects/{args.project}/*"]
        if args.profile:
            cmd += ["--profile", args.profile]
        print("\nInvalidating CloudFront…")
        run(cmd, args.dry_run)
    else:
        print("\nNo --distribution given, so CloudFront was not invalidated.")
        print("Visitors may keep seeing the previous index.html/sw.js until their TTL expires.")

    print(f"\nDone. The client opens at:  https://<your-distribution-domain>/?project={args.project}")
    print("Reminder: serve it over HTTPS (CloudFront), or the service worker never registers")
    print("and offline mode, the install banner and cached video all silently do nothing.")


if __name__ == "__main__":
    main()
