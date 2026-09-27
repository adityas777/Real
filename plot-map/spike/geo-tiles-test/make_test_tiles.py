"""Test ground for the Google Earth background — no Google key needed (GoogleEarthView.md Phase 1).

Run from plot-map/:  python spike/geo-tiles-test/make_test_tiles.py

Writes a one-tile 3D Tiles set (tileset.json + ground.glb) next to this script: a flat 2 km
square at a real place on Earth, painted with surveyed marks, and a matching local test
project `projects/geo-test/` (created only if missing — never overwritten).

Open  /?admin=1&project=geo-test&gtiles=spike/geo-tiles-test/tileset.json  (localhost only):
the app loads this tileset instead of Google's through exactly the same code path, so the
reorientation, ground measurement, overlay placement and compass can be checked by eye.

What "right" looks like, from the default view:
  - the orange rectangle under plot A01 and the purple one under A02 are exactly covered by
    the plot overlay (the plan is rotated 30° and the drone is 200 m south of the site, so
    both the bearing and the viewpoint offset are exercised);
  - compass N points at the RED edge band, E at green, S at blue, W at yellow;
  - looking straight down shows the magenta square (the ground under the drone).
"""
import json
import math
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))

SITE = (21.2766268, 81.5901104)        # Anandam Eleganza (from a Google Earth link)
GROUND_H = 290.0                       # ellipsoidal height of the test ground, metres
HALF = 1000.0                          # the ground is 2 km × 2 km, centred on SITE
TEX = 2048
VIEW_SOUTH_M, VIEW_HEIGHT_M = 200.0, 150.0
PLAN_PX, MPP, BEARING = 1000, 0.5, 30.0
# Painted plots, ENU metres from SITE: (east0, east1, north0, north1, rgb)
RECTS = {
    "A01": (100, 130, 40, 80, (255, 140, 0)),
    "A02": (-120, -60, -100, -70, (150, 60, 200)),
}
A_WGS, E2 = 6378137.0, 6.69437999014e-3


def ecef(lat, lon, h):
    la, lo = math.radians(lat), math.radians(lon)
    n = A_WGS / math.sqrt(1 - E2 * math.sin(la) ** 2)
    return ((n + h) * math.cos(la) * math.cos(lo), (n + h) * math.cos(la) * math.sin(lo), (n * (1 - E2) + h) * math.sin(la))


def enu_to_ecef(lat, lon, h):          # column-major 4×4, as 3D Tiles wants
    la, lo = math.radians(lat), math.radians(lon)
    e = (-math.sin(lo), math.cos(lo), 0.0)
    n = (-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la))
    u = (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))
    o = ecef(lat, lon, h)
    return [*e, 0, *n, 0, *u, 0, *o, 1]


def metres_per_deg(lat):
    la = math.radians(lat)
    m = A_WGS * (1 - E2) / (1 - E2 * math.sin(la) ** 2) ** 1.5
    n = A_WGS / math.sqrt(1 - E2 * math.sin(la) ** 2)
    return m * math.pi / 180, n * math.cos(la) * math.pi / 180


def texture_png():
    px = bytearray(b"\xc8\xd2\xbe" * TEX * TEX)            # pale green-grey ground
    mpp = 2 * HALF / TEX

    def fill(e0, e1, n0, n1, rgb):
        x0, x1 = int((e0 + HALF) / mpp), int(math.ceil((e1 + HALF) / mpp))
        y0, y1 = int((HALF - n1) / mpp), int(math.ceil((HALF - n0) / mpp))
        x0, x1, y0, y1 = max(0, x0), min(TEX, x1), max(0, y0), min(TEX, y1)
        row = bytes(rgb) * (x1 - x0)
        for y in range(y0, y1):
            i = (y * TEX + x0) * 3
            px[i:i + len(row)] = row

    for m in range(-1000, 1001, 50):                        # grid: 50 m thin, 250 m thick
        w = 3 if m % 250 == 0 else 1
        fill(m - w / 2, m + w / 2, -HALF, HALF, (90, 90, 90))
        fill(-HALF, HALF, m - w / 2, m + w / 2, (90, 90, 90))
    fill(-HALF, HALF, 900, HALF, (220, 30, 30))             # north band red
    fill(-HALF, HALF, -HALF, -900, (30, 70, 220))           # south band blue
    fill(900, HALF, -HALF, HALF, (30, 170, 60))             # east band green
    fill(-HALF, -900, -HALF, HALF, (235, 200, 20))          # west band yellow
    fill(-10, 10, -1.5, 1.5, (255, 255, 255))               # white cross at the site centre
    fill(-1.5, 1.5, -10, 10, (255, 255, 255))
    fill(-5, 5, -VIEW_SOUTH_M - 5, -VIEW_SOUTH_M + 5, (230, 0, 230))   # magenta: under the drone
    for e0, e1, n0, n1, rgb in RECTS.values():
        fill(e0, e1, n0, n1, rgb)

    raw = b"".join(b"\x00" + bytes(px[y * TEX * 3:(y + 1) * TEX * 3]) for y in range(TEX))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", TEX, TEX, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def ground_glb():
    # glTF is Y-up; the tiles renderer turns it Z-up, so ENU (e, n, u) is stored as (e, u, -n).
    corners = [(-HALF, -HALF), (HALF, -HALF), (HALF, HALF), (-HALF, HALF)]
    pos = b"".join(struct.pack("<3f", e, 0.0, -n) for e, n in corners)
    uv = b"".join(struct.pack("<2f", (e + HALF) / (2 * HALF), (HALF - n) / (2 * HALF)) for e, n in corners)
    idx = struct.pack("<6H", 0, 1, 2, 0, 2, 3)
    png = texture_png()
    blobs, views, off = [pos, uv, idx, png], [], 0
    body = b""
    for b in blobs:
        pad = (-len(body)) % 4
        body += b"\x00" * pad
        views.append({"buffer": 0, "byteOffset": len(body), "byteLength": len(b)})
        body += b
    body += b"\x00" * ((-len(body)) % 4)
    gltf = {
        "asset": {"version": "2.0", "generator": "build91 geo test"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "TEXCOORD_0": 1}, "indices": 2, "material": 0}]}],
        "materials": [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 1},
                       "extensions": {"KHR_materials_unlit": {}}}],
        "extensionsUsed": ["KHR_materials_unlit"],
        "textures": [{"source": 0, "sampler": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": 3, "mimeType": "image/png"}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 4, "type": "VEC3", "min": [-HALF, 0, -HALF], "max": [HALF, 0, HALF]},
            {"bufferView": 1, "componentType": 5126, "count": 4, "type": "VEC2"},
            {"bufferView": 2, "componentType": 5123, "count": 6, "type": "SCALAR"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(body)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(body)
    return (struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(js), b"JSON") + js
            + struct.pack("<I4s", len(body), b"BIN\x00") + body)


def write_tiles():
    tileset = {
        "asset": {"version": "1.0", "gltfUpAxis": "Y", "copyright": "Build91 test ground"},
        "geometricError": 2000,
        "root": {
            "transform": enu_to_ecef(SITE[0], SITE[1], GROUND_H),
            "boundingVolume": {"box": [0, 0, 0, HALF, 0, 0, 0, HALF, 0, 0, 0, 5]},
            "geometricError": 0, "refine": "REPLACE",
            "content": {"uri": "ground.glb"},
        },
    }
    with open(os.path.join(HERE, "tileset.json"), "w") as f:
        json.dump(tileset, f, indent=1)
    with open(os.path.join(HERE, "ground.glb"), "wb") as f:
        f.write(ground_glb())


def write_project():
    pdir = os.path.join(APP, "projects", "geo-test")
    if os.path.exists(pdir):
        print("projects/geo-test exists — left as it is")
        return
    os.makedirs(pdir)
    c, s = math.cos(math.radians(BEARING)), math.sin(math.radians(BEARING))
    polys = []
    for pid, (e0, e1, n0, n1, _) in RECTS.items():
        pts = []
        for e, n in ((e0, n1), (e1, n1), (e1, n0), (e0, n0)):
            south = -n
            pe, ps = c * e + s * south, -s * e + c * south      # world → plan: rotate by −bearing
            pts.append(f"{PLAN_PX / 2 + pe / MPP:.2f},{PLAN_PX / 2 + ps / MPP:.2f}")
        polys.append(f'  <polygon class="plot" id="{pid}" points="{" ".join(pts)}"/>')
    with open(os.path.join(pdir, "plots.svg"), "w") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {PLAN_PX} {PLAN_PX}">\n' + "\n".join(polys) + "\n</svg>\n")
    with open(os.path.join(pdir, "plots.csv"), "w") as f:
        f.write("plot_id,status,facing,size,dimensions,price,block,tour_url,notes\n"
                "A01,available,East,1200 sq.m,30x40 m,,A,,Should sit exactly on the orange rectangle\n"
                "A02,reserved,North,1800 sq.m,60x30 m,,A,,Should sit exactly on the purple rectangle\n")
    mlat, mlon = metres_per_deg(SITE[0])
    align = {
        "version": 1, "note": "Build91 plot-map overlay alignment — Google Earth background test project",
        "savedAt": "2026-09-27T00:00:00.000Z",
        "transform": {"tx": 0, "ty": 0, "scale": 1, "rotationDeg": 0},
        "view": {"lonDeg": 180, "latDeg": -35, "fov": 80},
        "opacity": 0.5,
        "brand": {"name": "Geo test", "tagline": "Google Earth background check"},
        "background": {"kind": "google", "google": {
            "site": {"lat": SITE[0], "lng": SITE[1]},
            "anchorPx": {"x": PLAN_PX / 2, "y": PLAN_PX / 2},
            "bearingDeg": BEARING, "metresPerPx": MPP,
            "viewpoint": {"lat": round(SITE[0] - VIEW_SOUTH_M / mlat, 8), "lng": SITE[1], "heightM": VIEW_HEIGHT_M},
            "apiKey": ""}},
    }
    with open(os.path.join(pdir, "alignment.json"), "w") as f:
        json.dump(align, f, indent=2)
    print("wrote projects/geo-test")


if __name__ == "__main__":
    write_tiles()
    write_project()
    print("wrote", os.path.relpath(os.path.join(HERE, "tileset.json"), APP), "and ground.glb",
          os.path.getsize(os.path.join(HERE, "ground.glb")) // 1024, "KB")
