# CLAUDE.md — Build91 Interactive Plot Map (agent handoff)

> **Read this first.** It's the single source of truth for picking up work on this
> project, and it must survive agent restarts and Claude-account swaps. Keep it
> current — see **[Documentation discipline](#documentation-discipline)** at the end.
> User-facing feature docs live in [README.md](README.md); this file is agent-facing
> (architecture, code map, conventions, gotchas, verification, status). Every change
> is logged in **[CHANGELOG.md](CHANGELOG.md)** as it happens.
>
> **Planning docs (live — keep them ticked as work lands):**
> [ROADMAP.md](ROADMAP.md) (plot-map features F1–F3) ·
> [VIRTUAL-TOUR.md](VIRTUAL-TOUR.md) (multi-node panoramic tour + WebXR — planning only,
> nothing built yet; **read it before starting any tour work**).

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
  view-only "standalone site" that runs via plain **`file://`, no server** (`do_bundle`:
  app shell — `index.html` with baked `window.B91_BUNDLE`/`window.B91_BUNDLE_FILES`/
  `window.B91_BUNDLE_IMAGES` flags, `app.js` (import-stripped), `styles.css`,
  `vendor/three.global.js` (module→global rewrite of `three.module.js`) — plus the
  project's files under `data/`, all under a top
  `<id>/` folder); `GET /api/export-bundle-check?project=<id>` → `{flagged:[...]}`, a
  pre-flight listing menu items that need internet even in the offline bundle (see
  **Standalone bundle** below); `POST /api/save` `{project, files:[{name,
  encoding:'utf8'|'base64', data}]}` → writes
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
  dataBase}`, `window.B91_BUNDLE_FILES = {...}` (the project's core JSON/SVG data,
  inlined), **and** `window.B91_BUNDLE_IMAGES = {...}` (just the pano + site-plan image,
  base64 `data:` URIs — the only two images that go through a WebGL texture, see
  **Conventions & gotchas**) into `index.html` (before `app.js`). `const BUNDLE` reads the
  first → forces `state.admin=false`, sets `state.assetBase=dataBase` (e.g. `./data`), and
  `state.bundle=true`; `const BUNDLE_FILES` reads the second → `loadProjectFile(name)`
  (the 5 data-loading call sites go through this, not raw `fetch`) serves from it instead
  of the network; `const BUNDLE_IMAGES` reads the third → `assetUrl()` returns its `data:`
  URI when the requested basename is in it, otherwise resolves normally. Since the
  switcher/save/probe are all admin-gated, the bundle **never calls `/api/*`**, needs no
  `fetch()` for its own data, and loads via classic (non-module) scripts — so it runs
  **view-only via plain `file://` with zero server**, as well as on any static host / in an
  `<iframe>` as before. Admin **⋯ menu → Export standalone site…** (`exportBundle`) first
  hits `/api/export-bundle-check` (warns, non-blocking, about any menu item that needs
  internet regardless — see **Conventions & gotchas**), then fetches `/api/export-bundle`,
  downloads the zip, and copies an `<iframe>` embed snippet.
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
  `assetUrl(storedPath,ver)` (image, basename-resolved + cache-bust; in a bundle, checks
  `BUNDLE_IMAGES` first — pano/plan only, see **Standalone bundle** below). (The Google-Sheet
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
  `loadProjectFile(name)` (next to `dataUrl`) — the data-loading call sites (`loadGeometry`,
  `loadCommittedCSV`, `loadAlignmentFile`, `loadLandmarksFile`, `loadAmenitiesFile`) go
  through this instead of raw `fetch`; in a standalone bundle it reads `BUNDLE_FILES`
  (`window.B91_BUNDLE_FILES`) instead, since `fetch()` is blocked under `file://`.
  **Geometry:** `loadGeometry` (SVG→`state.geom`), `recomputeAnchorAndK`.
- **Projection:** `dir` (pano, X-reflected), `groundPoint` (NOT reflected),
  `placeOnSphere`, `subdivPx`.
- **Pano texture:** `panoTextureFromSource`, `loadPanoTexture(url|Blob)` (downscales to
  `min(PANO_TEX_CAP, GPU max)`, anisotropy 16, wrapS repeat), `swapPano`,
  `setPanoFromFile` (admin pick → resize → live swap + export blob), `buildPanoSphere`.
- **Drape:** `buildGroundMesh`/`updateGroundGeometry`/`loadGroundImage`/`setGroundOpacity`.
- **Plots:** `getLabel` (sprite), `buildPlotObject`, `initThree`, `rebuildPlots`,
  `renderLoop` (continuous rAF — needed; also calls `placePanel` + `renderLandmarks`;
  idle auto-pan advances by `AUTOPAN_RATE` × elapsed ms, **not** per frame — a per-frame
  constant drifted twice as fast on a 120Hz display and crawled on a slow one; `dtMs` is
  capped at 100ms so a backgrounded tab resumes instead of lurching),
  `updateCamera`, `clampView`/`clampLat`, `setFov`.
- **Interaction:** pointer/drag in `wireViewControls`, raycast (`ndcOf`, `rayHit`,
  `rayToGround`), `hover`/`pick`, `setEmphasis`.
- **Landmark category drawer (client)** — starts `is-collapsed` at boot on narrow
  **portrait** screens (`isMobilePortrait()` — width AND orientation both checked, so a
  landscape phone keeps the desktop-style open-by-default drawer even if narrower than
  720px; wired in `wireViewControls`) so a portrait visitor sees the panorama first
  instead of a drawer covering most of the screen. `.cat-drawer-toggle` is a DOM child of
  `.cat-drawer`, so it rides along with the collapse transform — **deliberately given no
  counter-transform** (an earlier version of this added one, to push it back to its
  open-state position; removed same day once real-device testing showed that just floats
  it mid-screen with nothing to anchor it to, reading as a stray button rather than a
  control). **Collapsing therefore moves the DRAWER, never the button** — and it collapses
  to a **rail**, `translateX(calc(-100% + var(--collapsed-rail)))` with the rail at 38px,
  not the old flat `-100%`. That matters because the toggle is 38px wide at `right:-20px`,
  i.e. drawer-x `[W-18, W+20]`: at `-100%` it landed at screen x `[-18, +20]`, **cut in
  half by the screen edge** with no panel behind it (fixed 2026-09-04 from a reference
  mock; the old comment here called that clipping "a docked tab" and defended it). Keep the
  rail >= the toggle's 20px overhang or the clipping comes straight back. The rail exposes
  the panel's right 38px — the tail end of the menu rows — so `.cat-drawer-inner`'s direct
  children fade out while collapsed, leaving plain tinted glass; the toggle is a SIBLING of
  `.cat-drawer-inner` (child of `.cat-drawer`), which is what lets that one selector hide
  the menu without hiding the button. The rail also drops `pointer-events` so drags on it
  still pan the pano. Don't reintroduce a counter-transform without re-reading why the last
  one was reverted.
  **Landscape, separately:** `.topbar` (brand/legend/sync/Refresh) is hidden entirely on a
  client landscape phone (`@media (orientation:landscape) and (max-height:500px)`,
  `body:not(.is-admin)` — admin keeps it), and `#zoomStatusGroup` (floating pills inside
  `.zoom-controls`, bottom-right of `#pano`) takes over the piece of the header worth
  keeping there: ALL THREE status filters (`#zoomAvailableBtn`/`#zoomReservedBtn`/
  `#zoomSoldBtn`, `.zoom-status-btn`), wired generically off each button's `data-status`
  and kept in sync with the header legend by the single `syncZoomStatusButtons()` helper
  (counts from `renderLegend`, pressed-state from `toggleFilter`) so the two can't drift.
  It carried only "Available" until 2026-09-03, which left a phone visitor unable to see or
  filter Reserved/Sold at all. See **Conventions & gotchas** for why `.topbar` is hidden via
  `height:0` collapse rather than `display:none`.
  **Portrait gate:** `#rotateHint` (`showRotateHint`/`hideRotateHint`) — a BLOCKING screen,
  not a hint: `position: fixed`, fully opaque, `z-index: 300` above every panel and modal,
  so a portrait phone sees no content at all until it's turned. It has **no dismiss path on
  purpose** (no timer, no tap-to-close) — either would drop the visitor into the squeezed
  portrait layout the gate exists to prevent, so don't "helpfully" add one back. Animation:
  a gold phone outline turning 0deg → -90deg on a loop with a hold at each end (a continuous
  spin reads as a loading spinner rather than an instruction); honours
  `prefers-reduced-motion`. Orientation is watched via the orientation media query PLUS
  `resize` and `orientationchange` — the media query can fire before the viewport settles on
  mobile, and `isMobilePortrait()` reads `window.innerWidth`, so `resize` is what reliably
  catches up. Both manifests declare `"orientation": "landscape"` so an installed app opens
  the right way up and never meets the gate. Never applies to desktop, admin, or a tablet in
  portrait (>720px wide).
  `.zoom-controls` (the pill plus the `#`/📍/🏛️/+/−/⊡ icon buttons) is a column flex with
  no `align-items` set at the base rule, so outside landscape every child is the same 38px
  square and the default flex-start (left) alignment is invisible. In landscape the wider
  pill exposes it — fixed with `align-items: flex-end` scoped inside the same
  `body:not(.is-admin)` landscape media query (2026-09-02) so the base rule, desktop, and
  admin are untouched.
  `wireViewControls`'s `.cat-btn` handlers call
  `applyCategoryFilter(cat, { moveCamera = true })`. **Pass `moveCamera:false` for a
  styling-only refresh** — `rebuildLandmarkDOM` does, because it only wants the highlight/
  dim classes re-applied to its new nodes. It used to get the camera move too, which stole
  the client's saved WYSIWYG view at boot (`setLandmarks` → rebuild → 45 degrees off, FOV
  forced to 72) and yanked the admin's view on every landmark add/delete/render-set.
  **Which landmarks draw at all is decided in exactly one
  place — `isLandmarkShown(lm, cat)`** (just under `isLandmarkMatchCategory`): admin on the
  Landmarks tab sees everything; `ALL` shows only `featured !== false`; a named category
  shows every member of that category regardless of `featured`. `renderLandmarks`, its
  mobile density cap and `applyCategoryFilter`'s ALL camera framing all route through it,
  so they can't drift apart — add any new visibility rule there, not at a call site.
  On top of that it dims non-matching landmarks (`isLandmarkMatchCategory`:
  icon→category map, then a label keyword regex fallback, then a direct `lm.category`)
  and drives the camera via `computeLandmarkPanRange(dirs)` + `animateCameraTo`. That
  function makes a **fit-or-sweep** decision (see the comment above
  `LANDMARK_EDGE_PAD`/`LANDMARK_FIT_FOV_CAP`/`LANDMARK_FIT_FOV_FLOOR`/`LANDMARK_SWEEP_FOV`/
  `LANDMARK_SWAY_HALF`, just above it in the source): if the matched landmarks' bounding
  arc plus padding fits within `FOV_MAX` (120°), the camera frames the whole group at a
  fitted FOV and `state.landmarkPanRange` becomes a tiny window → idle auto-pan
  (`renderLoop`) just gently sways instead of sweeping; otherwise it's a real sweep sized
  to the landmarks' actual leftmost/rightmost extent (no artificial minimum), starting at
  one end of the arc. Its `sweepMin` is the visual **left** edge and increasing lon pans
  right (measured, not assumed — an older comment claimed the opposite and went stale when
  the lon convention was corrected; re-measure if you touch it). A swept category carries
  its own `radPerMs` on the range object, sized so one pass takes `LANDMARK_SWEEP_MS`
  (24s) regardless of arc width — the ambient drift rate took 134s across a real 161° arc,
  which reads as a frozen camera. A FITTED category sways at the ambient rate instead.
  `updateCamera` hard-clamps `state.view.lon` into
  `landmarkPanRange` for non-admin — the single choke point that keeps the client from
  ever drifting outside the selected category's arc. **The clamp is gated on
  `!cameraAnimTimer`, and that gate is load-bearing:** `applyCategoryFilter` installs the
  range and *then* starts the fly-in, which necessarily begins outside it, so clamping an
  in-flight animation pinned every frame to the range boundary — the camera cut to the
  destination on frame 1 and froze there while only the FOV animated (measured 2026-09-04:
  15-70 degree instant jumps, 22-29 of 36 frames frozen, on 5 of 6 real categories). The arc
  lock bounds where the view may WANDER; it must not fight the animation delivering it
  there. A "fits" range is only ±`LANDMARK_SWAY_HALF` (3.5 degrees) wide, which is why the
  symptom was near-total there and invisible on a wide sweep arc whose range happened to
  contain the starting view.
  The fits branch aims at the **arc midpoint** `(minLon+maxLon)/2`, not at
  `meanDirection`'s lon — the fit test and its FOV are derived from the arc, so centring
  anywhere else can leave an edge landmark outside the frame the fit promised (a real
  category was 12.9 degrees off). Latitude still comes from the mean.
  `meanDirection(dirs)` is the shared centroid-direction helper. Selecting "ALL", leaving
  Landmarks, **or the visitor's first real drag** (>6px, in `wireViewControls`' look-around
  branch — added 2026-09-03) sets `state.landmarkPanRange = null`, releasing the clamp back
  to free-spin; the drag case also cancels any in-flight `cameraAnimTimer` so the fly-in
  can't yank the view back mid-gesture. The auto-framing is a helpful default, not a cage —
  but note the category FILTER (`state.selectedCategory`) is deliberately NOT cleared by
  that drag, so the chosen landmarks stay highlighted while the visitor looks around.
- **Data join:** `colorPlots`, `applyData`, legend/`toggleFilter`, `applySelectStyle`
  (selection keeps status colour + gold outline), `applyLabelVisibility` (# toggle).
- **Tooltip/popover:** `esc`, `showTooltip` (hover info card), `openPanel`/`placePanel`
  (click → compact popover anchored at the plot, blank fields hidden, caret),
  `restorePlotStyle`, `closePanel`; **modal:** `openModal` (3DVista iframe).
- **Alignment persistence:** `parseAlignment`/`loadAlignmentFile`/`readDraft`/
  `alignmentData`/`onAlignmentChanged`; admin UI `setScale`/`setRotation`/
  `updateAdminUI`/`setAdminMode`/`updatePanoName`.
- **Background audio** (admin ⚙️ Settings → 🎵 Audio…, stored in `alignment.json` as
  `audio{file}`): `state.audio`, `audioData()`/`siteAudioSrc()`/`hasSiteAudio()`,
  `setSiteAudioFile`/`clearSiteAudio`/`updateAudioAdminUI`, and playback via
  `applySiteAudio`/`startSiteAudio`/`armAudioGesture`/`toggleAudio`/`updateAudioToggleUI`
  against the `#siteAudio` element. **Three things here are load-bearing:** (1) `toggleAudio`
  drives the uploaded track when one exists and otherwise falls back to the original
  synthesised ambience, so audio-less projects are unchanged; (2) playback state and the
  mute pref (`b91-audio-muted`) are set **synchronously on the click**, never in `play()`'s
  `.then()` — `paused` flips at once but the promise settles only when playback truly
  begins, and putting them in the callback made an unmute read back as muted AND let a
  quick second press restart instead of mute; (3) autoplay WILL be refused before the
  visitor interacts, which is normal, not an error — `armAudioGesture()` retries on the
  first real gesture. Admin never autoplays; 🔊 previews.
  **A VIDEO is a valid source here** (`isVideoSource`): an `<audio>` element demuxes an
  .mp4/.webm/.mov and plays its sound track with the picture never rendered, so no
  extraction step exists or is needed — but Chrome still decodes video frames even in an
  audio element (measured: 110KB video vs 17KB audio on a real clip) and the file ships at
  full video size, so audio-only is genuinely lighter and the admin hint says so.
  `warnIfSilentVideo()` catches the "clip has no sound track" case — 3 of the 11 MP4s in the
  sample project are video-only, so this is common, not hypothetical — using `mozHasAudio` /
  `audioTracks` where available and otherwise a brief MUTED play plus Chrome's
  `webkitAudioDecodedByteCount` (muted playback is exempt from the autoplay policy, so it
  needs no gesture). It stays silent when no browser answers definitively.
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
  `projectDir`/`renderLandmarks` (banners sit at their TRUE projected x — deliberately not
  clamped into the viewport; one whose label won't fit fully is hidden instead. An earlier
  version clamped it so labels could never be cut off, but that made every out-of-view
  landmark pile up against the sides and slide along while panning — removed 2026-09-03 at
  the user's request, "if they are out of scope let them be". Doesn't by itself resolve
  banner-vs-banner overlap. On mobile — `isMobilePortrait() ||
  isMobileLandscape()`, both orientations need this, confirmed by screenshot — also caps
  how many banners render at once: `LANDMARK_MOBILE_CAP`/`capSet`, render-bearing
  landmarks (`renderSrc(lm)`) prioritized, `#lmOverflowHint` surfaces the rest via
  `openLandmarksCategoryPicker()`. The cap reduces overlap among what's shown, it doesn't
  guarantee zero — real collision-avoidance was considered and deliberately not built),
  `applyLandmarkVisibility`,
  drag (`startLmDrag`/`onLmDragMove`), `addLandmark`/`deleteLandmark`/`selectLandmark`/
  `setLandmarkRender`/`setLandmarkFeatured`/`setAllLandmarksFeatured`/`refreshLmList`
  (inline edit incl. render-image picker, plus the per-row show-by-default control and the
  ✓ Show all / ✕ Hide all bulk buttons + `#axLmCount` live count). **That control is a
  ✓ ✕ PAIR of buttons, not one toggle, on purpose** — everything starts featured, so a
  single state-showing button reads as "tick the ones you want" and inverts the admin's
  intent (it did, on the day it shipped). Two buttons make each click idempotent, and
  `setLandmarkFeatured` early-returns when the value wouldn't change. Don't "simplify" it
  back into one toggle. It sits beside, and must never be confused with, the × delete,
  `setAdminTab` (3-way: align/landmarks/amenities),
  `parseLandmarks`/`buildLandmarksData`/`loadLandmarksFile`/`setLandmarks`/`saveLandmarksAs`.
  A landmark may carry an optional **render image**; a `.has-render` banner shows the
  shared info card on **hover (desktop) / tap (mobile)** → thumbnail → lightbox.
- **Amenities** (in-layout icon pins — like landmarks but no status, name IS the label,
  clickable, with a render image → lightbox): `AM_ICONS`/`AM_ICON_ORDER`,
  `amMarkerHTML` (a `.am-marker` = 0-size anchor at the
  hotspot holding a **`.am-pin` dot on the exact spot** + a floating **`.am-chip`** label
  bubble with a down-caret), `rebuildAmenityDOM`/`renderAmenities` (the chip stays centered
  on its true hotspot — the old inward nudge via an extra `translateX` offset was removed
  2026-09-03 for the same reason as the landmark clamp above; an amenity whose label won't
  fit fully is hidden instead. Does NOT get the landmark-style density cap, no evidence yet
  it needs one)/
  `applyAmenityVisibility`, drag (`startAmDrag`/`onAmDragMove`, `amSuppressClick` guards
  the post-drag click), `selectAmenity`/`addAmenity`/`deleteAmenity`/`setAmenityRender`/
  `refreshAmList` (inline edit incl. render-image picker),
  persistence `parseAmenities`/`buildAmenitiesData`/
  `loadAmenitiesFile`/`setAmenities`/`saveAmenitiesAs`.
- **Virtual tours** (VIRTUAL-TOUR.md Phase 1 — data model + admin Tour tab 2026-09-08;
  **viewer + hotspot linking + `panotour` menu type added later the same day**):
  `state.tours` (each `{id,name,startNode,nodes:[{id,name,pano,panoBlob,defaultView{lon,lat,fov}}],
  links:[{from,to,hotspot{lon,lat},label}]}`), admin `state.tourSel`/`tourNodeSel`, live
  viewer `state.tourView` (`{tourId,nodeId,title,busy,saved{view,panoMap}}`) +
  `state.tourHsSel`. `parseTours`/`buildToursData`/`loadToursFile`/`setTours`/
  `tourNodeBlobFiles`/`saveToursAs` mirror amenities (basename-resolved node images;
  `parseTours` drops links to deleted nodes + repairs `startNode`). Admin structure:
  `addTour`/`deleteTour`/`selectTour`/`addTourNodeFromFile` (upload →`resizeImageToBlob`
  at the pano cap — **unwrap `out.blob`**, see gotchas) / `deleteTourNode` /
  `refreshTourList` (tour+node list, and — while a tour is open — the per-room hotspot
  editor). `setAdminTab` is 4-way (align/landmarks/amenities/**tour**).
  **Viewer (D-11 takeover):** `openClientPanoTour(tourId,title)` hides plots/drape/
  landmarks/amenities and swaps the *existing* pano sphere's texture (one WebGL context);
  `closePanoTour` restores the saved view + texture and disposes the tour's textures.
  `tourGoTo(nodeId,{instant})` crossfades via a second sphere at 0.985× **sharing
  `three.pano.geometry`** (dispose the material only — never the shared geometry);
  `tourTween` is the easing helper. Heading is carried across nodes; `defaultView` applies
  on entry only. **Texture lifecycle:** `tourTex` LRU (`TOUR_CACHE_MAX = 3`) +
  `tourTouch`/`tourEvict`/`loadTourNodeTex`/`prefetchTourNeighbours` (one hop) —
  download weight and GPU residency are separate problems (see gotchas).
  **Hotspots:** `rebuildTourHotspotDOM`/`renderTourHotspots` (projected each frame from
  `#tourHotspots`, same model as landmarks), `startTourHsDrag`/`onTourHsDragMove`/
  `endTourHsDrag` (drag-to-place), `addTourHotspot`/`deleteTourHotspot`/
  `setTourNodeDefaultView`. `refreshTourBar` draws the room strip + exit (`#tourBar`).
  **Menu launch (D-12):** content type **`panotour`** stores `content.tourId` and
  dispatches to `openClientPanoTour` — distinct from `tour`, which iframes an *external*
  3DVista/Kuula URL/file. Wizard: 🧭 card + `renderWizardTourPicker` (warns on a tour with
  no nodes / no links) + `wizardState.tourId`.
- **Brochure PDF viewer** — `openClientBrochureModal` (iframe on iOS/desktop; pdf.js
  canvases on Android, which has no inline PDF viewer — see **Conventions & gotchas**),
  `loadPdfJs` (on-demand classic-script load of the vendored UMD build; sets
  `GlobalWorkerOptions.workerSrc`), `renderPdfInto(src, container, onFirstPage, shouldStop)`
  (sequential page → canvas rendering, cancellable, with a first-page callback the caller
  uses to cancel its 12s stall deadline). `vendor/pdf.min.js` + `vendor/pdf.worker.min.js`
  are precached by `sw.js` so the brochure works when opened for the first time offline.
- **Shared info card + lightbox** (used by both amenity click and landmark hover/tap):
  `renderSrc` (blob URL > committed path, generic), `openAmCard`/`openLmCard`/`placeAmCard`
  (anchored to `state.cardAnchor` {lon,lat}; `state.cardHoverMode`+`keepCard`/`scheduleHideCard`
  auto-hide hover cards)/`closeAmCard`, `openLightbox`/`closeLightbox`, and
  `resizeImageToBlob` (generic longest-side≤cap downscaler for all render images).
- **Boot `init()`** — loads geometry → alignment (session>draft>file) → pano
  (session blob > `panoImage` ref > default) → three → drape → data → landmarks →
  `registerOfflineSupport()` (last line of the successful path).
- **Offline support (PWA), client + MOBILE only** — `registerOfflineSupport` (registers
  `sw.js`, no-ops (and actively unregisters/clears any prior registration) if
  `state.admin`, unsupported/insecure origin, OR `!(isMobilePortrait() || isMobileLandscape())`
  — desktop is out of scope on purpose, since it already has a real offline mechanism via
  Export standalone site; `navigator.serviceWorker.ready` is raced against a 5s timeout so
  a stalled activation can't wedge the rest of boot), `isStandaloneDisplay`. Top-level
  `beforeinstallprompt` listener only captures `deferredInstallPrompt` — it does NOT show
  anything itself (used to, independently of the mobile gate — see **Conventions &
  gotchas** for why that was a real bug). The actual cache logic lives in **`sw.js`**
  (separate file, not part of the `app.js` module — see its own header comment for the
  full design: three caches, cache-busting-aware key normalization, admin passthrough,
  byte-range-aware media caching (`isRangedMediaPath` covers AUDIO as well as video — an
  `<audio>` element makes the same ranged requests, and caching a lone `206` would corrupt
  the entry exactly as it would for video), and project-asset navigations — an `<iframe>` loading a
  PDF counts as a navigation too — routed as data, not a page load).
  **One combined "Add to Home Screen" + save-for-offline prompt** (merged 2026-09-03 from
  two separate prompts, per explicit user request — see CHANGELOG): `collectOfflineAssets()`
  walks `state.menuConfig.tree` + landmarks/amenities renders + pano/site-plan/logo for
  every local (same-origin) asset in the current project; `estimateOfflineSize()`
  HEAD-requests each one for a total byte count; `maybeOfferOfflineSave()` shows
  `#offlineSaveBanner` (size + Add/Not now, gated per-project via `localStorage`) — ONE
  tap on Add fires the native install prompt (`deferredInstallPrompt.prompt()`,
  fire-and-forget) AND starts `runOfflineDownload()` in the same click handler, neither
  blocking the other, since they're unrelated mechanisms (native prompt = app-icon
  wrapper only; content download = the only thing that makes the site usable offline).
  `isIosSafari()` (no `beforeinstallprompt` there, ever — Apple gives web pages no
  install API) decides whether the banner's sub-text adds the one part that genuinely
  can't be automated: "tap Share → Add to Home Screen after". `runOfflineDownload()` does
  the actual fetches (plain `fetch()`, one retry per item, `res.ok` checked — a non-OK
  response, including `sw.js`'s own synthetic offline placeholder, counts as a failure,
  not a success; no caching code of its own — `sw.js`'s existing fetch interception does
  the storing, exactly as if the visitor had opened each item themselves) with byte-level
  progress via `Response.body.getReader()`, smaller files queued before video, lower
  concurrency than a normal connection would warrant (today's demo tunnel drops requests
  under load). Failures are tracked, not hidden: a partial run shows `"N/M saved"` and
  does NOT set the per-project `localStorage` "saved" flag, so the prompt offers again on
  a later visit instead of falsely declaring victory. Plot-level media
  (`getPlotMediaList`) is deliberately not walked — always meant to be external by design,
  same reasoning as the export-flagging feature.

**Client menu skips folders that offer no choice** (2026-09-04) — `resolveFolderTarget(node)`
is the single decision point behind every menu-row click, returning `open` / `images` /
`menu` / `empty`: one child → open it (recursing while each level still holds only one
thing), all-`image` children → the viewer at the first photo with prev/next for the rest,
anything else → the submenu. `activateMenuNode(node, {fromRoot})` is the one click path
(root list AND submenu list, so they can't drift), and it pushes only the folder actually
landed on so **Back returns where the visitor came from, not through skipped levels**.
`menuRowOpensSubmenu()` gates the `›` arrow to rows that really drill in. The recursion
carries a `seen` set + 8-hop cap because a round-tripped tree could point a folder at an
ancestor and walking that inside a click handler hangs the page. Autoplay is NOT part of
this — `openClientVideoModal` already calls `play()` and the YouTube/Vimeo embed builders
already append `autoplay=1`; the extra tap was the whole problem.

`index.html` mirrors these as markup (admin bar with **Align/Landmarks tabs**, the
`#landmarks` overlay inside `#pano`, zoom-controls with `#` and `📍` toggles).
`styles.css` holds all styling (dark theme, gold accent `var(--gold)`).

**Client drawer is a TRANSLUCENT pane, not a solid panel** (2026-09-04): `.cat-drawer-inner`
is a `rgba(16,20,29,.58–.74)` vertical gradient over `backdrop-filter: blur(2px)`. **Keep the
blur low** — the previous `blur(16px)` was what made it read as an opaque frosted slab even
at 0.88 alpha; alpha alone doesn't buy see-through if the blur has already destroyed every
feature behind it. The gradient is densest top and bottom (logo, footer) and thinnest across
the middle where the menu sits, and text carries its own `text-shadow`, so don't "tidy" those
away — they're what keeps labels legible over a bright sky. The brand lockup shows at ALL
sizes (a deliberate reversal of the older desktop-hidden rule — see the comment in
`styles.css`), and `.cat-nav` uses `justify-content: safe center`, where `safe` is
load-bearing: plain `center` would push a long menu's first items past the unreachable start
edge on a short window.

## PWA identity (per project)

`manifest.webmanifest` is **server-generated per project** (`server.py`'s `do_manifest`),
not the static file it looks like — a manifest is static JSON, so that's the only way the
installed home-screen icon/name can be the admin's branding rather than a generic one.
`setupPwaIdentity()` (app.js, runs during module evaluation so it lands before the browser
judges installability) appends the live `?project=` to `<link rel="manifest">` and the
apple-touch-icon. Icons come from `GET /api/pwa-icon-{192,512,512m}.png?project=<id>`
(`do_pwa_icon` → `_build_icon`), which letterboxes the project's logo onto a square canvas
— **home-screen icons must be square and ≥192px or the site isn't installable**, and an
admin logo is reliably neither; the `512m` maskable variant carries extra padding because
the OS crops it to its own shape. Output is cached as `projects/<id>/.pwa-icon-*.png` and
rebuilt when the logo is newer. **Pillow is an optional import** (`_pillow_ok()`) — this
server is stdlib-only by design, so without it (or without a project logo) both manifest
and icons fall back to the bundled `icons/icon-*.png`. A standalone bundle keeps the static
manifest: it has no server to generate anything (`setupPwaIdentity` no-ops under `BUNDLE`).

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
  **`audio`** (added 2026-09-04) is `{ file }` — an admin-uploaded background track looped
  for the client, stored/resolved exactly like `brand.logo` (fresh blob > committed path,
  cache-busted by `_ver`). It is NOT re-encoded on import.
- **`landmarks.json`** — `{ version, landmarks:[{ label,distance,driveTime,icon,
  featured, render?{file}, hotspot{lonDeg,latDeg}, banner{lonDeg,latDeg} }] }`. `render` is
  optional (a `sample/…` `.web.jpg` path, auto-resized on import); a landmark with one
  shows the shared info card + lightbox on client hover/tap (banner gains `.has-render`).
  `featured` (added 2026-09-04) is the admin's ✓/✕ — `false` keeps the landmark out of
  the client's default no-category view while leaving it fully visible under its own
  category. **Read it as `featured !== false`**: files written before the flag existed omit
  the key entirely and must keep showing.
- **`amenities.json`** — `{ version, amenities:[{ id,name,icon,facing,size,dimensions,
  price,block,tour_url,notes, render?{file}, hotspot{lonDeg,latDeg} }] }`. In-layout
  points of interest (clubhouse/temple/pool…): a **pin dot at `hotspot`** (the exact spot,
  like a landmark pin) with the icon + `name` label bubble floating just above it (no
  status/colour), plus an optional full-size **render** image
  (`render.file`, a `sample/…` path — auto-resized `.web.jpg` on import) shown in a
  lightbox. Client reads it view-only; missing file = pin with no thumbnail.
- **`tour.json`** (added 2026-09-08, VIRTUAL-TOUR Phase 1) — `{ version, tours:[{ id, name,
  startNode, nodes:[{ id, name, pano{file}, defaultView{lonDeg,latDeg,fov} }],
  links:[{ from, to, hotspot{lonDeg,latDeg}, label }] }] }`. **Many independent tours per
  project** (OQ-4); each node's `pano` is a texture-safe `.web.jpg` (basename-resolved, named
  `tour-<tourId>-<nodeId>.web.jpg` on import). Absent ⇒ no tours. `links` is the hotspot
  graph (authored in the viewer — next step); today it's written but empty. A menu item will
  reference a tour by id (`panotour` content type) to launch it.
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
   amenities, **both incl. render blobs** + **tours incl. node pano blobs** + alignment),
   debounced autosave,
   **auto-restores on reload** (session > draft > committed file by `savedAt`).
   Discard/Reset clear it.
3. **localStorage** — lightweight alignment draft (`b91-plot-alignment-draft-v2`), the
   toggle prefs `b91-show-labels`/`b91-show-landmarks`/`b91-show-amenities`, and (admin
   only) the last-used `b91-project-id`.
4. **`projects/<id>/` on the server** — the durable home, written by `server.py`.

## Conventions & gotchas (learned the hard way)

- **`resizeImageToBlob` returns `{ blob, W, H }`, NOT a Blob.** Storing the wrapper where
  a Blob is expected does not throw — it serialises to the string `"[object Object]"` and
  writes a **15-byte file** that looks saved and fails to decode. This destroyed every
  uploaded tour node pano until 2026-09-08. Always `out.blob`. A save test that only
  checks a file *appeared* on disk will not catch it — check the byte size.
- **Tour textures: download weight and GPU residency are different problems.** A node pano
  is ~2 MB over the wire (fine) but ~179 MB resident as an 8192×4096 RGBA texture with
  mips, so a 15-node tour would be ~2.7 GB. Hence `TOUR_CACHE_MAX = 3` + one-hop prefetch.
  **Do not "optimise" by keeping every node loaded** — that is the thing the cap exists to
  prevent. Walking prefetched links is instant; a *jump* to a distant room is the one
  navigation that must show it is loading.
- **The crossfade sphere SHARES `three.pano.geometry`.** Dispose its material only.
  Disposing the geometry kills the main pano sphere with it.
- **A tour "takes over" the viewer (D-11), so exit must restore everything it hid** —
  plot groups, drape, landmark/amenity overlays (via their own `apply*Visibility`, not by
  setting `.hidden` directly), the saved camera view *and* the previous pano texture.
  `closePanoTour` keeps that snapshot in `state.tourView.saved`.
- **Two menu content types both say "tour".** `tour` = an **external** 3DVista/Kuula tour
  iframed from a URL or uploaded file (`openClientTourModal`). `panotour` = **our** node
  graph, referenced by `content.tourId` (`openClientPanoTour`). Don't merge them.
- **Tour hotspots use the STORED lon convention** (`lonLatFromDir`/`dirFromLonLat`), like
  landmarks and amenities — *not* the camera-yaw convention. See the two-conventions note
  above `computeHome`. `defaultView`, by contrast, stores a **camera** lon/lat, because it
  is assigned straight into `state.view`. Mixing them mirrors placement horizontally.
- **`server.py` recognises a project by `plots.svg` OR `tour.json`.** A tour-only project
  has no plots; requiring `plots.svg` hid such projects from `/api/projects` and made
  `do_bundle` 404 them.
- **`do_bundle` copies every TOP-LEVEL file in the project dir into `data/`.** Raw
  source masters left beside the runtime `.web.jpg`s ship in every export (343 MB of PNGs
  made a 392 MB bundle). Keep masters in a **subdirectory** — subdirs are skipped.
- **An empty `menuConfig.tree` renders NO client menu at all** — and since 2026-09-08 the
  drawer itself is hidden in that case. The client drawer is **exactly** the authored menu;
  the old hardcoded `AERIAL VIEW` / `LANDMARKS` rows are gone, re-added as the
  zero-config content types `aerial` / `landmarks` (see `NO_CONFIG_CONTENT_TYPES`) so a
  project only shows them if it asked for them. **`landmarks` is the only desktop route to
  the landmark category picker** — a project with landmarks and no menu has no way into it.
- **`sw.js` is network-first for project CONFIG, SWR for media.** It used to be
  stale-while-revalidate for everything under `/projects/`, which served the *previous*
  `alignment.json` on the first load after an admin save — a freshly published menu item
  only appeared on the SECOND reload, which reads exactly like "it didn't save". If you
  change a caching strategy, **bump `VERSION`** (currently `v2`) or an installed worker
  keeps serving under the old rules. `cache: 'no-store'` in `fetch` does NOT help: the
  worker intercepts first.
- **The client nav drawer is HIDDEN in admin.** `wireAdmin` sets
  `els.catDrawer.hidden = true` because admin has its own sidebar — so a menu item can
  only ever be seen/tested at `/?project=<id>`, never at `/?admin=1&…`. This looks exactly
  like "my menu item didn't save"; it isn't.
- **`cleanNodeForSave` is a WHITELIST — a new content-type field must be added to it or it
  is dropped on every save.** It rebuilds `content` from `url` + `fileName` (+ `images`
  for gallery, `tourId` for panotour). A `panotour` item that lost its `tourId` still
  rendered in the menu and did nothing when clicked, which is why this cost a debugging
  round. Check this function whenever a content type gains a field.
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
- **`file://` blocks ES modules, `fetch()`, AND WebGL textures — three separate
  restrictions, verified directly with three separate repros.** A dynamic `import()` of a
  local module and a `fetch()` of a local file both throw `Failed to fetch` when the page
  itself was opened via `file://` with no server. Classic `<script src>` and `<img src>`
  are NOT blocked — an image displays fine. **But** feeding that same locally-loaded
  `<img>` into `gl.texImage2D()` (i.e. using it as a WebGL texture, not just displaying
  it) throws `SecurityError: ... contains cross-origin data`, **even when the image sits
  in the same folder as the page** — a `data:` URI is exempt from this one. This is why
  the dev-mode `index.html` (module `import`, `fetch(dataUrl(...))` everywhere, textures
  loaded from local paths) only ever actually worked served over http(s) — and why the
  **standalone bundle** (below) needed its own export-time rewrite: classic scripts +
  inlined JSON/SVG data (`B91_BUNDLE_FILES`) for the first two, base64 `data:` URIs
  (`B91_BUNDLE_IMAGES`) for the pano/plan textures specifically. Keep all three in mind
  before adding any new `fetch()`/module-only/texture-from-local-path code path that
  bundle mode would also need to hit.
- **Verify with the preview MCP, but screenshots are flaky** — the 8192px pano (×
  extra textures) exhausts the headless WebGL context, so `preview_screenshot` often
  times out. **Prefer `preview_eval` DOM/state assertions** (positions, classes,
  IndexedDB, localStorage). Fresh `preview_start` sometimes buys 1–2 screenshots.
  `preview_click` is unreliable on the canvas — dispatch `PointerEvent`s in `preview_eval`.
- **Screenshotting the *live server-hosted* app in headless Chrome/Edge (plain
  `--headless --screenshot`/`--dump-dom`, not the preview MCP above) is unreliable and can
  silently mislead you.** The boot sequence's real `fetch()` for the pano texture
  (`loadPanoTexture` → `dataUrl` → `fetch`) appears to never resolve before headless's
  capture point — `--virtual-time-budget` up to 30000 and omitting it entirely (real
  wall-clock wait) both fail to help. `initThree()` sits right after that `await`, and
  `wireViewControls()`/`wireAdmin()`/`renderLoop()` all run *after* `initThree()`, so none
  of them fire either — **no `is-admin` class even with `?admin=1`, no Three.js canvas,
  ever** — while earlier-executing code (`renderClientSidebar`, menu rendering) still
  looks completely normal, which is exactly what makes this misleading: the page *looks*
  loaded. Also confirmed `--window-size=W,H` does **not** map 1:1 to `window.innerWidth`
  in this environment (requesting 390 reported ~492 — a DPI-scaling quirk worth
  remembering when picking a test viewport size; orientation itself, i.e. width>height vs
  width<height, is preserved correctly regardless). **Workaround that does work:** the
  standalone bundle export (`file://`, data pre-embedded, zero live fetches) does not have
  this problem — confirmed reliable (real canvas, real rendered content, matches a real
  browser) across multiple rounds of use. To visually verify a change to
  `app.js`/`styles.css` in headless: hit `GET /api/export-bundle?project=<id>` on the
  running server, unzip it, and screenshot/dump-dom its `index.html` via a `file://` URL
  instead of the live server URL. **This only covers client view** — an exported bundle
  always forces `state.admin=false`, so there is currently no reliable way to headlessly
  screenshot **admin mode** at all in this environment; admin-facing changes need a real
  interactive check by a human.
- **Verified, screenshot-confirmed work can apparently disappear from disk between turns
  for reasons outside normal editing** — hit this once (2026-09-02): a full round of
  mobile-responsiveness work, screenshot-verified working the session before, was
  entirely absent from `app.js`/`styles.css`/`index.html`/the docs at the start of a later
  turn, while everything from earlier in the same session was still intact. Root cause
  unconfirmed (most likely some kind of session/file-state rewind between turns — nothing
  in that turn's own tool calls could explain it). **Before assuming a "missing" fix was
  never actually finished, check first** — `git diff`/`git status`, or `grep` for a
  distinctive string from the fix — since the earlier verification (especially a
  screenshot) is real evidence it existed. But don't over-invest in forensics either: if
  it's confirmed gone, just redo it — the design is usually still fresh in context, so
  re-implementing is far cheaper than diagnosing why it vanished.
- **`display:none` on a direct grid/flex item can silently reflow its siblings into the
  wrong track — a real bug hit hiding `.topbar` for landscape (2026-09-02).** `body` is
  `display:grid; grid-template-rows: auto 1fr`, and `.topbar` (a `<header>`) is its literal
  first direct child. `display:none` doesn't just make an item invisible — it removes it
  from the grid's placement algorithm entirely, so with `.topbar` gone the SECOND grid
  child (the main content/pano wrapper) shifted into the now-unclaimed first ("auto")
  track instead of staying in the second ("1fr") one. Symptom was a fully black
  screenshot; root-caused precisely by finding the Three.js canvas had rendered at
  `height="0"`. Fix: collapse the item **in place** instead of removing it from flow —
  `height:0; min-height:0; padding:0; margin:0; border:none; overflow:hidden;
  visibility:hidden` — so it stays a real (now zero-sized) grid item and doesn't disturb
  where the others land. **Generalizes beyond this one case:** before reaching for
  `display:none` on anything that's a direct child of a `grid`/`flex` container relying on
  implicit placement (no explicit `grid-row`/`order` pinning every item), consider whether
  removing it from flow could reflow a sibling — collapse-in-place is the safer default
  when in doubt.
- **Handedness:** `dir()` is X-reflected (inside-sphere), `groundPoint()` is NOT.
  Reflecting the drape/plots makes imported plans read backwards.
- **TWO OPPOSITE LON CONVENTIONS — the most expensive trap in this file.** A **stored** lon
  (landmarks, amenities, `dirFromLonLat`/`lonLatFromDir`) uses `atan2(-v.x, v.z)`, matching
  the X-mirrored inside-sphere `dir()` above. **`state.view.lon` is the camera YAW**, fed to
  `cam.rotation.set(lat, lon + PI, 0, 'YXZ')`, whose forward vector works out to
  `(cos(lat)sin(lon), sin(lat), cos(lat)cos(lon))` — the X-mirror of `dirFromLonLat`. So
  **`state.view.lon = L` looks at stored lon −L.** Anything that ends up in `state.view.lon`
  must go through **`viewLonFromDir(v) = atan2(+v.x, v.z)`** (defined just above
  `computeHome`); `lonLatFromDir`'s `atan2(-v.x, v.z)` is the stored-lon inverse and is
  correct where it is. Mixing them aims the camera at the **mirror image** of what you
  meant, off by twice the target's offset from lon 0 — so it is INVISIBLE for anything near
  lon 0 and catastrophic away from it. That's exactly how it survived undetected until
  2026-09-04: `computeLandmarkPanRange` built its arc with the stored formula (while its own
  doc comment promised camera convention), and the two categories that happened to sit
  within ~6° of lon 0 looked perfect while a category at 53° was aimed 106° away.
  `computeHome` had the same bug, masked by its −86° pitch. **When a bug's symptom depends
  on WHERE something sits rather than on what it is, suspect a mirrored convention.**
- **Continuous render loop** (not one-shot rAF) — headless throttling drops one-shots.
- **Texture cap** = `min(8192, gpuMaxTexSize())`; oversized panos auto-downscale.
  Keep a full-res source out of the repo.
- **Landmarks first-frame** projection can read NaN if the pano rect is mid-reflow;
  it settles — don't chase it.
- **`.modal-body` defaults to `background:#000`** (sized for the video/image lightbox).
  A custom modal built on `.modal-body` + its own class (e.g. `.custom-modal-body` for
  the admin menu-builder wizard, `.contact-modal-*` for the client Contact Card) must
  give that class its own `background` or the solid black bleeds through as a visible
  seam/strap wherever the custom class doesn't happen to cover it.
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
- **A service worker only registers on a secure context** (`https://` or `localhost`) —
  verified directly (again, same as the earlier `file://` findings): a plain LAN
  `http://192.168.x.x:8731` throws `The URL protocol of the current origin ('null') is not
  supported`. Being on the same WiFi as a test device is not sufficient for a mobile PWA
  offline demo; a temporary HTTPS tunnel (e.g. `cloudflared` quick tunnel) in front of
  `server.py` is required. `localhost` itself IS exempt, so `sw.js` registration can (and
  was) verified directly on this dev machine without any tunnel.
- **Video can't be cached like any other GET in `sw.js`.** A `<video>` element requests
  its `src` with byte-range headers for seeking, and the server answers with `206 Partial
  Content` — caching a single 206 response under the resource's URL would silently corrupt
  the cache (only that one byte slice would ever be served back). `respondVideo` only ever
  answers a ranged request from cache once a **complete** (`200`) copy is already held,
  slicing it manually into a proper `206` reply (`sliceRange`); otherwise it passes the
  ranged request straight to the network and separately kicks off an unranged background
  fetch to prime the full-file cache for next time. This naturally satisfies "cache video
  only once actually played," since the client viewer never sets a `<video>` `src` until
  `openClientVideoModal` runs (menu-item open), not on page load.
- **Live-server headless screenshots stay unreliable for admin verification specifically**
  (2026-09-02, offline-layer work): confirmed again that `--virtual-time-budget` +
  `--dump-dom`/`--screenshot` don't compose reliably with this app's dynamic `import('./app.js?v=...')`
  boot — different captures of the *same* `?admin=1` URL landed at different points in
  `init()`'s async chain, one of them early enough that neither `wireAdmin()` nor the
  category-drawer hide had run yet, making an admin page render pixel-identical to a
  client one. Don't read that as an admin-detection bug without first re-checking
  `state.admin` in isolation (e.g. a one-line `document.title = 'admin=' + state.admin`
  temporarily after the `state` object closes, dump-dom'd with a several-second
  `--virtual-time-budget`) — that isolated check is fast and immune to the rest of
  `init()`'s timing, and confirmed `state.admin` itself parses `?admin=1` correctly.
- **The same live-server headless unreliability extends to anything gated behind
  `init()` finishing at all** (2026-09-03, confirmed narrower root cause): repeated
  captures of the plain client URL (no admin) all stalled at "Loading…" — meaning the
  pano-texture-load step itself was hanging, well before `init()` ever reaches
  `registerOfflineSupport()` (near the very end of the successful path). A visible
  "Add to Home Screen" banner in such a capture is NOT evidence that `registerOfflineSupport()`
  ran — it has its own fully independent top-level `beforeinstallprompt` listener that
  fires and shows the banner regardless of `init()`'s progress. Don't infer anything about
  `registerOfflineSupport()`/the offline-save flow from whether that banner appears.
  Verify new logic gated behind `init()` completing via real data checks (fetch the
  project's committed JSON directly and confirm the code's assumptions against it) and a
  careful code trace instead — and ultimately a real device, since neither headless method
  here can exercise it (bundle-export forces `file://`, where service workers/`fetch()`
  don't work at all — see the `file://` gotchas above — so it can't test this feature
  either).
- **An `<iframe>` load is a `mode: 'navigate'` fetch, same as a real page load** — caught a
  real bug from this (2026-09-03): the Brochure viewer's PDF loads via `<iframe src>`
  (`openClientBrochureModal`), and `sw.js`'s navigation-fallback logic (offline + not
  cached → serve the cached app shell) doesn't know the difference between that and the
  actual page reloading, so it served the *whole app* inside the little brochure frame.
  Any future navigation-mode special-casing in `sw.js` needs to check for this — project
  assets should route through the ordinary data-cache path even when the browser labels
  the request a "navigation".
- **"Missing offline → works after viewing it online → then works offline" is diagnostic**
  (2026-09-03): it means the file was never in the pre-download list and got cached only as
  a side effect of being viewed (runtime stale-while-revalidate). Read that symptom as a
  `collectOfflineAssets` gap, not a caching failure. It found a real one: the Contact card
  is its own node kind (`kind: 'contact'`) with its photo at `node.contact.image`, outside
  the `content` object — the menu walk handled only `parent`/`child` and silently skipped
  it. When adding any new content type, the collector must be extended alongside the
  viewer, and it must resolve the URL the SAME way the viewer does (`assetUrl(...)`, same
  arguments) or the cache key won't match what gets requested. The collector's logic can be
  replayed in Node against the committed project JSON to check coverage without a browser —
  a cheap, genuinely reliable test in a session where browser testing mostly wasn't.
- **Synthetic `PointerEvent`s do NOT drive the pano's pan handler in headless** — don't try
  to prove drag/look-around behaviour that way (2026-09-03). Dispatching a full
  pointerdown → 30-40 pointermove → pointerup sequence on `#pano` reaches the element (a
  capture-phase counter confirmed all 40 arrived) yet moves the view not at all. Proven a
  harness limit rather than a code fault by a control run with NO category selected, where
  no clamp exists: the landmark banners were equally motionless. Such a test can't tell
  "the clamp released" from "the drag never happened", so it's worthless rather than
  reassuring — measure DOM positions to expose that (banner `getBoundingClientRect().left`
  before/mid/after), and otherwise leave drag behaviour to a real-device check.
- **Fetching a file is not the same as it being cached — verify, don't assume**
  (2026-09-03). `cache.put()` in `sw.js` can reject independently of the fetch that fed
  it, most plausibly on a per-origin **storage quota** (mobile browsers cap this, iOS
  Safari tightly; video is what blows past it). Those writes are detached from the
  response the page receives, so a failure there is invisible to the page and would be
  reported as a successful download. `verifyCachedItems()` (app.js) therefore checks
  Cache Storage directly after downloading — the page shares the same Cache Storage as the
  worker, so it can confirm the worker's work, matching the same query-stripped keys
  `cacheKeyFor` writes. Keep that check in place; "the bytes arrived" has already proven
  twice to be a misleading proxy for "this works offline".
- **Android Chrome has NO inline PDF viewer — it downloads PDFs, in an iframe and on a
  direct navigation alike** (2026-09-03, two rounds of real-device testing). First
  misdiagnosed as an offline-caching gap; the test that separated it was asking whether it
  also happened ONLINE (it did — a cache-miss would only show offline). Then misdiagnosed
  again as an *iframe-only* limitation, "fixed" with `window.open()` — the device answered
  with a "Download file again?" dialog, disproving that too. Server is not at fault
  (`application/pdf`, no `Content-Disposition`, same file previews fine on iOS): the
  browser simply lacks the capability, so nothing at the URL/markup level can fix it.
  Actual fix: `openClientBrochureModal` renders the pages itself with vendored **pdf.js**
  (`loadPdfJs`/`renderPdfInto`, canvases in `#clientBrochureCanvas`) on Android only —
  iOS/desktop keep the native iframe viewer, which is better where it works. pdf.js is
  **v3, not v4**, on purpose: v4 needs `Promise.withResolvers` etc. that old Android
  builds lack. A hang is not a rejection, so the caller races page 1 against a 12s
  deadline and falls back to the phone's own handling rather than stranding the visitor on
  "Loading brochure…". **Two general lessons:** (1) when a symptom survives what looked
  like the right fix, re-test under a DIFFERENT condition before assuming the fix just
  didn't land — it may be a second, unrelated bug wearing the same costume; (2) verify the
  assumption a fix rests on (here: "a direct navigation will preview") on the actual
  device before shipping it as the fix.
- **A media query adds NO specificity — a later base rule still wins** (2026-09-03). The
  mobile drawer overrides live around line 790 while `.cat-drawer`'s base rules are at
  ~1030+, so `.cat-btn { ... }` inside `@media (max-width: 720px)` lost outright to the
  plain `.cat-btn` declared later: the branding never appeared and the row spacing never
  tightened, silently. Scope mobile overrides for the drawer with `.cat-drawer .cat-btn`
  etc. (or place them after the base block). Same family as the `[hidden]` trap below —
  when a rule "should" apply but doesn't, check declaration ORDER before anything else,
  and confirm with a screenshot: the CSS being present in the file proves nothing.
- **`overflow-y: auto` on a flex child does NOTHING without `min-height: 0`** — the item's
  default `min-height: auto` refuses to shrink below its content, so it grows past its
  parent and the overflow simply falls off-screen instead of scrolling. Hit on `.cat-nav`
  (2026-09-04): the drawer's last menu rows were unreachable on a landscape phone despite
  the nav having `overflow-y: auto`. Whenever a scroll container is also a flex item, set
  `min-height: 0` or the scrolling is decorative.
- **`justify-content: center` + `overflow` = content you cannot scroll to — hit THREE times
  now.** A centred flex container whose content outgrows it overflows at BOTH ends, and the
  half past the start edge is unreachable by scrolling. Use **`safe center`**, which falls
  back to flex-start exactly when the content doesn't fit (and degrades to flex-start on a
  browser that doesn't know the keyword — the right way to fail). Occurrences: the client
  drawer's `.cat-nav`, and `.contact-modal-right`, where the contact details hung ~90px off
  the top of a landscape phone with no way to reach them. If you centre anything that can
  scroll, use `safe center`.
- **Bottom-anchored control stacks must be sized against the SHORTEST viewport, not the
  common one.** `.zoom-controls` grew to 370px against a landscape phone's ~260px and
  silently pushed the status pills off the top of the screen. The durable fix was to anchor
  the two groups to opposite edges (pills top-right, icons bottom-right) rather than tune
  sizes until they happened to fit; `max-height` + `wrap-reverse` back it up so an untested
  viewport wraps instead of overflowing. Measure at ~552×225 inner — that is a real phone
  in landscape once browser chrome is counted.
- **A class/element selector setting `display` unconditionally beats `[hidden]` if it's
  declared later — the THIRD time this exact class of bug has hit this project** (black
  strap on the wizard modal, the `display:none` grid-reflow issue, and now
  `.install-banner` never actually hiding after `hideInstallBanner()` set `.hidden = true`,
  2026-09-03). `[hidden]` and a class selector have equal CSS specificity; the later one in
  the cascade wins regardless of which is "supposed" to take priority, and author
  stylesheets always come after the UA stylesheet's own `[hidden]{display:none}`. Any
  element toggled via the `.hidden` DOM property needs an explicit
  `.the-class[hidden] { display: none; }` rule if the base class sets its own `display` —
  don't assume the attribute alone is enough to verify by reading the JS; check the CSS too.

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
- **Per-landmark show-by-default control** (added 2026-09-04, a ✓ ✕ button pair in the
  admin Landmarks list beside the existing × delete, plus ✓ Show all / ✕ Hide all and a
  live count): unticked landmarks drop out of the
  client's default no-category view but still appear in full under their own category,
  and always stay visible/draggable on the admin Landmarks tab. One decision point,
  `isLandmarkShown`; `featured` persists in `landmarks.json`/session/export and defaults
  to true for pre-existing files. Verified by `node --check` + 11 Node assertions run
  against the real `parseLandmarks`/`buildLandmarksData`/`isLandmarkShown` sources
  extracted from `app.js`; the CSS/button styling is code-reasoned only (headless admin
  screenshots remain unreliable here) and wants a look in a real browser.
  **Shipped first as a single toggle and immediately reverted to a pair** after the user
  reported their ticked landmarks vanishing — the engine was right, the affordance was
  wrong (see the second 2026-09-04 CHANGELOG entry). Existing projects saved under the
  single-toggle version may hold an inverted selection; ✕ Hide all then re-ticking is the
  fast fix.
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
- **Standalone / embeddable export — ROADMAP Feature 2** (added 2026-07-27, **rebuilt to
  run via plain `file://` on 2026-08-31**): admin **⋯ menu → Export standalone site…**
  downloads a **portable folder bundle** (`<id>-plotmap.zip` → `<id>/` with
  `index.html`+`app.js`+`styles.css`+`vendor/three.global.js` + the project's files under
  `data/`) that now runs **fully offline — double-click `index.html`, no server of any
  kind, verified via a literal `file://` URL** — as well as on any static host / in an
  `<iframe>` (snippet auto-copied to the clipboard) as before.
  - **Why a rebuild was needed:** verified directly (a minimal repro in headless Edge)
    that both ES module loading (the dev-mode `<script type="module">import(...)</script>`
    that loads `app.js`) and every `fetch()` call throw under `file://` — so the *old*
    bundle only ever actually worked when served over http(s), despite this doc's earlier
    claim. Classic `<script src>` and `<img src>` are NOT blocked, so most images (logos,
    landmark/amenity renders, contact photos, gallery photos) needed no changes — but see
    the WebGL-texture exception just below, found the same day when the first version of
    this rebuild shipped without it.
  - `server.py`'s `do_bundle` rewrites shipped copies at export time only (the live/served
    app is untouched): `module_to_global()` turns the vendored `vendor/three.module.js` —
    a single flat module whose only import/export surface is one trailing
    `export { A, B, C, ... };` line — into `vendor/three.global.js`
    (`window.THREE = {...}`); `strip_named_import()` removes `app.js`'s one
    `import * as THREE from './vendor/three.module.js';` line so it can load as a classic
    script; `build_embedded_files_json()` + `bake_bundle_html()` (replaces the old
    `inject_bundle_flag`) embed the project's `plots.svg/csv` +
    `alignment/landmarks/amenities.json` inline as `window.B91_BUNDLE_FILES` and swap in
    the two classic `<script src>` tags.
  - `app.js`'s `loadProjectFile(name)` (next to `dataUrl`) is what the 5 data-loading call
    sites now go through — reads `B91_BUNDLE_FILES` in bundle mode instead of `fetch()`.
  - **Behaviour change:** the live Google Sheet (F1) is **no longer attempted in bundle
    mode at all** (`loadData()`'s `!BUNDLE &&` guard) — it goes straight to the embedded
    CSV every time, even if the bundle happens to be hosted somewhere with internet. This
    trades away "bundle shows live sheet updates without re-exporting" for "bundle never
    makes a doomed network call and always shows a consistent snapshot" — a deliberate
    call for the offline use case, but worth knowing if someone *wants* live data in a
    hosted (non-file://) bundle again.
  - **WebGL textures are ALSO blocked under `file://` — a separate restriction from
    modules/fetch, found via a second direct test.** The pano sphere and the site-plan
    (drape) mesh both upload their image to a WebGL texture (`texImage2D`), and a texture
    sourced from a `file://` path is rejected as tainted/cross-origin **even from the same
    folder as `index.html`** — confirmed: `gl.texImage2D` on a locally-loaded `<img>`
    throws `SecurityError: ... contains cross-origin data`; the identical call with a
    `data:` URI succeeds. So these two (and only these two — everything else stays a
    plain `<img>`) also get base64-embedded: `build_embedded_images_json()` (server.py)
    reads `panoImage.file`/`groundImage.file` off a parsed `alignment.json`
    (`read_alignment()`, factored out of `do_bundle_check` and now shared) and embeds them
    as `window.B91_BUNDLE_IMAGES` (keyed by basename); `bake_bundle_html()` grew a 4th
    param to bake it in. `app.js`'s `assetUrl()` checks `BUNDLE_IMAGES[baseName(...)]`
    first and returns the embedded `data:` URI when present — every other `assetUrl` call
    is untouched since only these two filenames ever land in that map.
  - **Export-time flagging.** A menu item (video/pdf/tour/link/gallery photo) **or an
    amenity's `tour_url`** whose active content is a pasted URL rather than an uploaded
    file still needs internet no matter what. Two separate scans feed one combined list:
    `scan_menu_for_online_content()` walks the menu tree (each flagged entry:
    `id`/`title`/`contentType`/`url`/`"source":"menu"`); `scan_amenities_for_online_content()`
    walks `amenities.json` (amenities have **no upload alternative at all** for `tour_url`
    — a plain text field — so any non-empty value is inherently pasted; entries get
    `"source":"amenity"`). `read_alignment()`/`read_amenities()` are the shared
    best-effort-parse-or-`{}` helpers behind them. `do_bundle_check()` merges both scans;
    `GET /api/export-bundle-check?project=<id>` exposes the result; `exportBundle()`
    (app.js) checks before downloading. Non-blocking by design (admin can still export).
    **Deliberately NOT extended to a plot's own `tour_url`/`video_url`/`image_url`**
    (`plots.csv`) — a plot's tour link is *always* meant to point to an external 3DVista
    tour (this app's whole "storefront" design, see the top of this file), not a mistake
    the way an unflagged menu item or amenity link is; those two have a real "did you mean
    to upload instead?" choice, a plot's tour never offers one. Revisit if the admin
    actually wants plot links covered too — bigger addition (CSV + `media_json` parsing).
    **The admin-facing UI is a real popup, not a `confirm()`** (rebuilt same day after an
    initial pass shipped as just a text-list `confirm()` — noted here because that's the
    kind of thing worth not repeating): `#exportFlaggedModal` (`index.html`, same
    `.modal.custom-feature-modal` pattern as every other admin modal) lists each item with
    an **Edit** button. The button's `data-edit-source` (from each entry's `source`)
    decides where Edit goes — **this dispatch matters, don't collapse it**:
    `source==='menu'` → `openNodeBuilderModal(nodeId)` (the menu-item wizard, pre-loaded on
    that node); `source==='amenity'` → `setAdminTab('amenities')` + `selectAmenity(nodeId)`
    (switches to the Amenities tab and highlights/expands that one) — `openNodeBuilderModal`
    only understands menu-tree nodes, so calling it with an amenity id would silently open
    the wizard in "create new" mode instead of "edit existing." `showExportFlaggedModal(flagged)`
    (app.js, next to `exportBundle`) drives the popup, `Promise<boolean>`-based (`true`
    only on "Export Anyway"; Cancel and Edit both resolve `false`). A matching
    `noteIfExternal()` — called from `openModal()`, the one function that opens tour/video/
    image content for **both** plots and amenities, plus separately from
    `openClientVideoModal`/`openClientTourModal`/`openClientBrochureModal` for menu items —
    surfaces the same notice at watch-time (not wired into gallery photos or plain `link`
    items — both already degrade self-explanatorily; plot walkthroughs DO get the notice
    via `openModal` even though plots aren't part of the export-time flag list above — the
    runtime notice and the export-time flag list are two independent mechanisms with
    different scopes, by design). ⚠️ **Not interactively verified** — no browser-automation/
    eval tool was available this session, so this was checked via `node --check`, clean
    headless page-loads with no console errors, and direct hits on
    `/api/export-bundle-check` (both a throwaway test project, and the real `sample`
    project's actual data — confirmed its YouTube-linked amenity now comes back flagged
    with the right `id`/`url`/`source`). Actually clicking Edit/Proceed/Cancel (for both a
    menu item AND an amenity) in a live browser has not been done — do that before
    treating this as fully proven.
  - **Verified end-to-end, this rebuild:** exported the real `sample` project (1 plot, 11
    landmarks, 3 amenities, a real menu tree — **at the time, only the menu tree was
    scanned**, and none of ITS items were URL-backed, so `flagged: []` was correct for
    that narrower check; the project's amenities turned out to have a URL-backed tour,
    caught by the later amenity-scan fix above), unzipped it, opened its `index.html` via
    a literal `file://` URL in headless Edge with
    **no server running at all**: zero console errors, a real
    `<canvas data-engine="three.js r160">` (proves `window.THREE` + scene init), landmark
    banner DOM rendered, header read "1 plots · project sample" (plots.csv loaded from
    embedded data, sheet-skip path taken correctly). A **second pass, same day**, added
    the `B91_BUNDLE_IMAGES` fix above and re-verified with an actual **screenshot** (a DOM
    dump can't show WebGL canvas pixels) of the re-exported bundle opened the same way —
    the aerial pano now renders correctly with landmarks/menu overlaid, no console errors.
    The prior verification (served from
    a plain `python -m http.server`, no API, 30 plots + 7 landmarks + 2 amenities + brand
    render) still applies unchanged for that hosting path. One pre-existing benign 404
    unrelated to this change: the sample project's `alignment.json` references a
    `logo.web.png` not on disk → brand falls back to initials.
- **Mobile responsiveness pass** (2026-09-02) — **partial; the parts differ in how solid
  the evidence is, don't collapse this into "mobile: done."**
  - ✅ **Client, verified by screenshot** (via the bundle-export headless workaround — see
    **Conventions & gotchas**), across all three of portrait/landscape/desktop: category
    drawer defaults collapsed on portrait only, open on landscape and desktop
    (`isMobilePortrait()`); landmark/amenity labels stay at their true position and hide
    rather than clip at the edges (`renderLandmarks`/`renderAmenities` — they DID clamp
    inward until 2026-09-03, see the code map); a landmark density cap + "+N more" hint applies
    on **both** portrait and landscape (`isMobilePortrait() || isMobileLandscape()` —
    landscape genuinely needs it too, confirmed by screenshot, not just portrait);
    `.sync-meta` truncates instead of overflowing; portrait visitors get the animated
    `#rotateHint` overlay (a plain toast until 2026-09-03); desktop confirmed byte-for-byte
    unaffected (all landmarks uncapped, full topbar text, no hints, at 1400×900).
    **Landscape follow-up, same day:** `.topbar` (brand/legend/sync/Refresh) is now hidden
    entirely in landscape (client only — `body:not(.is-admin)`), replaced by the floating
    `#zoomStatusGroup` pills (bottom-right, inside `.zoom-controls`) carrying all three
    status filters — confirmed by screenshot at 844×390, with desktop and portrait
    re-confirmed unaffected.
  - ❓ **Admin, reasoned from code only, NOT visually verified** — no reliable way to
    headlessly screenshot admin mode was found this session (see the gotcha entry): the
    menu-item wizard's type-picker grid drops to 2 columns at `≤480px`. A human should
    click through admin on an actual phone before this is called solid.
  - ❌ **Known, deliberately unaddressed:** the density cap reduces landmark-vs-landmark
    overlap, it doesn't eliminate it — labels that stay visible can still overlap each
    other somewhat, confirmed in both portrait and landscape verification screenshots.
    Real collision-avoidance (or clustering into a "+N" badge) was discussed and
    explicitly not chosen for this pass. The trace/import polygon-tracing editor
    (touch-tracing plot boundaries on a phone) and the landmark/amenity admin panels'
    internal editor forms were not audited.
- **Multi-Attachment Plot Media Support (3D Walkthrough / YouTube / Image)** (added 2026-08-22):
  Admins can now attach **multiple media items** (3D Walkthroughs, YouTube videos, Image URLs, local uploaded photos) to a single plot inside **Import & Trace** (`refreshTraceList`).
  Features a full inline multi-media item list manager with type selectors (`🌐 3D Tour`, `▶ YouTube`, `🖼 Image`), custom labels, URL inputs, local file upload (`＋ 📁 Upload Image…`), and instant `👁` preview buttons.
  On the client Plot Info Card, **all attached media options** render as distinct action buttons (e.g. `🌐 Walk through this plot →`, `▶ Watch YouTube Video →`, `🖼 View Photo →`).
  `parseMediaType` & `getPlotMediaList` seamlessly handle YouTube embed conversion, image lightboxes, and 3D tour iframe rendering.
- The user actively publishes real sites via server-side save (their data — don't clobber it).
- **Panoramic virtual tour (multi-node + hotspot navigation + WebXR)** — planned
  2026-09-02, **nothing implemented**. A living phase-wise plan lives in
  **[VIRTUAL-TOUR.md](VIRTUAL-TOUR.md)**: replace 3DVista with our own multi-node tour
  engine, reusing the landmarks system as the hotspot layer. The panos are **3D renders**,
  so a render-supplied **depth pass** makes a real parallax "glide" transition feasible
  (no photogrammetry). Phase 0 is a throwaway validation spike, gated on the 3D team
  supplying depth + camera transforms (OQ-1). ⚠️ Open tension: eyeballed node placement is
  incompatible with the glide — see D-1 in that doc. **Read VIRTUAL-TOUR.md before touching
  anything tour-related, and update it in the same turn as any tour work.**
- **Client offline layer / PWA** (added 2026-09-02, extended 2026-09-03, see CHANGELOG for
  the full breakdown) — minimal service worker (`sw.js`) + `manifest.webmanifest` + ONE
  combined "Add to Home Screen" + save-for-offline banner (originally two separate
  prompts, merged 2026-09-03 per explicit user request once real testing made the
  back-to-back feel redundant), built as the concrete next step of the mobile-offline
  initiative so there's something real to demo. A free Cloudflare quick tunnel
  (`cloudflared`, portable exe, not installed as a system tool) is the current stand-in for
  real hosting, fronting the already-running `server.py` for phone testing — throwaway,
  gets a new random URL every restart, dies when the process/session ends; a fresh restart
  has been needed multiple times this session specifically to get a clean
  `localStorage`/service-worker slate for retesting after a bug fix (the SAME tunnel
  domain otherwise carries forward stale flags/cache from the previous, buggier test).
  **Real bugs found via real-device testing (iPhone + Android), all fixed same day
  (2026-09-03):** the Brochure PDF fell back to serving the whole app shell offline
  (iframe navigations weren't routed as data); gallery photos/PDF/video weren't available
  offline unless each one had specifically been opened while online first (→ the eager-
  download feature); a failed download still counted as "100%/Done" with no way to tell
  it apart from a real success, and always marked the project "saved" even on partial
  failure, blocking any retry (→ honest per-item failure tracking, `"N/M saved"`, and the
  saved flag only sets on full success); the install banner never actually disappeared
  after Add/✕ (a `[hidden]` CSS specificity bug — see **Conventions & gotchas**); the
  install banner also showed on desktop, because `maybeShowInstallBanner()`'s own
  independent `beforeinstallprompt` trigger bypassed the mobile gate that only lived at
  the registration call site (fixed properly by removing that independent trigger
  entirely when the two banners were merged into one). **Still open:** a real
  offline-after-cutoff test of the CURRENT merged-banner flow specifically (each fix so
  far has needed at least one more round after "verified" — treat any single confirmation
  from the user as provisional until they've gone through the full add-to-home-screen →
  airplane-mode → browse-everything sequence without hitting a new issue), and exercising
  the video byte-range caching path (`sw.js`'s `respondVideo`) against a real seek/replay.
  The per-project
  `manifest.webmanifest` limitation (static/generic, not per-`?project=`) is intentional —
  see the 2026-09-02 CHANGELOG entry for why it doesn't matter for the actual planned
  rollout (per-project standalone bundle hosting has no multi-project ambiguity).
- **Virtual tour — Phase 1 STARTED (2026-09-08).** Owner signed off the spike and chose
  crossfade + drag-to-place + separate-tours-from-menu (see VIRTUAL-TOUR.md decisions).
  **Step 1 done & verified:** `tour.json` data model (many tours/project) + a 4th admin
  **Tour** tab that creates tours and uploads/manages node panoramas, with full
  session/export/boot persistence (verified round-trip on a throwaway project: save → disk
  `tour.json` + node images → session-discarded reload restores).
  **Steps 2–5 built later the same day** — client crossfade **viewer** (D-11 takeover),
  **hotspot authoring** (drag-to-place + retarget/relabel/delete, inside the viewer),
  per-node **start view**, **`panotour` menu type** → `openClientPanoTour(tourId)`, and the
  **LRU + one-hop prefetch** texture lifecycle. Also fixed a data-destroying bug (every
  saved node pano was a 15-byte `[object Object]` — see gotchas) and closed the 1.7 bundle
  gap (`tour.json` + node panos now embedded; `server.py` accepts tour-only projects).
  ⚠️ **Verified statically only** — `node --check`, `ast.parse`, helper/CSS/id
  cross-checks, `/api/projects`, and a real exported bundle inspected for embedded tour +
  9 panos. **The visual behaviour (crossfade, hotspot placement, takeover/restore) has NOT
  been confirmed in a browser** — no browser tooling was available that session. Treat the
  user's first run as the real test.
  **Demo to test against:** `/?project=panotour-demo` (client, menu → *3BHK WALKTHROUGH*)
  and `/?admin=1&project=panotour-demo` (Tour tab → *Open tour to place hotspots*). Seeded
  by `spike/seed-demo-tour.py`; its hotspot directions are **evenly spread, not surveyed**
  — they need dragging onto real doorways. Raw PNG masters live in
  `projects/panotour-demo/_source/` so they stay out of bundles.
  **Still open in Phase 1:** info hotspots (1.8). Phase 2 (depth glide) remains deferred.
- Suggested next (after the tour viewer): **ROADMAP Feature 3** (enquiry/lead capture) — see
  [ROADMAP.md](ROADMAP.md). Also outstanding: a client-side **"Load site folder…"** picker —
  not built.

## Documentation discipline

**After every meaningful change, update the docs in the same turn** so the next agent
(or a fresh account) inherits accurate context. Use the project skill
**`keep-docs-current`** (`.claude/skills/keep-docs-current/`) as the checklist. In short:
1. **[CHANGELOG.md](CHANGELOG.md)** — append an entry for *every* change, as it happens
   (what changed, why, files touched). Newest entry on top.
2. **This file** — refresh the code map, gotchas, and *Current status* if you added/
   moved/renamed anything or changed how to run/verify.
3. **[README.md](README.md)** — update the user-facing feature description.
4. **Inline comments** — keep the "why" next to non-obvious code.
5. Do it **before ending the turn**, not "later." Treat undocumented changes as
   incomplete.
