#!/usr/bin/env python3
"""Publish one project's CLIENT view to S3 as a shareable demo link (admin ☁ Publish).

Called by server.py's /api/publish* endpoints; the admin never talks to AWS directly and AWS
credentials never reach a browser. Each project becomes a SELF-CONTAINED folder with its own
copy of the app, so publishing one project can never change another client's demo:

    https://re.build91.in/<project>/                  ← the shared link
    <project>/index.html                               version-stamped; B91_PUBLISHED baked in
                                                       (project fixed, always view-only)
    <project>/app.js  styles.css  sw.js  vendor/  icons/  manifest.webmanifest (branded)
    <project>/projects/<project>/…                     the project's files, exactly where the
                                                       app already looks for them
    <project>/.b91-publish.json                        what was uploaded (md5 + headers) — lets a
                                                       re-publish upload only what changed
    <project>/offline-files.json                       PUBLIC list of every file a phone saves for
                                                       offline use, with sizes and fingerprints —
                                                       lets a saved copy update only what changed
                                                       (app.js "Save for offline"; MOBILE-OFFLINE.md)

The bucket's own root pages (index.html, _404.html) come from ./s3-root/ and are restored if
missing. Settings live in publish.config.json beside this file (git-ignored: it holds the
publish password). Content types and cache headers come from deploy_s3.py, so the CLI deploy
and this can't drift apart. See CLAUDE.md ("Publish to web").
"""

import hashlib
import hmac
import json
import os
import re
import tempfile
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import unquote

import deploy_s3

ROOT = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ROOT, "publish.config.json")
PROJECTS_DIR = os.path.join(ROOT, "projects")
S3_ROOT_DIR = os.path.join(ROOT, "s3-root")
PROJECT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
REQUIRED_KEYS = ("bucket", "region", "distributionId", "publicBaseUrl")
RECORD_NAME = ".b91-publish.json"
# The offline file list (see offline_list_bytes). Uploaded LAST, after index.html, so a phone
# never sees a new list while the files it names are still on their way up.
OFFLINE_LIST = deploy_s3.OFFLINE_LIST
# Never part of a saved offline copy: the browser fetches the worker script itself, around any cache.
OFFLINE_EXCLUDE = {"sw.js"}
# The project data the app itself loads by fixed name (loadProjectFile in app.js).
DATA_FILES = ("plots.svg", "plots.csv", "alignment.json", "landmarks.json", "amenities.json", "tour.json")
UPLOAD_WORKERS = 8
# The bucket's own pages → Cache-Control. _404.html is what CloudFront answers for EVERY
# missing path, with this object's headers — so it must not be cached, or a file that 404'd
# before a re-publish would keep 404ing in that browser after it.
ROOT_PAGES = {"index.html": "public, max-age=300", "_404.html": "no-cache, must-revalidate"}
# Never published: OS junk, and the WebP site-plan provenance records server.py writes beside
# a converted plan (prefer_webp_ground_image) — bookkeeping, not content.
SKIP_NAMES = {"thumbs.db", "desktop.ini"}
SKIP_SUFFIXES = (".source.json",)
ICON_FILES = (("icons/icon-192.png", 192, False), ("icons/icon-512.png", 512, False),
              ("icons/icon-512-maskable.png", 512, True))


class PublishError(Exception):
    """A problem the admin can act on. Its message is shown to them as-is."""


# ─── Settings & access ────────────────────────────────────────────────────────
def load_config():
    if not os.path.isfile(CONFIG_PATH):
        raise PublishError("Publishing isn't set up on this server — publish.config.json is missing "
                           "(see publish.config.example.json).")
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)
    except Exception as e:
        raise PublishError(f"publish.config.json can't be read: {e}")
    missing = [k for k in REQUIRED_KEYS if not str(cfg.get(k) or "").strip()]
    if missing:
        raise PublishError("publish.config.json is missing: " + ", ".join(missing))
    if not str(cfg.get("password") or ""):
        raise PublishError("No publish password is set — add \"password\" to publish.config.json.")
    return cfg


def check_password(cfg, given):
    """Constant-time compare, so response timing can't leak how much of a guess was right."""
    return hmac.compare_digest(str(cfg.get("password") or "").encode("utf-8"),
                               str(given or "").encode("utf-8"))


def _prefix(pid):
    """The project's folder in the bucket. Never empty and never anything but one validated
    id + "/" — every list/delete below is confined to it, so a bad id can't reach the rest
    of the bucket."""
    if not PROJECT_ID_RE.match(pid or ""):
        raise PublishError("Invalid project id.")
    return pid + "/"


def _clients(cfg):
    try:
        import boto3
    except ImportError:
        raise PublishError("Publishing needs the boto3 package on this server — run: pip install boto3")
    session = boto3.Session(profile_name=(cfg.get("awsProfile") or None), region_name=cfg["region"])
    return session.client("s3"), session.client("cloudfront")


def aws_message(e):
    """Turn a boto/botocore failure into something an admin can act on."""
    name = type(e).__name__
    if isinstance(e, PublishError):
        return str(e)
    if name in ("NoCredentialsError", "PartialCredentialsError"):
        return "This server has no AWS login — run `aws configure` on it."
    if name == "ProfileNotFound":
        return f"The AWS profile in publish.config.json doesn't exist on this server ({e})."
    if name in ("EndpointConnectionError", "ConnectTimeoutError", "ReadTimeoutError", "ConnectionClosedError"):
        return "Couldn't reach AWS — check this machine's internet connection and try again."
    if name == "ClientError":
        err = (getattr(e, "response", {}) or {}).get("Error", {})
        code, msg = err.get("Code", ""), err.get("Message", "")
        if code in ("AccessDenied", "AccessDeniedException", "InvalidAccessKeyId", "SignatureDoesNotMatch"):
            return f"AWS refused the request ({code}). The AWS login on this server needs S3 and CloudFront permissions."
        if code == "NoSuchBucket":
            return "The S3 bucket named in publish.config.json doesn't exist."
        if code == "NoSuchDistribution":
            return "The CloudFront distribution in publish.config.json doesn't exist."
        return f"AWS error {code}: {msg}".strip()
    return f"{name}: {e}"


# ─── Links ─────────────────────────────────────────────────────────────────────
_live_cache = {}


def _link_live(base):
    """Is the custom domain actually serving THIS site yet? A DNS lookup alone isn't enough (a
    wildcard record would resolve without the CNAME ever being added), so fetch the bucket's own
    root page and look for its text. Cached — 60s when live, 15s when not, so it flips quickly
    once the DNS record is added."""
    now = time.time()
    hit = _live_cache.get(base)
    if hit and now - hit[1] < (60 if hit[0] else 15):
        return hit[0]
    ok = False
    try:
        req = urllib.request.Request(base.rstrip("/") + "/", headers={"User-Agent": "b91-publish-check"})
        with urllib.request.urlopen(req, timeout=5) as r:
            ok = r.status == 200 and b"Build91 project demos" in r.read(8192)
    except Exception:
        ok = False
    _live_cache[base] = (ok, now)
    return ok


def links(cfg, pid):
    base = cfg["publicBaseUrl"].rstrip("/")
    cf = str(cfg.get("cloudfrontDomain") or "").strip()
    return {
        "url": f"{base}/{pid}/",
        "fallbackUrl": f"https://{cf}/{pid}/" if cf else None,
        "live": _link_live(base),
    }


# ─── What gets uploaded ───────────────────────────────────────────────────────
def _read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


# Google Earth background (GoogleEarthView.md): ~700 KB of vendor/ only a Google-mode project
# uses. It goes up — and into the offline file list — for those projects only. It MUST be in a
# Google project's offline list: a phone with a saved copy answers every same-site request from
# that copy (sw.js), so without it the Google view would fail even online. A drone-pano project
# never carries it.
GEO_VENDOR_PREFIXES = ("vendor/3d-tiles-renderer-", "vendor/three-r160-addons/", "vendor/google-maps-logo/")


def uses_google_background(project_dir):
    bg = _read_json(os.path.join(project_dir, "alignment.json")).get("background") or {}
    return isinstance(bg, dict) and bg.get("kind") == "google"


def shell_file_wanted(rel, google):
    """Should this app file (a path under vendor/ or icons/) go with this project?"""
    return google or not rel.startswith(GEO_VENDOR_PREFIXES)


GOLD = (212, 175, 55)


def _draw_b91(d, cx, cy, h, color):
    """ "B91" centred on (cx, cy) with cap height h, drawn from rectangles and arcs only — no
    font. Rendering text with a TrueType font (FreeType, via Pillow) crashed Python outright on
    the admin's Windows machine (2026-09-25: a native access violation, every run), and publishing
    runs inside server.py, so publishing a project without a logo took the whole server down — a
    crash no try/except can catch. Plain shapes also need no font file, so the icon looks the same
    on every machine (a Linux server may have no Arial at all)."""
    sw = h * 0.17                                          # stroke width
    wb, w9, w1, gap = h * 0.58, h * 0.56, h * 0.36, h * 0.17
    x = cx - (wb + gap + w9 + gap + w1) / 2
    y0, y1 = cy - h / 2, cy + h / 2
    stroke = max(1, round(sw))

    def bar(ax, ay, bx, by):
        d.rectangle([ax, ay, bx, by], fill=color)

    def arc(ccx, ccy, r, start, end):                      # Pillow: degrees clockwise from 3 o'clock; stroke drawn inward
        d.arc([ccx - r, ccy - r, ccx + r, ccy + r], start, end, fill=color, width=stroke)

    # B — a stem and two bowls sharing one middle bar; the lower bowl slightly wider.
    bar(x, y0, x + sw, y1)
    bowl_h = h / 2 + sw / 2
    r = bowl_h / 2
    for top, width in ((y0, wb * 0.92), (cy - sw / 2, wb)):
        xr = x + width - r
        bar(x, top, xr, top + sw)
        bar(x, top + bowl_h - sw, xr, top + bowl_h)
        arc(xr, top + r, r, 270, 90)
    # 9 — a round bowl, a stem down its right side, and a tail curving back left.
    x9 = x + wb + gap
    d.ellipse([x9, y0, x9 + w9, y0 + w9], outline=color, width=stroke)
    rt = w9 * 0.45
    bar(x9 + w9 - sw, y0 + w9 / 2, x9 + w9, y1 - rt)
    arc(x9 + w9 - rt, y1 - rt, rt, 0, 90)
    bar(x9 + w9 * 0.12, y1 - sw, x9 + w9 - rt, y1)
    # 1 — a stem with a flag.
    x1 = x9 + w9 + gap
    bar(x1 + w1 - sw, y0, x1 + w1, y1)
    d.line([(x1, y0 + h * 0.3), (x1 + w1 - sw / 2, y0 + sw / 2)], fill=color, width=stroke)


def _default_icon(size, maskable):
    """A plain gold "B91" tile — used when the project has no logo. The repo has no icons/
    folder (the root .gitignore excludes *.png), so without this a published demo would have
    no home-screen icon at all and phones wouldn't offer to install it. Drawn 4× larger and
    scaled down, which gives smooth edges without any font renderer (see _draw_b91)."""
    import io
    from PIL import Image, ImageDraw
    k = 4
    s = size * k
    im = Image.new("RGB", (s, s), (12, 13, 17))
    d = ImageDraw.Draw(im)
    pad = int(s * (0.22 if maskable else 0.12))
    d.rounded_rectangle([pad, pad, s - pad, s - pad], radius=int(s * 0.14), fill=(44, 37, 17),
                        outline=GOLD, width=max(2 * k, s // 64))
    _draw_b91(d, s / 2, s / 2, (s - 2 * pad) * 0.30, GOLD)
    im = im.resize((size, size), getattr(Image, "Resampling", Image).LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def _icon_bytes(pid, brand, icon_builder, warnings):
    """{rel: png bytes} for the three manifest icons: the project's logo letterboxed onto a
    square (server.py's _build_icon, same as its live /api/pwa-icon-*) when there is one, else
    the default tile. Empty when Pillow isn't installed — the publish still works, it just
    can't offer a home-screen icon."""
    logo_rel = (((brand or {}).get("logo") or {}) or {}).get("file") or ""
    logo = os.path.join(PROJECTS_DIR, pid, os.path.basename(logo_rel)) if logo_rel else ""
    out = {}
    for rel, size, maskable in ICON_FILES:
        try:
            if icon_builder and logo and os.path.isfile(logo):
                tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                tmp.close()
                try:
                    icon_builder(logo, tmp.name, size, maskable)
                    out[rel] = Path(tmp.name).read_bytes()
                finally:
                    os.unlink(tmp.name)
            else:
                out[rel] = _default_icon(size, maskable)
        except ImportError:
            warnings.append("Home-screen icons were skipped (Pillow isn't installed on this server).")
            return {}
        except Exception:
            out[rel] = _default_icon(size, maskable)
    return out


def offline_list_bytes(pid, files):
    """The offline file list: every file a phone saves for this project, with its size and
    fingerprint, plus one `version` for the whole set. `files` is {path: (size, md5)}, paths
    relative to the app folder (they may carry a ?project= query, as the local server's
    per-project manifest and icons do). A phone compares fingerprints to download only what
    changed, and compares `version` alone to show "Update available". Shared by publish (a
    static file in the demo's folder) and server.py's /api/offline-files (the local server)."""
    entries = [{"path": p, "size": int(s), "hash": h} for p, (s, h) in sorted(files.items())]
    version = hashlib.sha1("\n".join(f'{e["path"]}:{e["size"]}:{e["hash"]}' for e in entries)
                           .encode("utf-8")).hexdigest()[:16]
    return json.dumps({"project": pid, "version": version, "files": entries},
                      separators=(",", ":")).encode("utf-8")


def _manifest_bytes(brand):
    """The installed app's name and icons — static here, because a published folder has no
    server to generate them per request (server.py's do_manifest). start_url/scope are the
    folder itself, so an installed demo opens straight into its own project."""
    name = str((brand or {}).get("name") or "").strip() or "Build91"
    tagline = str((brand or {}).get("tagline") or "").strip()
    return json.dumps({
        "name": f"{name} - {tagline}" if tagline else name,
        "short_name": name[:12].strip(),
        "description": "Browse the plot layout, landmarks, and amenities - works offline once saved.",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "orientation": "landscape",
        "background_color": "#0c0d11",
        "theme_color": "#0c0d11",
        "icons": [
            {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }, indent=2).encode("utf-8")


def _index_bytes(pid, version, brand, warnings):
    """index.html for the published folder: the dev cache-busters replaced by one version per
    publish (deploy_s3.stamp_index_text), plus two tags injected first thing in <head>:
    B91_PUBLISHED, which fixes the project and forces the view-only client (app.js reads it
    before anything else, and index.html's own preload script needs it too), and noindex, so
    shared client demos don't turn up in search results. The iOS home-screen name is set to
    the project's brand too — iOS reads apple-mobile-web-app-title over the manifest, and with
    the stock "Build91" every saved demo's icon had the same name (app.js applyBrand does the
    same at runtime; this makes the page right before any script runs)."""
    html = Path(ROOT, "index.html").read_text(encoding="utf-8")
    html, matched = deploy_s3.stamp_index_text(html, version)
    if not matched:
        warnings.append("index.html's cache-busting markup has changed; the demo will re-download app.js on every visit.")
    name = str((brand or {}).get("name") or "").strip()
    if name:
        html = re.sub(r'(<meta\s+name="apple-mobile-web-app-title"\s+content=")[^"]*(")',
                      lambda m: m.group(1) + _html_attr(name) + m.group(2), html, count=1)
    inject = ('\n  <script>window.B91_PUBLISHED = %s;</script>\n  <meta name="robots" content="noindex" />'
              % json.dumps({"project": pid}))
    html, n = re.subn(r"(<head\b[^>]*>)", lambda m: m.group(1) + inject, html, count=1, flags=re.I)
    if n != 1:
        raise PublishError("index.html has no <head> tag — can't prepare the published copy.")
    return html.encode("utf-8")


def _html_attr(s):
    return (s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;"))


def _publishable(fn):
    low = fn.lower()
    return not (fn.startswith(".") or low in SKIP_NAMES or low.endswith(SKIP_SUFFIXES))


def _strings(obj, out):
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            _strings(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _strings(v, out)


def _project_files(project_dir):
    """(published, skipped): the project's data files plus every file they REFERENCE.

    A published link is public, and a project folder is also where people drop whatever they
    were working with — the sample project holds personal PDFs and screen recordings that
    nothing in it uses. So a file goes up only if its name appears in the project's own data:
    any string anywhere in its JSON (pano, plan, logo, audio, loading image, landmark/amenity
    renders, tour rooms and maps, every menu item's file) or in plots.csv (plot media). That
    matches by name without needing to know each field, so a new content type is covered for
    free; a stray over-match only uploads a file, it never breaks the demo.
    Only TOP-LEVEL files are candidates, same rule as do_bundle: the app resolves every asset by
    basename against the project folder, so subfolders only ever hold raw masters
    (panotour-demo/_source/ is 343MB of PNGs) and dot-files are backups/caches."""
    names = [fn for fn in sorted(os.listdir(project_dir))
             if os.path.isfile(os.path.join(project_dir, fn)) and _publishable(fn)]
    texts = []
    for fn in DATA_FILES:
        p = os.path.join(project_dir, fn)
        if not os.path.isfile(p):
            continue
        raw = Path(p).read_text(encoding="utf-8", errors="replace")
        if fn.endswith(".json"):
            try:
                doc = json.loads(raw)
                # A Google-mode project keeps its pano only so switching back is lossless; it is
                # never shown, so it isn't published (unless something else names it).
                if fn == "alignment.json" and isinstance(doc, dict) and (doc.get("background") or {}).get("kind") == "google":
                    doc = {k: v for k, v in doc.items() if k != "panoImage"}
                _strings(doc, texts)
                continue
            except Exception:
                pass
        texts.append(raw)
    hay = "\n".join(texts)
    hay = hay + "\n" + unquote(hay)   # a name stored URL-encoded ("My%20Tour.pdf") still counts
    published = [(fn, os.path.join(project_dir, fn)) for fn in names if fn in DATA_FILES or fn in hay]
    return published, len(names) - len(published)


def _walk(base, rel_prefix):
    """Every file under an app folder (vendor/, icons/) as (rel, full path), minus dot-paths."""
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        for fn in sorted(filenames):
            if _publishable(fn):
                full = os.path.join(dirpath, fn)
                yield rel_prefix + os.path.relpath(full, base).replace(os.sep, "/"), full


def _collect(pid, version, icon_builder, warnings):
    """rel → item. Later additions override earlier ones (generated icons/manifest win over
    any on-disk copies). An item is {path} or {data}, plus size, md5 and headers."""
    project_dir = os.path.join(PROJECTS_DIR, pid)
    items = {}

    def add(rel, path=None, data=None):
        name = Path(rel)
        ctype = deploy_s3.content_type_for(name)
        cache = deploy_s3.cache_control_for(rel, name)
        if data is not None:
            md5 = hashlib.md5(data).hexdigest()
            items[rel] = {"data": data, "size": len(data), "md5": md5, "ctype": ctype, "cache": cache}
        else:
            h = hashlib.md5()
            with open(path, "rb") as fh:
                for chunk in iter(lambda: fh.read(1 << 20), b""):
                    h.update(chunk)
            items[rel] = {"path": path, "size": os.path.getsize(path), "md5": h.hexdigest(), "ctype": ctype, "cache": cache}

    published, skipped = _project_files(project_dir)
    for fn, full in published:
        add(f"projects/{pid}/{fn}", path=full)
    google = uses_google_background(project_dir)
    for d in deploy_s3.SHELL_DIRS:
        base = os.path.join(ROOT, d)
        if os.path.isdir(base):
            for rel, full in _walk(base, d + "/"):
                if rel not in deploy_s3.SKIP_FILES and shell_file_wanted(rel, google):
                    add(rel, path=full)
    brand = _read_json(os.path.join(project_dir, "alignment.json")).get("brand") or {}
    for rel, data in _icon_bytes(pid, brand, icon_builder, warnings).items():
        add(rel, data=data)
    for name in deploy_s3.SHELL_FILES:
        if name == "index.html":
            continue
        if name == "manifest.webmanifest":
            add(name, data=_manifest_bytes(brand))
        elif os.path.isfile(os.path.join(ROOT, name)):
            add(name, path=os.path.join(ROOT, name))
        else:
            raise PublishError(f"The app file {name} is missing on this server.")
    add("index.html", data=_index_bytes(pid, version, brand, warnings))
    add(OFFLINE_LIST, data=offline_list_bytes(pid, {rel: (it["size"], it["md5"]) for rel, it in items.items()
                                                    if rel not in OFFLINE_EXCLUDE}))
    return items, skipped


def _sig(item):
    """What makes an uploaded object current: same bytes AND same headers. Headers are part
    of it so a change to deploy_s3's type/cache rules re-uploads files whose bytes didn't move."""
    return f'{item["md5"]}|{item["ctype"]}|{item["cache"]}'


# ─── Progress / jobs ──────────────────────────────────────────────────────────
class Progress:
    def __init__(self, kind):
        self._lock = threading.Lock()
        self._s = {"kind": kind, "running": True, "phase": "starting", "filesTotal": 0, "filesDone": 0,
                   "bytesTotal": 0, "bytesDone": 0, "unchanged": 0, "error": None, "result": None,
                   "startedAt": time.time()}

    def set(self, **kw):
        with self._lock:
            self._s.update(kw)

    def add(self, key, n):
        with self._lock:
            self._s[key] += n

    def snapshot(self):
        with self._lock:
            return dict(self._s)


_jobs = {}
_jobs_lock = threading.Lock()


def any_running():
    """Is a publish or unpublish running for any project? (server.py's /api/idle.)"""
    with _jobs_lock:
        return any(j.snapshot()["running"] for j in _jobs.values())


def job_state(pid):
    j = _jobs.get(pid)
    return j.snapshot() if j else None


def _claim(pid, kind):
    """Register a job for `pid`, or None if one is already running — publish and unpublish of
    the same project must never overlap (an unpublish mid-upload would leave half a site)."""
    with _jobs_lock:
        cur = _jobs.get(pid)
        if cur and cur.snapshot()["running"]:
            return None
        p = Progress(kind)
        _jobs[pid] = p
        return p


def start_publish(pid, icon_builder=None):
    """Kick off a background publish. False if this project is already publishing/unpublishing."""
    _prefix(pid)
    p = _claim(pid, "publish")
    if not p:
        return False

    def run():
        try:
            result = publish(pid, p, icon_builder)
            p.set(running=False, phase="done", result=result)
        except Exception as e:  # noqa: BLE001 — every failure is reported to the admin, none may kill the server
            p.set(running=False, phase="error", error=aws_message(e))

    threading.Thread(target=run, name=f"publish-{pid}", daemon=True).start()
    return True


def run_unpublish(pid):
    """Synchronous unpublish, registered as a job so it can't overlap a publish."""
    _prefix(pid)
    p = _claim(pid, "unpublish")
    if not p:
        raise PublishError("This project is being published right now — wait for it to finish.")
    try:
        result = unpublish(pid, p)
        p.set(running=False, phase="done", result=result)
        return result
    except Exception as e:  # noqa: BLE001
        p.set(running=False, phase="error", error=aws_message(e))
        raise


# ─── The three operations ─────────────────────────────────────────────────────
def _list(s3, bucket, prefix):
    out = {}
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for o in page.get("Contents", []):
            out[o["Key"]] = o["Size"]
    return out


def _delete(s3, bucket, prefix, keys):
    keys = [k for k in keys if k.startswith(prefix)]   # belt and braces: only ever inside the folder
    for i in range(0, len(keys), 1000):
        res = s3.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": k} for k in keys[i:i + 1000]], "Quiet": True})
        if res.get("Errors"):
            e = res["Errors"][0]
            raise PublishError(f"Couldn't remove {e.get('Key')} from S3 ({e.get('Code')}).")
    return len(keys)


def _invalidate(cf, cfg, pid, ref):
    cf.create_invalidation(DistributionId=cfg["distributionId"], InvalidationBatch={
        "Paths": {"Quantity": 1, "Items": [f"/{pid}/*"]},
        "CallerReference": f"{pid}-{ref}-{int(time.time() * 1000)}",
    })


def _ensure_root_pages(s3, bucket):
    """The bucket's landing + "demo not available" pages (CloudFront's error page for every
    missing path). Restored from ./s3-root/ if someone deleted them."""
    for name, cache in ROOT_PAGES.items():
        src = os.path.join(S3_ROOT_DIR, name)
        if not os.path.isfile(src):
            continue
        try:
            s3.head_object(Bucket=bucket, Key=name)
        except Exception:
            s3.upload_file(src, bucket, name, ExtraArgs={"ContentType": "text/html; charset=utf-8",
                                                         "CacheControl": cache})


def publish(pid, prog, icon_builder=None):
    cfg = load_config()
    prefix = _prefix(pid)
    project_dir = os.path.join(PROJECTS_DIR, pid)
    if not (os.path.isfile(os.path.join(project_dir, "plots.svg")) or os.path.isfile(os.path.join(project_dir, "tour.json"))):
        raise PublishError("This project has nothing to publish yet — save it first.")
    s3, cf = _clients(cfg)
    bucket = cfg["bucket"]
    version = time.strftime("%Y%m%d%H%M%S")
    warnings = []

    prog.set(phase="preparing")
    items, skipped = _collect(pid, version, icon_builder, warnings)

    prog.set(phase="checking")
    live = _list(s3, bucket, prefix)
    try:
        prev = json.loads(s3.get_object(Bucket=bucket, Key=prefix + RECORD_NAME)["Body"].read()).get("files", {})
    except Exception:
        prev = {}   # first publish, or an unreadable record: upload everything
    # Skip only what is BOTH recorded as current AND actually still in the bucket at that size —
    # the record alone would miss an object someone deleted by hand in the AWS console.
    todo = {rel: it for rel, it in items.items()
            if not (prev.get(rel) == _sig(it) and live.get(prefix + rel) == it["size"])}
    prog.set(phase="uploading", filesTotal=len(todo), bytesTotal=sum(it["size"] for it in todo.values()),
             unchanged=len(items) - len(todo))

    from boto3.s3.transfer import TransferConfig
    tcfg = TransferConfig(multipart_threshold=16 * 1024 * 1024, max_concurrency=4)

    def put(rel, it):
        extra = {"ContentType": it["ctype"], "CacheControl": it["cache"]}
        if "data" in it:
            s3.put_object(Bucket=bucket, Key=prefix + rel, Body=it["data"], **extra)
            prog.add("bytesDone", it["size"])
        else:
            s3.upload_file(it["path"], bucket, prefix + rel, ExtraArgs=extra, Config=tcfg,
                           Callback=lambda n: prog.add("bytesDone", n))
        prog.add("filesDone", 1)

    # Content first, then the app code, then index.html — so nobody opening the link mid-publish
    # gets a new page that points at files which haven't arrived yet — and the offline file list
    # very last, so a phone updating its saved copy never sees fingerprints for files still on
    # their way up.
    shell = [r for r in todo if r in deploy_s3.SHELL_FILES]
    content = [r for r in todo if r not in shell and r != OFFLINE_LIST]
    for batch in (content, [r for r in shell if r != "index.html"], [r for r in shell if r == "index.html"],
                  [r for r in todo if r == OFFLINE_LIST]):
        if not batch:
            continue
        with ThreadPoolExecutor(max_workers=UPLOAD_WORKERS) as pool:
            for fut in as_completed([pool.submit(put, r, todo[r]) for r in batch]):
                fut.result()   # re-raises the first failure

    prog.set(phase="cleaning")
    keep = {prefix + rel for rel in items} | {prefix + RECORD_NAME}
    removed = _delete(s3, bucket, prefix, [k for k in live if k not in keep])
    s3.put_object(Bucket=bucket, Key=prefix + RECORD_NAME, ContentType="application/json",
                  CacheControl="no-store",
                  Body=json.dumps({"version": version, "publishedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                                   "files": {rel: _sig(it) for rel, it in items.items()}}).encode("utf-8"))
    _ensure_root_pages(s3, bucket)

    prog.set(phase="invalidating")
    _invalidate(cf, cfg, pid, version)

    return {**links(cfg, pid), "version": version, "uploaded": len(todo), "unchanged": len(items) - len(todo),
            "removed": removed, "bytes": sum(it["size"] for it in todo.values()), "notUsed": skipped,
            "warnings": warnings}


def unpublish(pid, prog=None):
    cfg = load_config()
    prefix = _prefix(pid)
    s3, cf = _clients(cfg)
    if prog:
        prog.set(phase="cleaning")
    removed = _delete(s3, cfg["bucket"], prefix, list(_list(s3, cfg["bucket"], prefix)))
    if removed:
        if prog:
            prog.set(phase="invalidating")
        _invalidate(cf, cfg, pid, "unpublish")
    return {"removed": removed}


def status(pid):
    """Never raises: {configured:false, message} when publishing isn't set up; otherwise the
    links, whether the project is published (its index.html exists) and when, and any job."""
    try:
        cfg = load_config()
    except PublishError as e:
        return {"configured": False, "message": str(e)}
    out = {"configured": True, "job": job_state(pid)}
    try:
        prefix = _prefix(pid)
        out.update(links(cfg, pid))
        s3, _ = _clients(cfg)
        try:
            head = s3.head_object(Bucket=cfg["bucket"], Key=prefix + "index.html")
            out.update(published=True, publishedAt=head["LastModified"].isoformat())
        except Exception as e:
            code = str(((getattr(e, "response", {}) or {}).get("Error", {}) or {}).get("Code", ""))
            if code not in ("404", "NoSuchKey", "NotFound"):
                raise
            out.update(published=False)
    except Exception as e:  # noqa: BLE001
        out["error"] = aws_message(e)
    return out
