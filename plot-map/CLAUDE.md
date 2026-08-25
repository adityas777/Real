# CLAUDE.md — Build91 Interactive Plot Map (agent handoff)

> **Read this first.** It's the single source of truth for picking up work on this
> project, and it must survive agent restarts and Claude-account swaps. Keep it
> current — see **[Documentation discipline](#documentation-discipline)** at the end.
> User-facing feature docs live in [README.md](README.md); this file is agent-facing
> (architecture, code map, conventions, gotchas, verification, status).

## What this is

A **standalone, zero-build, zero-dependency** web app: a Three.js WebGL **360°
panorama viewer** with **status-coloured, clickable plots** projected onto the
scene, an **admin editor** (align / import-trace plots / configure background pano /
place landmarks), and a **view-only client**. It's the "storefront" that links out to
3DVista virtual tours. No framework, no bundler, no npm deps — `index.html` + `app.js` +
`styles.css` + a vendored `three.module.js`, plus a tiny **Python-stdlib** server
(`server.py`) that serves the app *and* accepts server-side saves.

## Location & how to run

- **The app lives in this folder:** `…/ZeroxRealEstate/plot-map/`. Git repo is
  **`github.com/Emagicor/ZeroxRealEstate`** (the app is the `plot-map/` subdir).
  ⚠️ An older copy at the repo's grandparent (`…/ZeroxPlotting/`) is **deprecated** —
  its remote was removed and its duplicate files were deleted. **Always edit files
  under `plot-map/`.**
- **Run:** `python server.py 8731` (the `plot-map` launch config in `.claude/launch.json`).
  It's a `SimpleHTTPRequestHandler` subclass — serves static files like `http.server`
  **and** adds `GET /api/projects` + `POST /api/save`. A plain static server still works
  for *viewing* (saves then fall back to browser downloads).
- **Projects:** every site lives in `projects/<id>/`. The client picks one with
  `?project=<id>` (default **`sample`**). Admin saves write into `projects/<id>/`.
- **Client:** `http://localhost:8731/?project=<id>` · **Admin:** `http://localhost:8731/?admin=1&project=<id>`
- No install/build step. **Server-side save** (admin Export / Save…) is how you publish;
  it writes straight into the project dir (no more manual folder copying / downloads).

## Architecture (the projection model)

- **Pano sphere** — a custom-UV sphere textured with an equirectangular image,
  **viewed from the inside** (so its texture is mirrored → `dir()` reflects across X,
  `-sin(lon)`, to un-mirror). Camera sits at the origin and is driven by **yaw/pitch
  Euler angles** (`cam.rotation.set(lat, lon+π, 0, 'YXZ')`) — not `lookAt`, which
  gimbal-locks at the poles. FOV range **20–120°**.
- **Plots + plan drape** live on a **horizontal ground plane** one unit below the
  camera (`groundPoint()`), viewed from above like a map (NOT mirrored — do **not**
  X-reflect it). A rigid tx/ty/scale/rotation transform is applied in that flat plane,
  then `placeOnSphere() = groundPoint().normalize()` projects each point onto the
  sphere. Result: scale/rotate are uniform in every direction, no pole singularity.
- **Landmarks** are anchored to fixed sphere **directions** (lon/lat) and drawn as an
  **HTML/SVG overlay** projected to screen each frame.
- **Anchor & scale:** `state.anchor` = centroid of all plot vertices; `state.kGround`
  auto-calibrates px→ground so the layout's outer radius lands ~35° off nadir at
  scale 1 (`recomputeAnchorAndK`). `state.imgW/imgH` (from `plots.svg` viewBox) cancel
  out in the sphere math, so the pano is a proper equirectangular regardless.

## Projects & server-side save

- **`server.py`** (Python stdlib, no deps) serves the app and adds an API:
  `GET /api/projects` → non-hidden project dirs that contain a `plots.svg`;
  `GET /api/export-bundle?project=<id>` → streams a **`.zip`** of a self-contained,
  view-only "standalone site" (`do_bundle`: app shell — `index.html` with a baked
  `window.B91_BUNDLE` flag, `app.js`, `styles.css`, `vendor/three.module.js` — plus the
  project's files under `data/`, all under a top `<id>/` folder);
  `POST /api/save` `{project, files:[{name, encoding:'utf8'|'base64', data}]}` → writes
  files into `projects/<project>/`; `POST /api/rename` `{from,to}` (409 if `to` exists);
  `POST /api/delete` `{project}` → **moves** the dir to `projects/.trash/<id>-<epoch>`
  (recoverable, not a hard delete). It **sanitises** the project id
  (`^[a-z0-9][a-z0-9_-]{0,63}$`) and every filename (basename only, no `..`/separators),
  and confines writes to the `projects/` root. Binds to **`0.0.0.0`** so LAN devices can
  reach it (admin plotting from a remote browser) — the write API is **unauthenticated**,
  so run it only on a trusted/firewalled network (`HOST=127.0.0.1` env restricts it back
  to this machine).
- **Client:** `state.projectId`/`state.assetBase` come from `?project=<id>` at boot
  (default `sample`; admin-only localStorage fallback `b91-project-id`). All data files
  (`plots.svg/csv`, `*.json`) load from `${assetBase}/…`; image paths stored in the JSON
  are resolved **by basename** against the project dir (`assetUrl`) — so old `sample/…`
  paths keep working and a project directory is self-contained/relocatable.
- **Standalone bundle (F2):** an exported folder bakes `window.B91_BUNDLE = {project,
  dataBase}` into `index.html` (before `app.js`). `const BUNDLE` reads it → forces
  `state.admin=false`, sets `state.assetBase=dataBase` (e.g. `./data`), and `state.bundle=true`.
  Since the switcher/save/probe are all admin-gated, the bundle **never calls `/api/*`** and
  runs view-only on any static host / in an `<iframe>`. Admin **⋯ menu → Export standalone
  site…** (`exportBundle`) fetches `/api/export-bundle`, downloads the zip, and copies an
  `<iframe>` embed snippet.
- **Admin save:** `serverSave`/`saveToProject` POST to `/api/save`; Export + each "Save…"
  button go through it (download-fallback if the server is unreachable). Saving to a
  **different** project id clones it — `fetchReferencedImages` copies on-disk images
  (pano/plan/logo/renders that have no in-memory blob) from the source project so the new
  dir is complete; same-project saves skip that (files already there).
- **Header project menu** (`initProjectBar`, in the topbar — **admin only**; the client
  view is view-only and shows no project bar): a `<select>` switcher
  (navigates via `projUrl`), a **💾 Save** button
  (`headerSave` → `exportSite`, writes ALL project files to the current dir with inline
  ✓ feedback — the one-click alternative to the sidebar's Export/Save…), plus a `⋯` menu —
  **New** (open a blank project id), **Duplicate as…** (set save target + `exportSite`
  clone), **Rename…** (`/api/rename`), **Delete…** (type-to-confirm → `/api/delete`).
  Actions share the inline name/confirm row (`onProjAction`/`validateProjName`/`commitProjName`).
  `exportSite` returns the save success boolean. Loading a
  **nonexistent** project id is fine — `loadGeometry`/`loadData` fall back to an empty
  project (no plots) so New/blank works and the admin can build + Export it.

## Code map (`app.js`, single module)

Top-down, by section header:
- **CONFIG** — `TOUR_BASE_URL`. **Projects:** `sanitizeProjectId`,
  `BUNDLE` (standalone-bundle boot flag from `window.B91_BUNDLE`), `BOOT_PROJECT`,
  `state.projectId`/`state.assetBase`/`state.bundle`, `dataUrl(name)` (project data file),
  `assetUrl(storedPath,ver)` (image, basename-resolved + cache-bust). (The Google-Sheet
  plot-data source is now **per-project** in `state.sheet`, not a global stub — see below.)
- **`STATUS_META` / `SELECT_COLOR`**, **`els`** (all `getElementById` refs), constants
  (`R=500`, `R_PLOT=492`, `R_DRAPE=489`, `GROUND_H=1`, `FOV_MIN/MAX=20/120`,
  `PANO_TEX_CAP=8192`, `gpuMaxTexSize()`), **`state`**.
- **Data:** `loadData` (live sheet → committed CSV fallback), `parseCSV`, `normalizeRow`
  (lower-cases `status`), `canonPlotId`/`indexRows` (prefix-tolerant `plot_id` join —
  bare `133` ↔ `Plot-133`), `loadCommittedCSV`. **Google Sheet source** (per project):
  `parseSheetUrl`/`sheetGid`/`sheetCsvCandidates` (share **or** Publish-to-web link →
  gviz/pub CSV endpoint), `fetchSheetRows` (→ Map or null on any failure), `sheetData`
  (serialise), `updateSheetAdminUI`/`testSheet`/`setSheetMsg` (admin URL field + Test).
  `state.sheet{url,gid,enabled}` + `state.dataSource` ('file'|'live'|'cached').
  **Geometry:** `loadGeometry` (SVG→`state.geom`), `recomputeAnchorAndK`.
- **Projection:** `dir` (pano, X-reflected), `groundPoint` (NOT reflected),
  `placeOnSphere`, `subdivPx`.
- **Pano texture:** `panoTextureFromSource`, `loadPanoTexture(url|Blob)` (downscales to
  `min(PANO_TEX_CAP, GPU max)`, anisotropy 16, wrapS repeat), `swapPano`,
  `setPanoFromFile` (admin pick → resize → live swap + export blob), `buildPanoSphere`.
- **Drape:** `buildGroundMesh`/`updateGroundGeometry`/`loadGroundImage`/`setGroundOpacity`.
- **Plots:** `getLabel` (sprite), `buildPlotObject`, `initThree`, `rebuildPlots`,
  `renderLoop` (continuous rAF — needed; also calls `placePanel` + `renderLandmarks`),
  `updateCamera`, `clampView`/`clampLat`, `setFov`.
- **Interaction:** pointer/drag in `wireViewControls`, raycast (`ndcOf`, `rayHit`,
  `rayToGround`), `hover`/`pick`, `setEmphasis`.
- **Data join:** `colorPlots`, `applyData`, legend/`toggleFilter`, `applySelectStyle`
  (selection keeps status colour + gold outline), `applyLabelVisibility` (# toggle).
- **Tooltip/popover:** `esc`, `showTooltip` (hover info card), `openPanel`/`placePanel`
  (click → compact popover anchored at the plot, blank fields hidden, caret),
  `restorePlotStyle`, `closePanel`; **modal:** `openModal` (3DVista iframe).
- **Alignment persistence:** `parseAlignment`/`loadAlignmentFile`/`readDraft`/
  `alignmentData`/`onAlignmentChanged`; admin UI `setScale`/`setRotation`/
  `updateAdminUI`/`setAdminMode`/`updatePanoName`.
- **Site branding** (client title-bar project name + tagline + logo, stored in
  `alignment.json`): `state.brand`, `brandData` (serialise), `brandLogoSrc` (blob >
  cache-busted committed path), `brandInitials`, `applyBrand` (paints `#brandMark`/
  `#brandName`/`#brandTagline` + `document.title`, falls back to `B91`/`Build91`/
  `Interactive Plot Map`), `updateBrandAdminUI`, `setBrandLogo`/`clearBrandLogo`
  (logo resized to a ≤512px `.web.png` to keep transparency). Admin controls live in the
  Align tab; the logo blob rides the working session and ships via Export.
- **Working session (IndexedDB):** `idbOpen/Put/Get/Del`, `buildSession`,
  `saveSession`(debounced+explicit), `clearSession`, `applySessionGeometry`.
- **Server-side save:** `blobToBase64`, `serverSave` (POST `/api/save`), `downloadFiles`
  (fallback), `saveToProject` (server-save + fallback + status), `fetchReferencedImages`
  (clone on-disk images when saving to a new project). `buildPlotsSVG`/`buildPlotsCSV`,
  `exportSite` (whole site; returns success bool), `saveAlignmentAs`/`saveLandmarksAs`/
  `saveAmenitiesAs` (single file + its render blobs). Header project menu: `initProjectBar`,
  `projUrl`, `headerSave` (💾 Save), `onProjAction`/`commitProjName`, `renameProject`,
  `deleteProject`, `exportBundle` (⋯ → Export standalone site… → `/api/export-bundle` zip +
  clipboard `<iframe>` snippet).
- **`wireAdmin`** — wires every admin control incl. tabs + the Project ID field.
- **Trace editor** (PNG/DXF → polygons): `trace` state, flood-fill/`traceBoundary`/
  `douglasPeucker`, `refreshTraceList` (inline per-plot data & media attachment editing), `parseMediaType`
  (detects & handles 3D Walkthroughs, YouTube embeds, and Image URLs/files), `traceLoadImage`
  (downscale ≤`TRACE_MAX=4096`), `finishTrace`, `openTrace`/`loadCurrentLayoutIntoTrace`
  (pre-loads the live layout for editing), `wireTrace`; **`parseDXF`**.
- **Landmarks:** `LM_ICONS`, `dirFromLonLat`/`lonLatFromDir`, `lmBannerHTML`,
  `rebuildLandmarkDOM` (marks `.has-render` banners interactive + wires hover/tap card),
  `projectDir`/`renderLandmarks`, `applyLandmarkVisibility`,
  drag (`startLmDrag`/`onLmDragMove`), `addLandmark`/`deleteLandmark`/`selectLandmark`/
  `setLandmarkRender`/`refreshLmList` (inline edit incl. render-image picker),
  `setAdminTab` (3-way: align/landmarks/amenities),
  `parseLandmarks`/`buildLandmarksData`/`loadLandmarksFile`/`setLandmarks`/`saveLandmarksAs`.
  A landmark may carry an optional **render image**; a `.has-render` banner shows the
  shared info card on **hover (desktop) / tap (mobile)** → thumbnail → lightbox.
- **Amenities** (in-layout icon pins — like landmarks but no status, name IS the label,
  clickable, with a render image → lightbox): `AM_ICONS`/`AM_ICON_ORDER`,
  `amMarkerHTML` (a `.am-marker` = 0-size anchor at the
  hotspot holding a **`.am-pin` dot on the exact spot** + a floating **`.am-chip`** label
  bubble with a down-caret), `rebuildAmenityDOM`/`renderAmenities`/
  `applyAmenityVisibility`, drag (`startAmDrag`/`onAmDragMove`, `amSuppressClick` guards
  the post-drag click), `selectAmenity`/`addAmenity`/`deleteAmenity`/`setAmenityRender`/
  `refreshAmList` (inline edit incl. render-image picker),
  persistence `parseAmenities`/`buildAmenitiesData`/
  `loadAmenitiesFile`/`setAmenities`/`saveAmenitiesAs`.
- **Shared info card + lightbox** (used by both amenity click and landmark hover/tap):
  `renderSrc` (blob URL > committed path, generic), `openAmCard`/`openLmCard`/`placeAmCard`
  (anchored to `state.cardAnchor` {lon,lat}; `state.cardHoverMode`+`keepCard`/`scheduleHideCard`
  auto-hide hover cards)/`closeAmCard`, `openLightbox`/`closeLightbox`, and
  `resizeImageToBlob` (generic longest-side≤cap downscaler for all render images).
- **Boot `init()`** — loads geometry → alignment (session>draft>file) → pano
  (session blob > `panoImage` ref > default) → three → drape → data → landmarks.

`index.html` mirrors these as markup (admin bar with **Align/Landmarks tabs**, the
`#landmarks` overlay inside `#pano`, zoom-controls with `#` and `📍` toggles).
`styles.css` holds all styling (dark theme, gold accent `var(--gold)`).

## Data files & contract (`projects/<id>/`)

Each project directory holds these files (the client reads them cache-busted from the
active project dir; image `file` paths are resolved by **basename** against that dir, so a
stored `sample/foo.jpg` loads as `projects/<id>/foo.jpg`). Formats:
- **`plots.svg`** — `<polygon class="plot" id="Plot-XXX" points="…">` in image-pixel
  space; `viewBox` = the plan image size. Labels auto-derived from id.
- **`plots.csv`** — header `plot_id,status,facing,size,dimensions,price,block,tour_url,notes`
  (header-driven; missing cols read blank). `status` ∈ available|reserved|sold (lower-cased
  on load by `normalizeRow`). This is the client's **default** source *and* the **fallback**
  when a Google Sheet is configured but unreachable (admin Save snapshots the sheet into it).
- **`alignment.json`** — `{ transform{tx,ty,scale,rotationDeg}, view{lonDeg,latDeg,fov},
  opacity, groundImage?{file,opacity}, panoImage?{file}, brand?{name,tagline,logo?{file}},
  data?{source:'sheet'|'file', sheet:{url,gid?}} }`.
  Client reproduces the saved view (WYSIWYG) and paints the title bar from `brand`
  (name/tagline/logo → `#brandMark`/`#brandName`/`#brandTagline`; falls back to the
  built-in `Build91` defaults when absent). Image paths are always `sample/…` (never a
  `blob:`); missing = skipped. The `brand.logo` is a `sample/logo.web.png`. **`data`** points
  plot status/details at a **live public Google Sheet** (`source:'sheet'`) with `plots.csv`
  as fallback; absent or `source:'file'` ⇒ committed CSV only (today's behaviour).
- **`landmarks.json`** — `{ version, landmarks:[{ label,distance,driveTime,icon,
  render?{file}, hotspot{lonDeg,latDeg}, banner{lonDeg,latDeg} }] }`. `render` is
  optional (a `sample/…` `.web.jpg` path, auto-resized on import); a landmark with one
  shows the shared info card + lightbox on client hover/tap (banner gains `.has-render`).
- **`amenities.json`** — `{ version, amenities:[{ id,name,icon,facing,size,dimensions,
  price,block,tour_url,notes, render?{file}, hotspot{lonDeg,latDeg} }] }`. In-layout
  points of interest (clubhouse/temple/pool…): a **pin dot at `hotspot`** (the exact spot,
  like a landmark pin) with the icon + `name` label bubble floating just above it (no
  status/colour), plus an optional full-size **render** image
  (`render.file`, a `sample/…` path — auto-resized `.web.jpg` on import) shown in a
  lightbox. Client reads it view-only; missing file = pin with no thumbnail.
- **Images** — the pano (`panoImage.file`) and drape/plan PNG; auto-resized on import to
  texture-safe `.web.jpg`/`.web.png`. No pano ⇒ a generated `fallbackPanoTexture()` (plain
  sky) so the app still runs. The repo `.gitignore` ignores `*.png/*.jpg/*.jpeg`, so
  runtime images are **force-added** (`git add -f`).
- **Publishing = server-side save.** Admin sets a **Project ID**, then **Export site
  files…** POSTs everything to `server.py`, which writes `projects/<id>/` (plots.svg/csv,
  alignment.json, landmarks.json, amenities.json + all render/plan/pano/logo images). The
  client then loads it at `/?project=<id>`. (Under a plain static server, saves fall back
  to browser downloads.)

## Persistence model (3 layers)

1. **Committed `projects/<id>/` files** — the client's source of truth. Written by the
   admin's server-side save (Export / Save…) via `server.py`.
2. **Working session (IndexedDB `b91-admin`/`session`/`current`)** — admin-only full
   snapshot (geometry + rows + plan blob + pano blob + **brand logo blob** + landmarks +
   amenities, **both incl. render blobs** + alignment), debounced autosave,
   **auto-restores on reload** (session > draft > committed file by `savedAt`).
   Discard/Reset clear it.
3. **localStorage** — lightweight alignment draft (`b91-plot-alignment-draft-v2`), the
   toggle prefs `b91-show-labels`/`b91-show-landmarks`/`b91-show-amenities`, and (admin
   only) the last-used `b91-project-id`.
4. **`projects/<id>/` on the server** — the durable home, written by `server.py`.

## Conventions & gotchas (learned the hard way)

- **Google Sheet source is per-project & public-only.** `state.sheet` (from
  `alignment.json`'s `data`) drives **plots only** — landmarks/amenities stay file-based.
  The browser reads the sheet CSV **directly** (no server proxy), so the sheet must be
  public: a normal share link ("Anyone with the link") → `gviz/tq?tqx=out:csv`, or a
  Publish-to-web link → `/pub?output=csv`; `parseSheetUrl` picks the endpoint by URL shape.
  A private sheet / bad URL / CORS block fails silently and `loadData` falls back to the
  committed `plots.csv` (`dataSource='cached'`, sync label "cached · sheet unreachable").
  `fetchSheetRows` guards on the response actually being CSV **with a `plot_id` column**
  (Google returns a 200 HTML page for some bad requests), so don't drop that check. Google
  caches published sheets ~5 min, so status edits aren't instant. The `plot_id` join is
  **prefix-tolerant** — `indexRows`/`canonPlotId` match sheet rows to polygons ignoring an
  optional `Plot-` prefix (so a sheet listing bare `133` joins to `Plot-133`) and rewrite the
  row's `plot_id` to the canonical polygon id; the admin **Test** button reports the match
  count. This is why `loadCommittedCSV`/`fetchSheetRows`/the session restore all key rows
  through `indexRows`, not a raw `plot_id` Map — don't revert that.
- **Project asset paths resolve by BASENAME** (`assetUrl`) against `state.assetBase`
  (`projects/<id>`), so a JSON that stores `sample/foo.jpg` still loads from the active
  project dir. Don't "fix" stored paths to absolute — basename resolution is what makes a
  project dir relocatable and save-as/clone work.
- **`b91-project-id` is an ADMIN-only boot fallback.** The client must derive its project
  solely from `?project=` (else a visitor would load whatever the admin last saved). Keep
  the localStorage read gated on `?admin`.
- **Save-as clones on-disk images.** Committed images loaded by path have no in-memory
  blob; when the save target ≠ the booted project, `fetchReferencedImages` re-fetches them
  from the source dir so the new project is complete. Same-project saves skip it (fast).
- **`server.py` prints ASCII only** — the Windows console is cp1252 and a `→` in a
  `print()` crashes startup (`UnicodeEncodeError`). Keep server stdout ASCII.
- **Saves only reach disk under `server.py`.** `POST /api/save` (and rename/delete) exist
  only in `server.py`; under a plain `python -m http.server`, `/api/save` → 501, so
  `saveToProject` **downloads** the files instead of writing them. If a user reports "Save
  downloads to my browser," they're on the static server — start `python server.py 8731`.
  Admin boots detect this (`state.serverSave` via a `/api/projects` probe in
  `initProjectBar`) and show a `showNotice` warning; the 💾 Save button also flips to
  "⚠ Downloaded — no server" on the fallback.

- **Cache-busting:** `index.html` loads BOTH `app.js` (dynamic `import(...?v=Date.now())`)
  and `styles.css` (`document.write` a `?v=` link) cache-busted. If you add another
  render-blocking asset, bust it too. Stale `styles.css` once looked like "the popover
  is still a sidebar."
- **Verify with the preview MCP, but screenshots are flaky** — the 8192px pano (×
  extra textures) exhausts the headless WebGL context, so `preview_screenshot` often
  times out. **Prefer `preview_eval` DOM/state assertions** (positions, classes,
  IndexedDB, localStorage). Fresh `preview_start` sometimes buys 1–2 screenshots.
  `preview_click` is unreliable on the canvas — dispatch `PointerEvent`s in `preview_eval`.
- **Handedness:** `dir()` is X-reflected (inside-sphere), `groundPoint()` is NOT.
  Reflecting the drape/plots makes imported plans read backwards.
- **Continuous render loop** (not one-shot rAF) — headless throttling drops one-shots.
- **Texture cap** = `min(8192, gpuMaxTexSize())`; oversized panos auto-downscale.
  Keep a full-res source out of the repo.
- **Landmarks first-frame** projection can read NaN if the pano rect is mid-reflow;
  it settles — don't chase it.
- **Amenity pins are clickable (`pointer-events:auto`), landmark overlay is not** — but
  **`#pano` grabs `setPointerCapture` on pointerdown**, so a real tap's `click` lands on
  `#pano`, *not* the marker (the marker's own click handler never fires in the client).
  So `openAmCard` is routed through **`pick()`** (the pano tap handler): it `elementFromPoint`
  hit-tests for a `.am-marker` **before** the plot raycast, so a pin takes precedence over
  any plot beneath it. (The marker's `click` listener still handles the *admin* Amenities
  tab, where `startAmDrag`'s `stopPropagation` prevents pano capture.) A drag synthesizes a
  trailing `click` — `amSuppressClick` (set in `endAmDrag`, consumed in the marker click
  handler) stops that from toggling the selection off. Plot popover and amenity card are
  mutually exclusive (each `open*` closes the other); tapping empty space closes both.
  `renderAmenities` uses the **non-reflected** `dirFromLonLat` (same as landmarks).
- **Shared info card, two open modes.** `#amCard` serves amenities (click → **sticky**)
  and render-bearing landmarks (desktop **hover** → auto-hides via `state.cardHoverMode`,
  or **tap** via `pick()` → sticky). Only landmark banners with `.has-render` are
  `pointer-events:auto`; the mobile tap is routed through `pick()` (pano capture again),
  hit-testing `.lm-banner.has-render` after the amenity check and before the plot raycast.
  Don't wire `#amCard`'s `mouseleave` to close unconditionally — it must respect
  `cardHoverMode` or amenity (click) cards would vanish when the mouse leaves.
- **Render images must be cache-busted.** A replaced render keeps the same label-derived
  filename (`landmark-<label>.web.jpg`), so re-exporting overwrites the same URL and the
  client's browser serves the **stale cached image**. `renderSrc` appends `?v=<savedAt>`
  (`_ver`, captured from the file's `savedAt` in `parse{Landmarks,Amenities}`) to committed
  paths — the token changes on every export, busting the cache. Fresh in-memory blobs
  (admin, pre-export) skip the bust. Don't drop `_ver`, and keep `savedAt` in the exported
  JSON (`build{Landmarks,Amenities}Data` set it to `now`).
- **`state.planBlob` vs the drape texture:** the raw plan PNG bytes (`state.planBlob`)
  are only held in memory after an import or a session-restore. Booting from committed
  `sample/` files loads the plan **only as a drape texture** (`loadGroundImage`), so
  `state.planBlob` is null. The trace editor's backdrop needs the *blob*, so
  `loadCurrentLayoutIntoTrace` **lazily re-fetches `state.groundImage.file` into
  `state.planBlob`** when it's missing — otherwise "Import / Trace" showed plots but no
  plan image (main pano was fine). Don't remove that fetch-back.

## How to verify a change

1. `preview_start` → `plot-map` (runs `server.py`). 2. Navigate to
`/?admin=1&project=sample` (or `/?project=<id>` for client). 3. Assert via the browser
tools' `javascript_tool` (DOM text/classes/positions, `fetch('/api/projects')`,
`localStorage`, IndexedDB, on-disk via a Bash `ls projects/<id>`). 4. console errors
should be empty. 5. `node --check app.js` + `python -c "import ast;ast.parse(open('server.py').read())"`
for syntax. Screenshot only as a bonus (WebGL flakiness).

## Current status / open items

- Migrated into `Emagicor/ZeroxRealEstate` under `plot-map/`; branch
  **`add-plot-map-prototype`** is pushed. **PR was NOT opened** (`gh` CLI absent + the
  API call was classifier-denied) — open it manually if wanted.
- Features complete & verified: pano viewer, plots + status/legend, hover tooltip,
  click **popover** (blank-field hiding, caret), optional plot-number toggle,
  admin **align** (scale/rotate steppers, opacity), **import/trace** (PNG/DXF, pre-loads
  live layout, inline data edit), **background pano** config + export, **working
  session** autosave/restore, **landmarks** (tabbed, banner+pin+connector, drag,
  toggle, save/load/export).
- **Amenities** (added 2026-07-11, verified via `preview_eval`: add→marker, inline edit
  incl. render-image upload/resize, info card + lightbox from the client path, session
  save→reload restore incl. render blob, `node --check`): admin **Amenities** tab (3rd
  tab) with icon-pin add/drag/edit/delete + render-image picker, client icon-pins that
  open an info **card** → **lightbox** full render, 🏛️ visibility toggle (default on),
  `amenities.json` + render images in load/save/export/session. Screenshot still times
  out (WebGL), so this was verified by DOM/state assertions only.
- **Landmark render images** (added 2026-07-11): landmarks can now carry an optional
  `render` too; in the client a render-bearing landmark banner shows the shared info card
  on **hover (desktop)** / **tap (mobile)** → thumbnail → lightbox (verified via the real
  committed-file client path: hover open + keep-on-card + auto-hide-on-leave, mobile tap
  sticky, thumbnail→lightbox; amenity click card unaffected; `node --check`). Admin
  Landmarks tab has a render-image picker; `landmarks.json` gains `render?{file}` and the
  image is shipped by Export + kept in the session.
- **Site branding** (added 2026-07-12): the client title bar shows a configurable
  **project name + tagline + logo** (admin Align tab → "Site branding"), stored in
  `alignment.json` as `brand{name,tagline,logo?{file}}` with `sample/logo.web.png`.
  Verified via `preview_eval`: live title-bar update (name/initials/tagline/`document.title`),
  logo upload→blob preview, session save→reload restore incl. logo blob, and the real
  committed-file **client** path (brand read from `alignment.json`, logo cache-busted).
  Falls back to `B91`/`Build91`/`Interactive Plot Map` when unset.
- **Server-side save + projects** (added 2026-07-14): replaced browser-side save
  (File-System-Access picker / downloads) with a `server.py` write API. Each site is now
  `projects/<id>/`; client loads `?project=<id>` (default `sample`), admin has a **Project
  ID** field and Export/Save POST to `/api/save`. `sample/` (and the old manual subfolders)
  were migrated under `projects/`. Verified via the browser tools + on-disk checks: default
  project loads (30 plots, brand, amenities); `/api/projects` lists valid dirs; save-as to a
  new id **clones** incl. all images → client renders it fully; same-project save writes
  data files only (no image re-upload); missing-logo falls back to initials; no console
  errors. The user's manual archive folders (e.g. `Malathalli` with `plots (8).svg`) are
  preserved but not listed as projects (no clean `plots.svg`).
- **Project switcher + manage menu** (added 2026-07-14): the topbar has a project
  `<select>` (client + admin), an admin **💾 Save** button (one-click save of all project
  files to the current dir, verified: label→✓ Saved, all files written), and an admin `⋯`
  menu — New / Duplicate as… / Rename… / Delete… (delete → recoverable `projects/.trash/`).
  Naming moved from the admin sidebar to the header. Verified via the browser tools: bar/menu render, id validation +
  type-to-confirm delete, `/api/{save,rename,delete,projects}` (incl. rename 409 conflict
  and `.trash` exclusion), a nonexistent project id opens a blank editable app, and the
  client shows the switcher without the manage menu. No console errors.
- **Google Sheet live plot data — ROADMAP Feature 1** (added 2026-07-23): plot
  status/details can now come **live** from a per-project **public** Google Sheet, with the
  committed `plots.csv` as the fallback. Admin Align tab has a **Plot data** section (toggle
  + sheet-link field + **Test** button reporting rows & layout-match count); config saved in
  `alignment.json`'s `data` block; `loadData` fetches the sheet CSV (gviz for a share link,
  `/pub` for a Publish-to-web link) and falls back to `plots.csv` on any failure; the sync
  label shows the source (`live sheet` / `cached · sheet unreachable`); admin Save/Export
  **snapshots** the sheet into `plots.csv`; the existing Refresh button re-pulls it.
  Verified: URL→endpoint parsing (Node), admin section render + toggle show/hide, config
  round-trips to draft & restores on reload, live-attempt→fallback shows "cached" with plots
  still rendering (14/9/7=30), Test button surfaces a real HTTP error, no console errors,
  `node --check`. (Not verified against a real populated public sheet — no test sheet on
  hand; the CSV→Map pipeline is the same one `plots.csv` uses.) ❓ open: auto-poll interval,
  column-mapping UI — both deferred (see [ROADMAP.md](ROADMAP.md)).
- **Standalone / embeddable export — ROADMAP Feature 2** (added 2026-07-27): admin **⋯ menu
  → Export standalone site…** downloads a **portable folder bundle** (`<id>-plotmap.zip` →
  `<id>/` with `index.html`+`app.js`+`styles.css`+`vendor/` + the project's files under
  `data/`) that runs **view-only on any static host** and embeds via `<iframe>` (snippet
  auto-copied to the clipboard). `server.py`'s `GET /api/export-bundle` (`do_bundle`) zips it
  and injects `window.B91_BUNDLE={project,dataBase:'./data'}` into the shipped `index.html`;
  `app.js`'s `const BUNDLE` reads that → view-only, `assetBase='./data'`, **no `/api/*` calls**.
  The live Google Sheet (F1) still works inside the bundle (public URL) with the baked
  `plots.csv` as fallback. Verified end-to-end: real zip built via the endpoint (correct
  shell + `data/` layout, flag injected at `<head>`), unzipped and served from a **plain
  `python -m http.server`** (no API) → 30 plots + 7 landmarks + 2 amenities + brand render,
  data loads from `./data/`, admin/switcher hidden, **zero `/api` requests**, no console
  errors; `node --check` + `server.py` parse. (Admin/server code ships inert in `app.js` —
  the ❓ strip step is deferred, per ROADMAP.) One benign 404: the sample project's
  `alignment.json` references a `logo.web.png` that isn't on disk → brand falls back to
  initials (pre-existing data state, not a bundle bug; the normal client 404s the same).
- **Multi-Attachment Plot Media Support (3D Walkthrough / YouTube / Image)** (added 2026-08-22):
  Admins can now attach **multiple media items** (3D Walkthroughs, YouTube videos, Image URLs, local uploaded photos) to a single plot inside **Import & Trace** (`refreshTraceList`).
  Features a full inline multi-media item list manager with type selectors (`🌐 3D Tour`, `▶ YouTube`, `🖼 Image`), custom labels, URL inputs, local file upload (`＋ 📁 Upload Image…`), and instant `👁` preview buttons.
  On the client Plot Info Card, **all attached media options** render as distinct action buttons (e.g. `🌐 Walk through this plot →`, `▶ Watch YouTube Video →`, `🖼 View Photo →`).
  `parseMediaType` & `getPlotMediaList` seamlessly handle YouTube embed conversion, image lightboxes, and 3D tour iframe rendering.
- The user actively publishes real sites via server-side save (their data — don't clobber it).
- Suggested next: **ROADMAP Feature 3** (enquiry/lead capture) — see [ROADMAP.md](ROADMAP.md).
  Also outstanding: a client-side **"Load site folder…"** picker (view any exported folder) —
  not built.

## Documentation discipline

**After every meaningful change, update the docs in the same turn** so the next agent
(or a fresh account) inherits accurate context. Use the project skill
**`keep-docs-current`** (`.claude/skills/keep-docs-current/`) as the checklist. In short:
1. **This file** — refresh the code map, gotchas, and *Current status* if you added/
   moved/renamed anything or changed how to run/verify.
2. **[README.md](README.md)** — update the user-facing feature description.
3. **Inline comments** — keep the "why" next to non-obvious code.
4. Do it **before ending the turn**, not "later." Treat undocumented changes as
   incomplete.
