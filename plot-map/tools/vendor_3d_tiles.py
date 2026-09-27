"""Vendor the third-party code the Google Earth background needs (GoogleEarthView.md §9).

Run from plot-map/:  python tools/vendor_3d_tiles.py

What it writes (all under vendor/, served with the year-long immutable cache — so every folder
name carries its version, and a version bump is a NEW folder, never an edit in place):
  vendor/3d-tiles-renderer-0.3.46/   NASA-AMMOS 3DTilesRendererJS — only the modules the Google
                                     layer imports, plus whatever they import (not the React/r3f
                                     parts, not unused plugins).
  vendor/three-r160-addons/          three.js r160 example modules those need (GLTFLoader and
                                     friends) + the Draco decoder (Google's tiles are Draco-compressed).
  vendor/google-maps-logo/           Google's official Maps logo (attribution rule G2).

Why 0.3.46: it is the last 3d-tiles-renderer release that supports three.js r160 (0.4.0+ needs
r166+), and this app vendors r160. Upgrading means upgrading three.js for the whole app first.

Every bare `three` / `three/examples/jsm/...` import is rewritten to a relative path, so the
library shares the app's own `vendor/three.module.min.js` — ONE three.js instance (two copies
would break instanceof checks and double the download). No import map, no bundler: the app
stays zero-build. The npm tarballs are checked against the registry's sha512 before use.
"""
import base64
import hashlib
import io
import json
import os
import re
import shutil
import sys
import tarfile
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
VENDOR = os.path.join(APP, "vendor")
THREE_MIN = os.path.join(VENDOR, "three.module.min.js")

TILES_PKG, TILES_VER = "3d-tiles-renderer", "0.3.46"
THREE_PKG, THREE_VER = "three", "0.160.0"
TILES_DIR = os.path.join(VENDOR, f"3d-tiles-renderer-{TILES_VER}")
ADDONS_DIR = os.path.join(VENDOR, "three-r160-addons")
LOGO_DIR = os.path.join(VENDOR, "google-maps-logo")
LOGO_ZIP = "https://developers.google.com/static/maps/documentation/images/Google_Maps_Attribution_Assets.zip"

# What app.js imports from the library (the rest is pulled in by following imports).
TILES_ENTRIES = [
    "src/three/TilesRenderer.js",
    "src/plugins/three/GoogleCloudAuthPlugin.js",
    "src/plugins/three/ReorientationPlugin.js",
    "src/plugins/three/GLTFExtensionsPlugin.js",
    "src/plugins/three/TileCompressionPlugin.js",
]
# three example modules app.js imports itself (the library's own needs are found automatically).
ADDON_ENTRIES = ["loaders/DRACOLoader.js"]
DRACO_FILES = ["libs/draco/gltf/draco_wasm_wrapper.js", "libs/draco/gltf/draco_decoder.wasm"]

IMPORT_RX = re.compile(
    r"""((?:import|export)\s[^'"]*?from\s*|import\(\s*|^\s*import\s*)(['"])([^'"]+)\2""", re.M)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "build91-vendor/1"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def npm_tarball(pkg, ver):
    meta = json.loads(fetch(f"https://registry.npmjs.org/{pkg}/{ver}"))
    data = fetch(meta["dist"]["tarball"])
    algo, want = meta["dist"]["integrity"].split("-", 1)
    got = base64.b64encode(hashlib.new(algo, data).digest()).decode()
    if got != want:
        sys.exit(f"{pkg}@{ver}: integrity mismatch — refusing to vendor it")
    print(f"{pkg}@{ver}: {len(data) // 1024} KB, {algo} verified")
    return tarfile.open(fileobj=io.BytesIO(data), mode="r:gz"), meta["dist"]["integrity"]


def member_text(tar, name):
    f = tar.extractfile("package/" + name)
    return None if f is None else f.read().decode("utf-8")


def closure(tar, entries):
    """Every module reachable from `entries` via relative imports → ({path: source}, bare specifiers)."""
    seen, bare, stack = {}, set(), list(entries)
    while stack:
        path = os.path.normpath(stack.pop()).replace("\\", "/")
        if path in seen:
            continue
        src = member_text(tar, path)
        if src is None:
            sys.exit(f"missing module in package: {path}")
        seen[path] = src
        for m in IMPORT_RX.finditer(src):
            spec = m.group(3)
            if spec.startswith("."):
                stack.append(os.path.join(os.path.dirname(path), spec))
            else:
                bare.add(spec)
    return seen, bare


def rewrite(src, file_abs):
    """Point bare three imports at the vendored copies, relative to this file."""
    here = os.path.dirname(file_abs)

    def rel(target):
        r = os.path.relpath(target, here).replace("\\", "/")
        return r if r.startswith(".") else "./" + r

    def sub(m):
        spec = m.group(3)
        if spec == "three":
            spec = rel(THREE_MIN)
        elif spec.startswith(("three/examples/jsm/", "three/addons/")):
            spec = rel(os.path.join(ADDONS_DIR, spec.split("/", 3)[-1] if spec.startswith("three/examples") else spec.split("/", 2)[-1]))
        elif not spec.startswith("."):
            sys.exit(f"unexpected bare import {spec!r} in {file_abs}")
        return f"{m.group(1)}{m.group(2)}{spec}{m.group(2)}"

    return IMPORT_RX.sub(sub, src)


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data if isinstance(data, bytes) else data.encode("utf-8"))


def main():
    three_tar, three_int = npm_tarball(THREE_PKG, THREE_VER)
    # Line endings folded: a Windows checkout (git autocrlf) turns the file's few LFs into CRLFs.
    lf = lambda b: hashlib.sha256(b.replace(b"\r\n", b"\n")).hexdigest()
    ours = lf(open(THREE_MIN, "rb").read())
    theirs = lf(three_tar.extractfile("package/build/three.module.min.js").read())
    if ours != theirs:
        sys.exit("vendor/three.module.min.js is not three@0.160.0 — the addons would not match it")

    tiles_tar, tiles_int = npm_tarball(TILES_PKG, TILES_VER)
    tiles_src, tiles_bare = closure(tiles_tar, TILES_ENTRIES)

    addon_entries = set(ADDON_ENTRIES)
    for spec in tiles_bare:
        if spec.startswith("three/examples/jsm/"):
            addon_entries.add(spec[len("three/examples/jsm/"):])
    addon_src, addon_bare = closure(three_tar, ["examples/jsm/" + e for e in sorted(addon_entries)])
    for spec in tiles_bare | addon_bare:
        if spec != "three" and not spec.startswith("three/examples/jsm/"):
            sys.exit(f"unexpected dependency: {spec}")

    for d in (TILES_DIR, ADDONS_DIR):
        if os.path.isdir(d):
            shutil.rmtree(d)
    for path, src in tiles_src.items():
        dest = os.path.join(TILES_DIR, path)
        write(dest, rewrite(src, dest))
    write(os.path.join(TILES_DIR, "LICENSE"), member_text(tiles_tar, "LICENSE"))
    for path, src in addon_src.items():
        dest = os.path.join(ADDONS_DIR, path[len("examples/jsm/"):])
        write(dest, rewrite(src, dest))
    for rel in DRACO_FILES:
        write(os.path.join(ADDONS_DIR, rel), three_tar.extractfile("package/examples/jsm/" + rel).read())
    write(os.path.join(ADDONS_DIR, "LICENSE"), member_text(three_tar, "LICENSE"))

    note = (f"{{name}}\nVendored by tools/vendor_3d_tiles.py — do not edit by hand; re-run the script.\n"
            f"Bare `three` imports are rewritten to relative paths so the app's own\n"
            f"vendor/three.module.min.js (three@{THREE_VER}) is the only three.js instance.\n")
    write(os.path.join(TILES_DIR, "VENDOR.txt"),
          note.format(name=f"{TILES_PKG}@{TILES_VER} ({len(tiles_src)} of its modules), npm integrity {tiles_int}"))
    write(os.path.join(ADDONS_DIR, "VENDOR.txt"),
          note.format(name=f"{THREE_PKG}@{THREE_VER} examples/jsm ({len(addon_src)} modules + Draco decoder), npm integrity {three_int}"))

    z = zipfile.ZipFile(io.BytesIO(fetch(LOGO_ZIP)))
    if os.path.isdir(LOGO_DIR):
        shutil.rmtree(LOGO_DIR)
    for name in z.namelist():
        base = os.path.basename(name)
        if base.endswith(".svg") and not name.startswith("__MACOSX") and "Outline" in base:
            write(os.path.join(LOGO_DIR, base), z.read(name))
    write(os.path.join(LOGO_DIR, "VENDOR.txt"),
          f"Google Maps logo, from Google's attribution asset pack:\n{LOGO_ZIP}\n"
          "Required on screen whenever Google's 3D tiles are shown (GoogleEarthView.md §5 G2). Unmodified.\n")

    total = sum(os.path.getsize(os.path.join(r, f)) for d in (TILES_DIR, ADDONS_DIR, LOGO_DIR) for r, _, fs in os.walk(d) for f in fs)
    print(f"wrote {len(tiles_src)} library modules, {len(addon_src)} three addons, Draco decoder, logo — {total // 1024} KB")


if __name__ == "__main__":
    main()
