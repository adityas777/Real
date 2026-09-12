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
  `vendor/three.global.js` (module→global rewrite of `three.module.min.js`, the minified
  build — see the load-time gotcha below for why `module_to_global` has to reformat each
  export item rather than splice the raw list) — plus the
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
- **`_serve_static` gzips text-ish responses on the fly** (2026-09-11, load-time work):
  `GZIP_MIME_PREFIXES` (`text/*`, JS, JSON, the manifest, SVG) above `GZIP_MIN_BYTES`
  (1KB), only on the plain full-file path — the byte-range/streaming path for large media
  is untouched (gzip+Range together is real complexity for zero benefit, since media is
  already-compressed). Falls back to uncompressed for a client that doesn't advertise
  `Accept-Encoding: gzip`. `/vendor/*` also gets `Cache-Control: public, max-age=
  31536000, immutable` — the one class of asset genuinely safe to cache hard, since these
  are third-party libraries never edited in place (a version bump = a new filename).
  Everything else stays `no-cache` (`app.js`/`styles.css`/`index.html` are already
  cache-busted via their own `?v=` query string anyway; project content and admin-editable
  data genuinely change and must never serve stale).
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
  **Scoped to the aerial view only, 2026-09-10**: `isAerialSectionActive()`/
  `updateLegendVisibility()` hide both the header legend and `#zoomStatusGroup` (an
  `.is-hidden` class, not `[hidden]`) whenever the visitor isn't on the base plot map —
  browsing LANDMARKS, inside a VIRTUAL TOUR, or drilled into any other menu folder. Checked
  structurally (`!state.tourView && catLevel2 hidden && menuNavStack empty`) rather than a
  separately-tracked flag. The old top-bar "N plots · project · synced HH:MM:SS" +
  Refresh button (`setSync`/`refresh`) was removed the same day — it had no `is-admin`
  scoping and showed on both sides; there is no replacement, it was a plain removal.
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
  and drives the camera via `landmarkClusterCentre(dirs, LANDMARK_HFOV)` + `animateCameraTo`.
  **The camera SETTLES and HOLDS, matching the reference tour exactly** (2026-09-07,
  replacing an earlier continuous sweep) — confirmed by reading the reference's own player
  runtime (tdvplayer.js), not just its exported data: a sequence's `repeat` property
  defaults to 1 when unset, and none of Eleganza's category sequences set it, so each one
  plays its one movement (a small drift) ONCE and stops; there is no perpetual loop
  anywhere in it. Framing is constant — `LANDMARK_HFOV` (110, the reference's own hfov)
  converted to vertical FOV per the live aspect ratio via `vfovFromHfov()`, aimed at the
  category's tightest cluster of landmarks (measured against the reference's own hand-set
  angles: 12.1° mean error, versus 20.8° for a bounding-arc midpoint that lands 52° out on
  a category with one far-flung outlier). `state.landmarkPanRange` is set to a small
  ±`LANDMARK_SWAY_HALF` arc around the settled shot — idle auto-pan in `renderLoop` checks
  `!state.landmarkPanRange` and does nothing at all while it's set, so the range now exists
  ONLY as what a manual drag releases from, not to drive any motion of its own.
  **Trade-off, by design, matching the reference's own:** a category wider than 110°
  (Connectivity 140°, Commercial 144°) leaves an outlier landmark outside the automatic
  shot — the reference's hand-picked shots don't guarantee full coverage either, and the
  outlier stays reachable by dragging.
  `updateCamera` hard-clamps `state.view.lon` into
  `landmarkPanRange` for non-admin — the single choke point that keeps the client from
  ever drifting outside the selected category's arc. **The clamp is gated on
  `!cameraAnimTimer`, and that gate is load-bearing:** `applyCategoryFilter` installs the
  range and *then* starts the fly-in, which necessarily begins outside it, so clamping an
  in-flight animation pinned every frame to the range boundary — the camera cut to the
  destination on frame 1 and froze there while only the FOV animated (measured 2026-09-04:
  15-70 degree instant jumps, 22-29 of 36 frames frozen, on 5 of 6 real categories). The arc
  lock bounds where the view may WANDER; it must not fight the animation delivering it
  there.
  `meanDirection(dirs)` is the shared centroid-direction helper (still used for latitude:
  the tightest-cluster aim only picks longitude, so pitch comes from the mean of the
  category's landmarks). Selecting 'ALL', leaving
  Landmarks, **or the visitor's first real drag** (>6px, in `wireViewControls'` look-around
  branch — added 2026-09-03) sets `state.landmarkPanRange = null`, releasing the clamp back
  to free-spin; the drag case also cancels any in-flight `cameraAnimTimer` so the fly-in
  can't yank the view back mid-gesture. The auto-framing is a helpful default, not a cage —
  but note the category FILTER (`state.selectedCategory`) is deliberately NOT cleared by
  that drag, so the chosen landmarks stay highlighted while the visitor looks around.
- **Compass** (client only, `body.is-admin` hides it): `updateCompass()` runs each
  frame from `renderLoop`. **The rose is FIXED and only `#compassCone` rotates** — north stays
  at the top and the shaded cone shows where the camera looks, as the reference does; an
  earlier version rotated the rose and had to counter-rotate every letter, which is both
  more code and harder to read. Heading negates `state.view.lon` (camera yaw vs stored lon, see the
  two-conventions gotcha) then subtracts `state.northDeg`, which lives in `alignment.json`
  and defaults to 0 — **the compass is uncalibrated until that is set**; the reference's
  3DVista compass exports no north value so it could not be derived.
  **Redesigned 2026-09-10** into a frosted-glass look (`.compass` gets `backdrop-filter:
  blur(...)` + a radial-gradient face highlight, `.cp-*` colors moved to translucent
  `rgba(...)`) with thinner needle-style rose points and an inboard, smaller label
  layout, matching a reference nautical-rose image — labels alone stay opaque navy +
  white halo on purpose (they sit over an unpredictable live pano, not a plain page).
  **The directional pad was removed 2026-09-10** ("remove this," from a screenshot) —
  drag/flick is the only look-around input now. `stepViewMotion()`/`state.viewVel` survive
  purely for **drag inertia**: `wireViewControls`'s pointerup handler seeds `viewVel` from
  the gesture's speed (capped) so a flick coasts, decaying via the same frame-rate-
  independent easing the d-pad used to chase a held-button target with — with no target
  left to chase, `stepViewMotion` just decays whatever velocity a flick left behind
  toward zero. `renderLoop` gates the idle auto-pan drift on `stepViewMotion`'s return
  value (`steering`) so a coasting flick and the idle drift can't both write
  `state.view.lon` in the same frame. **Never write `textContent` on the audio
  button** — it holds an inline SVG and the on/off halves swap via `is-active`; assigning
  text wipes the icon (it did).
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
  (inline edit incl. render-image picker, plus the per-row show-by-default control).
  **`setAllLandmarksFeatured` and the live `#axLmCount` are effectively dead code as of
  2026-09-09** — their only UI (the intro paragraph, ✓/✕/× legend box, and ✓ Show all /
  ✕ Hide all bulk row) was removed wholesale at the user's request (the legend had gone
  stale the moment the per-row control became a switch, since it described the button pair
  it replaced) — `els.axLmShowAll`/`axLmHideAll`/`axLmCount` are still declared and
  null-safely wired, so nothing errors, but there is currently no way to reach bulk
  show/hide from the UI. Re-add a row for them if that's wanted back. **The per-row control
  is a `.ui-switch` (ON/OFF), not a single state-showing button** — everything starts
  featured, so a single button reading its own current state reads as "tick the ones you
  want" and inverts the admin's intent (it did, on the day it shipped, 2026-09-04). It
  shipped as a ✓/✕ button PAIR to fix that (two buttons, each idempotent), then moved to
  this switch 2026-09-09 to match the admin menu builder's built-in-row control — same
  fix, expressed as one control instead of two, since a switch's thumb position is just as
  unambiguous as two separate buttons. `setLandmarkFeatured` still early-returns when the
  value wouldn't change (though a real checkbox's `change` event can't even fire a no-op
  from user interaction). Whatever the widget, it sits beside, and must never be confused
  with, the × delete,
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
  `tourTween` is the easing helper. **Every arrival (not just `instant`) now snaps to the
  room's own saved `defaultView`** (2026-09-11 — heading is no longer carried across
  nodes, a deliberate reversal of the original design) — the snap runs BEFORE the texture
  swap/crossfade, not after, so the fade plays out at one stable angle instead of the old
  angle then a jarring cut. **Texture lifecycle:** `tourTex` LRU (`TOUR_CACHE_MAX = 3`) +
  `tourTouch`/`tourEvict`/`loadTourNodeTex`/`prefetchTourNeighbours` (one hop) —
  download weight and GPU residency are separate problems (see gotchas).
  **Hotspots:** `rebuildTourHotspotDOM`/`renderTourHotspots` (projected each frame from
  `#tourHotspots`, same model as landmarks), `startTourHsDrag`/`onTourHsDragMove`/
  `endTourHsDrag` (drag-to-place), `addTourHotspot`/`deleteTourHotspot`/
  `setTourNodeDefaultView`. **Room navigation lives in the drawer** (2026-09-11,
  replacing the old floating `#tourBar`/`refreshTourBar`): `tourRoomPickerNode(tour)`
  builds a synthetic parent (rooms + a trailing "Exit Tour" row) rendered by the generic
  submenu system; `refreshTourRoomMenu()` just toggles `.is-active`/`.is-busy` on its
  existing buttons to track the live room/in-flight jump.
  **`openClientPanoTour(tourId, title, {anchorRooms=true})`** — `anchorRooms:false` (only
  used by the root VIRTUAL TOUR click when 2+ tours exist) anchors the drawer at the
  tour-list level instead of drilling into the opened tour's own room list, while STILL
  auto-playing it — the root click behaves like any other multi-child folder (show my own
  children) while not leaving the visitor staring at an empty picker. `openVirtualTourPicker`
  was removed the same day (2026-09-11) once nothing called it directly any more.
  **A tour with only ONE room never gets `tourRoomPickerNode` pushed at all** (also
  2026-09-11, `resolveFolderTarget`'s "one thing inside is never a choice" rule applied to
  rooms) — lands at the tour list if 2+ tours exist, or the bare ROOT menu if this is the
  only tour. **The root menu can carry its own "✕ Exit Tour" row** (`renderClientSidebar`'s
  stack-length-0 branch + `wireClientSidebarButtons`, `data-node-id="__exit_tour__"`) for
  exactly that last case — a single-tour/single-room project has no picker level left to
  put an exit on. `withExitTourRow(children)` appends the row `if (state.tourView)`,
  shared by `virtualTourPickerNode` and `tourRoomPickerNode` so it's never duplicated
  logic across the two.
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
- **Boot `init()`** — loads geometry → alignment (session>draft>file) → menu tree known →
  **`computeAutoOpenTarget()` decided, `'node'` targets fired** → pano/three → drape →
  data → landmarks → **`'landmarks'` target fired** → amenities → tours →
  **`'panotour'` target fired** → `initProjectBar()` → `registerOfflineSupport()`.
  The client's "default screen" (added 2026-09-09, retimed the same day — see below):
  whatever the literal first row of the client menu would do on a real tap (a built-in row
  if enabled, else the first authored item) fires automatically, reusing
  `openLandmarksCategoryPicker`/`activateMenuNode` rather than new per-content-type logic.
  **Split into decide (`computeAutoOpenTarget`, called once right after
  `renderClientSidebar()`) and fire (`fireAutoOpen`, called from THREE separate points in
  `init()`) because different targets need different data ready before they can act** — a
  plain content item or folder drill needs only the menu tree (fires immediately, before
  the pano even starts loading); `'landmarks'` needs `state.landmarks` (fires right after
  `setLandmarks`); `'panotour'` needs `state.tours` (fires right after `setTours`). Firing
  all three from one end-of-boot call — the ORIGINAL implementation — visibly showed the
  boot's default pano view for however long the rest of the data took to load, THEN
  jumped, which read exactly like "aerial shows first, then switches" even when aerial
  wasn't the configured target at all. Retiming (above) shrank that window but could not
  close it — **the pano renders the instant its texture decodes, on a completely
  different clock from whichever fire point applies**, so there was always some gap,
  however short, with nothing to hide it. **`#bootCurtain`** (`index.html`/`styles.css`,
  a solid full-viewport div, `z-index: 999999` — above modals too) is what actually closes
  it: it covers everything from first paint, and `hideBootCurtain()` (idempotent) is
  called at exactly the same point each target's fire call already happens — right after
  `initThree()` for a no-op/`'node'` target (which already fired pre-pano), alongside the
  `'landmarks'`/`'panotour'` fire calls otherwise, plus an unconditional safety-net call at
  the end of the success path AND in the `catch` block so a boot error or a gap in the
  kind-matching can never strand a visitor behind it. **If this needs touching again,
  keep every new fire point paired with its own `hideBootCurtain()` call at the same
  point — reveal-timing drift is exactly the bug this fixes.** **Deliberately a no-op
  when AERIAL VIEW is the top row** — its click action resets the camera to a computed
  overview, a DIFFERENT view from the admin's saved WYSIWYG boot shot, and aerial ships
  enabled by default on every project, so firing it
  unconditionally would have broken WYSIWYG boot for everyone. Don't "fix" that branch to
  also fire the camera reset — the boot view already is the intended default screen
  whenever aerial is on top.
- **Boot progress bar (2026-09-10)**: the pano AND the ground-drape site-plan image
  (`groundImage` — the actual "plot layout trace" visual) are now pre-fetched as plain
  Blobs **in parallel** (`Promise.all`) via `fetchBlobWithProgress`, which streams each
  fetch's body and reports real `Content-Length`-based byte progress into
  `setBootProgress()` (an 8–98% weighted range shown on `#bootProgressWrap` inside
  `#bootCurtain`, monotonic — never regresses). Previously `loadGroundImage` only ran
  (and only started its own untracked fetch) AFTER `initThree()` had already revealed the
  curtain, so a large plan image visibly popped in over an already-settled pano with no
  loading indication at all — parallelizing the network wait, not just adding a spinner,
  is what actually closed that gap. `loadGroundImage` itself still must run after
  `initThree()` (needs the live `three` scene) but now gets an already-downloaded Blob's
  object URL, so what's left there is a fast local decode. `hideBootCurtain()` sets
  progress to 100% and hides `#bootProgressWrap` for good the first time it fires
  (`bootProgressDone`) so its later reuse for tour-to-tour switching shows the plain
  label only, not a stale bar.
- **Offline support (PWA), client + MOBILE only** — `registerOfflineSupport` (registers
  `sw.js`, no-ops (and actively unregisters/clears any prior registration) if
  `state.admin`, unsupported/insecure origin, OR `!(isMobilePortrait() || isMobileLandscape())`
  — desktop is out of scope on purpose, since it already has a real offline mechanism via
  Export standalone site; `navigator.serviceWorker.ready` is raced against a 5s timeout so
  a stalled activation can't wedge the rest of boot), `isStandaloneDisplay`. **Called at
  the very START of `init()` (2026-09-12, still fire-and-forget/non-blocking) — it used to
  live at the very END**, after every boot-critical project file (alignment/plots/
  landmarks/amenities/tour) had already been fetched. A service worker only intercepts
  fetches once it's active AND controlling the page, so with the OLD placement none of
  that config was ever cached on a genuine first visit — confirmed with a real offline
  reload in a real browser: the menu collapsed to just the 3 built-in rows (the only
  things that don't depend on `menuConfig`), every authored item/landmark/tour gone.
  Registering as early as possible instead gives the worker the best realistic chance of
  already controlling the page before those fetches fire — not a 100% guarantee on a
  very first, very slow-network visit (the worker's own install competes for the same
  bandwidth), but every visit after the first is fine either way, and this makes the
  first one far more likely to succeed too. Top-level `beforeinstallprompt` listener only
  captures `deferredInstallPrompt` — it does NOT show anything itself (used to,
  independently of the mobile gate — see **Conventions & gotchas** for why that was a
  real bug). The actual cache logic lives in **`sw.js`** (separate file, not part of the
  `app.js` module — see its own header comment for the full design: three caches,
  cache-busting-aware key normalization, admin passthrough, byte-range-aware caching for
  anything read via HTTP Range — video, audio, AND PDFs, since pdf.js reads a PDF
  progressively via Range requests exactly like a media element (`isRangedCacheablePath`,
  `respondRangedAsset` — renamed 2026-09-12 from their original video-only names once
  PDFs needed the same treatment; see **Conventions & gotchas**) — and project-asset
  navigations — an `<iframe>` loading a PDF counts as a navigation too — routed as data,
  not a page load).
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
  **`warmOfflineConfigCache()` exists because a first visit can't cache its own config.**
  The worker only intercepts fetches once it controls the page, and on a genuine first
  visit it is still installing while boot fetches `alignment.json` and friends — so none of
  it caches, and the next offline load shows only the built-in rows (no authored menu items
  at all). Measured 2026-09-12: a visitor who declined the banner and visited once had the
  full 43.7MB video cached and *no menu row left to reach it with*; a second online visit
  fixed it by itself, which is why it hid for so long. So once registration reports ready,
  the ~30KB of config is re-requested to force it into the cache. Keep it to the small
  files — the pano/site-plan are megabytes and belong to the "Add" download. **Verifying
  offline VIDEO: `readyState: 4` is not proof of playback** — it only means data is
  buffered. Check that `currentTime` advances against wall clock, and seek deep into the
  file (e.g. 130s of 138s); seeking is the only thing that really exercises
  `respondRangedAsset`'s cached-Range slicing.
  **Cold-load latency lives almost entirely in project IMAGES, not code** (profiled
  2026-09-12 at 9 Mbps/60ms/4× CPU with the SW blocked, which is the only honest way to
  measure a first visit). Baseline was 29.1s to usable / 27.2MB, and app.js + three.js +
  styles together were under 350KB of it — three images were the whole critical path.
  Fixes: a 4.8MB `Demo.web.jpg` hard-coded as `src` on `#clientContactImg` in `index.html`
  (downloaded every visit, never shown, since `openClientContactModal` always reassigns
  `img.src` — don't put a `src` back on that tag); the ground overlay PNG→WebP (17.0→2.5MB,
  RGBA with real alpha so WebP not JPEG); and the pano JPEG→WebP (5.2→2.7MB). Result 9.1s
  / 5.6MB. **When a project feels slow, profile the images before touching the code.**
  Note `PANO_TEX_CAP` is 8192 but `loadPanoTexture` downscales to `gpuMaxTexSize()` (4096
  on most mobile GPUs) — phones download the full-width pano and discard half of it; a
  4096-wide mobile variant is the next available win but needs `collectOfflineAssets`, the
  admin save path and the export bundle to agree on it.
  **`collectOfflineAssets()` must walk `state.tours` too** — added 2026-09-12 after a
  strict audit found all 17 of this project's virtual-tour room panoramas returning 503
  offline. A tour room's pano is only requested when that specific room is opened, so
  runtime caching never picks them up either unless someone walks every tour online first;
  leaving them out of this list made VIRTUAL TOUR the one headline feature that stayed
  broken with no signal (list opens, every room is a blank sphere). If a new content type
  is added that loads media lazily, it belongs in this walk.
  **Verifying "does it work offline" — read this before writing another test.** Three
  separate false failures came out of one audit: the boot curtain clears via
  `classList.add('is-hidden')` (not `'gone'`); `readPixels()` on three.js's canvas is
  ALWAYS blank because the renderer runs without `preserveDrawingBuffer`, so pixel-sampling
  the WebGL context proves nothing (screenshot the composited page instead); and **a
  PORTRAIT phone viewport shows the "Rotate your phone" overlay instead of the map**, so
  any visual check has to run landscape (844×390) or it is just measuring that overlay.
  Also, a single-node tour renders no `.tour-hs` hotspots — detect a running tour by the
  drawer's `✕ EXIT TOUR` row instead. And a fresh Playwright context starts with EMPTY
  storage, so the download must actually be run in the same context before going offline;
  otherwise the test proves only that an empty cache is empty.
  **Registration is early, the BANNER is late — never re-fuse them** (2026-09-12, a real
  bug with a nasty signature). `registerOfflineSupport()` runs at the TOP of `init()` so
  the worker can cache boot fetches, and returns whether the worker became ready;
  `offerOfflineSaveAfterBoot()` runs at the END of `init()` and is what actually shows the
  banner. They were briefly fused (the banner was offered from inside
  `registerOfflineSupport`), which meant the banner raced boot — and
  `collectOfflineAssets()` reads `state.menuConfig`/landmarks/amenities/tours, none of
  which exist that early. When the worker won the race, the banner offered a **19KB**
  download (just the unconditional config files) instead of the real **230MB** one, and
  tapping Add cached the config and nothing else: menu present offline, every video/image/
  PDF behind it missing. It presented as "video and images randomly stopped working
  offline," was intermittent (it depended on connection speed and whether the worker was
  already installed), and looked nothing like a boot-order problem. If the offline
  download ever reports an implausibly small size, check WHEN the banner ran, not what it
  downloaded.
  **The content caches are deliberately NOT version-namespaced** (`b91-data`, `b91-media`
  — only `b91-shell-<VERSION>` is). `activate` deletes every cache outside the current
  set, so while they were versioned, any `VERSION` bump wiped a visitor's entire ~200MB
  download; the v7→v8 PDF bump did exactly that in production. `migrateLegacyContentCaches()`
  folds any older `b91-data-v*`/`b91-media-v*` forward on activate, copying only complete
  `200` entries so old corrupt partials are dropped rather than preserved. Don't "tidy" the
  content caches back under `VERSION`.
  **`app.js`'s `SW_VERSION` constant must be bumped in lockstep with `sw.js`'s `VERSION`
  — a real bug found 2026-09-12, not just a theoretical risk.** `SW_VERSION` namespaces
  the banner's dismissal memory (`b91-offline-declined-${SW_VERSION}-<pid>` /
  `-saved-${SW_VERSION}-<pid>` in `localStorage`); its own comment says "must match
  VERSION in sw.js," but it sat hardcoded at `'v5'` through three later `sw.js` version
  bumps (`v6` the three.js swap, `v7` the video priming fix, `v8` the PDF fix) before
  anyone noticed — meaning any earlier tap of "Skip" (or a completed download) stayed
  permanently recorded under the stale key, silently preventing the banner from EVER
  showing again on that browser/project, regardless of how much the underlying caching
  code changed afterward. Found because the user asked "why can't I see it" after the
  PDF fix — don't assume a missing banner means the feature broke; check this constant
  first.
  **Separately — a more alarming discovery made while fixing the above, worth its own
  warning**: the on-disk working copy of `sw.js`, `app.js`'s `registerOfflineSupport()`
  call site, and this file's own PDF-fix documentation were all found to have REVERTED
  to an earlier state than what was actually committed in git — with no edit tool call
  responsible. `sw.js` on disk had gone back to the pre-PDF-fix code
  (`respondVideo`/`isRangedMediaPath`/etc.) even though `git show <last-good-sha>:sw.js`
  proved the correct, renamed, version-bumped code really had been committed correctly
  earlier the same day. This repo lives under a Windows user's Desktop folder, a path
  OneDrive syncs by default on many Windows setups — the most likely (though
  unconfirmed) mechanism. **The lesson: an edit tool's own "file state is current in
  your context" assumption is not proof the disk agrees** — if a fix that was previously
  verified and committed appears to be missing again, diff the live file against the
  relevant commit (`git show <sha>:<path> | diff - <path>`) before concluding the code
  regressed and re-deriving the fix from scratch.

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
`activateMenuNode`/`openNodeContent`/`openClientVideoModal` all take an **`autoOpen`**
flag (added 2026-09-09, threaded through from `fireAutoOpen` — see the boot section) that
a real click never sets. **A click IS the user gesture browser autoplay policies require
for unmuted playback; the boot-time auto-open path has none, so an unmuted `play()`/
`autoplay=1` there is silently rejected and the video just sits paused** — invisible in
code, since the rejection is swallowed by `.catch(() => {})`. `openClientVideoModal` sets
`player.muted = !!autoOpen` (unconditionally, since the element is reused across opens —
a later manual open of a DIFFERENT video must not inherit a stale mute) and
`getYoutubeEmbedUrl`/`getVimeoEmbedUrl` gained a `muted` param appending the platform's
real mute query param, only when true. If any other content type ever needs to know
"opened with no gesture behind it," it already has this flag threaded all the way down —
extend its handling there rather than adding a parallel mechanism.

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
  cache-busted by `_ver`). It is NOT re-encoded on import. `menuConfig.tree` (see the code
  map's Virtual tours / drawer sections) can contain, alongside ordinary authored nodes,
  up to two nodes carrying `builtin: 'aerial'|'landmarks'` and `enabled` (added
  2026-09-09, replacing an earlier separate `menuConfig.builtins` block on the same day —
  see the gotcha below) — these are AERIAL VIEW/LANDMARKS, movable and renameable exactly
  like any other node; `ensureBuiltinNodes()` injects them if missing and self-heals if
  one is ever lost.
- **`landmarks.json`** — `{ version, landmarks:[{ label,distance,driveTime,icon,
  category, featured, render?{file}, hotspot{lonDeg,latDeg}, banner{lonDeg,latDeg} }] }`.
  **`category`** (added 2026-09-07) is an explicit group name and is **authoritative** —
  `isLandmarkMatchCategory` short-circuits on it, so the icon/keyword rules below it only
  apply to landmarks that carry none. Needed because a landmark's icon can imply a
  different group than the one it belongs to (D Mart is a `mall` but files under
  LIFESTYLE), and without the short-circuit it would show up in both. `render` is
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
- **THREE menu content types now say "tour" — don't merge any of them.** `tour` = an
  **external** 3DVista/Kuula tour iframed from a URL or uploaded file
  (`openClientTourModal`). `panotour` = an authored item pointing at **one specific** tour
  in this project's `tour.json` by id (`content.tourId`, via `openClientPanoTour`).
  **`virtualtour`** (added 2026-09-09) = the built-in VIRTUAL TOUR row (`node.builtin ===
  'tour'`, see `ensureBuiltinNodes`/`BUILTIN_DEFS`) — auto-discovers WHATEVER tours
  currently exist rather than pointing at one: zero → a notice, one → opens it directly,
  2+ → `openVirtualTourPicker()` (a synthetic-children submenu, the tour-flavoured sibling
  of `openLandmarksCategoryPicker`). Deliberately not reusing the `'tour'` contentType name
  for this — that would have collided with the external-iframe type in `openNodeContent`'s
  dispatch.
- **Tour hotspots use the STORED lon convention** (`lonLatFromDir`/`dirFromLonLat`), like
  landmarks and amenities — *not* the camera-yaw convention. See the two-conventions note
  above `computeHome`. `defaultView`, by contrast, stores a **camera** lon/lat, because it
  is assigned straight into `state.view`. Mixing them mirrors placement horizontally.
- **Every arrival at a tour node snaps to that node's own saved start view (2026-09-11,
  explicit request) — there is no more "heading continuity."** `tourGoTo` used to apply
  `node.defaultView.lon/lat/fov` to `state.view` only when `instant` was true (a fresh
  entry from the aerial map); a hotspot click, the room-strip thumbnail, and the admin's
  own node-list click all call it with `instant: false` and used to just carry the
  visitor's current look direction over unchanged, on the theory that walking through a
  doorway shouldn't spin the camera under them. That gate is gone: the view-set is now
  unconditional, right after the crossfade (or hard swap) completes, so it reads as a cut
  to the configured direction rather than an animated pan. If "heading continuity" is ever
  wanted back for a specific path (e.g. only hotspot-to-hotspot walking), it needs to be
  reintroduced deliberately, not assumed — this was a real, requested behavior change, not
  a bug fix. **The view-snap runs BEFORE the texture swap/crossfade, not after** (fixed
  same day) — it originally ran after `await tourTween(...)` completed, which meant the
  whole ~460ms crossfade played out at the visitor's stale old angle and only hard-cut at
  the very end ("shows a camera angle and then cuts... not smooth"). Snapping first means
  the fade plays out at one stable, already-correct angle throughout — a single clean cut
  immediately followed by a smooth fade. If this ever needs touching again, keep the view-
  snap ahead of the swap/crossfade block — moving it back below is exactly this bug again.
- **Per-room compass calibration (2026-09-10)**: `node.defaultView.facingDir` (`'N'|'E'|
  'S'|'W'|null`, set via the "Compass facing" `<select>` next to "Set as this room's
  start view") is a PER-NODE constant, independent of the main aerial pano's own
  `state.northDeg` — each tour room's pano has its own arbitrary "lon 0." `tourGoTo`
  recomputes `state.northDeg` on every arrival (not gated on `instant`, since this is a
  fixed property of the room, not of the live camera) as the algebraic inverse of
  `updateCompass()`'s own `rot = -view.lon*180/PI - northDeg` formula:
  `northDeg = -(node.defaultView.lon) - {N:0,E:90,S:180,W:270}[facingDir]`. Uncalibrated
  ⇒ 0, never a leaked-over value from the aerial or a previous room. The aerial's own
  `northDeg` is snapshotted into `state.tourView.saved.northDeg` on entry and restored by
  `closePanoTour` on exit, same pattern as the saved camera view.
- **`server.py` recognises a project by `plots.svg` OR `tour.json`.** A tour-only project
  has no plots; requiring `plots.svg` hid such projects from `/api/projects` and made
  `do_bundle` 404 them.
- **`do_bundle` copies every TOP-LEVEL file in the project dir into `data/`.** Raw
  source masters left beside the runtime `.web.jpg`s ship in every export (343 MB of PNGs
  made a 392 MB bundle). Keep masters in a **subdirectory** — subdirs are skipped.
- **`menuConfig.tree` IS now the whole client menu again — AERIAL VIEW / LANDMARKS /
  VIRTUAL TOUR are ordinary nodes in it, not a side block (2026-09-09, the FOURTH design in
  three days, extended to a third builtin the same day).** History, because the reasoning
  behind each reversal matters if this gets touched again: hardcoded client rows (every
  project, no way to turn off) → authored `aerial`/`landmarks` content-type nodes, opt-in
  (a project that never authored them lost the rows entirely — exactly what happened to
  `anandman` after the Virtual Tours merge, "the aerial view and landmark menu is been
  removed") → a separate `menuConfig.builtins` side block, fixed always-first, protected
  from drag/delete/reparent → **current: ordinary tree nodes again, `builtin:
  'aerial'|'landmarks'|'tour'` marking which, living wherever the admin has actually
  dragged them** — reversed the THIRD design the same day it shipped, once "even landmark
  and aerial view should be movable... whoever is on top of the menu will be default" made
  clear that fixed-position was the wrong tradeoff, not a permanent one; VIRTUAL TOUR
  joined the other two as a third builtin later the same day, on request for full parity
  ("everything like toggle info that other builtin have... should be in virtual tour as
  well"). `BUILTIN_DEFS` (`{key: {contentType, title}}`) is the one place all three are
  declared — add a fourth builtin there, not by copy-pasting a chain of if/else.
  `ensureBuiltinNodes()` (called from `getMenuTree()`, searches recursively so a node
  dragged into a folder isn't duplicated) guarantees all three exist somewhere, injecting
  a default at the top if any is missing and self-healing if one is ever lost (e.g. as a
  side effect of deleting a folder it had been dragged into — rather than guard every
  deletion path, it just reappears on the next render). Being ordinary nodes gets
  drag-reorder, double-click-rename, and content dispatch (`activateMenuNode`→
  `openNodeContent`, which already handled `contentType === 'aerial'|'landmarks'` and
  gained `'virtualtour'` the same day) entirely for free — only an `enabled` flag (the
  ON/OFF switch; no delete button) is still special-cased, in `renderBuiltinNodeRow`
  (delegated to from `renderNodeRow` when `node.builtin` is set) and in
  `renderClientSidebar`'s render filter. **`landmarks`/`tour` are the only desktop routes
  to the landmark category picker / virtual tour picker respectively** — a project with
  either row switched off (or dragged somewhere unreachable) and no other route authored
  has no way in. **If this needs touching again, don't reach for a side config block — a
  "this one's special" need should live on the node itself, the way `enabled` does, so
  position/drag/rename keep coming from the ordinary node machinery for free.**
- **The client's landmark category picker (`#catNav`) is now LIVE data, not static markup**
  (2026-09-09) — it used to be a fixed HEALTHCARE/EDUCATION/COMMERCIAL/CONNECTIVITY/
  LIFESTYLE/TEMPLE list baked into `index.html`, identical for every project and wired once
  at boot; a landmark under any other category name had no button to reach it, in every
  project, silently. `getLandmarkCategories()` (groups `state.landmarks` by
  `effectiveLandmarkCategory()` — a landmark's explicit `category` field, or the same icon/
  keyword inference `isLandmarkMatchCategory` already used, falling back to
  `UNCATEGORIZED` rather than dropping it) is now the ONE place both `#catNav`
  (`renderLandmarkCategoryNav()`, called from `setLandmarks()` and `onLandmarksChanged()`)
  and the admin's built-in LANDMARKS row (its ▾ expansion) read from — so they can't drift
  apart again. `renameLandmarkCategory(old, new)` is a real bulk data change (every landmark
  under `old` gets an explicit `category = new`), confirmed with the user before building —
  not a cosmetic label swap. **Making `#catNav` empty-by-default (removing its old static
  fallback markup) opened a real boot-order race, hit the same day**: the root menu (with
  LANDMARKS clickable) renders synchronously early in `init()`, well before `setLandmarks()`
  — which is what actually populates `#catNav` — runs, near the end of the same async
  chain. A visitor tapping LANDMARKS in that window (easy to hit on a slow connection) saw
  a genuinely empty picker with no way to tell it wasn't broken. Fixed by also calling
  `renderLandmarkCategoryNav()` right where the root menu itself first renders — it's
  idempotent and safe with zero landmarks loaded (always emits at least "ALL LANDMARKS").
  **Any future built-in row whose content depends on data loaded LATER in boot needs the
  same treatment: either an early-safe render call like this one, or an explicit "not
  ready yet" guard in its click handler** (VIRTUAL TOUR already has one — it checks
  `state.tours.length` and shows a plain notice rather than assuming; AERIAL VIEW needs
  none, since `state.home` starts at a sane default). Don't assume a data-dependent picker
  is unreachable before its data loads just because it "shouldn't" be clicked yet.
- **`sw.js` is network-first for project CONFIG, SWR for media.** It used to be
  stale-while-revalidate for everything under `/projects/`, which served the *previous*
  `alignment.json` on the first load after an admin save — a freshly published menu item
  only appeared on the SECOND reload, which reads exactly like "it didn't save". If you
  change a caching strategy, **bump `VERSION`** (currently `v5`) or an installed worker
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
- **`showNotice(msg, {persist:true})`** (2026-09-11) — skips the normal 9s auto-hide, for
  a message a long-running operation keeps overwriting with live progress (see
  `exportBundle`'s Building→Downloading N% sequence, driven by `fetchBlobWithProgress`).
  Always follow a run of persisted calls with one normal (non-persist) call once the
  operation actually finishes/fails, or the message is stuck up forever.
- **The vendored three.js path appears in FIVE places that must all agree** (learned the
  hard way, 2026-09-11, when swapping the dev build for the minified one broke the
  standalone export bundle AND the PWA offline cache, neither caught by just testing the
  live server): `app.js`'s own `import * as THREE from './vendor/...'` line,
  `BUNDLE_SHELL`, the `elif rel == ...` branch in `do_bundle` that decides which copied
  file gets rewritten into `three.global.js`, `strip_named_import`'s target string (which
  must match `app.js`'s import EXACTLY or it silently no-ops, leaving a live `import`
  statement inside the bundle's non-module `<script src="app.js">` — a guaranteed
  `SyntaxError`), and **`sw.js`'s `SHELL_URLS`** (the PWA offline precache list — pointing
  it at the wrong file doesn't error at install time, since the OLD file still exists on
  disk and fetches fine; it just means the file the app ACTUALLY needs is never cached,
  so an offline visitor's pano viewer silently fails to load THREE.js — bump `VERSION` too
  when fixing this, so an already-installed worker's stale shell cache gets discarded
  rather than keeping the wrong file forever). `spike/index.html` also references the old
  path but is a dev prototype, not part of the live app or the export bundle — leave it.
  **`module_to_global`
  is NOT interchangeable between the dev and minified builds** — the dev build's export
  list is bare names (`{Scene, Mesh}`, valid object-literal shorthand as-is); the
  minified build's is aliased (`{nt as Scene}` — `as` is only meaningful inside a real
  import/export statement, so splicing it into `{...}` is a `SyntaxError`). Verify any
  future change here by actually executing the transformed output in Node and checking a
  few real properties (`window.THREE.WebGLRenderer`, `.REVISION`) — checking the text for
  a leftover "export" string is not enough, it missed this exact bug. **The whole
  rewritten body MUST stay wrapped in an IIFE** (fixed 2026-09-11, found by actually
  loading a real exported bundle in headless Chrome via `file://` — see "How to verify a
  change" below) — without it, the module's own thousands of top-level `const`/`let`/
  `class` declarations (module-scoped in the real ES module) leak into the ONE lexical
  scope every classic `<script>` tag on the page shares once loaded as `<script src>`
  instead. The minifier happened to land one of its own internal names on `$`, colliding
  with `app.js`'s own top-level `const $ = (id) => document.getElementById(id)` — a
  `SyntaxError` that killed ALL of `app.js`, not just that line, and the bundle never
  booted at all ("LOADING… 0%" forever). Any future edit to this function needs
  re-verifying with an actual `file://` load in a real browser, not just Node execution
  of the transformed output in isolation — Node happily ran the un-wrapped version fine
  because nothing else declared a colliding `$` in that same test.
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
  2026-09-04: the category arc-builder (`computeLandmarkPanRange`, since removed 2026-09-07 when the sweep it fed was retired — see the code map above) built its arc with the stored formula (while its own
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
- **Range-requested assets can't be cached like any other GET in `sw.js`.** A `<video>`/
  `<audio>` element requests its `src` with byte-range headers for seeking, AND pdf.js
  reads a PDF the same way (progressive, out-of-order Range reads for the brochure viewer
  — see `openClientBrochureModal`) — the server answers with `206 Partial Content`, and
  caching a single 206 response under the resource's URL would silently corrupt the cache
  (only that one byte slice would ever be served back; worse, since different Range
  requests for the SAME file return DIFFERENT slices, each caching attempt overwrites the
  last one under that same key — whichever slice lands last "wins" as the permanently
  cached, corrupted copy). `respondRangedAsset` (renamed 2026-09-12 from `respondVideo`
  once PDFs needed the exact same treatment — also renamed: `isRangedMediaPath`→
  `isRangedCacheablePath`, `VIDEO_BLOB_CACHE`→`RANGED_BLOB_CACHE`,
  `VIDEO_PRIME_INFLIGHT`/`primeVideoCache`→`RANGE_PRIME_INFLIGHT`/`fetchAndCacheFull`)
  only ever answers a ranged request from cache once a **complete** (`200`) copy is
  already held, slicing it manually into a proper `206` reply (`sliceRange`); otherwise it
  passes the ranged request straight to the network and separately kicks off a background
  fetch (`fetchAndCacheFull`) to prime the full-file cache for next time. This naturally
  satisfies "cache only once actually opened," since neither a `<video>` `src` nor a PDF
  load happens until the relevant modal actually opens (menu-item click), not on page
  load. **`fetchAndCacheFull` is shared by BOTH the ranged-priming path AND the plain
  (`!range`) direct-fetch path** (unified 2026-09-12) — before that, each had its OWN
  independent "is a fetch for this key already running" check, so a request shape mix
  pdf.js commonly produces (one main unranged streaming request ALONGSIDE a few early
  ranged reads for out-of-order data) triggered TWO separate complete downloads of the
  same file, not one; confirmed via real service-worker console instrumentation that
  after unifying them, exactly one real `fetch()` happens per file (Playwright's network
  log still shows what LOOKS like two responses per fetch — that's just how it reports a
  worker-mediated request: the worker's own outbound fetch and the page-visible response,
  as two separate log entries — not an actual second download; don't be misled by it).
  **This background-priming fetch genuinely did not exist in the code for a while, this
  paragraph's own earlier description notwithstanding** — a real bug found 2026-09-12
  ("mobile offline users, videos not getting downloaded", then confirmed as the exact
  same gap for PDFs, which weren't even routed through this function at all until the
  same day): the doc/comment described this exact fallback, but the uncached-and-ranged
  branch was just a bare network passthrough with no `event.waitUntil`/priming call
  anywhere. Since MOBILE browsers (iOS Safari reliably, Android often too) send a `Range`
  header on a `<video>`/PDF's very FIRST request — unlike most desktop browsers, which
  usually send a plain GET first — this meant videos (and, separately, PDFs) were never
  cached AT ALL on mobile, on any visit, however many times opened, while working fine in
  desktop testing. Re-implemented for real and verified END-TO-END with an actual browser
  (Playwright driving system Chrome): opened a video + the brochure online, polled real
  Cache Storage until both were confirmed cached, reloaded once more online, then
  genuinely went offline (`context.setOffline(true)`) and reloaded again — the video's
  `readyState` came back `4` (fully loaded) with no error, and the PDF rendered the
  identical page count it did online. If this ever looks broken again, verify with an
  actual offline browser load, not just reading the code or a unit test in isolation — a
  unit test using mocked `fetch`/`caches` had ALREADY "passed" while the real end-to-end
  scenario was still broken by the missing-registration-timing bug documented above.
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
  declared later — the FOURTH time this exact class of bug has hit this project** (black
  strap on the wizard modal, the `display:none` grid-reflow issue, `.install-banner` never
  actually hiding after `hideInstallBanner()` set `.hidden = true` (2026-09-03), and now
  `.tour-bar` staying on screen after `closePanoTour()` correctly set
  `els.tourBar.hidden = true` (2026-09-09) — the room-strip bar sat visibly on top of the
  correctly-restored aerial pano/landmark picker underneath it; `#tourBar`/`.tour-bar`
  itself was later removed entirely, 2026-09-11 — room navigation moved into the drawer).
  `[hidden]` and a class
  selector have equal CSS specificity; the later one in the cascade wins regardless of
  which is "supposed" to take priority, and author stylesheets always come after the UA
  stylesheet's own `[hidden]{display:none}`. Any element toggled via the `.hidden` DOM
  property needs an explicit `.the-class[hidden] { display: none; }` rule if the base
  class sets its own `display` — don't assume the attribute alone is enough to verify by
  reading the JS; check the CSS too. **When adding any new always-visible chrome element
  (a bar, a banner, an overlay) that gets toggled via `.hidden`, add its `[hidden]` rule
  in the SAME edit that adds its base `display` — this bug has now shipped four times by
  being an afterthought.**

## Reference parity (the Eleganza tour)

`anandman` reproduces `demo.build91.in/Eleganza`, a **3DVista** export sharing the same
aerial panorama. Its data is readable at `script_general.js` (the tour graph; `script.js`
is only player glue), and its landmark/camera numbers were imported rather than guessed:

- **The calibration, if it ever needs redoing:** their cubemap reprojected to an equirect
  correlates with our `Connectivity.web.jpg` at **0.986, shift 0.00°, no mirror** — same
  image, same orientation. So **our stored lon = their yaw + 180**, and **our lat = their
  pitch**. Sign confirmed by residual spread ±9.4° vs ±51.5° for the flip.
  ⚠️ Their tile pyramid numbers **level 2 as the lowest-res single tile** (0/1 are the
  high-res tiled levels); fetching level 0's `0_0` gives one corner tile — pure sky on a
  side face — which silently ruins any correlation.
- **Each landmark is placed TWICE and the copies differ by up to 18°.** The author places
  one on the landmark's **category** panorama and another, spread out, on the **main**
  panorama for the crowded all-view. Our nine default-view (featured) landmarks therefore
  take the MAIN placement; the other sixteen, only ever seen inside a category, take the
  category one. Using category positions everywhere put NIT Raipur and Suyash 0.9° apart
  and made the default view unreadable — the main pano spaces them 11°.
- **An overlay's pitch is the CENTRE of a ~16°-tall banner+leader graphic** (its `vfov`),
  not the label position: `banner = pitch + vfov/2`, `hotspot = pitch - vfov/2`. The camera
  aims at the MIDPOINT of the two, or raised labels tilt it up into empty sky. Also: the
  same landmark appears on several panoramas with different hand placements, so scope any
  extraction to the category panorama's own overlay list — a whole-file label search mixes
  them (Suyash is 168.29 on 'Highest' but 150.53 on Healthcare).
- **Their camera model:** a *separate panorama per category* (byte-identical images, only
  the overlays differ), each with a hand-set yaw/pitch at a constant **hfov 110** — never
  zooming per category, never sweeping, always level. `LANDMARK_HFOV` + `vfovFromHfov()`
  reproduce the zoom exactly; `hfov` is HORIZONTAL, so it MUST be converted per aspect
  ratio (110 is 77.6° vertical on 16:9 but 66.8° on a landscape phone).
- **Idle auto-pan CANNOT be tested headlessly — and a false confirmation from it is worse
  than an obvious failure.** Chrome stops the rAF loop after ~5 frames under
  `--virtual-time-budget` (instrumented: `frames=5->5`, and separately `requestAnimationFrame`
  itself instrumented and found to fire only 3 times total), so `renderLoop` — idle drift,
  the old category sweep, anything frame-driven — simply never advances. "0.000 degrees of
  drift over 6s" from a live-page timing test is NOT evidence of anything: it happened for
  BOTH a category (correctly held still) and the unrelated ALL-view free-spin (which should
  have moved and didn't) in the same test run — the second result is what exposed the dead
  render loop, since a genuine free-spin regression was known not to exist. Verify frame-
  driven logic by extracting the real function/conditional from `app.js` (brace-matched) and
  running it directly in Node against constructed states instead — deterministic, and it
  would have caught this immediately rather than needing a second contradicting test.
- **Landmark categories SETTLE and hold — they do not sweep, as of 2026-09-07.** Third
  design in one day: fit-or-sweep (zoomed per category) → always-sweep (constant zoom,
  continuous ping-pong, added when a category appeared frozen) → settle-and-stop (current).
  The last reversal came from actually reading the reference's OWN player runtime
  (`tdvplayer.js`), not just its exported data: a sequence's `repeat` defaults to 1, so it
  plays its one movement once and stops — confirmed, not inferred, and true of every
  category in the reference. `renderLoop`'s idle branch now gates on
  `!state.landmarkPanRange`, so it does nothing at all once a category is selected; the ALL/
  aerial free 360° spin (a separate, older feature) is unaffected. If a future change wants
  motion back, re-read this whole entry first — it took three iterations to land on what
  the user actually wanted, and the reasoning for discarding the other two is above.
- **Their angles follow no rule** — some sit on one landmark, one near an arc midpoint —
  so `landmarkClusterCentre()` approximates them: measured mean error 12.1°, against 20.8°
  for the arc midpoint (52° out on Connectivity) and 18.7° for the circular mean. End to
  end the shipped result averages 14.3°. Tighter would need an admin-chosen "focus"
  landmark per category — data, not hard-coded angles.

## How to verify a change

1. `preview_start` → `plot-map` (runs `server.py`). 2. Navigate to
`/?admin=1&project=sample` (or `/?project=<id>` for client). 3. Assert via the browser
tools' `javascript_tool` (DOM text/classes/positions, `fetch('/api/projects')`,
`localStorage`, IndexedDB, on-disk via a Bash `ls projects/<id>`). 4. console errors
should be empty. 5. `node --check app.js` + `python -c "import ast;ast.parse(open('server.py').read())"`
for syntax. Screenshot only as a bonus (WebGL flakiness).
- **The standalone export bundle is a genuinely different runtime, not just the live app
  copied elsewhere — verify it separately, with a REAL browser, not just Node.** app.js
  runs as an ES module live but as a classic `<script src>` in a bundle (module→global
  rewrite, import stripped) — scoping semantics differ (see the `module_to_global` IIFE
  gotcha above, found exactly this way: a real headless-Chrome `file://` load caught a
  `SyntaxError` that killed bundle boot entirely, which Node execution of the same
  transformed output in isolation did NOT catch, since nothing else declared a colliding
  name in that narrower test). To verify a bundle-affecting change: hit
  `/api/export-bundle?project=<id>`, extract the zip (Python's `zipfile`, not a shell
  unzip — some of these projects' bundles are 500MB+ from base64-embedded media), and
  load `<id>/index.html` in an actual browser via a genuine `file://` URL — Playwright
  driving the system-installed Chrome (`chromium.launch({executablePath: ...})`, no
  download needed) works when available; capture `console`/`pageerror`/`requestfailed`
  events, not just whether `goto()` resolves. Prefer a small project for a fast
  iteration loop, but confirm the final result against one with real pano/ground images
  too — a project with missing image files on disk (an unrelated data problem, not a
  bundle bug) will throw fetch/CORS errors under `file://` that look superficially
  similar and can be mistaken for the thing you're actually testing.

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
  the video/PDF byte-range caching path (`sw.js`'s `respondRangedAsset`) against a real seek/replay.
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
