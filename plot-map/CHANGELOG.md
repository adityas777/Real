# Changelog

Running log of changes made by Claude in this session/project going forward.
Newest entries at the top. Each entry: what changed, why, and files touched.

---

## 2026-09-29 (Hosted admin: EC2 sleep/wake)

The admin can now be hosted on AWS and pay only while in use (3–4 sessions a week). A wake-up
link starts the server, and it stops itself when idle. The hands-on guide is `deploy/ec2/README.md`.
- **`server.py`:**
  - `GET /api/health`, the "server is up" check;
  - `GET /api/idle`, loopback only: `idleSeconds` since the last real request, and `busy` while any upload, download or publish runs;
  - `note_activity()` ignores the admin's own polling (`PASSIVE_ROUTES`), so an open tab doesn't block sleep.
- **New helpers:** `assets_s3.any_busy()` and `publish_s3.any_running()`.
- **`deploy/ec2/`:**
  - `Caddyfile.template`: HTTPS and basic auth, with `/api/health` open, 300 MB bodies and 15 min timeouts;
  - `plotmap.service`: `server.py` bound to 127.0.0.1;
  - `idle-shutdown.sh` with its timer and service: stops the instance after 60 idle minutes, never while busy, and also if `server.py` stops answering for that long;
  - `setup.sh`: one-command Ubuntu setup;
  - `wake-lambda/lambda_function.py`: Function URL + key; starts the instance, shows a self-refreshing waiting page, then redirects to the admin; optional Route 53 re-pointing;
  - `iam/` policies;
  - `.gitattributes` forcing LF.
- **Verified locally:**
  - `/api/health` and `/api/idle` on a test port: polling doesn't reset idle, and a page load does.
  - The idle script (with a stubbed shutdown) stays up when recent, and stops when idle or when the server is down.
  - The Lambda was checked against a mocked EC2 for bad key, stopped, running-not-ready, ready (302 with the project) and stopping.
- **Not tested:** on real AWS.
Files: `server.py`, `assets_s3.py`, `publish_s3.py`, `deploy/ec2/*`, `CLAUDE.md`, `ADMIN-DATA-SYNC.md`.

---

## 2026-09-29 (Contact page: a blank email hides the email row)

On request: remove the email from eleganzav2's contact page. Its contact item already had an empty
email, but `openClientContactModal` fell back to the demo address `anandameleganza@gmail.com` whenever
the email was blank.
- A contact that has an `email` field now shows exactly that value, and when it's blank the
  whole email row (`#clientContactEmailContainer`) is hidden.
- The demo fallback applies only when the field is missing entirely.
- In `styles.css`:
  - `.contact-info-row[hidden]` beats the row's `display: flex !important`;
  - the row before a hidden last row loses its divider.
- To show an email again: add it in the Contact item's editor.
- Verified in headless Chrome on eleganzav2: the email row computes to `display: none`, and only the address and phone show.
Files: `app.js`, `styles.css`.

---

## 2026-09-28 (Tour switches without a loading screen)

On request (laxmi): switching furnished ↔ unfurnished showed the loading screen. It should be as smooth as the
curtain open/close.
- **Why the curtain was smooth:** the curtain's other state is a linked room, so neighbour prefetch had it ready and the
  switch was a pure crossfade. The other render of the current room was never prefetched.
- **Fix:** `prefetchTourNeighbours` now also warms the other variant of the current room, after the neighbours are
  loaded, so walking on is never slowed.
- **Every move inside a tour** (room, view, version) now keeps the current room on screen until the next one is ready,
  then crossfades. It uses `showTourLoader(…, { mini: true })`, which never shows the dimmed veil.
  - Only a download slower than 700 ms (`TOUR_MINI_DELAY`) shows a small corner spinner (`.tour-loader.is-mini`).
  - Entering a tour from the plot map keeps its existing veil.
- **Verified** in headless Chrome on a throwaway laxmi copy (since deleted), 318 1-BHK:
  - Three version switches showed no loader.
  - The network log shows `n1-b`/`n2-b` fetched right after arriving in each room, before the switch.
Files: `app.js`, `styles.css`, `CLAUDE.md`.

---

## 2026-09-28 (Tours-only projects: no leaving to a black screen)

On request, from laxmi, where AERIAL VIEW is switched off: going Back out of a tour showed an empty black pano.
When the project has no enabled AERIAL VIEW (`tourHasAerialHome`):
- The ✕ EXIT TOUR rows are hidden (`withExitTourRow` and the root list).
- Back from a tour's rooms goes to the main menu with the tour still on screen and its row highlighted.
- Any visitor exit (`exitTourToHome`) opens the menu's top item instead of the empty view.

Projects with an aerial view behave as before.
Verified in headless Chrome on a throwaway copy of laxmi (since deleted):
- Rehab Lobby → Back gives the main menu with REHAB LOBBY highlighted.
- 574 → Back keeps the 574 room on screen (screenshot).
- No Exit rows appear.
Files: `app.js`, `README.md`, `CLAUDE.md`.

---

## 2026-09-28 (Tours: a "Main menu" switch per tour, and folders of tours)

**Problem (laxmi):** the menu only had SALES LOBBY and REHAB LOBBY, but opening either one listed all 5 tours.
`virtualTourPickerNode` built the in-tour list from every tour in tour.json.

**Fix, per the owner's spec:**
- **A Menu switch per tour** in the Tour tab (`setTourOnMainMenu`).
  - ON adds a `panotour` row for the tour to the main menu (above the MENU IMAGE if it's last).
  - OFF removes that row.
  - The switch reads "Folder" when the tour sits only in a folder.
- **Folders of tours:** ＋ Add Item → Virtual Tour now has "Also put these tours in it". Ticking tours turns the new item into a folder
  with one row per tour (`renderWizardTourExtras`, `wizardState.extraTourIds`, new `#wizardTourExtras` in index.html).
- **The in-tour drawer follows placement** (`tourMenuGroup`):
  - a main-menu tour shows only its rooms;
  - a folder tour shows that folder's tours, then its rooms, and Back returns to the folder (`tourGroup` flag);
  - unplaced tours use the built-in VIRTUAL TOUR list, which now lists only unplaced tours (`autoListedTours`).
- The open tour's row is highlighted.
- **Verified:** in headless Chrome on a throwaway copy of laxmi (since deleted).
  - Sales/Rehab Lobby list no other tours.
  - The switch added "413 1-BHK" to the menu.
  - The wizard made a "FLATS" folder of 318/413/574, and inside it the drawer showed only those 3 tours, then 574's rooms. Back returned to the folder, and switching to 318 worked.
Files: `app.js`, `index.html`, `styles.css`, `README.md`, `CLAUDE.md`.

---

## 2026-09-28 (Boss review: marker shadows, no mid-route distance pill)

- **Removed the "🚗 3.7 km · 8 min" pill** from the middle of a route. It was confusing: it read as the length of the road it sat on,
  not the whole trip. The landmark's banner still shows the total. Removed `routeMetaText`, `routeEls.mid`
  and the mid-point calculation from `renderRoutes`.
- **3D shadows on road-name markers:**
  - a **cast shadow** on the ground: the same stem and card shapes, flattened and slanted (`skewX(-48) scale(1 0.34)`) and blurred;
  - a **contact shadow** under the road dot;
  - a deeper two-layer **drop shadow** under the card;
  - a top-to-bottom **shaded face** (`#lmRoadSignFace`), a lit top edge and a faint text emboss.
- **Verified** in headless Chrome on eleganzav2's AIMS Raipur route, viewing only. No mid pill is in the DOM, all 4 markers
  render, and zoomed screenshots show the cast shadows.
Files: `app.js`, `styles.css`, `README.md`, `CLAUDE.md`.

---

## 2026-09-28 (Road names as 3D map markers)

On the owner's reference, each road-name label is now a 3D point marker. A white card with a grey underside
(thickness) and a drop shadow floats `ROAD_SIGN_LIFT` (26) px above the road. A thin glowing stem
(gradient `#lmRoadSignStem`) runs down to a small glowing dot on the road. The dot is the fixed
anchor from `routeSignAnchors`, so the marker still stays put when zooming.
Verified in headless Chrome on eleganzav2's AIMS Raipur route (4 named roads), viewing only.
Files: `app.js`, `styles.css`, `README.md`, `CLAUDE.md`.

---

## 2026-09-28 (Road names: fixed on the road, map-style labels)

- **Labels no longer move or disappear when zooming.** The first version picked a spot on screen
  every frame and dropped a label that crowded the others, so labels jumped around or vanished.
  Each label now has a fixed spot: the halfway point of its stretch, measured along the road on
  the sphere (`routeSignAnchors`, cached). It is projected every frame and shown whenever that spot
  is on screen.
- **New look**, from the owner's reference image: a flat white map label with dark text sitting on the line
  (`.lm-road-sign-bg`/`-text`). This replaces the green 3D sign on a post and its gradient `<defs>`.
- **Verified** in headless Chrome on eleganzav2, viewing only (nothing saved). On the Tatiband Chowk
  route, all 3 labels show at the normal view and after zooming in, each within 1 px of the road
  line (screenshots).
Files: `app.js`, `styles.css`, `README.md`, `CLAUDE.md`.

---

## 2026-09-28 (Routes: turn arrows back, 3D road-name signs)

- **Turn arrows restored** on top of the road look, with the same Google-Maps maneuver arrows as before
  (`ROUTE_TURN_*` constants, `.lm-route-turn` CSS).
- **Road-name signs:** a route point can carry a road name. It's stored in `landmarks.json` as
  `route[i].road`, and in memory as `name`. The name holds from that point to the next named point.
  A small green 3D sign stands on the road at the middle of each named stretch: a gradient face,
  a white rim, a darker board behind it for thickness, a top shine, a post, and a shadow on the
  road. It skips spots near turn arrows, the distance pill and other signs.
- **Admin:** clicking a route dot without dragging selects it (orange ring), and the landmark
  editor shows "Road name from point N onward". Named dots are green. Dragging a dot keeps its name. Deleting a
  named dot passes the name to the next dot.
- **Verified:** in headless Chrome, using a throwaway copy of eleganzav2 (since deleted).
  - Client: the signs and turn arrows show on the road (screenshot).
  - Admin: clicking a dot opened the name box, typing drew the sign, and `road` was saved to disk.
Files: `app.js`, `styles.css`, `README.md`, `CLAUDE.md`.

---

## 2026-09-28 (Routes drawn as a road instead of a blue navigation line)

On the owner's reference photo, a route now looks like a road. It has dark asphalt (`#34373b`),
thin white edge lines (the white casing shows about 1 px each side) and a dashed white centre line (new
`lm-route-centre` path, with dashes in screen px). The blue colour, chevrons and turn arrows are gone:
their code, `ROUTE_CHEVRON_PX`/`ROUTE_TURN_*` and their CSS were removed. Pills and end dots moved from
blue to the same dark grey. Checked in headless Chrome on eleganzav2 (screenshot). Hiding the route
when its banner is off screen still works.
Files: `app.js`, `styles.css`, `README.md`, `CLAUDE.md`.

---

## 2026-09-28 (Routes: hide off-screen routes, Google-Maps turn arrows)

- A visitor's route now shows only while its landmark's banner is on screen. When you pan
  away, the route hides; pan back and it returns without replaying the draw-in.
  `renderLandmarks` records the drawn banners in `routeBannerOnScreen`, and `renderRoutes` checks it.
  The admin editing a route still always sees it.
- The turn badges (disc + arrow) are replaced with maneuver arrows like Google Maps: a white shaft with a dark-blue
  edge that bends with the road through the turn (`ROUTE_TURN_ARM_PX` either side) and ends in an
  arrowhead pointing the new way.
- Verified: headless Chrome on eleganzav2. Tapping the route shows 2 turn arrows; panning away turns the route off, and panning back brings it back.
Files: `app.js`, `styles.css`, `README.md`, `CLAUDE.md`.

---

## 2026-09-28 (Routes look like Google Maps: turn arrows, chevrons, labels, draw-in)

On request, added Google-Maps-style detail to landmark routes. Everything is placed in screen
space every frame (`renderRoutes`), so it keeps its size at any zoom:
- **Turn badges:** a white disc with a blue arrow facing the new direction, at every drawn point
  where the road bends more than 35° on screen (`ROUTE_TURN_DEG`).
- **Chevrons:** white `›` marks every 64 px along the line, pointing towards the landmark. They
  replace the moving dashes.
- **Labels:** a "🚗 3.7 km · 8 min" pill mid-route from the landmark's own distance and drive
  time (`routeMetaText`), and the project's name under the start dot.
- **Draw-in:** when a visitor opens a route, the road grows from the project to the landmark
  (`pathLength="1"`), then the arrows and labels fade in. Turned off for reduced motion.
- The admin editing view shows no labels, so the handles have room.

`routeSamples` now tags drawn points (`ctrl`), and the SVG pieces are pooled (`routePool`).
Files: `app.js`, `styles.css`.

---

## 2026-09-28 (Landmark routes, Phase 1: draw a road route from the project to a landmark)

Google-Maps-style route lines on the aerial pano. In the admin Landmarks tab a selected
landmark has **Route from the project → ✏ Draw route**. Click along the road, then Done or Esc.
Afterwards: drag a dot, double-click or right-click a dot to delete it, click the line to
insert a point, Undo while drawing, Clear. Stored as `route` in `landmarks.json` (directions
like the hotspot; 3 decimals; left out when empty) and in the admin session. Drawn as an SVG
under the landmark layer: white casing, blue road, dashes flowing towards the landmark, and
end dots; a smooth Catmull-Rom curve through the points. Visitors: tapping a route-bearing
banner shows its route (desktop hover previews it); tapping empty ground hides it.
Verified headless on a throwaway copy of eleganzav2 (since deleted, never uploaded):
- **admin:** 4 clicks → 4 points; a dot follows a 50 px drag; clicking the line inserts a
  point (5); double-click deletes one (4); the route is saved to `landmarks.json`;
- **client:** banner tap shows the route, a sky tap hides it.
Not yet checked on a phone. Files: `app.js`, `styles.css`, `README.md`, `CLAUDE.md`.

Also: the local server kept "crashing" because it was started inside a tool shell and was
killed with it. It's now started as a detached process (PowerShell `Start-Process`).

---

## 2026-09-28 (Doc: what the Google Earth background costs)

New `GOOGLE-EARTH-COSTS.md`, linked from GoogleEarthView.md §5 (G5). Covers Google's
Photorealistic 3D Tiles billing (one event per root request, 3-hour free session), the India
price list (7,000 free a month, then $3.30 per 1,000) next to the global one, when the current
code makes a billed request (every page load; not tours; admin Test / Use key / Find site /
switch), monthly examples, Build91's own cost (~$0), cost risks, and client cost controls.
Biggest finding: every page open is billed even when the aerial view is never shown (R-1).
Docs only, no code change.

---

## 2026-09-27 (Google Earth background: Phases 2 + 3 — admin setup and shipping; Phase 0 go)

On request, after the owner tried Google's real imagery at their site with their own key:
"No this is all working fine. Lets move onto the other phases please". That's the Phase 0 go,
recorded as D-13 in GoogleEarthView.md.

**Phase 2: admin setup**
- **Align tab:** an **Aerial background** choice, Panorama photo | Google Earth
  (`setBackgroundKind`). Switching is lossless both ways.
- **Floating 🌍 Google Earth setup panel (`#geoPanel`):**
  - **Key:** the project's key (masked); **Test** asks Google once and gives the problem in
    plain words; **Use this key**; setup steps to send the client, with the project's
    published addresses.
  - **Site:** from a Google Maps / Earth link (a place link's pin wins over its map centre)
    or `lat, lng`.
  - **Drone:** height, plus distance and compass direction from the site; the camera re-aims.
  - **Tools:**
    - **Top-down view:** a temporary viewpoint above the site, with the drone marked.
    - **Two-point align:** a complex-number similarity solve, with the plan hidden for the
      satellite clicks.
    - **Measure:** metres and feet.
  - **Readouts:** m per plan pixel, bearing, and size across.
- **Consistency:** `bakeGooglePlacement` / `reapplyGooglePlacement` / `activeViewpoint` keep
  the live transform, the stored placement and the current viewpoint consistent. `geoPlace`
  now moves the world so any viewpoint sits at the camera; the tiles stay centred on
  `geo.origin`.

**Phase 3: shipping**
- **Vendor code:** the Google-only vendor code goes with Google projects only, in publish and
  in the offline list (`publish_s3.GEO_VENDOR_PREFIXES`, `uses_google_background`,
  `shell_file_wanted`; `server.offline_files`). A saved offline copy answers every same-site
  request, so without it a phone that saved the site would lose the Google view even online.
- **Parked pano:** not published, not in the offline list, and not embedded in bundles.
- **Bundles:** the key is stripped (`server.without_google_key`, both the inline data and
  `data/alignment.json`). The export pre-flight warns ("Aerial view — Google Earth
  background"), and its Edit opens the setup panel.
- **Tests:** new `tests/test_google_earth.py`, 14 checks, temporary folders, no network.

**Verified**
- **On the local test ground** (`?gtiles=`: the owner's key made no requests; nothing saved;
  the test draft cleared):
  - two-point align lands the clicked plot within 3–8 cm;
  - measure: 50.0 m / 212 m, exact;
  - drone re-aim: pitch −50.2° as computed;
  - switching lossless;
  - fake-key Test gives "not valid";
  - Maps place link parsed.
- **Content types:** published `.js` / `.wasm` / `.svg` are right (`deploy_s3.content_type_for`).
- **Fixed while testing:** the site box and the drone distance lagged a moved layout (they
  read the stored site, not the live one).
- **Not done:** a real publish to S3 (outward-facing), phones.

**Files:** `app.js`, `index.html`, `styles.css`, `publish_s3.py`, `server.py`,
`tests/test_google_earth.py`, `GoogleEarthView.md`, `CLAUDE.md`, `README.md`,
`ADMIN-DATA-SYNC.md`, `MOBILE-OFFLINE.md`.

---

## 2026-09-27 (Google Earth background: Phase 0 tooling + Phase 1 viewer layer)

On request, OQ-8 answered: "Lets just allow 1 key per project. admin user will manage which
key value goes there. Lets start building as per the plan. Ph 0 followed by Ph1". Recorded as
D-12 in GoogleEarthView.md.

**Phase 0**
- There is no Google key yet, so only the non-key parts were done.
- **Library pinned:** 3d-tiles-renderer 0.3.46 is the last release that supports our three.js
  r160 (0.4.0+ needs r166+).
- **New `tools/vendor_3d_tiles.py`:**
  - checks the npm sha512 of each package;
  - copies only the modules needed: 64 library modules, plus GLTFLoader, DRACOLoader,
    BufferGeometryUtils, Pass and the Draco decoder from three@0.160.0;
  - rewrites bare `three` imports to our `vendor/three.module.min.js`, so there's one three.js;
  - fetches Google's official logo.
  - Output: `vendor/3d-tiles-renderer-0.3.46/`, `vendor/three-r160-addons/`,
    `vendor/google-maps-logo/`, about 700 KB, loaded only for Google-mode projects.
- **Readout:** `?gdebug=1` shows the numbers the check needs.

**Phase 1 (app.js, section "Aerial background: Google Earth")**
- **Data:** `alignment.json` gains an optional `background` block (`parseBackground` /
  `backgroundData`). Absent means a pano project, round-tripped byte-identically.
- **Placement:** in Google mode the pano's `transform` is parked and written back unchanged,
  and `state.transform` holds the Google placement in ground units. So Move / Scale / Rotate
  work unchanged, and Save turns them back into metres and lat/lng (`googlePlacementNow`).
  `recomputeAnchorAndK` takes the anchor and scale from the placement
  (`syncGoogleOverlayScale`).
- **The layer:** `startGoogleLayer` lazily imports the vendored library.
  - `GoogleCloudAuthPlugin` handles the key. `ReorientationPlugin` puts the ground under the
    drone at the origin, and `geoOrient` turns the world to X east / Y up / Z south,
    measured, not assumed.
  - The ground height under the site is ray-cast once (`geoBeginGround` / `geoFinishGround`).
    The admin's value is saved so visitors don't wait.
  - The drone is placed H metres above that ground (`geoPlace`).
- **Drawing:** `renderScene` draws the tiles scene (painted sky, 40 km draw distance with
  haze), clears depth, then the usual scene over it.
- **Around the view:**
  - the compass north comes from `effectiveNorthDeg`;
  - the loading curtain waits for a sharp view, at most 8 s (`geo.holdCurtain`);
  - tours hide the layer and its credits;
  - Google's logo and credits show bottom-centre, with "Plot layout: <brand>".
- **Plan-only fallback with plain reasons (`GEO_REASONS`):** no key, key not valid, website
  not allowed, API off, key limited to other APIs, billing, quota, offline, bundle, no
  ground. It retries when the connection returns.
- **Dev options** (localhost / LAN only, never published): `?gtiles=` (a same-site relative
  path only), `?gheight=`, `?gdetail=`, `?gdebug=1`.

**Test ground:** new `spike/geo-tiles-test/make_test_tiles.py` writes:
- a surveyed one-tile 3D Tiles ground at Anandam Eleganza: a 50 m grid, coloured compass
  bands and two painted plot rectangles;
- a local project `projects/geo-test`, with the plan at a 30° bearing and the drone 200 m
  south at 150 m, and no key.

**Verified in the Browser pane**
- Ground measured at 290.0 m, the test ground's true height.
- Axes: east = +X, north = −Z.
- Every plot corner within 4–11 mm of its painted rectangle. Checked two ways: the tileset's
  own ECEF transform against the overlay's geometry.
- Save round-trip exact.
- Visitor view: curtain, credits, compass.
- Tour takeover and restore (simulated).
- No key gives `no-key`. A fake key gives `bad-key` in one request.
- laxmi (pano) loads no tiles code and shows no errors.
- The standalone bundle boots as classic scripts and shows plan-only with no tiles requests
  (checked served over http from a temp folder, since the pane can't run `file://`).

**Fixed while testing**
- The Google plugin's retry-on-any-4xx swallowed Google's refused-key answer. The root is
  now a plain fetch.
- A sea-level fallback when no ground had loaded put the camera underground. It now waits,
  or fails cleanly.
- Credits stayed visible during tours.
- The logo was requested in plan-only mode.

**Not verified:** Google's real tiles (no key), including Draco decoding and Google's credit
strings; phones. The bundle still carries the key (Phase 3).

**Files:** `app.js`, `styles.css`, `tools/vendor_3d_tiles.py`, `vendor/…` (new),
`spike/geo-tiles-test/` (new), `GoogleEarthView.md`, `CLAUDE.md`, `README.md`, and
`.gitignore`. `.gitignore` now uses `plot-map/tools/*` with an exception for
`vendor_3d_tiles.py`, because the old rule ignored the whole folder and so hid the script
that regenerates `vendor/`.

---

## 2026-09-27 (Plan: Google Earth as the aerial background — planning only)

On request: projects without a drone shoot should be able to use Google Earth's satellite view
as the aerial background, with plots traced and overlaid as today; "No code, only planning via
a new GoogleEarthView md file". New [GoogleEarthView.md](GoogleEarthView.md): recommends live
Google Photorealistic 3D Tiles in the existing three.js scene (replacing only the pano sphere,
camera fixed at a "drone" viewpoint, overlay projection reused with the layout placed in
metres), Google's terms as design constraints (live only, logo + credits, no tracing from the
imagery, restricted browser key, billing), admin workflow, data model (`alignment.json`
`background` block), effects on publish/offline/bundle/tours, phases 0–4, open questions,
risks. Linked from CLAUDE.md's planning docs. Docs only.
Later the same day: the owner's answers recorded as decisions D-5–D-11 (own Google Cloud
account; v1 look-around from one point with capped orbit/fly next — new §10a; one viewpoint;
plan-only offline; strictly one background; owner accepts the terms; old imagery OK), plus a
Google Cloud setup checklist in Phase 0. Open: budget/daily-cap numbers.
Then: Google keys are per project, supplied and paid for by each client — stored as
`background.google.apiKey` in the project's `alignment.json` (never in git, dropped from
bundles), admin key field + Test + ready-to-send client setup steps; reusing a client's
server key (e.g. `GOOGLE_PLACES_API_KEY`) advised against. New OQ-8 (Build91 admin-only key).

---

## 2026-09-27 (Project data out of git — S3 is its only shared home)

On request: "update gitignore so none of the projects data gets to git. projects are supposed to
saved to cloud only. delete any projects on git".

- `.gitignore`: `plot-map/projects/` ignored as a whole. The per-project lines it replaces (the
  `.originals`/`_originals` folders, `anadmanv2/`, eleganzav2's 207 MB film, `.b91-sync.json`,
  `*.part`) are gone — the one rule covers them.
- `git rm -r --cached plot-map/projects`: its 127 tracked files (609 MB, 16 folders) removed from
  the index. **Nothing deleted from disk** — every folder is still in this working copy.
- Checked before removing: every tracked file was in S3 with identical content (7 projects differed
  only in line endings). Not in S3: the `Backup` folder (not a valid project id, so it never syncs)
  and eleganzav2's two `.backup-renumber-*` folders (dot-folders never sync) — they remain on this
  machine and in git history.
- Still in git HISTORY (earlier commits). Purging it would mean rewriting history and
  force-pushing — not done.
- Heads-up for other clones: pulling this commit deletes the previously tracked project files from
  that working copy; the next admin open downloads them from S3.

Docs: `ADMIN-DATA-SYNC.md` (layers table, invariant 9, edge cases, history), `CLAUDE.md` (data
contract + save section), repo-root `CLAUDE.md`, `README.md`.

---

## 2026-09-27 (Design doc: ADMIN-DATA-SYNC.md — admin data, cloud ⇄ this computer)

On request: one place that explains how the admin's project data moves between S3 and a machine,
so future changes can pick it up and keep it maintained. **`ADMIN-DATA-SYNC.md`** covers the model,
every place admin data lives (S3 folder + manifest, local working copy + `.b91-sync.json`, browser
session/draft, the saved-here mark, git), the open / edit / save / upload / no-cloud flows (with a
flowchart), the per-file decision table, the invariants not to break, what never syncs,
download/upload internals, the `/api/assets/*` API, a code map, configuration, edge cases, how to
verify, and the history (2026-09-25 first version → 2026-09-26 rework).

Wired in so it stays current: listed at the top of `CLAUDE.md` (design docs) and in its
Documentation-discipline checklist; CLAUDE.md's long S3 bullets cut to a summary + link (one home
for the details); the `keep-docs-current` skill now names it (and runs for server changes too);
pointers from the repo-root `CLAUDE.md`, `README.md`, and the code (`assets_s3.py` docstring,
the app.js section header, the server.py route block). The offline rule checks moved from a
scratch script into the repo as **`tests/test_assets_s3.py`** (fake S3, temp folder, no network;
19 checks, all passing; exits non-zero on failure).

Corrected on the way: `.b91-publish.json` lives in S3, not beside the local files — dropped from
`.gitignore` and from `assets_s3.py`'s "never synced" note; the doc records that sync needs the
full ☁ Publish config (it shares `load_config`, which also requires `distributionId`,
`publicBaseUrl` and a password). Files: `ADMIN-DATA-SYNC.md` (new), `tests/test_assets_s3.py`
(new), `CLAUDE.md`, `../CLAUDE.md`, `README.md`, `.claude/skills/keep-docs-current/SKILL.md`,
`assets_s3.py`, `app.js`, `server.py`, `../.gitignore`.

---

## 2026-09-26 (Project working files in S3, reworked: ask before downloading, queue uploads per Save)

The owner's plan for the 2026-09-25 S3 mirror (reviewed the same day; five problems found):
"everytime admin panel is opened, the s3 files for a project are downloaded in a persistent
working folder locally… no duplicate download… give prompt to admin when they switch the projects…
blocking load till all files are downloaded… in case the files between local and s3 are
different… users gets a prompt to decide which copy to use", plus "a smart multiple upload widget
which can allow multiple uploads — everytime save is clicked".

**What was wrong before:** opening a project replaced any local file whose SIZE differed from
S3's — unsaved local work was overwritten by older cloud copies; every missing file asked S3
before answering (0.5–1.6 s per optional file the app probes, e.g. `loading.web.jpg`); a Save
made while an upload ran was skipped with nothing retrying it (and `/api/save` started the upload
BEFORE the Save's big files reached `/api/upload`); files whose names start with a dot were
uploaded but could never be downloaded, so they read as "missing" on every other machine forever.

**assets_s3.py (rewritten)**
- `plan(pid)`: compares local files, the S3 manifest and a new LOCAL sync record
  (`projects/<id>/.b91-sync.json`, git-ignored — what this machine and S3 last agreed on).
  → `download` (missing here / changed in S3 while untouched here) and `conflicts` (changed here
  and different in S3: `local`, `both`, or `unknown` = never synced). Files in step are recorded
  so they aren't re-hashed.
- `start_pull(pid, use)`: background download; `use=s3` also overwrites conflicts, `use=local`
  keeps them. Media first, JSON last; `.part` then replace; record updated per file.
- `enqueue_push(pid)`: one job per Save, a queue per project, one transfer at a time per project.
  A job uploads files changed here since the last sync — never a file untouched here that S3
  holds newer (`keptNewer`). Byte progress via boto3 callbacks; the manifest is merged (re-read
  first; nothing ever dropped) after each big file and at the end. `jobs()`, `retry(id)`.
- Text files hash with CRLF folded to LF (git autocrlf must not look like an edit); older
  manifests are upgraded file by file. Dot-paths, `_originals`, `*.part` never sync. S3 client
  with short connect timeouts. `cloud_projects()` lists S3-only project ids.

**server.py** — `GET /api/assets/plan`, `POST /api/assets/pull?use=`, `GET /api/assets/pull-status`,
`POST /api/assets/push`, `GET /api/assets/jobs`, `POST /api/assets/retry?id=` replace
`/api/assets/pull` + `/status`; `/api/save` no longer uploads; the on-demand S3 fetch for a missing
file is removed (plain 404 again, measured 12 ms); `/api/projects` adds `cloud`.

**app.js** — `fetchProjectAssets` → `prepareProjectFiles` + `openProjectFilesDialog` (blocking
prompt over the boot curtain; required copy choice when there are conflicts; unsaved edits in
this browser count as one — `unsavedBrowserEdits`/`markSavedHere`/`discardBrowserWork`; "← Back
to <prev>" or "Open another project…"). `exportSite({upload})` — only 💾 Save, Save as and Publish
upload; the 400 ms landmark/amenity auto-saves stay local. Upload widget `queueUpload`/
`pollUploads`/`renderUploadDock`. The switcher lists cloud-only projects and remembers the
project you came from.

**styles.css** — `.pf-dlg-*` (z-index above the boot curtain), `.upload-dock`/`.ud-*`
(bottom-right, left of the zoom column). **.gitignore** — the per-machine records and `*.part`.

**Also:** `projects/try1/amenities.json` restored (the 2026-09-25 commit had saved an S3 test
payload, `{"amenities":[],"_s3test":…}`, over it; the S3 copy was replaced by the next Save).

Verified: 19 offline rule checks against a fake S3 (scratch script); in the Browser pane — try1
conflict prompt, keep local, Save → widget "✓ Uploaded 6 files", reopen with no prompt; laxmi
45 files / 105.7 MB downloaded in 12.8 s then 59 in sync; "← Back" from cloud-only `lknj`;
missing-file 404 in 12 ms. Not tried: a second real machine; a download cut off by a real
network drop. Files: `assets_s3.py`, `server.py`, `app.js`, `styles.css`, `.gitignore`,
`projects/try1/amenities.json`, `README.md`, `CLAUDE.md`.

---

## 2026-09-26 (Docs corrected: the 📌 landmark entry described a version that was replaced)

The 2026-09-25 📌 entry said labels sit above their own pin (`LM_PIN_LIFT`) and still avoid
overlaps; the code draws each banner exactly where the admin placed it and skips the overlap pass.
Entry rewritten to match the code (the pin-anchored version is kept as "built, measured,
replaced"); the `state.steadyLandmarks` and `index.html` comments fixed the same way. Docs only.

---

## 2026-09-26 (Proof of concept: Google Earth 3D → 360° panorama)

New standalone tool `tools/google-earth-pano.html` (not linked from the app). Loads Google
Photorealistic 3D Tiles (Map Tiles API) with `3d-tiles-renderer@0.5.3` + three r170 from
jsDelivr, recentres the world on the chosen lat/lon (`ReorientationPlugin`), ray-casts down
for the ground, streams tiles for a CubeCamera at ground + height until nothing is loading,
and reprojects the cube to an equirectangular JPG (4K/8K) for download. Inputs: Earth/Maps
link or "lat, lon", height above ground, facing heading, size, detail, API key (browser
localStorage only). Painted gradient sky (the 3D data has none).
Verified headless with `?selftest=1` (coloured markers, no key): N/E/S/W/up/down all land at
the expected pixels, and heading 90° centres east. The Google tile path itself is NOT
verified yet — no API key on this machine. Licence: Google's terms restrict exporting
their imagery; this is for evaluating quality only.
Testing note: headless Chrome "hangs" earlier today were debug-port collisions with
leftover test browsers (random 9100-9900 ports); use an OS-assigned free port.

---

## 2026-09-26 (Fix: re-uploaded room showed the deleted room's picture)

Node ids are `highest + 1` (`nodeSeqFor`), so deleting a room and uploading a new one reuses
its id; the texture cache (`tourTex`, keyed `tour/node/variant`) then returned the deleted
room's image for the new upload. `forgetTourNodeTex` now evicts both variants on delete
(`deleteTourNode`) and whenever an id is allocated (room, view and toggle uploads).
`node --check` only. Files: `app.js`.

---

## 2026-09-26 (Add Item → 360° Tour can create a new tour)

Also added a **🧭 Virtual Tour** card to step 1 of ＋ Add Item (and to a folder's inline
＋ menu) — a shortcut to Content Item preset to the 360° Tour type (`presetKind`/choice
`'virtualtour'` → `kind:'child', contentType:'panotour'`), since the tour option one step in
was being missed. Files: `index.html`, `app.js`.

The Add Item wizard's 360° Tour picker only listed existing tours, so adding a second flat
type meant a detour to the Tour tab first. The picker now ends with **＋ Create a new tour**
(`WIZARD_NEW_TOUR` / `createWizardTour`): it adds an empty tour named after the item's title
and selects it; if the item is saved while that option is still selected (the default when a
project has no tours) the tour is created at save time, never stored as a placeholder id.
Panoramas are still uploaded in the Tour tab (the hint says so). Note: the built-in VIRTUAL
TOUR row lists EVERY tour once there are 2+, so one-menu-item-per-flat means one 360° Tour
item per tour. NOT browser-verified (headless Chrome unusable on the loaded machine);
`node --check` only. Files: `app.js`.

---

## 2026-09-26 (Shared hotspots: hide per view, drag per view)

A twin view that isn't the same framing (e.g. the Kitchen's Window View) drew the Kitchen's
exits at the Kitchen's positions, so "Living Room" landed on a wall. The admin can now fix
that per view: the Tour tab hotspot panel lists "Shared from the other state" with a
**Show here** switch per hotspot (`link.hideIn: [nodeId]` — hidden for visitors in that view
only, drawn faded/struck-through in the admin), and a shared hotspot can be dragged in the
viewer to a view-specific spot (`link.pos[nodeId]`) without moving the owner's. Both keys
round-trip through `parseTours`/`buildToursData` and the admin session snapshot (which
previously also dropped `toggle`). New helper `sharedTourLinkIdx`. NOT browser-verified:
headless Chrome would not navigate on the loaded machine; only `node --check` passed.
Files: `app.js`, `styles.css`.

---

## 2026-09-26 (Toggle twins share their room's hotspots; toggle code actually landed)

The 2026-09-25 entry below described the toggle-pair dialog, but that code was never in the
committed tree (only the docs were). It is implemented for real now: `openTogglePairDialog`,
`addTourTogglePair`, `tourGoTo(..., {holdView})`, and `toggle` round-tripped in
`parseTours` / `buildToursData`, plus the `.toggle-dlg-*` styles.

New: flipping a toggle no longer drops the room's other hotspots. Nodes joined by `toggle:true`
links are one spot in two states (`toggleGroupOf`), and `rebuildTourHotspotDOM` draws a twin's
regular (non-toggle) links in every member of the group — e.g. "Kitchen" and "Window view"
stay when curtains go open/closed. A node's own link to a target wins over a twin's; toggle
links themselves are never shared. In the admin's Tour tab shared hotspots are dimmed and
read-only (`is-shared`; edit them on the node that owns them).

Verified headless on a throwaway copy: dialog validation, both directions created, twin shows
the shared hotspot, camera heading unchanged across flips. Files: `app.js`, `styles.css`.

---

## 2026-09-25 (Tour toggle pairs: one setup creates both directions)

`Add hotspot with view` now creates a two-way toggle for alternate panoramas of the same
spot, such as curtains open/closed or lights on/off. The admin dialog collects the second
panorama plus a label for each direction, creates the hidden view, and adds both hotspots at
the current aim point. Toggle links persist as `toggle:true`; client navigation keeps the
camera angle and zoom fixed while crossfading so the change reads as happening in place.

The dialog validates every required field, supports Cancel/backdrop/Escape, and stays open
with a useful error if the panorama cannot be decoded. The existing one-way room hotspot
workflow remains unchanged. Verified with `node --check` and a headless Edge admin flow:
dialog validation, hidden-view creation, view tagging, and zero runtime exceptions.
Files: `app.js`, `styles.css`, `README.md`, `CLAUDE.md`, `VIRTUAL-TOUR.md`.

---

## 2026-09-25 (Hover popup only for filtered plots; click unchanged)

On request: the hover popups were "irritating when the user is exploring the overall layout", so
hover and click are now separate. Click: unchanged — any plot opens its card, filters on or off.
Hover (client): the tooltip — and the hover brightening and drift-hold that go with it — only
shows for plots a filter is colouring (`hover` checks `filtersShowPlot`), so with every filter off
there are no hover popups at all. The admin still hovers every plot. Verified in the Browser pane
(eleganzav2, landscape phone) by sweeping the pointer across the layout: all filters off → 0
tooltips (and a click still opened Plot E3); Available on → 103 tooltips, all Available; Available
+ Sold → 149, Available and Sold only. Files: `app.js`, `CLAUDE.md`, `README.md`.

---

## 2026-09-25 (Every plot clickable whatever the filters; camera holds while a plot's info is open)

On request: "the plots should show the tool tip and be clickable also without the filters … even
if plot numbers are off and filters are off", and "stop camera movement when any plot is clicked"
(the moving view slid the popup off its plot).
- `rayHit` now tests every plot's fill while the plot map is up (the filters only hide the colour
  overlay; three.js raycasting ignores `visible`). `hover` no longer suppresses plots outside the
  size band. The clicked plot gets its selection outline even when the filters hide it
  (`applySelectStyle`), and `restorePlotStyle` hands it back to the filters on deselect
  (`filtersShowPlot`).
- `stopCameraMotion()` on a plot click kills flick inertia and any fly-in; the idle auto-pan is off
  while the popup is open (renderLoop). Dragging still works; the drift resumes after closing.
Verified in the Browser pane (eleganzav2, landscape phone, all filters off, # off): hovering showed
"Plot E3 · Sold · Area … · Dimensions …", clicking opened its card with E3 outlined; a landmark
banner used as a camera probe stayed put across frames with the card open, and moved once it was
closed and the pointer left the plots. Files: `app.js`, `CLAUDE.md`, `README.md`.

---

## 2026-09-25 (Filters off by default; independent toggles; plot numbers independent)

On request: "the filters should be unselected by default — both the size filters and all
availability filters should be off by default." The size filter already started on "All sizes".
A first attempt the same day made the status pills a "show only these" group (nothing pressed =
everything shown, others faded while one was pressed); reported as a bug — the pills looked like
they swapped state. Corrected to what was asked:
- **Available / Reserved / Sold are independent on/off toggles**, all OFF when the client opens:
  each tap flips only its own status; with all off no plot overlay shows (the plain site plan).
  The old reset-to-all when the last one went off is gone. The admin still opens with every
  status on (it needs the plots to align/edit). On = lit pill (gold), off = plain.
- **Plot numbers are independent of the filters**: only a plot's fill + outline follow the
  status/size filters now (`colorPlots` sets `fill.visible`/`line.visible` instead of hiding the
  whole group), so the numbers show or hide with the **#** toggle alone. `rayHit` tests the fill's
  own visibility, so a plot without an overlay still can't be hovered or opened.
Verified in the Browser pane (eleganzav2, landscape phone + admin): all off at load with no
overlays; a scripted sequence of taps changed only the tapped pill each time and ended with all
off → no overlays; with # on and all filters off every plot shows its number, and with only Sold
on the numbers stay on every plot; # off hides them; admin opens with all three on.
Files: `app.js` (`state.activeFilters`, `statusShown`, `toggleFilter`, `colorPlots`, `rayHit`),
`index.html` (pills start `aria-pressed="false"`), `styles.css`, `CLAUDE.md`, `README.md`.

---

## 2026-09-25 (iOS: "shaderSource must be an instance of WebGLShader" — GPU context lost)

Reported from iOS Chrome on re.build91.in (eleganzav2): black pano, grey plots, and the notice
"Argument 1 ('shader') to WebGL2RenderingContext.shaderSource must be an instance of WebGLShader. If
you opened this file directly (file://)…". WebKit throws that when `createShader()` returns null,
i.e. the WebGL context had been lost. Causes and fixes:
- **Textures far too big on iPhones.** They report a 16384 texture limit, so nothing was downscaled:
  the 6144×3072 pano plus the uncapped 7680×5223 site plan came to ~310 MB of GPU memory with
  mipmaps. Phones and tablets now cap every uploaded texture (pano, tour rooms, site plan) at 4096
  (`textureCap`, `MOBILE_TEX_CAP`, `capTextureImage`) → ~105 MB; desktop unchanged.
- **A new WebGL context per texture load.** `gpuMaxTexSize()` opened a probe context every time
  (every tour room/prefetch); WebKit keeps 16 per page and drops the oldest — eventually the main
  renderer. It now asks once per page.
- **A lost context aborted the whole boot** (the first frame renders inside `initThree`), leaving no
  plot statuses, landmarks or tours. The render loop now skips a frame on a lost context and three.js
  rebuilds when it comes back; the visitor gets a plain "ran short of graphics memory" notice (cleared
  on restore); the file:// hint only shows for `file:` pages.
Verified in the Browser pane: phone emulation uploads 4096×2048 + 4096×2786 (desktop still
6144×3072 + 7680×5223); a simulated loss (`WEBGL_lose_context`) shows the notice with no errors and
the view comes back complete on restore, on phone and desktop; walking three tour rooms opens no new
WebGL contexts (it opened one per room before). Not yet tried on the reporting iPhone — the fix
reaches re.build91.in after a re-publish (a phone with a saved offline copy gets it via Update).
Files: `app.js`, `CLAUDE.md`.

---

## 2026-09-25 (Publishing a project without a logo no longer crashes the server)

Found while testing offline saving: `publish_s3._default_icon` (the "B91" home-screen icon for a
project with no logo) measured and drew its text with a TrueType font, and Pillow's FreeType
calls crash Python natively on this machine (Pillow 9.5.0, FreeType 2.13.0 — access violation,
12 runs of 12). Publishing runs in a thread inside `server.py`, so publishing any logo-less
project would have taken the whole local server down; a native crash can't be caught. The
letters are now drawn from rectangles and arcs (`_draw_b91`) at 4× size and scaled down, with no
font at all, so the tile looks the same on every machine too. Verified: the icons at 192, 512 and
512-maskable rendered and checked by eye; 10 of 10 repeated renders and 5 of 5 full publish
preparations (`_collect`, no upload) for a project without a logo file, all clean. Files:
`publish_s3.py`, `CLAUDE.md`.

---

## 2026-09-24 → 25 (Mobile offline rebuilt: strict offline mode, menu-only, file-list updates)

Implements the agreed plan in `MOBILE-OFFLINE.md` (review findings 1, 2, 4, 5, 6, 7, the new 9,
and strict offline mode E; 8 deferred). A saved project now always runs from its saved copy,
like the standalone export, and changes only when the visitor taps Update.

- **One menu row, nothing unasked (9):** "⬇ SAVE FOR OFFLINE" / "⟳ UPDATE OFFLINE COPY" /
  "⟳ UPDATE AVAILABLE" + dot opens the new `#offlinePanel` (save, update, remove, iPhone guide).
  The automatic "Add to Home Screen" banner, its declined/saved `localStorage` flags and
  `SW_VERSION` are gone.
- **Strict offline mode (E, 6):** `sw.js` v50 answers a saved project ONLY from its copy
  (`b91-saved@<scope>:<pid>`, record written last) and injects `window.B91_OFFLINE_COPY` into the
  saved index.html; an unsaved project is plain network, with a "not saved on this device" page
  when there's none. No opportunistic caching, no `skipWaiting` in install, no page reloads except
  after the visitor's own save/update/remove; a waiting new worker is started only by Update.
- **Only changed files (C, D, 5):** a server OFFLINE FILE LIST with sizes + md5s — published demos
  get `offline-files.json` (`publish_s3.offline_list_bytes`, uploaded after everything else,
  `no-cache`); the local server answers `/api/offline-files?project=` (`server.py offline_files`,
  hashes cached by mtime+size). Update downloads only what changed, drops what the project no
  longer uses, and switches app + data + plots.csv over together at the end. The row shows
  "update available" when the list's version moved on (checked when the menu opens). No list
  (old demo, static deploy) → a fallback list from the data walk, downloaded whole.
- **Sheet in the copy (3, 4):** every save/update merges the live Google Sheet into the copy's
  plots.csv (`mergeSheetIntoCsv`, the admin save's "sheet wins" rule; the server file is never
  touched); a saved copy never reads the sheet otherwise and shows "Availability as of …" in the
  plot card and the size-filter menu.
- **Never delete automatically (2):** device test is now `isTouchDevice()` (pointer, not window
  width — tablets included; the brochure's pdf.js path uses it too). The old width check deleted
  downloads on tablets, big phones in landscape, "Desktop site" and admin-on-phone; now only
  "Remove from this device" does, and the desktop clean-up runs only when nothing is saved.
- **Reliable downloads (7):** each file streams through a counting `TransformStream` straight into
  Cache Storage (no whole videos in memory, smooth progress), size-checked against the list, 45s
  stall abort, 3 retries, small files 3-at-a-time then big ones singly, pause while the page is
  hidden / offline and resume, screen wake lock, honest "N of M saved — reason" results.
- **iPhone (1):** in an iOS browser tab the row shows the guide (add to Home Screen → open it
  there → save there); the Home Screen name is the project's brand (`applyBrand` + publish bakes
  `apple-mobile-web-app-title`).
- **Existing downloads kept:** a phone with a completed pre-v50 download is adopted quietly on its
  next online visit (files moved, only the app + data fetched); until then sw.js falls back to
  those caches offline.
- Found and fixed while testing: at the site root the worker also answered page loads for a
  different app in a sub-folder (served a root saved copy there) — it now answers only its own
  app's pages (`isAppPage`) and their requests.
- Verified in the Browser pane with phone emulation, on localhost and on a published folder built
  locally from `publish_s3._collect`: see CLAUDE.md "Current status" for the list. Real iPhone /
  Android devices still to test. Noted, not changed: the eleganzav2 sheet marks 287 plots "Open",
  which isn't a recognised status (they show grey/unknown, online and offline alike).

Files: `sw.js`, `app.js`, `index.html`, `styles.css`, `server.py`, `publish_s3.py`,
`deploy_s3.py`, `manifest.webmanifest`, `MOBILE-OFFLINE.md`, `CLAUDE.md`, `README.md`.

---

## 2026-09-24 (eleganzav2: block B closed up to B1–B110)

On request: the plots numbered B101–B111 were renamed B100–B110 (11 plots), so block B runs
B1–B110 with no gap and there is no B111. Edited `projects/eleganzav2/plots.svg` (polygon id +
label) and `plots.csv` (plot_id) only; shapes and all other data untouched; `alignment.json`
`savedAt` bumped so the files win over any older admin session. Backup in
`projects/eleganzav2/.backup-renumber-20260924-191742/`. Verified: 436/436 plots match the live
sheet exactly, no repeated numbers; the only sheet row with no plot is `B111`.

---

## 2026-09-24 (Test warns when two sheet columns read as the same name)

Reported: "Notes column is added but is not picked up from sheet in admin display". Cause: the
eleganzav2 sheet now has BOTH the new `Notes` column and the original lowercase `notes` (last
column). With case-insensitive headers both read as `notes`, and the right-most — the old one —
wins, so A1 kept showing "Corner plot" instead of "Corner Plot facing the garden". (Dimensions,
added the same way, was picked up fine.) Data fix, on the sheet: delete the old `notes` column.
Code: `parseCSV` split into `csvRows` (raw cells) + `csvColumnKey` (the header normalisation) so
`csvDuplicateColumns` can list header names that collapse to one key; admin **Test** now says
e.g. "2 columns read as “notes” (Notes, notes) — only the right-most is used; delete or rename
the others", and shows ⚠. Verified against the live sheet. Files: `app.js`, `CLAUDE.md`.

---

## 2026-09-24 (Sheet "Dimensions"/"Notes" columns read as text, whatever their capitalisation)

Requested: add "Dimensions" and "Notes" columns to the Google Sheet; whatever string is in them
for a plot takes priority and shows in the plot info. Two things stood in the way:
- **Header case.** `parseCSV` matched column names exactly, so a column headed `Dimensions`
  was ignored (the app reads `dimensions`). Headers are now normalised — lower-cased, spaces/
  hyphens → `_`, a leading byte-order mark dropped — so `Dimensions`, `Notes`, `Plot ID`,
  `Tour URL` all work. Applies to plots.csv too (an Excel "CSV UTF-8" save now loads).
- **Values as strings.** A shared sheet was read through gviz, which guesses one type per
  column and returns the cells that don't fit it as BLANK (a `30x40` in a mostly-numeric column,
  a `100` in a text column). `sheetCsvCandidates` now tries the plain CSV export
  (`/export?format=csv&gid=…`) first — every cell as displayed text — with gviz as fallback.
  Its redirect carries CORS headers on both hops; verified by a real fetch from the page.
With the sheet-wins rule already in place, a sheet Dimensions/Notes value overrides the
admin's for that plot (a blank cell clears it). The plot info card already showed both fields.
Test now also lists the **columns read**. sw.js VERSION v48 → v49.

Verified: eleganzav2's live sheet reads via the export link (Test: 436/436 match, columns
listed); a throwaway project whose data file had `Plot ID,Status,Dimensions,Notes` headers
with a BOM and CRLF loaded `30' x 40' (irregular)` / `100` intact into the editor, `SOLD` as
sold, and the client plot card showed Dimensions and Notes. Throwaway project deleted.

Files: `app.js`, `sw.js`, `README.md`, `CLAUDE.md`.

---

## 2026-09-24 (Plot data: the Google Sheet wins, exact 1-to-1 plot ids, number prefix)

Requested: (1) sheet values take precedence over admin-entered values for conflicting fields;
(2) plot numbers map 1-to-1 to the sheet's `plot_id` — remove the existing mapping logic;
(3) an optional, non-persistent prefix for auto-numbered plots ("A0" → A01, A02 …; change it
and Reset → B01, B02 …), with the full number saved and used for the sheet match. Decided with
the owner: a **blank** sheet cell wins too; admin fields stay **editable** but the sheet
overwrites them on save/reload (with a warning); the prefix is **joined as typed** (A0 + 10 =
A010); new duplicate numbers are **blocked**, existing ones **flagged**.

**Sheet wins** (`applySheetRows`, replacing the 09-18 `plotOverrides` design): for each plot the
sheet lists, every column the sheet has replaces the admin's value, blanks included; other
columns and unlisted plots keep admin data. Applied on load (a restored admin session is now the
BASE, with the sheet on top — it used to overwrite the sheet), when Import & Trace opens, and on
every save (which writes `plots.csv` with the sheet applied and then says "The Google Sheet
replaced N values on M plots"). Editor fields the sheet controls carry a "Sheet" tag that turns
amber ("⚠ Sheet wins on save") once typed over. Removed: `plotOverrides`, `computePlotOverrides`,
`applyPlotOverrides`, `clearedPlotFields`, `OVERRIDE_FIELDS`, `autofillPlotFromSheet`,
`findSheetRowForId`, `SHEET_AUTOFILL_FIELDS`, `_statusTouched`/`_sheetFilled`. An old
`plotOverrides` block is ignored and dropped on the next save — checked on `eleganzav2`: its
`plots.csv` already holds the same values.

**Exact ids:** the plot id IS the plot number — no hidden `Plot-` prefix, no `canonPlotId`
(case-blind, prefix-optional) matching. `indexRows` keys by `plot_id` exactly (trimmed);
`legacyPlotId` strips `Plot-` from our own files on load (plots.svg, plots.csv, session), never
from the sheet. Test now lists matched/total, plot numbers with no row, rows with no plot, and
repeated `plot_id`s. `buildPlotsSVG` now escapes the id/label (numbers are free text).

**Numbering:** Import & Trace has a **Number prefix** field + **Reset** + "Next plot: …".
`nextPlotId` = prefix + lowest free number from 1 (was a fixed `Plot-A101`, `A102` …), so a
new prefix restarts at 1 and deleted numbers are reused. Renaming to a taken number, or one
containing `#` / starting with `Plot-`, is refused. Existing repeats load (tagged `#n`) and
are highlighted with a "⚠ N share a number" count; `retagTracePlots` re-untags a number's first
holder when a repeat is resolved. `finishTrace` now rebuilds each row from the plot object
(`p._row` + edited fields) so a rename can never hand a plot another plot's old row. DXF import
keeps each parcel's own label (duplicates flagged), auto-numbering the unlabelled ones.

**What this means for existing projects:** `malathalli` (sheet ids = its plot numbers) keeps
matching. **`eleganzav2` / `anandman` match nothing**: 436 plots numbered 1–111 per block
(433 share a number) against a sheet of `A101`–`A536` — the same as before, since the old
fuzzy match couldn't join those either; the plots show their saved admin data until the
plots are renumbered to unique numbers and the sheet's `plot_id` column is made to match.

Verified in the admin UI on throwaway copies (deleted afterwards): a malathalli copy with
deliberate conflicts (sheet value beat the admin's facing/status; a blank sheet cell cleared the
admin's tour URL; a plot with no sheet row kept its admin note; `Plot-` ids migrated; 26/30
sheet-controlled); prefix A0 → A01, A02; prefix B0 + Reset → B01; renames to a taken number /
`C#1` refused; renaming to a sheet id pulled that row; typing over a sheet field showed the
warning; Save → notice "replaced 1 value on 1 plot", files with plain ids, sheet values, no
`plotOverrides`; client view boots with correct status counts. An `eleganzav2` data copy showed
"436 plots · ⚠ 433 share a number"; renaming one "2" → A102 took the sheet row, and after Save
the four remaining "2"s each kept their own block/facing/size. sw.js VERSION v47 → v48.

Files: `app.js`, `index.html`, `styles.css`, `sw.js`, `README.md`, `CLAUDE.md`.

---

## 2026-09-24 (☁ Publish to web — one-click S3 demo link per project)

Requested: "the admin can finally upload project to s3 from where it can be shared with client for
demo" (local saving stays as it is). Decisions made with the user up front: a new bucket
`re.build91.in`, one sub-folder per project; a plain public link; each project folder carries its
OWN copy of the app (publishing one never changes another); re-publishing keeps the same link,
plus an Unpublish; anyone in admin may publish, with a password; AWS set up by CLI.

**AWS (created by CLI, ap-south-1 / us-east-1):** private S3 bucket `re.build91.in` (all public
access blocked, SSE-S3) behind CloudFront distribution `ESB5IEEO3UHEP`
(`d9diw1qcxp0ak.cloudfront.net`, alias `re.build91.in`, ACM wildcard cert, HTTPS-only, Origin
Access Control `E24QVDGLP4KG3P`). A CloudFront Function `re-build91-in-folder-index` maps
`/<p>/` → `/<p>/index.html` and redirects `/<p>` → `/<p>/` (query kept). Missing paths answer
404 with `s3-root/_404.html` ("This demo isn't available"); the bare root shows
`s3-root/index.html` (deliberately no project list). The bucket policy lets only this
distribution read, and denies it `*/.b91-publish.json` (the publisher's upload record).
**Outstanding: the DNS record** — `re.build91.in` CNAME → `d9diw1qcxp0ak.cloudfront.net` at the
build91.in DNS provider (not Route 53). Until then the dialog hands out the CloudFront link.

**New `publish_s3.py`** (driven by server.py; boto3): builds `<project>/` = stamped `index.html`
with `window.B91_PUBLISHED={project}` + `noindex` injected, `app.js`, `styles.css`, `sw.js`,
`vendor/` (minus the unminified three.js), generated `icons/` (the project logo letterboxed by
server.py's `_build_icon`, else a gold "B91" tile — the repo has no `icons/` since `*.png` is
git-ignored), a static branded `manifest.webmanifest` (start_url/scope `./`), and
`projects/<project>/` = the data files **plus only the files they reference** (any JSON string
or plots.csv text naming the file). That last rule is deliberate: `sample/` holds personal PDFs
and screen recordings nothing uses, and a published link is public. Uploads are incremental
(md5 + headers vs a per-project record, confirmed against a live listing), 8-way parallel,
content before code and `index.html` last, stale objects deleted, then a `/<project>/*`
invalidation. Content-Type/Cache-Control reuse `deploy_s3.py`'s rules (`stamp_index_text` was
split out of `stamp_index_html` so both stamp identically).

**server.py:** `GET /api/publish/status`, `POST /api/publish` (202 + background job; `{check:true}`
only verifies the password), `GET /api/publish/progress`, `POST /api/unpublish`. Password from
git-ignored `publish.config.json` (constant-time compare, 1 s delay on a miss); AWS credentials
come from the machine's AWS profile and never reach a browser. `_serve_static` refuses to serve
`publish.config.json` under any spelling.

**app.js / index.html / styles.css:** ⋯ → **☁ Publish to web…** dialog (status, link + Copy/Open,
DNS note, password, progress bar, Unpublish with a second-click confirm). Order: password check →
`exportSite()` save → publish → poll. `PUBLISHED` boot flag: fixed project, always view-only
(`?admin` ignored), `setupPwaIdentity` skipped; index.html's boot-image preload honours it.

**Sub-folder fixes (were latent bugs for any sub-path deploy):** sw.js `cacheKeyFor` resolved
relative URLs against the origin root, so a demo at `/<p>/` keyed its whole shell as `/app.js`
etc. and could never find it offline — now resolves against the worker's own URL. The shell cache
is named per scope (`b91-shell@/<p>/:<VERSION>`; unchanged `b91-shell-<VERSION>` at the root) and
the activate sweep only deletes its own scope's old shells — with one global name, one demo
updating would have wiped every other demo's offline shell on the same phone. app.js's desktop
"not eligible" cleanup likewise only removes its own scope's worker/shell/content entries on a
sub-path. sw.js VERSION v46 → v47.

Verified end to end on a throwaway copy of `malathalli` via the real admin UI and the live
CloudFront URL: wrong password refused without saving; publish (28 files, 11.4 MB, stray file
left out); every Content-Type/Cache-Control as designed; `/<p>` 301; unknown path → the 404 page;
demo boots view-only despite `?admin=1&project=sample`, no JS errors; on a phone viewport the
worker registers at `/<p>/`, controls the page, and the scoped shell holds the right keys; desktop
cleanup removed only its own scope (a planted "other demo" cache survived); re-publish uploaded
only 2 changed files and deleted 1 stale one; concurrent publish → 409; Unpublish (API and the
two-click UI) removed all objects and the link fell back to the 404 page. Test project removed
locally and from S3.

Files: `publish_s3.py` (new), `publish.config.example.json` (new), `publish.config.json` (new,
git-ignored), `s3-root/index.html` + `s3-root/_404.html` (new), `server.py`, `deploy_s3.py`,
`app.js`, `index.html`, `styles.css`, `sw.js`, repo `.gitignore`, repo `.claude/launch.json`
(new — the preview tool reads the repo root's), `README.md`, `CLAUDE.md`.

---

## 2026-09-25 (Projects mirrored to S3: Save pushes, opening pulls, with a loading step)

*(Superseded 2026-09-26 — see "Project working files in S3, reworked": downloads now ask first
and can resolve conflicts, uploads are a queue fed only by Save, and the per-request S3 fetch
for missing files is gone.)*

Requested: the admin should work like Publish does for the client — "whenever the admin clicks save
any new assets that is added by the admin is pushed to s3... so when the admin comes and selects
any of the project all the assets of that particular project is directly fetched from s3 so that
the admin dont have to get all the assets in there local system", with everything under one folder
per project inside `ZEROX-PROJECTS-FINAL`.

**assets_s3.py** (new) mirrors a project's SOURCE files — panoramas, plans, renders, videos,
brochures, the JSON the admin edits — to `s3://<bucket>/ZEROX-PROJECTS-FINAL/<project>/`. Distinct
from publish_s3.py, which builds a project's client SITE at the bucket root for share links; this
is the working copy, so a machine is no longer the only place a project exists. Settings come from
the same publish.config.json, so there is one bucket and one AWS login to maintain.
- Uploads are incremental against a manifest kept beside the files (`.b91-assets.json`, md5 +
  size): saving one caption sends one small JSON, not a 200 MB video. Verified: a one-file save
  uploaded 1 and left 6 unchanged.
- **Nothing is ever deleted from S3.** A local folder missing a file — a half-synced machine, a
  partial copy — must not be able to wipe the copy in the cloud. Deletion stays manual.
- `.originals`/`_originals` are excluded: those are pre-compression masters that exist only so a
  local compression can be undone.
- Objects are readable by URL through the bucket's CloudFront domain — the owner chose public over
  a private bucket, knowing originals are then downloadable by anyone with the address.

**server.py**
- `/api/save` fires the mirror in the background and returns as before. Deliberately
  fire-and-forget: the local write has already succeeded, so a slow upload (a fresh 200 MB video)
  or no network at all must not make Save look like it failed. Outcome at `/api/assets/status`.
- Any missing file under `projects/<id>/` is fetched from S3 once, kept, and served — so an
  assetless machine simply works, and the second request is local-disk speed. A file that genuinely
  does not exist still 404s.
- `/api/assets/pull?project=<id>` pre-fetches everything missing, in the background.

**app.js** — the admin runs that pull BEFORE reading the project, and watches it on the boot
curtain that is already on screen: the caption becomes "Fetching this project's files… 0.3 of
0.8 MB" and the existing bar tracks it, capped at 90% so it never sits full while boot still has
work. Nothing is missing on your own machine, so the step reports zero files and shows nothing —
no loader for something that is not happening. Client pages skip it entirely; a failure (no S3, no
network, an older server) drops through to whatever is on disk, as before.

Verified end to end on this machine:
- Migration: 16 projects, 354 files, 1.65 GB into ZEROX-PROJECTS-FINAL; published share links
  untouched (re.build91.in/eleganzav2/ still 200).
- Deleted a project's local folder entirely, then asked the server for three of its files — all
  served from S3 and cached; a full pull then matched the originals 7/7 by md5.
- Deleted `laxmi` locally and opened the admin: the curtain read "Fetching this project's files…
  0.0 → 0.7 of 0.8 MB", boot completed in 5.2s, 9 files restored, all 9 identical to the originals
  by md5. Re-opening the same project with the files present showed no fetch message and booted in
  1.2s.

---

## 2026-09-25 (📌 Landmark markers: drawn where the admin placed them, upright, zoom-responsive)

*(Entry corrected 2026-09-26: it first described the pin-anchored version below, which the owner
then replaced; the bullets now match the code.)*

The feature the owner's boss asked for, settled after several passes against the 3DVista tour the
project is measured by (demo.build91.in/AnandamEleganza). `📌` button in the client control column
(`#steadyLandmarkToggle`), OFF by default, remembered as `b91-steady-landmarks`. While ON
(`state.steadyLandmarks`, `renderLandmarks`/`landmarkZoomScale` in app.js):

- **Drawn exactly where the admin placed it.** Each banner sits at the projection of its authored
  lon/lat, untouched — the vertical pass that clamps banners into the visible band and staggers
  neighbours (recomputed every frame) is skipped entirely, as is the "hide a banner that would be
  half-cut at the screen edge" rule. Accepted cost, by the owner's choice: two landmarks close
  together may overlap, and a banner authored above the visible sky is out of shot.
- **Size follows the zoom**: `clamp(0.85 * tan(70/2) / tan(fov/2), 0.45, 1.5)` of natural size
  (`LM_FIXED_SIZE`/`LM_FIXED_MIN`/`LM_FIXED_MAX`), on every device.
- **One base size on every screen.** The phone stylesheet normally shrinks banner text by device
  (9px landscape phone, 11.5px portrait, 13.5px desktop); `.landmarks.lm-flat` pins the desktop
  sizes everywhere, so only the zoom scales them.
- **Never tilts.** Flat DOM overlays only — every banner's computed transform carries zero rotation
  and zero skew.
- **Flat shadow** (`.landmarks.lm-flat`): the default banner's `0 12px 30px rgba(0,0,0,.7)` is the
  only depth cue against plain sky and reads as a plaque leaning back. Scoped to the toggle, so the
  signed-off default design is untouched.
- **Inside the LANDMARKS section** the control column stays on screen carrying only the 📌 button
  (`.zoom-controls.lm-only`, `isLandmarksSectionActive`) — the view where its effect shows.

Built, measured and then replaced — recorded so it is not rebuilt by accident:
- **Label anchored above its own pin** (`LM_PIN_LIFT`, 26px): pin and label as one short upright
  marker, overlap pass kept. Measured 0px of movement relative to the pin on all 8 eleganzav2
  markers while panning — it did remove the "elongating" gap between a banner and its pin that was
  reported. The owner chose the admin's own placement over it.
- **Labels as real 3D objects** (`vendor/CSS3DRenderer.js`, never committed): reproduced the
  reference's tilt, but CSS perspective stretched anything off-centre — an edge label measured
  4.3x the centre one — and the size could not be derived from the renderer's maths.
- **One fixed pixel size**: ignored the zoom the owner liked.

The measurements above were taken on the pin-anchored version; the shipped behaviour was not
separately measured.

---

## 2026-09-23 (Standalone export: hand the zip to the browser instead of buffering it in memory)

Reported: "I am not able to do export standalone site as before, which used to directly download
the zip file."

What is PROVEN, and what is not, because the difference matters here:
- The server is fine. `/api/export-bundle?project=anadmanv2` returns 200 with
  `Content-Disposition: attachment` and a correct Content-Length, building a 328 MB archive in
  about 7 seconds; curl saves it whole. The access log shows every one of the reporter's attempts
  answered 200. So the failure is on the browser side of that response.
- The browser side could NOT be reproduced here. Every download in a CDP-driven Chrome on this
  machine is cancelled at 0 bytes — including a 5-byte text blob created inside the page, a plain
  same-origin file, and the zip, in both headless and a real visible window, with a genuine user
  gesture and with a short download path. Downloads are blocked in this environment, so no
  browser-side conclusion can be drawn from these runs, and an earlier note here claiming the
  8-second revoke as the confirmed cause was an inference from exactly that artefact.

Change (app.js `exportBundle`), which removes the two real hazards the old path carried regardless:
the archive is no longer fetched through `fetchBlobWithProgress` into a JS Blob and handed over as
a `blob:` URL that the code revoked 8 seconds later. A plain same-origin `<a href="/api/export-
bundle?project=…" download>` now does the work: the browser streams it straight to disk with its
own progress UI, nothing holds 314 MB in memory, and no revoke can pull the URL out from under a
write that takes longer than 8 seconds (which a 314 MB file on a normal disk easily can). The
in-app percentage is gone with it — the browser's download bar replaces it — and the notice now
says the download starts by itself once the server finishes zipping.

Left for the reporter to confirm, since it cannot be tested here: whether the export now works on
their machine, and if not, exactly what Chrome shows (nothing at all / "Failed - Network error" /
a cancelled entry in chrome://downloads). That distinction points at the next place to look.

---

## 2026-09-23 (Plot numbers: one size for all, centred on the plot's area)

Reported with a zoomed screenshot: "look how uneven the plot number and their font size — make
sure it is centered at every plot and their size should be the same". Confirmed first that these
are the app's own labels (the `#` toggle) and not numbers printed into the site-plan artwork, by
shooting the same view with the toggle off and on.

Changes (app.js):
- **Size.** `buildPlotObject` sized each label from ITS OWN plot (`worldDiam * 0.22`), so a big
  corner plot's number was visibly larger than its neighbour's. `rebuildPlots` now measures every
  plot, takes the MEDIAN diameter, and gives every label that one height (`labelWorldH`). Median,
  not mean, so a few odd-shaped slivers can't drag the size for the whole layout — and because it
  is still derived from the project's own plots, a layout of large plots or small ones each get a
  sensible size without any per-project tuning.
- **Centring.** The label sat at the average of the polygon's CORNERS, which is only the middle for
  an evenly-sampled shape: a plot carrying extra vertices along one edge (a kink in a road
  boundary, a traced curve) pulled its number towards that edge. It now uses the polygon's AREA
  centroid (`plotAreaCentroid`, shoelace), falling back to the corner average for a degenerate
  ring. Named apart from the trace tool's existing `polyCentroid` — which IS the corner average and
  is left alone. (Adding a second function under that name was my first attempt and broke boot
  outright with "Identifier 'polyCentroid' has already been declared"; caught by capturing the
  page's exceptions after a screenshot showed the loader stuck at 0%.)

Verified headless on anadmanv2 at 1280x800 (2x DPR), labels on, zoomed in: numbers 1-29 across
several blocks all render at the same glyph size, each sitting in the middle of its plot.

Known limit, stated rather than discovered later: with one shared size, a project mixing very
large and very small plots will have the number look tight inside its smallest plots. Nothing in
anandman or anadmanv2 comes close to that, and the alternative is the raggedness just fixed.

---

## 2026-09-23 (Size filter ANDs with the status filter; out-of-band plots carry no overlay)

Requested: with a size band picked, matching plots take the band's colour and everything else was
faded back. "Don't dim those available plots which don't come in that size bracket — keep the
colour which is of the plot and treat it as any other plot."

Change (app.js, `plotBaseStyle`): the non-matching branch now returns exactly what the no-filter
branch returns — the plot's own available/reserved/sold colour at the normal overlay opacity and
line strength. A band therefore only ADDS its colour to the plots inside it; it takes nothing away
from the rest. `AREA_DIM` and `isAreaDimmed` stay: the constant is now unused by the painting
path, and the predicate still marks out-of-band plots so they keep their resting look on hover and
show no tooltip — both asked for separately (2026-09-14/18) and untouched here.

Verified headless on anadmanv2 at 1280x800, camera parked on the home view (the ⊡ recenter button)
before each screenshot so the frames line up — without that the idle auto-pan moves the map
between shots and any pixel comparison is meaningless. Measuring how much of the map still carries
strong plot colour with "Type 1 (1800-2142 sq.ft)" applied:

| | strong plot colour |
|---|---|
| band applied, OLD code (dimming) | 8.3% |
| band applied, NEW code | 19.7% |
| no filter at all (reference) | 19.4% |

i.e. the map with a band applied now reads exactly as it does unfiltered, except for the matched
plots wearing the band's colour.

**Follow-up, same day — that was still wrong.** Shown a screenshot of the undimmed result: "these
green plots should not be seen, there should be an AND between the filters not OR". Keeping the
status colour on out-of-band plots still answers "available" about a plot of the wrong size. The
two filters are now ANDed properly:
- `colorPlots` sets `group.visible = activeFilters.has(status) && (!band || plotMatchesAreaFilter)`,
  so a plot that fails EITHER filter carries no overlay at all and the site plan's own artwork
  shows through. Hiding the group also removes it from hit-testing — `pick()` already filters on
  `m.parent.visible` — so those plots can't be hovered or opened, matching the tooltip rule that
  was already in place for them.
- `applyData` counts the status pills within the band too (and `setAreaFilter` now calls
  applyData, not just colorPlots, so they refresh when the band changes). "Available 333" next to
  twenty-odd visible plots was answering a question nobody asked.

Verified headless on anadmanv2, camera parked on the home view for both shots, picking
"Type 1 (1800-2142 sq.ft)": the pills went 333/63/40 -> 18/1/2, and of every pixel that was green
(available) with no filter, 93.6% now shows the bare plan, 5.5% is repainted in the band's colour
and 0.9% is anti-aliasing noise. That 5.5% matches the pill count independently: 18 of 333
available plots = 5.4%.

---

## 2026-09-23 (anadmanv2: assets compressed — first visit 32.6 MB -> 10.4 MB)

Asked to make everything load faster in the anadmanv2 project "without losing much quality".
Originals are kept in `projects/anadmanv2/.originals/compress-2026-09-23/` (git-ignored), so any
step here can be undone by copying a file back.

What the FIRST VISIT has to download before the map is usable, measured in a clean browser profile
against a copy of the project with the original files (`zbefore`, deleted afterwards):

| | before | after |
|---|---|---|
| total first visit | 32.64 MB | 10.43 MB |
| at 4 Mbps | ~65s | ~21s |
| site plan | 23.21 MB | 5.04 MB |
| 360 background | 3.86 MB | 2.52 MB |
| audio | 4.07 MB | 1.78 MB |
| loading image | 0.96 MB | 0.55 MB |

- **Site plan** `Final (2).web.webp`: lossless WebP -> quality 92, SAME 7680x5223 pixels. Measured
  as the app composites it (over the page background, which is the only way the comparison means
  anything — in the fully transparent areas the RGB of a lossy WebP is free to be anything):
  mean error 1.08/255, PSNR 39.0 dB, and the alpha channel came back bit-identical (max shift 0),
  so the transparent surround still masks exactly the same pixels. q88 and q95 were measured too
  (4.27 MB / 38.6 dB and 5.93 MB / 39.8 dB); q92 is the knee.
- **Photographs** (29 files, including a 6000x4500 39 MB `FOOT BALL GROUND.jpg`): capped at 1600px
  on the long edge at quality 82, progressive — the same setting anandman's amenity renders already
  use, and still above the ~1200px these are ever displayed at. 47.7 MB saved in this pass alone.
- **360 background** `Commercial.web.webp`: 8192 -> 6144 wide at q90. Phones cap textures at 4096
  and were downscaling it on arrival anyway, so most of those bytes reached nobody's screen.
- **Audio**: 256 kbps -> 112 kbps MP3 (4.07 -> 1.78 MB). It is background music behind a UI, and
  it now sits on the boot path (it was deliberately moved there so the loading bar covers it).
- **Tour minimap** `tour-t20-map.web.png`: 256-colour palette, 1.21 -> 0.24 MB. A flat graphic, so
  the palette is exact for practical purposes.
- **Videos (65 MB + 26 MB): NOT re-encoded.** x264 preset slow at CRF 26 — chosen after measuring
  a 12s sample at CRF 26/28/30 (PSNR 40.2 / 38.7 dB) — produced only 62 -> 56 MB and 25 -> 23 MB on
  the full files: the sources are already efficiently encoded, so it was a real quality loss for
  ~10%. Both were instead REMUXED with `-movflags +faststart` (stream copy, zero quality change):
  the moov atom now sits at byte 36 instead of after the media, so playback starts as soon as the
  first chunk arrives rather than after a long prefetch. A 720p variant would halve them if the
  owner ever wants that trade.
- **Brochure PDF (4.1 MB)**: left alone. It is on-demand only, already named "compressed", and no
  PDF-capable tool (ghostscript/pikepdf/pymupdf) is installed here to rebuild it honestly.

Verified after the change: the client renders the plan, plot colours, amenities and landmarks
correctly (screenshot), and no request failed.

---

## 2026-09-23 (Offline: download as often as you like; bottom controls survive fullscreen)

Two reports from phones.

**1. A second download was refused.** The "⬇ SAVE FOR OFFLINE" row added earlier today answered
"Already saved for offline use — all N files are on this device" and stopped there when nothing was
missing. A visitor tapping it again is usually trying to REPAIR a copy that is misbehaving offline,
so that was a dead end. maybeOfferOfflineSave now treats a menu-driven request with everything
present as a refresh: the banner opens, says "Already saved — fetch all N files again (approx. X)",
and the button re-fetches the whole list. Tapping "Not now" on a banner the visitor opened
themselves also no longer writes the declined flag — that flag is for the AUTOMATIC offer, and
recording it there would silence the offer for good on the strength of second thoughts.

**2. The bottom strip vanished after fullscreen.** The drawer footer, the zoom column and the
offline banner are anchored to the bottom of the body grid, whose height was `100dvh`. Entering or
leaving fullscreen changes the window by the height of the browser chrome, and `dvh` does not
reliably settle during that transition, leaving the grid taller or shorter than the window with its
bottom row off-screen — which fits the "sometimes" in the report. The height is now a measured
pixel value, `--app-h`, written by `syncViewportHeight()` from `window.innerHeight` (100dvh remains
the fallback) and re-applied on resize, orientationchange and fullscreenchange (including the
webkit-prefixed event), plus at +60/200/500ms after those, because Android reports the new size in
stages. `onResize()` rides along so the WebGL canvas follows the same box.

Verified headless at 800x380, anandman/laxmi:
- Viewport 380 → 440 → 380 (what fullscreen does to a phone window): `--app-h` and the body box
  tracked every step, and the zoom column, drawer and offline banner all stayed inside the window
  at every size. NOTE: the original disappearance did not reproduce in headless — the emulated
  resize was already handled by dvh there — so this fixes the mechanism that best explains it
  rather than a reproduction; worth a check on the reporter's phone.
- laxmi (859 KB of assets): tapped the menu row, downloaded (19 files cached), tapped the row a
  SECOND time — the banner opened again, the progress bar ran, and the download completed. Before
  this change the second tap only produced the "already saved" notice.

---

## 2026-09-23 (Fix: the layout drifted by itself while pinch-zooming on a phone)

Reported: "for the mobile users when they are zooming in the aerial view the layout is shifting or
drifting slightly automatically... it should work the same way as the desktop version."

Cause: the idle auto-pan (stepViewMotion's caller, 2.2s after `state.lastUserTouch`) was only ever
held off by `pointerdown` and `wheel` — the two events wired to `touch()` in wireViewControls. A
pinch fires `pointerdown` once and then nothing but `pointermove`, so any pinch lasting longer than
2.2s had the camera start sweeping underneath the gesture. Desktop never showed it because every
wheel notch bumps the timer.

Changes (app.js, the #pano pointer handlers):
- Any `pointermove` with at least one pointer down bumps `lastUserTouch`, as does every
  `pointerup`/`pointercancel`. A gesture in progress now counts as activity, whatever kind it is.
- A pinch also sets `didMove`, so lifting the fingers can't be mistaken for a tap on a plot.
- Lifting ONE finger of a pinch re-anchors `panStart` to the finger still down (and clears the
  flick). It was left pointing at where the FIRST finger landed, so the next move jumped the view
  by everything that had happened since.

Verified headless at 800x380 with real touch events, anandman: a ~6s two-finger pinch left the
compass heading bit-identical (`rotate(-142.72 60 60)` before and after), while an untouched
5s control drifted ~9° — so the probe does see drift. With the one-line bump disabled as a negative
control, the same pinch drifted ~11° mid-gesture, i.e. exactly the reported behaviour.

---

## 2026-09-23 (The "names without points" amenity combination is no longer offered)

Requested with a screenshot of amenity names floating over the plan: "lets not allow the user to
set this combination which is lolypop off and building on". With 📍 off and 🏛 on, each amenity
name hung in the air with nothing tying it to a place.

Rather than disabling a button (a tap that does nothing reads as broken, and 🏛 also carries the
landmarks), each button drags the other along:
- 📍 off → amenity names go off with it. Landmarks are deliberately NOT touched: they are the
  other half of 🏛's job, and hiding them from the points button would be a surprise.
- 🏛 on → points come back on, so the names have their pins beneath them.
- A browser that stored the forbidden pair under an older build is corrected at boot, so nobody is
  left looking at a layout the buttons can no longer produce.

Verified headless on anandman: 📍 off → names 0, points 0; 🏛 on → both back at 11; the same from
the other direction; and with `b91-show-amenity-points=0` + `b91-show-amenities=1` forced into
localStorage, the next load came up with both off and rewrote the stored pair.

---

## 2026-09-23 (Two plots may share a number; the duplicate no longer renders white)

Reported with the site plan: every sector restarts its numbering at 1, so "1" exists in Sector A
and again in Sector B. Renaming a plot to a number already in use changed the label but left the
plot WHITE.

Cause. The id is the key for everything: `state.plots`, `state.rows`, `labelCache`, the SVG export.
`rebuildPlots` does `state.plots.set(g.id, o)` per polygon, so the second plot with an existing id
REPLACED the first one's entry — while the first polygon's mesh stayed in the three.js scene.
Orphaned: `colorPlots`/`applyData` iterate the Map, so it was never recoloured (keeping
buildPlotObject's blank material), never filtered and never selectable.

Changes (app.js):
- Ids stay unique, labels do not. A clash gets an invisible tag — "Plot-1", "Plot-1#2" — added by
  the new `uniquePlotId()`, and `plotNumber()` strips it (and the "Plot-" prefix) at every point a
  plot is SHOWN: the 3D label sprites, the plot popover title, the trace canvas labels, media
  titles, the admin's number box and the exported SVG's `<text>`. Both duplicates therefore read
  "1" on screen while the app can still tell them apart.
- `uniquePlotId` is applied wherever an id is minted, not just on rename: `addPlot` (re-tracing a
  saved layout that already contains a duplicate) and the auto-trace label import (two polygons
  labelled "1" must not collapse into one).
- `canonPlotId` drops the tag too, so "Plot-1#2" still matches a sheet row for plot 1.
- `indexRows` gives the second polygon its own COPY of that sheet row. They shared one object
  before, so applyPlotOverrides writing to one would silently rewrite the other, and `r.plot_id`
  could only name one of them. Each duplicate now carries its own status, price and media, and the
  admin's edits (keyed by the unique id) stay independent.

Follow-up the same day: the reporter's plot was STILL white, because their duplicate had been
saved before any of the above existed — anandman's plots.svg genuinely holds two polygons with
`id="Plot-A1"`. uniquePlotId only guards ids as they are minted, so the stored clash came straight
back on load. `dedupeGeomIds()` now re-tags repeats wherever geometry is read — loadGeometry
(plots.svg) and the admin session restore — keeping order and leaving the FIRST holder of a number
on the untagged id so data keyed to it still matches.

Verified headless on a throwaway copy of anandman whose plots.svg was edited to hold two polygons
under one id (exactly the reported state): the legend counted 436 of 436 polygons; with
dedupeGeomIds disabled as a control, the same project counted 434 — the orphaned polygon (plus one
plot that has no data at all in this project, which pre-dates all of this) missing from every
status, i.e. the white plot.

Also verified on a throwaway copy of anandman (deleted afterwards): renamed the second plot in
the list to the first one's number — both boxes then read "A2", and the saved plots.svg holds
`id="Plot-A2"` and `id="Plot-A2#2"` with both `<text>` labels reading "A2". On the client, legend
totals stayed at 435 of 436 polygons, exactly matching an untouched copy of the same project
(that one uncoloured plot pre-dates this change), i.e. the duplicate is coloured like any other
plot rather than dropping out as white.

---

## 2026-09-23 (🏛 now switches landmarks off with the amenity names)

Requested: "when the client clicks this [🏛] the amenities along with landmark should be
disabled". The building button was amenity NAMES only; landmarks had no control at all.

Changes (app.js):
- The 🏛 handler sets `state.showLandmarks` alongside `state.showAmenities` (persisted as
  `b91-show-landmarks`) and calls applyLandmarkVisibility; its title/aria-label now read
  "Hide/Show amenity names & landmarks". 📍 (amenity points) is untouched and still independent.
- `applyLandmarkVisibility` honours the flag: `hidden = tourView || (!showLandmarks && !editing)`.
  The `!editing` part matters — hiding the layer while the admin is placing landmark pins on it
  would make that tab unusable.
- Removed the unconditional `state.showLandmarks = true` from `applyCategoryFilter`. It is not
  only called by a visitor picking a category: renderLandmarkCategoryNav re-applies the current
  filter once landmark data has loaded, ~4s into a client boot, so it silently undid the saved OFF
  state on every reload — caught by tracing the layer's `hidden` attribute across a reload
  (`start hidden=false → 749ms hidden=true → 3936ms hidden=false`). The force now lives in
  `showLandmarksForSection()`, called from the two places a visitor actually asks for landmarks
  (the category buttons and openLandmarksCategoryPicker), and it also writes the preference, so
  the button and the screen never disagree.

Verified headless on anandman at 1280x800: 🏛 off → landmark layer hidden, amenity names 0,
amenity POINTS still 11 (the other button is unaffected); reload → still off (this is what the
applyCategoryFilter fix bought); opening LANDMARKS → banners back on screen; 🏛 on → names and
landmarks both back. The button is deliberately not reachable inside the LANDMARKS section itself,
where the plot-map controls are hidden by the 2026-09-14 change.

---

## 2026-09-23 (Fix: clearing a plot field in the admin did nothing on the client)

Reported with two screenshots: plot A101's note "Corner plot" was deleted in the admin, the admin
card showed it gone, the save succeeded — and the client still showed "Corner plot".

Cause. anandman's plot data comes from a live Google Sheet (alignment.json `data.source = "sheet"`),
and admin edits are stored as per-field OVERRIDES on top of it (computePlotOverrides diffs the
admin's rows against the sheet at save time). The old rule was "a blank is never recorded": `""`
could not be told apart from "never filled in", so recording it might let an untouched empty field
mask a real sheet value. The consequence was that DELETING a value could not be expressed at all —
no override was written, and the client, re-reading the sheet (which still says "Corner plot" for
A101 — verified by fetching the sheet's CSV export), put the note straight back. The admin looked
right only because its own in-memory row really was blank.

Changes (app.js):
- `computePlotOverrides` records a blank when — and only when — that field was deliberately
  emptied: `mine !== theirs && (mine || state.clearedPlotFields.has(`${id}|${k}`))`.
- `state.clearedPlotFields` is the new set of `plotId|field` marks. The plot editor's text inputs
  add a mark when they are typed empty and drop it as soon as anything is typed back.
  This is what stops the obvious foot-gun: without it, an admin tab opened BEFORE the sheet gained
  a value would see `mine = ""` vs `theirs = "value"` on every such plot and record the whole lot
  as cleared on its next save, blanking them for the client all at once.
- `applyPlotOverrides` re-arms a mark for every override loaded as `""`, so a clear that was saved
  in an earlier session is written out again by the next save instead of being dropped as an
  ordinary empty field (which would hand the plot back to the sheet).
- `parseAlignment` keeps `""` values for OVERRIDE_FIELDS instead of stripping them on the way in —
  stripping them there would have undone the fix on the very next load.

Known and accepted consequence, stated rather than hidden: once a field has been cleared this way,
a value LATER added to that sheet cell stays invisible on the client until the admin edits that
field again. That is the documented precedence (admin edits outrank the live sheet — see loadData);
the alternative is an edit that silently does nothing, which is the bug being fixed.

Second half of the same bug, found while testing the first: `autofillPlotFromSheet` fills any
field the plot "doesn't already have a value for" straight from the sheet. A cleared field IS
empty, so opening the plot editor again quietly put "Corner plot" back — the clear looked like it
had never happened, and the next save would have recorded the sheet's text as if the admin had
typed it. Autofill now skips fields carrying a clear mark. (The admin panel the report came from
showed the note gone only because that session's own row was blank in memory.)

Verified end-to-end on a throwaway copy of anandman (projects/ztestnote, deleted afterwards),
driving the real admin UI headlessly, in two separate browser sessions:
1. Opened A101's editor — notes read "Corner plot" (the sheet's value, autofilled) — emptied the
   field, committed with "Use these plots →", pressed Save. The written alignment.json holds
   `"Plot-A101": {..., "notes": ""}`, the ONLY blank among all 437 overrides (no mass-blanking).
2. Fresh browser, fresh session, reopened the same editor: notes read "" — the sheet no longer
   overwrites the clear — and the file still holds exactly that one blank.
An earlier round-trip check also confirmed that simply reopening the admin and pressing Save,
with no edits at all, leaves the cleared note cleared (parseAlignment keeps the "" on the way in,
applyPlotOverrides re-arms its mark, computePlotOverrides writes it out again).

---

## 2026-09-23 (A permanent "SAVE FOR OFFLINE" row in the client menu)

Reported: the offline download offer no longer appears for mobile visitors.

Cause — not a regression, a one-way door by design. The offer is shown once by
maybeOfferOfflineSave, and "Not now" writes `b91-offline-declined-<SW_VERSION>-<project>`, which is
checked before anything else. SW_VERSION (app.js) is the key's version and was meant to be bumped
with sw.js's own VERSION so a dismissal expires — it has sat at 'v12' while sw.js reached v46, so
no dismissal has ever expired. A phone that tapped "Not now" once could not reach the download
again by any route in the app. Confirmed both ways: a brand-new phone profile against the live
CloudFront build was offered the download after 17s, so the feature itself works.

Asked which behaviour was wanted (re-offer once / re-offer on new content / expire after 14 days /
a permanent button); the answer was the permanent button.

Changes:
- `renderClientSidebar` appends "⬇ SAVE FOR OFFLINE" to the root menu, guarded by the new
  `offlineSaveRowAvailable()`: client only, phone only, and only in a service-worker-capable secure
  context — the exact conditions registerOfflineSupport itself requires, so the row never appears
  where tapping it could do nothing. It is a synthetic row (`data-node-id="__offline_save__"`,
  handled in wireClientSidebarButtons next to `__exit_tour__`), NOT a builtin menu node: no admin
  surface, no menu-tree migration, nothing written into any project's saved config.
- `maybeOfferOfflineSave({ force })` ignores the remembered "Not now"/"already saved" answers when
  it comes from that row, and with nothing left to fetch says "Already saved for offline use — all
  N files are on this device" instead of opening a banner whose buttons have no work to do.
  Offline at the time, it says to reconnect rather than failing silently.
- The banner opens immediately on the tap, reading "Checking what is already saved…", because the
  probe of every asset plus the size estimate measured ~12s on anandman — the row looked dead for
  that whole time in the first test of it.
- `.cat-btn-util` in styles.css: hairline rule above, quieter and slightly smaller than the
  project's own rows — a utility, not one of the client's sections (same reasoning as `.cat-keep`).

Verified headless, anandman: at 800x380 the row is present and a real dispatched TAP (not .click())
brought the offer up in 0.7s; at 1400x900 the row is absent; a reload with the row present still
suppresses the automatic banner, i.e. the remembered dismissal is still respected everywhere else.

NOT changed, still true and worth deciding on separately: SW_VERSION remains 'v12', so dismissals
still never expire on their own, and content added after a visitor's download is only re-offered
because countMissingOfflineAssets notices it is missing.

---

## 2026-09-23 (Landmark banners: zoom-responsive on phones, and never below their own pin)

Reported with a landscape-phone screenshot of the AERIAL view: "Raipur - Bilaspur Highway" sat
low, in front of the plots, its leader line running UP to a pin above it.

Cause: the 2026-09-22 vertical clamp. A banner is authored high in the sky; on a short phone
screen that sky is off-screen, so the clamp lowered the banner to `safe.top` (just under the
fixed filter/status pills) — which on the aerial view is well BELOW the landmark's own pin, i.e.
on top of the site plan. Visible-but-wrong instead of the earlier invisible.

Changes (app.js `renderLandmarks`, styles.css):
- A banner is now confined to the band between `safe.top` and its own pin
  (`floor = min(H - 8, hp.y - 6) - h`): the initial clamp, the overlap search and the downward
  fallback all respect it. Nothing can land in front of the plots any more. A landmark with no
  sky at all above its pin drops its banner and keeps the gold pin, rather than covering the
  layout — the user asked for the label to behave, not to be shown at any cost.
- Phone banners are zoom-responsive, the same idea as `amenityScale` and requested in the same
  words: `landmarkZoomScale()` = `clamp(70 / fov, 0.72, 1.15)` on phones only, published as
  `--lm-z` on the `.landmarks` layer and multiplied into each banner's own transform as
  `scale(calc(var(--lm-s, 1) * var(--lm-z, 1)))`. Zoomed out to the whole site the labels shrink
  to ~0.72 (74x28px, measured), so more of them fit the thin strip of sky and they stop blanketing
  the layout; zoomed in they return to full size and a little past it. Desktop stays at 1 — it has
  the height, and the desktop banners were signed off as they are.
- `--lm-z` is registered with `inherits: true` (it is set on the layer, read by the banners) and
  is deliberately NOT transitioned: it changes every zoom frame, and easing it would leave the
  collision boxes — measured from the live size — a step behind what is on screen.
- The stacking maths now measures the SCALED banner size, or the gaps between stacked labels
  would be wrong at any zoom factor other than 1.

- Follow-up the same day, reported with a second screenshot: a dropped banner left its PIN behind
  as a bare white dot in the sky, with nothing to explain it and not even at the landmark's real
  place (it only shows the direction). The pin is now hidden with its banner — a landmark shows
  as a labelled banner or not at all.

Verified headless at 800x380 (landscape phone), anandman: 18 frames across three zoom levels and
six tilt steps of the aerial view — 0 labels below their pin, 0 off-screen, 0 under the pills,
0 pins without a label, up to 7 labels on screen at once; a negative control with the pin-hide
line removed flagged 3-4 lone pins over the same sweep, so the check does bite; the landmarks view still shows its banners in the sky as before;
`--lm-z` measured 0.72 zoomed out and 1.15 zoomed in. sw.js VERSION -> v46.

---

## 2026-09-22 (Fix: landmark banners thrown to the top-left corner when a category is selected)

Reported (desktop AND mobile, on the tunnel in incognito): in the landmarks view the lines rose
from the pins to nothing and Suyash Hospital's banner sat jammed in the top-left corner.

Cause — introduced earlier the same day by the anti-shimmer change, which moved banners from
left/top to an inline `transform: translate3d(...) translate(-50%, -50%)`. styles.css had
`.lm-banner.is-cat-matched { transform: scale(1.08) !important }` (and `.is-dimmed` a
`transform: scale(0.9)` with a transform transition). Harmless while position was left/top; once
position lived in `transform`, the !important rule replaced it wholesale, so every banner of the
SELECTED category landed at left:0/top:0. The earlier tests only ever checked "All landmarks",
never a single category, so they missed it.

Fix: the highlight's size is a custom property, `--lm-s` (0.9 dimmed, 1.08 matched), multiplied
into the positioning transform by renderLandmarks — `... translate(-50%, -50%) scale(var(--lm-s, 1))`.
No stylesheet rule sets `transform` on a banner any more. `--lm-s` is registered with @property so
the size still animates; the position is never transitioned (a transform transition would make
banners trail behind the moving view).

Verified in a real browser (CDP), anandman, 1907x940 desktop and 800x380 phone: aerial near the
horizon, LANDMARKS (ALL), ALL with the menu collapsed, and the HEALTHCARE and EDUCATION categories
— every visible banner on screen, not under the menu strip or pills, not overlapping, and centred
on its own line's end (0 detached, 0 in the corner). Negative control: re-injecting the old
`is-cat-matched` rule into the page reproduces the report exactly (HEALTHCARE: 2 of 2 banners in
the corner, detached from their lines, under the menu strip).

SW v45. Files: `app.js`, `styles.css`, `sw.js`.

---
## 2026-09-22 (Mobile: landmark banners kept on screen and apart; readable amenity names; save guard)

Reported with a landscape-phone screenshot: landmark lines ran up off the top of the screen to
nothing, and the one visible banner sat half under the menu strip. Asked to fix mobile layout
generally.

**Landmark banners** (`renderLandmarks`, all screen sizes). Banners are authored high in the sky;
on a short landscape phone that sky is cut off, so they sat above the top edge. Now, per frame:
- `landmarkSafeArea` measures what's free: clear of the client menu strip on the left and of the
  pill row pinned along the top on a phone (measured by bounding box — `offsetParent`, used at
  first, is always null for position:fixed, so the pills were never seen and a banner slid under
  the Filter pill).
- Horizontally unchanged in spirit: never dragged sideways; one that won't fit (now also counting
  the menu strip) is hidden.
- Vertically, highest first: a banner above the safe top is lowered to just inside it, straight
  above its pin; a banner that would overlap one already placed moves up past it, or down if
  there's no room up. Banners already clear on screen aren't moved; lines follow.

**Amenity names on phones**: the phone stylesheet shrinks labels to ~8.5px and the zoom scale
(pixels-per-degree) read a phone's short screen as "zoomed far out", so the two stacked to ~4px.
On a phone the scale now follows fov only, clamped 0.9–1.3. Desktop unchanged.

**Server save guard** (server.py, local): `prefer_webp_ground_image` now decides by CONTENT — a
`<name>.webp.source.json` records the SHA-1 of the PNG the WebP was made from — because a stale
admin tab re-sends the same PNG with every save, making it the NEWER file and defeating the
time-based rule. `/api/save` now writes alignment.json last so the check sees any PNG from the
same save. Tested: same PNG re-sent -> WebP; no PNG in the save -> WebP; a different PNG -> PNG.

Verified in a real browser (CDP), anandman: 800x380 landscape phone, aerial view tilted to the
horizon — 7 banners, 0 above the top, 0 cut at an edge, 0 under the menu strip, 0 under the top
pills, 0 overlapping (was 8 overlapping pairs and all above the top); LANDMARKS section 5 banners,
all clean; 1280x800 desktop both views clean. Phone amenity names 7.9px at the opening view, 7.7px
fully zoomed out (were ~4px). Amenity card, tour room with isometric, and room list checked by
screenshot at phone size.

SW v44. Files: `app.js`, `server.py`, `sw.js`; anandman `Final (2).web.webp.source.json`.

---
## 2026-09-22 (Area filter: own dropdown menu — gold hover border instead of the browser's blue)

Requested: hovering an option in the "Filter: All sizes" dropdown should not turn it blue, just
add a gold border. The native <select> popup is drawn by the browser/OS and ignores CSS for
hover, so this can't be styled — the popup is replaced.

- The <select> stays in the DOM, hidden (`display:none`), as the single source of truth: every
  existing read/write of `sel.value` / `sel.hidden` / `.is-hidden` and its 'change' listener
  (`setAreaFilter`) is unchanged. `syncAreaTrigger` puts a <button> right after it that copies its
  classes — so all existing pill styles and show/hide rules apply unchanged — and mirrors its
  label, band tint and visibility. It follows the desktop select when renderLegend re-parents it.
- `openAreaMenu`: a fixed-position listbox under the pill (kept on screen, flips up if needed),
  each option in its band colour; hover and keyboard focus share one look — a 2px gold inset
  border with a soft gold glow; the current choice is ticked. Arrow keys / Home / End / Enter /
  Space / Esc / Tab; outside click and resize close it; hiding the filter closes it.
- Side effect: band colours now show on iOS too (its native picker ignored them).
- The pill's label gets a fixed max-width (170px; 100px in the landscape-phone top row): a
  percentage cap resolved against the button's own content width and truncated "Filter: All
  sizes" with room to spare.

Verified in a real browser (CDP) on anandman with real mouse and keyboard input: native select
not shown; menu lists All sizes / Type 1 (pink) / Type 2 (salmon); hovering Type 1 keeps its pink
and computes `rgb(212,175,55) 0 0 0 2px inset` + a gold glow; clicking it closes the menu, tints
the pill and sets the filter; Enter opens on the current choice, ArrowUp moves, Enter picks, Esc
closes; on an 800x380 landscape phone the menu stays fully on screen; the label is untruncated
on both.

SW v43. Files: `app.js`, `styles.css`, `sw.js`.

---
## 2026-09-22 (Faster loading: lossless site plan, real caching, 304s, first tour warmed)

Requested: cut loading time wherever possible without lowering quality.

Measured first (anandman): the loading screen waited on a **38.5 MB PNG** site plan
(`Final (2).web.png`, 7680x5223 RGBA); the client fetched the pano, the site plan and every tour
room with `cache: 'no-store'` (tours also with a `?v=Date.now()` bust), so they were re-downloaded
in full on EVERY visit; server.py never answered a conditional GET with 304; and nothing touched
a tour until the visitor tapped it.

- **Site plan -> lossless WebP**: 38.5 MB -> 23.2 MB (40% smaller). Verified: alpha channel
  identical and every visible pixel identical (only the invisible colour under fully transparent
  pixels — 60% of this image — is discarded). New file `Final (2).web.webp`; anandman's
  alignment.json points at it (savedAt bumped so an older admin session can't win over it); the
  PNG is left in place as a fallback.
- **Caching**: `fetchBlobWithProgress(url, onBytes, { fresh })` — admin stays `no-store`; the
  client now fetches VERSIONED URLs (`?v=<alignment savedAt>` for pano / site plan; tours already
  carried `?v=<tour.json savedAt>`) with normal caching, so an unchanged file comes from the
  browser / service worker / CDN or a 304, and an admin change still produces a new URL.
  `loadPanoTexture` keeps its cache-bust for the admin only.
- **server.py 304s**: `If-Modified-Since` on a static file now returns 304 with no body.
- **First tour warmed**: `warmFirstTourRoom()` — after boot, once idle (~1.5s + idle callback),
  downloads (bytes only; no decode, no GPU memory) the room VIRTUAL TOUR opens first. Client only;
  skipped on Save-Data / 2G and if a tour is already open.

Measured in a real browser (CDP), anandman at 4 MB/s, fresh profile, old code vs new:
- First visit, loading screen gone: 13.6s -> 10.5s; downloaded 47.9 MB -> 32.6 MB.
- First tap on VIRTUAL TOUR, room on screen: 4.7s -> 2.3s; downloaded at the tap 17.4 MB -> 0.
- Second visit, loading screen gone: 14.5s -> 2.3s; downloaded 46.7 MB -> 0.3 MB. server.log
  confirms: the new second visit got 304s for the site plan, pano and audio; the old one
  re-downloaded the 38.5 MB PNG, the pano and the audio in full.

Not changed: tour panoramas (79 MB of 8K JPEGs) — no lossless JPEG optimiser is available here,
and re-encoding would cost quality. Site-plan uploads in the admin are still stored as uploaded.

SW v42. Files: `app.js`, `server.py`, `sw.js`; anandman `alignment.json` + `Final (2).web.webp`.

---
## 2026-09-22 (Amenity card / viewer never flash the previous amenity's picture; lighter renders)

Reported: tapping an amenity first shows the LAST amenity's image, then switches to the right one.

Cause: the card's single <img> is reused; setting a new `src` leaves the previous picture on
screen until the new one has downloaded and decoded (~1 MB each). The full-size viewer
(`updateGallerySlide`) had the same flaw by design — it kept the old picture at 30% while the new
one loaded — plus a race: a slower, earlier load could land last and overwrite the one asked for.

- `setCardImage` (card, used by openAmCard and openLmCard): hides the old picture the moment
  another is requested (`.am-card-thumb.is-loading`: image transparent, gold spinner, min height),
  reveals the new one on load; a token stops a stale load from un-hiding a card that has moved on.
- Viewer: a fresh `openClientGalleryModal` clears the previous picture and shows the spinner;
  `galleryImgToken` makes only the latest request able to land. Slide-to-slide fading inside a
  gallery is unchanged.
- Render uploads (landmark + amenity) now 1600px / 82% (`RENDER_CAP` / `RENDER_QUALITY`), were
  2000px / 90%.
- anandman's 11 amenity images re-encoded from their originals at 1600px / 80% progressive, same
  filenames: 9.2 MB -> 5.2 MB (44% smaller, ~0.3–0.6 MB each). Originals kept in
  `projects/anandman/.originals/amenity-renders-2026-09-22/` (git-ignored, not deployed).

Verified in a real browser (CDP) on anandman with real taps: card opened on Multipurpose Play
Court (1600px compressed image), then Mandir on a throttled network — the picture slot showed
only the spinner for 2.3s, then Mandir, never the previous picture; the viewer opened on Mandir,
then on Multipurpose Play Court showed that image straight away, never Mandir's.

Noticed, not changed: at the opening view Gym's and Club House's pins sit under a neighbouring
name, so a tap there hits the neighbour's label instead.

SW v41. Files: `app.js`, `styles.css`, `sw.js`; anandman amenity images.

---
## 2026-09-22 (Background music downloads during the loading screen)

Reported: the audio arrives long after the website has loaded. Asked for it to be part of the
first-visit loading time.

Cause: `<audio id="siteAudio" preload="none">` pointed at the file's URL, and browsers refuse
sound before a first tap — so the 4 MB track (anandman `audio.mp3`) only started downloading on
that tap and played after a visible delay.

- Boot (client only; not admin, which never auto-plays; not a file:// bundle) now downloads the
  track with `fetchBlobWithProgress` in the same `Promise.all` as the pano and ground image, so
  the loading screen waits for it and the progress bar counts it (the 90 points are split
  equally between whatever actually needs downloading). It then plays from an in-memory object
  URL (`state.audio.preloadedUrl`, preferred by `siteAudioSrc`).
- While that download runs, `startSiteAudio` does nothing (`state.audio.preloading`), so the
  element can't start a second, streaming download of the same file; boot calls
  `applySiteAudio()` again when it lands. A tap made during loading has already given the page
  the activation play() needs. A failed download falls back to streaming, as before.
- A preloaded (blob:) source sets `preload="auto"` so it's decoded before the first tap.
- `fetchBlobWithProgress` now keeps the response's content type on the Blob (an untyped audio
  blob can be refused by Safari).
- The offline precache list uses the file's real URL for the music, not `siteAudioSrc()`, which
  now returns the blob: URL.

Trade-off: the loading screen stays up until the track has arrived too — on a slow connection,
roughly the time the extra 4 MB takes, since it shares bandwidth with the pano.

Verified in a real browser (CDP) on anandman at ~1 MB/s with the normal user-gesture autoplay
policy: audio.mp3 was downloaded exactly once, during the loading screen (1.2s -> 13.1s, in
parallel with the pano), before the screen lifted; the element's source is the blob; with the
network then switched OFF, a real tap started the music 226 ms later (760 ms before the
preload=auto change).

SW v40. Files: `app.js`, `sw.js`.

---
## 2026-09-22 (Amenity and landmark markers moved by transform, to stop them shaking on auto-rotate)

Reported: amenity pointers vibrate in place while the view auto-rotates.

Cause (by inspection): markers were repositioned every frame with `left`/`top`. That re-lays them
out and paints them snapped to whole pixels — the pin and the label inside a marker each snapping
on their own — so during a slow rotation they tick between pixels at different moments and
shimmer against the ground and each other. The fractional zoom scale added the same day
(`--am-s`) makes the label re-rasterise at a slightly different sub-pixel offset every frame,
which likely made it more visible. The render loop order was checked and is fine (camera ->
render -> DOM markers from the same camera), so this is not a frame of lag.

Fix: `renderAmenities` sets `transform: translate3d(x, y, 0) scale(var(--am-s))` on the marker
(left/top pinned at 0, `will-change: transform`), so it moves as one composited layer with
sub-pixel precision. Landmark pins and banners were positioned the same way and get the same
treatment (`translate3d(...)`, the banner keeping its own `translate(-50%, -50%)` centring).
Nothing read those left/top values back.

NOT verified to make a visible difference. Screenshot bursts around a pin in headless Chrome
(software GL), both during real auto-rotate and with the view stepped deterministically, showed
no difference outside the test's own noise (the painted-centroid measurement wobbles ~±0.4px as
the photo behind the pin shifts) — before 4 backward steps / mean error 0.59px, after 2 / 0.48px
under auto-rotate; indistinguishable when stepped. Needs checking by eye on a real GPU.

SW v39. Files: `app.js`, `styles.css`, `sw.js`.

---
## 2026-09-22 (Amenity markers: shrink further, never hide any)

Feedback on the entry below: don't hide any amenities — just make the markers smaller when
zoomed out, since they're clearly visible there.

- Declutter removed entirely (`.is-collapsed`, the overlap pass and its CSS). Every amenity is
  always drawn.
- Scale range widened to 0.5–1.1 with the 1:1 reference at 12 px/deg, which also puts the opening
  view back at ~1.0 (the previous version showed it 15% larger).

Verified in a real browser (CDP) on anandman, 1280x800: opening view 0.995 (pin 14px, label
12.4px), all 11 shown; zoomed fully out 0.556 (pin 8px, label 7px), all 11 shown; zoomed in 1.1
(pin 15px, label 13.8px).

SW v38. Files: `app.js`, `styles.css`, `sw.js`.

---
## 2026-09-22 (Zoom-responsive amenity markers + declutter)

Reported: zoomed out, the amenity markers pile on top of each other. Asked for them to shrink
when zoomed out (while staying readable) and grow the pointer sensibly when zoomed in.

- **Scale** (`amenityScale`): pixels-per-degree of view (`H / fov`) against a 1:1 reference of
  10, clamped to 0.74–1.15. It follows zoom AND screen size (a phone sits nearer the minimum).
  Applied as `--am-s` on the layer; `.am-marker` scales about its own point, so pin and chip
  shrink/grow around the amenity's exact spot. 0.74 keeps the label at ~9.3px.
- **Declutter**: a marker whose name would overlap one already placed collapses to its gold dot
  (`.is-collapsed`). Hovering the dot shows the name; tapping still opens the card. Names come
  back as zooming in makes room. Placement order = the admin's amenity order with the selected
  one first, so the same names win every frame (no flicker while panning). Chip sizes are measured
  once per chip (`amChipSize`), not every frame.
- Off in the admin's Amenities tab (scale 1, nothing collapsed — every marker must stay
  draggable) and when names are switched off.

Verified in a real browser (CDP) on anandman, 1280x800: opening view scale 1.15, 10 names + 1
dot, 0 overlaps; zoomed fully out scale 0.74, label 9.3px, 6 names + 5 dots, 0 overlapping names
(measured from the rendered chip boxes); hovering a collapsed dot ("Kids Play Area") showed its
name and a real click opened its card; zoomed in scale 1.15, all names, 0 overlaps.

SW v37. Files: `app.js`, `styles.css`, `sw.js`.

---
## 2026-09-22 (Tour entry: the last screen fades under the spinner instead of a black screen)

Requested: keep the spinner, but instead of a black screen while a tour loads, keep the screen the
visitor was on, fading, with the loading animation on top.

- The plot-map takeover is now `applyTourTakeover()`. A tour-to-tour switch still applies it at
  once; a FRESH entry defers it to the handoff in `tourGoTo`, so the plot map (plots, landmarks,
  amenities) stays on screen while the first room downloads.
- Loader modes: `immediate` (entry, or a tap made before tours loaded) is a 60% dim over the live
  current screen with the bare spinner + "Loading …"; the delayed light veil for slow room moves
  is unchanged. At the handoff `tourLoaderToDark()` dips to dark for 260ms (TOUR_DIP_MS), the
  takeover and the camera snap happen unseen, then the veil fades out into the room.
- The tour's isometric minimap now appears at the handoff (`renderClientTourMap` also requires
  `body.tour-open`), not over the loading plot map.

Verified in a real browser (CDP) on anandman, throttled to ~300 KB/s, tapping before tour.json had
arrived: veil `fading` "Loading tour…" with the plot map and landmarks still shown; plot map kept
through the whole download; then dark -> plot map hidden -> veil off into the Mandir room. A
tour-to-tour switch (GYM) still works.

SW v36. Files: `app.js`, `styles.css`, `sw.js`.

---
## 2026-09-22 (Tour loading: fade + spinner instead of a "random" screen; early taps wait for tours)

Reported: the first time a virtual tour opens, the screen shows "something random"; wanted a
fading transition with a loading animation for tour loads, without touching the site's own
loading screen (#bootCurtain — unchanged).

**Cause.** Entering a tour hides the plot map at once, but the first room's panorama is still
downloading — so the visitor saw the bare drone photo with nothing on it, then a hard cut.

**Tour loading veil** (`showTourLoader` / `hideTourLoader`, built on demand inside #pano):
- Entering a tour: solid dark veil with a gold spinner and "Loading <room>…" appears at once;
  the room is swapped in underneath and the veil fades out (0.46s, same as the room crossfade).
- Room / tour switch, view hotspot, furnished-unfurnished swap: a light veil + spinner over the
  current room, but only if the download takes longer than 180ms, so cached moves (the usual
  case, thanks to neighbour prefetch) never flicker. It lifts right before the crossfade.
- Always cleared on error, on exiting mid-load, and on tour exit.

**Early taps.** The loading screen lifts before tours are loaded (anandman fetches its Google
Sheet first; tour.json arrived 5.2s after the screen lifted in testing), so tapping VIRTUAL TOUR in
that window said "This project has no virtual tours yet". Tour menu taps now wait on
`toursReady` behind the solid veil ("Loading tour…") and proceed once tours arrive; a boot failure
releases them too.

Verified in a real browser (CDP) on anandman's client with the network throttled to ~300 KB/s:
an early tap showed "Loading tour…" (no false notice), then "Loading mandir_front_view…", then
faded into the room; a slow room move traced the veil 0 -> 1 after the delay, held at 1, then
faded to 0 after load; switching to MODERN VILLA and moving to Kitchen showed "Loading 4.Living
Room…" / "Loading 9.Kitchen…"; moving back to the cached Living Room never showed the veil.

SW v35. Files: `app.js`, `styles.css`, `sw.js`.

---
## 2026-09-22 (Names off = just the gold amenity dot)

Requested: with 🏛 names off, don't keep the building-icon badge — leave only the gold pin dot.
`.amenities.names-off .am-chip { display: none }` replaces the shrink-to-icon-badge rule. The dot
(`.am-pin`) already takes pointer events, so tapping it still opens the amenity card.

Verified in a real browser (CDP) on anandman: names off -> 11 dots, 0 icons, 0 names, 0 chips;
a real mouse click on a dot (through #pano's capture and pick()) opened that amenity's card
("Seating Area"). Landmarks unaffected.

SW v34. Files: `styles.css`, `sw.js`.

---
## 2026-09-22 (Correction: 📍 = amenity POINTS, 🏛 = amenity NAMES; landmarks untouched)

Clarified after the entry below, which had it wrong: both buttons are AMENITY controls. 📍 shows
or hides each amenity's point (pin + icon); 🏛 shows or hides its name. Landmarks are not
controlled by either button and always show pins, banners and lines again.

- The 📍 button is now `#amenityPointToggle` (was `#landmarkToggle`), with its own state
  `state.showAmenityPoints` and a NEW localStorage key `b91-show-amenity-points` — deliberately not
  the old `b91-show-landmarks`, so a visitor who had once hidden landmarks doesn't open to find
  amenity points hidden.
- `applyAmenityVisibility` sets `.points-off` / `.names-off` independently. One off shrinks the
  chip to what's left (round icon badge, or the name alone — pointer tail removed); both off hides
  the marker and closes any open amenity card. Admin's Amenities tab always shows both.
- `applyLandmarkVisibility` no longer has a toggle; the landmark `.names-off` styles are removed.

Verified in a real browser (CDP) on anandman's client, all four combinations, 11 amenities and
the landmarks in frame: on/on 11 pins·11 names; points off 0·11; both off 0·0 (markers gone);
names off 11·0; back on 11·11 — landmark pins, names and lines shown throughout.

SW v33. Files: `app.js`, `index.html`, `styles.css`, `sw.js`.

---
## 2026-09-22 (📍 / 🏛 buttons hide the NAMES, keep the points)

Reported: "these two buttons aren't working — the use case was to keep the points but hide the
names." They did work, but did something else: each hid its whole layer, pins included. (In the
admin's Landmarks/Amenities tab the layer is forced on for editing, so there they appeared to
do nothing at all.)

Now `state.showLandmarks` / `state.showAmenities` mean "show NAMES" and toggle a `.names-off`
class; the layers themselves are always shown (except inside a tour, now guarded explicitly by
`state.tourView` since the layer no longer hides itself). Landmarks keep their pin and lose the
banner + connector line; amenities keep pin + icon and lose the text, the chip shrinking to a
round icon badge. Names always show in the admin's editing tab (that's where banners are
dragged). The 🏛 button no longer closes an open amenity card — the point is still there. Button
titles/labels now read "Hide/Show landmark names" etc. Each visitor's choice is still remembered
(same localStorage keys, so a visitor who had hidden a layer now gets its names hidden instead).

Verified in a real browser (CDP) on anandman's client, with the view tilted so landmarks were in
frame: 📍 -> landmark pins 5 stay, names 5 -> 0, lines hidden; 🏛 -> amenity pins/icons 11 stay,
names 11 -> 0; clicking both again restores all names.

SW v32. Files: `app.js`, `styles.css`, `sw.js`.

---
## 2026-09-22 ("Add hotspot with view" — renamed, and fixed: the button did nothing)

Requested: rename "＋ Add view here (upload pano)" to "＋ Add hotspot with view", make it work,
and make the hotspot it creates identical to one from "＋ Add hotspot here" — the only difference
being that the admin uploads the panorama it opens, and that panorama is not listed in the menu.

**Why it did nothing.** The button clicked a hidden `<input type=file>` declared in index.html.
server.py served `/` (the app's real entry URL, `/?project=…`) through the base class's directory
handler, which sent no Cache-Control, so browsers cached the page heuristically; app.js is always
fetched fresh (`?v=` busted). A fresh app.js against a stale page meant the button existed but its
input didn't — `els.axTourViewFile?.click()` on null, silently. `/index.html` was already
`no-cache`; only `/` wasn't.

Fixed twice over:
- server.py serves a `/`-terminated directory's index.html through `_serve_static`, so it gets the
  same `Cache-Control: no-cache`.
- `pickFile(accept, onFile)` builds the file input on the spot. The view upload, the unfurnished
  upload and the menu-image upload all use it, and their three static inputs (plus `els` refs and
  change listeners) are gone from index.html, so a cached page can never strand them again.

The view's hotspot now uses the same default marker as a normal hotspot (was the ring), and gets
the same row of controls.

Verified by driving a real headless Chrome over CDP against the admin (not the iframe harness,
which is what hung before): Tour tab -> open room -> the real button click (as a user gesture)
opened a file chooser -> file supplied -> a view owned by Living Room was created, with a hotspot
from Living Room using the default marker; its admin row has label, target (shown as
"↳ … (view)"), marker, aim and delete; the hotspot is drawn in the room; the room list shows the
view indented under Living Room.

SW v31. Files: `app.js`, `index.html`, `server.py`, `sw.js`.

---
## 2026-09-22 (Fix: admin loaded a stale session instead of the project)

Reported: "admin panel is not loaded, but the client link is working". The admin showed scale
1.00 / rotate 0 / "Using the default panorama" / uncoloured plots, while anandman's
alignment.json on disk has scale 0.64, rotation 180 and its own panorama.

Cause: on load the admin restores the newer of its working SESSION (IndexedDB) and DRAFT
(localStorage) over the committed files. Both are a single slot per browser shared by every
project, and neither recorded which project it came from — so a session saved at 10:50 today
(default placement, no panorama) beat the file saved yesterday and replaced the whole project in
the admin. The client never reads sessions, which is why it was unaffected. How that snapshot
was produced isn't certain (a Reset, or a load while WebGL was down would both fit); the bug is
that any snapshot could override any project.

Fix: `buildSession` and the draft now carry `projectId: BOOT_PROJECT`, and `belongsToThisProject`
gates both restores. A snapshot from another project, or an unstamped one from before this
change, is ignored rather than trusted — so the stale one here stops applying on the next reload
with no manual step. Checked by running the real `belongsToThisProject`/`readDraft` against
unstamped, other-project and same-project snapshots.

Side effect: unsaved (never-Saved) admin work sitting in a pre-fix session will not be restored
on its next reload. Saved work is unaffected — it lives in the project files.

SW v30. Files: `app.js`, `sw.js`.

---
## 2026-09-22 (Tour VIEWS: panoramas reached only through a hotspot)

Requested: a second kind of tour hotspot that swaps to a panorama which is NOT a room — e.g.
"Curtains Close" (same room, curtains drawn) or "Window View" (a close-up) — and so must not
appear in the menu's room list or on the isometric.

Built as a node flagged `isView: true` with `viewOf` = the node it opens from, rather than a
picture hung off the hotspot: a view needs a start angle, its own hotspots (the way back is one)
and optionally its own unfurnished render, all of which a node already has. Loading, crossfade,
cache, save, export and offline precache therefore need no changes.

Decisions (from the request): the admin places and names the return hotspot themselves (no
automatic back button); each view has its own start view, set like any room; views can carry an
unfurnished render; views can open further views.

**Client.** Views are excluded from the drawer's room list and the room-choice count. While in a
view, "you are here" stays on the owning room (`owningRoomId` walks `viewOf` up, cycle-guarded):
menu highlight and minimap dot. The view cone is hidden in a view — a view is its own panorama
with its own lon 0, so aiming the room's cone from it would point arbitrarily. Tapping the
owning room in the menu always leaves a view, so a visitor can't get stuck even without a return
hotspot.

**Admin.** "＋ Add view here (upload pano)" beside "＋ Add hotspot here": uploads the panorama,
creates the view owned by the room open in the viewer, and drops a ring-marker hotspot to it at
the centre of the current view. Views list indented under their room with ↳ instead of the start
star (a tour can't start in one — also enforced in `parseTours`). Hotspot target dropdowns label
views "↳ name (view)". Isometric editor and placed-counts list rooms only. Deleting a room
deletes its views, their views, and every link and map dot touching them.

Verified in a browser (client, real render pixels) on a throwaway tour with a room, a view and a
nested view: room list shows only the two rooms; entering Curtains Close and then Window View
swaps the pano while the menu and minimap stay on Living Room with the cone hidden; the admin's
"Curtains Open" hotspot returns; the menu room row leaves a view; save round-trips
`isView`/`viewOf`. Admin logic (ordering, nested ownership, cycle guard, cascade delete) verified
by running the real functions in Node — the admin page itself hangs inside the headless test
harness even on the pre-change code, so its rendering and the upload flow were not exercised.

SW v29. Files: `app.js`, `index.html`, `styles.css`, `sw.js`.

---
## 2026-09-21 (New builtin: MENU IMAGE — a picture drawn inside the menu, e.g. a QR code)

Requested: show an image in the client menu under CONTACT US (a QR code), managed from admin
like AERIAL VIEW / LANDMARKS / VIRTUAL TOUR, with an on/off switch — the difference being that
the image is DISPLAYED rather than tapped.

Added as a fourth builtin, `menuimage`, so it inherits the whole builtin mechanism: drag to
reorder, rename, ON/OFF switch, no delete, self-heal if removed. Two things are its own:
- It self-heals in at the END of the tree (`BUILTIN_DEFS.menuimage.atEnd`), not the top, since
  it was asked for as the last item.
- It is the only builtin with content. Stored as an ordinary `kind:'child'` node with
  `content.fileName` / `fileBlob`, which means save, export, the offline precache walk and the
  standalone bundle already handle its image with no new code.

**Client.** `renderClientSidebar` draws `.cat-menu-img` in place of a `.cat-btn`, at both root
and submenu level, wherever the item sits. `pointer-events: none` so it can never read as
tappable; white backing + padding so a trimmed or transparent QR stays scannable; height-capped
(190px, 92px on a short landscape phone) so a big upload can't stretch the drawer. With no
image uploaded it renders nothing rather than an empty frame. Excluded from
`computeAutoOpenTarget` — it is not a destination and must never become the default screen by
sitting on top.

**Admin.** The expanded builtin row carries an upload slot with a preview, Replace and Remove.
Saved as PNG (not JPEG): a QR is hard-edged black-and-white, exactly what JPEG smears, and a
smeared QR can stop scanning. `collectCustomMenuFiles` now maps png/jpg/webp to real image
mime types instead of octet-stream.

Verified in a browser on a throwaway project: menu renders AERIAL VIEW, LANDMARKS, VIRTUAL
TOUR, CONTACT US, [IMAGE] with the image last; it loads (300x300 -> 190x190 rendered), is not
a button, computes `pointer-events: none` so a tap at its centre passes through to the nav
behind it, and it does not hijack the default screen.

SW v28. Files: `app.js`, `index.html`, `styles.css`, `sw.js`.

---
## 2026-09-21 (Fix: the version toggle was dead to real taps)

Reported twice — "it is not switching", then "why is the unfurnished button not getting
clicked". Root cause: `.tour-variants` lives inside `#pano`, which calls `setPointerCapture`
on pointerdown, so a real tap's `click` is retargeted to #pano and the button's own listener
never runs. This is the documented trap every other in-pano control already works around —
amenity pins, tour hotspots, and the minimap's dots/switch/hide are all hit-tested in `pick()`
for exactly this reason. The toggle was not, so it was dead to mouse and touch alike.

Fixed by adding a `.tour-variant-btn` branch to `pick()`, before the minimap buttons. The
`click` listener stays for keyboard Enter/Space, matching how `.tour-map-switch` is wired.

**Why the previous verification missed it:** the browser test drove the buttons with
`el.click()`, which dispatches a synthetic click straight at the element and bypasses the
pointer pipeline — the one thing that was broken. The test now sends real pointerdown/pointerup
at the button's coordinates (`realTap`) and would have failed on the old build. Re-verified end
to end by sampling rendered pano pixels: tap Unfurnished -> rgb(30,90,160) becomes
rgb(200,70,20); tap Furnished -> back; walking rooms while unfurnished arrives in the
unfurnished render; and in a single-render room the tap explains itself and keeps the choice.

SW v27. Files: `app.js`, `sw.js`.

---
## 2026-09-21 (Variant toggle: same crossfade as rooms; dead tap now explains itself)

Reported: "clicking unfurnished is not switching", plus a request that the swap fade the same
way room-to-room moves do.

- **Crossfade unified.** The variant swap ran its own 300ms tween against the room move's
  460ms. Both now call one `tourCrossfade(tex)` helper (`TOUR_FADE_MS`), so they are identical
  and cannot drift apart again.
- **The dead tap.** A room with only one render dimmed the other side with the `disabled`
  PROPERTY, and a disabled button swallows its click — so tapping it did nothing at all, with
  no explanation. That is the reported symptom whenever the visitor is standing in a room that
  has no second render. Now dimmed via `aria-disabled` + `.is-unavailable`, stays clickable,
  and says which room is missing which version. The chosen version is still NOT changed, so it
  resumes in the next room that has both.
- `renderTourVariantBar()` also runs in `tourGoTo`'s `finally`, so a throw mid-move can't
  leave a stale available/unavailable state on the bar.

Verified in a browser by sampling the rendered pano texture's pixels (not just DOM state) on a
throwaway 3-room project: furnished rgb(30,90,160) -> unfurnished rgb(200,70,20) -> back again;
walking rooms while unfurnished arrives in the unfurnished render; and in the single-render
room the tap now produces "4.Living Room has no unfurnished version - showing the furnished
one instead." with the texture unchanged and the choice kept.

SW v26. Files: `app.js`, `styles.css`, `sw.js`.

---
## 2026-09-21 (Virtual tour: furnished / unfurnished room versions)

Requested: let a visitor switch between a furnished and an unfurnished render of the same
room, keep that choice as they walk from room to room, and make the second render optional
per room. Built as a VARIANT ON THE NODE rather than a parallel set of rooms, so hotspots,
isometric dots, view cones and start views are authored once and cannot drift apart.

**Data** (all optional; every tour saved before this reads back unchanged, one variant, no
toggle). Slots are named `a`/`b`, not furnished/unfurnished, because the LABELS are editable:
- `node.panoAlt` (+ `panoAltBlob`, `_urlAlt`) — the second render. `node.pano` is slot A.
- `tour.variantLabels` — `['Furnished','Unfurnished']` by default, omitted from tour.json
  while unchanged.
- `link.variant` — `null` (both) | `'a'` | `'b'`, for a hotspot that only means something in
  one render (the reference tour's "close the curtains").

**Client.** Toggle bar top-centre (`#tourVariants`), shown only when some room in the open
tour has both. `state.tourView.variant` persists room to room and resets to `a` on entering
any tour. A room with one render falls back at RENDER time (`nodeVariantFor`) without writing
back to the choice, so it resumes in the next room that has both — and its missing button is
disabled in place, not removed, so the bar never jumps. Swapping crossfades at the same camera
angle (300ms, vs 460ms room-to-room) so the furniture appears to materialise. `tourKey` now
includes the variant; prefetch warms only the current one.

**Admin.** Each node row gained a ＋ to add/remove the second render; the tour gained two
label inputs; each hotspot gained a "show in" picker (only once the tour has two versions).

Also updated so the feature survives a round trip: session snapshot, `tourNodeBlobFiles`
(save + export), the offline precache list, and `server.py`'s `tour_pano_basenames`
(bundle export).

Verified in a browser against a throwaway 3-room project (two rooms with both renders, one
with only the furnished): labels render, toggle flips, the furnished-only hotspot disappears
in unfurnished, and walking into the single-render room leaves the choice selected but
disabled. Caught in that pass: the toggle was first wired in `wireAdmin()`, which returns
early for a client — the buttons were dead for every visitor. Moved to `wireViewControls()`.

SW v25. Files: `app.js`, `index.html`, `styles.css`, `sw.js`, `server.py`.

---
## 2026-09-21 (Minimap toggle shows just the map icon)

Requested: the minimap open/close button should look like the plain map icon and toggle the
isometric open/closed. It already toggled (`toggleTourMapHidden`), but a specificity clash
(`.tour-map-hide svg` vs bare `.tm-ico-*`) showed the eye-slash AND map icons stacked. Now only
the map icon shows, in both states. CSS only; SW v24. Files: `styles.css`, `sw.js`.

---

## 2026-09-21 (Admin: − / + to aim each room's view cone)

Requested: in the tour-map editor, let the admin set the direction the minimap's "shadow"
(view cone) points, with + and − beside each room. Each placed room row now has − / + buttons
that turn its `rot` by 15° (Shift = 5°) via `setTourMapPointRot`; the row shows the current
angle instead of "placed". Same value the drag handle edits, so it saves with the tour and is
what the client cone starts from. SW v23. Files: `app.js`, `styles.css`, `sw.js`.

---

## 2026-09-21 (Area filter moves to the top pill row on phones)

Requested: on mobile the "Filter: All sizes" dropdown sits to the LEFT of Sold in the top row.
`#areaFilterSelMobile` moved into `#zoomStatusGroup` (index.html) so it docks with the pills;
CSS `order` puts it leftmost in the landscape row and first in the desktop column. SW v22.
Files: `index.html`, `styles.css`, `sw.js`.

---

## 2026-09-21 (Client header removed; filters and status pills join the right-hand column)

Requested: no header on the client. The topbar (brand + legend + area filter) is collapsed at
every size (was landscape-phone only) and the area filter + Available/Reserved/Sold pills show
in the `.zoom-controls` column above the icon buttons. Landscape phones keep their existing
docking (pills top-right by the compass). Admin keeps its header. CSS only; SW v21.
Files: `styles.css`, `sw.js`.

---

## 2026-09-21 (Hide plot-map controls outside the aerial view)

Requested: in a tour the # / landmark / amenity / zoom / recenter column (plot-map tools) was
still showing and overlapping the minimap's buttons. `updateLegendVisibility` now also hides
`.zoom-controls` (client only) whenever `isAerialSectionActive()` is false, i.e. in a tour,
landmark picker or sub-menu. Admin unchanged. SW v20. Files: `app.js`, `styles.css`, `sw.js`.

---

## 2026-09-21 (No hover tooltip on plots outside the area filter)

Requested: with a size band picked, hovering a plot that is NOT in the band no longer shows
its plot number / info card (or hover highlight). `hover()` treats dimmed plots
(`isAreaDimmed`) as no hit on the client; admin is unchanged. SW v19.
Files: `app.js`, `sw.js`.

---

## 2026-09-21 (Menu videos open full screen)

Requested: a video picked from the menu should play full screen with a × to go back.
`#clientVideoModal` (CSS only) now fills the viewport on black, player `object-fit: contain`,
title bar collapsed to a floating gradient with a round × top-right (same `[data-close]`
button, so close/stop-playback is unchanged). Other modals untouched. SW v18.
Files: `styles.css`, `sw.js`.

---

## 2026-09-21 (Area filter dropdown wears the band colours)

Requested: the area-filter dropdown options should use the colour the admin set for each band
(the colour its plots wear on the layout). `renderAreaFilterUI` now sets each `<option>`'s
background to `f.color` with a luminance-picked text colour, and `tintAreaSelect` tints the
closed select to the picked band (reset on "All sizes"). Native option backgrounds work on
desktop and Android Chrome/Edge; iOS Safari ignores them. SW v17. Files: `app.js`, `sw.js`.

---

## 2026-09-21 (Larger isometric minimap on mobile, controls moved off the map)

Requested: the tour's isometric minimap was too small for phone users, and a screenshot
showed the hide + switch buttons sitting ON the map's corner, covering dots and each other.
- Controls (hide / switch / position pips) now sit BELOW the map on phones instead of over
  its bottom-right corner (`bottom` negative). Dots' %-positions are unaffected.
- Landscape phone (`max-height: 500px`): width cap `min(140px, 26vw)` -> `min(300px, 44vw)`,
  height cap `24vh` -> `46vh`, dots 10px -> 12px, buttons 28px.
- Portrait phone (new `max-width: 600px` block): width cap `min(340px, 74vw)` (was the
  desktop `34vw`), height cap `40vh`, dots 16px, buttons 34px.
- `sw.js` VERSION v12 -> v14 so installed phones drop the cached stylesheet.

- Follow-up: tour controls nudged up (now ~30px below the map instead of ~42px; pips
  re-aligned). `.zoom-controls` gets `align-items: flex-end` so the # / landmark / amenity /
  zoom buttons share the area-filter pill's right edge instead of hugging its left (was only
  fixed for landscape). SW v15.
- Real cause of the landscape misalignment (SW v16): the landscape `.zoom-controls` rule uses
  `flex-wrap: wrap-reverse`, which flips the cross axis, so its `align-items: flex-end` meant
  LEFT. Changed to `flex-start` (= right under wrap-reverse).

Files: `styles.css`, `sw.js`.

---

## 2026-09-18 (Fix: switching isometrics showed nothing)

Reported immediately after the feature below shipped. Two independent causes, either of
which produces the same "the isometric is not visible" symptom:

**1. The visibility gate required the ACTIVE map to have dots.** `renderClientTourMap`
computed `show` from `(map.points || []).length` — correct while a tour had exactly one
map (a lone dot-less map does nothing), but with several it meant switching to a
just-added isometric the admin hadn't placed dots on yet hid the ENTIRE minimap — switch
button included, so there was no way to switch back. Now gated on the TOUR having at least
one map with dots (`maps.some(...)`), so an unplaced map still displays; it just draws no
dots until dots are placed. A tour whose maps are ALL unplaced still shows nothing, which
preserves the original intent.

**2. The flip revealed an image that hadn't downloaded.** `switchTourMap` swapped `src` and
rotated back in the same tick. An isometric is a ~1–2MB PNG that isn't in cache the first
time it's shown, so the reveal landed on a blank `<img>`. It now preloads the next image
**in parallel with** the 220ms rotation and reveals only once BOTH are done — so a cached
image costs nothing extra, while a cold one waits. Guarded three ways: `onerror` counts as
"ready" (a broken image must not wedge the flip), a 1500ms hard cap reveals regardless
rather than leaving the map stranded edge-on/invisible on a slow network, and a
`tourMapFlipping` flag ignores taps mid-flip instead of stacking overlapping flips.
Exiting the tour mid-flip is handled too — the pending timer outlives the tour, so `commit`
clears the class and flag BEFORE bailing on the index write, or the next tour would open to
a minimap stuck edge-on and permanently un-switchable.

Verified with a Node simulation of the real commit-gating across four scenarios: a cached
image reveals at ~224ms (the turn is the limit, no added latency), a 600ms image waits for
the image not just the turn, a never-loading image is rescued by the cap at ~1500ms, and a
mid-flip tour exit neither crashes nor leaves the flag/class set. Also re-verified the
visibility gate directly: active-map-with-dots shows, active-map-without-dots now ALSO
shows (the bug), a tour with no dots anywhere stays hidden, and no open tour stays hidden.
`sw.js`/`SW_VERSION` bumped v11→v12 so this reaches already-installed mobile clients.
Files: `app.js`, `sw.js`.

---

## 2026-09-18 (Tours: multiple isometrics per tour, with a client switch button + 3D flip)

On request: admin can now add several isometric/floor-plan images to one tour (e.g.
separate floors, or different angles of the same site), and the client gets a small switch
button in the minimap's corner to flip between them with a smooth rotation.

**Data model — `map` (singular) → `maps` (array), with the old format still readable.**
`parseTours` now accepts either the new `maps` array or the legacy singular `map` key
(every tour.json written before today), wrapping the latter as a one-item array — so
anandman's existing 9-dot MODERN VILLA isometric loads and works unchanged, and simply
gets written back out as `maps: [...]` the next time it's saved (`buildToursData` no
longer emits the old key at all). Every function that touched `t.map` was updated to work
across `t.maps` instead: `deleteTourNode`'s dot cleanup, `tourNodeBlobFiles`/
`fetchReferencedImages`/`collectOfflineAssets` (export, save-as-clone, offline download),
`buildSession` (IndexedDB). Along the way, found and fixed two **real memory leaks**
predating this change — `setTours`/`deleteTour` revoked a blob URL under the since-removed
`t.map` key, which was already dead code doing nothing; now they revoke every map's URL.

**Admin:** each tour's map section now lists every isometric as its own row (thumbnail,
"Isometric N · X/Y placed", an open-editor icon, a delete), with **"＋ Add another
isometric"** always available. The dot-placement editor (`tourMapEdit`) gained a `mapId`
alongside `tourId`, so it's scoped to exactly one isometric at a time — opened per-row
rather than the editor offering its own picker, since deciding "which isometric" before
opening it is much clearer than switching mid-edit. `setTourMapFromFile` now APPENDS a new
map (unique id via the same timestamp pattern the area-filter ids use) instead of replacing
the tour's one map; `clearTourMap(tourId, mapId)` removes just that one.

**Client:** `activeTourMap()` tracks which isometric is showing on `state.tourView.mapIndex`
— not a separate global, so it's naturally scoped to this viewing of this tour and resets
to 0 automatically next time, since `state.tourView` is rebuilt fresh on every tour entry.
The switch button and its pagination pips (`#tourMapSwitch`/`#tourMapPips`) are hidden
outright with fewer than 2 maps — nothing to switch to. **Both sit OUTSIDE
`#tourMapInner`** so they stay fixed and readable while the image flips rather than
spinning along with it. Same pointer-capture trap as the dots (`.tour-map-switch` hit-tested
in `pick()`, checked before the dots since it's visually on top) — PLUS a real `click`
listener wired once in `wireViewControls`, because a keyboard Enter/Space on a focused
`<button>` fires `click` directly and never touches `#pano`'s pointer capture at all, so
`pick()` alone would have left it keyboard-inaccessible.

**The flip:** `.tour-map-inner` (image + dots together, so they turn as one unit rather
than dots floating flat over a spinning picture) gets `rotateY(90deg)` for 220ms, the
image/dots are swapped while edge-on (i.e. invisible) to the viewer, then the class comes
off and the same transition reveals the new one rotating back to 0deg — a single clean
turn, not a cut. `perspective` lives one level up on `.tour-map` (a 3D transform needs
perspective on an ancestor, not itself, or it reads as a flat squash). Timed via
`setTimeout` matched to the CSS transition duration (220ms both places) rather than a
`transitionend` listener — this codebase already times its other CSS transitions (drawer/
gallery fades) the same way, and a single-property transition has no multi-event ambiguity
to worry about.

**Icon:** a two-arrow cycle/sync glyph (not the app's amenity/landmark emoji sets — SVG,
matching the same reasoning the tour-hotspot icons used: needs to look crisp and consistent
regardless of platform font), on a small dark circular badge overlapping the isometric's
own bottom-right corner — the same compact icon-button language `.zoom-controls` already
uses elsewhere in this app, so it reads as native to the UI rather than bolted on.

Verified via `node --check`, a CSS brace-balance check, an id-existence check for the two
new elements, SVG tag-balance, and Node tests against the real extracted functions: legacy
single-map files migrate correctly and round-trip stably through save/load, the new
multi-map format parses directly, a tour with no maps emits no `maps` key, dots for deleted
rooms drop per-map, `wrapIndex`/`activeTourMap` clamp and wrap correctly (including a
wildly out-of-range stored index), and the switch's next-index math cycles A→B→A→B on 2
maps, wraps 3→0 on three, and is a no-op with 0 or 1 map. Confirmed the CSS transition
duration and the JS timeout are both exactly 220ms, and that `pick()` checks the switch
before the dots. The actual look/feel of the flip needs a real browser.
Files: `index.html`, `app.js`, `styles.css`, `sw.js`.

---

## 2026-09-18 (Submenu heading removed for every folder — not the row from the entry above)

Turned out "still there" wasn't the menu row from the entry below at all — a screenshot
clarified it: the visible text was the **submenu heading** (`#catSubMenuTitle`), a
completely separate piece of markup that repeats the folder's own name back as a title
above its item list ("GALLERY" atop the gallery list, "VIRTUAL TOUR" atop the tour picker).
Asked directly whether to scope this to just Virtual Tour or every folder; answer was
every folder.

`renderClientSidebar`'s submenu branch now sets `titleEl.hidden = true` instead of writing
`currentParent.title` into it — `hidden`, not emptied text, so `.cat-drawer-head`'s
`justify-content: space-between` drops it from the flex row entirely rather than leaving a
zero-width span the back button shares the row with for nothing. Checked first for the
`[hidden]`-vs-`display` specificity trap this file has hit four times before: neither
`#catSubMenuTitle`'s two id rules nor any class rule sets `display`, so the UA default
`[hidden]{display:none}` applies cleanly here — safe to rely on `hidden` alone. Every
folder's submenu now shows just the back arrow above its list, no repeated name.

Bumped `sw.js`'s `VERSION`/`app.js`'s `SW_VERSION` again (v9→v10, see the entry below for
why this matters) since this is a second app.js change in the same session after the first
bump — didn't want to assume no mobile client had already picked up v9 in between.
Files: `app.js`, `sw.js`.

---

## 2026-09-18 (Fix: today's client fixes not reaching an already-installed mobile client)

The VIRTUAL TOUR fix below was reported still visible after shipping. Root cause found in
`sw.js`, not `app.js`: mobile clients register a service worker that precaches `app.js`
itself into a version-namespaced shell cache (`b91-shell-v8`) — a plain reload never re-hits
the network for anything already in that cache, so an already-installed worker keeps serving
the OLD `app.js` regardless of what's on the server. This is a known mechanism in this file
(every prior shell-affecting fix has bumped `VERSION` for exactly this reason); today's batch
of client-side changes didn't.

`sw.js`'s `VERSION` and `app.js`'s `SW_VERSION` both bumped `v8` → `v9`, kept in lockstep per
the existing documented rule. Per the same file's own design, this only discards and
re-fetches the small shell (~2MB of code) — a visitor's downloaded offline content (project
images/video, the big ~200MB "Includes offline access" download) is untouched, since data/
media caches are deliberately NOT version-namespaced (a past bump wiping that content
wholesale is exactly what the current design avoids). Files: `sw.js`, `app.js`.

---

## 2026-09-18 (Fix: VIRTUAL TOUR row no longer shown while already inside a tour)

Reported from a screenshot: a "VIRTUAL TOUR" row sitting in the menu while a tour was
already open. Traced to the single-tour/single-room case — the one scenario where the root
menu list stays visible alongside the "✕ EXIT TOUR" row while `state.tourView` is set (see
`renderClientSidebar`'s own comment) — where the builtin row was rendered exactly like any
other, so tapping it again would have just re-opened the same tour from its own start room.

Both client render paths that build a row list — the root menu and the generic submenu
(for a project where the admin has dragged the builtin into a folder) — now filter out
`node.builtin === 'tour'` whenever `state.tourView` is truthy, leaving every other row
(including "✕ EXIT TOUR") untouched. `builtin` is the identifier used because it's stable
regardless of what the admin has renamed the row to. Verified with a Node run of both
filter expressions: the row disappears only while touring and only that one row, in both
the root list and a submenu. Files: `app.js`.

---

## 2026-09-18 (Fix: darkened the actual compass's view cone, not the tour-minimap one)

The previous entry darkened `.tour-map-cone`/`.tourmap-cone` — the tour minimap's view cone
on the blue-dot map — on the assumption "the compass" meant that feature, since it sits in
the compass's own corner slot. A follow-up screenshot showed the literal compass dial
(N/E/S/W, needle) still faint, which is a different element entirely: `.cp-cone`, the
shaded wedge inside the compass SVG (`#compassCone`) marking which way the camera faces.
It was at `.12` alpha — lightened there in an earlier redesign specifically for a see-
through glass look, which turned out too faint to read.

`.cp-cone` raised to `rgba(10,12,16,.45)`, past even the `.20` that redesign lightened it
from. The tour-minimap cone from the previous entry is a separate, correctly-darkened
feature and was left as is. Files: `styles.css`.

---

## 2026-09-18 (Tour minimap: view cone darkened further)

On request: the black cone (from the earlier white→black recolour) was too faint to read
against a light-coloured render. Both the client `.tour-map-cone` and the admin editor's
`.tourmap-cone` preview raised their peak/mid stops from `.58`/`.32` to `.88`/`.6` and the
radial mask's inner stop from `.9` to `.95`, kept identical between the two so the editor
preview matches what the visitor actually sees. Files: `styles.css`.

---

## 2026-09-18 ("Keep open" control: dropped the text label, switch only)

On request. `buildKeepMenuToggle` no longer creates the "KEEP OPEN" text span — the row is
now just the switch, tucked to its own edge (`justify-content: flex-end`) rather than
stretched across the row with a label. Accessibility is unaffected: the input keeps its
`aria-label` for screen readers, and the wrap's `title` still gives a sighted hover the same
explanation the label used to provide visually. Removed the now-dead `.cat-keep-lbl` CSS
(base rule and the mobile-drawer font-size override) rather than leaving it as unreferenced
styling. Verified in Node that the built element has no label child, the input/track sibling
order the CSS still depends on holds, and the accessible name/title are both intact.
Files: `app.js`, `styles.css`.

---

## 2026-09-18 ("Keep open" control restyled as a real switch)

On request: the "KEEP OPEN" control was a bespoke checkbox-look button (a bordered box
that filled gold with a checkmark). Replaced with the exact `.ui-switch` markup/CSS the
admin already uses in two other places — the landmark "show by default" row and the menu
builder's built-in-row toggle — rather than inventing a second checkbox pattern.

`buildKeepMenuToggle` now builds `<label class="cat-keep ui-switch">` containing the label
text, a real `<input type="checkbox" class="ui-switch-input">`, and the track/thumb spans,
in that exact order — the switch's own CSS drives the thumb via
`.ui-switch-input:checked + .ui-switch-track`, an adjacent-sibling selector, so the input
must be immediately followed by the track with nothing between. `syncKeepMenuToggles` sets
`input.checked` on every copy instead of toggling a class. The track/thumb are scaled down
from the admin sidebar's default 34×18px (via extra `.cat-keep` specificity, not
declaration order, since this override doesn't hit the equal-specificity trap noted
elsewhere in this file) so the switch doesn't dwarf the label in a menu row, with a further
step down at the 140px mobile drawer width.

Verified in Node against the real functions: the built element has the exact structure and
sibling order the CSS selector depends on, starts unchecked, and a simulated change event
updates `state.keepMenuOpen`, persists it to `localStorage`, and is reflected back on the
input — plus confirmed no stale references to the removed checkbox-box styling remain.
Files: `app.js`, `styles.css`.

---

## 2026-09-18 ("Keep open" toggle in every menu level that holds a choice)

On request: a small toggle controlling whether picking an item auto-collapses the drawer,
offered in any menu/submenu with multiple items — the auto-collapse only gets in the way
when you're comparing several items in a row.

`addKeepMenuToggle(container, itemCount)` prepends the control when a level has 2+ rows,
wired into all three render paths (root `#catNavL1`, the landmark category picker `#catNav`,
and the generic submenu). `collapseClientDrawer` returns early when the pref is set, so
every existing call site inherits it without touching any of them.

**One shared preference, not one per menu.** A visitor pinning the menu open in the landmark
picker means "stop closing on me", not "stop closing in this list only" — per-level state
would have them re-pinning it at every level. Persisted in `localStorage`
(`b91-keep-menu-open`) like the other client toggles; default off, so existing behaviour is
unchanged until someone opts in.

**Toggling syncs the other copies in place rather than re-rendering** (`syncKeepMenuToggles`)
— `renderClientSidebar`'s root branch hides `#catLevel2`, so re-rendering from the toggle
would have slammed the landmark picker shut the moment anyone used it from inside there.
Styled deliberately quieter than a `.cat-btn`: it's a preference *about* the menu, not a
destination *in* it, and at the 140px mobile drawer width it shrinks its own tracking to
stay on one line. Verified in Node: the pref gates `collapseClientDrawer` both ways, the
toggle is withheld at 1 row and added at 3, and a null container is a no-op.
Files: `app.js`, `styles.css`.

---

## 2026-09-18 (Client: idle auto-pan holds still while the cursor is on a plot)

On request. The camera's idle drift kept turning while a visitor hovered a plot to read its
tooltip, sliding the thing they were reading out from under them.

`renderLoop`'s idle branch gained `!state.hoverId` (the hovered-plot id the raycast already
tracks). Deliberately the hover STATE rather than bumping `state.lastUserTouch` on hover
events: a pointer resting motionless on a plot stops producing events, so the 2.2s idle
timer would expire and the drift would resume mid-read. Gating on the state holds the camera
for exactly as long as the cursor is actually on a plot, and leaving it resumes on the usual
idle delay. Verified by exercising the real gate expression across the states that matter —
idle/nothing hovered pans; cursor resting on a plot doesn't; leaving resumes; and auto-pan
off, admin view and the idle-delay window are all unaffected. Files: `app.js`.

---

## 2026-09-18 (Fix: hovering un-dimmed plots that an area band had filtered out)

Reported: with a band selected the highlight looked right, but moving the cursor across the
map "started enabling the colour" of plots outside the band — and they stayed that way, so
the filter visibly eroded as you moved around.

Cause: three styling paths each re-derived "normal" as the status colour at
`state.overlayOpacity`, with no idea a band was active. `setEmphasis` brightened on hover
and then reset to FULL opacity on the way out (the erosion), and `restorePlotStyle`
(deselect) did the same. Only `colorPlots` knew about dimming, and it only runs when the
data or filter changes.

Introduced one source of truth — `plotBaseStyle(id, status)` returns a plot's resting look
(status colour normally, band colour when it's in the band, faded when a band is active and
it isn't) with `paintPlot` applying it. `colorPlots`, `restorePlotStyle` and `setEmphasis`'s
hover-off all go through it, and `setEmphasis` now skips the brighten entirely for a
filtered-out plot. **Anything that restores a plot's appearance must ask `plotBaseStyle`
rather than assuming `overlayOpacity` + status colour** — that assumption is exactly what
broke here.

Verified in Node against the real functions: with a 1000–1200 band, an in-band plot paints
the band colour and an out-of-band plot paints dimmed; hovering the out-of-band plot leaves
it dimmed both during and after; the in-band plot still brightens on hover and returns to
the band colour (not its status colour); and with no band active hover behaves exactly as
before. Files: `app.js`.

---

## 2026-09-18 (Fix: admin plot edits were silently discarded when a Google Sheet was on)

Reported as "changes to plot size in the admin aren't reaching the client". They weren't —
and it was worse than not reaching it: **they were being destroyed at save time.**

Two independent mechanisms, both from `data.source === 'sheet'`:
1. **`exportSite` rebuilt `plots.csv` from a fresh sheet snapshot** whenever a sheet was
   configured, throwing away `state.rows` — so editing a size and hitting Save wrote the
   *sheet's* value over it.
2. **`loadData` replaced `state.rows` with the sheet wholesale**, so even a correct
   `plots.csv` would have been ignored on the client. Plots with no row in the sheet (9 of
   this project's 18) got no status/size/price at all and rendered as unknown.

New rule, per the request — sheet for bulk data, **admin edits are the truth**:
- `loadData` precedence is now committed `plots.csv` (base: covers every plot, including
  ones the sheet omits) < **live sheet** (bulk, always current) < **`state.plotOverrides`**
  (the admin's own edits).
- `exportSite` writes `plots.csv` from `state.rows` again. It still re-fetches the sheet,
  but only to compute WHICH fields differ from it (`computePlotOverrides`) — those are
  stored in `alignment.json` as `plotOverrides` and re-applied on every load.

Deriving overrides by **diffing at save time** rather than tracking keystrokes falls out of
how the data already flows: the admin's rows were seeded from the sheet, so anything no
longer matching it is by definition an edit. It's therefore self-cleaning — set a value back
to what the sheet says and the override vanishes — and it survives later sheet edits, unlike
a one-time snapshot. Blanks are never recorded, since `""` can't be distinguished from
"never filled in" and would let an empty admin field permanently mask a real sheet value.
Stored in `alignment.json` rather than a new file specifically to avoid adding a sixth entry
to the five separate places project data files are enumerated (save list, `loadProjectFile`,
`BUNDLE_DATA_FILES`, offline collector, warm cache) — each one a documented
silently-dropped trap. `parseAlignment` whitelists the fields per plot so a round-tripped
file can't inject arbitrary keys into a row.

Verified with a Node run of the real `computePlotOverrides`/`applyPlotOverrides`: only the
changed fields are recorded (not whole rows), a client starting from the sheet ends up with
the admin's size and status, fields the admin never touched still come from the sheet, a
plot absent from the sheet keeps its admin data, reverting a value to the sheet's clears the
override, and blanks are never recorded. Files: `app.js`.

---

## 2026-09-18 (Trace editor: plot list gets its own column; two help texts removed)

**Plot list moved out of the tools sidebar.** It sat at the bottom of `.trace-tools`,
below the mode buttons, sliders and the whole Plot Data block, sharing that column's single
scroll container — so it rendered as a sliver, and since each row expands into an inline
editor (status, price, area, media), editing a plot meant scrolling the entire sidebar to
reach it. `.tracewin-body` is now a three-column grid — tools, plots, stage — with the list
in its own full-height `.trace-plots` column immediately right of the sidebar. Its column
uses `clamp(230px, 22vw, 330px)` rather than a fixed width so it gives space back on a
smaller screen; the stage keeps the remainder. `.trace-list` gained `flex: 1; min-height: 0`
— without the `min-height` its `overflow-y` would silently do nothing and the list would
push past the column instead of scrolling (the flex-child trap CLAUDE.md documents).

**Two standing help texts removed** from the Plot Data block, both on request: the area-unit
explainer added earlier the same day, and the "sheet must be public / header row must
match plots.csv…" paragraph. `#axSheetMsg` is **kept as an empty span** — `setSheetMsg()`
writes Test results and errors into it, so deleting the element would have broken the Test
button's feedback; only its static prose is gone. The same guidance remains reachable
through the **Download sample sheet** button sitting right next to it.
Files: `index.html`, `app.js`, `styles.css`.

---

## 2026-09-18 (Area unit moved into Plot Data, and now normalises every plot's area)

On request, and it resolves the caveat the original area-filter work shipped with. The
unit was in the Area-filters panel and was a pure display label, because each plot's area
is free text carrying its own unit ("1200 sq.ft") and there was no project-wide statement
of what unit the data is in.

Declaring it **on the plot data** removes that ambiguity: the unit now sits in the Plot
Data section and means "every plot's area is expressed in this". So changing it does
something real — `applyAreaUnitToPlots` rewrites each plot's Area text to the new unit,
across both `state.rows` (the committed data) and, when the tracer is open, its live
`trace.plots` copy. That second half matters: this control lives *inside* Import & Trace,
so the tracer is open by definition, and updating only `state.rows` would look like the
edit did nothing and then be overwritten by the next commit.

**It relabels; it does not convert.** `1200 sq.ft` becomes `1200 sq.m`, not `111.48 sq.m`.
Rewriting figures the admin typed is a far bigger and less reversible action than
restating which unit they were always in — and in practice a project's plots are entered
in one unit, so switching reads as "I mis-stated the unit", not "convert my measurements".
The admin note under the picker says exactly this rather than leaving it to be discovered.

Verified with a Node run of the real `applyAreaUnitToPlots` over every data shape in play:
`"1200 sq.ft"` → `"1200 sq.m"`, `"1,500 sq ft"` → `"1500 sq.m"` (comma stripped), a bare
`"2000"` gains the unit, blank and unparseable (`"N/A"`) values are left untouched, the
tracer's copy is rewritten and refreshed alongside the committed rows, and switching a
second time replaces the unit rather than stacking it. Files: `index.html`, `app.js`,
`styles.css`.

---

## 2026-09-18 (Legend: "Unknown" chip removed, Filter dropdown takes its slot)

On request. `renderLegend` no longer emits a chip for `unknown` at all (it previously
appeared whenever any plot had no readable status), and the area Filter dropdown is
adopted into `#legend` as its last item so it sits directly after **Sold** — the position
Unknown used to hold — rather than being pushed to the far edge of the header.

**`unknown` remains a real internal status**: a plot with no status data still renders grey
and stays visible, and it's still in `STATUS_ORDER`/`state.activeFilters` and the admin's
per-plot status picker. Only the client-facing chip is gone — it's an artefact of missing
data, not a category a visitor meaningfully filters by. Dropping it from `STATUS_ORDER`
instead would have made those plots disappear from the map entirely, which is not what was
asked for.

The dropdown is **moved, not recreated** (`appendChild` relocates the live element, so its
change listener and current selection survive), which means the adoption has to repeat on
every legend rebuild — `renderLegend` clears its own children first. Verified with a
stub-DOM run of the real `renderLegend`: only available/reserved/sold chips render even
when `counts.unknown` is non-zero, the dropdown lands last, and it's still last after a
re-render. Files: `index.html`, `app.js`.

---

## 2026-09-18 (Area filters moved into Import & Trace, as a collapsible corner panel)

Follow-up to the entry below: the admin panel shipped in the Align tab, which is already a
crowded column, and it sat far from the plot data it actually filters. Moved into the
**Import & Trace** window, floating over the top-right of the stage just under the
toolbar — where the admin is already looking at the plots whose sizes these bands slice up.

`index.html`: the `.ax-area` block moved out of `#axTabAlign` into `#traceStage` (which is
already `position: relative`, so no layout groundwork needed), gaining a header button that
collapses it so it never permanently covers the plan. `styles.css`: restyled from a stacked
sidebar section into an absolutely-positioned translucent panel with its own scroll area.
`app.js`: only the collapse wiring is new — every element id is unchanged, so the editor
logic is untouched. Added `refreshAreaAdminUI()` calls in `openTrace` and `finishTrace`,
because the panel's "N plots" / "readable on N of M" counts read `state.geom`/`state.rows`,
and those move exactly when plots are traced or committed — without it the counts would
show whatever was true at admin boot.

Panel events can't reach the trace canvas (it's a sibling, and the canvas's pointer handler
is bound to the canvas itself), so clicking in the panel can't start drawing a plot.
Files: `index.html`, `app.js`, `styles.css`.

---

## 2026-09-18 (Area filters: admin-defined size bands + client "Filter" dropdown)

On request. Admin sets an area unit and defines named size bands (min/max + colour); the
client gets a Filter dropdown that recolours the plots inside the chosen band.

**The obstacle, checked before designing anything:** `plots.csv` stores area as free text
(`size` = `"1200 sq.ft"` — number and unit in one string), so there was nothing numeric to
compare a range against. `plotAreaValue(row)` resolves it: an explicit numeric `area`
column wins where a project has one, otherwise the leading number is parsed out of `size`
(commas stripped). **This is also why the unit dropdown is a LABEL, not a converter** —
each row carries its own unit inside that text, so converting would be guesswork; the
admin's min/max are simply read in whatever unit the data already uses, and the picker
says so.

Because a band that matches nothing looks identical to one configured wrongly, the admin
panel is explicit about it: a per-project readout ("Area readable on 6 of 6 plots", amber
when some can't be read) plus a live "N plots" count on every band as its range is typed.

Data: `alignment.json` gains `area: { unit, filters:[{id,name,color,min?,max?}] }`
(`areaData`/`parseAreaConfig`, restored at boot next to the sheet config). **Omitted
entirely when a project has no bands and the default unit**, so every other project's
alignment.json is byte-identical through a save. A blank min or max round-trips as `null`
("open-ended"), deliberately not `0` — otherwise "up to 1200" would silently become
"exactly 0 to 1200" and match almost nothing.

Client: `colorPlots` gained the band pass — matching plots take the band's colour,
non-matching are **dimmed to ~22% rather than hidden**, so the layout still reads as a whole
and you can see where the matches sit in it. Status filters still apply on top (a plot must
pass both), since "Type 1 AND available" is the actual question. The dropdown is rendered
twice from one list (`renderAreaFilterUI`) — the topbar copy plus a floating twin in
`.zoom-controls`, because **the whole topbar is collapsed on a landscape phone** and the
filter would otherwise be desktop-only; the twin's show-rule spells out
`:not([hidden]):not(.is-hidden)` so a later `display:block` can't resurrect it on projects
with no bands or inside a tour (the specificity trap this file keeps hitting). Both follow
`updateLegendVisibility`, so the filter disappears off the plot map exactly like the legend.

Verified via `node --check`, a CSS brace-balance check, an id-existence check, and Node
tests driving the real `plotAreaValue`/`plotMatchesAreaFilter`/`areaData`/`parseAreaConfig`:
parsing across `"1200 sq.ft"` / `"1,500 sq ft"` / `"2000"` / `"1500.5 sq.m"` / blank / `"N/A"`,
explicit-column override, inclusive boundaries, open-ended bands in both directions,
unreadable area never matching, untouched projects emitting no key, round-trip stability,
junk colour fallback and blank-stays-null. Also replayed against the project's real
`plots.csv` (6 plots, all readable at 1200). The visuals need a real browser.
Files: `index.html`, `app.js`, `styles.css`.

---

## 2026-09-18 (Tour hotspots: pickable icon set, aimable arrows, idle animation)

On request, from reference crops of a 3DVista tour (a floor-painted "^" arrow labelled
Reception; a circled door glyph labelled Kitchen). Hotspots were a single fixed gold ring
with a `↗` glyph in it.

**Per-hotspot, not per-node** — a room can have several exits and each wants its own
marker, so the controls live in the existing "HOTSPOTS IN <room>" panel.

`app.js`: new `TOUR_HS_ICONS` map (`chevron`, `stairs`, `door`, `ring`) following the
`AM_ICONS`/`LM_ICONS` pattern, but **SVG rather than emoji** — these have to be rotatable
and animated, neither of which a platform-font glyph can do. Each entry declares
`rotatable` (gates the aim control; a rotated door just looks broken) and `floor` (whether
it reads as painted on the ground). Links gained **`icon`** and **`rot`**, threaded through
all three serialisation paths — `parseTours` (validates the icon against the whitelist,
normalises the angle into 0..359), `buildToursData`, **and `buildSession`**, which rebuilds
links field-by-field and would otherwise silently drop both on every autosave (the same
whitelist trap `cleanNodeForSave` is documented for). Links written before this default to
`chevron` at 0°, which is why the project's 17 existing hotspots change appearance without
any data migration — an un-aimed arrow pointing "up" already reads as "through here".

Admin: each hotspot row gained a second line with an icon `<select>` plus, for aimable
icons, four cardinal preset buttons (↑ → ↓ ←) and a fine slider with a degree readout.
The slider writes the CSS var on the live marker directly while dragging (rather than
rebuilding the hotspot DOM per input event) so aiming feels continuous. `tourHsDom` entries
now carry the `idx` its own declaration comment already claimed, which is what makes that
live lookup possible.

`styles.css`: the aim rotation and the floor tilt ride on a `.tour-hs-ico` wrapper and the
animation on a `.tour-hs-ico-in` inside it — **never on `.tour-hs` itself, which
`renderTourHotspots` writes `left`/`top` to every frame**. Because the animation sits inside
the rotated wrapper, an arrow's nudge runs along the direction it points rather than up the
screen. Floor icons get `perspective(160px) rotateX(46deg)` applied *before* the aim
rotation, so aiming spins them on the ground instead of cartwheeling them toward the camera.
Round markers pulse instead of nudging; both honour `prefers-reduced-motion`. The admin
"selected hotspot" highlight was retargeted from the removed `.tour-hs-ring` to the new
wrapper. Known trade-off, shared with the reference: a fixed tilt can't account for where in
frame a hotspot sits, so one near the edge reads slightly less grounded than one dead centre.

Verified via `node --check`, a CSS brace-balance check, a stale-selector sweep for the
removed ring, an icon/CSS/SVG consistency check (every icon key has a matching rule, every
SVG's tags balance, the order list covers the map), and a round-trip test driving the real
`parseTours`/`buildToursData`: legacy links default to chevron/0°, an authored icon+angle
survives save→load, and junk input falls back safely (`icon:'banana'` → chevron, `rot:-90`
→ 270). The look itself needs a real browser. Files: `app.js`, `styles.css`.

---

## 2026-09-17 (Tour minimap: actually responsive on phones — the override was dead CSS)

Reported as "takes a lot of space" on mobile. The map did have a phone rule from the day it
shipped — it just **never applied**: it sat in the landscape media query at line ~599, while
`.tour-map`'s own base rules are declared at ~3200. **A media query adds no specificity**, so
between two equal single-class selectors the LATER one wins, and the base desktop size won
outright. Phones were rendering the map at `min(380px, 34vw)` — ~287px wide and ~191px tall
on an 844×390 screen, **about half the viewport height**. That's the fifth time this exact
trap has hit this file (see the gotcha entry in CLAUDE.md).

Fixed by moving the phone rules into their own media query placed immediately AFTER the
base block, with a note left at the old location explaining why they're not there.

Also made the sizing genuinely responsive rather than width-only: on a landscape phone the
binding constraint is HEIGHT, so the image is now capped by **both** `max-width` and
`max-height` (`24vh` phone / `46vh` elsewhere) with `width/height: auto`, so it fits
whichever runs out first regardless of the uploaded image's aspect ratio. That required two
supporting changes to keep the dots aligned, since dots are positioned in % of their
container: `.tour-map` switched from `width` to `max-width` and `.tour-map-inner` to an
`inline-block` (`line-height: 0`) so the box shrink-wraps the rendered image instead of
staying at the full width while a height-capped image renders narrower inside it; plus
`text-align: right` on `.tour-map`, because shrink-to-fit resolves from the image's
intrinsic width and can't see the max-height cap, which would otherwise let the map drift
inward from the screen edge.

Measured across real viewports (with the project's actual 1600×1066 map): phone landscape
now 16–20% of width and exactly 24% of height at 844×390, 667×375 and 740×320; desktop
unchanged at ~380px. A square map on a phone correctly becomes height-bound at 24% and the
container shrink-wraps to it. Files: `styles.css`.

---

## 2026-09-17 (Tour minimap: cone no longer glides between rooms)

Reported: switching rooms made the cone travel across the plan from the old dot to the new
one — it read as the visitor sliding through walls. Cause was a `transition: left, top` on
`.tour-map-cone` (added with the cone itself, on the assumption a smooth move would look
better; it doesn't, because the two dots aren't connected by anything walkable).

Removed that transition so the position change is instant, and replaced it with a short
`tour-cone-in` fade that `updateTourMapActive` **restarts** on every room change (clear
`animation`, force a reflow, hand it back — the element is reused rather than recreated, so
the animation won't re-fire on its own). Net effect is the requested "closes and reopens on
the next dot". Files: `app.js`, `styles.css`.

---

## 2026-09-17 (Tour minimap: view cone recoloured black)

On request: the cone shipped white and washed out against the isometric render's own
bright interiors. Both cone rules (`.tour-map-cone` client, `.tourmap-cone` admin preview)
now use black at the same alpha ramp, so it reads as a cast shadow over the plan — which is
what the reference does. Files: `styles.css`.

---

## 2026-09-17 (Tour minimap: live view cone / "radar" on the room you're standing in)

On request, from a reference crop: the active room's dot now carries a translucent view
cone that rotates live as the visitor pans, so the map shows not just *where* they are but
*which way they're facing*.

**Anchored to the MAP, not to real-world north — a deliberate call made from the data.**
The obvious route was the existing per-room compass calibration (`defaultView.facingDir` →
`state.northDeg`, which `updateCompass` already turns into a heading). Checked first:
**all 9 rooms of the only tour with a map (anandman MODERN VILLA) have `facingDir: null`**,
and calibration is optional by design, so that route would have aimed every cone
arbitrarily unless the admin first went and set a compass direction per room by eye. So
each dot instead stores its own **`rot`** — the on-map direction (degrees clockwise from
"up") the camera faces *at that room's saved start view*. Live angle is
`rot - (currentLon - defaultView.lon)`; the minus sign is the camera-yaw convention (same
`-view.lon` `updateCompass` uses — see the two-lon-conventions note), so the cone and the
compass always turn together. Independent of `northDeg`, so it stays correct whether or not
the compass is ever calibrated.

`app.js`: `rot` added to the map points (parse/build/session, normalised into 0..359,
defaulting to 0 so the 9 already-placed dots keep working and simply point "up" until
aimed); `updateTourMapCone()` called every frame from `renderLoop` **right after
`updateCompass()`** — it tracks a free-panning camera for exactly the same reason;
`updateTourMapActive()` parks the single cone element on whichever dot is current.
Admin: every dot previews its cone in the map editor (faint; bright for the selected room)
so "which rooms are still at the default 0°" is visible at a glance, and the selected room
gets a gold **drag handle** parked at the cone's outer edge — dragging it aims the cone
(`atan2` bearing from the dot), with a live degree readout in that room's row. The handle
deliberately sits away from the dot so "move the dot" and "aim the cone" can't be confused.
`styles.css`: the cone is a `conic-gradient` wedge (`from -32deg`, ~64° wide, centred on
"up" so the element's own `rotate(var(--rot))` is the whole aiming story) on a circle,
radial-masked so it fades out with distance instead of ending on a hard arc. Sized in **%**
of the map on the client so it scales with it rather than being a fixed blob on a small
phone map.

Verified via `node --check`, a CSS brace-balance check, and Node tests driving the REAL
`updateTourMapCone`/`parseTours`/`buildToursData` extracted from `app.js`: the cone reads
exactly the authored angle at the saved start view, turns clockwise when panning right and
counter-clockwise when panning left, survives a full 360 and wraps into 0..359; and `rot`
round-trips through save/load, defaults to 0 for existing dots that predate it, and
normalises out-of-range input (-90 → 270, 725 → 5). The drag-to-aim gesture needs a real
browser. Files: `app.js`, `styles.css`.

---

## 2026-09-17 (Tour minimap: flush to the corner, + recovered anandman's map transparency)

Reported with a side-by-side: our map still showed a **solid black rectangle** behind the
render, and sat inset from the corner rather than flush like the reference.

**Diagnosed rather than guessed.** Sampled the already-saved
`projects/anandman/tour-t20-map.web.jpg` directly: every corner and edge pixel was
**exactly `(0,0,0)`**, with ~44% of the frame near-black. Pure mathematical black right
around the border is the signature of *transparency flattened into JPEG* — a canvas's
transparent pixels encode as black, since JPEG has no alpha (`resizeImageToBlob` draws onto
an unfilled canvas, so this is inherent to the old `image/jpeg` call, not the source file).
A genuinely black-backgrounded render essentially never measures as pure 0,0,0 everywhere.
So the source PNG's transparency was real and had simply been destroyed on import — already
fixed going forward by the PNG switch in the entry below.

**Recovered the existing map instead of making the admin redo it.** The 9 dots were already
placed, and they're keyed by `nodeId` with 0..1 coordinates — completely independent of the
image file — so only the image needed repairing: flood-filled the CONNECTED background from
the corner (`ImageDraw.floodfill`, tolerance 34) rather than knocking out a colour globally,
so dark pixels *inside* the render can't be punched into holes, then intersected that mask
with a near-black test as a second guard against a flood leak erasing anything visible.
Result: 44.7% transparent, all four corners alpha 0, centre still opaque — written as
`tour-t20-map.web.png` (resized to the same 1600px cap new uploads use) with `tour.json`
repointed at it. Previous `tour.json` backed up to `_originals/tour.json.bak-before-mappng`;
the old `.jpg` is left on disk untouched.
⚠️ **The admin's IndexedDB session still holds the old JPEG blob**, so the next Save from
that already-open admin tab would write the black `.jpg` back — re-uploading the original
transparent PNG in the Tour tab is what makes it durable (and is a single action).

**Positioning:** `.tour-map` moved from `top:14px; right:16px` to flush `top:0; right:0`
(and `min(380px, 34vw)`, `min(190px, 36vw)` on phones). The render's own transparent margin
supplies the visual breathing room; an extra CSS inset is what made it read as a rectangle
parked near the corner instead of part of the scene. Files: `styles.css`,
`projects/anandman/{tour.json, tour-t20-map.web.png}`.

---

## 2026-09-17 (Tour minimap: dots now actually navigate, and it's drawn bare in the compass's slot)

Three follow-ups to the minimap below, all from a side-by-side with the reference tour.

**1. Clicking a blue dot did nothing — the pointer-capture trap, for the FIFTH time.**
`#pano` calls `setPointerCapture` on every pointerdown, so a tap on any DOM overlay inside
it retargets its `click` to `#pano` and the overlay's own handler never runs. This is
exactly why amenity pins and `.tour-hs` hotspots are hit-tested inside `pick()` instead of
relying on their click handlers — and the new dots had the same bug for the same reason.
Fixed by hit-testing `.tour-map-dot` in `pick()`'s tour branch (checked BEFORE `.tour-hs`,
since the map is drawn over the scene) and calling `tourGoTo(nodeId)` from there, which
gives the room switch the same crossfade every other tour navigation already uses. The
dots' own click handlers stay for the admin case; `tourGoTo`'s existing `busy`/same-node
guards make a double-fire a no-op. **If you add another clickable overlay inside `#pano`,
it needs a `pick()` branch — a click handler alone will silently do nothing in the client.**

**2. Moved into the compass's own top-right slot** (on request). `renderClientTourMap`
toggles a `body.tour-map-on` class that hides `.compass` for as long as a map is shown, so
the two never overlap; closing the tour restores it (`closePanoTour` now just calls
`renderClientTourMap()` with `state.tourView` already null, rather than hiding the element
by hand — one code path, so the class can't get stranded).

**3. Restyled to match the reference: no panel.** The first version wrapped the image in a
dark rounded card with a border, blur and shadow, plus a 🗺 collapse toggle — which reads
as a widget bolted onto the scene rather than part of it. All of that is gone: the image is
drawn bare, larger (`min(340px, 32vw)`, `min(180px, 34vw)` on phones), with a
`drop-shadow` **filter** rather than `box-shadow` so the shadow follows the render's alpha
silhouette instead of outlining an invisible rectangle. The container is
`pointer-events: none` with only the dots taking input, so panning the panorama still works
straight across the map area — and, just as importantly, that's what keeps the dots
reachable by `document.elementFromPoint`, which is how `pick()` finds them.
**Uploads are now PNG, not JPEG** (`setTourMapFromFile`, same call and reasoning as the
brand logo): an isometric render normally arrives on a transparent background, and drawing
it bare over the panorama only looks right if that transparency survives — JPEG would bake
it into an opaque white rectangle. Existing `.web.jpg` maps keep working; re-upload to get
transparency.

Verified via `node --check`, a CSS brace-balance check, a stale-reference sweep for the
removed toggle, and Node tests driving the REAL `pick` and `renderClientTourMap` extracted
from `app.js`: a tap on a dot routes to `tourGoTo` with the right node id, a tap on empty
panorama while touring navigates nowhere, the map shows with correct dot positions/active
marking/PNG src and hides the compass, and closing the tour hides the map and gives the
compass its corner back. Files: `index.html`, `app.js`, `styles.css`.

---

## 2026-09-17 (Virtual tours: per-tour isometric/floor-plan map with a dot per room)

On request, after looking at a 3DVista reference tour's top-right "radar": each tour can
now carry ONE isometric / floor-plan image, with a dot placed on it per room, shown to the
visitor as a corner minimap they can tap to jump between rooms. A room list has no spatial
information in it at all; this is the "you are here, and here's what's around you" half.

**Data** (`tour.json`) — each tour gains an optional
`map: { file, points: [{ nodeId, x, y }] }`. Coordinates are **normalised 0..1**, not
pixels, so the same map renders correctly in the admin editor (~900px) and the client
minimap (~190px) with no rescaling. Absent ⇒ no map, and `buildToursData` emits no `map`
key at all, so every existing tour.json is byte-identical through a save. `parseTours`
drops dots whose room no longer exists (and `deleteTourNode` does the same live), clamps
coordinates into 0..1, and carries a `blob` through exactly like `panoBlob` so an unsaved
upload survives a session round-trip.

**Admin** (`index.html`/`app.js`/`styles.css`) — the Tour tab's open tour gains a map row
under "Add node": upload (`setTourMapFromFile`, resized to 2000px JPEG — the largest it's
ever drawn is the editor), a thumbnail + "N/M rooms placed" readout, remove, and **🗺 Open
map to place dots** → a new `#tourMapModal`. In it: click a room in the side list to arm
it, then click the map to drop its dot; dots drag to fine-tune, and each room row shows
placed / not-placed. Replacing the image keeps existing dots.

**Client** — `#tourMap`, a collapsible corner panel below the compass (108px tall at
top:14px, so the map starts at 132px — keep those in sync if either moves). Shown only
while a tour that has BOTH a map and at least one placed dot is open; the room the visitor
is in is gold, the rest blue; tapping one calls the existing `tourGoTo`. Starts collapsed
on phones (it's a helper, not the content) and shrinks to ≤34vw there.

Persisted through every path the node panoramas already use: `buildToursData`,
`tourNodeBlobFiles` (export + `saveToursAs`), `buildSession`, `fetchReferencedImages`
(save-as/clone) and `collectOfflineAssets` (a map is only fetched once its tour is opened,
so runtime caching alone would never reach it — same gap that hid the room panoramas until
2026-09-12). No standalone-bundle work needed: it's a plain `<img>`, not a WebGL texture,
so it needs no `BUNDLE_IMAGES` embedding (same as the brand logo), and `do_bundle` already
copies every top-level project file.

Verified via `node --check`, a CSS brace-balance check, an id-existence check for all 13
new element ids, a round-trip test driving the REAL `parseTours`/`buildToursData` extracted
from `app.js` (map parsed, dots for deleted rooms dropped, `_ver` carried, parse→build→parse
stable, no-map tours emit no `map` key, session blob preserved, out-of-range coords
clamped), and a stub-DOM test of `renderClientTourMap` (hidden with no tour / no map / a
map with zero dots; shown with correct dot percentages, active-room marking, nodeId wiring
and a cache-busted image src). The admin editor's click/drag interaction needs a real
browser — headless admin verification isn't reliable in this project (see CLAUDE.md).
Files: `index.html`, `app.js`, `styles.css`.

---

## 2026-09-17 (Fix: deleting a traced plot didn't free its auto-generated number)

Reported: "if i cross [delete] A102 and then mark one more plot it starts from A103
rather then starting from A102." Root cause: `nextPlotId()` read off a monotonic counter
(`trace.seq`, incremented on every capture, never decremented on delete) — once A102 had
ever been issued, that number was gone for good regardless of whether the plot holding it
still existed.

`app.js`: rewrote `nextPlotId()` to scan `trace.plots` for whatever "Ann" numbers are
actually in use RIGHT NOW and return the lowest one that isn't — so deleting A102 makes
it available again immediately, and duplicates are impossible by construction (a number
is only ever "next" if nothing currently holds it). This made the `trace.seq` counter
itself dead weight, so it — and its three reset points (`trace.seq: 0` in the initial
state, the two "start a fresh trace" resets, and the "seed past the existing max" line in
`loadCurrentLayoutIntoTrace`) — were removed rather than left as an unused, potentially
misleading leftover. Verified via `node --check`, a standalone Node simulation of
capture→capture→capture→delete-middle→capture (confirmed the freed number is reissued,
not skipped), and confirming the live local server serves the updated logic. Files:
`app.js`.

---

## 2026-09-17 (Fix: plot STATUS wasn't part of the sheet auto-fill)

Reported right after the feature above shipped: "the available/sold/reserved is not
getting fetched... make sure the status is fetched exactly in plots as well." Root
cause: status is a dropdown that always holds SOME value (defaults to `'available'`), so
the "only fill if the field is still empty" rule every other field uses can never fire
for it — there's no such thing as an "empty" status to detect.

`app.js`: `autofillPlotFromSheet` now has a separate status rule, gated on a new
`p._statusTouched` flag instead of emptiness — set the first time the admin actually
changes the status `<select>` themselves (its own `change` handler). Until that happens,
a matching sheet row's status is free to keep overwriting the untouched default, on
every match (first capture AND again on rename, same as the other fields) — so drawing a
plot whose id is already `sold` in the sheet lands on Sold immediately, not the default
Available. The moment the admin picks a status by hand, autofill stops touching it for
that plot — same "never fight a manual edit" rule the text fields already follow.
`styles.css`: a small green dot (`.trace-status-sheet-dot`, with the `[hidden]` override
this codebase always needs alongside a new toggled-via-`.hidden` element — see the
CLAUDE.md gotcha this has hit four times before) appears next to the status dropdown
when its value came from the sheet, clearing the instant the admin changes it by hand.
Verified via `node --check`, a CSS brace-balance check, a standalone Node re-run of the
matching logic covering fresh-capture overwrite / manual-touch preserved / idempotent
re-match (all passed), and confirming the live local server serves the updated code.
Files: `app.js`, `styles.css`.

---

## 2026-09-17 (Admin: newly-drawn plots auto-fill from the Google Sheet)

On request: "when i draw plots on the layout it get fetched as well is it possible?" —
previously, a plot already IN the layout picked up its price/facing/etc. from the sheet
(via `state.rows`, joined at boot), but a plot drawn/renamed during THIS session was never
part of that original join, so nothing filled in until a full page reload.

`app.js`: new `autofillPlotFromSheet(p)` looks up a traced plot's sheet row (via the new
`findSheetRowForId`, which tries an exact key match then falls back to the same tolerant
canonical `plot_id` matching used everywhere else in this file — "A102"/"Plot-A102"/
"plot_102" all count as the same plot) and fills only the fields still empty
(`size, price, facing, dimensions, block, tour_url, notes` — deliberately not
`video_url`/`image_url`/`media_json`, the multi-media fields meant to be authored via the
trace editor's own picker, not typed into a spreadsheet) — it never overwrites something
the admin already typed. Wired into the two places a plot's id becomes known: `addPlot`
(right when a new polygon is captured — covers auto-trace, manual click, and DXF import,
which really can supply a real matching id) and the plot-number `<input>`'s rename handler
in `refreshTraceList` (the flow that actually matters most: draw a shape with a throwaway
placeholder id, then type the real plot number — that's the moment a match becomes
possible). `openTrace()` also now re-fetches the sheet FRESH the moment Import & Trace
opens (`traceSheetRows`, checked before the boot-time `state.rows`) rather than only
relying on whatever `loadData()` cached at page load — so a row added to the sheet after
boot is usable in the same session without a reload. Kept strictly separate from
`state.rows` itself (read-only lookup cache, never merged in) so a sheet fetch can never
silently overwrite/blank a field on data that's already loaded.

`styles.css`: each auto-filled field now shows a small green "✓ Sheet" badge next to its
label (`.trace-field-sheet-badge`) so the fill is never silent/unexplained — it disappears
the instant the admin edits that field by hand. Verified via `node --check`, a CSS
brace-balance check, a standalone Node re-implementation of the matching/autofill logic
run against 4 cases (exact-key sheet match, manually-typed field preserved, no-match
no-op, fallback to `state.rows` when no fresh sheet fetch exists — all passed), and
confirming the live local server serves the updated code. Files: `app.js`, `styles.css`.

---

## 2026-09-17 (Admin: "Download sample sheet" button for the Google Sheet plot-data feature)

Reported from a screenshot of the Test button's own error ("no plot_id column — the
header row must match plots.csv") — nothing before that point ever showed the admin what
the sheet's header row is actually supposed to look like, so they hit this error blind.

`index.html`: added a **📥 Download sample sheet** button next to Test in the Plot Data
section (Import & Trace tab), and reworded the helper note to point at it.
`app.js`: `downloadSampleSheetCsv()` builds a small example CSV with the base
`plots.csv` columns (`plot_id,status,facing,size,dimensions,price,block,tour_url,notes` —
deliberately NOT the extra `video_url`/`image_url`/`media_json` columns `buildPlotsCSV`
also writes, since those are multi-media fields meant to be authored via the trace
editor's own picker UI, not hand-typed into a spreadsheet) filled with plausible example
values (mixed statuses/facings/sizes/prices). Uses the current project's REAL plot ids
when any exist (`state.geom`), so pasting the download straight into a fresh Google Sheet
and hitting Test shows every id already matching the layout, rather than a generic
template the admin then has to find-and-replace. Downloaded as a plain `.csv` (opens
directly in Excel, and is exactly what Google Sheets' File → Import expects) rather than
a real `.xlsx` — matches the project's zero-dependency philosophy (no new library needed)
and is the literal same format `plots.csv` already uses, so there's no format mismatch to
explain. `styles.css`: `.ax-data-actions` gained `flex-wrap: wrap` so the two buttons +
note text don't overflow a narrow sidebar now that there are two buttons instead of one.
Verified via `node --check`, a standalone dry-run of the CSV-generation logic in Node
(confirmed correct header + rows), a CSS brace-balance check, and confirming the live
local server serves the updated markup/logic. Files: `index.html`, `app.js`, `styles.css`.

---

## 2026-09-17 (Fix: AERIAL VIEW not highlighted after backing out of a picker)

Reported from a screenshot: leaving LANDMARKS (via the drawer's BACK button) returns the
visitor to the plain aerial pano, but no row in the root menu showed that — every row
looked equally unselected even though the visitor had visibly "landed" back on AERIAL
VIEW.

`app.js`'s `renderClientSidebar()` (root-menu branch): whenever the root list is what's
on screen, the pano behind it IS the aerial view — every other content type either opens
a modal on top of it or drills into its own picker level, none of which leave the root
list visible. The one exception is an open tour (`state.tourView`), which really does
replace the pano with a tour room while still showing the root list (the
single-tour/single-room case). So the node with `contentType === 'aerial'` now gets the
existing `.cat-btn.is-active` class (already used for landmark-category buttons — no new
CSS needed) whenever the root menu renders AND no tour is open; `null` otherwise, so nothing
is falsely marked active mid-tour. Since LANDMARKS' own BACK button (`catBackBtn`, a
separate legacy DOM level from the generic submenu system) only toggles `hidden` and never
re-renders `#catNavL1`, this one change at render time is enough to cover it — the markup
already carries the correct highlight from whenever it was last built (boot, or any
`renderClientSidebar()` call), it just wasn't marking AERIAL at all before. Verified via
`node --check` and confirming the live local server serves the updated logic. Files: `app.js`.

---

## 2026-09-17 (Fix: back-arrow not centered in its circle — swapped text glyph for SVG)

Reported from a screenshot: the `‹` character inside the round `.cat-back-btn` sat
visibly off-center despite the button using flex `align-items`/`justify-content: center`.
Root cause: a text glyph carries its own built-in side-bearing (asymmetric spacing baked
into the font), which flex-centering centers the character's *box*, not its visible ink —
so no amount of CSS centering fixes it. The existing gallery lightbox prev/next buttons
already avoid this with an inline SVG chevron, so the back buttons now use the same
pattern instead of a font character.

`index.html`: both `#catBackBtn` and `#catSubMenuBackBtn` replaced their `‹` text with a
14×14 `<svg>` (`viewBox="0 0 24 24"`, `<polyline points="15 18 9 12 15 6">`), identical
shape to the gallery's chevron. `styles.css`: `.cat-back-btn` dropped its now-unneeded
`font-size`/`line-height`, added `.cat-back-btn svg { display: block; width: 14px; height:
14px; }`; the mobile override (`.cat-drawer .cat-back-btn`, in the landscape media query)
dropped its own now-dead `font-size` and gained `.cat-drawer .cat-back-btn svg { width:
12px; height: 12px; }` so the icon scales down proportionally in the smaller 22px mobile
circle instead of staying pinned at the desktop 26px circle's icon size. Verified via
`node --check`, a CSS brace-balance check, and confirming the live local server serves the
updated markup/CSS. Files: `index.html`, `styles.css`.

---

## 2026-09-16 (Visible scrollbar wherever client content can actually overflow)

On request: a scrollable client list relied entirely on the platform's own default
scrollbar, which on mobile Safari/Chrome only flashes briefly on scroll and gives no
standing signal that there's more content below the fold.

`styles.css`: added a thin, gold-accented scrollbar (matching `#adminMenuTreeContainer`'s
existing style, and the app's gold accent generally) to `.cat-nav` (the drawer menu
itself — root menu, landmark categories, and tour/room pickers all share this one
element), `.brochure-canvas` (the PDF viewer on mobile Android), and `.contact-modal-right`
(the Contact card) — the three places client content can genuinely run long enough to
scroll. Uses both `scrollbar-width`/`scrollbar-color` (Firefox) and the
`::-webkit-scrollbar-*` pseudo-elements (Chrome/Safari), since neither alone covers every
browser. Deliberately not touched on the admin side — desktop browsers already show a
native scrollbar by default, and the admin menu tree already has its own matching one.
Verified: CSS brace balance intact, confirmed live on the running server.

Two rounds on the same button, same day. First report: both pause/play icons showed at
once — patched with a defensive `[hidden] { display: none !important; }` override.
Second report, right after: the underlying pause/resume worked (confirmed by the
slideshow actually stopping/starting), but the icon never visually swapped on click —
meaning the per-icon `hidden`-attribute toggling itself wasn't reliable, not just
losing to a CSS conflict.

Rebuilt on a sturdier pattern instead of chasing the `hidden` attribute further: a single
`.is-paused` class toggled on the BUTTON (`updateGalleryAutoplayBtn`, `classList.toggle`),
exactly like `.cat-drawer.is-collapsed` / `.cat-btn.is-active` already do elsewhere in
this file, with plain CSS descendant selectors picking which icon shows
(`.gallery-lightbox-autoplay.is-paused .gallery-autoplay-pause { display: none }` etc.)
instead of toggling `hidden` on two sibling elements individually. Removed the now
redundant static `hidden` attribute from the play icon in `index.html` and the
`[hidden]`-based CSS rule from the first patch. Verified live on the server.

Also worth ruling out if this resurfaces: `sw.js` serves `app.js` stale-while-revalidate
on mobile (cache-first, refreshes in the background for the NEXT load) — a hard
refresh/clear-site-data is worth trying before assuming a fresh code change hasn't taken
effect on a phone that already had the page open.

---

## 2026-09-16 (Gallery slideshow autoplay, with a pause/play toggle)

On request: photo galleries (both the `contentType:'gallery'` array form and a folder of
individual `image` items, e.g. anandman's 25 "GALLERY N" rows — both already share the
same viewer) now auto-advance every 4s (`GALLERY_AUTOPLAY_MS`) while open, wrapping via
`updateGallerySlide`'s existing modulo.

Added a play/pause toggle button (`#galleryAutoplayBtn`, `index.html`, styled to match
the existing close button) rather than shipping silent forced autoplay — a real estate
gallery is something a visitor may want to actually read, not have snapped away from
every few seconds. `startGalleryAutoplay`/`stopGalleryAutoplay`/`toggleGalleryAutoplay`
(`app.js`, next to `updateGallerySlide`): starts on open (`openClientGalleryModal`),
stops on close (`closeClientGalleryModal`), hidden entirely for a single-image "gallery"
(nothing to advance to). A manual Prev/Next/swipe/arrow-key calls
`restartGalleryAutoplayIfRunning()` — resets the countdown so a manual click isn't
immediately followed by an autoplay tick, without touching the visitor's own play/pause
choice (`galleryAutoplayOn`), which only the toggle button changes. Verified: `node
--check`, confirmed both the button markup and the JS are live on the running server.
Files: `app.js`, `index.html`, `styles.css`.

---

## 2026-09-16 (Compass: smaller on mobile landscape, more see-through)

Reported: the compass eats too much screen space on mobile. The existing landscape rule
sized it at a flat 74px — fine measured against viewport WIDTH, but this project's own
reference measurement for a real phone in landscape (~552x225 inner) means 74px is a
third of the available HEIGHT, which is what actually reads as "too much space."

`styles.css`: mobile compass size changed to `min(52px, 20vh)` (caps it at 20% of
viewport height on any landscape screen, so it keeps scaling down on an even shorter
window rather than landing on one fixed number that was only ever tuned for one phone).
Also lightened it globally (desktop included): `.cp-face` fill 0.16→0.09, `.cp-cone`
fill 0.20→0.12, backdrop blur 5px→3px and saturate 140%→125%, so more of the pano is
visible through the glass face. Ring/needle/labels untouched — they need to stay legible
over an unpredictable live sky. Files: `styles.css`.

---

## 2026-09-16 (Predictive caching: cross-tour LRU window + gallery neighbor prefetch)

On request, generalizing the existing same-tour room prefetch to two more places:

**Cross-tour prefetch** (`app.js`): added `prefetchNeighbourTours(tourId)`, next to the
existing `prefetchTourNeighbours` (one-hop rooms within an open tour). Warms the START
node of the next TWO tours and the previous ONE tour over `state.tours`' own order (the
same order the tour-list picker shows) — an explicit, requested asymmetric +2/-1 window,
not a general one-hop cache, since forward is the direction a visitor browsing a tour
list actually goes. Shares the same `tourTex` LRU as room prefetch; `TOUR_CACHE_MAX`
bumped 3→5 so the two prefetch kinds don't immediately evict each other (now ~895 MB VRAM
at the cap — flagged in `CLAUDE.md` as worth reconsidering if it turns out too heavy for
a lower-end mobile GPU). Called once per tour entry/switch from `openClientPanoTour`, not
per room move, since the window only depends on which tour you're in.

**Gallery neighbor prefetch** (`updateGallerySlide`, `app.js`): Prev/Next in a photo
gallery now prefetches the two adjacent images as plain `<img>` requests, so the browser's
own HTTP cache already has them by the time the visitor taps — no VRAM concern here (not
a WebGL texture), so no cap needed.

Verified: `node --check`, boundary-tested the +2/-1 window logic in Node (first/last tour
in a list correctly omit the out-of-range side, no wraparound), confirmed both live on
the running server. Files: `app.js`, `CLAUDE.md` (virtual tours code map + VRAM gotcha).

---

## 2026-09-16 (Client drawer auto-collapses after a real selection, not a menu navigation)

On request: the drawer stayed open after every selection, eating screen space over
content the visitor just chose to look at. Added `collapseClientDrawer()` (`app.js`, next
to `openLandmarksCategoryPicker`) — collapses `.cat-drawer` to its thin rail, same visual
state as tapping the toggle.

Wired at exactly the points that show real content, not menu structure: a landmark
category click (`renderLandmarkCategoryNav`'s `.cat-btn` handler), the folder-of-images
gallery action (`activateMenuNode`'s `'images'` branch), and every content type in
`openNodeContent` (video/pdf/gallery/contact/aerial/panotour/panotourroom/exittour/tour/
image/link) EXCEPT `'landmarks'` and `'virtualtour'` — both of those open a picker list
the visitor still needs to choose from (`openLandmarksCategoryPicker` explicitly
re-opens the drawer itself; `'virtualtour'`'s tour-list relies on the drawer staying
open), so collapsing there would hide the very list they need next. Deliberately NOT
wired to folder drill-down (`'menu'` action) or BACK — those are pure menu browsing, not
a real selection. Verified: `node --check`, confirmed live on the running server. Files:
`app.js`.

---

## 2026-09-16 (Virtual tour: seamless crossfade between tours, no more loading screen)

Reported: switching between tours in the client (e.g. MANDIR → GAZEBO, each its own
single-room tour) showed a jarring loading screen instead of a smooth transition.

Root cause: `openClientPanoTour` fully exited then re-entered on every tour-to-tour
switch — `closePanoTour` restored the aerial pano texture SYNCHRONOUSLY and disposed the
texture cache, then the function tore the plot map back down and waited on the new tour's
first texture, with the whole gap hidden behind a reused `#bootCurtain` (originally added
2026-09-09 to hide a worse "aerial view flashes" bug). Same-tour room navigation never had
this problem — it already crossfades via `tourGoTo`.

Fix (`app.js`, `openClientPanoTour`): stopped calling `closePanoTour` when switching
tours. Tour A's last frame now stays on screen, the ORIGINAL pre-tour `saved{}` snapshot
(aerial view/texture/northDeg) is carried forward unchanged instead of being re-derived
from whatever's currently on screen (which would otherwise corrupt "Exit Tour"), and
`tourGoTo` is called with `instant:false` so its existing crossfade dissolves tour A
directly into tour B's first room — the same mechanism same-tour navigation already uses.
A fresh entry from the plot map (no prior tour texture to fade from) still hard-cuts.
Removed `showBootCurtain()` and its call sites entirely (dead code once this was the only
caller) — `hideBootCurtain` now serves boot only, as originally intended. Verified:
`node --check`, confirmed live via the running server that the function and both former
call sites are gone. Files: `app.js`, `CLAUDE.md` (virtual tours code map).

---

## 2026-09-16 (Mobile drawer: BACK moved into the brand-row corner)

On request: the "‹ BACK" button used to take its own row below the logo/brand block on
every non-root menu level, wasting a full row in the already-tight ~140px landscape
drawer while the brand row itself had empty space to the right of a short tagline.
`styles.css` (same landscape media query): `.cat-drawer-inner` gets `position:relative` as
the positioning context; `.cat-back-btn` is pulled out of normal flow with
`position:absolute; top:2px; right:0` and overlaid on the brand row instead, with
`.cat-drawer-brand` given `padding-right:30px` so it has reserved space rather than
overlapping the name/tagline text (which varies in length per project). The submenu head
(`#catLevelSubMenu`'s head, previously BACK + title sharing one row — see the entry below)
now holds only the title, which gets the full drawer width to itself instead of a
squeezed half. Files: `styles.css`.

---

## 2026-09-16 (Fix: BACK button overlapping the menu — dropped absolute positioning)

Reported right after the redesign below: BACK was now overlapping the first row of the
Landmarks category list ("ALL LANDMARKS"). Root cause of BOTH this and the earlier
right-side collision: anchoring it to `.cat-drawer-inner` with `position:absolute`
placed it relative to the WHOLE drawer, independent of how tall the brand block above it
actually rendered at a given width — safe by luck at some sizes, not guaranteed at all
of them, and this time it wasn't.

Dropped the absolute-positioning approach entirely (two attempts, right corner then left
corner, both eventually collided with something) in favor of plain normal document flow,
which can't overlap what follows it by construction. `index.html`: both back buttons
simplified to just `‹` (dropped the "BACK" label entirely — a plain arrow is enough,
`aria-label="Back"` still names it for screen readers). `styles.css`: `.cat-back-btn` is
now a small 26px round icon button (22px on the tight mobile drawer) sitting in
`.cat-drawer-head`'s normal flow, above the nav list, one unified rule for every size
instead of separate mobile/desktop treatments. Removed all the padding reservations
(`.cat-drawer-brand`'s left/right padding) that existed only to keep the overlay clear of
the logo — no longer needed now that BACK isn't overlaying anything.

Verified: CSS brace balance intact, `node --check`, confirmed the simplified markup and
styles are live on the running server. Files: `index.html`, `styles.css`.

---

## 2026-09-16 (Menu: "more below" scroll hint + BACK button redesign, both sizes)

Two separate UX fixes requested together:

**Scroll hint.** A cut-off menu list gave no signal there was more below it — mobile
Safari/Chrome's own scrollbar is an ephemeral overlay that only flashes during an active
drag, never sitting there as a standing cue, and the custom thin scrollbar added earlier
this session doesn't change that platform behavior. Added a fade-to-drawer-tint hint at
the bottom of `.cat-menu-level` (`styles.css`, `.has-more-below::after`), toggled by real
scroll metrics (`updateNavScrollHint`, `app.js`) rather than a static decoration — it's
never shown once a visitor is genuinely at the bottom. Wired once at boot
(`wireNavScrollHints`, called from `wireViewControls`) via a `MutationObserver` +
`ResizeObserver` per nav container (`catNavL1`/`catNav`/`catSubMenuNav`) instead of
hand-calling it from every render site — three different functions replace these
containers' content across several branches/early-returns, and hooking each one by hand
is exactly the kind of thing that goes stale the next time a render path changes.

**BACK button.** Previously a plain bordered row below the brand on desktop, and a
right-corner overlay on mobile (from a few messages back) that collided with the
since-enlarged, since-centered logo. Both replaced with one unified design: BACK is now
a small pill-style button (a real background/border, not bare floating text — legible
over an unpredictable live pano) absolutely positioned in the top-**LEFT** corner of
`.cat-drawer-inner` on every size, matching the near-universal "back = top-left"
convention this was fighting before. Mobile shows the icon only (`.cat-back-txt` hidden
via CSS — no room for the word at 140px width); desktop keeps the label. The submenu
title, freed from sharing its row with BACK, now gets the row's full width on desktop
too (previously only fixed for mobile), wrapping a long title instead of truncating it.

Verified: CSS brace balance intact, `node --check`, confirmed all three files
(`index.html`/`app.js`/`styles.css`) serve the new markup/functions/rules on the running
server. Files: `index.html`, `app.js`, `styles.css`.

---

## 2026-09-16 (Fix: loading-screen image took seconds to appear — now preloaded)

Reported right after shipping the feature below: the loading-screen image itself took a
few seconds to appear — the thing meant to cover the loading wait was itself part of it.
Root cause: it was only discovered by the browser once app.js had loaded AND fetched
`alignment.json`, both of which had to happen before `applyBootImage()` even ran.

Fix, two parts:
1. **`index.html`**: a static `<link rel="preload" as="image" fetchpriority="high">` in
   `<head>`, built by a tiny inline script that parses `?project=` from the URL (mirrors
   `sanitizeProjectId`/`BOOT_PROJECT` closely enough to agree on the same path, can't
   reuse that code directly since it must run before app.js exists). Discovered by the
   browser's HTML preloader during the initial parse — before any JS runs — so the
   download starts immediately instead of waiting on the whole JS/data chain. Fires
   speculatively even for a project with no custom image (a same-origin 404, cheap and
   invisible); waiting to know for sure would reintroduce the delay.
2. This only works because the filename is fixed and predictable ahead of time — which
   meant giving up the usual `_ver` cache-busting query string this asset had (a static
   preload can't target a URL it doesn't know in advance). `bootImageSrc()` (`app.js`) now
   resolves the committed path bare. The staleness risk `_ver` normally guards against
   (an admin's replacement image sticking around in a visitor's cache) is covered instead
   by a short server-side cache lifetime specific to this one filename:
   `deploy_s3.py`'s new `BOOT_IMAGE_CACHE` (5 min, vs. the usual day-long `MEDIA_CACHE`).
   Local `server.py` already sends `no-cache` for project images regardless, so this only
   matters for the deployed S3/CloudFront path.

Also tightened the image's own compression while in there — 2000px/JPEG 0.85 (matching
the pano) down to 1600px/JPEG 0.78, since this is glanced at for a couple of seconds
while real content loads behind it, not studied up close.

Verified: `node --check`, `python -c "import ast..."` on `deploy_s3.py`, the inline
project-id-parsing logic tested directly in Node against real/missing/malicious inputs
(correctly extracts the id, defaults to "sample", and rejects a path-traversal attempt
rather than injecting it into the preload URL), confirmed live on the running server.
Files: `index.html`, `app.js`, `deploy_s3.py`, `CLAUDE.md`.

---

## 2026-09-16 (New feature: admin-uploaded loading-screen image)

On request: admin can now upload an image to show as the `#bootCurtain` background while
the client boots, instead of a plain dark screen — new "🖼 Loading page image…" control
in the Project Settings popover, next to Logo and Audio.

Built as a close mirror of the existing brand-logo pattern rather than something new:
`state.bootImage` (file/blob/name/_url/_ver, same shape as `state.audio`),
`setBootImage`/`clearBootImage` (image resized via the existing `resizeImageToBlob` at
2000px/JPEG 0.85 — the pano's own cap, since this is a full-screen background rather than
a small icon like the logo), `bootImageData`/`bootImageSrc`/`hasBootImage`
(serialize/resolve), `updateBootImageAdminUI`. `applyBootImage()` (`app.js`) sets
`background-image` + a `.has-image` class straight on `#bootCurtain` — no new DOM
element needed; `styles.css`'s `#bootCurtain.has-image::before` adds a darkening
gradient overlay so the "Loading…" label and progress bar stay legible over an
arbitrary photo (`position:relative` added to the label so it paints above the
overlay — an absolutely-positioned `::before` otherwise paints on top of ordinary
in-flow siblings).

Timing matters here: `applyBootImage()` is called in `init()` right alongside
`applyBrand()`/`applySiteAudio()`, deliberately as early as the alignment JSON is known —
well before the much larger pano/ground-image downloads the curtain is actually waiting
on — so the custom image covers most of the real loading window rather than flashing in
moments before the curtain hides.

Wired into every persistence path the brand logo/site audio already use, so it survives
a reload, a save-as/clone, and a server export the same way those do:
`alignmentData()`/`parseAlignment()`, `buildSession()` (IndexedDB — an unsaved upload
survives a page reload before Save), the manual "Load alignment file" admin control,
`fetchReferencedImages` (save-as clones it from the source project), the actual
`/api/save` file list, and `collectOfflineAssets()` (so it's included in the mobile
offline download). No standalone-bundle special-casing needed, unlike `panoImage`/
`groundImage` — this is a plain CSS `background-image`, not a WebGL texture, so it isn't
subject to the `file://` texture-tainting restriction those two need base64 embedding
for.

Verified: `node --check`, CSS brace balance intact, confirmed all three files
(`index.html`/`app.js`/`styles.css`) serve the new markup/functions/rules on the running
server. Not interactively click-tested in a real browser (this project's own convention:
admin-facing changes need a real human check, headless screenshot testing of admin mode
is documented as unreliable here) — try uploading an image via Project Settings, Save,
then reload the client to confirm the loading screen shows it. Files: `index.html`,
`app.js`, `styles.css`, `CLAUDE.md` (site branding code map + `alignment.json` schema).

---

## 2026-09-16 (Mobile drawer logo: centered + sized up again)

Follow-up to the entry below, same day: logo grown further (54x36px → 78x52px) and
centered within the brand row. Centering needed a real layout change, not just
`text-align` — the base row is a 2-column grid (`auto 1fr`, logo | name/tagline), and
since `.has-logo` only hides the name/tagline TEXT (not the grid track itself), the
empty `1fr` column still claimed space and kept the grid spanning the full row width,
so `justify-content:center` on the grid wouldn't have centered anything. Added
`.cat-drawer .cat-drawer-brand.has-logo { display: flex; justify-content: center; }` to
switch to a simple centered flex row for that specific state. Verified: CSS brace
balance intact, confirmed live on the running server.

---

## 2026-09-16 (Mobile drawer logo enlarged — was too small to read)

`styles.css`: mobile landscape `.cat-drawer-logo img` sized up from 24x18px to 54x36px.
Safe to grow without crowding anything else — `.cat-drawer-brand.has-logo` already hides
the project name/tagline text entirely whenever a logo is present, so the logo is the
only brand element on screen there; nothing competes with it for space. Verified: CSS
brace balance intact, confirmed live on the running server.

---

## 2026-09-16 (Mobile menu row spacing widened to stop mis-taps)

Reported: menu rows on mobile were close enough together to cause mis-clicks. Root
cause was the earlier drawer-compaction pass (same media query) that had tightened
`.cat-nav`'s row gap to 1px and `.cat-btn`'s padding to 4px — adjacent rows were
practically touching, well under safe touch-target sizing.

`styles.css`: gap 1px→6px, button padding 4px 5px→7px 6px. `.cat-nav` is shared by the
root menu, the landmark category list, AND the tour/feature submenu (all three render
into the same element), so this one change reaches everywhere the request covers
("menu and submenu"). Trades back some of the row density the earlier compaction pass
optimized for — a real mis-tap is worse than a bit more scrolling. Verified: CSS brace
balance intact, confirmed live on the running server.

---

## 2026-09-16 (Fix: submenu header broke at the new narrower drawer width)

Follow-up to the drawer-narrowing change below, same day: the room-picker/submenu header
(BACK button + a title like "VIRTUAL TOUR") is hardcoded inline in `index.html`
(`max-width:120px; white-space:nowrap`, sized for the old 250px drawer) — squeezed
side-by-side into a ~140px drawer, the title truncated to "VIRTUAL TO…" and the row
looked broken (reported as "the alignment is off"). Fixed in the same landscape media
query: `#catLevelSubMenu .cat-drawer-head` now stacks BACK above the title instead of
sharing one row, and `#catSubMenuTitle` gets `!important` overrides (max-width/white-space/
text-overflow — the only way to beat an inline `style=""` from an external stylesheet) so
a long title wraps onto its own line(s) instead of being cut off. Files: `styles.css`.

---

## 2026-09-16 (Mobile client menu: narrower drawer + smaller rows to reduce scrolling)

Reported: on mobile the client nav drawer covers ~30% of the screen. Real phone visitors
only ever see the drawer in LANDSCAPE (a portrait phone is blocked by `#rotateHint` until
turned), so the number that mattered was the landscape-scoped `.cat-drawer` width
(`min(250px, 78vw)`, ~30% of an 844px-wide phone) — the base/portrait rule (`min(282px,
82vw)`) is effectively only ever seen by a tablet.

`styles.css` (`@media (orientation:landscape) and (max-height:500px)` block): narrowed
`.cat-drawer` to `min(140px, 15vw)` — a hard ≤15% of viewport width on any landscape
screen. Shrank `.cat-btn` (13.5px→9.5px font, tighter padding), `.cat-drawer-inner`
padding, and the brand logo/name/tagline block so more menu rows fit on screen before
scrolling. Trade-off, inherent to the width cut: a long title ("LOCATION INTELLIGENCE")
now wraps to 2-3 lines instead of fitting one. Files: `styles.css`, `CLAUDE.md` (client
drawer gotcha).

---

## 2026-09-16 (Tour room compass: 4 directions → full 8-point compass)

Admin's "Compass facing" control on a tour room's start view (VIRTUAL-TOUR feature)
previously offered only N/E/S/W. Added the four diagonals (NE/SE/SW/NW at 45/135/225/315°)
so an admin can calibrate a room whose camera faces a diagonal wall/doorway instead of
picking the nearest cardinal and living with up to 45° of compass error.

Introduced `COMPASS_DIRS` (`app.js`, just above the Virtual Tours section) as the single
`[key, label, degrees]` source of truth, with `COMPASS_DIR_KEYS`/`COMPASS_DIR_DEG`/
`COMPASS_DIR_LABEL` derived from it — replaced four separate hardcoded N/E/S/W literals
(the `parseTours` validation whitelist, the admin `<select>` options, the `northDeg`
degree lookup in `tourGoTo`, and the save-confirmation label in
`setTourNodeDefaultView`) that would otherwise need editing in lockstep. Verified: all 8
keys/degrees/labels extracted and checked in Node, `node --check`. Files: `app.js`,
`CLAUDE.md` (compass-calibration gotcha).

---

## 2026-09-15 (Menu Builder tree polish + uncapped trace/site-plan image upload)

**Menu Builder admin tree** (`app.js`, `styles.css`): fixed a real pre-existing bug where
`.gallery-card:hover img {` was missing its closing brace — under native CSS nesting
(most current browsers), every rule after it, including all the tree/menu row styles,
was silently scoped as a descendant of that unrelated selector and never applied. Also
fixed `.tree-overflow-menu` missing a `.tree-overflow-menu[hidden] { display: none; }`
override (same `[hidden]`-vs-class-selector specificity trap logged elsewhere in this
file) — every row's `⋯` menu was rendering open simultaneously, stacked on top of each
other. Added drag-to-reorder (a `⠿` handle per row, HTML5 drag/drop restricted to
siblings under the same parent — `reorderNode()`) and double-click inline rename on the
title text, both wired into `renderAdminMenuTree()`.

**Trace/site-plan image upload, uncapped** (`traceLoadImage`, `app.js`): replaced the
flat `TRACE_MAX=4096` downscale with the same dynamic `min(PANO_TEX_CAP,
gpuMaxTexSize())` ceiling the pano already uses. An admin-uploaded site-plan image at or
under that size (device-dependent, commonly 8192) now passes through at full original
resolution — no resize, no resampling softness — where it previously always hit the
4096px cap regardless of the device's real capability. The cap itself isn't removable
entirely: it's a real WebGL texture-size constraint (the image becomes the ground drape
texture), not a discretionary quality setting, so an oversized source still clamps to
avoid a silently broken/blank ground plane. Also updated the file-too-large error message
to reference the real computed cap instead of a hardcoded "4096". Files: `app.js`,
`CLAUDE.md` (code map entry for `traceLoadImage`).

---

## 2026-09-12 (S3 + CloudFront deploy script for the client view)

`deploy_s3.py` (new). Deploys the CLIENT view of one project to an S3 bucket behind
CloudFront. Verified first that this is even possible: the client makes **zero** `/api/*`
calls (`initProjectBar` returns immediately when `!state.admin`), and `index.html` has no
root-absolute paths — so the client is already pure static hosting. The admin view is not
deployable this way and isn't meant to be; it needs server.py's save/upload/export endpoints.

Why a script rather than `aws s3 sync`:

- **Content-Type per file.** The CLI guesses from the extension and gets `.webmanifest` and
  `.webp` wrong — the same two `server.py` had to register by hand. Wrong types mean the PWA
  manifest is ignored outright and the newly-optimized WebP site-plan/panorama don't render.
- **Cache-Control per class.** `sw.js` and `index.html` must revalidate: a hard-cached
  service worker pins every visitor to an old build permanently, with no way to push a fix.
  `/vendor/*` and icons get a year; media a day; project config 60s so re-uploads show up.
- **`.originals/` must not ship** — ~950MB of pre-optimization backups living inside the
  project folder. Excluded along with every other dot-directory, matching `do_bundle`.
- **The unminified `vendor/three.module.js` is skipped** (1.3MB): `app.js` imports the `.min`
  build and `sw.js` precaches only that, so it is pure bulk in a deployment.
- **The version stamp.** `index.html` ships `app.js?v=${Date.now()}` and the same for
  `styles.css` — correct for local dev, actively harmful on a CDN: the URL is unique on every
  page load, so the browser can never reuse its copy and CloudFront misses the edge cache
  every single time. That is ~169KB gzipped of app.js + styles.css re-downloaded on EVERY
  visit, forever. The script rewrites both to one stamp per deploy (the short git SHA), so
  repeat visits answer `304` while a deploy still busts instantly. Only the uploaded copy is
  rewritten; the working tree keeps `Date.now()`.

**HTTPS is not optional**: service workers only run on HTTPS or localhost, so on a bare S3
website endpoint the entire PWA layer — offline mode, the install/download banner, cached
video — silently does not exist. CloudFront (or equivalent) is required, not a nicety.

Payload for `anandman`: 90 objects, ~292MB (343MB in the folder, of which ~55MB is
unreferenced leftovers — panoramas from deleted tours, the superseded `Low-Size.web.webp`,
`Connectivity.web.jpg`. Not auto-filtered: a wrong guess about what's referenced breaks
production, so pruning stays a deliberate manual step).

---

## 2026-09-12 (double-checked offline VIDEO for real; closed a first-visit gap that left a cached video unreachable)

`app.js`. User asked to double-check that video genuinely plays offline on mobile.
`readyState: 4` only says "enough data is buffered", so this verified the things that
actually matter: that the playhead advances in wall-clock time, and that seeking into the
middle and end of the file works — seeking is what truly exercises `sw.js`'s
cached-Range slicing (`respondRangedAsset`/`sliceRange`), since it has to synthesise a
`206` out of the stored full copy.

- **Confirmed working, with decoded frames as evidence.** With the "Add" download done:
  video 1 played and seeked to **70s and 130s** (of 138.4s) offline, rendering its real
  end-card frame; video 2 seeked to **60s** and rendered a real aerial-map frame. Playback
  advanced **4.01s of media time in 4.0s of wall clock** — genuine real-time playback, not
  a stalled buffer.
- **Confirmed the background priming path too**: simply *watching* ~10s of the video online
  silently pulled the **entire 43.7MB** file into `b91-media` (present within a second of
  checking), with no download prompt involved.
- **Found and fixed a real gap**: a visitor who DECLINES the offline banner and visits
  exactly once ended up with the full video cached and **no menu row left to reach it
  with**. A service worker only intercepts fetches once it controls the page, and on a
  genuine first visit it is typically still installing while boot fetches the project
  config — so `alignment.json` never got cached, and the next (offline) load fell back to
  the built-in rows alone: no LOCATION INTELLIGENCE, no BROCHURE, nothing authored. A
  second online visit fixed it by itself, which is exactly why it had gone unnoticed.
  Fixed with `warmOfflineConfigCache()`: once the worker reports ready, the ~30KB of
  per-project config is re-requested so it actually lands in the cache. Deliberately not
  extended to the pano/site-plan images — those are megabytes, and a visitor who wants
  them offline has the "Add" button. `collectOfflineAssets` now shares the same
  `OFFLINE_CONFIG_FILES` list so the two can't drift apart.

Measured before → after for the declining single-visit case: **menu rows 10 → 15, video
menu item present false → true, playback n/a → 4.01s advanced**. The second-visit case was
already fine and is unchanged. Both paths now behave identically.

---

## 2026-09-12 (cold-load latency: 29s → 9s to usable on 4G, 27.2MB → 5.6MB transferred)

`index.html` + project content. User asked to make the UI load fast and cut latency.
Profiled first rather than guessing: cold cache, service worker blocked (so it measures a
genuine first visit), Chrome DevTools throttling at 9 Mbps / 60ms RTT / 4× CPU slowdown.
Baseline was **29.1s to usable** (boot curtain cleared) and **27.2 MB** transferred, with
the entire critical path being three images:

- **`projects/sample/Demo.web.jpg` — 4.8MB, ~15s, downloaded on EVERY visit of EVERY
  project, and never actually shown.** It was hard-coded as `src` on
  `#clientContactImg` in `index.html`, so the browser fetched it during boot — but
  `openClientContactModal` unconditionally assigns `img.src` before showing the modal (the
  project's own contact photo, else the project pano, else a fallback), so the hard-coded
  one is never the image anyone sees. Removed the attribute; the fallback path is
  unchanged. Pure waste, zero behaviour change.
- **Ground/site-plan overlay 17.0MB PNG → 2.5MB WebP (85% smaller).** It's RGBA with real
  transparency (alpha extrema 0–255), so WebP, not JPEG — same approach as the earlier
  `Low-Size.web.png` conversion, and `server.py` already registers the `.webp` MIME type.
  Verified by compositing 100% crops over a checkerboard: road markings, "18.00 M WD ROAD"
  lettering, plot outlines and tree detail all preserved.
- **Main panorama 5.2MB JPEG → 2.7MB WebP (48% smaller)**, same 8192×4096 dimensions.
  Compared the highest-edge-energy tile in the image: mean absolute difference 1.4%, max
  channel delta 26/255 — a normal recompression delta, invisible at viewing scale.

Result: **9.1s to usable on 4G (3.2× faster), 5.6 MB transferred (79% less)**; 44.7s on a
1.6 Mbps 3G profile. The offline download also drops by ~20MB. Both originals were backed
up to `.originals/` — and, unlike the incident earlier in this session, the directory was
listed FIRST to confirm neither name was already taken.

Re-ran the full strict offline audit afterwards since `alignment.json` now points at
different filenames: still **66/66 assets available and 18/18 features working offline**,
and the map renders identically (screenshot-compared).

**Still on the table, not done** (it changes the asset pipeline, so it needs a decision):
`PANO_TEX_CAP` is 8192 but `loadPanoTexture` downscales to `gpuMaxTexSize()`, which is
4096 on most mobile GPUs — so phones currently download a 2.7MB 8192-wide panorama and
throw half the pixels away, paying a 33-megapixel decode plus a canvas downscale on top. A
4096-wide variant served when the GPU cap is 4096 would cut that to roughly 800KB and
speed up decode substantially, but it needs a second file per project plus handling in
`collectOfflineAssets`, the admin save path and the export bundle.

---

## 2026-09-12 (strict offline audit: virtual-tour panoramas were never downloaded — now 66/66 assets and 18/18 features verified offline)

`app.js`. User asked for a strict check of whether *everything* works offline for mobile
visitors. Built a data-driven audit rather than spot-checking: it parses the project's own
`alignment.json`/`tour.json`/`landmarks.json`, enumerates every local asset they reference
(66 for `anandman`), runs the real "Add" download, goes genuinely offline
(`context.setOffline(true)`), then fetches every one of those assets through the service
worker AND drives each feature in the UI.

- **Found: all 17 virtual-tour panoramas returned 503 offline.** `collectOfflineAssets()`
  walked the menu tree, landmarks, amenities and the pano/ground/logo/audio, but never
  `state.tours` — so across this project's 9 tours, not one room panorama was included in
  the offline download. Because a room's pano is only requested when a visitor opens that
  specific room, opportunistic runtime caching never reached them either unless someone had
  manually walked all nine tours while online. VIRTUAL TOUR was therefore the one headline
  feature that stayed broken with no signal: the tour list opened, every room landed on a
  blank sphere. Fixed by walking `state.tours` in `collectOfflineAssets()`, and adding
  `tour.json` to `DATA_FILES` (boot fetched it anyway, so it was cached by luck rather than
  by intent). The offered download grows from ~230MB to ~305MB for this project — that's
  114MB of tour panoramas that genuinely have to be there; the banner already shows the
  size up front and warns when it exceeds free space.
- **Three audit "failures" turned out to be bugs in the audit, not the app** — worth
  recording because each would have sent a future session chasing nothing: (1) the boot
  curtain is cleared with `classList.add('is-hidden')`, not `'gone'`; (2) `readPixels()` on
  three.js's WebGL canvas always returns blank because the renderer runs without
  `preserveDrawingBuffer`, so "1 distinct colour" said nothing about what's on screen; and
  (3) **the whole audit was running at a PORTRAIT phone viewport, where this app
  deliberately shows a "Rotate your phone — the map opens up in landscape" overlay instead
  of the map** — so every visual check was measuring that overlay. Re-run at 844×390
  landscape with screenshot-based checks, the map, plots, compass, legend and tour rooms
  all render. A single-node tour also has no `.tour-hs` hotspots, so "is a tour running"
  has to be read from the drawer's `✕ EXIT TOUR` row, not hotspot presence.

Final verified state, offline, real Chrome, genuine offline emulation: **66/66 assets
available, 18/18 features working** — app shell, project config, 360° panorama
(8192×4096), site-plan overlay, plot geometry, landmark categories, both videos
(`readyState 4`), all 25 gallery images, 4-page brochure PDF, contact card + photo,
background audio, and all 9 virtual tours including multi-room navigation through MODERN
VILLA's 9 rooms (screenshots confirm real imagery, not blank spheres).

---

## 2026-09-12 (the real cause of "video and images stopped working offline": the offline download was racing boot and only saving ~19KB of config)

`app.js`, `sw.js`. User report: "video and images worked perfectly well yesterday, and I
don't know what you changed today with the PDF that everything else is not getting played
in offline on mobile." Analyzed against yesterday's commit (`16ab80f`) before touching
anything. Three separate faults, all introduced or exposed by today's earlier work:

- **ROOT CAUSE — the offline download was collecting the wrong asset list.** Moving
  `registerOfflineSupport()` to the top of `init()` (done earlier today, so the worker
  could cache boot fetches) also moved the offline BANNER there, because the banner offer
  was fused to the end of that same function. The banner calls `collectOfflineAssets()`,
  which reads `state.menuConfig`/landmarks/amenities/tours to decide what to download —
  none of which are loaded yet that early in boot. So when the worker won the race, the
  banner collected only the handful of config files `collectOfflineAssets` adds
  unconditionally and offered a **19KB** download instead of the real **230MB** one.
  Tapping Add cached the config and nothing else: the menu worked offline while every
  video, image and PDF behind it was missing — precisely the reported symptom. Whoever won
  the race depended on connection speed and whether the worker was already installed,
  which is why it looked intermittent rather than simply broken. **Fixed by splitting the
  two concerns**: `registerOfflineSupport()` still starts at the top of `init()` and now
  just returns whether the worker became ready; the new `offerOfflineSaveAfterBoot()` is
  called at the END of `init()`, so the banner always measures a fully loaded project.
  Verified in a real browser: the same eviction scenario that offered "approx. 19 KB"
  before the fix offers "approx. 230 MB" after it.
- **A VERSION bump used to destroy the visitor's entire download.** `DATA_CACHE` and
  `MEDIA_CACHE` were version-namespaced, and `activate` deletes every cache not in the
  current version's list — so bumping v7→v8 for the PDF fix silently wiped ~200MB of
  already-downloaded content off every phone that had it, which is why "everything else"
  broke and not just the PDF. **Both content caches are now un-versioned** (`b91-data`,
  `b91-media`); only the SHELL stays versioned, since it's code and it's ~2MB to refetch.
  A new `migrateLegacyContentCaches()` folds any pre-existing `b91-data-v*`/`b91-media-v*`
  cache into the un-versioned one on activate — copying only complete `200` entries, so
  the corrupt partial responses the old PDF bug produced are dropped rather than carried
  forward — then deletes the drained legacy cache. Claim happens before migration so the
  page isn't left uncontrolled while a few hundred MB is folded over.
- **The banner could never re-offer once it had been dismissed or completed.** It skipped
  itself whenever the `b91-offline-saved-*` flag was set, and bailed out entirely under
  `isStandaloneDisplay()`. But that flag only records that a download once FINISHED — not
  that the content is still there; caches get evicted under storage pressure (iOS Safari
  also clears them after ~7 days unopened), and until today a version bump deleted them
  outright. A visitor left with the flag set and an empty cache had no route back short of
  clearing site data, and an INSTALLED visitor — opening from the home-screen icon, i.e.
  the exact audience this feature exists for — had no route at all. Now
  `countMissingOfflineAssets()` asks Cache Storage what is actually stored, the banner
  re-offers whenever content is genuinely missing (installed or not), and in standalone it
  presents as "Download for offline use · approx. N · so it works with no signal" instead
  of a meaningless "Add to Home Screen". The declined flag is still respected.

Verified end-to-end in real Chrome at phone viewport, with genuine `setOffline(true)`:
full download → offline reload → video `readyState 4` / no error / 138.4s, brochure 4/4
pages, gallery images all loaded; content survives a simulated version bump (legacy caches
migrated, 38 entries intact, video still plays); banner re-offers after eviction and in
standalone, and stays quiet once content is genuinely present. 15 ranged-cache unit tests,
8 cache-survival assertions and 5 banner assertions all pass.

---

## 2026-09-12 (offline banner permanently silenced by a stale SW_VERSION; separately, the working tree itself was found reverting on disk)

`sw.js`, `app.js`, `CLAUDE.md`, `CHANGELOG.md`. User asked why the "Add to Home Screen /
save for offline" banner wasn't showing on their phone, after the PDF/video
offline-caching fix below. Investigated instead of assuming the feature was removed (it
wasn't — traced `collectOfflineAssets`/`maybeOfferOfflineSave`/`runOfflineDownload`, all
intact).

- **Root cause — banner permanently silenced.** `app.js`'s `SW_VERSION` constant (used
  to namespace the banner's dismissal memory: `b91-offline-declined-${SW_VERSION}-<pid>` /
  `b91-offline-saved-${SW_VERSION}-<pid>` in `localStorage`) was hardcoded to `'v5'` and
  never bumped, despite its own comment saying "Must match VERSION in sw.js" — meanwhile
  `sw.js`'s `VERSION` had moved to `v6` (three.js minified swap), `v7` (video priming
  fix), then `v8` (PDF fix, below) over the course of this session. Any earlier tap of
  "Skip" (or a completed download) under the stale `v5` key stays permanently recorded —
  the banner can never show again for that project on that browser, no matter how much
  the underlying caching code changes, since the check is still reading the same old key.
  Fixed by bumping `SW_VERSION` to `'v8'` to match `sw.js`.
- **A separate, more alarming discovery made while fixing the above: the on-disk working
  copy of several files had reverted to an EARLIER state than what was actually committed
  in git**, without any edit tool call causing it. Concretely: `sw.js` on disk had gone
  back to the pre-PDF-fix code (`respondVideo`, `isRangedMediaPath`, `VIDEO_BLOB_CACHE`,
  etc.), `app.js`'s `registerOfflineSupport()` call had moved back to the END of `init()`
  (undoing the boot-timing fix below), and `CLAUDE.md`/this file had both lost their
  already-written PDF-fix documentation entirely — even though `git show
  5c41213:plot-map/<file>` proves the correct, fully-documented, committed state really
  did exist earlier the same day. **This was caught only by diffing the live disk files
  against the last known-good commit before trusting either one** — an in-context edit's
  own "file state is current" assumption is not a substitute for that check when
  something outside the edit tool (a synced folder, an editor with a stale buffer and
  autosave-on-focus, or similar) can rewrite a file between turns. This repo lives under
  a Windows user's Desktop, a path OneDrive syncs by default on many Windows setups —
  the most likely (though unconfirmed) mechanism. Fixed by restoring all four files from
  the last known-good commit and re-applying only the genuinely-new `SW_VERSION` fix on
  top. **If a future session finds a previously-verified fix apparently missing again,
  diff the live file against the relevant commit (`git show <sha>:<path> | diff - <path>`)
  before concluding the code regressed and re-deriving the fix from scratch — it may be
  the disk copy, not the code, that's stale.**

## 2026-09-12 (PDF brochure offline caching + a deeper boot-order fix; verified with a real end-to-end offline test)

`sw.js`, `app.js`. User asked to analyze PDF preview/offline behavior first, then confirmed:
"make sure the video and images are getting downloaded and can be previewed inside the
app, the pdf also gets downloaded the same way... for the online mobile users the pdf
should be previewed in the app itself."

- **Root cause (PDF)**: pdf.js reads a PDF progressively via HTTP Range requests, exactly
  like a `<video>` element — confirmed by capturing real network traffic (multiple `206`
  responses for different byte ranges of the same file). But `.pdf` wasn't in the file
  extension list routed through the safe ranged-asset caching path added the day before
  for video — it fell through to the generic `staleWhileRevalidate`, which caches
  whatever comes back under one key per URL. Since pdf.js's several range requests each
  return a *different* slice, each one overwrote the last under that same key — whichever
  slice landed last "won" and became the permanently cached (corrupted, partial) copy.
  Offline, pdf.js could never parse that fragment as a real document.
- **Fix**: extended the same safe-caching mechanism used for video to also cover PDFs.
  Renamed the (now no-longer video-specific) infrastructure for accuracy:
  `isRangedMediaPath`→`isRangedCacheablePath` (now includes `.pdf`), `respondVideo`→
  `respondRangedAsset`, `VIDEO_BLOB_CACHE`→`RANGED_BLOB_CACHE`, `VIDEO_PRIME_INFLIGHT`→
  `RANGE_PRIME_INFLIGHT`, `primeVideoCache`→`fetchAndCacheFull`. `VERSION` bumped
  `'v7'→'v8'`.
- **A second, real gap found and fixed in the same pass**: the plain (`!range`) fetch
  path and the ranged background-priming path weren't deduped against EACH OTHER — only
  against themselves. pdf.js commonly issues one main unranged streaming request
  alongside a few early ranged reads (e.g. for the xref table near the end of the file);
  before this fix, each of those two REQUEST SHAPES independently triggered its own full
  download of the same file — observed directly as two complete 36MB fetches for one
  brochure open. Unified both paths behind one shared `fetchAndCacheFull` tracker so
  whichever request (ranged or not) arrives first starts the one real fetch and every
  other concurrent request for the same key joins it. Verified with real service-worker
  console instrumentation (temporarily added, then removed) that exactly ONE real
  `fetch()` now happens per file, not two — Playwright's own network log still shows two
  "200" entries per fetch, which turned out to be how it reports a service-worker-
  mediated request (the worker's own outbound fetch AND the page-visible response,
  logged as two separate entries) rather than an actual duplicate download.
- **A separate, deeper bug found while verifying end-to-end**: `registerOfflineSupport()`
  was called at the very END of `init()`, after every boot-critical project file
  (alignment.json, plots.svg, landmarks/amenities/tour.json) had already been fetched.
  Since a service worker only intercepts fetches once it's actually active and
  controlling the page, NONE of that config was ever cached on a genuine first visit —
  confirmed directly: a real offline reload showed the menu collapsed to just the three
  built-in rows (AERIAL VIEW/LANDMARKS/VIRTUAL TOUR, the only items that don't depend on
  `menuConfig`), every authored menu item, landmark, and tour simply gone. Moved the
  (still fire-and-forget, non-blocking) registration call to the very start of `init()`
  instead, giving the worker the best realistic chance of being active before those
  fetches fire.
- **Verified end-to-end with a real browser, not just unit tests**: used Playwright
  driving the system-installed Chrome (`chromium.launch({executablePath: ...})`, no
  download needed) to load the live client, open a video and the brochure while online,
  poll the actual Cache Storage until both were confirmed fully cached, reload once more
  online (realistic — a visitor browses a bit before ever going offline), then call
  `context.setOffline(true)` and reload again for real. Result: the video's `readyState`
  was `4` (`HAVE_ENOUGH_DATA`) with no error and the correct duration; the PDF rendered
  the identical 4/4 pages it did online; every piece of project config, the pano, and the
  site-plan image all loaded with `200` while genuinely offline. Also re-verified the 19
  extraction-based unit tests (rewritten/extended for the rename + a new dedup-across-
  paths case) and the full accumulated 87-test suite from every other change this
  session — all clean.
- **Diagnostic note for later**: an early version of this same end-to-end test wrongly
  reported the video as never caching, due to a bug in the TEST's own matching regex
  (literal spaces that don't match a URL-encoded `%20`) — worth remembering that a
  negative result from custom verification tooling needs the same scrutiny as the code
  under test, not automatic trust.

---

## 2026-09-12 (mobile: videos now actually get cached for offline playback)

`sw.js`. User report, analyzed first: "for the mobile offline users are the videos not
getting downloaded."

- **Root cause**: `respondVideo`'s only cache-WRITE path lived in its `if (!range)`
  branch — i.e. it only ever saved a video the first time it was requested WITHOUT a
  `Range` header. Desktop browsers commonly make that first request as a plain GET;
  mobile browsers (iOS Safari reliably, Android often too) send a `Range` header on the
  very first request for a `<video>`/`<audio>` element, before playback even starts, just
  to probe the file. So on mobile that `!range` branch was essentially unreachable, and
  every video fell through to a bare network passthrough with no caching at all — on ANY
  visit, however many times it was played. The function's own comment already described
  the intended fix ("a separate unranged fetch kicked off in the background to prime the
  full-file cache for next time") but that fetch didn't actually exist anywhere in the
  code — comment and implementation had drifted apart.
- **Fix**: `primeVideoCache(cache, key, url)` (new) — when a ranged request finds nothing
  cached yet, it now also kicks off a second, plain (no Range header) fetch of the same
  URL purely to populate the cache, wrapped in `event.waitUntil()` so the service worker
  isn't torn down mid-download once the (unrelated) visible ranged response has been
  sent. `respondVideo` gained an `event` parameter to make that possible.
  `VIDEO_PRIME_INFLIGHT` (a key→Promise map) dedupes this: a video's several range
  requests (the metadata probe, then real playback, then any seeks) arriving while that
  background download is still in flight only ever start ONE fetch, not one per request
  — once it lands, `full` is set on the next request and the priming path is skipped
  from then on.
- **`VERSION` bumped `'v6' → 'v7'`** per this file's own stated policy (bump on any
  caching STRATEGY change) — not because existing cached videos are invalidated by this
  (they aren't; this is purely additive), just for consistency with v2/v5/v6's own bumps.
- **Verified**: `node --check` clean; a 10-assertion function-extraction test against the
  real `respondVideo`/`primeVideoCache` — confirmed the already-cached and
  uncached-plus-unranged paths are unaffected, confirmed the reported mobile scenario
  (uncached + ranged) now starts a genuine background priming fetch AND still answers
  the visible request immediately without waiting on it, confirmed the primed video is
  actually in the cache once that background fetch resolves, and confirmed 3 overlapping
  ranged requests for the same uncached video only ever trigger ONE background fetch —
  10/10 passed. Full accumulated suite from every other change this session re-run clean
  (78/78).

---

## 2026-09-11 (fixed the standalone export bundle actually failing to boot at all — `$` collision)

`server.py`. User report, asked to analyze first: "after doing export standalone site,
its not opening in offline mode."

- **Confirmed with a REAL headless-Chrome load of a real exported bundle** (Playwright +
  the system-installed Chrome, opening the extracted zip's `index.html` via a genuine
  `file://` URL — not a server, not a simulation) rather than reasoning about it: the page
  hung forever at "LOADING… 0%" with `[pageerror] Identifier '$' has already been
  declared`.
- **Root cause**: `module_to_global()` (added earlier this session, converts the vendored
  three.js ES module into a `window.THREE = {...}` global for the bundle's classic
  `<script src>` use) only rewrote the module's *trailing* `export {...}` line — every
  other one of the module's thousands of top-level `const`/`let`/`class` declarations
  (heavily minified single/double-letter names) was left as bare top-level code. Inside an
  ES module those are scoped to that module, invisible to anything else. Loaded as a
  classic script instead, top-level `const`/`let`/`class` declarations spill into ONE
  lexical scope SHARED by every `<script>` tag on the page — and the minifier had assigned
  one of ITS internal names to `$`, colliding head-on with `app.js`'s own top-level
  `const $ = (id) => document.getElementById(id);` helper. That collision is a
  `SyntaxError`, and a `SyntaxError` in a classic script means NONE of that script's code
  runs — not just the one colliding line — which is exactly why the whole app never booted.
- **Fix**: `module_to_global` now wraps the entire rewritten module body in an IIFE
  (`(function () { ...module body...; window.THREE = {...}; })();`), scoping all those
  internal declarations to that function instead of the page's shared scope. Only the
  explicit `window.THREE = {...}` assignment still reaches outside it — exactly the
  standard pattern real UMD/IIFE bundlers use for this exact reason.
- **Verified end-to-end, not just at the unit level**: re-exported a real bundle after the
  fix, loaded it in the same real headless Chrome via `file://`, and this time it fully
  booted — "LOADING… 100%", the real brand/menu/legend/compass all rendered, 2 canvas
  elements present — and a screenshot confirms the actual pano + plot overlay genuinely
  painted on screen, not just present in the DOM. Also re-ran the isolated
  IIFE-vs-collision reproduction in Node (simulate an app.js-shaped `const $` alongside
  the transformed output of both the dev and minified builds) to confirm the fix
  specifically closes the reported failure mode, not just "some" bundle-loading issue.
  A separate, unrelated finding surfaced during this test: `test12` (one of the projects
  used for a quick low-size re-test) has genuinely missing pano/ground-image files on
  disk — not a code bug, that project's own data is incomplete; `anandman`'s images are
  intact and were used for the definitive real-render confirmation instead.
- **Also noted, not fixed (cosmetic, doesn't block anything)**: the bundle's Contact-modal
  placeholder image (`projects/sample/Demo.web.jpg`, a static fallback `src` overwritten
  by JS before it's ever actually shown) 404s under `file://` since bundle mode uses a
  `data/` folder, not `projects/<id>/`. Worth fixing later; does not affect boot or any
  visible functionality.

---

## 2026-09-11 (real progress feedback for "Export standalone site…")

`app.js`. User report: "if the user clicks export standalone site how can he see the
downloading is even started or not there is no downloading progress animation."

- **Root cause**: `onProjAction` hides the project dropdown menu the instant any item in
  it is clicked (`els.projMenu.hidden = true`) — BEFORE `exportBundle()` even runs — so
  the "⬇ Export standalone site…" button itself is already invisible for the entire
  operation; swapping its own label (the pattern the header "💾 Save" button already
  uses) wouldn't be seen. The only feedback was a single `showNotice(...)` toast that
  auto-hides after a fixed 9 seconds regardless of whether the export — which can
  genuinely take a long time; a content-heavy project's zip was measured at 541MB in an
  earlier session test — was anywhere near done.
- **`showNotice(msg, {persist=false})`** — new option, skips the auto-hide timeout when
  `true`. A caller reporting live, repeated progress passes `persist:true` on every
  update so the message never disappears out from under an operation that's still
  running; the final "done" or "error" message reverts to a normal (non-persist) call so
  it still auto-hides as before.
- **`exportBundle()`** now reports BOTH real phases: "Building…" while `server.py` is
  still assembling the zip in memory (nothing to report yet — `fetch()` itself hasn't
  resolved), then switches to a live "Downloading… N% (X MB of Y MB)" once bytes start
  arriving, reusing `fetchBlobWithProgress` (already built for the boot progress bar) for
  real byte-level progress — throttled to at most 4 UI updates/sec so a fast LAN transfer
  doesn't hammer the DOM.
- **`fetchBlobWithProgress`** also improved to extract a real `{error}` message from a
  failed response's JSON body (several of this app's own API routes return one) instead
  of only ever showing a generic status-code message — a small, backward-compatible
  enhancement that benefits every caller, not just this one.
- **Verified**: `node --check` clean; a 9-assertion function-extraction test — persist
  vs normal `showNotice` timeout scheduling, and `fetchBlobWithProgress`'s new JSON vs
  plain error-message fallback — 9/9 passed; full accumulated suite from every other
  change this session re-run clean (68/68).

---

## 2026-09-11 (fixed the PWA offline cache — still referenced the old three.js file)

`sw.js`. User asked "is the export standalone file not working, first analyze and tell
me" after the load-time optimization work — traced every remaining reference to
`vendor/three.module.js` across the whole project (not just server.py, which was already
fixed) and found a second, separate bug in the PWA service worker's precache list.

- **The bug**: `SHELL_URLS` (the shell files precached for offline use on install) still
  listed `./vendor/three.module.js` — the OLD, now-unused dev build. Since that file is
  still on disk, the fetch quietly succeeded and cached it anyway, wasting ~1.3MB of a
  visitor's offline storage on a file the app never loads any more — while
  `three.module.min.js` (what `app.js` actually imports now) was never precached at all.
  A visitor who installed the site for offline use, then went offline, would find the 3D
  pano viewer unable to load THREE.js at all.
- **Fix**: `SHELL_URLS` now lists `./vendor/three.module.min.js`. Bumped `VERSION`
  `'v5' → 'v6'` per the file's own documented convention ("bump whenever the caching
  STRATEGY changes... so an already-installed worker cannot keep serving data under the
  previous rules") — necessary here since an already-installed v5 worker's shell cache
  has the wrong file in it; the version bump makes `activate` delete it and force a
  fresh precache under the corrected list.
- **Also checked and ruled out**: `spike/index.html` (an old dev prototype, not part of
  the live app or the export bundle) still references the old path too, but doesn't
  affect anything a visitor or the export feature touches — left alone.
- **Verified**: `node --check` clean on both `app.js` and `sw.js`; confirmed live via
  `curl` that the served `sw.js` has the corrected path and version.

---

## 2026-09-11 (site-wide load-time optimization: gzip, minified three.js, vendor caching)

`server.py`, `app.js`, `vendor/three.module.min.js` (new). User request: "decrease the
loading time of the overall website and make it fast." Audited actual response headers
and file sizes first rather than guessing — found three real, safe wins with zero
behavior change:

- **Three.js was shipping the full unminified DEV build** (`vendor/three.module.js`,
  1.3MB, 53,044 lines — a pretty-printed source build, not production output) on every
  single page load, client and admin alike. Downloaded the OFFICIAL minified r160 build
  (exact same version — confirmed via the `REVISION` constant, `unpkg.com/three@0.160.0/
  build/three.module.min.js`, three.js's own npm package) to
  `vendor/three.module.min.js` (670KB) and repointed `app.js`'s one import line at it.
  Verified the new build exports everything `app.js` actually uses (`WebGLRenderer`,
  `PerspectiveCamera`, `BufferGeometry`, `Mesh`, `Raycaster`, `SRGBColorSpace`, etc. — 21
  symbols checked) and, separately, a Node smoke test actually constructing a `Scene`/
  `Mesh`/`PerspectiveCamera`/`BufferGeometry` with the exact option shapes `app.js` uses
  — 9/9 passed. The old dev build is left on disk (harmless, unreferenced) in case
  THREE's own internals ever need debugging with readable stack traces.
- **The server sent zero compression, ever** (`server.py`'s `_serve_static`, inherited
  from `SimpleHTTPRequestHandler`) — confirmed via `curl -H "Accept-Encoding: gzip"`
  getting back full-size, uncompressed bodies regardless. Added on-the-fly gzip for
  text-ish MIME types (`text/*`, `application/javascript`, `application/json`,
  `application/manifest+json`, `image/svg+xml`) above 1KB, only on the plain full-file
  response path (the existing byte-range/streaming path for large media is untouched —
  gzip and Range together is genuinely complex and media files aren't compressible
  anyway). Falls back to the original uncompressed path for any client that doesn't
  advertise `gzip` support. Measured live: `app.js` 475KB→140KB (70%),
  `styles.css` 132KB→31KB (77%), `three.module.min.js` 670KB→167KB (75% — 87% off the
  original 1.3MB dev build combined with the swap above).
- **`/vendor/*` now gets a real `Cache-Control`** (`public, max-age=31536000,
  immutable`) — these are third-party libraries this project never edits in place (a
  version bump means a new filename), so they were the one class of asset safe to cache
  hard; everything else (`app.js`/`styles.css`/`index.html`, already cache-busted via
  their own `?v=` query string; project content under `projects/`; admin-editable data)
  stays `no-cache`, since those genuinely change and admin edits must show up on reload
  without a hard-refresh — unchanged behavior, verified nothing that needs to stay live
  got the long-cache treatment.
- **Verified**: `python -c "import ast; ast.parse(...)"` clean on `server.py`;
  `node --check` clean on `app.js`; live `curl` checks (local AND through the Cloudflare
  tunnel) confirming gzip negotiates correctly both ways, images/small manifests
  correctly skip compression, byte-range requests on `vendor/three.module.min.js` still
  return proper `206 Partial Content`, and the vendor cache header passes through the
  tunnel intact; the full accumulated test suite from every other change this session
  re-run clean (50/50) to confirm the import-path swap didn't disturb anything.
- **Caught and fixed a real break in the standalone export bundle before shipping**:
  `do_bundle`'s `strip_named_import`/`BUNDLE_SHELL`/the `elif rel == ...` copy check all
  hardcoded the OLD `vendor/three.module.js` path — after repointing `app.js`'s import,
  every future "Export standalone site…" would have shipped a bundle whose `app.js` still
  contained a bare `import` statement inside a plain (non-module) `<script src>` tag, a
  guaranteed `SyntaxError` in the browser. Found by tracing every reference to the old
  path, not just testing the live server. **Also found `module_to_global` — the function
  that rewrites the vendored ES module into a `window.THREE = {...}` global for file://
  use — silently produced INVALID JavaScript against the minified build specifically**:
  its regex spliced the raw `export {...}` list text into an object literal, which works
  for the dev build (bare names, e.g. `{Scene, Mesh}`) but not the minified build's
  aliased exports (e.g. `{nt as ACESFilmicToneMapping}` — `as` has no meaning inside an
  object literal, `SyntaxError: Unexpected identifier 'as'`, confirmed by actually
  executing the transformed output in Node, not just checking for a leftover "export"
  string). Rewrote it to parse each export item (aliased or bare) and emit a real
  `exportedName: localName` pair. Fixed all four references to use
  `vendor/three.module.min.js` throughout. **Verified end-to-end against the real
  endpoint**: downloaded an actual export bundle via `/api/export-bundle?project=
  anandman`, extracted just `app.js` and `vendor/three.global.js` from the real zip
  (skipping the project's own multi-hundred-MB embedded media), confirmed `app.js` has
  no leftover `import` statement and `three.global.js` actually executes in Node and
  produces a working `window.THREE.WebGLRenderer`/`.REVISION === '160'`.

---

## 2026-09-11 (a tour with only one room no longer shows a pointless room-list submenu)

`app.js`. Bug report with screenshot on the same-day drawer-integration change: a
"Swimming Pool" tour with a single room showed a drawer submenu with just that one room
(highlighted green, since it's also the only one and the one you're standing in) plus
Exit Tour — "I don't want to open a submenu when there is only one thing inside it,
unlike Modern Villa which has multiple [rooms] inside it."

- Exactly the same "one thing inside is never a choice" rule `resolveFolderTarget`
  already applies to ordinary authored folders (see its own top-of-file comment), now
  applied to tour rooms too: `openClientPanoTour` no longer pushes `tourRoomPickerNode`
  for a tour with `nodes.length <= 1`.
- Where the drawer lands instead depends on what else exists: 2+ tours total ⇒ stays at
  the tour list (`virtualTourPickerNode`) so switching tours is still possible; exactly
  one tour (and it has only one room) ⇒ falls all the way back to the ROOT menu.
- **The root menu can now carry an "✕ Exit Tour" row of its own** (new, in
  `renderClientSidebar`'s stack-length-0 branch and `wireClientSidebarButtons`) — needed
  for that last case, since a single-tour/single-room project has no picker level left to
  put it on, and a tour taking over the viewer still needs a visible way out. Also fixed
  the drawer's own hide condition, which previously hid it entirely when nothing was
  authored — now also checks `state.tourView` so the Exit Tour row doesn't vanish along
  with the rest of the (empty) root menu.
- **`withExitTourRow(children)`** (new, factors out what was a hardcoded array in
  `tourRoomPickerNode`) — appends the Exit Tour row only `if (state.tourView)`, shared by
  `virtualTourPickerNode` (which now also carries it, for the "2+ tours, active one has 1
  room" case) and `tourRoomPickerNode`.
- **`refreshTourRoomMenu`** extended to also highlight the active TOUR (not just the
  active room) when the tour list — rather than a room list — is what's currently shown.
- **Verified**: `node --check` clean; rewrote/extended the two relevant test files —
  `tourRoomPickerNode`/`virtualTourPickerNode` now assert the Exit Tour row only appears
  while touring (8/8), and a new `openClientPanoTour` suite covers all four room/tour-
  count combinations (multi-tour + 1-room active tour stays at the tour list; single-
  tour + 1-room falls to root; single-tour + multi-room still goes straight to the room
  list; multi-tour + multi-room drills as before) — 13/13. Full accumulated suite across
  every tour-related change this session re-run clean: 50/50.

---

## 2026-09-11 (multi-tour VIRTUAL TOUR click now auto-plays the topmost tour)

`app.js`. Explicit request, refining the same-day drawer-integration change: "if there is
more than one [tour] then only go inside it in the menu the same way we [do] for the
other thing in the menu, and when the user clicks on virtual tour it should directly
open the topmost virtual tour i.e temple in this case."

- **Before**: with 2+ tours, clicking the root VIRTUAL TOUR item only opened the tour-list
  picker in the drawer — nothing played in the pano until the visitor picked a tour by
  name. That's inconsistent with every OTHER multi-child menu item, and with LANDMARKS,
  which shows something (ALL LANDMARKS) the instant its own category list appears.
- **`openClientPanoTour(tourId, title, {anchorRooms=true})`** — new option. `true`
  (the default, unchanged for every other call site) drills the drawer straight to the
  opened tour's own room list. `false` stops one level up at the tour list instead —
  used ONLY by the root VIRTUAL TOUR click's multi-tour case, which now calls
  `openClientPanoTour(state.tours[0].id, state.tours[0].name, {anchorRooms:false})`:
  shows the tour list (matching generic folder "show my own children" behavior) while
  auto-playing `state.tours[0]` (the admin's own ordering — "Temple" in the reported
  case) so the visitor sees something immediately. Explicitly picking a DIFFERENT tour
  from that list still drills one level deeper into ITS room list (default `anchorRooms`).
- **Removed `openVirtualTourPicker`** — dead code once the root click stopped calling it
  directly (its one job, setting the tour-list anchor, is now just `anchorRooms:false`'s
  side effect inside `openClientPanoTour`).
- **Boot auto-open gets this for free**: `computeAutoOpenTarget`/`fireAutoOpen` dispatch
  through the exact same `openNodeContent` 'virtualtour' branch a real click uses, so a
  project whose top menu row is VIRTUAL TOUR with 2+ tours now also auto-plays the
  topmost tour on load, not just on a later click.
- **Verified**: `node --check` clean; a 7-assertion function-extraction test against the
  real `openClientPanoTour` (root click with `anchorRooms:false` shows the tour list only
  AND plays the topmost tour's start node; explicitly picking a named tour still drills
  to a 2-level stack; a single-tour project is unaffected, straight to its room list) —
  7/7 passed, plus the two pre-existing tour test suites re-run clean (23/23 combined).

---

## 2026-09-11 (virtual tour room navigation moved into the drawer; floating tour bar removed)

`app.js`, `index.html`, `styles.css`. Explicit request, discussed first: "the things
under virtual tour should come in menu same as that when we click landmarks all the
categories get shown up in the menu itself, and remove the bar which is shown in image
[the floating room-strip], when someone clicks virtual it should automatically open the
room which is on top of the menu."

- **`tourRoomPickerNode(tour)`** (new, next to `virtualTourPickerNode`) — the per-room
  analogue of the landmarks category list: a synthetic parent whose children are the
  open tour's rooms (`contentType: 'panotourroom'`, `content: {tourId, nodeId}`) plus a
  trailing **"✕ Exit Tour"** row (`contentType: 'exittour'`), rendered by the existing
  generic drawer submenu (`renderClientSidebar`'s drilled-in-parent branch) — no new
  rendering code needed, it's the same mechanism an authored folder or the tour-LIST
  picker already uses.
- **`openClientPanoTour`** now anchors the drawer to `[tourRoomPickerNode(tour)]`
  (one level) when the project has exactly one tour, or `[virtualTourPickerNode(),
  tourRoomPickerNode(tour)]` (two levels — pick a tour, then its rooms) when there are
  2+. Its existing `tourGoTo(tour.startNode || tour.nodes[0].id, {instant:true})` call at
  the end was already unchanged and already IS "auto-open the room on top" (the first
  room in `tour.nodes` order, which the room list also renders in) — nothing new needed
  there, just confirmed it still holds with the drawer now showing that same list.
- **`openNodeContent`** gained two contentTypes: `'panotourroom'` (jump to a specific
  room — walks within the current tour via `tourGoTo` if it's already open, otherwise
  opens the tour fresh via `openClientPanoTour` then jumps to the clicked room, since
  that would otherwise only land on the tour's designated start node) and `'exittour'`
  (`closePanoTour()`).
- **Removed the floating `#tourBar`** (title + room-strip pills + "✕ Exit tour", shown
  in the user's screenshot) entirely: `index.html` markup, all `.tour-bar*`/`.tour-chip`/
  `.tour-exit` CSS, `els.tourBar`, and `refreshTourBar()` (replaced by
  `refreshTourRoomMenu()`, a much lighter function that just toggles `.is-active`/
  `.is-busy` on the drawer's existing room-list buttons instead of rebuilding a separate
  DOM tree — `.cat-btn.is-active` already existed and is shared with every other drawer
  list). Admin already had its own equivalent room-jump control in the Tour tab's node
  list (the ▶ button) and its own "← Back to the plot map" exit button, so removing the
  bar for admin too (it had no `is-admin` scoping) does not strand admin workflow.
- **Drawer back-button is now tour-aware**: backing out of the room list (single-tour)
  or the tour list (multi-tour, one level further out) while a tour is open now calls
  `closePanoTour()` instead of just popping to a root menu that would otherwise show
  while the pano still displayed a tour room — a state this app has deliberately never
  allowed since the tour-anchoring work two days earlier. `isTourMenuNode(node)` (new)
  identifies both synthetic tour-related parents by id.
- **Verified**: `node --check` clean, CSS brace-balanced (751/751); a 17-assertion
  function-extraction test against the real `tourRoomPickerNode`/`isTourMenuNode` (room
  order/content/titles, the Exit Tour row, both synthetic-id checks) plus a
  reimplementation check of the back-button's exit-on-pop-out logic covering all four
  real scenarios (single-tour, multi-tour partial pop, multi-tour full pop, and an
  ordinary authored folder with no tour open never being mistaken for one) — 17/17
  passed. Confirmed live via `curl` against the running server.

---

## 2026-09-11 (fixed a jarring hotspot transition: crossfade-then-snap → snap-then-crossfade)

`app.js`. Follow-up bug report on the same-day "snap to start view" change: "shows a
camera angle and then cut to the room start view, which is not looking good."

- **Cause**: the camera-snap block (`state.view.lon/lat/fov = node.defaultView...`) ran
  AFTER the crossfade's `await tourTween(460, ...)` had already fully completed — so the
  entire 460ms fade played out at the visitor's stale, carried-over look direction, and
  only once it finished did the camera hard-cut to the new room's saved view. Two
  separate motions (a smooth fade at the wrong angle, then an abrupt jump) read as broken,
  not smooth.
- **Fix**: moved the `tv.nodeId`/`state.northDeg`/`state.view.lon,lat,fov` block to run
  BEFORE the texture swap/crossfade decision, right after the node's texture finishes
  loading. The crossfade (or hard swap) now plays out entirely at the correct, final
  camera angle — one clean cut immediately followed by a smooth fade, not the reverse.
- **Verified**: `node --check` clean; re-ran the existing 5-assertion `tourGoTo`
  extraction test (still 100% passing — confirms the reorder didn't change any of the
  already-verified snap/calibration behavior) plus a new 6th assertion added specifically
  for this bug: a mocked `tourTween` records `state.view.lon` at the moment its per-frame
  callback fires (i.e. *during* the fade) and confirms it already equals the target
  room's saved lon, not the stale pre-transition one.

---

## 2026-09-11 (tour hotspots now snap the camera to the target room's start view)

`app.js`. Explicit request, discussed first (an AskUserQuestion round-trip on animate-vs-
cut and scope before implementing): "when the user clicks on any of the hotspot inside
the virtual tour the camera should pan to the room's start view which was set by the
admin."

- **Diagnosis presented to the user before changing anything**: `tourGoTo(nodeId,
  {instant})` only ever applied `node.defaultView.lon/lat/fov` to `state.view` when
  `instant` was `true` — a fresh entry from the aerial map. A hotspot click
  (`tourGoTo(k.to)`, no `instant` passed), the room-strip thumbnail click, and the
  admin's own node-list click all default to `instant: false`, so the visitor's current
  look direction simply carried over unchanged into the new room ("heading continuity",
  a deliberate earlier design choice — not a bug).
- **Confirmed with the user**: cut instantly to the new room's saved view the moment the
  pano is done loading/crossfading, not an animated pan; applied to every non-instant
  arrival uniformly (hotspots, room-strip thumbnails, admin node clicks) rather than
  hotspots only, for consistency with the already-unconditional per-room compass
  calibration added the day before.
- **`app.js`**: removed the `if (instant) { ... }` gate around the `state.view.lon/lat/
  fov` assignment in `tourGoTo` — it's unconditional now, right after the crossfade (or
  hard pano swap) has already completed, so it reads as a cut rather than a pan mid-fade.
- **Verified**: `node --check` clean; a function-extraction test against the real
  `tourGoTo` (heavily mocked THREE/tour-cache/DOM dependencies) — 5/5 passed, covering a
  non-instant hotspot-style arrival snapping lon/lat/fov to the target room's saved view
  (starting from a deliberately different "mid-look-around" view to prove it's not
  carrying over), the per-room compass calibration still firing on the same arrival, and
  the pre-existing instant-entry path still behaving exactly as before.

---

## 2026-09-10 (boot progress bar; parallelized the pano + site-plan image fetches)

`index.html`, `styles.css`, `app.js`. User report: "the client wont know that something
is getting loaded... plot layouts with some delay over the background pano, also reduce
this delay."

- **Root cause found, not guessed:** on the live test project the pano
  (`Lifestyle.web.jpg`, ~5 MB) loads fine, but the ground-drape site-plan PNG
  (`groundImage`, the actual "plot layout trace" image draped on the ground — 26 MB in
  this project's case) was only fetched by `loadGroundImage` **after** `initThree()` had
  already revealed `#bootCurtain` — i.e. strictly *after* the pano was already visible,
  with a plain un-trackable `THREE.TextureLoader().loadAsync(url)` and no progress
  indication at all. That serial ordering, not plot-mesh construction (the test project
  has exactly one plot), was the actual delay the user was describing.
- **`app.js`**: added `fetchBlobWithProgress(url, onBytes)` — streams a `fetch` response
  body via its reader, calling `onBytes(loaded, total)` per chunk (`server.py` always
  sends `Content-Length` for static assets, confirmed by reading `server.py`, so `total`
  is reliable); falls back to a single non-streamed read if the runtime can't stream.
  Boot now pre-fetches the pano AND the ground/plan image **as plain Blobs, in parallel**
  (`Promise.all`), weighting the combined byte progress into an 8–98% range
  (`setBootProgress`, monotonic — never regresses on a stalled fetch) — 45/45 split when
  both need a real fetch, 90/0 (or 0/90) when only one does. `loadGroundImage` itself is
  unchanged (still needs the live `three` scene from `initThree`, so still runs after it)
  but now receives an already-downloaded Blob's object URL instead of a bare path, so the
  only work left at that point is a fast local texture decode, not a multi-second network
  wait — this is what actually closes the "pops in after the pano" gap, not just hides it
  behind a spinner. Session-restored blobs (`restored.pano.blob`/`restored.plan.blob`,
  admin-only) skip the fetch entirely (`instanceof Blob` check), same as before.
- **`index.html`**: `#bootCurtain` gained a bottom-anchored `#bootProgressWrap`
  (bar + `%` text) alongside the existing centered "Loading…" label.
- **`styles.css`**: `.boot-progress-wrap`/`.boot-progress`/`.boot-progress-fill`/
  `.boot-progress-pct` — thin gold fill bar, `position:absolute; bottom:28px`.
- **Scoped to first boot only**: `hideBootCurtain()` now sets progress to 100% and
  permanently hides `#bootProgressWrap` the first time it's called (`bootProgressDone`
  flag) — `#bootCurtain` is reused later for tour-to-tour switching
  (`showBootCurtain()`/`hideBootCurtain()` in `openClientPanoTour`), and without this a
  later reuse would show a stale "100%" bar instead of just the plain label it showed
  before this change.
- **Verified**: `node --check` clean; a function-extraction test against the real
  `setBootProgress`/`fetchBlobWithProgress` source (monotonic clamping, DOM reflect,
  streamed-chunk byte accounting against a mocked `fetch`, throws on a non-ok response) —
  9/9 passed. Confirmed live via `curl` against the running server.
- **Not fixed, flagged instead**: the 26 MB ground-image PNG itself is oversized content
  (4096×4096 RGBA that compresses poorly under PNG), not a code bug — parallelizing its
  fetch with the pano's helps a lot but doesn't shrink the file. Left untouched rather
  than silently re-compressing the admin's uploaded content; recommended re-exporting/
  re-uploading it through a resize pipeline (like `setPanoFromFile` already does for the
  pano) if further reduction is wanted.

---

## 2026-09-10 (per-room virtual-tour compass calibration)

`app.js`, `styles.css`. User request: clicking "Set as this room's start view" should
also offer a direction (N/E/S/W) so the compass points correctly once that room opens in
the virtual tour.

- **Why per-room, not project-wide**: each tour node's pano has its own arbitrary
  "lon 0" (whatever the photographer was facing when it was shot), unrelated to the main
  aerial pano's own (separately-set) `state.northDeg`. A single global calibration can't
  be correct for every room in a multi-node tour.
- **Admin (Tour tab)**: a new "Compass facing" `<select>` (Not set / North / East / South
  / West) sits directly above the existing "🏠 Set as this room's start view" button;
  its currently-picked value is read at the SAME click that saves the start view, so both
  are stored together on `node.defaultView.facingDir` (`setTourNodeDefaultView(facingDir)`
  now takes the picked value). Persisted through `parseTours`/`buildToursData` and through
  session save (already spread via `{...n.defaultView}`).
- **Client**: `tourGoTo` now computes `state.northDeg` on every arrival at a node (not
  gated on `instant` — a room's north/lon relationship is a fixed property of that room,
  independent of whatever the live carried-over camera yaw is): `northDeg = -(node.
  defaultView.lon) - {N:0,E:90,S:180,W:270}[facingDir]`, the exact algebraic inverse of
  `updateCompass()`'s existing `rot = -view.lon*180/PI - northDeg` formula, so at the
  saved start view the compass cone lands exactly on the picked direction. An uncalibrated
  room (`facingDir` unset) falls back to `northDeg = 0`, matching the project's documented
  "uncalibrated ⇒ 0" default rather than leaking in the aerial pano's own calibration or a
  previous room's. The aerial's own `northDeg` is snapshotted into `state.tourView.saved`
  on tour entry and restored by `closePanoTour` on exit, same pattern as the saved camera
  view — so leaving the tour doesn't leave the aerial compass miscalibrated.
- **Files**: `app.js` (`setTourNodeDefaultView`, the hotspot-box DOM builder, `tourGoTo`,
  `openClientPanoTour`, `closePanoTour`, `parseTours`, `buildToursData`,
  `addTourNodeFromFile`), `styles.css` (`.ax-tour-dvrow`/`.ax-tour-dirlbl`/
  `.ax-tour-dirsel`).
- **Verified**: `node --check` clean; a standalone math test replicating the calibration
  formula against `updateCompass`'s real formula — 6/6 passed (all four directions, a
  relative-rotation sanity check, and the uncalibrated fallback).

---

## 2026-09-10 (removed the top-bar "N plots · project · synced HH:MM:SS" status + Refresh button)

`index.html`, `app.js`, `styles.css`. Explicit request from a screenshot of the sync
status strip: "remove this frpm both admin and client side."

- Removed the `.sync` div (`#syncMeta` + `#refreshBtn`) from `index.html`'s topbar
  entirely — it had no `is-admin` scoping, so it showed on both sides.
- **`app.js`**: deleted `setSync()`/`refresh()` and their three call sites (the button's
  own click listener, the boot success path's `setSync(src)` call, and the boot error
  path's `els.syncMeta.textContent = 'Load error'` — the latter was already redundant
  with the `showNotice(...)` call right after it). The unused `src` binding from
  `await loadData()` was cleaned up at the same time.
- **`styles.css`**: removed the now-dead `.sync`/`.sync-meta` rules (base + the
  narrow-topbar responsive override).
- **Verified**: `node --check` clean; `grep` for `syncMeta`/`refreshBtn`/`setSync` across
  all three files and the live server returns zero hits.

---

## 2026-09-10 (Available/Reserved/Sold legend scoped to the aerial view only)

`app.js`, `styles.css`. Clarified (after an AskUserQuestion round-trip — the user's first
phrasing said "landmark section," corrected to "aerial section") request: the plot-status
legend should disappear whenever the visitor isn't looking at the base plot map.

- **`app.js`**: `isAerialSectionActive()` — a structural check (`!state.tourView && `
  `catLevel2 hidden && menuNavStack empty`), not a separately-tracked flag, so it can't
  drift from what the drawer is actually showing. `updateLegendVisibility()` toggles an
  `.is-hidden` class on `els.legend`/`els.zoomStatusGroup` (the header chips and their
  landscape-mobile stand-in). Called from `openLandmarksCategoryPicker`, the LANDMARKS
  back-button handler, and both branches of `renderClientSidebar` (root-menu render AND
  the drilled-in-submenu render — the latter is what makes VIRTUAL TOUR and tour entry/
  exit work for free, since `openClientPanoTour`/`closePanoTour` already call
  `renderClientSidebar` after setting `state.tourView`/`menuNavStack`).
- **`styles.css`**: `.legend.is-hidden { display: none; }`,
  `.zoom-status-group.is-hidden { display: none !important; }` — compound class
  selectors, deliberately NOT relying on source order or `[hidden]`, to sidestep this
  project's own recurring `[hidden]`-vs-`display` specificity trap.
- **Verified**: `node --check` clean; an 8-scenario function-extraction test against the
  real `isAerialSectionActive`/`updateLegendVisibility` (boot, landmarks open/close,
  submenu drill in/out, tour enter/exit, and touring-while-anchored-to-the-tour-picker
  simultaneously) — 8/8 passed.

---

## 2026-09-10 (compass redesign: thinner needle rose, then a frosted-glass look)

`index.html`, `styles.css`. Two rounds: first matched a reference nautical-rose image the
user resent ("make sure you use this as compass" — the earlier session's compass had
drifted, apparently lost between turns like this project's own documented "work
disappears from disk between turns" gotcha), then "make the compass look transparent and
more aesthetic and visually appealing."

- **Round 1 (match the reference)**: narrowed the main/intercardinal rose points from an
  8-unit base width to ~5.2 (needle-like instead of chunky triangles), thinned the ring
  from a 5px solid band + 1.4px inner ring to a single ~2px ring, shrank/relocated the
  N/E/S/W labels from just outside the ring to inboard near the tips (font-size 16→12),
  narrowed the red north indicator from a full-width wedge to a thin needle, and
  contained the heading "cone" shadow's radius inside the ring instead of overshooting it.
- **Round 2 (glass look)**: `.compass` gained `backdrop-filter: blur(5px) saturate(140%)`
  (frosted glass over the live pano) + `border-radius:50%` to clip it; `.cp-face` dropped
  to `rgba(255,255,255,.16)` with a new SVG `<radialGradient id="cpFaceGrad">` highlight
  layered on top; ring/rose/hub colors moved from flat white/black/gray to translucent
  `rgba(...)` equivalents; `.cp-ring` gained a soft `drop-shadow` glow; `.cp-n` (north
  needle) changed to a brighter `#ff3b3b` with its own glow. Labels kept an opaque navy
  fill + white halo (not made transparent) — they sit over an unpredictable live pano
  photo, not a plain page, and a translucent label would vanish over a bright sky.
- **Files**: `index.html` (`#compass` SVG: rose polygon points, label positions, new
  `<defs><radialGradient>`, cone path), `styles.css` (`.compass`, `.cp-*`).
- **Verified**: `node --check`/brace-balance N/A (CSS+SVG only); confirmed live via
  `curl` against the running server after each round (the compass had reverted to a
  pre-fix state between turns at least once this session — re-verified rather than
  assumed before reporting it fixed).

---

## 2026-09-10 (removed the directional pad — drag/flick is the only look-around input now)

`index.html`, `app.js`, `styles.css`. Explicit request from a screenshot of the client
pano showing the ▲◄►▼ overlay: "remove this."

- **`index.html`**: deleted the `#dpad` div and its four buttons entirely.
- **`app.js`**: removed `els.dpadUp/Down/Left/Right`, `DPAD_SPEED`, `startPush`/`endPush`,
  `wireDpad()`, and its call site. **Kept `stepViewMotion`/`state.viewVel`** — checked
  first that they're shared with drag-flick inertia (`wireViewControls`'s pointerup
  handler seeds `viewVel` from a flick's speed; `renderLoop` calls `stepViewMotion` every
  frame regardless of what set the velocity), so removing the d-pad could not mean
  removing those. `stepViewMotion` itself was simplified: it used to ease `viewVel` toward
  a `state.viewPush` TARGET set while a d-pad button was held; with nothing left to ever
  set that target, it now just decays whatever velocity a flick left behind toward zero —
  the actual behaviour was already unaffected for drag-coasting (which never used a
  nonzero push target), so this is a real simplification, not a functional change.
  `state.viewPush` removed from `state`'s initial object along with it.
- **`styles.css`**: removed `.dpad`/`.dpad-btn`/`.dpad-up/-down/-left/-right`, their
  landscape-phone size overrides, and — since it's now entirely moot —
  `body.tour-open .dpad` (the bottom-offset fix from two days ago that lifted the d-pad
  above the tour bar). `body.is-admin .compass, body.is-admin .dpad` lost its now-dead
  second selector.
- **Verified:** `node --check` clean, CSS brace count balanced (763/763), no duplicate
  `id=` in `index.html`, zero remaining references to "dpad" anywhere in the three files.
  6 assertions against the actual extracted `stepViewMotion` confirm drag-flick coasting
  still behaves identically post-simplification: residual velocity still moves the view
  and decays to a clean stop, and zero velocity is immediately reported as "not steering"
  with no NaN or unexpected movement — the removed `push`-target logic wasn't silently
  load-bearing for the case that's kept.

---

## 2026-09-10 (mobile: removed the landmark density cap, shrank banners further instead)

`app.js`, `styles.css`. Explicit request after confirming the cap was hiding landmarks
on mobile: "don't do that, let's make the banner size and font size small for the mobile
view instead of that."

- **`LANDMARK_MOBILE_CAP` set to `Infinity`** (was 4, lowered from 6 just yesterday) —
  every landmark now renders on a landscape phone exactly as it does on desktop; nothing
  is hidden behind a "+N more" tap any more. Left as a one-constant change rather than
  restructuring `renderLandmarks()` — `capSet`/`hiddenCount` stay in the code as
  harmless dead plumbing (the count can never exceed `Infinity`), trivially reversible if
  density ever becomes a problem again at these smaller sizes. `#lmOverflowHint` simply
  never shows now (its `hiddenCount === 0` check is always true).
- **Landscape-phone landmark/amenity sizing shrunk further** (in the same
  `@media (orientation:landscape) and (max-height:500px)` block added yesterday):
  `.lm-ico` 12px→10px, `.lm-label` 11px→9px, `.lm-sub-bar` 8.5px→7px, `.am-ico` 13px→11px,
  `.am-label` 10px→8.5px, with tighter padding/gap throughout — since decluttering is now
  entirely this shrink's job with nothing hidden to fall back on.
- **Verified visually**: the real `.lm-banner` markup, 6 landmarks positioned close
  together, screenshotted at the landscape-phone breakpoint — noticeably smaller than the
  previous pass, text still legible, all 6 rendering simultaneously (none hidden).
  Some residual overlap for landmarks at very similar bearings is the accepted tradeoff
  of "show everything, smaller" over "cap the count" — consistent with what was asked
  for. `node --check` clean, CSS brace count balanced (779/779), confirmed present in
  the live server's served files.

---

## 2026-09-09 (clicking LANDMARKS early in boot showed a genuinely empty picker panel — root-caused via screenshot, confirmed with a clarifying question first)

`app.js`. Reported via two screenshots — a "‹ BACK" panel with nothing else in it, versus
the correct root menu — after a general "any problem opening pano/landmarks on mobile"
discussion. Asked which button led to the empty panel before assuming anything (the
absence of a title next to "Back" ruled out the VIRTUAL TOUR picker and pointed
specifically at Landmarks); confirmed: LANDMARKS.

- **Root cause:** the root menu (with LANDMARKS clickable) renders early in
  boot — synchronously, before the pano texture even starts loading. `#catNav` (the
  landmark category list) isn't populated until `setLandmarks()` runs, much later in the
  same async chain, after the pano AND plot data have both finished loading. A visitor
  who taps LANDMARKS in that window — which a slow connection (a phone, or this session's
  Cloudflare tunnel, documented elsewhere as slower under load) makes much easier to hit —
  saw `#catNav` in its raw initial state. That state used to be a a hardcoded fallback
  category list; earlier today (2026-09-09) it was emptied on the assumption
  `renderLandmarkCategoryNav()` would always populate it before anyone could reach it —
  which this disproved, turning "shows the wrong categories briefly" into "shows nothing
  at all, with no way to tell it's not broken."
- **Fix:** call `renderLandmarkCategoryNav()` once more, immediately after the root
  menu's own early render — it's already idempotent and safe with zero landmarks loaded
  (it always emits at least an "ALL LANDMARKS" button), so an early tap now sees a real,
  clickable picker instead of a dead panel. `setLandmarks()`'s existing call still
  refreshes it with the real categories once they're actually known.
- **Checked the other two built-in rows for the same race, since the same boot-order gap
  applies to all of them equally:** AERIAL VIEW is safe already — `state.home` defaults to
  a sane `{lon:0,lat:0,fov:70}`, so an early tap just flies to a reasonable default rather
  than computing against not-yet-loaded geometry. VIRTUAL TOUR is also already safe — its
  handler explicitly checks `state.tours.length` and shows a plain, honest notice
  ("no virtual tours yet") when tapped before `setTours()` has run, rather than assuming
  data is ready. LANDMARKS was the one exception, since its picker had no such guard and
  no longer had a non-empty fallback to fall back on.
- **Verified:** `node --check` clean. 4 assertions against the actual extracted
  `renderLandmarkCategoryNav`/`getLandmarkCategories`/`effectiveLandmarkCategory` —
  calling it with zero landmarks loaded produces the "ALL LANDMARKS" button and nothing
  else (not blank, not the wrong categories), and calling it again once real landmark
  data exists correctly refreshes to the real category list. Confirmed present in the
  live server's served `app.js`.

---

## 2026-09-09 (mobile landmark clutter: the existing size-reduction rule targeted a mode phones never actually reach)

`app.js`, `styles.css`. Reported as overlapping, cluttered landmark banners on mobile.
Discussed before building: a size-reduction rule for landmark/amenity labels already
existed (`@media (max-width:720px) and (orientation:portrait)`), but the user pointed out
there's no portrait mode for mobile — correct: `#rotateHint` blocks all interaction until
a phone is turned to landscape, so that rule has **never applied to a real phone visitor
in practice**. Every mobile visitor has been seeing full desktop-size banners the whole
time, cap or no cap.

- **New landscape-scoped shrink**, added to the existing `@media (orientation:landscape)
  and (max-height:500px)` block (the one already used for the compass/d-pad/topbar/zoom-
  controls landscape-phone overrides, kept together rather than opening a new breakpoint):
  `.lm-ico`/`.lm-label`/`.lm-sub-bar` and `.am-chip`/`.am-ico`/`.am-label` all get smaller
  font sizes and tighter padding, scoped `body:not(.is-admin)` to match every other rule
  in that block (admin's own editing view is unaffected on any orientation).
- **`LANDMARK_MOBILE_CAP` lowered 6 → 4** — the cap alone wasn't enough on its own once it
  became clear the accompanying font shrink had never actually been reaching a real
  phone; fewer, now-smaller banners compete for the same space.
- **Verified visually**, not just reasoned about: the real `.lm-banner` markup rendered in
  an isolated page and screenshotted at a plain desktop-sized viewport vs. the
  landscape+short one that triggers the new rule — visibly smaller icon blocks and text
  in the landscape case, same markup and positions in both. `node --check` clean, CSS
  brace count balanced (779/779), confirmed both changes present in the live server's
  served files.

---

## 2026-09-09 (drawer stays anchored to the VIRTUAL TOUR section for as long as any tour is open)

`app.js`. Reported: switching rooms, or switching from one tour to another (e.g. "Room"
to "Tour 2"), should keep the drawer's menu inside the virtual tour section rather than
resetting to the plot map's root menu. This directly revises the entry-side half of
2026-09-09's earlier "exit tour → default menu" fix: that fix reset
`state.menuNavStack = []` on BOTH entering and exiting a tour — correct for exiting, but
wrong for entering/switching, which is what's being corrected here.

- **`virtualTourPickerNode()`** (new): the synthetic "folder" object (one row per tour,
  built live from `state.tours`) factored out of `openVirtualTourPicker()` so it can be
  reused — both the picker AND the tour takeover itself now push the same node.
- **`openClientPanoTour`**: instead of resetting `state.menuNavStack = []`, it now sets
  `state.menuNavStack = [virtualTourPickerNode()]` — for BOTH a fresh plot-map→tour entry
  and a tour-to-tour switch. Reopening the drawer at any point while a tour is active
  shows the live list of tours (ready to switch again), never the root menu. Rebuilt
  fresh on every entry/switch rather than left as whatever pushed it, so it can't go
  stale if a tour was added/renamed since it was last shown.
- **`closePanoTour`'s exit-to-root reset is UNCHANGED** — only actually leaving the tour
  (not switching within/between tours) drops the drawer back to the plot map's default
  menu, per the explicit earlier request that this behaviour stay that way.
- Room-to-room switching (`tourGoTo`) still never touches `menuNavStack` at all, so it
  was already consistent with "stay inside the tour" before this fix and needed no change.
- **Verified:** `node --check` clean. 6 assertions against the actual extracted
  `openClientPanoTour`/`closePanoTour`/`virtualTourPickerNode` — a fresh entry anchors the
  menu to the tour section (listing every tour, confirming quick-switch is actually
  possible from there, not just theoretically), switching from tour "Room" to "Tour 2"
  keeps that same anchor rather than resetting, and exiting still drops all the way to a
  genuinely empty root stack.

---

## 2026-09-09 (tour bar stayed visible after exiting a tour — the classic `[hidden]`-vs-`display` specificity trap, again)

`styles.css`. Reported via screenshot right after the previous fix: LANDMARKS correctly
exited the tour and showed the real aerial pano with landmark banners — but the room-strip
bar ("ROOM · 4._Living_Room · ... · ✕ Exit tour") stayed sitting on screen underneath it.

- **Root cause**: `.tour-bar { display: flex; ... }` sets its own `display` unconditionally
  and has no `[hidden]` counterpart, so at equal CSS specificity the author rule (always
  later in the cascade than the browser's own `[hidden]{display:none}`) wins regardless of
  the `hidden` DOM attribute — `els.tourBar.hidden = true` (set correctly by
  `closePanoTour`, confirmed by reading the code) had **zero visual effect**. This is the
  exact same class of bug this file has hit twice before (the install banner, an admin
  modal) — `CLAUDE.md` already documents it as a recurring trap, and this makes three.
- **Fix**: added `.tour-bar[hidden] { display: none; }`. Checked whether the tour's other
  toggled element (`#tourLayer`, the hotspot overlay) has the same issue — it doesn't; it
  carries no `display` override of its own, so the native `[hidden]` behavior already
  applies there untouched.
- **Verified visually**, not just reasoned about: an isolated page with two `.tour-bar`
  elements (one plain, one `hidden`) screenshotted in headless Chrome — before this fix
  both would render; after, only the non-hidden one does. CSS brace count balanced
  (773/773), confirmed present in the live server's served `styles.css`.

---

## 2026-09-09 (AERIAL VIEW / LANDMARKS now exit an active virtual tour first, instead of acting on the room's own pano)

`app.js`. Reported: clicking AERIAL VIEW or LANDMARKS while inside a virtual tour should
return to the real default view / landmark picker, not do something to the tour room
itself; room-to-room switching within a tour should be unaffected. Confirmed the exact
mechanism with the user before building (see the "let's first analyze" exchange).

- **Root cause, for both:** neither `openNodeContent` branch knew a tour could be open.
  **AERIAL VIEW** computed a camera angle from the plot layout's own geometry and
  animated the camera there — but the PANO TEXTURE was still whatever tour room was
  loaded, so the move just re-aimed within the room's own 360° image at a meaningless
  angle; the real aerial pano was never touched. **LANDMARKS** called
  `openLandmarksCategoryPicker()` → `applyCategoryFilter('ALL')` →
  `applyLandmarkVisibility()`, which unconditionally does `els.landmarks.hidden =
  !state.showLandmarks` — force-UN-hiding the landmark banners/pins that the tour
  takeover had explicitly hidden, rendering them on top of the room's pano — plus aiming
  the camera at a landmark cluster computed against plot-map geometry, again while the
  wrong pano was showing.
- **Fix:** both branches now check `if (state.tourView) closePanoTour();` first —
  synchronously exits the tour (restores the real pano/plots/ground/landmarks-per-their-
  own-rules) — before doing their normal action, so "face north" and "open the landmark
  picker" both run against the actual, restored plot map. When no tour is open, this is a
  pure no-op (the `if` simply doesn't fire) — verified NOT to change existing behaviour
  for the already-correct non-touring case.
- **Room-to-room switching needed no change** — `tourGoTo` (used by the tour bar's room
  chips and hotspots) never touched the drawer or `state.tourView` in a way that could
  exit the tour, so staying "inside the tour" while moving between rooms was already
  correct; confirmed by inspection, not just assumed.
- **Verified:** `node --check` clean. 10 assertions against the actual extracted
  `openNodeContent` — with no tour open, `closePanoTour` is never called and both actions
  behave exactly as before; with a tour open, `closePanoTour` fires and is confirmed to
  run BEFORE the camera move / picker open (not after, which would still show the wrong
  pano for one frame), and `state.tourView` is confirmed actually cleared in both cases.

---

## 2026-09-09 (re-applied the d-pad/tour-bar overlap fix + tour-transition curtain — reverted between turns)

`app.js`, `styles.css`. The previous entry's three fixes (d-pad/tour-bar overlap,
exit-resets-menu, tour-switch loading curtain) were reported still broken via a
screenshot identical to the one that triggered them. Checked the live server directly
(`curl .../styles.css`, `curl .../app.js`) before assuming anything about the browser:
`body.tour-open .dpad`, `showBootCurtain`, and `switchingTours` were **entirely absent**
from both the served files AND the on-disk source — the whole previous turn's app.js and
styles.css changes had reverted, while the turn before that (the Tour tab grid fixes) was
still intact. This matches this file's own documented "verified work can disappear from
disk between turns for reasons outside normal editing" gotcha exactly — re-applied
without further forensics, per that entry's own advice, and added a note at the fix's
own location flagging that this specific one has already vanished once, so a next
occurrence isn't mistaken for a fresh regression.

- Re-applied verbatim: `body.tour-open .dpad { bottom: 78px; }` (+ its landscape-media
  counterpart, `body.tour-open:not(.is-admin) .dpad { bottom: 56px; }`, placed after the
  existing landscape block so it wins on the specificity tie), `showBootCurtain()`, and
  the `switchingTours`/`menuNavStack` reset logic in `openClientPanoTour`/`closePanoTour`.
- **Verified twice this time**: 10 assertions against the actual extracted functions (same
  suite as before — recreated after discovering the scratchpad copy of the test script had
  *also* disappeared, a session-local casualty of the same event, not a project file), AND
  a direct `curl` of the LIVE server's served `styles.css`/`app.js` confirming the fix is
  actually reaching a browser this time, not just present in the editor's view of the
  source. `node --check` clean, no duplicate `id=` in `index.html`.

---

## 2026-09-09 (admin Tour tab: fixed the orphaned delete "×" and truncated target dropdowns; clarified the two viewer-exit buttons)

`app.js`, `styles.css`. From a screenshot of the admin Tour tab. Two real layout bugs and
one clarity request.

- **Every node row's delete `×` was rendering on its own line below the row, instead of
  inline at the end** — root cause: `.ax-tour-node` declared a 3-column CSS grid
  (`grid-template-columns: auto 1fr auto`) but the row actually appends FOUR children
  (star, ▶ open, name, ×); the 4th had no column to land in and CSS grid's default
  auto-placement dropped it onto an implicit new row. Fixed: `auto auto 1fr auto`.
- **The hotspot target `<select>` showed truncated text** ("3._Washroom" as "3._Was") in
  both the existing-hotspot row and the "add a hotspot" row — both squeezed a label
  input, an arrow, a select, and (for the first) a delete button onto one `display:flex`
  line in a ~240px-wide sidebar, and the select lost the fight for room. Reflowed
  `.ax-tour-hsrow` into a 2-row grid (label + delete on top, arrow + full-width select
  underneath) and `.ax-tour-hsadd` into a stacked column (select above the button) — the
  same "give it its own line instead of forcing it to share" fix already used earlier
  today for the Align/Landmarks/Amenities/Tour tab strip.
- **The two viewer-exit buttons ("set start view" / "close viewer") were visually
  identical** (same class, same ghost outline) with nothing to tell them apart at a
  glance, and the close button's `✕` icon is the SAME glyph `.ax-lm-del`/the hotspot
  delete buttons use for actual deletion just above it in the same panel — a benign
  navigation action wearing a destructive-looking icon. Now: "🏠 Set as this room's start
  view" is a gold `btn-primary` (this app's confirm/save colour), "← Back to the plot map"
  is a plain ghost button with a left-arrow instead of `✕` and its own tooltip ("Leaves
  this room and returns to the plot map — the tour itself is unaffected") — the previous
  version had no tooltip on this one at all.
- **Verified visually**, not just reasoned about: reproduced the exact real markup/CSS in
  an isolated page and screenshotted it in headless Chrome (the same technique used for
  the compass restyle and the earlier tab-strip fix today) — confirmed every delete `×`
  now sits inline, both dropdowns show full node names, and the two exit buttons read as
  clearly different actions. `node --check` clean, CSS brace count balanced (767/767).

---

## 2026-09-09 (VIRTUAL TOUR becomes a third built-in menu row, matching LANDMARKS exactly)

`app.js`, `styles.css`. Request: "same as landmarks, things that are added in the tour
section should automatically come as virtual tour in the menu and set this also as a
built in and everything like toggle info that other builtin have i.e aerial view and
landmarks should be in virtual tour as well." Fully parallels the LANDMARKS builtin —
same movable/draggable node design (2026-09-09, earlier today), same ON/OFF switch, same
▾ info arrow, same live-data-in-the-expansion pattern, same click-to-jump +
double-click-to-rename on each item inside it.

- **`BUILTIN_DEFS`** (new, `{ aerial, landmarks, tour }` → `{contentType, title}`) replaces
  the two hardcoded strings `ensureBuiltinNodes()` used to loop over — the `tour` builtin's
  own content type is **`'virtualtour'`**, deliberately NOT `'tour'`, since that name is
  already taken by the EXTERNAL 3DVista/Kuula iframe content type; conflating them would
  have broken `openNodeContent`'s existing dispatch for one or the other.
- **Client behaviour (`openNodeContent`'s new `'virtualtour'` branch)** — the exact
  analogue of LANDMARKS' "show whatever exists" pattern, but for `state.tours`: zero tours
  → a plain notice pointing at the admin Tour tab; exactly one → opens it directly (no
  point picking from a list of one, same reasoning `openClientPanoTour`'s own
  single-tour-forgiving fallback already uses); two or more → **`openVirtualTourPicker()`**
  (new), which pushes a SYNTHETIC parent node (children generated live from `state.tours`,
  one row per tour) onto `state.menuNavStack` and reuses the EXISTING generic Level-2/3
  drilled-in submenu UI — the same one an authored folder with 2+ children already uses.
  Since these synthetic children were never authored into `menuConfig.tree`,
  `renderClientSidebar`'s submenu click handler gained a fallback: try `findNodeInfo`
  first (real tree), and if that comes back empty, look the id up in the pushed parent's
  own `children` array instead — this is what lets a fully generic navigation level serve
  both real folders and this one synthetic case with no special-casing at the render layer.
- **Admin menu builder**: `renderBuiltinNodeRow` generalised from two builtins to three
  (`BUILTIN_ICON`/`BUILTIN_INFO` maps, keyed by `node.builtin`) — the 🌐 icon and its own
  info text. **`renderBuiltinTourList()`** (new) is `renderBuiltinLandmarkCategories()`'s
  counterpart: a flat list (tours aren't grouped, unlike landmarks-by-category) of every
  tour with its node count, in the ▾ expansion. **Uses its own CSS classes
  (`.builtin-tour-row`/`.builtin-tour-title`), not the landmark ones** — sharing
  `.builtin-lm-row`/`.builtin-lm-title` would have also caught these rows in the
  LANDMARKS wiring block (a blanket `querySelectorAll('.builtin-lm-row')`), sending a
  tour-row click to the Landmarks tab with an undefined landmark id instead of the Tour
  tab with the right tour selected — wired identically otherwise (click → `setAdminTab
  ('tour')` + `selectTour(id)`; double-click the name → rename via `tour.name` +
  `onToursChanged()`).
- **`computeAutoOpenTarget`**: a builtin `virtualtour` row on top shares the exact same
  fire-timing lane as an authored `panotour` item (`kind: 'panotour'`), since both need
  `state.tours` populated before they can act — no new boot-sequencing needed, the
  existing "fire right after `setTours()`" call site already covers it.
- **`anandman` data cleanup**: the project already had an empty, manually-authored
  "VIRTUAL TOUR" folder anticipating this feature — removed, since the new builtin now
  covers that exact role automatically and the two would otherwise sit side by side as a
  confusing duplicate. `anandman` genuinely has 3 real tours in its `tour.json` (t2: 4
  nodes, t6: 1 node, t8: 4 nodes), so this is a real multi-tour picker test case once
  loaded, not just a synthetic one.
- **Verified** via the same real-function-extraction method used throughout this
  project: 11 assertions against the actual extracted `ensureBuiltinNodes`/
  `BUILTIN_DEFS`/`computeAutoOpenTarget` plus a faithful reimplementation of the
  `openNodeContent`/`openVirtualTourPicker` dispatch — three builtins inject in the
  right order with the right content types, the tour builtin's `contentType` is
  confirmed `'virtualtour'` (not colliding with the external `'tour'` type), zero/one/2+
  tours each produce the right behaviour, a synthetic picker child is confirmed NOT
  findable via `findNodeInfo` (proving the fallback path is actually exercised, not
  accidentally bypassed), activating it opens the right specific tour, the tour builtin
  correctly shares the `panotour` timing lane when it's on top, a fully-disabled set of
  builtins falls through to null, and repeated `getMenuTree()` calls never duplicate the
  tour builtin. `node --check` clean, CSS brace count balanced (765/765), no duplicate
  `id=` in `index.html`.
  ⚠️ Not yet confirmed with a real click-through — dragging the row, watching the switch/
  arrow/expansion render inline, and the actual picker submenu appearing in the drawer are
  all owed a real browser check; this project's headless tooling can't reliably exercise
  either admin drag-and-drop or the client drawer's navigation stack live.

---

## 2026-09-09 (admin Align/Landmarks/Amenities/Tour tab row: fixed the clipped "Tour" label)

`styles.css`. From a screenshot of the admin sidebar header. Root-caused by reproducing
the exact markup+CSS in an isolated page and screenshotting it directly (this project's
live-app headless boot is unreliable, but a static CSS reproduction with no app logic
behind it isn't — same technique used for the compass restyle earlier today): `.ax-tabs`
was `display:flex` with all four tab buttons at `flex:1`, splitting the sidebar's ~240px
usable width four ways (~55px each). "Landmarks"/"Amenities"/"Tour" don't fit in that,
and the rightmost one — "Tour" — was being clipped at the sidebar's edge, rendering as
"Tou" with the last letter cut off entirely. Confirmed with a before/after screenshot of
the isolated reproduction: before shows the clipped "Tou"; after shows all four labels
intact.

- **`.ax-tabs`**: `display:flex` → `display:grid; grid-template-columns: 1fr 1fr` — a 2x2
  grid instead of a 4-across row. Each tab now gets roughly double the horizontal room,
  comfortably fitting every current label on one line, and the layout now echoes the
  Look-around/Move-layout toggle immediately below it (`.ax-mode`, already the same
  `1fr 1fr` grid) instead of mixing two different row patterns in the same panel.
- **`.ax-tab-btn`**: dropped the now-irrelevant `flex: 1` (grid columns handle sizing),
  added `white-space: nowrap` (belt-and-braces against any future longer tab name
  wrapping instead of just getting tight) and an explicit `text-align: center`.
- **Verified**: CSS brace count balanced (765/765), and — since this project's headless
  tooling can't reliably boot the live admin page (see CLAUDE.md's gotchas) — an isolated
  static reproduction of the exact markup/CSS was screenshotted in headless Chrome both
  before and after the fix, showing the clipped "Tour" label and its correction directly,
  not just reasoned about from the CSS.

---

## 2026-09-09 (AERIAL VIEW now faces north — the compass points straight up, not wherever the layout's centroid sits)

`app.js`, `index.html`. Request: "when clicked aerial view the camera should pan to
north, that is compass should pan to north." Previously the AERIAL VIEW action called
`computeHome()` and used its `lon` directly — which is the mean direction of the site
layout's own geometry (a "look at the middle of the plots from above" framing), something
that has no relationship to true north at all; the compass would land wherever that
centroid happened to sit.

- **`northFacingLon()`** (new, right next to `updateCompass()`): the exact algebraic
  inverse of `updateCompass()`'s own heading formula (`rot = -view.lon*180/PI - northDeg`;
  `rot` is 0 — cone at 12 o'clock, i.e. pointing north — when `view.lon = -northDeg` in
  radians). An uncalibrated project (`northDeg` unset, the compass's documented default)
  resolves this to lon 0.
- **AERIAL VIEW's handler** (`openNodeContent`'s `'aerial'` branch — the one live code
  path, used by both a real click and the auto-open-as-default-screen case) still calls
  `computeHome()` for its pitch/FOV (nadir, max zoom out — unchanged, still a sensible
  "full site overview" framing) but now flies to `northFacingLon()` instead of
  `state.home.lon` for the direction. The ⊡ recenter icon and the admin reset button,
  which also use `computeHome()`, were deliberately left untouched — the request was
  specifically about the AERIAL VIEW menu action, and changing an established, separate
  control wasn't asked for.
- **Removed now-genuinely-dead code found while touching this area**: a one-time
  `wireViewControls` block wired `.cat-btn` clicks on `#catNavL1`/`#catNav`'s ORIGINAL
  static placeholder markup, at boot, before `renderClientSidebar()`/
  `renderLandmarkCategoryNav()` ever replace that markup's `innerHTML` — so those
  listeners were attached to DOM nodes thrown away before a visitor could ever click them,
  and the block's own copy of the aerial handler was a second, now-stale place the
  centroid-vs-north bug could have been "fixed" without anyone noticing the live code path
  was untouched. `#catBackBtn`'s wiring (a stable element, never replaced) was kept.
  `index.html`'s static placeholder buttons inside `#catNavL1`/`#catNav` (referencing
  content-type names and category names that no longer even match the current builtin-
  node/live-category-data design) were emptied out to match — both navs are populated
  entirely by their respective render functions.
- **Verified:** `node --check` clean, no duplicate `id=` in `index.html` (258, unchanged
  count — only inner button markup was removed, no ids). 7 assertions against the actual
  extracted `updateCompass`/`northFacingLon` — facing north always reads as rot≈0 on the
  compass across the default and five different calibrated `northDeg` values, and a
  genuinely off-north view is correctly NOT read as zero — confirming the two formulas
  are true inverses of each other, not just "close."
  ⚠️ Not yet confirmed with a live click in a real browser — this project's headless
  tooling can't reliably exercise the animated camera fly-to itself (see CLAUDE.md's
  gotchas on why), so this is verified at the math level, not watched happening on screen.

---

## 2026-09-09 (compass restyled to a classic nautical rose, matching a supplied reference image)

`index.html`, `styles.css`. The user supplied a reference image (a standard nautical
compass rose: white/black split 8-point star, solid red north spike, gray ring, bold navy
N/E/S/W outside it) and asked to use it as the compass. The existing compass already had
the right STRUCTURE (an 8-point rose split light/dark, a separate red north overlay, two
ring circles, N/E/S/W labels) from its 2026-09-07 redesign — this was a palette swap, not
a rebuild, and the fixed-rose/rotating-cone BEHAVIOR (north stays at the top, a shaded
cone sweeps to show heading) is unchanged, since the reference is a static rose image and
says nothing about how a live heading indicator should move.

- `.cp-dk`/`.cp-sm-dk` (the star's dark halves): blue-gray → solid near-black (`#14161a`).
- `.cp-ring`: translucent white → solid gray (`#9aa0a8`), thicker (2px → 5px) to read as
  the reference's donut band. `.cp-ring-2`: a second, thinner light-gray ring.
- `.cp-face`: switched from a radial gradient (`url(#cpFace)`, now-unused `<defs>` removed
  from `index.html`) to a flat translucent white, closer to the reference's plain white
  face while staying an HUD overlay rather than a fully opaque disc.
  `.cp-n` (the north spike) keeps its existing solid red — already correct.
- `.cp-lbl`: white-with-dark-outline → bold navy (`#1b2a6b`) with a white outline instead
  of removing the outline entirely — a flat navy label with no halo would vanish over a
  dark patch of the pano photo, which the reference's plain-white background never has to
  contend with. `.cp-lbl-n`'s separate reddish N styling was removed (the reference shows
  all four letters in the same navy; only the spike is red) — N now shares `.cp-lbl` with
  the others.
- **Verified visually** (not just code-reasoned): built an isolated standalone HTML page
  with the exact compass markup/CSS and screenshotted it in headless Chrome (this project's
  documented live-app headless limitations — async boot timing, WebGL — don't apply to a
  static SVG+CSS page with no app logic behind it) — gray ring, white/black star, red
  north spike, navy labels with a legible halo, and the rotating cone all render as
  intended, closely matching the supplied reference. `node --check` clean, CSS brace count
  balanced (765/765), no duplicate `id=` in `index.html`, no leftover reference to the
  removed gradient/class anywhere in the codebase.

---

## 2026-09-09 (a video default screen now actually autoplays)

`app.js`. Request: "the video should auto play if its on top of the menu as its acting as
a default screen." A video menu item auto-opened by `autoOpenTarget` already went through
`openClientVideoModal` — the exact same function a real click uses, which already calls
`player.play()` / appends YouTube-Vimeo `autoplay=1` — so on paper this should already
have worked. It didn't, for a browser reason specific to firing with no click behind it:
**a real click IS the "user gesture" browser autoplay policies require for unmuted
playback; an automatic boot-time `play()` call has none, so the browser silently rejects
it and the video just sits paused** — invisible in code (the rejection is swallowed by
`.catch(() => {})`) and easy to miss without watching it happen. Autoplay policies exempt
MUTED playback from the gesture requirement, so that's the fix.

- **`autoOpen` threaded through the click path**: `fireAutoOpen` → `activateMenuNode(node,
  {fromRoot, autoOpen: true})` → `openNodeContent(node, info, {autoOpen})` →
  `openClientVideoModal(title, content, {autoOpen})`. A REAL click never sets it (stays
  `false` by default at every level), so manual playback is byte-for-byte unchanged —
  this only ever fires differently for the no-gesture auto-open path.
- **Direct `<video>` (mp4/webm/etc.):** `player.muted = !!autoOpen` set unconditionally
  right before `.play()` — unconditionally because the player element is reused across
  opens, so a later MANUAL open of a different video must not inherit a stale mute left
  over from an earlier auto-opened one. `controls` (already on `#clientVideoPlayer` in
  `index.html`) gives the visitor a one-tap unmute.
- **YouTube/Vimeo:** `getYoutubeEmbedUrl(url, muted)`/`getVimeoEmbedUrl(url, muted)` gained
  a second parameter appending `&mute=1` / `&muted=1` (their respective real param names)
  only when true — the manual-click call sites simply don't pass it, so their output is
  identical to before.
- **Verified:** `node --check` clean; 5 assertions against the actual extracted
  `getYoutubeEmbedUrl`/`getVimeoEmbedUrl` confirming the no-argument and `false` cases
  produce byte-identical output to before the change (manual click unaffected) and the
  `true` case adds exactly the right mute param for each platform.
  ⚠️ Owed a real check: does the target browser actually honor `muted` set via JS on an
  autoplay-attributed `<video>` fired with zero gesture, and do YouTube/Vimeo's players
  accept mute this way from an iframe `src` set with no gesture either — this is standard,
  well-documented autoplay-policy behavior, but "should work per spec" and "confirmed
  working in this exact modal" are different claims, and only the first is established
  here.

---

## 2026-09-09 (AERIAL VIEW / LANDMARKS become ordinary, draggable menu items)

`app.js`, `styles.css`. Request: "even landmark and aerial view should be movable in the
menu section in the admin and whoever is on top of the menu will be default even in
presence of landmark and aerial view." The previous design (`menuConfig.builtins`, two
entries up) deliberately made these two rows fixed-first and non-draggable, to protect
them from being lost — the right call at the time, wrong once "should be movable" became
the actual requirement.

**Redesigned: AERIAL VIEW and LANDMARKS are now ordinary tree nodes**, marked
`builtin: 'aerial'|'landmarks'`, living wherever the admin has dragged them — mixed in
with authored items in the same array, in the same `menuConfig.tree`. This gets every
existing node mechanism for free instead of needing its own: the existing
`dragstart`/`dragover`/`drop` handlers (keyed on `data-node-id`) reorder them exactly like
any authored item; the existing double-click-to-rename (`.tree-title-text[data-node-id]`
→ `updateNode`) renames them; `activateMenuNode`/`openNodeContent` already dispatched on
`contentType === 'aerial'|'landmarks'` from an earlier design and needed no changes at all.
Only two things stay special-cased: an `enabled` flag (the ON/OFF switch — an authored
node has no such concept, but these two have no content to configure, so "off" is a real,
meaningful state) and no delete button.

- **`ensureBuiltinNodes()`/`builtinNodeExists()`** (new, replacing `menuBuiltins()`/
  `setBuiltinEnabled()`/`renameBuiltin()`, all removed): guarantees both builtin nodes
  exist SOMEWHERE in the tree (searched recursively, so one dragged into a folder isn't
  duplicated), injecting a default at the top exactly once if either is missing. Covers a
  brand-new project, migrates an older project's `menuConfig.builtins` values onto the
  newly-injected node (enabled/title carried over, nothing resets), and **self-heals** if
  a builtin is ever lost as a side effect of deleting a folder it had been dragged into —
  rather than guard every deletion path against that, it's simply allowed to happen and
  reappears at the top on the next render. Called from `getMenuTree()`, the existing
  single chokepoint already used everywhere.
- **`cleanNodeForSave`** (the save whitelist) now carries `builtin`/`enabled` through —
  the standing gotcha here (a new field not added to this whitelist is silently dropped on
  every save) applied immediately, since these two fields didn't exist when the whitelist
  was last touched.
- **`renderAdminMenuTree`**: the separate `renderBuiltinMenuRows()` prepend is gone;
  `renderNodeRow` now checks `node.builtin` and delegates to `renderBuiltinNodeRow(node,
  depth)` inline, wherever the node falls in the normal recursive walk — so it renders at
  the right depth/indent whether at root or dragged into a folder, and drags/drops via the
  exact same generic code path with zero node-type-specific handling needed. The row keeps
  its ✓-switch and ▾ info-arrow (unfolding the live landmark category → landmark list for
  LANDMARKS, unchanged from before) instead of the usual overflow (rename/delete) menu —
  rename still works via the ordinary double-click, and there's deliberately no delete
  button. "No menu items created yet" now means no AUTHORED item exists besides the two
  builtins (which always render, never hidden from the admin) rather than an empty tree,
  since the tree is never truly empty any more.
- **`renderClientSidebar`**: the special builtin-prepend + `data-act="aerial"/"landmarks"`
  buttons are gone — the root-level loop just renders every tree node (skipping any with
  `enabled === false`) via the same `data-node-id` buttons as always.
  **`wireClientSidebarButtons`**'s dead `data-act` branches were removed with it —
  `activateMenuNode` already handles everything generically.
- **`computeAutoOpenTarget`** simplified to match: picks `getMenuTree().find(n => n.enabled
  !== false)` — the first item that isn't a switched-off builtin — resolves it once via
  `resolveFolderTarget`, and returns `null` only for the aerial-specific WYSIWYG-preserving
  case (unchanged reasoning: aerial has no content of its own, and firing its camera-reset
  action on every load would fight the admin's saved opening shot). Every other content
  type, including `landmarks` now, fires through the single generic `activateMenuNode`
  path — `fireAutoOpen` no longer special-cases `'landmarks'` separately, since
  `openNodeContent` already calls `openLandmarksCategoryPicker()` for that contentType.
- **Verified** via the same real-function-extraction method used throughout this project:
  14 assertions against the actual extracted `ensureBuiltinNodes`/`builtinNodeExists`/
  `getMenuTree`/`computeAutoOpenTarget`/`fireAutoOpen` — fresh-project injection (aerial
  then landmarks, both enabled), aerial-on-top stays a no-op, an authored item DRAGGED to
  position 0 becomes the target and fires directly (no aerial flash), landmarks dragged
  above aerial becomes the target, a disabled top item is skipped in favour of the next
  one, both builtins disabled falls through to an authored item, repeated `getMenuTree()`
  calls never duplicate an existing builtin, an old project's `menuConfig.builtins`
  enabled/title values migrate onto the newly-injected node, admin mode always decides
  null, and a builtin nested inside a folder is found (not duplicated) by the recursive
  existence check. `node --check` clean, CSS brace count balanced (766/766), no duplicate
  `id=` in `index.html`.
- ⚠️ Not yet confirmed in a live browser — dragging a builtin row by its handle, watching
  the switch/rename/expand-arrow render and behave correctly inline (rather than at the
  old fixed top position), and the real timing behaviour end-to-end are all owed a real
  click-through; this project's headless tooling can't reliably exercise admin drag-and-
  drop or boot timing (see CLAUDE.md's gotchas).

---

## 2026-09-09 (boot curtain: the default-screen switch is never visible happening any more)

`index.html`, `styles.css`, `app.js`. The previous fix (retiming `autoOpenTopMenuItem`'s
three fire points — below) turned out not to be enough: reported again, same symptom,
same wording. Root cause: retiming made each target fire as early as ITS data allowed, but
the pano itself starts rendering the instant its texture decodes — well before any of the
three fire points, even the earliest one. So there was always a window, however short,
where the pano was visibly showing its untouched boot state before the switch happened.
Retiming could shrink that window; it couldn't close it, because the pano and the decision
were on two different clocks.

**The actual fix: don't let the pano be visible until the decision has already been
applied.** A solid full-viewport `#bootCurtain` (new, `index.html`/`styles.css`, `z-index:
999999` — above modals too, so an auto-opened video/PDF doesn't flash into view early
either) covers everything from first paint. `hideBootCurtain()` (app.js, idempotent) is
called at exactly the point each target's fire call already happens:

- No target (aerial on top) or a `'node'` target (already fired pre-pano): revealed right
  after `initThree()` — the earliest point there's anything correct to show.
- A `'landmarks'` target: revealed in the same `if` block as its `fireAutoOpen` call,
  right after `setLandmarks()`.
- A `'panotour'` target: revealed alongside its `fireAutoOpen` call, right after
  `setTours()`.
- An unconditional safety-net call at the very end of the success path, and one in the
  `catch` block — both idempotent — so a gap in the kind-matching logic, or a boot error,
  can never leave a visitor staring at a black screen forever.

The retiming from the previous entry is still there and still correct (each target
firing at its own earliest-possible point rather than waiting for everything) — the
curtain is what turns "as early as possible" into "the visitor never sees anything else,"
which is what "make sure it directly switched" actually required.

- **Verified:** `node --check app.js` clean, CSS brace count balanced (766/766), no
  duplicate `id=` in `index.html`, and the live server confirmed serving `#bootCurtain`'s
  markup and all 5 `hideBootCurtain()` call sites (+ its definition = 6 occurrences) in
  the delivered `app.js`. ⚠️ Still owed: an actual timed browser load to see the curtain
  behavior with a real eye — this project's headless tooling can't reliably exercise
  boot timing (see CLAUDE.md's gotchas), so the fix is verified as logically sound and
  correctly ordered, not yet watched.

---

## 2026-09-09 (default-screen switch now fires as early as its own data allows, not after everything loads)

`app.js`. Reported: "still the aerial view comes for few seconds as a default screen then
it switches to whats so ever is on top of the menu" — the previous implementation
(`autoOpenTopMenuItem`, below) fired exactly once, at the very end of boot, after data,
landmarks, amenities, tours, AND the project-bar probe had all finished loading in
sequence. The pano was already rendering in its normal boot state the whole time (the
render loop starts as soon as the pano texture decodes, long before that point), so the
visitor saw the default view first and only then watched it jump — a real, visible delay,
not the "direct switch" the feature was supposed to be.

- **Split the single function into a decide step and a fire step.**
  `computeAutoOpenTarget()` runs immediately after `renderClientSidebar()` — as soon as
  the menu tree and built-in config are known, well BEFORE the pano even starts loading —
  and returns `null` (aerial-on-top, unchanged reasoning) or `{kind, node?}` where kind is
  `'landmarks'`, `'panotour'`, or plain `'node'`. Resolving whether the top item is a
  `panotour` reuses `resolveFolderTarget` (the same folder-skipping logic a real click
  goes through), so a folder wrapping a single panotour child is still detected correctly.
  `fireAutoOpen(target)` is the actual action — unchanged from before
  (`openLandmarksCategoryPicker()` / `activateMenuNode(node, {fromRoot:true})`).
- **Three fire call sites, each as early as its target's data allows** — replacing the one
  end-of-boot call:
  1. Right after `renderClientSidebar()` — a plain content item (video/pdf/gallery/
     contact/link/external tour) or a folder drill fires HERE, before the pano has even
     started loading, since none of that needs landmarks/tours/amenities/anything.
  2. Right after `setLandmarks(lms)` — a `landmarks` target fires here: the earliest point
     `state.landmarks` actually has data for the "ALL" framing to aim at (and the earliest
     point `three`/the camera exist at all, both prerequisites for `applyCategoryFilter`'s
     camera move).
  3. Right after `setTours(trs)` — a `panotour` target fires here, the earliest point
     `state.tours` (which `openClientPanoTour` reads directly) is populated.
  All three skip waiting for amenities, the project-bar `/api/projects` probe, and offline
  registration, none of which any auto-open target actually needs.
- **Verified** via the same real-function-extraction method: 9 assertions against the
  actual extracted `resolveFolderTarget`/`computeAutoOpenTarget`/`fireAutoOpen` — aerial-
  on-top still decides `null`, a landmarks target is decided before any landmark data
  exists (proving the decide/fire split), a plain video node fires immediately with
  `fromRoot:true`, a `panotour` node (direct AND behind a single-child folder skip) is
  detected as needing tours without touching `state.tours`, a real multi-child folder
  decides a plain `'node'` drill rather than treating it as data-dependent, and admin mode
  always decides `null`. `node --check` clean.
  ⚠️ The actual TIMING improvement (how much sooner the switch now appears) still needs a
  real browser load-and-watch to confirm — this fix is verified logically correct
  (the right thing fires at the right, earlier point) but the visible "few seconds" the
  user described was measured by eye, not by an instrumented clock, so the exact
  before/after delta is not independently confirmed here.

---

## 2026-09-09 (the client's default screen is whatever menu item is on top)

`app.js`. Request: "whatsoever menu is on top of the menu will be set as the default screen
for the client" — confirmed via a follow-up question that this means the top item should
**auto-open on load**, not just render pre-highlighted.

- **`autoOpenTopMenuItem()`** (new, called once at the very end of boot's success path,
  right after `registerOfflineSupport()`, gated `!state.admin`): finds whatever renders as
  the literal first row of the client menu — a built-in row if enabled, else the first
  authored item — and fires the exact same action a real tap on it would
  (`openLandmarksCategoryPicker()` for LANDMARKS, `activateMenuNode(top, {fromRoot:true})`
  for an authored item, which itself dispatches to `openNodeContent` and handles a folder,
  a gallery-of-images, a contact card, or empty-folder identically to a click — see
  `resolveFolderTarget`). Reruns on every fresh load, since a "default screen" is what
  greets the visitor before any interaction, not a one-time flag.
  **AERIAL VIEW is the one deliberate exception:** it has no content of its own to open —
  clicking it resets the camera to a computed full-site overview, which is a DIFFERENT
  view from the admin's saved WYSIWYG opening shot. Since AERIAL VIEW is enabled by
  default on every project, auto-firing that reset on every load would have silently
  broken the "client reproduces the saved view" contract for every existing project the
  moment this shipped. When AERIAL VIEW is on top, `autoOpenTopMenuItem()` does nothing —
  the boot view already **is** the correct default screen in that case. In practice this
  means the feature is dormant for most projects today (aerial ships enabled and first)
  and only activates once an admin turns AERIAL VIEW off or otherwise changes what's on
  top — which is exactly the condition the request describes.
- **Verified** via the same real-function-extraction method used throughout this project:
  5 assertions against the actual extracted `autoOpenTopMenuItem` — aerial-on-top is a
  no-op (preserves WYSIWYG), aerial-off/landmarks-on opens the category picker,
  both-off activates the first authored node with `fromRoot:true`, an empty tree no-ops
  without throwing, and admin mode is always a no-op regardless of config. `node --check`
  clean. ⚠️ Not yet confirmed in a live browser — the WYSIWYG-preservation reasoning and
  the click-parity (reusing `activateMenuNode`/`openLandmarksCategoryPicker` rather than
  new logic) are the safety net, but a real load-and-watch check is still owed, especially
  for how a video/PDF/tour item behaves when it auto-opens the instant the page loads
  (autoplay policies may still block sound/playback even though the modal itself opens).

---

## 2026-09-09 (removed the Landmarks tab's intro/legend text and bulk Show-all/Hide-all controls)

`index.html`, `styles.css`. Follow-up to the switch change above, from a screenshot of the
Landmarks tab: the intro paragraph, the ✓/✕/× legend box (which now described a control
that no longer exists — it explained the old button PAIR, not the switch it was just
replaced with), and the `#axLmCount`/`✓ Show all`/`✕ Hide all` bulk row were all removed
per explicit confirmation of the full scope ("remove everything in the screenshot").

- `index.html`: `#axTabLandmarks` now goes straight from the tab header to
  **＋ Add landmark** and the list — no `.ax-lm-intro` paragraph, no `.ax-lm-legend` box,
  no `.ax-lm-bulk` row.
- No `app.js` changes needed — every reference to the removed elements (`els.axLmCount`,
  `els.axLmShowAll`, `els.axLmHideAll`) was already null-safe (`?.` / an `if` guard in
  `refreshLmList`), so `setAllLandmarksFeatured` simply becomes unreachable from the UI
  rather than erroring; the per-row switch (previous entry) is now the only way to change
  a landmark's default-visibility from the admin.
- `styles.css`: removed the now-fully-orphaned `.ax-lm-bulk`, `.ax-lm-count`, `.ax-lm-legend`
  (+ its `.ax-lm-key*` sub-selectors) rules. Kept `.ax-lm-li.is-hidden-default` — the dashed
  outline on a not-shown-by-default landmark's row — since that's unrelated per-row styling,
  not part of what was asked to go, and `.ax-lm-intro` itself (still used by the Amenities
  and Tour tabs' own intro paragraphs).
- **Verified:** `node --check app.js` clean, CSS brace count balanced (763/763), no
  duplicate `id=` in `index.html` (258 total, same structural integrity check as every
  merge/edit this session).

---

## 2026-09-09 (per-landmark show-by-default control switched from a ✓/✕ pair to an ON/OFF switch)

`app.js`, `styles.css`. Follow-up request, from a screenshot of the admin Landmarks tab
list: "add toggle button here also but keep that x for removing the landmark" — i.e. match
the ON/OFF switch just built for the admin menu builder's built-in rows, replacing the ✓/✕
button pair, while leaving the separate × delete button untouched.

- **Generalised the switch CSS** — renamed `.builtin-switch*` to `.ui-switch*` (kept
  `.builtin-switch-input` as a second class on the same element so the menu builder's
  existing wiring selector needed no change) so the same control now serves both the menu
  builder's built-in rows and this per-landmark toggle without duplicating the styling.
- **`refreshLmList()`**: the `grp`/`mkVis` two-button block is gone, replaced by one
  `<label class="ui-switch ax-lm-vis-switch">` bound to `lm.featured` via the existing
  `setLandmarkFeatured(lm, on)` (unchanged — still idempotent, still fires
  `refreshLmList`/`renderLandmarks`/`onLandmarksChanged`). The delete `×` button is
  untouched, same position, same `deleteLandmark(lm.id)` call.
  **Why this doesn't reopen the 2026-09-04 bug the ✓/✕ pair was built to fix:** that bug
  was a single button whose only signal was "pressed = active," so clicking down a list of
  already-active items looked identical to clicking a list of items you wanted to activate
  — the same gesture, opposite of what happened. A real switch has an unambiguous ON/OFF
  position (thumb side + colour) that reads correctly regardless of prior state, which is
  the same property that made the ✓/✕ pair safe — just expressed as one control instead of
  two. This mirrors the reasoning already used for the menu builder's switch two entries up.
- Removed the now-dead `.ax-lm-vis-grp`/`.ax-lm-vis`/`.ax-lm-vis-yes`/`.ax-lm-vis-no` CSS
  (nothing in the DOM uses them any more).
- **Verified:** `node --check app.js` clean, CSS brace count balanced (770/770),
  `setLandmarkFeatured`'s own idempotency guard is untouched and — since a real checkbox's
  `change` event only fires on an actual state flip — cannot even be called with a
  no-op value from this control the way a repeated button click could.
  ⚠️ Same caveat as the built-in-row switch: the visual on/off rendering itself is
  code-reasoned, not confirmed in a live browser click-through yet.

---

## 2026-09-09 (AERIAL VIEW / LANDMARKS become built-in, togglable admin menu rows; the landmark category picker becomes live data)

`app.js`, `styles.css`. The Virtual Tours merge (below) had exposed that AERIAL VIEW and
LANDMARKS aren't hardcoded client rows any more — a project's admin has to author them as
menu items, or they're simply absent (this is exactly what happened to `anandman`, reported
as "the aerial view and the landmark menu is been removed"). The immediate fix was a
one-off hand-edit of that project's `alignment.json`; this is the real feature: the boss's
follow-up request was to make both rows **built-in** to the admin's menu builder (present
by default, toggle-off rather than delete) and to make the LANDMARKS row's contents track
the actual Landmarks tab data instead of anything authored.

**A discovery that shaped the design:** the client's landmark category picker (`#catNav`,
the HEALTHCARE/EDUCATION/COMMERCIAL/CONNECTIVITY/LIFESTYLE/TEMPLE buttons) turned out to be
static markup in `index.html`, identical across every project, wired ONCE at boot
(`wireViewControls`) and never rebuilt. A landmark whose category wasn't one of those six
names had no button to reach it at all, in every project, silently. Fixing the admin side
properly meant fixing this first, since both now read from the same source.

- **`menuConfig.builtins`** (new, in `alignment.json`, read via `menuBuiltins()`): a config
  block SEPARATE from the authored `tree`, `{ aerial: {enabled, title}, landmarks: {enabled,
  title} }`. Missing on any project ⇒ both default to `enabled:true` with their original
  titles, so nothing changes for a project that never touches this. Deliberately not just
  two more tree nodes — the whole point is they can't be dragged, deleted, or reparented,
  only toggled and renamed. `setBuiltinEnabled`/`renameBuiltin` are the two mutators, both
  idempotent (no-op if the value wouldn't change, same discipline as `setLandmarkFeatured`).
- **`effectiveLandmarkCategory(lm)` / `getLandmarkCategories()`** (new): the single place
  that now decides what category a landmark belongs to — an explicit `category` field if
  set, otherwise the same icon/keyword inference `isLandmarkMatchCategory` already used
  (re-run against each known category name rather than re-deriving the rules), falling back
  to `UNCATEGORIZED` rather than silently dropping a landmark nobody's filed yet.
  `getLandmarkCategories()` groups `state.landmarks` by it, first-seen order. Both the
  client's `#catNav` and the admin's built-in LANDMARKS row read from this one function, so
  they cannot drift apart the way the old static markup already had.
- **`renderLandmarkCategoryNav()`** (new) rebuilds `#catNav` from `getLandmarkCategories()`
  — called from `setLandmarks()` (boot, file/session load) and `onLandmarksChanged()` (any
  admin edit), so the picker a client sees always matches what's actually on the Landmarks
  tab, for every project, not just the ones with the six original category names.
- **`renameLandmarkCategory(oldName, newName)`** (new): renames a category everywhere at
  once — every landmark currently filed under `oldName` (explicit OR inferred) gets an
  EXPLICIT `category = newName`. Confirmed with the user before building: this is a real
  bulk data change, not a cosmetic label swap, and it's what makes a rename "stick" even
  for a landmark that only ever had an inferred category before.
- **Admin menu builder** (`renderAdminMenuTree`) now renders AERIAL VIEW and LANDMARKS as
  the first two rows, always, via `renderBuiltinMenuRows()`: each has a ✓-styled ON/OFF
  switch (green = shown to the client, matching the request that a "crossed" item simply
  stops appearing — chosen as a real switch rather than the ✓/✕ button PAIR used for
  landmark `featured`, at the user's explicit preference for this control) and a ▾ arrow
  that expands a plain-language note on what the row does. The title of each row is
  double-click-to-rename, exactly like an authored menu item's title.
  **LANDMARKS' expansion additionally lists the live category → landmark tree**
  (`renderBuiltinLandmarkCategories()`): each category name is double-click-to-rename
  (→ `renameLandmarkCategory`, confirmed to bulk-update), and each landmark under it is
  both clickable (jumps to it on the Landmarks tab, where the full editor already lives)
  and double-click-to-rename (writes `lm.label` directly, same as the Landmarks tab's own
  edit panel). The landmark name's `click` handler stops its own propagation so a
  double-click doesn't fire the "jump to tab" action on its first click.
- One pre-existing drag-and-drop guard needed a one-line fix: `dragover` on a `.tree-node-row`
  now bails out early when the row has no `data-node-id` (a built-in row), so hovering a
  dragged authored item over AERIAL VIEW/LANDMARKS no longer shows a misleading drop
  highlight (the actual drop already safely no-opped via the existing `!targetId` guard —
  this only fixes the cosmetic false affordance).
- **Verified via the same real-function-extraction method used throughout this project**
  (headless browser automation can't reliably exercise admin UI here — see CLAUDE.md
  gotchas): 19 assertions running the actual `effectiveLandmarkCategory`,
  `getLandmarkCategories`, `renameLandmarkCategory`, `menuBuiltins`, `setBuiltinEnabled`,
  and `renameBuiltin` (brace-matched out of `app.js`, not retyped) against constructed
  state — explicit-category grouping, icon-inferred grouping, uncategorized fallback,
  bulk rename across both explicit and inferred landmarks, no-op safety on an
  empty/unchanged/missing category, builtins' defaults, and idempotency of both setters —
  all passed. `node --check app.js` clean; CSS brace count balanced (776/776); no
  duplicate `id=` introduced (the new UI is all class/data-attribute driven, no new ids).
  ⚠️ The interactive parts specifically — the switch's visual on/off state, the ▾ expand
  animation, and double-click-rename swapping the span for an input — are code-reasoned
  and unit-tested at the logic layer only; a real browser click-through is still owed,
  same caveat as every other admin-UI change this project's gotchas describe.

---

## 2026-09-09 (merged the "Virtual Tours" branch commit dd197ed into this session's work)

The Tour feature (previous entries below) landed on `origin/feature/plot-map-admin-updates`
via a separate push while this session had its own uncommitted changes (settle-and-hold
camera, compass/d-pad, SVG footer icons, audio-extension caching) sitting in the same 7
files. Merged via `git stash push -u` → `git merge --ff-only` → `git stash pop` rather than
a merge commit, since the local branch had no commits of its own yet — only working-tree
edits.

- **Auto-merged cleanly** (no conflict, textually): `app.js`, `index.html`, `server.py`,
  `styles.css`, `CLAUDE.md`.
- **Manually resolved:**
  - `sw.js` — both sides bumped `VERSION` (boss's `v2` for the network-first project-config
    change, this session's `v5` for widening `isRangedMediaPath` to cover audio
    extensions). Kept `v5` (higher, so both cache-invalidation reasons are covered by one
    bump) and folded both change notes into one comment.
  - `CHANGELOG.md` — both sides prepended entries at the top; reordered so the boss's
    2026-09-08 tour entries sit above this session's 2026-09-07 entries, preserving strict
    newest-first order.
- **Verified, not just trusted to text-merge cleanly:** `node --check app.js` / `sw.js`,
  `ast.parse` on `server.py`, brace-balance count on `styles.css` (752/752), no duplicate
  `id=` attributes in `index.html`, every `$('id')` lookup in `app.js` resolves against
  `index.html` (the handful that don't — `axSave`, `nodeChildFields`, `panoHint`, etc. —
  were confirmed pre-existing via `git show` against this session's own last commit, not
  something the merge introduced), and this session's own UI ids (compass/d-pad/audio/
  fullscreen/auto-pan) plus the boss's new tour ids (`tourBar`, `tourHotspots`) both
  present. Server boot-tested: `/api/projects` lists the boss's new `pano-testamit`/
  `panotour-demo`/`test12` alongside this session's `anandman`/`eleganza`; both a plain
  project's `plots.csv` and a tour-only project's `tour.json` serve `200`.
- Not yet committed — the merge is complete in the working tree/index, staged, but left as
  a pending commit pending explicit confirmation.

---

## 2026-09-08 (virtual tour Phase 1, step 1: tour.json data model + admin Tour tab)

First code for the virtual tour. `app.js`, `index.html`, `styles.css`. Ships the data
model + a 4th admin **Tour** tab for managing tours and their node panoramas. Hotspot
linking + the client crossfade viewer are the next steps (not in this change).

- **Data model (`tour.json`, D-13):** one file per project holding **many** tours —
  `{ version, tours:[{ id, name, startNode, nodes:[{ id, name, pano{file}, defaultView{lonDeg,latDeg,fov} }],
  links:[{ from, to, hotspot{lonDeg,latDeg}, label }] }] }`. New `parseTours`/`buildToursData`/
  `loadToursFile`/`setTours`/`tourNodeBlobFiles`/`saveToursAs` mirror the landmarks/amenities
  pattern exactly (basename-resolved node images, `loadProjectFile`/`saveToProject`). `parseTours`
  drops links whose from/to node no longer exists and repairs a dangling `startNode`.
- **State:** `state.tours` + admin `tourSel`/`tourNodeSel` (client `tourActive`/`tourNode`
  reserved for the viewer step).
- **Persistence wired:** `buildSession` snapshots tours (incl. node pano blobs) → session
  autosave/restore; `exportSite` writes `tour.json` + fresh node images (and the empty-check
  now counts tours); boot loads tours (session > committed `tour.json` > none).
- **Admin Tour tab:** ＋ Add tour, inline rename, delete; per-tour node list — ＋ Add node
  (upload a pano, auto-resized to a texture-safe `.web.jpg` via `resizeImageToBlob` at the
  pano cap), rename node, ☆/★ set start node, delete node; Save tours… / Load…. `setAdminTab`
  is now 4-way (align/landmarks/amenities/tour); `refreshTourList` renders it.
- **Verified** end-to-end via the in-app Browser pane against a throwaway `zztourtest`
  project (removed after): Tour tab shows; add tour → "Tour 1"; two node panos uploaded →
  2 nodes; rename tour + node, set start node, delete node; **server save wrote
  `projects/zztourtest/tour.json` + 3 node images** with basename `sample/tour-t1-nN.web.jpg`
  paths and `startNode:"n2"`; **session-discarded reload restored** the tour, 2 nodes and
  start node from the committed file; zero console errors; `node --check` + `python ast.parse`.

---

## 2026-09-08 (virtual tour: 0-B signed off, all OQs answered, Phase 1 scope locked — planning only)

Docs only (`VIRTUAL-TOUR.md`, this file). No app code yet. The owner reviewed the `spike/`
tour and green-lit building **node/hotspot placement + linking as a real admin feature**,
and answered every open question. Recorded in `VIRTUAL-TOUR.md`:
- **Decisions locked:** D-1 → **(a) drag-to-place only**; D-9 → **new Tour tab**; all
  others as recommended. New build decisions: **D-11** client viewer *takes over the main
  pano* (reuses camera + landmark projection/drag), **D-12** menu launches a tour via a new
  **`panotour`** content type → `openClientPanoTour(tourId)`, **D-13** one
  `projects/<id>/tour.json` holding **many** tours.
- **OQ answers:** colour-only (no depth) → **crossfade, no glide**; ~15 nodes/tour,
  ~30/project → LRU+prefetch required; **separate tours launched from the menu** (not one
  graph, not auto-linked to the plot map); HTTPS to come for WebXR (Phase 3); scale/units
  moot while colour-only.
- **Consequence:** **Phase 2 (depth glide) deferred** (both prerequisites declined); Phase 1
  = the crossfade 3DVista replacement, now `🟡 in progress`.

Next: implement Phase 1 in the order data model → Tour tab → hotspot authoring → client
crossfade viewer → menu launch. See `VIRTUAL-TOUR.md` Phase 1.

---

## 2026-09-07 (landmark categories SETTLE and hold, matching the reference exactly)

Reversed the continuous sweep added earlier this session, at the user's explicit request
after comparing both behaviours against the reference tour and preferring its
settle-and-stop: "can we do that with our website, it looks more appealing".

**Root-caused the reference's actual behaviour first, rather than guessing.** Read
`tdvplayer.js`'s own sequence-playback code (not the exported tour data, the PLAYER
runtime) and found the exact mechanism: a sequence's `repeat` property defaults to **1**
when unset —
```js
var f = this.Xb.get("repeat", 1);
this.PM.length > 0 && (f == 0 || this.Uja < f) ? this.f4(0) : (/* fire done, stop */)
```
`repeat: 0` would loop forever; anything else plays the movement list that many times and
stops. **None of Eleganza's category sequences set `repeat`**, so all of them play their
one movement (a 12.8–25.6° drift) once and hold still — confirmed, not inferred. Only
its aerial/default view (360°, one lap) and Temples (1800°, five laps) genuinely spin, and
even those stop after that single pass — there is no perpetual loop anywhere in the tour.

**Change:** a landmark category now flies to its settled shot (unchanged: tightest-cluster
aim, fixed hfov 110 → per-aspect vertical FOV) and then holds — no ping-pong, no sweep, no
idle drift. The ALL/aerial free 360° idle spin is untouched, since it's a separate,
longer-standing feature this conversation never targeted.
**Trade-off, stated plainly:** the two widest categories (Connectivity 140°, Commercial
144°) can't fit every landmark in one 110° frame, so an outlier will sit outside the
automatic shot. That is not a regression — it's the reference's own trade-off (its
hand-picked shots don't guarantee full coverage either) — and the outlier stays reachable
by a manual drag, which still releases the arc exactly as before.

**Removed as genuinely dead code**, not just disabled: `computeLandmarkPanRange()` and its
four supporting constants (`LANDMARK_EDGE_PAD`, `LANDMARK_FIT_FOV_CAP`,
`LANDMARK_FIT_FOV_FLOOR`, `LANDMARK_SWEEP_FOV`, `LANDMARK_SWEEP_MS`,
`LANDMARK_SWEEP_MIN_RATE`) and `state.autoPanDir`, all confirmed via grep to have no other
callers before deletion. `LANDMARK_SWAY_HALF` survives with a new, accurate comment — it's
now just the half-width of the arc a manual drag releases from.

**Verification, and an honest correction mid-session.** A live-browser timing test first
appeared to confirm the fix (0.000° drift over 6s on a category); a second test of the
UNCHANGED ALL-view free-spin also showed 0.00° movement, which shouldn't happen — that
contradiction is what caught it. Instrumenting `requestAnimationFrame` directly showed
**only 3 real frames total, then the render loop stopped calling it** — the same headless
`--virtual-time-budget` limitation documented elsewhere in this file, so BOTH timing
results were artifacts of nothing rendering, not evidence either way. Discarded, and
replaced with the reliable method already used successfully elsewhere in this project:
extract the real idle-autopan conditional from `app.js` (brace-matched, not copy-pasted)
and execute it directly in Node against both states. Result:
`landmarkPanRange` truthy → `state.view.lon` provably unchanged; `landmarkPanRange` null
→ the free-spin line still runs and moves it — both PASS, deterministically, independent
of any browser. `node --check` clean; the menu-skip and `featured`-flag regression suites
both still green.

---

## 2026-09-07 (auto-pan button says what it DOES)

The auto-pan toggle was a `🔄` emoji, which says "something rotates" but not what pressing
it will do. Replaced with an SVG that shows the **action**: pause bars while the camera is
drifting (press = stop), a play triangle once stopped (press = resume), wrapped in two arcs
so it reads as *camera motion* rather than a media control for the audio button beside it.
Title and `aria-label` follow — "Stop the camera moving" / "Let the camera move again" — and
`aria-pressed` reports the stopped state. `updateAutoPanToggleUI()` owns both, and is called
at boot so the button matches `state.autoPan` from the first frame instead of relying on a
hardcoded `is-active` in the markup.

Two sizing findings, from rendering the candidates standalone at 4× rather than guessing:
arrowheads on the arcs collapse into ~2px blobs at the 19px this actually renders at and
merge with the centre glyph, so they were dropped; and arcs spanning 100° read as plain
parentheses — widened to 140° they read as a broken ring. Iterating on the standalone
render is also the practical way to do this: the bundle export is 1.3GB and ~40s a round.

**Verified:** clicking flips `is-active` true→false, `.pan-stop` display block→none and
`.pan-go` none→block, and the title changes to match.

---

## 2026-09-07 (compass redesign, SVG icons, smooth camera motion)

- **Compass rebuilt: the rose is FIXED, a shaded cone sweeps.** The first version rotated
  the whole rose and counter-rotated each letter to keep it upright — which works, but the
  reference does the opposite and it reads far better: north stays at the top and a
  translucent cone swings round to show where the camera is pointing. Only `#compassCone`
  is transformed now, so the letters need no counter-rotation at all. Face, 8-point
  split-shading rose, ring and red north needle restyled to match.
- **Footer icons are SVG, not emoji** — corner-bracket fullscreen and a speaker whose
  on/off halves swap on the button's `is-active` class. ⚠️ `updateAudioToggleUI` was still
  assigning `textContent`, which **replaced the whole inline SVG with a character**; the
  fullscreen icon looked right while the speaker silently reverted to an emoji. That line
  is gone and the swap is pure CSS.
- **Smooth motion (the "it feels like dragging" fix).** The d-pad was jumping a fixed 1.4°
  every 45ms — about 22 visible lurches a second, independent of frame rate. Replaced with
  a velocity model: a press sets a TARGET speed (~34°/s) and `stepViewMotion()` eases the
  real velocity toward it each frame, then back to zero on release, so the camera
  accelerates and coasts to a stop. Easing is frame-rate independent
  (`1 - VIEW_EASE_PER_S^(dt/1000)`).
- **Drag inertia.** A pan used to stop dead the instant the pointer lifted. The gesture's
  instantaneous speed is now carried into `viewVel` (capped, so a hard flick can't spin the
  view wildly) and decays through the same easing — the single biggest contributor to
  panning feeling rough. Grabbing again cancels any coast.
- Steered motion is gated ahead of the idle auto-pan so the two can't both write
  `state.view.lon` in one frame.

**Verified:** `pushWhileHeld=true` / `pushCleared=true` on press and release, the cone
carries a rotate() while the rose does not, and the speaker button holds an SVG with empty
textContent (the emoji regression is gone). Screenshots confirm both icons and the compass.
The *feel* of the easing still needs a real browser — headless stops the rAF loop, so no
motion can be observed there.

---

## 2026-09-07 (compass + directional pad)

Added the two client controls the reference tour has and we didn't, both working.

- **Compass** (top-right, client only): the ROSE rotates with the view while the N/S/E/W
  letters counter-rotate so they stay upright — each label needs BOTH transforms (carried
  round by the rose, then spun back on itself), which one transform can't express. Driven
  from `renderLoop` via `updateCompass()`. `state.view.lon` is the camera YAW and runs
  opposite a stored lon, so the heading is negated before north is subtracted — the
  two-conventions trap again.
- **Directional pad** (bottom-centre): four outlined arrows, tap to nudge and hold to keep
  moving. A press releases a selected category's arc clamp exactly as a drag does,
  otherwise `updateCamera` would fight every press and the buttons would feel dead inside
  a category; it also stamps `lastUserTouch` so the idle drift doesn't shove back. Speed
  tuned from measurement: 2.2°/40ms held came out at ~57°/s, too fast, now 1.4°/45ms
  (~31°/s).
- **`northDeg`** added to `alignment.json` (optional, default 0) — which stored lon is true
  north. ⚠️ **Uncalibrated:** the reference's compass is a 3DVista component that exports no
  north value, and the tour data carries none, so this could not be derived. The compass
  turns correctly with the view; its absolute bearing is only right once someone sets this
  one number.
- Fullscreen and mute already existed and are unchanged (`fsToggle`/`audioToggle` in the
  drawer footer); their styling was NOT altered, since a banner restyle had just been
  reverted at the user's request.

**Verified:** compass transform tracks the view and labels carry the counter-rotation
(`rotate(-339.28 60 60)` + per-label inverse). D-pad confirmed by reading state directly —
a 500ms right-hold moved lon −28.60°, an up-hold moved lat +28.60°, and
`landmarkPanRange` was cleared. That indirection was necessary: headless stops the rAF loop,
so nothing repaints and on-screen motion cannot be observed there (see the gotcha).
Screenshot confirms both render in place.

---

## 2026-09-07 (landmark parity with the Eleganza reference tour)

The `anandman` project is meant to reproduce `demo.build91.in/Eleganza`, whose panorama is
the same aerial shot. That tour is a **3DVista** export, so its data was read directly
(`script_general.js`) rather than guessed at.

**What the reference actually does.** Six *separate panoramas* — one per landmark category
— all sharing byte-identical cube faces (verified by md5: only the overlay sets differ).
Each category button runs
`setPanoramaCameraWithSpot(playlist, item, yaw, pitch, 110)` + `setPlayListSelectedIndex`.
The `hfov` is **110 for every category**: it never zooms per category and never sweeps, and
its pitch is level (−0.3° to −3.2°). Its idle motion is a slow yaw drift, 1.6–2.1°/s with
cubic ease in/out.

**Calibration — the one thing that had to be measured, not assumed.** Their cubemap was
reprojected to an equirect and cross-correlated against our `Connectivity.web.jpg`:
**0.986 correlation at a 0.00° shift, no mirroring** — the same image in the same
orientation. Our `dir()` and `dirFromLonLat()` share a formula, so our stored lon IS the
image longitude (0 at the left edge), while their yaw 0 is the front face at the image
centre. Hence:

    our stored lon = reference yaw + 180        our stored lat = reference pitch

The sign was confirmed independently: fitted against all 24 shared landmarks that mapping
leaves a residual spread of ±9.4°, versus ±51.5° for the flipped sign — a 5× separation.
A crop of our panorama at each converted position lands exactly on the horizon, confirming
the pitch half.
**Two LOD traps cost a detour and are worth knowing:** their tile pyramid numbers level
**2 as the single-tile, lowest-res level** (0 and 1 are the tiled high-res ones), so
fetching `/0/0_0.webp` returns one corner tile — which for a side face is pure sky, and
made the first correlation meaningless.

**❌ REVERTED (same day, at the user's request) — landmark banners restyled after the
reference.** Both files are back to the centred, original banner: `styles.css` restored by
hand, and `app.js` had already lost its half independently (found on disk with the original
`halfW` centred placement and none of `rotatedBounds` / `is-left` / `leftLimit`, mtime later
than the edits — see the "work can disappear from disk" gotcha in CLAUDE.md, though here the
user was reverting in parallel so that is the likelier explanation). The CSS had to go too:
on its own it anchored the banner at a corner while the JS positioned it as if centred.
**The findings below are kept because they cost real measurement and would otherwise be
re-derived:**
Reported as "why don't ours look as organised and spacious", plus a request for the same
styling and for labels to flip sides rather than always extending right.

- **Style:** skewed navy-gradient sign (rotate −4°) with a teal distance bar under it and
  the icon in a lighter inset block, matching the reference's signage. ⚠️ **The font cannot
  be matched exactly** — the reference's labels are baked into overlay IMAGES, so no face
  is recoverable from the tour data; the stack is the closest widely-available match to
  their rounded geometric sans.
- **End-anchored, not centred.** Previously `translate(-50%,-50%)` put the leader line
  through the middle of the label. It now hangs off one END, the line meeting its bottom
  corner, with the icon on that same side — exactly the reference's arrangement.
- **Automatic left/right flip.** Each banner has two candidate boxes; it prefers the right
  (the reference's default) and flips left when the right would leave the viewport or
  collide with a banner already placed that frame. Confirmed firing: 0 flips at 1900px,
  1 at 1280px and at 1000px.
- **The drawer is a no-go zone.** One landmark was being drawn *behind* the category panel
  and was simply invisible; the open drawer's right edge is now the left bound.
- **Tilt-aware collision.** The first pass tested the untilted layout box, but a rotated
  rectangle's footprint is taller — ~14px more on a 200×48 banner — so neighbours grazed
  while the maths said they were clear. `rotatedBounds()` derives the real axis-aligned box
  from the four rotated corners. `LM_BANNER_TILT` must track the stylesheet's rotate().
- **Vertical lift for same-bearing landmarks.** Flipping can't separate two landmarks at
  nearly the same bearing (RITEE College and Kanger Valley are **0.2°** apart), so a box
  that still grazes is lifted until clear, up to 90px; the leader line just grows, as the
  reference's do. That closed the last two overlaps, both grazes of 6–7px on a 65px banner.

**Measured:** overlapping banner pairs 2 → **0** at 1900px and 1 → **0** at 1280px, with the
flip still engaging where space is tight. Screenshot-confirmed.

**Fourth correction — EVERY category sweeps now, not just the wide ones.** Reported twice as
"the camera is not panning from leftmost to rightmost of a category". The third correction
only restored the sweep for categories too wide to fit the 110° frame, which was just
Connectivity and Commercial; the other four kept a ±3.5° sway that is imperceptible — so
from the outside nothing had changed. Now the camera centre always travels the category's
own extent (`minLon-pad .. maxLon+pad`), bringing each end landmark to the middle of frame
in turn. Pace is the reference's ~2°/s, floored so a full pass never exceeds
`LANDMARK_SWEEP_MS` (30s): Healthcare/Temple 2.0°/s over 24s, Education 3.4, Lifestyle 4.0,
Connectivity 5.2, Commercial 5.3, all 30s. **This deliberately diverges from the reference**,
which holds a fixed shot and never sweeps — requested explicitly. Zoom stays at the
reference's hfov 110; only the motion differs.

⚠️ **Not verified in a browser, and the reason is worth recording:** headless Chrome stops
the rAF loop after ~5 frames under `--virtual-time-budget` (instrumented and confirmed:
`frames=5->5` while `three=true`), so idle auto-pan cannot be observed there at all. An
earlier "banner frozen at x=278 for 18s" reading was that harness limitation, not evidence
of a bug — don't repeat that inference. The pan ranges and rates above are computed from the
real functions; the motion itself needs a real browser.

**Third correction — the sweep had to come back.** Matching the reference's fixed framing
meant dropping the fit-or-sweep decision entirely, which was wrong: the frame is now a
CONSTANT 110 horizontal, so any category wider than that has landmarks outside it wherever
the camera aims, and with only the ±3.5° sway the `updateCamera` clamp locked the view to a
7° window — an outlying landmark could never be seen at all. Connectivity (140° span) had 1
of 4 stranded, Commercial (144°) likewise. Restored, but reconciled with parity: **the zoom
stays fixed at hfov 110** and a category that already fits keeps the gentle sway; only one
that doesn't fit sweeps, and it sweeps just far enough to bring each end into frame
(`minLon + hfov/2` to `maxLon - hfov/2`) rather than ranging over the landmark lons
themselves, which would overshoot by half a frame at each end and spend the pass staring at
empty sky. The opening shot is clamped into that range so the reference-matched framing
isn't yanked away on the first idle frame.
Measured: Healthcare 31°, Temple 32°, Education 86° and Lifestyle 104° all fit (sway only);
Connectivity sweeps 46° over 24s (1.9°/s) and Commercial 50° (2.1°/s), matching the
reference's own 1.6–2.1°/s drift. **Every landmark in every category is now reachable**
(6/6 categories, verified by walking each range and checking each landmark enters frame).

**Second correction — landmarks are placed TWICE in the reference, and we were using the
wrong copy for the default view.** Reported as "why does ours look so cluttered when both
sites have the same landmarks". Measured, and the cause was exact: the author hand-places
each landmark once on its **category** panorama (where only 3–7 labels compete) and again on
the **main** panorama, spread out for the crowded all-landmarks view. Using the category
placement everywhere put **NIT Raipur and Suyash Hospital 0.9° apart** in our default view —
on the main panorama the author had moved Suyash from 150.53 to 168.29 precisely to avoid
that collision.

| position set | min gap between the 9 | pairs under 12° |
|---|---|---|
| reference's MAIN pano (its all-view) | 11.0° | 2 |
| category panos (what we shipped first) | **0.9°** | 4 |

Fix: the nine landmarks that exist on the main panorama now use ITS placement; the other
sixteen, which only ever appear inside a category, keep their category placement. Those nine
are exactly the project's featured (default-view) set, so the two never conflict. **Costs the
category views nothing** — measured min gaps per category are unchanged or marginally better
(Education 0.2° → 1.9°, Commercial 36.1° → 35.2°, the rest identical). Radiant Way School is
un-featured to match: the reference shows it only under Education. Default view is now
**9 landmarks at 11.0° minimum spacing, identical to the reference**, screenshot-confirmed
with no overlapping labels.
**The general lesson:** when a reference tool renders the same entity in several contexts,
check whether it stores a separate placement per context before copying one of them
everywhere.

**Correction, same day — the overlay pitch is the graphic's CENTRE, not the label.** The first
pass put our `banner` at the reference's overlay pitch, which sat every label on the horizon
with a stub connector, while the reference shows labels floating high with long leaders. Each
overlay carries a `vfov` (6.1–20.3°, mean 16.3) — the angular height of the whole banner+leader
graphic — and its pitch is that graphic's centre. Corrected:

    banner  lat = pitch + vfov/2      (the label)
    hotspot lat = pitch - vfov/2      (the leader's tip)

and `applyCategoryFilter` now aims at the **midpoint of banner and hotspot** rather than the
banner, since aiming at raised labels would tilt the camera up into empty sky; the midpoint is
the graphic centre, which is what the reference's own category cameras point at (their pitches
run −0.3 to −3.2, i.e. level). Result: banner lat now spans −9.9..+12.2, hotspot −17.4..−5.0,
16.6° apart on average. **A second trap:** the same landmark exists on several panoramas with
slightly different hand placements (Suyash is 168.29 on 'Highest' but 150.53 on the Healthcare
pano), so a whole-file search for a label silently mixes them — the extraction must be scoped
to each category panorama's own overlay list.

**Imported:** all 25 landmarks with the reference's exact positions AND its category
assignment — every one of our 24 matched (the six "misses" were spelling variants: AIIMS/
AIMS, Brahmavid/Brahamavid, Tatibandh/Tatiband, Cricket Ground/Criclet Stadium, Gurudwara/
Gururdwara), plus **Radiant Way School**, which the reference has and we didn't. Their
overlay position is the LABEL, so it became our `banner`; the `hotspot` pin sits 9° below it
to keep our pin + connector look. The previous file is backed up beside it as
`landmarks.pre-eleganza-<stamp>.json`. Amenities were deliberately NOT imported (the 11
in-layout positions are extractable the same way if wanted later).

**Code:**
- `landmarks.json` gains **`category`**, and `isLandmarkMatchCategory` now treats an
  explicit category as **authoritative, short-circuiting the icon rules**. Without that,
  D Mart (icon `mall`, which infers COMMERCIAL) would appear under COMMERCIAL as well as
  its real LIFESTYLE home. The icon rules remain as inference for landmarks with no
  category.
- **`LANDMARK_HFOV = 110` + `vfovFromHfov()`.** Their hfov is HORIZONTAL and three.js'
  `camera.fov` is VERTICAL, so one hard-coded vertical number cannot match on two screen
  shapes: 110 hfov is 77.6° vertical on 16:9 but 66.8° on a 844×390 phone and 93.9° on
  4:3. The horizontal value is stored and the vertical derived from the live aspect.
- **`landmarkClusterCentre()`** replaces the fit-or-sweep decision. Their angles are
  hand-authored and follow no rule (Education sits on NIT Raipur, Connectivity on the
  Railway Station, but Healthcare sits near its arc midpoint), so no formula reproduces
  them exactly. Measured against all five: aiming at the tightest cluster averages 12.1°
  of error, versus 20.8° for the bounding-arc midpoint (which lands **52°** out on
  Connectivity, whose Highway outlier drags the midpoint into empty sky) and 18.7° for the
  circular mean.
- Idle drift `AUTOPAN_RATE` 1.2 → **1.8°/s**, the middle of the reference's range.

**Result, measured end to end against the reference's own angles:** mean **14.3°**, worst
23.9° (Education and Lifestyle, the two widest categories); Healthcare 6.8°, Connectivity
6.4°, Temple 10.8°. Zoom now matches exactly. 21 of 23 landmarks in the five categories
fall inside the 110° frame. Screenshot-confirmed: Education frames six of its seven
landmarks along a level horizon.
**Still open if tighter aim is wanted:** letting the admin mark one "focus" landmark per
category would land within ~4–5°, since that is effectively what the reference author did
by hand — and it stays admin *data*, not hard-coded angles in code.

---

## 2026-09-04 (landscape-phone responsiveness: status pills, contact card, drawer scroll)

`styles.css` only. Reported as "contact page, and the sold / available / reserved buttons"
being broken on mobile. Both were real and both were **measured**, not guessed: the client
bundle was driven headless at six viewports (552×225, 651×280, 828×295, 899×317, 916×335
inner, plus desktop) with a probe reporting every visible element that falls outside the
viewport, and whether overflowing content is reachable by scrolling.

- **The status pills were literally off the top of the screen.** `.zoom-controls` is a
  bottom-anchored column and had grown taller than a landscape phone: at 651×280 it stood
  **370px against ~260px of room**, so it overflowed UPWARDS and pushed Available / Reserved
  / Sold to negative y — invisible, untappable, with nothing to scroll. At 552×225 all three
  were gone; on taller phones one or two survived, which is why it looked intermittent.
  **Fix (structural, not another round of shrinking):** the pills LEAVE that column and dock
  to the **top-right** edge as a row, so the two groups are anchored to opposite edges that
  always exist and neither can push the other off. The column below then only has to fit six
  icons (6×28 + 5×4 = 188px, inside the ~200px a 552×225 phone leaves). `max-height` +
  `flex-wrap: wrap-reverse` stay as a safety net so an even shorter viewport wraps sideways
  rather than off-screen — `wrap-reverse` specifically, because a right-anchored stack must
  grow LEFT. An intermediate attempt left the pills in the column and relied on wrapping
  alone; the screenshot showed the icons stranded mid-screen, which is why they were moved
  out instead.
- **The contact card hid its own content where nobody could reach it.**
  `.contact-modal-right` is `justify-content: center` + `overflow-y: auto`; when the content
  is taller than the column, a centred flex column overflows at BOTH ends and **the part
  past the start edge cannot be scrolled to**. Measured at 828×295: the details hung ~90px
  off the top, unreachable. Now `justify-content: safe center` (base rule and the landscape
  block), which falls back to flex-start exactly when content doesn't fit; a browser that
  doesn't know the keyword drops the declaration and gets flex-start too. **This is the
  third time this same trap has appeared in this project** — see the landmark drawer's
  `.cat-nav`. Plus a landscape tier that keeps the side-by-side layout (vertical space is
  the scarce one) and tightens padding/type: the card now FITS entirely at 651×280 and up,
  and merely scrolls (37px, all reachable) at 552×225.
- **The drawer menu couldn't scroll, so its last items were simply lost.** `.cat-nav` had
  `overflow-y: auto` but no `min-height: 0` — and a flex item's default `min-height: auto`
  refuses to shrink below its content, so the nav just grew past the drawer and the bottom
  rows fell off the screen (measured: a `.cat-btn` 16px below the viewport at 651×280).
  `overflow-y: auto` on a flex child is decorative without `min-height: 0`. Now scrollable at
  every phone size tested.

**Verification (final pass, all six viewports):** every status pill and control icon fully
on-screen at all of them; `navScrollable=true` on every phone; contact card `fits` at
651×280+ and `scrolls(37px)` at 552×225; and **`unreachableTop=0px` everywhere**, which is
the metric that actually proves the `safe center` fix. Desktop (1264×765) confirmed
unchanged: pills correctly absent (they live in the topbar legend there), icons on-screen,
contact fits. Screenshots at 844×390 and 568×320 confirm it visually, not just numerically.
The 1.3GB test bundle was deleted afterwards; no project files were touched.

---

## 2026-09-04 (background audio accepts a VIDEO, and uses only its sound)

Follow-up to the audio feature: the ⚙️ Settings → 🎵 Audio… picker now takes a video too
(MP4 / WebM / MOV / MKV alongside the audio formats), loops it, and plays **only its sound
track** — the picture is never shown.

- **No extraction step, by design.** An `<audio>` element handed an `.mp4` demuxes it and
  plays the sound track; the picture simply isn't rendered because an audio element has no
  video surface. One code path serves both kinds. The alternative — `decodeAudioData` into
  an AudioBuffer — would pull the whole file into memory as raw PCM (hundreds of MB for a
  short clip) to reach the same audible result.
- **Measured cost, stated honestly rather than hidden:** with a real 2.4MB MP4 the client
  reported `AUDIObytes=17343` (the sound track genuinely decoding and playing, looped) but
  also `VIDEObytes=110237` — **Chrome still decodes video frames even in an `<audio>`
  element**, and the file ships at full video size. So a video works, but an audio-only file
  is lighter on both bandwidth and battery. The admin hint says exactly that; it is not
  presented as free.
- **A silent video is detected and reported.** A clip picked for its music may have no sound
  track at all, in which case nothing would ever play with no clue why — and this is not
  hypothetical: scanning the sample project's MP4 boxes, 3 of 11 carry only a `vide` handler
  and no `soun`. `warnIfSilentVideo()` checks `mozHasAudio` (Firefox) and `audioTracks`
  (spec/Safari) where available, and **falls back to Chrome's `webkitAudioDecodedByteCount`
  after a brief MUTED play** — muted playback is exempt from the autoplay policy, so it
  needs no gesture. Verified to discriminate correctly on real files:
  `withsound.mp4=true(bytes:6949) | silent.mp4=false(bytes:0)`. Where a browser gives no
  definitive answer it stays quiet rather than crying wolf on a good file.
- Export writes a video-sourced track with a `video/*` content type; `sw.js`'s
  `isRangedMediaPath` already covered the video containers.

**Verification:** `node --check`. End-to-end via a throwaway `audiotest` project (**deleted
afterwards**, and the bulky scratch copies with it — `projects/` is back to the user's own
nine): a real 2.4MB MP4 with a sound track played through `#siteAudio` as
`src=audio.mp4 paused=false loop=true t=0.5/19.8 AUDIObytes=17343`. The silent-clip detection
was validated as a standalone browser probe against both a sound-bearing and a video-only
file. **First test was a false negative worth recording:** the smallest sample MP4 was picked
for speed and reported `audioBytesDecoded=0` — which looked like the feature failing, but an
MP4-box scan showed that clip has no `soun` track at all. Check the fixture before doubting
the code.

---

## 2026-09-04 (admin-uploaded background audio)

Admin ⚙️ **Settings** gains a **🎵 Audio…** picker beside the logo; the track loops
quietly for client visitors and the existing 🔊 button mutes it. `app.js`, `index.html`,
`styles.css`, `sw.js`.

- **Stored exactly like the brand logo**, so it inherits every path that already works:
  `state.audio {file, blob, name, _url, _ver}`, `audio: { file }` in `alignment.json`,
  `siteAudioSrc()` preferring a fresh blob over the committed path (cache-busted with the
  alignment's `savedAt`, so re-uploading over the same filename can't serve a stale track),
  shipped by Export, carried in the working session, copied on save-as, and prefetched by
  the offline layer. **Not re-encoded** — there's no browser-side `resizeImageToBlob`
  equivalent for audio, so the admin's file ships as-is and `setSiteAudioFile` warns above
  8MB instead of silently shrinking it.
- **One button, two sources.** With a track configured the 🔊 button controls it; with none,
  the original synthesised ambience is untouched, so projects that never set audio behave
  exactly as before.
- **Autoplay is handled, not assumed.** Every current browser refuses audible playback
  before the visitor interacts with the page, so `play()` rejects on load through no fault
  of ours. That's recovered from rather than treated as an error: `armAudioGesture()` waits
  for the first real pointerdown/keydown and starts there. Verified both ways — with
  playback allowed it starts on load; with it blocked the page stays silent, the button
  honestly reads 🔇, and **zero errors** are thrown.
- **The visitor's choice sticks** (`b91-audio-muted`, alongside the other toggle prefs): a
  visitor who mutes stays muted on their next visit, and for them the track's `src` is
  never even attached — no download at all.
- **Admin never gets music started at it** mid-edit; 🔊 previews on demand.
- **`sw.js`: `isVideoPath` → `isRangedMediaPath`, now covering `mp3|m4a|aac|oga|wav|weba|flac`.**
  This is a correctness fix, not tidying: an `<audio>` element requests its src with byte-range
  headers and gets `206 Partial Content` back, and caching a single 206 under the resource
  URL silently corrupts the cache — only that one slice would ever be served again. That is
  the exact hazard `respondVideo` exists to prevent, and audio extensions were falling
  through to the ordinary cache path instead.

**Two real bugs found by testing, both the same root cause — async playback state:**
`setAudioMutedPref(false)` and the button/`state.audioPlaying` update all sat inside
`play()`'s `.then()`. But `el.paused` flips synchronously while the promise only settles once
playback has actually BEGUN, so (1) an unmute read back as still muted, and (2) `audioPlaying`
stayed false, meaning an immediate second press **re-started the track instead of muting it**.
Fixed by recording intent synchronously on the click and only walking it back if playback is
genuinely refused — the preference records what the visitor asked for, not how fast the
media loaded.

**Verification:** `node --check` on `app.js` and `sw.js`. End-to-end in a real browser via a
throwaway `audiotest` project (a Python-generated 32KB WAV, **deleted afterwards** — nothing
left in `projects/`) exported as a bundle and driven headless: first visit
`[src=audio.wav?v=<savedAt> paused=false loop=true vol=0.35 btn=🔊]`; mute → unmute →
re-mute clicked back-to-back all land correctly (`pref` 1→0→1, glyph following each press);
a returning muted visitor gets `paused=true srcAttached=false`; autoplay blocked gives
`paused=true btn=🔇 errors=0`. The bundle also confirmed `audio.wav` ships in `data/`
automatically. **Not verified:** the admin Settings UI itself (headless admin capture is
unreliable here — see the gotchas), so the picker/Clear/status wiring is code-reasoned only.

**Testing note worth keeping:** in BUNDLE mode all project data is inlined, so `init()` can
run to completion in microtasks *before* the parser reaches an end-of-body `<script>`. A probe
that sets `localStorage` down there is already too late — it must go in `<head>`. A first
attempt at the mute-persistence test looked like a product bug because of exactly this.

---

## 2026-09-04 (client menu skips folders that offer no choice)

`app.js` only. A folder is a navigation aid, not content — drilling into one that presents
no actual decision costs a tap and shows a screen with nothing on it to choose. The live
`anandman` menu had both shapes of this:

| Folder | Contents | Was | Now |
|---|---|---|---|
| LOCATION INTELLIGENCE | 1 video | submenu with one row, then play | plays on the first tap |
| WALKTHROUGH VIDEO | 1 video | same | plays on the first tap |
| BROCHURE | 1 PDF | same | opens on the first tap |
| gallery | 25 `image` children | list of 25 rows titled GALLERY 1..25 | image viewer at photo 1 |
| VIRTUAL TOUR | nothing | drilled into "No items inside this category." | brief notice, menu stays put |

The gallery list was pure friction: every one of those 25 rows landed in the SAME viewer,
because `openClientFolderImageModal` already gathers every image sibling regardless of which
was picked.

- **`resolveFolderTarget(node)`** is the new single decision point, returning `open` /
  `images` / `menu` / `empty`. Rules: exactly one child → open it (recursing while each
  level still offers only one thing, so a folder-inside-a-folder-inside... collapses in one
  tap); all children are `image` nodes → open the viewer at the FIRST one and let prev/next
  do the rest; anything else (sub-folders, or a mix of content types) → the submenu, as
  before, because that IS a real choice. Guarded by a `seen` set and an 8-hop cap: a
  hand-edited or round-tripped tree could point a folder at an ancestor, and walking that
  inside a click handler would hang the page.
- **`activateMenuNode(node, {fromRoot})`** is now the one "visitor clicked a menu row" path,
  shared by the root list and the submenu list so the two can't drift apart. When a skip
  lands on a deeper folder, only that folder is pushed onto `state.menuNavStack` — which
  keeps Back honest: it returns the visitor where they came from, not through levels that
  were skipped on their behalf.
- **`menuRowOpensSubmenu(node)`** drives the `›` affordance, so a row only wears the
  "there's more inside" arrow when clicking it actually opens a submenu. On the live menu
  that leaves the arrow on LANDMARKS alone — confirmed by screenshot.
- **Autoplay needed no change:** `openClientVideoModal` already calls `player.play()` for a
  local file, and both `getYoutubeEmbedUrl`/`getVimeoEmbedUrl` already append `autoplay=1`.
  The video was always going to play; the extra tap was the whole problem.
- **Admin is untouched** — the drawer is client-only and the menu builder still shows and
  edits the true nested structure, so an admin can always see what they actually built.
  Chosen with the user: an empty folder shows a notice rather than a dead-end screen (and
  is NOT auto-hidden — an unfinished section staying visible is the admin's signal), and
  the skip recurses through as many single-item levels as it finds.

**Verification:** `node --check` clean. 26 assertions drive the real extracted
`resolveFolderTarget`/`menuRowOpensSubmenu` against the live `anandman` tree plus edge cases
— two sub-folders, images+video mixed, two videos, a single `gallery`-type child, an empty
folder, a folder whose only child is an empty folder, a contact node, a self-referencing
folder, and nesting past the hop cap (the last two must terminate rather than hang) — all
green. Then end-to-end in a real browser via the bundle-export `file://` route: clicking
GALLERY gives `galleryOpen=true counter=(1 / 25) name=GALLERY 1`, and clicking WALKTHROUGH
VIDEO gives `videoModalOpen=true playerVisible=block srcSet=true paused=false
submenuShown=false`. **Caveat on that last one:** headless needed
`--autoplay-policy=no-user-gesture-required`, because a synthetic `.click()` isn't a user
gesture to Chrome's autoplay policy. A real tap is, so this confirms the wiring reaches
`play()` with no submenu in between — not that autoplay survives every browser policy.

---

## 2026-09-04 (collapsed drawer: a rail, not a clipped half-button)

`styles.css` only. Follow-up to the drawer restyle, from a two-image before/after: the
COLLAPSED state was the problem, not the panel tint.

- **`translateX(-100%)` cut the reopen button in half.** The toggle sits at `right:-20px`
  and is 38px wide, so it spans drawer-x `[W-18, W+20]`; sliding the drawer's right edge
  exactly onto the screen's left edge put it at screen x `[-18, +20]` — **18 of its 38px
  off-screen**, a half-circle bleeding off the edge with no panel behind it. The old comment
  called that "a docked pull-the-drawer-back-out tab" and defended it; the reference mock
  says otherwise, and it reads as clipped chrome rather than a control.
  **Fix:** collapse to `translateX(calc(-100% + var(--collapsed-rail)))` with the rail at
  38px, leaving a slim sliver of the panel on screen and the whole toggle sitting on it.
  Verified by screenshot: rail 0–38px, toggle fully visible at 20–58px — matching the mock's
  0–38 / 15–55. The rail must stay >= the toggle's 20px overhang or the clipping returns.
- **The rail was streaked with cropped menu text.** It exposes the panel's right 38px, which
  is the tail END of the menu rows — so the first render of it showed sliced labels and a
  column of row `›` arrows instead of a plain sliver of glass. The panel's CONTENTS now fade
  out while collapsed (`.cat-drawer.is-collapsed .cat-drawer-inner > *`), keeping only its
  background. The toggle is a sibling of `.cat-drawer-inner`, not a child, so it's untouched
  and stays visible — that markup detail is what makes the one-line fix possible.
  `visibility` rides along on a delayed step so the hidden menu can't be tabbed into:
  invisible-but-focusable is a keyboard trap, not a cosmetic detail.
- **The rail passes pointer events through** (`pointer-events: none !important`, at higher
  specificity to beat `.cat-drawer-inner`'s own `auto !important`), so a drag starting on it
  pans the panorama instead of dying on an inert panel edge. The toggle keeps its own
  `auto`, so the one thing worth clicking there still works.
- **Kept:** the counter-transform warning. The fix moves the DRAWER, not the button — the
  toggle still rides the parent transform with no counter-transform of its own, which is
  exactly why nothing floats loose mid-screen the way the reverted 2026-09-02 attempt did.

**Verification:** screenshot-confirmed at 1280×860 via the bundle-export `file://` route,
in BOTH states — collapsed (clean rail, whole toggle, scene visible through the rail:
(55,69,87) against (73,87,103) beside it) and expanded (logo, all 8 menu rows, footer, panel
translucency all intact). The collapsed state was forced by injecting `is-collapsed` into the
exported BUNDLE copy only; the source is untouched by that.

---

## 2026-09-04 (client drawer: translucent panel + reference proportions)

`styles.css` only — no markup or JS changed. Requested with a reference mock: make the
client's left menu see-through "not very much transparent but that much that things can be
seen", and match the mock's logo/menu sizing and margins.

- **The panel is translucent, not frosted.** Was `rgba(30,34,43,0.88)` + `blur(16px)`; now a
  vertical gradient of `rgba(16,20,29,.58–.74)` + `blur(2px)`. **The blur mattered more than
  the alpha:** a 16px backdrop blur destroys every recognisable feature behind the glass, so
  the panel read as an opaque frosted slab even at 0.88 — dropping to 2px is what actually
  lets the treeline and horizon read through. The gradient is densest at the very top and
  bottom (behind the logo, and behind the footer icons) and thinnest across the middle where
  the menu sits over the usually-darker ground half of the pano — legibility bought where
  it's needed, transparency spent where it shows. Menu labels, brand text and the logo
  additionally carry their own `text-shadow`/`drop-shadow`, so a bright sky behind the panel
  can't wash them out.
- **The brand lockup now shows at every screen size**, not just on phones. This REVERSES a
  previously documented decision ("desktop's top bar already carries it, showing it twice
  costs menu space") — done deliberately at the user's request, since the mock puts the
  logo at the head of the drawer and the whole composition hangs off it. Re-hiding it on
  desktop is a design change, not a cleanup; the comment in `styles.css` says so.
- **Proportions matched to the mock:** drawer 250 → 282px, inner padding 24/18 → 34/26,
  logo lockup up to 168×148 (was 150×82, which squashed a tall lockup), menu rows
  `11px/12px` at 13.5px with 1px tracking and a 3px gap (≈ the mock's 40px rhythm), and the
  footer icons centred with the divider rule dropped — on a translucent panel a hairline
  reads as a scratch on the glass.
- **The menu is vertically centred in the space between logo and footer** (`justify-content:
  safe center`), which is the airy block the mock shows. `safe`, not plain `center`: a
  centred flex column that outgrows its box overflows in BOTH directions and the overflow
  past the start edge is unreachable by scrolling, so a long menu on a short window would
  lose its first items with no way to get at them. A browser that doesn't know the keyword
  drops the declaration and gets `flex-start` — top-aligned, never clipped, the right way
  to fail.
- **Both phone layouts keep their compact fit.** Portrait and landscape already tighten this
  drawer so all 8 items fit without scrolling — the drawer is the only navigation on a
  phone, so an item below the fold is effectively missing. Added overrides hold the small
  logo, the tight brand margin and `justify-content: flex-start` there, and landscape keeps
  the old 250px width (282 of an 844px screen is a third of it). Those overrides need the
  `body:not(.is-admin)` / `.cat-drawer` prefixes for specificity — the base rules are
  declared LATER in the file and a media query adds no specificity of its own, the same
  cascade trap already recorded twice in this project.

**Verification — screenshot-confirmed, unusually for this project.** This is client-only
styling, so the bundle-export route works (`GET /api/export-bundle?project=anandman` → unzip
→ headless Chrome on the `file://` index): checked at desktop 1280×860 and phone-landscape
844×420, both rendering correctly with all 8 menu items visible and unclipped. Transparency
was then confirmed by MEASURING pixels rather than by eye — sampling the panel where bright
sky sits behind it versus dark ground gave (66,80,97) and (37,45,56), tracking the backdrop
exactly as alpha compositing predicts (predicted (56,65,79) at α≈0.68 against a measured
(56,67,83) on the first pass), which a solid panel could not do. That measurement is what
caught the first attempt being too subtle to actually see through; the alpha was lowered ~0.10
and re-measured. Admin is unaffected (`body.is-admin .cat-drawer { display:none }`).

---

## 2026-09-04 (camera aimed at the category's MIRROR IMAGE)

- **`state.view.lon` and a stored landmark lon run in OPPOSITE directions, and the
  category camera code mixed them.** Reported after the previous pan fixes: HEALTHCARE and
  EDUCATION panned fine, but COMMERCIAL, CONNECTIVITY, LIFESTYLE and TEMPLE were still
  wrong. That split is the whole diagnosis. A stored lon uses `atan2(-v.x, v.z)` (the pano
  is viewed from inside, texture X-mirrored). `state.view.lon` is the camera YAW, fed to
  `cam.rotation.set(lat, lon + PI, 0, 'YXZ')`; working that matrix out, the camera's
  forward vector is `(cos(lat)sin(lon), sin(lat), cos(lat)cos(lon))` — the X-mirror of
  `dirFromLonLat`. So `state.view.lon = L` looks at stored lon **−L**.
  `computeLandmarkPanRange` built its arc with the stored-lon formula while its own doc
  comment promised "in `state.view.lon`'s radian convention", and every consumer
  (`animateCameraTo`, the `updateCamera` clamp, the idle sweep) treats it as camera lon.
  Net effect: **the camera was aimed at each category's mirror image across lon 0**, off by
  twice the category's offset from centre. Measured on the user's own project:

  | category | arc centre (stored lon) | aiming error | reported |
  |---|---|---|---|
  | HEALTHCARE | ~2° | ~4° | worked |
  | EDUCATION | ~−6° | ~12° | worked |
  | COMMERCIAL | ~−17° | ~34° | broken |
  | CONNECTIVITY | ~−33° | ~66° | broken |
  | LIFESTYLE | ~−41° | ~82° | broken |
  | TEMPLE | ~53° | ~106° | broken |

  A category sitting near lon 0 is its own mirror, so the error vanished into a 100°+ FOV
  and those two looked correct — which is exactly why this survived the earlier round of
  pan fixes. Projecting each landmark through a faithful reproduction of three.js' YXZ
  camera confirmed it before any change: COMMERCIAL 2 of 3 landmarks off-screen,
  CONNECTIVITY 4 of 5, LIFESTYLE 3 of 6, **TEMPLE 2 of 2** — against 0 of 2 and 0 of 6 for
  the two that worked. Exact match with the user's list.
  **Fix:** one named helper, `viewLonFromDir(v) = atan2(+v.x, v.z)`, with the two
  conventions written out above it, used by `computeLandmarkPanRange`, the ALL-branch
  centroid target, and `computeHome` (same latent bug there — masked because its pitch is
  −86°, i.e. nearly straight down, where yaw barely shows). `lonLatFromDir` keeps
  `atan2(-v.x, v.z)`: it is the stored-lon inverse and is correct as-is.
  **After:** all 6 categories frame every one of their landmarks (or, for a swept one,
  reveal all of them across the pass), on desktop and phone-landscape alike.
- **A swept category is now timed, not speed-capped.** CONNECTIVITY's 161° arc can't fit
  one frame (177° with padding, past the 120° FOV cap), so it tours — but at the ambient
  idle-drift rate that traverse took **134 seconds**, roughly a pixel every 20 frames,
  which reads as a frozen camera showing one landmark rather than as a sweep. The range now
  carries its own `radPerMs`, sized so one pass takes `LANDMARK_SWEEP_MS` (24s) whatever
  the arc's width — self-scaling, so every project's tour is equally readable instead of
  depending on how wide that particular category happens to be. CONNECTIVITY now crosses at
  7.4°/s and all 5 landmarks come into view. A category that FITS still sways at the
  ambient rate: that's ambience, not a tour.
- **Corrected a stale comment rather than trusting it.** The sweep branch claimed "minLon
  is the visual right edge and increasing lon sweeps leftward". With the range now in
  camera lon, `sweepMin` is the visual LEFT edge and the tour reads left-to-right —
  measured (at `sweepMin`, every visible landmark of a real 5-landmark category sat in the
  left half), not assumed, and the comment now says so along with a note to re-measure if
  anyone flips a convention here again.

**Files:** `app.js` only. **Verification:** `node --check` + `ast.parse` on `server.py`
clean; a harness projects the real landmarks through a faithful three.js YXZ camera
reproduction and asserts per category — 6/6 PASS (5 fitted categories: every landmark
on-screen at rest; CONNECTIVITY: 5/5 revealed across the pass). The earlier fly-in
assertions (0.0° first-frame jump, 0 frozen frames) and the landmark `featured` assertions
still pass. A grep guard confirms the only remaining `atan2(-v.x, ...)` in code is
`lonLatFromDir`, where it belongs. **Still not** browser-confirmed — headless capture of
this app is unreliable (see the gotchas), so the on-screen result wants a real look.

---

## 2026-09-04 (camera pan on category select)

Four fixes in the landmark-category camera path, all in `app.js`. Reported as "some issue
with panning of camera when selecting any of the categories"; diagnosed by replaying the
real `computeLandmarkPanRange`/`meanDirection`/`isLandmarkMatchCategory` sources against the
user's own `projects/anandman` landmarks + saved view, frame by frame, rather than by eye.

- **The arc clamp was eating the fly-in — the main bug.** `applyCategoryFilter` installs
  `state.landmarkPanRange` and *then* calls `animateCameraTo`, but `updateCamera` enforced
  that range as a hard clamp on `state.view.lon` **every frame**. The fly-in by definition
  starts outside the range it just installed, so every frame rendered pinned to the range
  boundary: the camera snapped to the destination on frame 1 and sat frozen while only the
  FOV (not clamped) animated. Measured across the six categories in that project: 5 of 6
  jumped **15.6–70.2° instantly** and stayed frozen for **22–29 of 36** animation frames.
  For a "fits" category the range is only ±3.5° wide (`LANDMARK_SWAY_HALF`), so essentially
  the entire journey sat outside it. CONNECTIVITY was the exception — wide-arc sweep branch
  whose range happened to contain the starting view — which is exactly why the problem felt
  inconsistent from category to category.
  **Fix:** `updateCamera` skips the clamp while `cameraAnimTimer` is live. The arc lock is
  meant to bound where the view can *wander*, not to fight the animation delivering it
  there, so it now engages the moment the fly-in ends (with the camera already inside it).
  All six categories now pan the full distance with a 0.0° first-frame jump and 0 frozen
  frames, and every one still lands inside its arc so the clamp engages without a snap.
- **Every landmark DOM rebuild re-flew the camera.** `rebuildLandmarkDOM()` ends by calling
  `applyCategoryFilter(state.selectedCategory)` — it only wants the highlight/dim classes
  re-applied to the freshly-created nodes, but it got the whole camera move too. With `ALL`
  selected `panInfo` is null while `validDirs` isn't, so the third branch fired
  `animateCameraTo(centroid, 72)`. Consequences: at client boot `setLandmarks()` → rebuild
  dragged the camera **45.5° off the saved `alignment.json` view and forced FOV 72**,
  breaking the documented WYSIWYG guarantee; and in admin, `addLandmark`/`deleteLandmark`/
  `setLandmarkRender` each yanked the view away right after a pin was dropped at the centre
  of it. **Fix:** `applyCategoryFilter(cat, { moveCamera = true })`; `rebuildLandmarkDOM`
  passes `moveCamera:false` for a styling-only refresh. (The one recursive path —
  `applyCategoryFilter` → `rebuildLandmarkDOM` when `lmDom` is empty → back — terminates:
  the inner call is styling-only and `lmDom` is populated by then.)
- **A "fits" category was framed on the wrong centre.** The fit decision and the FOV it
  picks both come from the arc `[minLon,maxLon]`, but the camera aimed at
  `meanDirection(dirs)`. For an uneven spread those differ — COMMERCIAL's vector mean sat
  **12.9° off the arc centre**, pushing an edge landmark outside the very frame the fit
  calculation had promised would hold all three. **Fix:** aim at `(minLon + maxLon) / 2`.
  Latitude still comes from the mean (no seam to straddle vertically). Verified: all five
  "fits" categories now contain every one of their landmarks.
- **Idle auto-pan was frame-rate dependent.** `lon += 0.00035` *per frame* meant the same
  scene drifted twice as fast on a 120Hz phone as on a 60Hz laptop, and crawled whenever
  the frame rate dipped. **Fix:** `AUTOPAN_RATE` (rad per ms) × a `dtMs` capped at 100ms
  (so returning to a backgrounded tab resumes rather than lurching). The rate is the exact
  per-ms equivalent of the old 60fps constant, so the feel on a 60Hz display is unchanged.
  **Not changed:** the sweep speed itself — 1.20°/s, i.e. ~134s for one pass of
  CONNECTIVITY's 161° arc. That's a taste call, not a bug; say so if it should be quicker.

**Verification:** `node --check app.js` + `ast.parse` on `server.py` clean; the landmark
`featured` assertions still pass unchanged. The before/after frame-by-frame replays live in
the session scratchpad (`sim_pan.mjs` / `sim_pan_after.mjs`) — they drive the real extracted
functions, so they measure the shipped math, not a paraphrase of it. **Not** confirmed in a
live browser: headless capture of this app is unreliable (see the gotchas), so the actual
on-screen smoothness wants a real look.

---

## 2026-09-04 (later same day)

- **The show-by-default control is now a ✓ ✕ PAIR, not a single toggle — the first
  version inverted people's intent.** Reported straight after shipping: "the landmarks that
  were tick marked are not currently visible, which is quite the opposite of what I
  expected." The engine was correct — checked the user's live `projects/anandman/landmarks.json`
  and replayed the real `parseLandmarks`/`isLandmarkShown` over it in Node: 15 `featured:true`
  landmarks draw in the default view, the 9 `featured:false` ones don't, and both `NIT Raipur`
  and `RITEE College` still come back under EDUCATION. Exactly as designed. **The UI was the
  bug.** Every landmark starts ticked (backwards compatibility), so a single button showing
  the CURRENT state reads as an ACTION — "tick the ones I want up-front" — and going down
  the list clicking the wanted landmarks turned each one OFF. The hidden set proves it: AIMS
  Raipur, NIT Raipur, Raipur Railway and the Bilaspur Highway, i.e. precisely the marquee
  landmarks anyone would feature.
  **Fix:** two separate buttons per row (`.ax-lm-vis-grp` holding `.ax-lm-vis-yes` +
  `.ax-lm-vis-no`), which makes every click idempotent — ✓ always means show, ✕ always
  means hide, and clicking the already-active half is an explicit no-op
  (`setLandmarkFeatured` early-returns when the value wouldn't change, so it can't flip and
  can't fire a spurious save). The active half is filled, the inactive half sits at
  `opacity:.45`. This is also what the original request literally asked for — "a tick and
  cross button in front of every landmark" — two buttons, not one.
  **Also added, since curating ~24 landmarks one row at a time is the real workflow:**
  `setAllLandmarksFeatured(on)` behind **✓ Show all** / **✕ Hide all** (`#axLmShowAll`/
  `#axLmHideAll`), and a live `✓ N of M shown by default` count (`#axLmCount`) refreshed by
  `refreshLmList`. "Hide all, then ✓ the handful you want" is now both the fastest way to
  curate and the one-click recovery from having picked the wrong set. The × delete button is
  untouched in behaviour and position.
  Files: `app.js`, `index.html` (bulk row + rewritten legend), `styles.css`
  (`.ax-lm-vis-grp`/`.ax-lm-vis-yes`/`.ax-lm-vis-no`/`.ax-lm-bulk`/`.ax-lm-count`).
  **Verification:** `node --check` clean; the 11 extracted-source assertions still pass
  unchanged (the visibility engine wasn't touched); the inversion diagnosis was confirmed
  against the user's real project data rather than reasoned about. Button styling remains
  un-screenshot-able here (headless admin limitation) — needs the user's eyes.
  **Lesson worth keeping:** a state-showing toggle whose default is "on for everything"
  invites exactly this inversion. When the job is "pick the few you want" out of a
  fully-on list, give it two explicit buttons, not one that flips.

---

## 2026-09-04

- **Landmarks can now be kept out of the default view without being deleted — a
  per-landmark tick/cross in the admin list.** Projects that had grown to ~20 landmarks
  drew all of them at once in the client's default (no category picked) view, which read
  as clutter. Each landmark now carries a `featured` flag, toggled by a ✓/✕ button
  in the admin Landmarks list, and visibility is decided in one place,
  `isLandmarkShown(lm, cat)` (`app.js`, next to `isLandmarkMatchCategory`):
  - **No category picked (ALL)** → only ticked (`featured !== false`) landmarks draw.
  - **A category picked** → *every* landmark in that category draws, ticked or not — a
    category view is a deliberate, complete list, so an unticked landmark is never
    unreachable, just not shouted about up-front.
  - **Admin, Landmarks tab** → always draws everything, so an unticked landmark can still
    be found and dragged; its banner gets `.is-unfeatured` (dashed outline + faded) so it's
    obvious which ones the client holds back.
  `applyCategoryFilter`'s ALL camera framing and `renderLandmarks`' mobile density cap both
  now count the same featured set, so the camera frames what's actually on screen and
  "+N more" stays truthful.
- **The tick/cross is deliberately not a delete, and the UI says so.** The pre-existing
  × delete button stays exactly where it was; the new toggle sits immediately to its
  left with a different shape and colour (green filled ✓ when on, hollow muted ✕ when
  off), both buttons carry explicit `title`/`aria-label` text spelling out
  "does NOT delete" vs "DELETE permanently", the row itself dims and goes dashed when
  unticked, a legend block above the list explains all three states, and `setAxStatus`
  reports the new state plus a running "N of M show by default" count — warning outright
  if the last tick is removed and the default view would be empty.
- **Persistence:** `featured` round-trips through `landmarks.json`
  (`buildLandmarksData`/`parseLandmarks`), the browser session snapshot, and Export.
  **Backwards compatible:** an existing `landmarks.json` has no `featured` key, and the
  parse defaults it to `true` (`l.featured !== false`), so every current project looks
  exactly as it does today until an admin unticks something.
  Files: `app.js`, `index.html` (legend markup in `#axTabLandmarks`), `styles.css`
  (`.ax-lm-vis`, `.ax-lm-legend`, `.ax-lm-li.is-hidden-default`, `.lm-banner.is-unfeatured`).
  **Verification:** `node --check app.js` + `python -c "import ast; ast.parse(...)"` on
  `server.py` both clean; the visibility/persistence logic was unit-tested by extracting
  the real `parseLandmarks` / `buildLandmarksData` / `isLandmarkShown` sources out of
  `app.js` and running 11 assertions in Node (legacy default, `false` surviving a
  save→load round-trip, ALL hiding vs category showing, admin override) — all green.
  The visual result (button styling, dashed hidden rows) is **not** screenshot-confirmed:
  headless screenshotting of admin mode remains unreliable here (see the gotcha in
  CLAUDE.md), so the CSS is code-reasoned only and wants a look in a real browser.

---

## 2026-09-08 (fix 2) — client drawer shows only the authored menu; SW served stale config

- **Removed the hardcoded `AERIAL VIEW` and `LANDMARKS` rows** from the client drawer
  (`renderClientSidebar`). The drawer is now exactly the menu built in admin. A project
  with no authored menu shows **no drawer at all** rather than an empty panel.
  Files: `app.js`.
- **…and made both authorable instead, so the removal isn't a net loss.** 5 of 9 projects
  here have landmarks but no menu items, and the drawer row was the only **desktop** route
  into the landmark category filter (`openLandmarksCategoryPicker` is otherwise reachable
  only from the mobile overflow hint). Added two zero-configuration content types —
  **📍 Landmarks** and **🗺️ Aerial View** — dispatched from `openNodeContent`, described by
  `NO_CONFIG_CONTENT_TYPES` (which drives the wizard hint that replaces the URL/upload
  row). Any project that wants those rows back adds them in the menu builder.
  Files: `app.js`, `index.html`.
- **Service worker served STALE project config — the real reason a new menu item didn't
  appear.** `sw.js` used `staleWhileRevalidate` for everything under `/projects/`, which
  returns the *previous* copy on the first load after an admin save and only refreshes on a
  **second** reload. For an authoring tool that reads as "my change didn't save". Project
  **config** files (`.json`/`.csv`/`.svg` — a few KB each) are now **network-first with
  cache fallback**; images and media stay stale-while-revalidate (large, and already
  cache-busted by their own `_ver`). `VERSION` bumped to `v2` so an installed worker drops
  the old caches and cannot keep serving under the previous rules. Files: `sw.js`.
- Note: the `act === 'aerial'` / `act === 'landmarks'` click handlers in
  `wireClientSidebarButtons` and `wireViewControls` are now unreachable (nothing emits
  `data-act` any more). Left in place rather than removed in the same pass.

## 2026-09-08 (fix) — `panotour` menu items lost their `tourId` on save

- **`cleanNodeForSave` is a whitelist, and it silently dropped `content.tourId`.** It
  rebuilds `content` from `url` + `fileName` only (plus `images` for galleries), so every
  save of a `panotour` menu item threw the tour reference away. The item still appeared in
  the menu and simply did nothing when clicked — the worst kind of failure. Added `tourId`
  to the whitelist, with a comment marking it as a whitelist so the next content type that
  carries its own field doesn't repeat this. Files: `app.js`.
- **`openClientPanoTour` now fails loudly and recovers where it safely can.** A missing
  `tourId` with exactly one tour in the project opens that tour (no ambiguity, and it
  repairs items saved before the fix); with several tours it says which control to use
  instead of doing nothing. Files: `app.js`.
- **Repaired existing data:** `projects/pano-testamit/alignment.json`'s "3BHK" menu item
  had `content:{url:"",fileName:""}` — re-pointed at tour `t1`.
- **Not a bug, worth documenting:** `wireAdmin` hides the client nav drawer
  (`els.catDrawer.hidden = true`) whenever `?admin=1` is set, because admin has its own
  sidebar. The menu is therefore **only ever visible in the client view** — the reported
  "menu is not visible" was this, on top of the `tourId` loss above.

## 2026-09-08 (later) — tour viewer, hotspot linking, `panotour` menu type

- **Fixed: every saved tour node pano was a 15-byte `[object Object]` file.**
  `resizeImageToBlob` returns `{ blob, W, H }`, but `addTourNodeFromFile` stored the
  **wrapper** as `panoBlob`, so `serverSave` stringified it. Every node image the admin
  had uploaded was silently destroyed on save (the files existed on disk, which is why
  the earlier end-to-end check passed — it verified files were *written*, not that they
  decoded). Now unwraps `out.blob`. Repaired the three corrupt uploads in
  `projects/pano-testamit/` from the demo renders. Files: `app.js`.

- **Client tour viewer — `openClientPanoTour` (Phase 1 steps 2–5).** Ported from the
  Phase 0 spike onto this file's own conventions: reuses `loadPanoTexture` (GPU cap +
  `flipY=false` — the spike's default-flipY bug rendered panos upside down),
  `dirFromLonLat`/`projectDir` from the landmark path, and the existing pano sphere.
  Per **D-11** the tour **takes over the main viewer** rather than opening a second
  canvas: plots/drape/landmarks/amenities hide, the sphere swaps textures, and
  `closePanoTour` restores the saved view + texture exactly. Crossfade is a second
  sphere at 0.985× **sharing the pano geometry** (dispose material only, never the shared
  geometry). Heading is *carried over* between nodes; `defaultView` applies on entry only,
  so walking never spins the camera. LRU texture cache (`TOUR_CACHE_MAX = 3`) + one-hop
  neighbour prefetch, straight from the 0-A finding that download weight (~2 MB/node) and
  GPU residency (~179 MB/node) are separate problems. Tour chrome (`refreshTourBar`):
  title, room strip, exit. Files: `app.js`, `index.html` (`#tourHotspots`, `#tourBar`),
  `styles.css`.

- **Hotspot authoring (Phase 1 steps 3/1.4).** Nav hotspots are direction-anchored and
  projected each frame, exactly like landmarks. In the admin **Tour** tab, each node row
  gets a **▶ open in viewer** button; while a tour is open the tab grows a hotspot editor
  for the current room — add (drops at view centre), retarget, relabel, delete, and
  **drag onto the doorway** (`startTourHsDrag`, same raycast→`lonLatFromDir` model as
  landmark pins). Plus **⌖ Set this view as the room's start view**. Client taps route
  through `pick()` because `#pano` grabs pointer capture (the amenity-pin trap again).
  Files: `app.js`, `styles.css`.

- **New menu content type `panotour`.** Distinct from the existing `tour`, which iframes
  an **external** 3DVista/Kuula URL or uploaded file; `panotour` stores a **`tourId`**
  referencing a tour in this project's `tour.json` (D-12). Added the wizard type card
  (🧭 360° Tour), a tour picker replacing the URL/upload row (`renderWizardTourPicker`,
  which warns when a tour has no nodes or no hotspot links), save/edit round-trip via
  `wizardState.tourId`, and the `openNodeContent` branch. Files: `app.js`, `index.html`.

- **`server.py`: tour-only projects + tours in the standalone bundle.**
  `/api/projects` and `do_bundle` required a `plots.svg`, which hid tour-only projects
  entirely; both now accept `plots.svg` **or** `tour.json`. `tour.json` added to
  `BUNDLE_DATA_FILES`, and new `tour_pano_basenames()` feeds node panos into
  `build_embedded_images_json` — they are WebGL textures, so under `file://` they must be
  data: URIs like the background pano (a loose sibling file is rejected as tainted).
  Closes the Phase 1.7 bundle gap. Files: `server.py`.

- **Demo project made openable.** `projects/panotour-demo/` was spike-format
  (`{nodes, links}`) which `parseTours` reads as zero tours, and had no `alignment.json`
  → empty `menuConfig.tree` → **no menu at all on the client**, which is why the feature
  looked broken. Added `spike/seed-demo-tour.py`: converts it to the app's
  `{tours:[…]}` shape (9 rooms, 16 links, living room as hub/start) and writes an
  `alignment.json` carrying a `panotour` menu item. Hotspot directions are evenly spread,
  **not surveyed** — drag them onto real doorways in admin. Also moved the 343 MB of raw
  PNG masters into `panotour-demo/_source/`: `do_bundle` copies every **top-level** file
  into `data/`, so the masters were shipping in every export — **bundle went 392 MB →
  43.5 MB**. Files: `spike/seed-demo-tour.py` (new), `projects/panotour-demo/*`.

- **Verified:** `node --check app.js`, `python ast.parse server.py`; all new helpers /
  CSS classes / HTML ids cross-checked as defined; `/api/projects` now lists
  `panotour-demo`; client + admin URLs 200; real bundle built via the endpoint contains
  `data/tour.json`, the tour (9 nodes / 16 links) embedded in `B91_BUNDLE_FILES`, and all
  9 node panos in `B91_BUNDLE_IMAGES`; seeded tour has no dangling links.
  **Not verified in-browser** — no browser tooling in this session, so the visual result
  (crossfade, hotspot placement, takeover/restore) needs the user's eyes.

## 2026-09-03

- **A manual drag now releases the landmark category's pan arc.** Selecting a category
  frames its landmarks and confines the view to their arc (`state.landmarkPanRange`,
  enforced in `updateCamera` — the single place the view is consumed, so auto-pan, the
  fly-in AND a drag were all equally bound by it). The framing is wanted; the cage isn't:
  a visitor who deliberately drags should be able to look anywhere. Now the first real
  drag (>6px, client only) clears the range and cancels any in-flight fly-in, restoring
  free 360° look and free idle spin. The category FILTER is deliberately untouched —
  that's `state.selectedCategory`, so the chosen landmarks stay highlighted while the
  visitor looks around, and tapping a category again re-frames as before. Admin is
  unaffected (the clamp never applied there), and with no category selected the range is
  already null so this is a no-op. `app.js` only.
  **Verification honesty:** this one is code-reasoned + syntax-checked only. I tried to
  prove it by scripting the real interaction in the exported bundle (select a category,
  then dispatch a long synthetic pointer drag) and measuring the landmark banners' on-screen
  positions — but a control run with NO category selected, where no clamp exists at all,
  showed the banners equally motionless (`before/mid/after` identical). So synthetic
  `PointerEvent`s don't drive this app's pan handler in headless: the harness can't
  distinguish "clamp released" from "drag never happened", making the test worthless rather
  than reassuring. Needs a real device/browser to confirm.

- **Portrait is now GATED, not nudged — phone visitors must rotate before any content is
  shown.** Follow-up to the rotate prompt below, at the user's request: the animated screen
  is no longer a dismissible hint but a hard requirement.
  - `.rotate-hint` became `position: fixed` + fully opaque (`var(--bg)`) at `z-index: 300`,
    above every panel and modal. A translucent version would still leave the squeezed,
    unusable portrait layout visible underneath, which is the very thing this exists to
    prevent.
  - Removed BOTH dismiss paths — the ~5s auto-hide timer and the tap-to-close handler.
    Either would have dropped the visitor into the portrait layout the gate is there to
    keep them out of. The only way past it is actually turning the device.
  - Orientation detection now listens on the orientation media query, `resize`, AND
    `orientationchange` (the media query fires before the viewport settles on some mobile
    browsers, and `isMobilePortrait()` reads `window.innerWidth` — `resize` is what
    reliably catches up), with a short delay on the orientation events for the same reason.
  - Both manifests (`server.py`'s generated one and the static one bundles ship with) now
    declare `"orientation": "landscape"`, so an INSTALLED app simply opens the right way up
    and never meets the gate at all.
  - Unaffected on purpose: desktop (`isMobilePortrait()` is never true on a real desktop
    window), admin (already `!state.admin`), and tablets in portrait (>720px wide), which
    get the normal layout rather than being blocked.
  - **Verified by screenshot:** 390x844 portrait shows ONLY the rotate screen with no
    content visible behind it; 844x390 landscape and 1400x900 desktop are unchanged.
    Files: `styles.css`, `app.js`, `server.py`, `manifest.webmanifest`.

- **All three status filters on landscape phones, plus an animated rotate prompt.**
  - **Reserved and Sold joined Available.** Landscape hides the header legend, and its
    stand-in only carried "Available", so a phone visitor couldn't see or filter the other
    two statuses at all. Replaced the single `#zoomAvailableBtn` with a
    `#zoomStatusGroup` of three (`.zoom-status-btn`, ids `zoomAvailableBtn`/
    `zoomReservedBtn`/`zoomSoldBtn`), each carrying its status colour dot and live count,
    right-aligned above the zoom controls. Made them read as controls rather than labels:
    34px min tap height, a lit gold border for the pressed/on state (dimmed + grayscaled +
    struck-through count when off), and a press scale. Sync now runs through one helper,
    `syncZoomStatusButtons()` — counts from `renderLegend`, pressed-state from
    `toggleFilter` — so the chips can't drift from the header legend, and clicks are wired
    generically off each button's `data-status`.
  - **Animated "rotate your phone" prompt** replaces the plain text toast, which was easy
    to miss and didn't communicate the ask as directly as motion does. New `#rotateHint`
    overlay: dimmed blurred backdrop, a gold phone outline that turns 0deg → -90deg on a
    2.6s loop with a hold at each end (a continuous spin reads as a loading spinner rather
    than an instruction), a curved arrow, and the line "Rotate your phone / The map opens up
    in landscape". Auto-clears after ~5s, and clears instantly on tap or as soon as the
    device is actually turned (rotating INTO landscape means the hint was obeyed — leaving
    it covering the view they just asked for would be perverse). Honours
    `prefers-reduced-motion` by showing the end state without animating. Not persisted as
    dismissed-forever on purpose: it's a momentary nudge, and someone who rotates back to
    portrait later is in the same situation again.
  - **Verified by screenshot** (bundle-export/`file://`): 844x390 shows all three chips
    colour-coded and right-aligned; 390x844 shows the rotate overlay rendering correctly;
    1400x900 desktop unchanged — legend still in the top bar, no floating chips, no overlay.
    Files: `index.html`, `styles.css`, `app.js`.

- **Collapsed drawer's arrow pointed the wrong way — two fixes cancelling each other out.**
  `app.js` already swaps the glyph (`‹` ⇄ `›`) in both the toggle handler and the portrait
  auto-collapse, and `styles.css` ALSO rotated `.cat-toggle-ico` 180° for `.is-collapsed`.
  Applied together they undo one another, so a collapsed drawer showed a left-pointing
  ("close") arrow when it was already closed and should have been inviting the visitor to
  open it rightwards. Removed the CSS rotation, leaving the JS glyph swap as the single
  source of truth (comment left in its place so it isn't reintroduced). Verified by
  screenshot: collapsed portrait now shows `›` docked at the left edge, open landscape
  still shows `‹`. `styles.css` only.

- **Home-screen icon is now the ADMIN'S logo, and the phone menu leads with the project's
  branding.** Two related asks, with a reference screenshot for the menu layout.
  - **Per-project PWA identity.** The manifest was static, so every project installed as a
    generic "Build91" icon. A manifest is static JSON by nature, so the per-project version
    has to be server-generated: new `GET /manifest.webmanifest?project=<id>` in server.py
    emits the admin's brand name/tagline and icons built from their logo, and
    `setupPwaIdentity()` (app.js, runs during module eval, before the browser evaluates
    installability) appends the current `?project=` to the `<link rel="manifest">` and the
    apple-touch-icon. New `GET /api/pwa-icon-{192,512,512m}.png?project=<id>` letterboxes
    the logo onto a square canvas at the required size (home-screen icons must be square
    and >=192px or the site isn't considered installable, and a logo is rarely either); the
    maskable variant gets extra padding since the OS crops it to its own shape. Results are
    cached beside the project as `.pwa-icon-*.png`, regenerated when the logo is newer.
    Pillow is an OPTIONAL import (`_pillow_ok()`) — this server is stdlib-only by design,
    and without it, or without a project logo, it falls back to the bundled B91 icons.
    Verified: the manifest for `sample` returns the admin's "ANDAMAN - ELEGANZA" naming, and
    the generated 192px icon is a correct square rendering of their actual logo.
  - **Drawer branding on phones.** The drawer had no branding at all; the logo lived only in
    the top bar, which is squeezed in portrait and hidden outright in landscape — so on a
    phone the visitor never saw whose site it was. Added `.cat-drawer-brand` (populated by
    `applyBrand`, so it can't drift from the top bar's version), shown ONLY on phones:
    stacked and centered in portrait, and a compact grid in landscape (logo spanning both
    text lines) where vertical space is scarce. Menu rows were tightened at the same time so
    the whole menu fits without scrolling — an item below the fold is effectively missing
    when the drawer is the only navigation. When a logo image loads, the name/tagline text
    is suppressed (`has-logo`), since a logo almost always contains the wordmark already —
    it was otherwise printed twice.
  - **Cascade gotcha hit again en route:** these mobile overrides sit ~line 790 while the
    drawer's base rules are at ~1030+, and a media query adds no specificity — so the later
    base rules silently won and the whole block did nothing (the first screenshot showed no
    branding and untightened rows). Fixed by scoping each override with `.cat-drawer`.
    Caught only because it was screenshotted; worth remembering that "the CSS is in the file"
    is not evidence it applies.
  - **Verified by screenshot** (bundle-export/`file://` route) at 844x390 landscape, 390x844
    portrait, and 1400x900 desktop: branding renders correctly in both phone orientations
    with every menu item visible and no scrollbar, and desktop is unchanged (no drawer
    branding, original spacing). Files: `server.py`, `app.js`, `index.html`, `styles.css`.

- **Landmark/amenity labels no longer cling to the screen edges — out-of-view markers now
  simply leave view.** User screenshot showed several "New landmark" banners stacked
  against the right edge (and one half-cut on the left), tracking along while panning.
  Cause: both renderers clamped the label's x into the viewport so it could never be cut
  off (`Math.max(halfW+margin, Math.min(W-halfW-margin, x))` in `renderLandmarks`, and the
  equivalent `translateX(calc(-50% + Npx))` chip nudge in `renderAmenities`). Reasonable in
  isolation, but it meant everything currently off-frame piled up on the sides instead of
  being out of shot. Removed both clamps: markers now sit at their true projected position,
  and one whose label wouldn't fit fully is hidden rather than shown clipped — so it
  disappears cleanly at the edge instead of sliding along it. Per the user: "if they are out
  of scope let them be".
  **Verified by screenshot** via the bundle-export/`file://` route (the reliable one for
  rendering work): at 760px the banners now sit spread at their real positions with no edge
  stack, and at 390px (phone portrait) three show, none clipped, none crowding the sides.
  Note the banner still partly hidden behind the open category drawer on desktop is
  unrelated and pre-existing — the drawer is an overlay on top of the pano, not a column
  beside it. `app.js` only.

- **Contact-card photo was never pre-downloaded — found from a precise user observation.**
  Reported symptom: opening the installed shortcut in airplane mode, SOME images were
  missing; turning the net on loaded them; afterwards they worked offline too. That
  sequence is diagnostic — it means those files were absent from the pre-download list but
  got cached as a side effect of being viewed online (the runtime stale-while-revalidate
  path), i.e. a gap in `collectOfflineAssets`, not a caching failure and NOT (as the user
  reasonably wondered) an inherent "needs net on first open" behaviour.
  Root cause: the menu walk handled `parent` and `child` nodes and skipped everything else,
  but the Contact card is its own node kind (`kind: 'contact'`) whose photo lives at
  `node.contact.image`, outside the `content` object the walk inspects. Now collected,
  resolved via `assetUrl(c.image)` exactly as `openClientContactModal` does so the cache
  key matches what the viewer requests. Also hardened two adjacent cases the viewers accept
  but the collector ignored: a local path stored in `content.url` instead of `content.fileName`,
  and the same for a gallery entry's `url`.
  **Verified by replaying the collector's logic in Node against the real committed project
  files:** 22 items collected (was 21), contact photo present, every collected path exists
  on disk, totalling 142.3MB — note that's less than the 252MB folder, because `sample`
  contains 7 videos of which only 4 are actually linked in the menu.
  Checked and found NOT affected: landmark/amenity renders (`parseLandmarks`/`parseAmenities`
  unwrap `render.file` to a string, which `renderSrc` handles) and plot media (the two refs
  in this project's `plots.csv` are genuinely external `http(s)` links, correctly excluded).

- **Install prompt stopped producing a home-screen shortcut — caused by the auto-reload
  added earlier the same day.** `clients.claim()` fires `controllerchange` on a FIRST
  visit too (no previous controller), not just when a new worker replaces an old one — so
  every fresh visit reloaded itself mid-boot, and that reload discarded the captured
  `beforeinstallprompt` event. Tapping Add then downloaded the content but silently did
  nothing about installing, because there was no prompt left to fire. Guarded the reload on
  `hadControllerAtLoad` so it only runs for a genuine update. Also: `prompt()` is only
  valid inside the originating tap, so it can't be deferred or retried — when no install
  event is available, the flow now says where the manual control is (menu ⋮ → Install app,
  or Share → Add to Home Screen on iOS) instead of skipping it silently. `app.js` only.
- **Page navigation is no longer network-first without a deadline.** Asked whether a
  first offline open has to wait on resources: it doesn't (everything is served locally),
  but the navigation handler awaited the network and only fell back to cache on failure —
  fine when fully offline (fails instantly) yet potentially many seconds on a WEAK signal,
  which is the worse case for an app whose promise is "opens instantly". Now, when a
  cached copy exists, the network gets a 2.5s head start (so an online visit still picks up
  the latest) and the cached copy wins if it doesn't answer in time; the network attempt
  continues regardless and refreshes the cache for next launch. First-ever visit (nothing
  cached) is unchanged. `sw.js` only.
  Worth recording from the same investigation: startup cost is dominated by IMAGE DECODE,
  not networking — `sample` carries a 4.9MB pano JPEG plus a **20.9MB** site-plan PNG, both
  decoded, downscaled to the GPU texture cap and uploaded on every launch, cached or not.
  Recompressing that PNG is the single biggest available startup win. (Whole project: 252MB,
  of which ~161MB is video — relevant to the storage-quota entry below.)

- **Actually attack the storage ceiling rather than just report it — request persistent
  storage, and warn before downloading if the project can't fit.** Follow-up to the entry
  below, after the user (emphatically) restated that EVERYTHING — video, images, PDF —
  must be available offline. Nothing about what gets downloaded changed; what changed is
  the chance it survives:
  - `requestPersistentStorage()` calls `navigator.storage.persist()` from inside the Add
    tap (browsers are more willing to grant it during a user gesture). This is the API
    that lifts the two limits that would otherwise truncate a video-heavy project: the
    data becomes exempt from eviction under storage pressure, and Chromium grants a much
    larger quota than the default best-effort allowance. No-op where unsupported.
  - `storageHeadroom()` (`navigator.storage.estimate()`) is checked BEFORE the prompt
    commits: if the project is larger than the free space, the banner says so up front
    ("may exceed this phone's free space (X left)") instead of letting the visitor sit
    through a download that gets silently cut off at the quota.
  - The partial-save message now distinguishes causes — `"N/M saved — phone storage full"`
    vs plain `"N/M saved"` — because those need different responses (free up space or trim
    the project, vs. just retry on a better connection).
  - Note for the real rollout: iOS Safari is the tight one, and its allowance is
    materially larger once the site is installed to the Home Screen — which the combined
    prompt already encourages in the same tap.

- **"Downloaded" now means "verified present in the cache", not "the bytes came down"
  — closing a silent-failure gap that video is the most likely thing to hit.** Prompted by
  the user asking whether video actually gets cached on phones. It does by design (video is
  collected, sized, fetched unranged so the WHOLE file is stored, and served back through
  `respondVideo`'s byte-range slicing so offline seeking works) — but the honesty of the
  "Done" message still rested on an assumption: that `cache.put()` in `sw.js` succeeded.
  It can reject on its own, most plausibly on a per-origin **storage quota**, which video
  is exactly what blows past (mobile browsers cap this; iOS Safari tightly). Those writes
  happen in the worker, detached from the response the page sees, so a quota failure was
  invisible to the download loop and would have been reported as success — the same false
  "Done" this flow already got burned by once, just one layer deeper.
  - New `verifyCachedItems()` (app.js): after the fetch loop, asks Cache Storage directly
    (the page shares it with the worker) which items are actually there, matching the same
    query-stripped keys `sw.js` writes. Anything missing counts toward the `"N/M saved"`
    total and blocks the per-project "saved" flag, so a quota-truncated save re-offers
    instead of claiming success.
  - `sw.js`: every `cache.put()` now has a `.catch()` — previously a rejection became an
    unhandled promise rejection that no surrounding `catch` could see.
  - Still unverified on a real device: whether the videos in this project actually fit
    within the phone's quota, and the byte-range playback path itself (`respondVideo`/
    `sliceRange`) under a real seek/replay.

- **Android has no inline PDF viewer at all — added a JS-rendered brochure viewer
  (pdf.js) for that platform.** The previous fix (open the PDF via a direct top-level
  navigation instead of an iframe) was based on the assumption that Chrome's built-in PDF
  viewer would take over on a real navigation. Real-device retest disproved it: Android
  showed its "Download file again? File name already exists" dialog instead — i.e. it
  downloads PDFs rather than displaying them, in an iframe AND on direct navigation.
  Confirmed the server isn't at fault (`Content-type: application/pdf`, no
  `Content-Disposition`, and the same file previews fine on iOS), so this is simply a
  missing browser capability (Chrome for Android only gained an inline PDF viewer in
  fairly recent versions). Nothing at the URL/markup level can work around that, so
  Android now renders the pages itself:
  - Vendored **pdf.js 3.11.174** (`vendor/pdf.min.js` + `vendor/pdf.worker.min.js`,
    ~1.4MB). v3 deliberately, not v4 — v4 relies on `Promise.withResolvers` and similar
    modern syntax that the older Android builds this exists to serve don't have.
  - `loadPdfJs()` injects it as a classic `<script>` on demand (it's a UMD build defining
    `window.pdfjsLib`; app.js is an ES module and can't `import` it) — only loaded when a
    brochure is actually opened on Android, never on other platforms.
  - `renderPdfInto()` draws pages sequentially into stacked canvases in the existing
    brochure modal (new `#clientBrochureCanvas` container + `.brochure-canvas` styles);
    sequential rather than parallel so a long brochure doesn't spike memory on exactly the
    low-end devices that need this path. iOS/desktop keep the native iframe viewer, which
    is the better experience (real text selection, pinch-zoom) where it actually works.
  - **Fail-safe:** a hang is not a rejection, so a `.catch` alone couldn't prevent a
    visitor being stranded on "Loading brochure…". Page 1 painting races a 12s deadline;
    if the deadline wins, the render is abandoned (`shouldStop`) and the PDF is handed to
    the phone's own handling — a download, not a preview, but never a dead end.
  - Both pdf.js files added to `sw.js`'s `SHELL_URLS` so they're precached — a visitor may
    well open the brochure for the first time only after going offline.
  - Canvases are dropped in `closeCustomModal` (they can be tens of MB on a long brochure).
  - **Verified as far as this environment allows:** pdf.js API loads (`pdfjsLib.version`
    reported 3.11.174), its worker spawns and replies `action: "ready"`, a plain `fetch` of
    the same PDF returns all 115,685 bytes, and a generic Worker round-trips — but
    `getDocument().promise` never settles under headless `--virtual-time-budget`, which
    deadlocks on pdf.js's multi-step worker handshake (the same class of headless async
    stall seen repeatedly this session, and the reason the fail-safe above matters
    regardless). The rendering itself still needs a real-device confirmation.

- **Brochure PDF still showed as a broken "tap Open" card on Android after the caching
  fixes above — turned out to be a completely different, pre-existing bug, unrelated to
  offline caching at all.** User re-tested and saw the exact same card; a targeted
  question narrowed it down: it happens the same way even ONLINE, before airplane mode —
  meaning it was never a cache-miss issue. Root cause: Android Chrome frequently refuses
  to render a PDF inline inside an `<iframe>` (how the Brochure viewer displays it) and
  downloads it instead, showing exactly this native "file downloaded, tap Open" card — a
  known, longstanding platform limitation, not something fixable by changing what's
  cached or how. A direct top-level navigation to the same PDF URL reliably uses Chrome's
  built-in PDF viewer instead, so `openClientBrochureModal` now detects Android
  (`/Android/i.test(navigator.userAgent)`) and opens the PDF with `window.open(src,
  '_blank')` instead of populating the modal's iframe. This still works offline: a new tab
  is a top-level navigation, same as any other, so `sw.js`'s existing project-asset
  navigation routing (see the earlier entry today) serves it from cache exactly the same
  way. Not applied to iOS/desktop — no evidence of the same iframe limitation there (the
  iPhone's earlier failure was a genuine cache-miss, a different bug, already fixed), and
  the in-app modal is the nicer experience where it actually works. `app.js` only.

- **Merged the two separate prompts (content download, then a plain install offer) into
  ONE combined "Add to Home Screen" banner, per explicit user request.** The user noticed
  Android's own native install popup shows its own "Installing…" progress after tapping
  Add, and asked why our download-with-progress step wasn't just folded into that same
  action — discussed and confirmed: the native prompt only builds the app-icon wrapper (it
  has no idea what a "gallery photo" is), the content download is the only thing that
  makes the site actually usable offline, so they're unrelated jobs but were needlessly
  presented as two separate user actions.
  - `#offlineSaveBanner` is now the ONLY banner — `#installBanner` and its dedicated
    functions (`maybeShowInstallBanner`, `hideInstallBanner`, `maybeShowIosInstallTip`)
    are removed, along with the CSS/markup that went with them.
  - The single `Add` button now does both jobs at once, neither blocking the other: calls
    `deferredInstallPrompt.prompt()` (native install dialog, where available — fire-and-
    forget, its `userChoice` isn't awaited) AND starts `runOfflineDownload` in the same
    click handler. Size/consent is still shown up front before the tap (per the earlier
    "ask first" decision — unchanged), but it's one action from there, not two.
  - `beforeinstallprompt`'s top-level listener now only captures the event
    (`deferredInstallPrompt = e`) — it no longer independently triggers any banner itself,
    closing the exact bypass-the-mobile-gate hole from the last entry (there's now only
    one place, `maybeOfferOfflineSave`, that ever shows anything, and it's only ever
    called from the already-mobile-gated `registerOfflineSupport`).
  - iOS Safari (no `beforeinstallprompt`, ever) gets the same banner and the same "Add"
    button, which still starts the content download — the sub-text additionally says
    "tap Share → Add to Home Screen after" for the one part that genuinely can't be
    automated on iOS (Apple gives web pages no API for it at all).
  - New `isIosSafari()` helper (extracted from the old `maybeShowIosInstallTip`, reused
    for the "is there any install path at all" check that decides whether to show the
    banner when a project happens to have zero local assets to cache).
  - Files: `app.js` (the bulk of it), `index.html` (retired `#installBanner` markup, added
    `id="offlineSaveTitle"` so the merged banner's heading can be set dynamically),
    `styles.css` (retired `.install-banner*` rules).

- **"Save for offline" reported 100%/Done while a PDF (and possibly others) had actually
  failed to cache — real bug, caught via real-device testing on both iPhone and Android
  showing the same failure.** `runOfflineDownload`'s per-item `catch` swallowed any
  fetch failure and still called `bump()` to keep the progress bar moving ("best-effort,
  not all-or-nothing" — reasonable intent, wrong execution): a failed request counted
  identically to a real success, so "Done" could mean either. Worse, the code also never
  checked `res.ok` on a "successful" fetch — sw.js's own synthetic `503 Offline` fallback
  response (if something failed further upstream) would have been silently treated as the
  real file and cached/counted as done. And regardless of outcome, the project always got
  marked `b91-offline-saved-<id>` = saved, permanently suppressing the prompt on any later
  visit — so even a fully failed run gave no way to retry.
  Fixed: `fetchOnce()` now throws on a non-OK response, not just a network error; each
  item gets one retry (today's demo tunnel — a free `cloudflared` quick tunnel — has
  already dropped requests under concurrent load, so a transient failure is a real,
  expected case, not hypothetical); failures are collected in a `failed[]` array instead
  of being discarded, `bump()` still runs on a final failure so the bar reaches 100%
  rather than stalling, but the closing state is honest about it (`"N/M saved"` instead of
  `"Done"`), and the `b91-offline-saved-<id>` flag is only set when `failed.length === 0`
  — a partial save leaves the prompt available again on the next visit instead of
  declaring false victory. Also lowered download concurrency (3 → 2) and sorted the queue
  so images/PDF go before video, on the theory that a constrained/flaky connection is more
  likely to sustain several small transfers than several concurrent large ones — the
  cheap items are what a partial failure should cost, not the video. `app.js` only.

- **Desktop mobile-gate follow-up: banner still showed on desktop even after the same-day
  gate above, because the gate lived in the wrong place.** User reloaded on desktop and
  still saw "Add to Home Screen." Root cause: `registerOfflineSupport()`'s mobile gate only
  stops *registration* from happening on new visits — it doesn't touch two things that
  bypass it entirely: (1) `maybeShowInstallBanner()` itself had no device check of its own,
  and is called directly by the top-level `beforeinstallprompt` listener, completely
  independent of `registerOfflineSupport()`; (2) a browser that had already registered
  `sw.js` on an earlier visit (before the mobile gate existed) keeps satisfying the
  browser's own install-eligibility check on every later visit regardless of what the gate
  now prevents going forward. Fixed both: `maybeShowInstallBanner()` now checks
  `isMobilePortrait() || isMobileLandscape()` directly (the actual display gate, not just
  the registration one — this is the fix that matters, since it blocks the banner
  regardless of which code path tries to trigger it), and `registerOfflineSupport()`'s
  desktop branch now actively `unregister()`s any existing service worker + deletes this
  app's caches instead of just returning, so a browser that tested this before the gate
  existed actually reverts instead of staying stuck. `app.js` only. A desktop tab that
  already has the old banner open needs one reload to pick this up.

- **"Add to Home Screen" banner never actually disappeared after Add/✕, and offered on
  desktop too (both caught by the user via real-device testing).**
  - **CSS bug:** `.install-banner { display: flex; ... }` was unconditional — same
    specificity as the UA stylesheet's `[hidden]{display:none}`, and later in cascade
    order, so it silently won every time `hideInstallBanner()` set `.hidden = true`. The
    banner stayed visibly on screen no matter what was tapped. Fixed with an explicit
    `.install-banner[hidden] { display: none; }` override (verified directly via an
    isolated test page — before the fix `getComputedStyle(...).display` read `flex` with
    the `hidden` attribute present; after, it correctly reads `none`). Added the same
    explicit `[hidden]` rule to `.offline-save-banner` defensively, even though it isn't
    actually affected today (no unconditional `display` of its own) — so it can't regress
    the same way later.
  - **Desktop scope bug:** the whole offline layer (service worker registration + both
    banners) had no device gating at all — it ran for any client page load, desktop
    included, even though desktop already has a real offline mechanism (⋯ → Export
    standalone site…) that this PWA layer was always meant to be a phone-only alternative
    to (see the Mobile Offline Rollout doc — this was scoped as mobile-only from the start
    of that discussion, it just hadn't been enforced in code yet). Fixed by gating
    `registerOfflineSupport()` on `isMobilePortrait() || isMobileLandscape()` — the same
    width+orientation checks the rest of the mobile-responsive pass already uses, already
    tuned to exclude a resized desktop window. On desktop this now means the service
    worker is never registered at all, so neither banner nor the offline cache applies —
    unchanged from before this whole initiative started. A desktop browser that already
    registered the worker on an earlier visit (before this fix shipped) keeps its existing
    registration; not actively unregistered (low-probability edge case, not worth the
    complexity of a cleanup path for something this new).
  - Files: `styles.css` (the two `[hidden]` rules), `app.js` (the mobile gate + its comment
    in `registerOfflineSupport`).

- **Brochure PDF served the entire app shell instead of the PDF, offline (real bug, found
  via real-device testing on the temporary tunnel demo).** The Brochure viewer loads its
  PDF into an `<iframe>` (`openClientBrochureModal`, app.js), and a browser treats an
  iframe's `src` load as a navigation — same `mode: 'navigate'` as the actual page. `sw.js`
  had one rule for every navigation: on a network failure, fall back to the cached app
  shell (`index.html`) — correct for reopening the app itself, but this meant an uncached
  PDF, offline, fell back to serving the **whole raw app shell** inside the little brochure
  iframe (unstyled `index.html` markup, confirmed from the user's screenshot). Fixed by
  routing project-asset navigations (path includes `/projects/` or `/data/`) through the
  same data-cache path as any other asset *before* the real-page-navigation branch, so a
  PDF is now cached/served like the file it is — not treated as a page load. `sw.js` only.
- **Eager "Save for offline" download — photos, PDF, and video, with a consent prompt and
  a real progress UI (user request, after testing showed gallery images/video/PDF weren't
  available offline unless each one had specifically been opened while online first).**
  Previously every non-shell asset was cache-on-view only (by design, mirroring video's
  intentional "cache only when actually played" behavior) — reasonable for video's size,
  but meant a buyer had to manually click through every photo and PDF before losing signal
  for a complete offline experience, which isn't realistic for a real demo. The user asked
  for everything to download automatically — but explicitly gated behind a size-and-consent
  prompt rather than starting silently, since eagerly pulling potentially hundreds of MB of
  video the instant the page loads could be an unwelcome, unannounced hit on a buyer's data
  plan (see the two-question discussion this session: broaden caching → recommended; ask
  first vs. auto-start → "ask first" recommended and chosen).
  - New: `collectOfflineAssets()` (app.js) walks `state.menuConfig.tree` (mirrors
    server.py's `scan_menu_for_online_content`'s walk of the same shape, but collecting
    local files instead of flagging external ones) plus `state.landmarks`/`state.amenities`
    render images, the pano, the site-plan, and the brand logo — collecting every same-
    origin (i.e. actually cacheable) asset URL for the current project. Plot-level media
    (`getPlotMediaList`) is deliberately NOT walked — those URLs are always meant to point
    out to an externally-hosted tour/video by design, so they'd be filtered out as external
    anyway. `estimateOfflineSize()` HEAD-requests each URL (real network request, bypasses
    the service worker since it only intercepts GET) to sum a total byte count without
    downloading anything yet.
  - New UI: `#offlineSaveBanner` (index.html) — a "Save for offline? · approx. XXX MB ·
    [Not now] [Download]" prompt that, on Download, morphs into a progress bar with a live
    percentage and a rolling ETA (`runOfflineDownload`, tracked via
    `Response.body.getReader()` byte counts, not just a file-count proxy). Shown once per
    project per browser — `localStorage` (`b91-offline-saved-<projectId>` /
    `b91-offline-declined-<projectId>`) suppresses re-asking on a later visit, mirroring
    the install banner's own existing dismiss pattern. Runs *before* the install banner in
    `registerOfflineSupport()` (chained, not simultaneous) so the two prompts don't stack.
    The actual downloads are plain `fetch()` calls with limited concurrency (3 at a time);
    no new caching code was needed in app.js — each fetch is transparently intercepted and
    stored by `sw.js`'s existing stale-while-revalidate (images/PDF) and `respondVideo`
    (video, unranged full-file GET → cached as the complete file) logic, exactly the same
    as if the user had opened that item themselves.
  - `registerOfflineSupport()` also hardened: `navigator.serviceWorker.ready` is now raced
    against a 5s timeout (`Promise.race`) rather than awaited unconditionally, so a stalled
    activation (flaky connection, or another open tab pinning an older worker) can't wedge
    the rest of boot — it now falls through to the install offer alone instead of hanging.
  - **Verification limits, stated plainly:** this could not be visually confirmed in this
    session. The live-server headless-screenshot method hit this project's own
    already-documented pano-texture-loading hang under headless — every single capture
    attempt (multiple virtual-time-budgets up to 20s, both before and after the
    `serviceWorker.ready` timeout fix) stopped at "Loading…" well before `init()` reaches
    `registerOfflineSupport()`, while the "Add to Home Screen" banner that WAS visible in
    those captures comes from a fully independent `beforeinstallprompt` listener — its
    presence says nothing about whether this new code ran. The bundle-export screenshot
    method (this project's usual reliable fallback) can't test this feature at all either:
    it forces `file://`, where service workers can't register and `fetch()` is blocked, so
    the feature is structurally inapplicable there. What WAS verified directly: `node
    --check` on both files; the real `sample` project's committed `alignment.json` genuinely
    has 17 local, cacheable assets (9 images, 4 PDFs, 4 videos) confirming the collector
    has real content to find, not an empty list; and a careful manual trace of every code
    path against the actual data shapes in this project. Needs a real-device pass over the
    tunnel before this is called solid.

## 2026-09-02


- **Added [VIRTUAL-TOUR.md](VIRTUAL-TOUR.md) — living plan for a multi-node panoramic
  virtual tour with hotspot navigation + WebXR.** Planning only; **no code written**.
  Captures a requirements Q&A with the product owner: replace 3DVista with our own tour
  engine (L1), panos are **3D renders** interior + exterior (L2), glide-through-space
  transition preferred (L4), WebXR on Quest with mono acceptable (L5/L6). Key technical
  finding: because the panos are rendered rather than photographed, a **depth pass** comes
  essentially free, which makes a real-parallax "glide" transition achievable by displacing
  a sphere mesh into a depth proxy — no photogrammetry or mesh reconstruction needed.
  Key tension logged: **eyeballed node placement (L3) is incompatible with the glide**,
  since depth warping needs the true inter-node translation vector (decision D-1,
  recommending the 3D scene's camera transforms be exported instead). Structure: locked
  decisions, a separate **Open Questions** table (external unknowns, OQ-1..7) and a
  separate **Decisions to be made** table (engineering choices with recommendations,
  D-1..9), a **render pipeline contract** flagged as the project's largest risk (radial vs
  planar depth, units, camera manifest), then Phases 0–5 with checkboxes — Phase 0 being a
  deliberately throwaway validation spike that proves the depth warp on two real adjacent
  interior nodes before any product is built around it. Doc carries a Progress Log to be
  appended each session. Files: `VIRTUAL-TOUR.md` (new), `CLAUDE.md` (planning-docs pointer
  in the header, new "Current status" entry).


- **Client offline layer (PWA) — minimal service worker + manifest + install prompt,
  built to demo mobile offline over a temporary tunnel while the real hosting decision
  (see the "Mobile Offline Rollout" doc) is still pending with the boss.** Client-only,
  same restriction as everywhere else in this initiative: a service worker can only
  register on a secure context (`https://` or `localhost`) — verified directly again this
  session (same "URL protocol... not supported" error as before) — so being on the same
  LAN as the boss doesn't by itself make a phone demo possible; a temporary HTTPS tunnel
  (e.g. `cloudflared` quick tunnel) in front of the already-running `server.py` is still
  needed for the live demo, not yet set up (no tunnel tool installed on this machine yet).
  New files: **`sw.js`** (root-scoped service worker — see its own header comment for the
  full design), **`manifest.webmanifest`** (static, generic branding — intentionally not
  per-project; see rationale below), **`icons/icon-192.png`**, **`icons/icon-512.png`**,
  **`icons/icon-512-maskable.png`** (generated via Pillow to match the existing
  `.brand-mark` gold-gradient "B91" look, not hand-drawn).
  - **Cache design (`sw.js`):** three caches — shell (app.js/styles.css/vendor/three.module.js/
    manifest/icons, precached on `install`), data (`projects/<id>/*.json|csv|svg` +
    pano/plan/amenity images, cached opportunistically on first request), media (video,
    cached only once actually requested — i.e. only after a buyer opens a video, since
    `<video>` in the client viewer never gets a `src` until `openClientVideoModal` sets one
    — see **Conventions & gotchas** for why this needed byte-range handling). Data/shell
    keys strip the cache-busting `?t=`/`?v=` query app.js always appends (`dataUrl`/
    `assetUrl`) before using the URL as a Cache Storage key, then stale-while-revalidate:
    serve the cached copy immediately, refresh it in the background from a real network
    fetch (which still carries the fresh cache-busting query) — otherwise every reload's
    unique query would be a cache miss, defeating the cache entirely.
  - **Admin is explicitly out of scope, twice over:** `registerOfflineSupport()` (app.js,
    called at the end of the successful boot path) never runs at all when `state.admin` is
    true, so a service worker is never even installed from an admin browser session in the
    first place. As a second, independent guard — since a worker's scope is the whole
    origin by default and could in principle already be installed in the same browser from
    an earlier client visit — `sw.js`'s own fetch handler checks for `admin=1` on every
    request (the navigated document's URL, or via `clients.get(event.clientId)` for
    subresource fetches from an already-open admin tab) and always falls through to a
    plain network fetch, untouched, when it finds it.
  - **Install prompt:** a small dismissible banner (`#installBanner`, new markup in
    index.html + `.install-banner*` styles.css rules) appears once `beforeinstallprompt`
    fires (Chrome/Edge/Android) with a working "Add" button, or — since iOS Safari never
    fires that event — swaps to manual "Tap Share → Add to Home Screen" instructions
    there instead (`maybeShowIosInstallTip`, UA-sniffed). Dismissal and installed-state
    are remembered in localStorage (`b91-pwa-dismissed`/`b91-pwa-installed`) so it doesn't
    nag on every visit.
  - **`manifest.webmanifest` is static/generic on purpose, not per-project:** its
    `start_url` can't dynamically reflect whichever `?project=<id>` the buyer was
    browsing when they tapped "Add to Home Screen" without a server-generated manifest
    route (a real web manifest file is static JSON, not templated per request) — skipped
    for now since the actual planned rollout (per the Mobile Offline Rollout doc) hosts
    each project as its own standalone bundle export at its own URL, which has no
    multi-project ambiguity to begin with; this only matters for today's throwaway
    same-server demo, where it's an acceptable footnote, not a blocker.
  - `server.py`: registered `.webmanifest` → `application/manifest+json` in the
    `mimetypes` module at import time (Python doesn't know this extension by default,
    which would otherwise serve it as `application/octet-stream`); no other server changes
    — `sw.js`/`manifest.webmanifest`/`icons/*` are served automatically by the existing
    static file handler, same as any other file in the project root.
  - **Verified:** `node --check` on `sw.js` and (with its one ES `import` line stripped,
    same trick the bundle export's own syntax-check precedent uses) `app.js`; `sw.js`/
    `manifest.webmanifest`/`icons/*.png` all served with 200 + correct Content-Type over
    `http://localhost:8731`; `beforeinstallprompt` fired on the real client page (Edge
    headless, fresh profile) — since Chrome only offers that once it's confirmed a valid
    manifest AND an active, fetch-handling service worker, this is real (not just
    code-reasoned) confirmation that registration succeeds end-to-end; a live screenshot
    of the client page shows the install banner rendered correctly, styled on-brand, not
    obstructing the zoom-controls column. **Not verified:** actual offline behavior after
    a real network cutoff (needs the tunnel + a real device, not yet done), and video
    byte-range caching specifically (`respondVideo`/`sliceRange` in sw.js) — implemented
    per documented `<video>` Range-request behavior but not exercised against a real
    seek/replay yet. Admin-mode regression could not be visually confirmed this session —
    hit the same live-server headless-screenshot unreliability already on record in this
    file (dynamic `import()` + `--virtual-time-budget` don't compose reliably; one capture
    mid-load showed the pre-JS DOM state, looking identical for both `?admin=1` and plain
    client URLs) — but a direct isolated check confirmed `state.admin` itself parses
    correctly from `?admin=1` (unaffected by this change, and nothing added here touches
    `wireAdmin()`/admin-detection logic), so this is treated as the same known testing
    limitation, not a new regression.

- **Landscape zoom-controls column misaligned — Available pill vs. icon row.** User
  screenshotted the landscape client and pointed out the alignment/margin looked off:
  the `.zoom-controls` column (Available pill + `#`/📍/🏛️/+/−/⊡ icon buttons) is a
  `flex-direction: column` stack with no `align-items` set, so it defaulted to
  flex-start (left). Every other child is the same 38px `.btn-icon` square, so this was
  invisible everywhere else — but the landscape-only Available pill (icon+label+count)
  is wider, and the container sizes itself to its widest child while staying pinned via
  `right: 16px`. Net effect: the pill's right edge sat at the intended 16px margin, but
  the narrower icon squares below it left-aligned to the pill's *left* edge instead,
  landing well short of that same right margin — the ragged, inconsistent column the
  user saw. Root-caused via reading the CSS (no JS involved) and fixed by adding
  `align-items: flex-end` to `.zoom-controls`, scoped inside the existing
  `body:not(.is-admin)` block of the landscape-only media query
  (`@media (orientation: landscape) and (max-height: 500px)`) so desktop and admin are
  untouched; also tightened the pill's padding slightly and nudged the container's
  right/bottom margin and item gap in for a cleaner fit on a short screen. Verified via
  the bundle-export screenshot workaround at 844×390 on the `sample` project — pill and
  icon column now share one right edge. `styles.css` only.

- **Mobile responsiveness pass — portrait fixes plus new orientation-aware landscape
  handling.** User asked for both client and admin to work well on phones; this entry
  covers the client-side work, verified via the bundle-export screenshot workaround (see
  **Conventions & gotchas**) at three viewports on the real `sample` project (which has
  exactly 12 landmarks): 390×844 (portrait), 844×390 (landscape), 1400×900 (desktop).

  **Portrait fixes:**
  - `.cat-drawer` now defaults to `is-collapsed` at boot on narrow portrait screens
    (`wireViewControls`, app.js) instead of covering ~64% of the screen before the visitor
    has even seen the panorama; desktop unchanged. Since `.cat-drawer-toggle` is a DOM
    child of `.cat-drawer`, added a counter-transform
    (`.cat-drawer.is-collapsed .cat-drawer-toggle`) so it stays visible/tappable when
    collapsed. `.cat-drawer`'s width changed from `width:250px;max-width:82vw` to
    `width:min(250px,82vw)` (identical result) so the counter-transform can reference the
    same expression.
  - `renderLandmarks()`/`renderAmenities()` (app.js) clamp each label's horizontal
    position to stay fully on-screen instead of running off the edge — the landmark
    connector line's endpoint moves with the clamp so it still visually reaches the
    banner; the amenity fix nudges just the `.am-chip` (an extra offset on top of its
    existing `translateX(-50%)`), leaving the pin exactly on its true hotspot.
  - New `LANDMARK_MOBILE_CAP = 6` (app.js): when more landmarks match the current filter
    than that on a mobile viewport, only the first 6 render — landmarks with a render
    image (`renderSrc(lm)`, the same signal behind the existing `.has-render` hover-card
    feature) are prioritized to stay visible — and a new `#lmOverflowHint` pill
    (index.html/styles.css) shows e.g. "+6 more — filter by category", wired (once, in
    `wireViewControls`, not per-frame) to a new `openLandmarksCategoryPicker()` (app.js)
    that jumps straight into the existing category picker.
  - `.sync-meta` now truncates with an ellipsis instead of overflowing past the viewport
    edge (`.sync{min-width:0}` + `.sync-meta{overflow:hidden;text-overflow:ellipsis;
    max-width:46vw}`); `.lm-ico`/`.lm-label`/`.lm-sub-bar`/`.am-chip`/`.am-ico`/`.am-label`
    shrink a bit to reduce (not eliminate — see the caveat below) how often labels
    collide; `.wizard-types-grid` (the menu-item wizard's content-type picker) drops from
    3 to 2 columns at `≤480px`.

  **New this pass — landscape gets different treatment than portrait, not the same mobile
  squeeze:** the user shared reference screenshots (desktop-quality layouts — a well
  margined site plan with a legend panel, a well-spaced landmarks view) and asked
  specifically for landscape mobile to look like those, with desktop required to stay
  completely untouched.
  - New `isMobilePortrait()` (app.js: `innerWidth<=720 && matchMedia('(orientation:
    portrait)').matches`) replaces the old plain-width check for the drawer-collapse and
    a new rotate hint (below) — a landscape phone, even one narrower than 720px, no
    longer gets the portrait squeeze. The big mobile CSS block (topbar/legend/sync/label
    sizing/modal-dialog) is now gated `@media (max-width:720px) and (orientation:
    portrait)` instead of plain `max-width:720px` — this only *narrows* which viewports
    the existing rules apply to, so there is no way it can newly affect desktop.
  - New `isMobileLandscape()` (app.js: `innerWidth<=900 && matchMedia('(orientation:
    landscape)').matches`) — a separate, wider threshold used **only** for the landmark
    density cap. Landscape testing showed even 844px width still overlaps heavily with a
    dozen full-size, uncapped labels, so `renderLandmarks()`'s cap trigger is
    `isMobilePortrait() || isMobileLandscape()` while the drawer-collapse and portrait CSS
    stayed portrait-exclusive.
  - New, minimal `@media (orientation:landscape) and (max-height:500px)` block
    (styles.css): hides the topbar tagline, trims topbar padding slightly. Most of the
    "looks like the reference" result came from *excluding* landscape from the portrait
    squeeze, not from adding new landscape rules — the underlying desktop-style layout
    already resembles the reference once portrait's squeeze isn't forced onto it.
  - New rotate hint: `wireViewControls()` (app.js), non-admin only, calls
    `showNotice('Tip: rotate your device to landscape for the best view.')` once at boot
    if `isMobilePortrait()`, and again via a `matchMedia` change listener if the visitor
    rotates back into portrait later in the session.

  **Verified:** portrait screenshot shows the collapsed drawer + rotate hint + "+6 more"
  hint; landscape screenshot shows the open drawer, a clean single-row topbar matching the
  reference images, and "+6 more" (needed once the cap was extended to landscape), with
  no rotate hint; desktop screenshot (1400×900) shows all 12 landmarks full-size and
  uncapped, the full topbar subtitle, and no hints of any kind — confirming desktop is
  unaffected.

  **Still unresolved, worth restating — now covers both orientations:** the density cap
  reduces landmark-vs-landmark overlap, it does not eliminate it; the labels that DO stay
  visible can still overlap each other somewhat, confirmed in both the portrait and
  landscape verification screenshots. This remains a deliberate scope boundary (real
  collision-avoidance/clustering was discussed and explicitly not chosen for this pass),
  not an oversight. Admin-side mobile behavior is still not visually verified this
  session (see **Conventions & gotchas**) — a human needs to check it on an actual phone.

  **Same-day follow-up: topbar hidden entirely in landscape, replaced by a floating
  "Available" button.** The user tested the above on a real device and found the topbar
  (brand + full legend + sync + Refresh) ate a disproportionate share of a short
  landscape screen; asked to hide it there and keep just the one thing worth keeping —
  seeing/filtering to available plots — as a compact bottom-right button.
  - New `#zoomAvailableBtn` (index.html), first child inside the existing `.zoom-controls`
    floating column — same dot/label/count as the header's "Available" chip, styled with
    the dark floating backdrop the other zoom-control buttons already use. `display:none`
    by default; only shown inside the landscape media query.
  - The landscape media query now also hides `.topbar` entirely and reveals
    `#zoomAvailableBtn` — both scoped `body:not(.is-admin)`, so admin keeps its topbar in
    landscape regardless (not something the user asked to change, and not tested for
    admin).
  - `renderLegend()`/`toggleFilter()` (app.js) now keep `#zoomAvailableBtn`'s count and
    `aria-pressed` in sync with the header chips (previously only updated the chips); a
    new click listener calls the exact same `toggleFilter('available')` the header chip
    already calls, so behavior is identical, just relocated.
  - **Hit a real CSS Grid bug getting here** — see the new **Conventions & gotchas** entry
    on `display:none` and grid item placement; first attempt produced a fully black
    screenshot (canvas rendered at `height="0"`), root-caused and fixed by collapsing
    `.topbar` in place instead of removing it from grid flow.
  - **Verified**: fresh bundle export, screenshotted at 844×390 (landscape — topbar gone,
    "Available 1" pill correct, drawer/hint still work, pano now fills nearly the full
    height), 1400×900 (desktop — completely unaffected), 390×844 (portrait — completely
    unaffected).

  **Second same-day follow-up: the collapsed drawer's toggle button, fixed properly this
  time.** When the drawer was first made to default-collapse (earlier in this same pass),
  a counter-transform was added to keep `.cat-drawer-toggle` reachable — it worked (the
  button stayed visible/tappable), but pushed it all the way back to its *open-state*
  position: ~230px in from the left edge, floating with nothing around it to anchor it.
  The user tested this on a real device and correctly called it out as looking like a
  stray/buggy floating button, not a deliberate control — **that earlier fix was the wrong
  call, worth being honest about rather than glossing over.**
  - Investigated whether hiding the toggle entirely (as first requested) was actually
    safe: found the bottom-left icon cluster (fullscreen/mute/autopan —
    `.cat-drawer-foot`) is *also* a child of `.cat-drawer`, confirmed via screenshot that
    it disappears along with the drawer when collapsed too — meaning the toggle is
    currently the **only** way back into the menu once collapsed. Flagged this and the
    user chose: dock it at the screen's left edge instead, rather than hide it with no
    replacement.
  - The actual fix, worked out from the transform math and then confirmed by screenshot:
    **delete the counter-transform, don't replace it with different positioning math.**
    The toggle's own unmodified base position (poking ~20px past the drawer's right edge
    when open — long-standing, unrelated to this pass) rides along with the parent's
    `-100%` collapse shift when no override fights it, landing docked ~20px past the
    *screen's* left edge instead — the same half-in/half-out visual language it already
    used on the drawer's edge, just anchored to the screen edge now. One rule removed in
    styles.css (`.cat-drawer.is-collapsed .cat-drawer-toggle`), replaced with a comment
    explaining why no override is needed — so a future edit doesn't reintroduce the
    counter-transform without understanding why it was wrong.
  - **Verified**: fresh bundle-export screenshot at 390×844 (portrait, collapsed by
    default) — toggle now shows as a small tab docked at the left edge, not floating
    mid-screen. No app.js or index.html changes; drawer's open-state appearance and the
    default-collapse behavior itself are unchanged.

  Files: `styles.css`.

## 2026-08-31

- **Standalone export now genuinely runs offline via `file://` — no server, not even a
  static one.** Previously "⋯ menu → Export standalone site…" produced a folder that
  *looked* self-contained but silently failed if opened by double-clicking `index.html`:
  verified directly (a minimal repro in headless Edge) that both the dynamic
  `<script type="module">import(...)</script>` used to load `app.js`, and every
  `fetch()` call the app makes for its own data (`plots.svg/csv`, `alignment/landmarks/
  amenities.json`), throw `Failed to fetch` under `file://`. Classic `<script src>` and
  `<img src>` do not — so most images/video (already `<img>`/`<video>`-based: logos,
  landmark/amenity renders, contact photos, gallery photos) needed no changes. The pano
  and site-plan images turned out to be the exception — see the follow-up fix below.
  - `server.py`'s `do_bundle` now rewrites the shipped copies at export time only (the
    live/served app is untouched): `module_to_global()` turns the vendored
    `vendor/three.module.js` — a single flat module whose only import/export surface is
    one trailing `export { A, B, C, ... };` line — into `vendor/three.global.js`
    (`window.THREE = {...}`); `strip_named_import()` removes `app.js`'s one
    `import * as THREE from './vendor/three.module.js';` line; `build_embedded_files_json()`
    + `bake_bundle_html()` embed the project's 5 core data files inline as
    `window.B91_BUNDLE_FILES` and swap the module script tag for two classic ones.
  - `app.js` gained `loadProjectFile(name)` (next to `dataUrl`) — a fetch-Response-shaped
    helper that the 5 data-loading call sites (`loadCommittedCSV`, `loadGeometry`,
    `loadAlignmentFile`, `loadLandmarksFile`, `loadAmenitiesFile`) now go through; in
    bundle mode it reads `B91_BUNDLE_FILES` instead of fetching. `loadData()` also skips
    the live Google Sheet attempt entirely in bundle mode (`!BUNDLE &&` guard) — a
    `file://` export can never reach one, so it goes straight to the embedded CSV.
  - New: **export-time flagging.** Any admin menu item (video/pdf/tour/link/gallery photo)
    whose active content is a pasted URL rather than an uploaded file still needs internet
    even in the offline bundle — that content lives elsewhere and can't be embedded.
    `scan_menu_for_online_content()` (server.py) walks the menu tree and a new
    `GET /api/export-bundle-check?project=<id>` route reports them; `exportBundle()`
    (app.js) calls it before downloading. **Revised same day** (see below) to a real popup
    with a per-item **Edit** jump instead of a plain list — the admin can still export
    anyway either way (non-blocking, by design). A matching `noteIfExternal()` helper in
    the client viewer surfaces the same "needs an internet connection" notice at
    watch-time for video/tour/PDF items resolved to an external URL (not wired into
    gallery photos or plain `link` items — a broken image / an outbound link are already
    self-explanatory, so a notice there would just be noise).
  - **Verified end-to-end**, not just unit-level: exported the real `sample` project
    (1 plot, 11 landmarks, 3 amenities, a real menu tree — none URL-backed, so
    `flagged: []` correctly), unzipped it, and opened its `index.html` via a literal
    `file://` URL in headless Edge with **no server running at all**. Confirmed zero
    console errors, a real `<canvas data-engine="three.js r160">` (Three.js initialized
    from the classic-script global), landmark banner DOM elements rendered, and the
    header showing "1 plots · project sample" (plots.csv loaded from embedded data, sheet
    fetch correctly skipped). Files: `server.py`, `app.js`.
  - **Follow-up same day: the pano background and site-plan (drape) image weren't
    rendering** in that first export, while everything else (plots, landmarks, amenities,
    menu content) worked. Root cause, verified with a second direct test: those two
    specifically are uploaded to a **WebGL texture** (`texImage2D`), and — unlike a plain
    `<img>`, which loads fine under `file://` — a texture sourced from a `file://` path is
    **rejected as tainted/cross-origin even from the same folder**. Confirmed with a
    minimal repro: `gl.texImage2D` on an `<img>` loaded from a local file throws
    `SecurityError: ... contains cross-origin data`; the identical call using a `data:`
    URI succeeds. Fix: `server.py` gained `build_embedded_images_json()` (base64-embeds
    just `panoImage.file`/`groundImage.file` as `window.B91_BUNDLE_IMAGES`, keyed by
    basename) and `read_alignment()` (factored out of `do_bundle_check`, now shared);
    `bake_bundle_html()` grew a 4th param to bake the new flag in too. `app.js`'s
    `assetUrl()` checks `BUNDLE_IMAGES` first and returns the embedded `data:` URI when
    present — a single-point change, so every other image (which was never affected)
    resolves exactly as before. **Verified**: re-exported `sample`, confirmed both
    `Demo.web.jpg` and `Map_DesignCutOut10.web.png` present as `data:image/...;base64,...`
    in the shipped `index.html`, then opened it via `file://` with no server running and
    **took an actual screenshot** (a DOM dump can't show WebGL canvas pixels) confirming
    the aerial pano now renders correctly with landmarks and menu overlaid, no console
    errors.
  - **Second follow-up same day: export-time flagging rebuilt as a real popup with a
    per-item Edit jump**, replacing the plain `confirm()` — a `confirm()` can only show
    text and OK/Cancel, so fixing a flagged item meant cancelling the export, finding that
    item in the menu tree, editing it separately, then re-exporting. New `#exportFlaggedModal`
    (`index.html`, reuses the existing `.modal.custom-feature-modal` pattern — no new CSS)
    lists each flagged item (title, content type, its current URL) with an **Edit** button;
    clicking it calls `openNodeBuilderModal(nodeId)` — the same "Add/Edit Menu Item" wizard
    used everywhere else — pre-loaded on that exact item, ready to swap the pasted link for
    an upload. `scan_menu_for_online_content()` (server.py) now includes each item's `id`
    and current `url` in its response (previously just `title`/`contentType`) so the client
    can make that jump. New `showExportFlaggedModal(flagged)` (app.js, next to
    `exportBundle`) drives it — resolves `true` only on "Export Anyway"; both "Cancel
    Export" and "Edit" resolve `false`. **Verified**: `node --check` passed; loaded the
    real admin page headlessly with zero console errors and all 4 new element ids present
    in the DOM; created a throwaway test project with one URL-backed item and one
    file-backed item, hit the real `/api/export-bundle-check` endpoint, and confirmed only
    the URL-backed one came back flagged, correctly carrying its `id`/`url`. **Not**
    verified: an actual interactive click-through of Edit/Proceed/Cancel in a live browser
    session — no browser-automation tool was available this session, only headless
    page-load + DOM-dump + screenshot. Worth a manual click-through before calling this
    fully proven, though the logic reuses already-proven helpers
    (`openCustomModal`/`closeCustomModal`, `openNodeBuilderModal(id)`) rather than new
    mechanics of its own.
  - **Third follow-up same day: amenities weren't covered by the flagging at all.** The
    user reported a YouTube video in one of their **amenities** (a separate feature from
    the menu tree — in-layout icon pins with their own `tour_url`) didn't trigger the
    popup — correctly: `scan_menu_for_online_content()` only ever walked the menu tree,
    never `amenities.json`. Confirmed against real data before fixing: the `sample`
    project's "Priyadarshi Satyakam aasram" amenity has a YouTube `tour_url` and wasn't
    being flagged. Fix: new `scan_amenities_for_online_content()` + `read_amenities()`
    (server.py, same pattern as the menu-tree scan) — any amenity with a non-empty
    `tour_url` is flagged (amenities have **no upload alternative at all** for it, so any
    value there is inherently a pasted link). `do_bundle_check` now merges both scans.
    Each flagged entry now carries a `"source"` (`"menu"` or `"amenity"`) so
    `showExportFlaggedModal`'s Edit button routes correctly — `openNodeBuilderModal(id)`
    only understands menu-tree nodes; an amenity's Edit now calls `setAdminTab('amenities')`
    + `selectAmenity(id)` instead. Also added `noteIfExternal()` to `openModal()` — the one
    shared function that opens tour/video/image content for **both** plots and amenities —
    so the runtime "needs an internet connection" notice now covers amenity tours too (and
    incidentally plot walkthroughs, which is accurate even though plots aren't part of the
    export-time flag list — see below).
    **Deliberately NOT extended to plots** (`plots.csv`'s own `tour_url`/`video_url`/
    `image_url`): a plot's tour link is *always* meant to point to an external 3DVista
    tour — that's this app's whole "storefront" design from day one, not an admin mistake
    the way an unflagged menu item or amenity link is (those two have a real "did you mean
    to upload instead?" choice; a plot's tour never offers one). Worth revisiting if the
    admin actually wants plot tour links called out too — that'd be a bigger addition
    (CSV + `media_json` parsing), not a small follow-up like this one. **Verified**:
    `node --check` passed; hit the real `/api/export-bundle-check?project=sample` against
    unmodified real data and confirmed the YouTube-linked amenity now comes back flagged
    with the right `id`/`title`/`url`/`source`; reloaded the real admin page headlessly
    afterward with zero console errors. Same caveat as above: Edit was not clicked through
    interactively.

- **Client Contact Card modal redesigned as a full-screen page.** Was a small
  centered ~900x500 box; `#clientContactModal`'s dialog is now 100vw/100dvh
  (no border-radius/shadow — a true takeover, not a card). The info side keeps
  the same admin-set fields (`node.contact`: title/about/phone/email/image —
  `openClientContactModal` in app.js is unchanged throughout) but presents them
  with a "Get in touch" eyebrow (small accent-colored rule + label), a serif
  display title (`Georgia`/`ui-serif` stack — no external font, stays
  offline-friendly), and the address/phone/email as icon rows with hairline
  separators instead of plain "Label: value" text. The icon rows use inline
  SVG line-icons (pin/phone/envelope) instead of emoji, since emoji render
  inconsistently across OS/browser and read as less premium. Palette shifted
  from the generic slate/cyan first pass to a warm editorial one — off-white
  panel (`#faf7f2`), warm charcoal ink (`#1c1917`), bronze/gold accent
  (`#a8752c`, via `--contact-accent` custom props scoped to
  `.contact-modal-right`) — to better match the warm interior photography
  admins tend to use here; close button is a circular subtle button. Mobile
  (`≤768px`) stacks image (38vh) over content, still full-screen. Cleaned up
  ~15 inline `style="..."` attributes on `#clientContactModal`'s markup that
  were dead weight — the CSS block already controlled everything via
  `!important` — and added a `.contact-modal-backdrop` rule
  (position:absolute/inset:0/z-index:1) since that one was previously *only*
  an inline style with no CSS-side equivalent (removing it without replacing
  would've broken backdrop click-to-close). Files: `index.html`
  (`#clientContactModal` markup), `styles.css` (`.contact-modal-*` block,
  ~line 1418+).

- **Fixed a black strap over admin wizard step text.** The "Add Menu Item"
  wizard's step body (`.custom-modal-body`) had no background of its own, so
  it inherited `.modal-body`'s `background:#000` (meant for other modals like
  the image/video lightbox) — showing as a solid black bar right above each
  step's heading (e.g. "Item Title & Content Type"). Fixed by giving
  `.custom-modal-body` `background: transparent` so it shows the wizard
  dialog's own dark panel color instead. File: `styles.css`.

- **Landmark category camera panning now "fits" instead of always sweeping.**
  Selecting a landmark category in the client used to always pan the camera across a
  window at least 45° wide (`MIN_SWEEP_ARC`), even for a tight cluster of landmarks —
  causing visibly excessive panning for categories that could've been shown in one
  frame. `computeLandmarkPanRange` now makes a fit-or-sweep decision: if the matched
  landmarks' bounding arc (plus 8° padding each side) fits within `FOV_MAX` (120°), the
  camera frames the whole group at a fitted FOV (55–120°) and idles with a small gentle
  sway instead of panning; only a category that genuinely can't fit in one frame still
  sweeps, now sized to its real leftmost/rightmost extent instead of an inflated
  minimum. Removed `MIN_SWEEP_ARC`/`SWEEP_EDGE_PAD`/`withSweepBounds`; added
  `LANDMARK_EDGE_PAD`/`LANDMARK_FIT_FOV_CAP`/`LANDMARK_FIT_FOV_FLOOR`/
  `LANDMARK_SWEEP_FOV`/`LANDMARK_SWAY_HALF` and a small `meanDirection` helper.
  `renderLoop`'s idle ping-pong and `updateCamera`'s hard clamp are unchanged — they
  just operate on a tiny sway window or a real sweep window depending on the fit
  decision. Verified in-browser by the user: a 2-landmark Education category that
  previously swept now correctly frames both landmarks together. Files: `app.js`
  (`computeLandmarkPanRange`, `applyCategoryFilter`), `CLAUDE.md` (new code-map bullet).

## 2026-08-27

- **Created this changelog.** From now on, every change made via Claude will be
  logged here as it happens (not batched at the end of a session).
