#!/usr/bin/env python3
"""
Build91 Interactive Plot Map — tiny zero-dependency dev/admin server.

Serves the static app (like `python -m http.server`) AND adds a small write API so
the admin view can SAVE a project's files straight to disk instead of downloading
them. Each project is a directory under ./projects/<project-id>/.

  GET  /                         → the client app (index.html)
  GET  /?project=<id>            → client loads projects/<id>/  (handled in JS)
  GET  /api/projects             → { "projects": ["sample", ...] }  (dirs with plots.svg)
  GET  /api/export-bundle?project=<id>
                                 → a .zip of a self-contained, view-only "standalone site"
                                   (app shell + the project's files under data/) for any host
  POST /api/save                 → body { project, files:[{name,encoding,data}] }
                                   writes each file into projects/<project>/, returns JSON
  GET  /api/publish/status?project=<id>
                                 → is it on the web (re.build91.in/<id>/), its link, any job
  POST /api/publish              → body { project, password } — uploads the project's client
                                   view to S3 in the background (publish_s3.py); 202 + poll
  GET  /api/publish/progress?project=<id>
                                 → that background job's live progress
  POST /api/unpublish            → body { project, password } — takes it off the web

Safety: project ids and file names are sanitised and every write is confined to the
projects/ root (no path traversal). It binds to 0.0.0.0 so other devices on the LAN can
reach it (e.g. admin plotting from a remote browser). NOTE: the write API
(/api/save,/rename,/delete) is UNAUTHENTICATED — only run this on a trusted / firewalled
network. Set HOST=127.0.0.1 (env) to restrict it back to this machine only. Publish and
unpublish are the exception: they put things on the PUBLIC internet, so they need the
publish password from publish.config.json, and the AWS login they use never leaves this
machine.

Run:  python server.py [port]      (default 8731)
"""
import gzip
import hashlib
import json
import mimetypes
import os
import re
import socket
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import deploy_s3
import publish_s3

# Python's mimetypes module doesn't know this extension by default, which would otherwise
# serve manifest.webmanifest as application/octet-stream — harmless in Chrome but some
# browsers are stricter about the web app manifest's content type.
mimetypes.add_type("application/manifest+json", ".webmanifest")
# Same issue for .webp — depends on the Python build/OS mimetypes registry rather than the
# Python version alone (confirmed: 3.10 here returns None/None for it, 3.14 on the same
# machine does not), so register it explicitly rather than relying on whatever happens to
# be on the machine running this. Browsers still render an octet-stream image fine via
# <img>/texture loads, but this also feeds GZIP_MIME_PREFIXES below, and an unrecognised
# mime type there means a .webp asset silently never gets gzip'd.
mimetypes.add_type("image/webp", ".webp")

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECTS_DIR = os.path.join(ROOT, "projects")
PROJECT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")

# gzip only text-ish assets — app.js/styles.css/index.html/the vendor JS libs are the big
# ones (hundreds of KB to 1MB+, uncompressed, on every single page load) and compress
# 70-85%. Never gzip images/video/audio (already-compressed formats gain nothing and
# waste CPU) or anything under GZIP_MIN_BYTES (gzip's own header/footer overhead makes it
# a net loss on tiny files).
GZIP_MIME_PREFIXES = ("text/", "application/javascript", "application/json",
                       "application/manifest+json", "image/svg+xml")
GZIP_MIN_BYTES = 1024

def safe_project(pid):
    """Return a validated project id or None."""
    pid = (pid or "").strip().lower()
    return pid if PROJECT_ID_RE.match(pid) else None

def safe_filename(name):
    """basename only, no separators / traversal / hidden files."""
    name = (name or "").strip()
    if not name or "/" in name or "\\" in name or ".." in name or name.startswith("."):
        return None
    if name != os.path.basename(name):
        return None
    return name

# The app shell files (relative to ROOT) that a standalone bundle ships alongside the data.
BUNDLE_SHELL = ["index.html", "app.js", "styles.css", os.path.join("vendor", "three.module.min.js")]

# Project data files a bundle embeds inline into index.html (see build_embedded_files_json)
# so the exported site needs zero fetch() calls for its own data — see do_bundle's docstring.
BUNDLE_DATA_FILES = ["plots.svg", "plots.csv", "alignment.json", "landmarks.json", "amenities.json", "tour.json"]

def module_to_global(js, global_name):
    """Rewrite the vendored three.module.min.js — a single flat ES module whose only
    import/export surface is one trailing aggregate `export {...};` statement, with no
    other export/import statements anywhere in the file — into a classic script that
    attaches everything to window.<global_name> instead. Needed because an exported bundle
    must run via file://, where ES module fetches are blocked by the browser (verified: a
    dynamic `import()` of a local module throws "Failed to fetch dynamically imported
    module" under file://, same for `fetch()`; a classic `<script src>` does not).
    Each item in that export list is either a bare `localName` (identical local/exported
    name — true of the old unminified build) or, in the MINIFIED build, `localName as
    exportedName` (the minifier renames internals, so most items are aliased) — naively
    splicing that raw text into `{...}` as an object literal is invalid JS wherever an
    `as` shows up (`as` has no meaning outside an actual import/export statement), so each
    item is reformatted into a real `exportedName: localName` pair instead (verified by
    actually executing the transformed output of BOTH build shapes in Node and confirming
    `window.THREE.WebGLRenderer` etc. come out as real functions, not just checking the
    text for a leftover "export" keyword — that check alone missed this exact bug).
    The whole rewritten body is wrapped in an IIFE — the module's own THOUSANDS of
    top-level `const`/`let`/`class` declarations (heavily minified single/double-letter
    names) were scoped to that module in the original ES module and must stay scoped
    somewhere once this runs as a classic script instead, or they leak into the page's
    ONE SHARED global lexical scope across every `<script>` tag. Confirmed as a real,
    not theoretical, break: an actual exported bundle loaded in headless Chrome via
    file:// got stuck at "LOADING… 0%" forever with `Identifier '$' has already been
    declared` — the minifier happened to land one of ITS internal names on `$`, exactly
    colliding with app.js's own top-level `const $ = (id) => document.getElementById(id)`
    helper, and that SyntaxError kills app.js's ENTIRE script, not just the one line.
    Ships the file unmodified (falling back to the original ES module) if that one export
    statement isn't found in the expected shape, rather than silently producing a broken
    file — note that fallback is only "safe" in the sense of not raising here; the bundle
    itself would still be broken (an ES import/export statement isn't valid inside the
    plain `<script src>` bake_bundle_html swaps it into), so an unrelated future change to
    the vendored file's export shape needs re-verifying against this function, not just
    trusting the fallback to make it silently fine."""
    m = re.search(r"export\s*\{(.+)\};\s*$", js, re.DOTALL)
    if not m:
        return js
    pairs = []
    for item in m.group(1).split(","):
        item = item.strip()
        if not item:
            continue
        aliased = re.match(r"^(\S+)\s+as\s+(\S+)$", item)
        local, exported = aliased.group(1, 2) if aliased else (item, item)
        pairs.append("%s: %s" % (exported, local))
    body = js[:m.start()]
    assignment = "window.%s = {%s};\n" % (global_name, ", ".join(pairs))
    return "(function () {\n" + body + assignment + "})();\n" + js[m.end():]

def strip_named_import(js, module_rel_path):
    """Remove app.js's single `import * as X from '<module_rel_path>';` line so the
    exported copy can load as a classic script — module_to_global's window global takes
    its place. A no-op if the line isn't found (ships unmodified rather than breaking)."""
    pattern = re.compile(r"^import \* as \w+ from ['\"]" + re.escape(module_rel_path) + r"['\"];\s*\n", re.MULTILINE)
    return pattern.sub("", js, count=1)

def build_embedded_files_json(src_dir):
    """Read this project's core data files and JSON-encode them for inline embedding —
    the bundle's data-loading helper (loadProjectFile in app.js) reads from this object
    instead of fetch()-ing ./data/<name>, which is blocked under file://. `</` is escaped
    so embedded content (e.g. an SVG containing that literal text) can't prematurely close
    the <script> tag it's embedded in."""
    files = {}
    for name in BUNDLE_DATA_FILES:
        p = os.path.join(src_dir, name)
        if os.path.isfile(p):
            with open(p, "r", encoding="utf-8") as fh:
                files[name] = fh.read()
    if "alignment.json" in files:
        files["alignment.json"] = without_google_key(files["alignment.json"])
    return json.dumps(files).replace("</", "<\\/")

def without_google_key(raw):
    """alignment.json text minus the project's Google key. A bundle never shows Google's view
    (no guaranteed connection, and a file:// page sends no website address, so a key limited to
    websites fails anyway) — so the key has no business travelling in one (GoogleEarthView.md §8)."""
    try:
        doc = json.loads(raw)
    except Exception:
        return raw
    g = (doc.get("background") or {}).get("google") if isinstance(doc, dict) else None
    if isinstance(g, dict) and g.get("apiKey"):
        g["apiKey"] = ""
        return json.dumps(doc, indent=2)
    return raw

def _sha1_file(path):
    import hashlib
    h = hashlib.sha1()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def prefer_webp_ground_image(raw, dest):
    """Keep a project's site plan on its lossless WebP (2026-09-22). anandman's 38.5 MB PNG site plan
    was converted to a pixel-identical 23 MB lossless WebP, but an admin page opened BEFORE that
    change still holds the PNG — and on every Save it writes the PNG's NAME back into
    alignment.json and re-sends the PNG FILE itself, undoing the saving on the live site.

    So when a saved alignment points its groundImage at a .png that has a same-named .webp beside
    it, the reference is switched to the WebP if the PNG on disk is the very image the WebP was
    made from. That is decided by CONTENT: `<name>.webp.source.json` records the SHA-1 of the source
    PNG (written when the WebP is made). An earlier version compared file times instead, and was
    defeated within the hour because re-sending the same PNG makes it the newer file. A PNG with a
    different hash is a genuinely new plan and is left alone. Without a record, falls back to
    "the WebP is newer". Anything else is written through untouched; this never blocks a save."""
    try:
        doc = json.loads(raw.decode("utf-8"))
        gi = doc.get("groundImage") if isinstance(doc, dict) else None
        f = gi.get("file") if isinstance(gi, dict) else None
        if not f or not f.lower().endswith(".png"):
            return raw
        png = os.path.join(dest, os.path.basename(f))
        webp = png[:-4] + ".webp"
        if not os.path.isfile(webp):
            return raw
        same = False
        rec = webp + ".source.json"
        if os.path.isfile(rec) and os.path.isfile(png):
            with open(rec, "r", encoding="utf-8") as fh:
                same = json.load(fh).get("sha1") == _sha1_file(png)
        elif not os.path.isfile(rec):
            same = not os.path.isfile(png) or os.path.getmtime(webp) > os.path.getmtime(png)
        if same:
            gi["file"] = f[:-4] + ".webp"
            sys.stderr.write(f"[save] groundImage kept on the lossless WebP: {os.path.basename(webp)}\n")
            return json.dumps(doc, indent=2, ensure_ascii=False).encode("utf-8")
    except Exception:
        pass
    return raw

def tour_pano_basenames(src_dir):
    """Every virtual-tour node panorama in this project. These are WebGL textures exactly
    like the background pano, so under file:// they must be inlined as data: URIs too —
    a loose file next to index.html is rejected as tainted. Read from tour.json rather
    than globbing, so only panos an authored tour actually references get embedded."""
    names = set()
    p = os.path.join(src_dir, "tour.json")
    if not os.path.isfile(p):
        return names
    try:
        with open(p, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
    except Exception:
        return names                                # malformed tour.json must not kill the export
    for tour in (doc.get("tours") or []):
        for node in (tour.get("nodes") or []):
            # Both renders where a room has two (furnished/unfurnished, 2026-09-21) — the
            # client's version toggle needs either one to be a usable texture in bundle mode.
            for key in ("pano", "panoAlt"):
                f = (node.get(key) or {}).get("file")
                if f:
                    names.add(os.path.basename(f))
    return names

def build_embedded_images_json(src_dir, alignment_dict):
    """Base64-embed the pano + site-plan (drape) images as data: URIs. Unlike every other
    asset (logos, landmark/amenity renders, contact photos — all plain <img> elements),
    these two get uploaded to a WebGL texture (texImage2D), and a texture sourced from a
    plain file:// path is rejected as tainted/cross-origin by the browser — verified
    directly, and true even for a file sitting right next to index.html in the same
    folder. A data: URI is not subject to that check, so these two get the same inline
    treatment as the JSON/SVG data files instead of shipping as loose files."""
    import base64
    import mimetypes
    names = set()
    google = ((alignment_dict or {}).get("background") or {}).get("kind") == "google"
    for key in ("panoImage", "groundImage"):
        if key == "panoImage" and google:
            continue                               # Google mode never shows the pano (a bundle shows plan only)
        f = ((alignment_dict or {}).get(key) or {}).get("file")
        if f:
            names.add(os.path.basename(f))
    names |= tour_pano_basenames(src_dir)          # tour node panos are textures too
    images = {}
    for name in names:
        p = os.path.join(src_dir, name)
        if os.path.isfile(p):
            mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
            with open(p, "rb") as fh:
                b64 = base64.b64encode(fh.read()).decode("ascii")
            images[name] = "data:%s;base64,%s" % (mime, b64)
    return json.dumps(images)  # base64's alphabet can never contain "</", nothing to escape

def bake_bundle_html(html, pid, embedded_files_json, embedded_images_json):
    """Bake window.B91_BUNDLE + window.B91_BUNDLE_FILES + window.B91_BUNDLE_IMAGES into the
    exported index.html (so app.js boots in view-only bundle mode and reads its data/pano/
    plan inline instead of over the network), and swap the dev-mode cache-busted module
    `import()` for classic <script> tags pointing at the export's rewritten, non-module
    files — see module_to_global / strip_named_import. pid is already sanitised → safe to
    interpolate into the JSON."""
    flag = ('<script>window.B91_BUNDLE = {"project": "%s", "dataBase": "./data"}; '
            'window.B91_BUNDLE_FILES = %s; window.B91_BUNDLE_IMAGES = %s;</script>') % (
        pid, embedded_files_json, embedded_images_json)
    m = re.search(r"<head[^>]*>", html, re.IGNORECASE)
    html = (html[:m.end()] + "\n  " + flag + html[m.end():]) if m else (flag + html)
    html = re.sub(
        r'<script type="module">.*?</script>',
        '<script src="vendor/three.global.js"></script>\n  <script src="app.js"></script>',
        html, count=1, flags=re.DOTALL,
    )
    return html

def scan_menu_for_online_content(alignment_dict):
    """Walk the admin menu tree (alignment.json's menuConfig.tree) and list every content
    item whose active source is an external URL rather than an uploaded file — those need
    a live internet connection no matter what, even inside an otherwise-offline standalone
    export, since the content itself lives somewhere else. Mirrors the same file-then-url
    priority the client viewer uses (see openClientVideoModal etc. in app.js). Each flagged
    entry includes the node's id + its current url so the admin UI can jump straight into
    editing that exact item (openNodeBuilderModal(id) in app.js) instead of just naming it."""
    tree = ((alignment_dict or {}).get("menuConfig") or {}).get("tree") or []
    flagged = []

    def walk(nodes):
        for node in (nodes or []):
            if not isinstance(node, dict):
                continue
            kind = node.get("kind")
            if kind == "parent":
                walk(node.get("children"))
            elif kind == "child":
                ctype = node.get("contentType") or "link"
                content = node.get("content") or {}
                title = node.get("title") or "Untitled item"
                node_id = node.get("id") or ""
                if ctype == "gallery":
                    if any(isinstance(img, dict) and img.get("url") and not img.get("name")
                           for img in (content.get("images") or [])):
                        flagged.append({"id": node_id, "title": title, "contentType": "gallery photo", "url": "", "source": "menu"})
                elif content.get("url") and not content.get("fileName"):
                    flagged.append({"id": node_id, "title": title, "contentType": ctype, "url": content.get("url") or "", "source": "menu"})

    walk(tree)
    return flagged

def scan_amenities_for_online_content(amenities_dict):
    """Amenities (in-layout icon pins — a separate feature from the admin menu tree, see
    CLAUDE.md) carry their own `tour_url` with no uploaded-file alternative at all (the
    admin UI only ever offers a text field for it), filled in exactly the same "paste a
    link" way a menu item's url is — so it gets the same offline-flagging treatment. This
    is deliberately NOT extended to a plot's own `tour_url`/`video_url`/`image_url`
    (plots.csv): a plot's tour link is *always* meant to point out to an externally-hosted
    3DVista virtual tour — that's this app's whole "storefront" design (see CLAUDE.md's
    very first line), not a mistake worth flagging the way a menu item or amenity is."""
    flagged = []
    for a in ((amenities_dict or {}).get("amenities") or []):
        if not isinstance(a, dict):
            continue
        url = (a.get("tour_url") or "").strip()
        if url:
            flagged.append({"id": a.get("id") or "", "title": a.get("name") or "Untitled amenity", "contentType": "amenity tour", "url": url, "source": "amenity"})
    return flagged

# ─── Offline file list (phones' "Save for offline", see MOBILE-OFFLINE.md) ─────────────────
# (size, md5) per file, remembered by its modification time and size so a list request doesn't
# re-read every video each time — only files that changed since the last request are hashed.
_sig_cache = {}
_sig_lock = threading.Lock()

def _file_sig(path):
    st = os.stat(path)
    key = os.path.normcase(os.path.abspath(path))
    with _sig_lock:
        hit = _sig_cache.get(key)
    if hit and hit[0] == st.st_mtime_ns and hit[1] == st.st_size:
        return hit[1], hit[2]
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    with _sig_lock:
        _sig_cache[key] = (st.st_mtime_ns, st.st_size, h.hexdigest())
    return st.st_size, h.hexdigest()

def _bytes_sig(data):
    return len(data), hashlib.md5(data).hexdigest()

def offline_files(pid):
    """The same list a published demo carries (publish_s3.offline_list_bytes), for the local
    server's root layout: the app files, the project's data plus every file it references (the
    publish rule, _project_files — nothing a project folder merely happens to hold), and the
    per-project manifest and icons exactly as the page asks for them (?project= included, the
    one query the offline layer keeps in its cache keys)."""
    project_dir = os.path.join(PROJECTS_DIR, pid)
    files = {}
    published, _ = publish_s3._project_files(project_dir)
    for fn, full in published:
        files["projects/%s/%s" % (pid, fn)] = _file_sig(full)
    google = publish_s3.uses_google_background(project_dir)   # the Google-only vendor code, for those projects only
    for d in deploy_s3.SHELL_DIRS:
        base = os.path.join(ROOT, d)
        if os.path.isdir(base):
            for rel, full in publish_s3._walk(base, d + "/"):
                if rel not in deploy_s3.SKIP_FILES and publish_s3.shell_file_wanted(rel, google):
                    files[rel] = _file_sig(full)
    for name in deploy_s3.SHELL_FILES:
        if name in publish_s3.OFFLINE_EXCLUDE or name == "manifest.webmanifest":
            continue
        p = os.path.join(ROOT, name)
        if os.path.isfile(p):
            files[name] = _file_sig(p)
    brand = (read_alignment(project_dir) or {}).get("brand") or {}
    q = "?project=" + pid
    files["manifest.webmanifest" + q] = _bytes_sig(manifest_body(pid, brand))
    variants = ("192", "512", "512m") if _manifest_uses_logo(brand) else ("192",)   # 192 is also the iOS touch icon
    for v in variants:
        data = pwa_icon_bytes(pid, brand, v)
        if data:
            files["api/pwa-icon-%s.png%s" % (v, q)] = _bytes_sig(data)
    return publish_s3.offline_list_bytes(pid, files)

def _manifest_uses_logo(brand):
    return bool(((brand.get("logo") or {}) or {}).get("file")) and _pillow_ok()

def manifest_body(pid, brand):
    """The web app manifest, generated per project so the installed home-screen icon and name
    are the ADMIN'S branding rather than a generic Build91 one (see Handler.do_manifest)."""
    name = (brand.get("name") or "").strip() or "Build91"
    tagline = (brand.get("tagline") or "").strip()
    q = "?project=%s" % pid
    # Fall back to the bundled B91 icons when the project has no logo (or Pillow is
    # unavailable to resize one) — a manifest without usable icons isn't installable.
    icons = ([
        {"src": "api/pwa-icon-192.png" + q, "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "api/pwa-icon-512.png" + q, "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "api/pwa-icon-512m.png" + q, "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ] if _manifest_uses_logo(brand) else [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ])
    return json.dumps({
        "name": ("%s - %s" % (name, tagline)) if tagline else name,
        "short_name": name[:12],
        "description": "Browse the plot layout, landmarks, and amenities - works offline once saved.",
        "start_url": "./?project=" + pid,
        "scope": "./",
        "display": "standalone",
        "orientation": "landscape",   # the client gates portrait behind a rotate screen (see showRotateHint), so an installed app should just open the right way up
        "background_color": "#0c0d11",
        "theme_color": "#0c0d11",
        "icons": icons,
    }).encode("utf-8")

def _static_icon_bytes(size, maskable):
    name = "icon-512-maskable.png" if maskable else ("icon-192.png" if size == 192 else "icon-512.png")
    try:
        with open(os.path.join(ROOT, "icons", name), "rb") as fh:
            return fh.read()
    except Exception:
        return None

def pwa_icon_bytes(pid, brand, variant):
    """Square PNG icon built from the project's own logo (letterboxed — home-screen icons must be
    square and at least 192px, and an admin's logo is neither reliably), cached next to the
    project as a dot-file; the bundled B91 icon when there's no logo or no Pillow. None if even
    that is missing."""
    size = 192 if variant == "192" else 512
    maskable = variant == "512m"
    logo_rel = ((brand.get("logo") or {}) or {}).get("file") or ""
    project_dir = os.path.join(PROJECTS_DIR, pid)
    src = os.path.join(project_dir, os.path.basename(logo_rel)) if logo_rel else ""
    if src and os.path.isfile(src) and _pillow_ok():
        out = os.path.join(project_dir, ".pwa-icon-%s.png" % variant)
        try:
            if not os.path.isfile(out) or os.path.getmtime(out) < os.path.getmtime(src):
                _build_icon(src, out, size, maskable)
            with open(out, "rb") as fh:
                return fh.read()
        except Exception:
            pass
    return _static_icon_bytes(size, maskable)

def _pillow_ok():
    """Pillow is an OPTIONAL extra here — this server is otherwise stdlib-only by design.
    Without it, per-project home-screen icons just fall back to the bundled B91 ones."""
    try:
        from PIL import Image  # noqa: F401
        return True
    except Exception:
        return False

def _build_icon(src, out, size, maskable):
    """Letterbox the admin's logo onto a square canvas of `size`. Home-screen icons must be
    square and >=192px or the browser won't consider the site installable, and a logo is
    rarely either. `maskable` leaves a safety margin because the OS crops that variant to
    its own shape (circle/squircle), which would otherwise clip the artwork."""
    from PIL import Image
    im = Image.open(src).convert("RGBA")
    inner = int(size * (0.72 if maskable else 0.88))    # padding: more for maskable, since the OS crops it
    im.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (12, 13, 17, 255))   # matches the app's --bg so it reads as one tile
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    canvas.convert("RGB").save(out, "PNG")

def read_alignment(project_dir):
    """Best-effort parse of a project's alignment.json — {} if missing/invalid, never
    raises. Shared by the export-bundle-check flagging scan and the bundle's image embed."""
    p = os.path.join(project_dir, "alignment.json")
    if not os.path.isfile(p):
        return {}
    try:
        with open(p, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}

def read_amenities(project_dir):
    """Best-effort parse of a project's amenities.json — {} if missing/invalid, never raises."""
    p = os.path.join(project_dir, "amenities.json")
    if not os.path.isfile(p):
        return {}
    try:
        with open(p, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}

def find_ffmpeg():
    """Locate portable ffmpeg in ./tools or system PATH."""
    local_bin = os.path.join(ROOT, "tools", "ffmpeg.exe")
    if os.path.isfile(local_bin):
        return local_bin
    import shutil
    return shutil.which("ffmpeg")

def optimize_video_file(path):
    """Transcodes an uploaded video file to web-optimized 1080p H.264 + faststart."""
    ffmpeg_bin = find_ffmpeg()
    if not ffmpeg_bin:
        sys.stderr.write("[ffmpeg] ffmpeg binary not found, skipping optimization\n")
        return None
    import subprocess
    ext = os.path.splitext(path)[1].lower()
    is_video = ext in [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]
    if not is_video:
        return None

    tmp_out = path + ".opt.mp4"
    if os.path.exists(tmp_out):
        try: os.remove(tmp_out)
        except Exception: pass

    cmd = [
        ffmpeg_bin, "-y", "-i", path,
        "-c:v", "libx264", "-crf", "26", "-preset", "faster",
        "-pix_fmt", "yuv420p",
        "-vf", "scale='min(1920,iw)':-2",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        tmp_out
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode == 0 and os.path.isfile(tmp_out) and os.path.getsize(tmp_out) > 0:
            orig_size = os.path.getsize(path)
            new_size = os.path.getsize(tmp_out)
            os.replace(tmp_out, path)
            pct = round((1 - (new_size / orig_size)) * 100, 1) if orig_size > 0 else 0
            sys.stderr.write(f"[ffmpeg] Optimized {os.path.basename(path)}: {orig_size} -> {new_size} bytes ({pct}% reduction)\n")
            return {
                "compressed": True,
                "orig_bytes": orig_size,
                "new_bytes": new_size,
                "savings_pct": pct
            }
        else:
            sys.stderr.write(f"[ffmpeg error] {proc.stderr.decode('utf-8', errors='replace')[-300:]}\n")
    except Exception as e:
        sys.stderr.write(f"[ffmpeg exception] {e}\n")
    finally:
        if os.path.exists(tmp_out):
            try: os.remove(tmp_out)
            except Exception: pass
    return None

def optimize_image_file(path):
    """
    Downscales images exceeding 1920px width/height and optimizes them for web.
    Preserves transparency for RGBA PNGs (logos), optimizes photo/render PNGs.
    EXEMPTS: 360 panorama images, plot layouts, and site plans so visual map fidelity is untouched.
    """
    ext = os.path.splitext(path)[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp", ".bmp"]:
        return None

    # Never compress background panoramas, plot layouts, or site plans
    fname = os.path.basename(path).lower()
    skip_keywords = ["pano", "panorama", "connectivity", "equirectangular", "360", "ground", "layout", "plot", "siteplan", "masterplan"]
    if any(k in fname for k in skip_keywords):
        sys.stderr.write(f"[PIL] Skipping pano/layout image: {os.path.basename(path)}\n")
        return None

    # Check if this image is configured as panoImage or groundImage in alignment.json
    project_dir = os.path.dirname(path)
    align_file = os.path.join(project_dir, "alignment.json")
    if os.path.isfile(align_file):
        try:
            with open(align_file, "r", encoding="utf-8") as af:
                align_data = json.load(af)
                pano_ref = (align_data.get("panoImage") or {}).get("file", "")
                ground_ref = (align_data.get("groundImage") or {}).get("file", "")
                base_name = os.path.basename(path)
                if base_name in pano_ref or base_name in ground_ref:
                    sys.stderr.write(f"[PIL] Skipping alignment pano/ground image: {base_name}\n")
                    return None
        except Exception:
            pass

    try:
        from PIL import Image
    except ImportError:
        return None

    try:
        orig_size = os.path.getsize(path)
        if orig_size < 250 * 1024:
            return None  # already under 250KB, no optimization needed

        with Image.open(path) as im:
            orig_w, orig_h = im.size

            # Never compress a 2:1 aspect ratio equirectangular 360 panorama
            ratio = orig_w / max(1, orig_h)
            if 1.95 <= ratio <= 2.05:
                sys.stderr.write(f"[PIL] Skipping 360 equirectangular panorama ({orig_w}x{orig_h}): {os.path.basename(path)}\n")
                return None

            if orig_w <= 1920 and orig_h <= 1920 and orig_size < 1.5 * 1024 * 1024:
                return None  # already optimal dimensions and reasonable size

            # Resample down to max 1920px while preserving aspect ratio
            im.thumbnail((1920, 1920), Image.LANCZOS)

            tmp_out = path + ".opt.img"
            if os.path.exists(tmp_out):
                try: os.remove(tmp_out)
                except Exception: pass

            if ext == ".png":
                # Check for actual alpha channel
                has_alpha = False
                if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
                    try:
                        alpha = im.convert("RGBA").split()[-1]
                        if alpha.getextrema()[0] < 255:
                            has_alpha = True
                    except Exception:
                        has_alpha = True

                if has_alpha:
                    im.save(tmp_out, "PNG", optimize=True)
                else:
                    # Photo or 3D render without alpha - save as high-quality web JPEG
                    rgb = im.convert("RGB")
                    rgb.save(tmp_out, "JPEG", quality=85, optimize=True)
            elif ext in [".jpg", ".jpeg"]:
                im.convert("RGB").save(tmp_out, "JPEG", quality=85, optimize=True)
            elif ext == ".webp":
                im.save(tmp_out, "WEBP", quality=85)
            else:
                im.save(tmp_out, optimize=True)

            if os.path.isfile(tmp_out) and os.path.getsize(tmp_out) > 0:
                new_size = os.path.getsize(tmp_out)
                if new_size < orig_size:
                    os.replace(tmp_out, path)
                    pct = round((1 - (new_size / orig_size)) * 100, 1)
                    sys.stderr.write(f"[PIL] Optimized {os.path.basename(path)}: {orig_size} -> {new_size} bytes ({pct}% reduction)\n")
                    return {
                        "compressed": True,
                        "orig_bytes": orig_size,
                        "new_bytes": new_size,
                        "savings_pct": pct
                    }
                else:
                    if os.path.exists(tmp_out):
                        os.remove(tmp_out)
    except Exception as e:
        sys.stderr.write(f"[PIL exception] {e}\n")
        if os.path.exists(path + ".opt.img"):
            try: os.remove(path + ".opt.img")
            except Exception: pass
    return None

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = self.path.split("?", 1)[0]
        if route == "/api/projects":
            projects = []
            if os.path.isdir(PROJECTS_DIR):
                for name in sorted(os.listdir(PROJECTS_DIR)):
                    if name.startswith("."):
                        continue                    # skip .trash and other hidden dirs
                    d = os.path.join(PROJECTS_DIR, name)
                    # A project is a plot map OR a virtual tour (or both). Requiring
                    # plots.svg used to hide tour-only projects from the switcher entirely.
                    if os.path.isdir(d) and (os.path.isfile(os.path.join(d, "plots.svg"))
                                             or os.path.isfile(os.path.join(d, "tour.json"))):
                        projects.append(name)
            # Projects kept in S3 (assets_s3.py) that this machine has never opened — the admin
            # switcher lists them too; opening one downloads its files first.
            cloud = []
            try:
                import assets_s3
                cloud = sorted(p for p in assets_s3.cloud_projects() if p not in projects)
            except Exception:
                pass
            return self._send_json(200, {"projects": projects, "cloud": cloud})
        if route == "/manifest.webmanifest":
            return self.do_manifest()
        if route.startswith("/api/pwa-icon-"):
            return self.do_pwa_icon(route)
        if route == "/api/offline-files":
            return self.do_offline_files()
        if route == "/api/export-bundle":
            return self.do_bundle()
        if route == "/api/export-bundle-check":
            return self.do_bundle_check()
        if route.startswith("/api/assets/"):
            return self.do_assets_get(route)
        if route == "/api/publish/status":
            return self.do_publish_status()
        if route == "/api/publish/progress":
            return self.do_publish_progress()
        return self._serve_static()

    def _serve_static(self):
        """Serve any static file with HTTP Range support — needed so a browser's
        <video> element can stream uploaded videos instead of timing out waiting
        for the whole file. Python's SimpleHTTPRequestHandler doesn't handle
        Range headers at all: it always returns 200 + the full body, which causes
        most browsers to refuse playback (they send "Range: bytes=0-" on the very
        first GET and expect 206, not 200). This replaces the super().do_GET()
        fall-through so every static-file response also advertises
        Accept-Ranges: bytes."""
        import email.utils
        path = self.translate_path(self.path)

        # publish.config.json sits in the served folder but holds the publish password — never
        # serve it. Compared as the resolved file AND by name, since Windows also opens it
        # under spellings like "publish.config.json." or a different letter case.
        if (os.path.basename(path).rstrip(". ").lower() == os.path.basename(publish_s3.CONFIG_PATH)
                or os.path.normcase(os.path.realpath(path)) == os.path.normcase(os.path.realpath(publish_s3.CONFIG_PATH))):
            self.send_error(404, "File not found")
            return

        # A directory URL ending in "/" (the app's own entry point, "/?project=...") is served
        # as its index.html through THIS path, so it gets the same Cache-Control: no-cache as
        # /index.html. Handing it to the base class sent no Cache-Control at all, so browsers
        # heuristically cached the page: a fresh app.js (always ?v=-busted) then ran against a
        # stale index.html missing newly added elements — a button with nothing to act on.
        # Anything else about directories (the /dir -> /dir/ redirect, listings) still goes to
        # the base class.
        if os.path.isdir(path):
            idx = os.path.join(path, "index.html")
            if self.path.split("?", 1)[0].endswith("/") and os.path.isfile(idx):
                path = idx
            else:
                return super().do_GET()

        # A missing file is a plain 404, at once. Project files come down from S3 only through the
        # admin's download step (assets_s3 plan/pull, 2026-09-26); asking S3 on every miss cost
        # 0.5–1.6 s per optional file the app probes for (loading image, logo, audio).
        if not os.path.isfile(path):
            self.send_error(404, "File not found")
            return

        mime     = mimetypes.guess_type(path)[0] or "application/octet-stream"
        if path.lower().endswith(".png"):
            try:
                with open(path, "rb") as fh:
                    if fh.read(3) == b"\xff\xd8\xff":
                        mime = "image/jpeg"
            except Exception:
                pass
        size     = os.path.getsize(path)
        last_mod = email.utils.formatdate(os.path.getmtime(path), usegmt=True)
        # Conditional GET (2026-09-22): a browser re-checking a file it already holds gets a 304
        # with no body instead of the whole file again. Every static file here is sent no-cache, so
        # each reuse IS a re-check — without this, a revisit re-downloaded the pano, the site plan
        # and every tour room in full. Whole-second granularity, as HTTP dates are.
        ims = self.headers.get("If-Modified-Since")
        if ims and not self.headers.get("Range"):
            try:
                since = email.utils.parsedate_to_datetime(ims).timestamp()
                if int(os.path.getmtime(path)) <= int(since):
                    self.send_response(304)
                    self.send_header("Last-Modified", last_mod)
                    self.send_header("Cache-Control", "public, max-age=31536000, immutable" if "/vendor/" in path.replace("\\", "/") else "no-cache")
                    self.end_headers()
                    return
            except Exception:
                pass
        # Only /vendor/* (third-party libraries this project never edits in place — a
        # version bump means a new filename, not a content change) gets long-lived
        # caching. Everything else — app.js/styles.css/index.html (already cache-busted
        # per-request via their own `?v=` query string, so a Cache-Control header here
        # wouldn't matter either way), project content under projects/, admin-editable
        # data — stays uncached, since those genuinely DO change and a stale cached copy
        # would show the admin's edits inconsistently.
        cache_control = "public, max-age=31536000, immutable" if "/vendor/" in path.replace("\\", "/") else "no-cache"

        range_hdr = self.headers.get("Range", "")
        if range_hdr:
            m = re.match(r"bytes=(\d*)-(\d*)", range_hdr)
            if m:
                start_s, end_s = m.group(1), m.group(2)
                start = int(start_s) if start_s else 0
                end   = int(end_s)   if end_s   else size - 1
                end   = min(end, size - 1)
                if start > end or start >= size:
                    self.send_response(416)   # Range Not Satisfiable
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.end_headers()
                    return
                length = end - start + 1
                self.send_response(206)
                self.send_header("Content-Type",   mime)
                self.send_header("Content-Range",  f"bytes {start}-{end}/{size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges",  "bytes")
                self.send_header("Last-Modified",  last_mod)
                self.send_header("Cache-Control",  cache_control)
                self.end_headers()
                try:
                    with open(path, "rb") as fh:
                        fh.seek(start)
                        remaining = length
                        while remaining > 0:
                            chunk = fh.read(min(65536, remaining))
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            remaining -= len(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass
                return

        # Full-file response (no Range header, or unrecognised Range syntax). gzip
        # text-ish assets when the client advertises support — everything else
        # (images/video/audio, or a client that can't decompress) falls through to the
        # original streamed-from-disk path unchanged.
        accepts_gzip = "gzip" in self.headers.get("Accept-Encoding", "")
        compressible = mime.startswith(GZIP_MIME_PREFIXES)
        if accepts_gzip and compressible and size >= GZIP_MIN_BYTES:
            with open(path, "rb") as fh:
                raw = fh.read()
            body = gzip.compress(raw, compresslevel=6)
            self.send_response(200)
            self.send_header("Content-Type",     mime)
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length",   str(len(body)))
            self.send_header("Vary",             "Accept-Encoding")
            self.send_header("Accept-Ranges",    "bytes")
            self.send_header("Last-Modified",    last_mod)
            self.send_header("Cache-Control",    cache_control)
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return

        self.send_response(200)
        self.send_header("Content-Type",   mime)
        self.send_header("Content-Length", str(size))
        self.send_header("Accept-Ranges",  "bytes")
        self.send_header("Last-Modified",  last_mod)
        self.send_header("Cache-Control",  cache_control)
        self.end_headers()
        try:
            with open(path, "rb") as fh:
                while True:
                    chunk = fh.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass


    def _project_brand(self):
        """(project_id, brand dict) for the ?project= on this request. Brand may be {}."""
        from urllib.parse import urlparse, parse_qs
        pid = safe_project((parse_qs(urlparse(self.path).query).get("project") or [""])[0]) or "sample"
        brand = (read_alignment(os.path.join(PROJECTS_DIR, pid)) or {}).get("brand") or {}
        return pid, brand

    def do_manifest(self):
        """The web app manifest, generated per project so the installed home-screen icon and
        name are the ADMIN'S branding rather than a generic Build91 one. It has to be
        server-generated: a manifest is a static JSON file, so there's no other way for it
        to reflect whichever project the visitor is actually viewing. index.html's
        <link rel="manifest"> gets the ?project= appended in app.js (setupPwaIdentity) so
        this sees the same project the page is showing."""
        pid, brand = self._project_brand()
        body = manifest_body(pid, brand)
        self.send_response(200)
        self.send_header("Content-Type", "application/manifest+json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_pwa_icon(self, route):
        """Square PNG icon built from the project's own logo, at the size the manifest asks
        for. Home-screen icons must be square and at least 192px or the browser won't treat
        the site as installable, and an admin's logo is neither reliably — so it's letterboxed
        onto a square canvas here. Result is cached next to the project as a dot-file."""
        m = re.match(r"^/api/pwa-icon-(192|512|512m)\.png$", route)
        if not m:
            return self._send_json(404, {"ok": False, "error": "unknown icon"})
        pid, brand = self._project_brand()
        data = pwa_icon_bytes(pid, brand, m.group(1))
        if not data:
            return self._send_json(404, {"ok": False, "error": "icon missing"})
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_offline_files(self):
        """GET /api/offline-files?project=<id> → the offline file list (see offline_files)."""
        from urllib.parse import urlparse, parse_qs
        pid = safe_project((parse_qs(urlparse(self.path).query).get("project") or [""])[0])
        if not pid:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        if not os.path.isdir(os.path.join(PROJECTS_DIR, pid)):
            return self._send_json(404, {"ok": False, "error": "no such project"})
        try:
            body = offline_files(pid)
        except Exception as e:  # noqa: BLE001 — a phone asking must never take the server down
            return self._send_json(500, {"ok": False, "error": str(e)})
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_bundle_check(self):
        """Pre-flight for the standalone export: report which menu items and amenities (if
        any) need a live internet connection even inside the offline bundle, so the admin
        UI can warn before downloading — see scan_menu_for_online_content and
        scan_amenities_for_online_content (deliberately NOT plots — see that docstring)."""
        from urllib.parse import urlparse, parse_qs
        pid = safe_project((parse_qs(urlparse(self.path).query).get("project") or [""])[0])
        if not pid:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        project_dir = os.path.join(PROJECTS_DIR, pid)
        flagged = (scan_menu_for_online_content(read_alignment(project_dir))
                   + scan_amenities_for_online_content(read_amenities(project_dir)))
        if publish_s3.uses_google_background(project_dir):
            # A bundle can't show Google's live view — its aerial view shows the site plan instead.
            flagged.insert(0, {"id": "google", "title": "Aerial view — Google Earth background",
                               "contentType": "shows the site plan instead in a saved copy", "url": "", "source": "background"})
        return self._send_json(200, {"ok": True, "flagged": flagged})

    def do_bundle(self):
        """Zip a self-contained, view-only copy of one project (app shell + data/) →
        download. The shell is adapted so the bundle also runs via plain file:// with no
        server at all: the vendored Three.js module build is rewritten into a classic
        window.THREE global (module_to_global), app.js loses its one `import` line to
        match (strip_named_import), and the project's core data files are embedded inline
        into index.html (build_embedded_files_json) so nothing needs fetch() either —
        module/fetch loads are both blocked under file://, verified directly; classic
        <script src> and <img src> are not. Logos/landmark/amenity/contact renders need no
        such treatment — they're plain <img> elements, which load fine under file://. The
        pano and site-plan images are the one exception: they're uploaded to a WebGL
        texture, and a texture sourced from a file:// path is rejected as tainted even from
        the same folder (verified directly) — so those two get base64-embedded too, same
        idea as the JSON/SVG data, via build_embedded_images_json."""
        import io
        import zipfile
        from urllib.parse import urlparse, parse_qs
        pid = safe_project((parse_qs(urlparse(self.path).query).get("project") or [""])[0])
        if not pid:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        src = os.path.join(PROJECTS_DIR, pid)
        # A project is a plot map OR a virtual tour (or both) — same rule as /api/projects.
        if not os.path.isdir(src) or not (os.path.isfile(os.path.join(src, "plots.svg"))
                                          or os.path.isfile(os.path.join(src, "tour.json"))):
            return self._send_json(404, {"ok": False, "error": f"'{pid}' not found"})
        buf = io.BytesIO()
        try:
            embedded_files_json = build_embedded_files_json(src)
            embedded_images_json = build_embedded_images_json(src, read_alignment(src))
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                for rel in BUNDLE_SHELL:                       # the app itself, at the bundle root
                    p = os.path.join(ROOT, rel)
                    if not os.path.isfile(p):
                        continue
                    with open(p, "rb") as fh:
                        data = fh.read()
                    arcname = rel
                    if rel == "index.html":
                        data = bake_bundle_html(data.decode("utf-8"), pid, embedded_files_json, embedded_images_json).encode("utf-8")
                    elif rel == "app.js":
                        data = strip_named_import(data.decode("utf-8"), "./vendor/three.module.min.js").encode("utf-8")
                    elif rel == os.path.join("vendor", "three.module.min.js"):
                        data = module_to_global(data.decode("utf-8"), "THREE").encode("utf-8")
                        arcname = os.path.join("vendor", "three.global.js")
                    z.writestr(f"{pid}/" + arcname.replace(os.sep, "/"), data)
                for name in sorted(os.listdir(src)):           # the project's files under data/
                    if name.startswith("."):
                        continue
                    fp = os.path.join(src, name)
                    if name == "alignment.json" and os.path.isfile(fp):
                        with open(fp, "r", encoding="utf-8") as fh:
                            z.writestr(f"{pid}/data/{name}", without_google_key(fh.read()))
                    elif os.path.isfile(fp):
                        z.write(fp, f"{pid}/data/{name}")
        except Exception as e:
            return self._send_json(500, {"ok": False, "error": str(e)})
        body = buf.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", f'attachment; filename="{pid}-plotmap.zip"')
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_POST(self):
        route = self.path.split("?", 1)[0]
        if route == "/api/rename":
            return self.do_rename()
        if route == "/api/delete":
            return self.do_delete()
        if route == "/api/upload":
            return self.do_upload()
        if route == "/api/publish":
            return self.do_publish()
        if route == "/api/unpublish":
            return self.do_unpublish()
        if route.startswith("/api/assets/"):
            return self.do_assets_post(route)
        if route != "/api/save":
            return self._send_json(404, {"ok": False, "error": "not found"})
        try:
            payload = self._read_json()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"bad request: {e}"})

        project = safe_project(payload.get("project"))
        if not project:
            return self._send_json(400, {"ok": False, "error": "invalid project id (use a-z 0-9 - _)"})
        files = payload.get("files")
        if not isinstance(files, list) or not files:
            return self._send_json(400, {"ok": False, "error": "no files"})

        dest = os.path.join(PROJECTS_DIR, project)
        os.makedirs(dest, exist_ok=True)
        real_root = os.path.realpath(PROJECTS_DIR)
        written, skipped = [], []
        import base64
        # alignment.json LAST: prefer_webp_ground_image compares the site-plan PNG on disk, so any PNG
        # arriving in this same save must already be written — otherwise a genuinely new plan would be
        # judged against the old file.
        files = sorted(files, key=lambda x: safe_filename(x.get("name")) == "alignment.json")
        for f in files:
            name = safe_filename(f.get("name"))
            if not name:
                skipped.append(f.get("name"))
                continue
            path = os.path.join(dest, name)
            if not os.path.realpath(path).startswith(real_root + os.sep):
                skipped.append(name)
                continue
            data = f.get("data", "")
            try:
                raw = base64.b64decode(data) if f.get("encoding") == "base64" else str(data).encode("utf-8")
                if name == "alignment.json":
                    raw = prefer_webp_ground_image(raw, dest)
                with open(path, "wb") as out:
                    out.write(raw)
                try:
                    optimize_image_file(path)
                except Exception:
                    pass
                written.append(name)
            except Exception:
                skipped.append(name)

        # No upload from here: a Save sends its big files to /api/upload AFTER this request, so an
        # upload started now would miss them. The admin page queues the upload itself once the
        # whole save has landed (POST /api/assets/push).
        return self._send_json(200, {
            "ok": True, "project": project,
            "dir": os.path.relpath(dest, ROOT).replace(os.sep, "/"),
            "written": written, "skipped": skipped,
        })

    def do_rename(self):
        try:
            p = self._read_json()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"bad request: {e}"})
        src_id, dst_id = safe_project(p.get("from")), safe_project(p.get("to"))
        if not src_id or not dst_id:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        src, dst = os.path.join(PROJECTS_DIR, src_id), os.path.join(PROJECTS_DIR, dst_id)
        if not os.path.isdir(src):
            return self._send_json(404, {"ok": False, "error": f"'{src_id}' not found"})
        if os.path.exists(dst):
            return self._send_json(409, {"ok": False, "error": f"'{dst_id}' already exists"})
        try:
            os.rename(src, dst)
        except Exception as e:
            return self._send_json(500, {"ok": False, "error": str(e)})
        return self._send_json(200, {"ok": True, "from": src_id, "to": dst_id})

    def do_delete(self):
        import shutil, time
        try:
            p = self._read_json()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"bad request: {e}"})
        pid = safe_project(p.get("project"))
        if not pid:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        src = os.path.join(PROJECTS_DIR, pid)
        if not os.path.isdir(src):
            return self._send_json(404, {"ok": False, "error": f"'{pid}' not found"})
        # not a hard delete: move to projects/.trash/<id>-<epoch> so it's recoverable
        trash = os.path.join(PROJECTS_DIR, ".trash")
        os.makedirs(trash, exist_ok=True)
        dest = os.path.join(trash, f"{pid}-{int(time.time())}")
        try:
            shutil.move(src, dest)
        except Exception as e:
            return self._send_json(500, {"ok": False, "error": str(e)})
        return self._send_json(200, {"ok": True, "project": pid, "trash": os.path.relpath(dest, ROOT).replace(os.sep, "/")})

    # ── Working files in S3 (assets_s3.py): the admin's download step and upload queue ───────
    # Design and rules: ADMIN-DATA-SYNC.md (keep its API table, section 9, in step with these).
    #   GET  /api/assets/plan?project=         what opening the project needs (download/conflicts)
    #   POST /api/assets/pull?project=&use=    start that download; use = s3 | local (conflicts)
    #   GET  /api/assets/pull-status?project=  its progress
    #   POST /api/assets/push?project=         queue an upload (the admin's Save calls this)
    #   GET  /api/assets/jobs                  every recent upload, for the upload widget
    #   POST /api/assets/retry?id=             queue a failed upload again
    # "Not configured" (no publish.config.json) is a normal answer, {ok:false, configured:false}:
    # the admin then simply works on this machine's files.
    def _query(self, key):
        from urllib.parse import urlparse, parse_qs
        return (parse_qs(urlparse(self.path).query).get(key) or [""])[0]

    def _assets_call(self, fn):
        try:
            import assets_s3
            return self._send_json(200, fn(assets_s3))
        except publish_s3.PublishError as e:
            configured = os.path.isfile(publish_s3.CONFIG_PATH)
            return self._send_json(200, {"ok": False, "configured": configured, "error": str(e)})
        except Exception as e:
            return self._send_json(200, {"ok": False, "configured": True, "error": publish_s3.aws_message(e)})

    def do_assets_get(self, route):
        if route == "/api/assets/jobs":
            return self._assets_call(lambda a: {"ok": True, "jobs": a.jobs()})
        pid = self._query_project()
        if not pid:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        if route == "/api/assets/plan":
            return self._assets_call(lambda a: a.plan(pid))
        if route == "/api/assets/pull-status":
            return self._assets_call(lambda a: {"ok": True, "job": a.pull_status(pid)})
        return self._send_json(404, {"ok": False, "error": "not found"})

    def do_assets_post(self, route):
        if route == "/api/assets/retry":
            try:
                job_id = int(self._query("id"))
            except ValueError:
                return self._send_json(400, {"ok": False, "error": "invalid job id"})
            return self._assets_call(lambda a: {"ok": True, "job": a.retry(job_id)})
        pid = self._query_project()
        if not pid:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        if route == "/api/assets/pull":
            use = self._query("use")
            return self._assets_call(lambda a: a.start_pull(pid, use))
        if route == "/api/assets/push":
            label = self._query("label")[:80]
            return self._assets_call(lambda a: {"ok": True, "job": a.enqueue_push(pid, label)})
        return self._send_json(404, {"ok": False, "error": "not found"})

    # ── ☁ Publish to web (publish_s3.py does the AWS work) ─────────────────────────
    def _query_project(self):
        from urllib.parse import urlparse, parse_qs
        return safe_project((parse_qs(urlparse(self.path).query).get("project") or [""])[0])

    def _publish_request(self):
        """Shared gate for publish/unpublish → (pid, body) or (None, response-already-sent).
        A wrong password costs a second, so the password can't be guessed at LAN speed."""
        import time
        try:
            p = self._read_json()
        except Exception as e:
            return None, self._send_json(400, {"ok": False, "error": f"bad request: {e}"})
        pid = safe_project(p.get("project"))
        if not pid:
            return None, self._send_json(400, {"ok": False, "error": "invalid project id"})
        try:
            cfg = publish_s3.load_config()
        except publish_s3.PublishError as e:
            return None, self._send_json(503, {"ok": False, "error": str(e)})
        if not publish_s3.check_password(cfg, p.get("password")):
            time.sleep(1)
            return None, self._send_json(401, {"ok": False, "error": "Wrong publish password."})
        return pid, p

    def do_publish_status(self):
        pid = self._query_project()
        if not pid:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        return self._send_json(200, {"ok": True, **publish_s3.status(pid)})

    def do_publish_progress(self):
        pid = self._query_project()
        if not pid:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        return self._send_json(200, {"ok": True, "job": publish_s3.job_state(pid)})

    def do_publish(self):
        pid, body = self._publish_request()
        if not pid:
            return body
        # {check:true} only verifies the password: the admin page saves the project between
        # this and the real publish, and shouldn't save at all for a mistyped password.
        if body.get("check"):
            return self._send_json(200, {"ok": True})
        project_dir = os.path.join(PROJECTS_DIR, pid)
        if not (os.path.isfile(os.path.join(project_dir, "plots.svg"))
                or os.path.isfile(os.path.join(project_dir, "tour.json"))):
            return self._send_json(404, {"ok": False, "error": "This project has nothing to publish yet - save it first."})
        # The project's logo becomes the installed demo's home-screen icon, built by the same
        # letterboxing as the live /api/pwa-icon-* (only when Pillow is available).
        if not publish_s3.start_publish(pid, _build_icon if _pillow_ok() else None):
            return self._send_json(409, {"ok": False, "error": "This project is already being published."})
        return self._send_json(202, {"ok": True, "job": publish_s3.job_state(pid)})

    def do_unpublish(self):
        pid, body = self._publish_request()
        if not pid:
            return body
        try:
            result = publish_s3.run_unpublish(pid)
        except Exception as e:
            return self._send_json(502, {"ok": False, "error": publish_s3.aws_message(e)})
        return self._send_json(200, {"ok": True, **result})


    def do_upload(self):
        """Raw-binary file upload — POST /api/upload?project=<id>&name=<filename>.

        The client sends the file body as plain application/octet-stream (or its
        real MIME type) with no base64 encoding and no JSON wrapper.  This avoids
        the ~500 MB btoa() cap that kills large video uploads in app.js, and means
        the server never holds the whole file in memory — it streams the body in
        64 KB chunks straight to disk. If a video is uploaded, it automatically
        compresses it via portable ffmpeg for optimal mobile streaming."""
        from urllib.parse import urlparse, parse_qs
        qs   = parse_qs(urlparse(self.path).query)
        pid  = safe_project((qs.get("project") or [""])[0])
        name = safe_filename((qs.get("name")    or [""])[0])
        if not pid or not name:
            return self._send_json(400, {"ok": False, "error": "invalid project id or filename"})
        dest = os.path.join(PROJECTS_DIR, pid)
        os.makedirs(dest, exist_ok=True)
        real_root = os.path.realpath(PROJECTS_DIR)
        path = os.path.join(dest, name)
        if not os.path.realpath(path).startswith(real_root + os.sep):
            return self._send_json(403, {"ok": False, "error": "path traversal not allowed"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            with open(path, "wb") as out:
                remaining = length
                while remaining > 0:
                    chunk = self.rfile.read(min(65536, remaining))
                    if not chunk:
                        break
                    out.write(chunk)
                    remaining -= len(chunk)
        except Exception as e:
            return self._send_json(500, {"ok": False, "error": str(e)})

        # Automatic media optimization via ffmpeg / PIL
        opt_info = None
        ext = os.path.splitext(name)[1].lower()
        if ext in [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]:
            try:
                opt_info = optimize_video_file(path)
            except Exception as e:
                sys.stderr.write(f"[upload optimize video error] {e}\n")
        elif ext in [".png", ".jpg", ".jpeg", ".webp", ".bmp"]:
            try:
                opt_info = optimize_image_file(path)
            except Exception as e:
                sys.stderr.write(f"[upload optimize image error] {e}\n")

        resp = {
            "ok": True, "project": pid,
            "dir": os.path.relpath(dest, ROOT).replace(os.sep, "/"),
            "name": name, "written": [name], "skipped": [],
        }
        if opt_info:
            resp["optimization"] = opt_info

        return self._send_json(200, resp)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

def lan_ip():
    """Best-effort LAN address to print (no packets actually sent)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80)); ip = s.getsockname()[0]; s.close()
        return ip
    except Exception:
        return "your-lan-ip"

class DualStackServer(ThreadingHTTPServer):
    """ThreadingHTTPServer configured for IPv4/IPv6 compatibility."""
    def __init__(self, server_address, RequestHandlerClass, bind_and_activate=True):
        host, port = server_address
        if ":" in host or not host:
            self.address_family = socket.AF_INET6
        else:
            self.address_family = socket.AF_INET
        super().__init__(server_address, RequestHandlerClass, bind_and_activate)


    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            try:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except (AttributeError, OSError):
                pass
        super().server_bind()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    # "" or 0.0.0.0 = all interfaces so LAN devices & IPv4/IPv6 localhost can reach it.
    host = os.environ.get("HOST", "")
    os.makedirs(PROJECTS_DIR, exist_ok=True)
    httpd = DualStackServer((host, port), Handler)
    print(f"Build91 plot-map server listening on {host or 'all interfaces'}:{port}  (projects dir: {PROJECTS_DIR})")
    print(f"  local:  http://localhost:{port}/  or  http://127.0.0.1:{port}/")
    print(f"  LAN:    http://{lan_ip()}:{port}/   (admin: add ?admin=1&project=<id>)")
    print("  WARNING: the save/rename/delete API is open to your LAN with no auth. Use only on a trusted network.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()

if __name__ == "__main__":
    main()
