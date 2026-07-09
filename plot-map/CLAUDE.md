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
3DVista virtual tours. No framework, no bundler — `index.html` + `app.js` +
`styles.css` + a vendored `three.module.js`.

## Location & how to run

- **The app lives in this folder:** `…/ZeroxRealEstate/plot-map/`. Git repo is
  **`github.com/Emagicor/ZeroxRealEstate`** (the app is the `plot-map/` subdir).
  ⚠️ An older copy at the repo's grandparent (`…/ZeroxPlotting/`) is **deprecated** —
  its remote was removed and its duplicate files were deleted. **Always edit files
  under `plot-map/`.**
- **Run:** any static server rooted at `plot-map/`. Use `preview_start` with the
  `plot-map` launch config (`.claude/launch.json` runs `python -m http.server 8731`).
- **Client view:** `http://localhost:8731/`   ·   **Admin:** `http://localhost:8731/?admin=1`
- No install/build step. Editing `sample/` **is** how you publish to the client.

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

## Code map (`app.js`, ~1600 lines, single module)

Top-down, by section header:
- **CONFIG** — asset URLs (`renderUrl` default pano, `plotsSvgUrl`, `plotsCsvUrl`,
  `alignmentUrl`, `landmarksUrl`), `TOUR_BASE_URL`, Google-Sheet stub.
- **`STATUS_META` / `SELECT_COLOR`**, **`els`** (all `getElementById` refs), constants
  (`R=500`, `R_PLOT=492`, `R_DRAPE=489`, `GROUND_H=1`, `FOV_MIN/MAX=20/120`,
  `PANO_TEX_CAP=8192`, `gpuMaxTexSize()`), **`state`**.
- **Data:** `loadData`/`parseCSV`; **Geometry:** `loadGeometry` (SVG→`state.geom`),
  `recomputeAnchorAndK`.
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
- **Working session (IndexedDB):** `idbOpen/Put/Get/Del`, `buildSession`,
  `saveSession`(debounced+explicit), `clearSession`, `applySessionGeometry`.
- **Export:** `saveAlignmentAs`, `buildPlotsSVG`/`buildPlotsCSV`, `exportSite`
  (writes plots.svg/csv, alignment.json, +plan png, +pano jpg, +landmarks.json).
- **`wireAdmin`** — wires every admin control incl. tabs.
- **Trace editor** (PNG/DXF → polygons): `trace` state, flood-fill/`traceBoundary`/
  `douglasPeucker`, `refreshTraceList` (inline per-plot data editing), `traceLoadImage`
  (downscale ≤`TRACE_MAX=4096`), `finishTrace`, `openTrace`/`loadCurrentLayoutIntoTrace`
  (pre-loads the live layout for editing), `wireTrace`; **`parseDXF`**.
- **Landmarks:** `LM_ICONS`, `dirFromLonLat`/`lonLatFromDir`, `lmBannerHTML`,
  `rebuildLandmarkDOM`, `projectDir`/`renderLandmarks`, `applyLandmarkVisibility`,
  drag (`startLmDrag`/`onLmDragMove`), `addLandmark`/`deleteLandmark`/`selectLandmark`/
  `refreshLmList`, `setAdminTab`, `parseLandmarks`/`buildLandmarksData`/
  `loadLandmarksFile`/`setLandmarks`/`saveLandmarksAs`.
- **Boot `init()`** — loads geometry → alignment (session>draft>file) → pano
  (session blob > `panoImage` ref > default) → three → drape → data → landmarks.

`index.html` mirrors these as markup (admin bar with **Align/Landmarks tabs**, the
`#landmarks` overlay inside `#pano`, zoom-controls with `#` and `📍` toggles).
`styles.css` holds all styling (dark theme, gold accent `var(--gold)`).

## Data files & contract (`sample/`)

The client reads these committed files (all fetched cache-busted). Formats:
- **`plots.svg`** — `<polygon class="plot" id="Plot-XXX" points="…">` in image-pixel
  space; `viewBox` = the plan image size. Labels auto-derived from id.
- **`plots.csv`** — header `plot_id,status,facing,size,dimensions,price,block,tour_url,notes`
  (header-driven; missing cols read blank). `status` ∈ available|reserved|sold.
- **`alignment.json`** — `{ transform{tx,ty,scale,rotationDeg}, view{lonDeg,latDeg,fov},
  opacity, groundImage?{file,opacity}, panoImage?{file} }`. Client reproduces the saved
  view (WYSIWYG). Image paths are always `sample/…` (never a `blob:`); missing = skipped.
- **`landmarks.json`** — `{ version, landmarks:[{ label,distance,driveTime,icon,
  hotspot{lonDeg,latDeg}, banner{lonDeg,latDeg} }] }`.
- **Images** — the pano (`renderUrl` default, or `panoImage.file`) and drape/plan PNG.
  Auto-resized on import to texture-safe `.web.jpg`/`.web.png`. The repo `.gitignore`
  ignores `*.png/*.jpg/*.jpeg`, so runtime images are **force-added** (`git add -f`).
- `sample/` is the **single live site** (not a multi-project loader). To publish:
  **Export site files… → point the folder picker at `plot-map/sample/` → reload the client.**

## Persistence model (3 layers)

1. **Committed `sample/` files** — the client's source of truth. Written by Export.
2. **Working session (IndexedDB `b91-admin`/`session`/`current`)** — admin-only full
   snapshot (geometry + rows + plan blob + pano blob + landmarks + alignment),
   debounced autosave, **auto-restores on reload** (session > draft > committed file by
   `savedAt`). Discard/Reset clear it.
3. **localStorage** — lightweight alignment draft (`b91-plot-alignment-draft-v2`) + the
   toggle prefs `b91-show-labels`, `b91-show-landmarks`.

## Conventions & gotchas (learned the hard way)

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

## How to verify a change

1. `preview_start` → `plot-map`. 2. Navigate `preview_eval` to `/?admin=1&nocache=<ts>`
(or `/` for client). 3. Assert via `preview_eval` (DOM text/classes/positions,
`localStorage`, IndexedDB). 4. `preview_console_logs level:error` should be empty.
5. `node --check app.js` for syntax. Screenshot only as a bonus.

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
- The user actively exports real sites into `sample/` (their data — don't clobber it).
- Suggested next: a client-side **"Load site folder…"** picker (view any exported
  folder / keep several sites) — not built.

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
