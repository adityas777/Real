#!/usr/bin/env python3
"""
Turn projects/panotour-demo into a real, openable demo project for the Phase 1 tour viewer.

Two jobs:

1. Convert its tour.json from the SPIKE's flat shape ({nodes, links}) into the app's shape
   ({tours:[...]}) -- `parseTours` reads `d.tours`, so the flat file loads as zero tours.
   Builds a plausible flat layout (living room as the hub) so hotspot navigation has
   something real to demonstrate.

2. Write an alignment.json carrying a menuConfig with one `panotour` menu item, so the
   client sidebar actually shows something. A project whose menuConfig.tree is empty
   renders no menu at all -- which is why pano-testamit looked broken.

Hotspot directions are SPREAD EVENLY, not surveyed: nothing here knows where the real
doorways are. Open the admin Tour tab and drag each one onto its doorway.

Usage:  python spike/seed-demo-tour.py            (from plot-map/)
"""

import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJ = ROOT / "projects" / "panotour-demo"

# id -> (display name, image file). Order matches the render filenames.
ROOMS = [
    ("n1", "Master Bedroom", "01-master-bedroom.web.jpg"),
    ("n2", "Bedroom",        "02-bedroom.web.jpg"),
    ("n3", "Washroom",       "03-washroom.web.jpg"),
    ("n4", "Living Room",    "04-living-room.web.jpg"),
    ("n5", "Washroom 2",     "05-washroom.web.jpg"),
    ("n6", "Dining Room",    "06-dining-room.web.jpg"),
    ("n7", "Guest Bedroom",  "07-bedroom.web.jpg"),
    ("n8", "Drawing Room",   "08-drawing-room.web.jpg"),
    ("n9", "Kitchen",        "09-kitchen.web.jpg"),
]

# Plausible adjacency for a flat, with the living room as the hub. Each pair becomes TWO
# links (you can always walk back), which is what makes a tour feel like a space.
ADJ = [
    ("n4", "n6"),   # living  <-> dining
    ("n4", "n8"),   # living  <-> drawing
    ("n4", "n1"),   # living  <-> master bedroom
    ("n4", "n2"),   # living  <-> bedroom
    ("n4", "n7"),   # living  <-> guest bedroom
    ("n6", "n9"),   # dining  <-> kitchen
    ("n1", "n3"),   # master  <-> washroom
    ("n2", "n5"),   # bedroom <-> washroom 2
]


def main():
    if not PROJ.is_dir():
        raise SystemExit(f"error: {PROJ} not found")

    names = {i: n for i, n, _ in ROOMS}
    missing = [f for _, _, f in ROOMS if not (PROJ / f).exists()]
    if missing:
        raise SystemExit(f"error: missing panos (run prep-panos.py first): {missing}")

    nodes = [{
        "id": nid,
        "name": name,
        "pano": {"file": f"sample/{fn}"},          # stored sample/… , resolved by basename
        "defaultView": {"lonDeg": 0, "latDeg": 0, "fov": 75},
    } for nid, name, fn in ROOMS]

    # Spread each room's exits evenly around its horizon so none overlap on arrival.
    out_by_node = {}
    for a, b in ADJ:
        out_by_node.setdefault(a, []).append(b)
        out_by_node.setdefault(b, []).append(a)

    links = []
    for src, targets in out_by_node.items():
        step = 360.0 / max(1, len(targets))
        for i, dst in enumerate(sorted(targets)):
            links.append({
                "from": src,
                "to": dst,
                "label": names[dst],
                "hotspot": {"lonDeg": round(-180 + step * (i + 0.5), 1), "latDeg": -12},
            })

    tour_doc = {
        "version": 1,
        "note": "Build91 virtual tours",
        "savedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "tours": [{
            "id": "t1",
            "name": "3BHK Show Flat",
            "startNode": "n4",                      # arrive in the living room
            "nodes": nodes,
            "links": links,
        }],
    }
    (PROJ / "tour.json").write_text(json.dumps(tour_doc, indent=2), encoding="utf-8")
    print(f"  + tour.json          1 tour, {len(nodes)} nodes, {len(links)} links (start: Living Room)")

    # alignment.json: no plots in this project, so most of it is inert defaults. The part
    # that matters is menuConfig.tree -- without an entry there the client shows no menu.
    align_path = PROJ / "alignment.json"
    align = json.loads(align_path.read_text(encoding="utf-8")) if align_path.exists() else {}
    align.setdefault("version", 1)
    align.setdefault("note", "Build91 plot-map alignment")
    align["savedAt"] = tour_doc["savedAt"]
    align.setdefault("transform", {"tx": 0, "ty": 0, "scale": 1, "rotationDeg": 0})
    align.setdefault("view", {"lonDeg": 0, "latDeg": 0, "fov": 75})
    align.setdefault("opacity", 1)
    align.setdefault("brand", {"name": "Panorama Tour Demo", "tagline": "360° walkthrough"})

    tree = align.setdefault("menuConfig", {}).setdefault("tree", [])
    if not any(n.get("contentType") == "panotour" for n in tree):
        tree.append({
            "id": "node_panotour_demo",
            "title": "3BHK WALKTHROUGH",
            "kind": "child",
            "contentType": "panotour",
            "content": {"url": "", "fileName": "", "tourId": "t1"},
        })
        print("  + alignment.json     menu item '3BHK WALKTHROUGH' -> tour t1")
    else:
        print("  = alignment.json     panotour menu item already present")
    align_path.write_text(json.dumps(align, indent=2), encoding="utf-8")

    print("\n  open:  /?project=panotour-demo            (client — menu > 3BHK WALKTHROUGH)")
    print("         /?admin=1&project=panotour-demo    (admin  — Tour tab > Open tour)")
    print("\n  NOTE: hotspot directions are evenly spread, not surveyed — drag each one")
    print("        onto its real doorway in the admin Tour tab, then Save.")


if __name__ == "__main__":
    main()
