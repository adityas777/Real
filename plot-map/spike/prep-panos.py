#!/usr/bin/env python3
"""
Phase 0-A: pano asset prep.

Turns a folder of raw equirectangular render PNGs into texture-safe, web-shippable
`.web.jpg` files, and emits a `tour.json` skeleton the spike harness (and, later, the
real tour engine) can load.

Why this exists: the raw renders are ~40 MB PNG each. Nine of them is 343 MB, which is
not shippable in any form. At 8192x4096 / q82 (the same setting `app.js` already uses for
`loadPanoTexture`) they land around 2 MB each -- a ~17x reduction with no visible loss at
normal viewing FOV. See VIRTUAL-TOUR.md Phase 0-A for the measurements.

Usage:
    python prep-panos.py <src-dir> [--out <dir>] [--size 8192x4096] [--quality 82]

Requires ImageMagick 7 (`magick`) on PATH.
"""

import argparse
import json
import re
import shutil
import struct
import subprocess
import sys
from pathlib import Path


def png_size(path):
    """Read WxH straight from the PNG IHDR -- avoids decoding a 50 MB image."""
    with open(path, "rb") as fh:
        head = fh.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", head[16:24])


def slugify(stem):
    """'1. Master Bedroom' -> ('01-master-bedroom', 'Master Bedroom', 1)"""
    order = None
    m = re.match(r"^\s*(\d+)\s*[.\-_)]\s*(.*)$", stem)
    if m:
        order = int(m.group(1))
        label = m.group(2).strip()
    else:
        label = stem.strip()

    # Title-case only the shouty ones ("BEDROOM" -> "Bedroom"); leave mixed case alone.
    if label.isupper():
        label = label.title()

    slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-") or "node"
    if order is not None:
        slug = f"{order:02d}-{slug}"
    return slug, label, order


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path, help="folder of raw equirect PNG/JPG renders")
    ap.add_argument("--out", type=Path, default=None, help="output dir (default: src)")
    ap.add_argument("--size", default="8192x4096", help="target WxH (default 8192x4096)")
    ap.add_argument("--quality", type=int, default=82, help="JPEG quality (default 82)")
    ap.add_argument("--force", action="store_true", help="re-encode even if up to date")
    args = ap.parse_args()

    if not shutil.which("magick"):
        sys.exit("error: ImageMagick 7 ('magick') not found on PATH")
    if not args.src.is_dir():
        sys.exit(f"error: no such directory: {args.src}")

    out_dir = args.out or args.src
    out_dir.mkdir(parents=True, exist_ok=True)

    sources = sorted(
        p for p in args.src.iterdir()
        if p.suffix.lower() in {".png", ".jpg", ".jpeg"} and ".web." not in p.name.lower()
    )
    if not sources:
        sys.exit(f"error: no source images in {args.src}")

    nodes, total_src, total_out = [], 0, 0
    print(f"prep-panos: {len(sources)} source image(s) -> {args.size} q{args.quality}\n")

    for src in sources:
        slug, label, order = slugify(src.stem)
        dst = out_dir / f"{slug}.web.jpg"
        src_mb = src.stat().st_size / 1048576
        total_src += src_mb

        dims = png_size(src)
        if dims and abs(dims[0] / dims[1] - 2.0) > 0.01:
            # Not fatal -- but a non-2:1 source is not a valid equirectangular and the
            # sphere mapping will be wrong. Worth shouting about.
            print(f"  !! {src.name}: {dims[0]}x{dims[1]} is not 2:1 -- not a valid equirect")

        fresh = dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime
        if fresh and not args.force:
            print(f"  = {dst.name:34s} (up to date)")
        else:
            subprocess.run(
                ["magick", str(src), "-resize", args.size,
                 "-strip", "-quality", str(args.quality), str(dst)],
                check=True,
            )
            out_mb = dst.stat().st_size / 1048576
            print(f"  + {dst.name:34s} {src_mb:6.1f} MB -> {out_mb:5.2f} MB"
                  f"  ({src_mb / out_mb:4.1f}x)")

        total_out += dst.stat().st_size / 1048576
        nodes.append({
            "id": slug,
            "name": label,
            "pano": {"file": dst.name},
            # No depth pass or camera transform available yet -- see VIRTUAL-TOUR.md OQ-1.
            # When they arrive, add:  "depth": {"file": "..."}, "position": {...}
            "defaultView": {"lonDeg": 0, "latDeg": 0, "fov": 75},
        })

    # A ring so every node is reachable in the spike. Real adjacency needs floor-plan
    # knowledge we do not have (OQ-4) -- this is placeholder topology, not truth.
    links = []
    for i, node in enumerate(nodes):
        nxt = nodes[(i + 1) % len(nodes)]
        if nxt["id"] != node["id"]:
            links.append({
                "from": node["id"],
                "to": nxt["id"],
                "hotspot": {"lonDeg": 0, "latDeg": -12},
                "label": nxt["name"],
            })

    tour_path = out_dir / "tour.json"
    if tour_path.exists() and not args.force:
        print(f"\n  = tour.json exists -- left alone (use --force to regenerate)")
    else:
        tour_path.write_text(json.dumps({
            "version": 1,
            "startNode": nodes[0]["id"],
            "nodes": nodes,
            "links": links,
        }, indent=2), encoding="utf-8")
        print(f"\n  + tour.json  ({len(nodes)} nodes, {len(links)} placeholder links)")

    print(f"\n  total: {total_src:.0f} MB -> {total_out:.1f} MB"
          f"  ({total_src / total_out:.1f}x smaller)")
    print(f"  GPU cost if all resident: ~{len(nodes) * 179:.0f} MB "
          f"(8192x4096 RGBA + mips) -- eviction IS required, see Phase 1.5")


if __name__ == "__main__":
    main()
