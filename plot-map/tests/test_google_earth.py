"""Offline checks for the Google Earth background's server side (GoogleEarthView.md §8, Phase 3).

What travels with a Google-mode project and what doesn't: publishing, the offline file list, the
standalone bundle. Temporary project folders only — the real projects/ folder is never touched, no
network, no AWS. Run from plot-map/:  python tests/test_google_earth.py
Add a case here for every new rule about what a Google-mode project ships."""
import json, os, shutil, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import publish_s3 as P
import server as S

fails = []
check = lambda cond, msg: (print(("ok   " if cond else "FAIL ") + msg), cond or fails.append(msg))

tmp = tempfile.mkdtemp()
S.PROJECTS_DIR = tmp                                   # offline_files() reads projects from here


def project(pid, kind, key="TEST-KEY-123"):
    d = os.path.join(tmp, pid)
    os.makedirs(d)
    for name in ("aerial.web.jpg", "plan.web.png", "stray.pdf"):
        open(os.path.join(d, name), "wb").write(b"x")
    open(os.path.join(d, "plots.svg"), "w").write('<svg viewBox="0 0 10 10"></svg>')
    doc = {"panoImage": {"file": "sample/aerial.web.jpg"}, "groundImage": {"file": "sample/plan.web.png", "opacity": 1},
           "background": {"kind": kind, "google": {"site": {"lat": 21.27, "lng": 81.59}, "apiKey": key}}}
    open(os.path.join(d, "alignment.json"), "w").write(json.dumps(doc, indent=2))
    return d, doc


g_dir, g_doc = project("gproj", "google")
p_dir, p_doc = project("pproj", "pano")

# 1. Which projects are Google projects.
check(P.uses_google_background(g_dir) and not P.uses_google_background(p_dir), "kind is read from alignment.json")

# 2. Publishing: a pano kept only for switching back is not published; everything else as before.
g_pub = {fn for fn, _ in P._project_files(g_dir)[0]}
p_pub = {fn for fn, _ in P._project_files(p_dir)[0]}
check("aerial.web.jpg" not in g_pub and "plan.web.png" in g_pub, "Google mode: the parked pano stays home, the plan goes")
check("aerial.web.jpg" in p_pub and "stray.pdf" not in p_pub, "pano mode: unchanged (pano goes, unreferenced files don't)")

# 3. The Google-only vendor code goes with Google projects only; three.js always.
geo_file = "vendor/3d-tiles-renderer-0.3.46/src/index.js"
check(P.shell_file_wanted(geo_file, True) and not P.shell_file_wanted(geo_file, False), "tiles library: Google projects only")
check(not P.shell_file_wanted("vendor/three-r160-addons/libs/draco/gltf/draco_decoder.wasm", False)
      and not P.shell_file_wanted("vendor/google-maps-logo/GoogleMaps_Logo_WithDarkOutline.svg", False), "Draco + logo: Google projects only")
check(P.shell_file_wanted("vendor/three.module.min.js", False) and P.shell_file_wanted("vendor/pdf.min.js", False), "the rest of vendor/: every project")

# 4. The offline file list (local server): a phone's saved copy answers every same-site request, so
#    a Google project's copy MUST carry the tiles code or the Google view fails even online.
paths = lambda pid: {f["path"] for f in json.loads(S.offline_files(pid))["files"]}
gp, pp = paths("gproj"), paths("pproj")
check(any(p.startswith("vendor/3d-tiles-renderer-") for p in gp) and any(p.startswith("vendor/three-r160-addons/") for p in gp),
      "Google project's offline list carries the tiles code")
check(not any(p.startswith(P.GEO_VENDOR_PREFIXES) for p in pp) and "vendor/three.module.min.js" in pp,
      "pano project's offline list doesn't")
check("projects/gproj/aerial.web.jpg" not in gp and "projects/pproj/aerial.web.jpg" in pp, "offline list follows the publish rule for the pano")

# 5. The standalone bundle never shows Google's view: no pano texture embedded, no key shipped.
check("aerial.web.jpg" not in json.loads(S.build_embedded_images_json(g_dir, g_doc))
      and "plan.web.png" in json.loads(S.build_embedded_images_json(g_dir, g_doc)), "bundle (Google): plan embedded, pano not")
check("aerial.web.jpg" in json.loads(S.build_embedded_images_json(p_dir, p_doc)), "bundle (pano): pano embedded as before")
inline = S.build_embedded_files_json(g_dir)
bundled = json.loads(json.loads(inline)["alignment.json"])      # the file travels as a JSON string inside the JSON
check("TEST-KEY-123" not in inline and bundled["background"]["kind"] == "google" and bundled["background"]["google"]["apiKey"] == "",
      "bundle inline data: key removed, the rest kept")
stripped = json.loads(S.without_google_key(json.dumps(g_doc)))
check(stripped["background"]["google"]["apiKey"] == "" and stripped["background"]["google"]["site"] == g_doc["background"]["google"]["site"],
      "without_google_key blanks only the key")
check(S.without_google_key('{"a": 1}') == '{"a": 1}', "a file with no key is left byte-identical")

shutil.rmtree(tmp)
print("\nALL PASSED" if not fails else f"\n{len(fails)} FAILED")
sys.exit(1 if fails else 0)
