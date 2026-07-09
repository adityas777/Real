# Build91 · Interactive Plot Map (Prototype)

A web-based **interactive township plot map** rendered as a navigable **360°
panorama viewer**. A high-res aerial **360° drone panorama** is wrapped onto a
WebGL sphere you can **drag to look around** and **scroll to zoom**; an overlay
of **irregular parcels** (the organic shapes of real rural-India subdivisions)
is projected onto that same sphere, so each plot **sits on its ground pixels and
tracks the view**. Every plot is **clickable**, **colour-coded by sales status**
(Available / Reserved / Sold). Hovering a plot pops an **info-card tooltip** beside
it (number, status, and any Area / Price / Facing / Dimensions), and clicking one
opens a **beautiful compact popover anchored at the plot** — a rounded card with a
status pill, the plot number, a gold-accented **Price**, and a little caret pointing
back at the plot; it tracks the plot as you look around (click-away or Esc to
dismiss). **Blank fields are hidden** (no empty "—" rows): a plot with no data shows
just its number and status. A selected plot **keeps its status colour** — a gold
outline marks the selection — so availability stays readable. When a walkthrough URL
is present the popover shows a **"Walk through this plot"** button that launches the
matching **3DVista virtual tour** in a modal, deep-linked to that plot.
Plot-**number annotations** over the parcels are an optional toggle (the **#** button
in the on-screen controls) — **off by default**, remembered per browser.

The map is the **shell** ("storefront"); the 3DVista tour is an **embedded
destination** ("room") linked in by URL. The two stay loosely coupled and never
merge. *(Do not invert this — never embed the map inside 3DVista.)*

### How the alignment works
The plot overlay (`sample/plots.svg`) stores each parcel as a polygon in the
panorama's **image-pixel space** (viewBox = the equirectangular pixel size). The
panorama sphere's texture uses the mapping `lon = px/W·2π`, `lat = (0.5 − py/H)·π`.

The layout is treated as a **rigid site plan lying flat on a horizontal ground
plane** one unit below the camera: each plot pixel maps to a ground (east, south)
coordinate about the cluster anchor, then projects through the camera origin onto
the sphere — a true perspective image of a flat plan (`placeOnSphere = groundPoint(p).normalize()`).
This is deliberate. Because the plan is rigid on the floor, **scale and rotate are
uniform in every direction** and **move just slides it along the ground** — there
is no pole singularity and it can never squeeze or fold ("butterfly"). By default
(identity transform) the plan centres on the **nadir** (straight down), so the
admin starts from a uniform, undistorted footprint and drags/scales/rotates it to
match the photo — the 3DVista "sticky layout" behaviour. Foreshortening toward the
horizon is now correct perspective, matching how the real site looks in the pano.

`state.kGround` (px → ground units) auto-calibrates so the layout's outer radius
lands ~35° off the nadir at scale 1, regardless of plot count. The alignment's
`tx/ty` are **ground-plane offsets** (world units), not pixels — older px-unit
admin drafts are ignored via the bumped `DRAFT_KEY` (`…-v2`).

### Dependencies
One: **Three.js** (vendored locally at `vendor/three.module.js`, no build step,
no CDN) — a real 360° viewer needs WebGL. Everything else is hand-rolled.

> **Prototype config:** standalone static folder · ~10 **irregular** plots
> (one-line scalable to 400) · local CSV data source · real aerial 360°
> panorama (`sample/EleganzaPano360.jpg`) · real 3DVista tour
> (`https://demo.build91.in/Eleganza`).

---

## Run it

`fetch()` does not work from `file://`, so serve the folder over HTTP:

```bash
# any one of these, from this directory:
python -m http.server 8000   # Python
npx serve .                  # Node
```

Then open the printed URL (e.g. `http://localhost:8000`). The view auto-frames
the plot cluster over the site; drag to look around, scroll to zoom.

- **Client view:** `http://localhost:8000/`
- **Admin alignment view:** `http://localhost:8000/?admin=1` (see below)

---

## What's here

```
index.html                  # shell / layout
styles.css                  # premium dark-mode, gold accent, responsive
app.js                      # 360° viewer (Three.js) + data join, panel, modal
README.md                   # this file
vendor/
  three.module.js           # Three.js (vendored; no build, no CDN)
tools/
  generate-samples.mjs      # parameterised IRREGULAR-parcel generator (source of truth)
sample/
  EleganzaPano360.jpg       # original aerial 360° equirectangular panorama (12000×6000, ~30 MB)
  EleganzaPano360.web.jpg   # texture copy (4096×2048, ≤ WebGL max-tex-size) — what the app loads
  plots.svg                 # plot overlay (one irregular polygon per plot, id = plot_id)
  plots.csv                 # plot data (status / size / price / tour_url / …)
  alignment.json            # (optional) overlay transform from the admin tool; absent ⇒ generated placement
```

### Scaling the sample (10 ⇄ 400 plots)

Plots are generated by a Voronoi tessellation. Edit one constant and re-run:

```bash
# in tools/generate-samples.mjs:  const PLOT_COUNT = 10;  →  400
node tools/generate-samples.mjs
```

This regenerates `sample/plots.svg` + `sample/plots.csv`. Other knobs in the
generator: `SITE` (rough first placement of the plots on the panorama, as image
fractions), `INSET` (lane width between plots), `RELAX` (0 = wildest shapes,
2 = tidier), `TOUR_BASE_URL`, `DEEPLINK_MEDIA`.

---

## Admin: align the overlay (`?admin=1`)

Instead of hand-tuning `SITE`, you can place the whole plot layout **visually,
live in the 3D pano** — the same "sticky 2D layout over a pano" pattern 3DVista
uses. Open `index.html?admin=1`:

- **Look / Move toggle:** the segmented control sets what dragging does —
  **Look around** rotates the pano view; **Move layout** drags the whole layout
  so its centre can sit *anywhere* in the view (drag from anywhere, not just on a
  plot). Click a plot for its info panel in either mode.
- **Scale / Rotate / Opacity:** sliders resize/spin/fade the layout as one unit.
  Scale and **Rotate** each pair the slider with a **−/＋ stepper + editable number
  field** for fine work; rotation is in **0.1° increments** (fractional, e.g. `12.4°`).
- **🖼 Background pano…:** pick the 360° panorama the viewer wraps onto the sphere.
  The image is auto-resized to a texture-safe copy (`<name>.web.jpg`, ≤ the GPU cap),
  swapped in live, and remembered — **Export site files…** then writes that JPEG and
  records `"panoImage": { "file": "sample/<name>.web.jpg" }` in `alignment.json`, so
  the client loads it automatically (falling back to the built-in default if absent).
  *Switching panos changes the scene, so re-align the layout to the new pano before
  exporting.*
- **Save As…:** opens a native save dialog (Chromium `showSaveFilePicker`; falls
  back to a download elsewhere). Save it as `sample/alignment.json` and the
  **client view applies it automatically** on load.
- **Load… / Reset:** re-import a saved file to keep fine-tuning, or revert to the
  generated placement.
- **Save working session / Discard:** the full in-progress session — alignment
  **plus the traced plot geometry and the imported plan image** — auto-saves to
  this browser as you work and **restores on reload** (so a refresh or crash won't
  lose unexported work). It's stored in **IndexedDB**, because a multi-MB plan image
  won't fit the lightweight `localStorage` draft. **Discard** (and **Reset**) clear it.

Everything you set — position, scale, rotation, opacity, **and the camera view** —
is saved, so the client reproduces the exact look.

This is a **global** place/scale/rotate (a rigid transform) — perfect for sitting
the layout over the site as a close approximation. It is *not* per-plot warping:
because the panorama is a perspective projection, a single transform can't make
every parcel match its exact real outline. For survey-accurate per-plot
alignment you'd trace real outlines into `plots.svg` (see the swap guide).

**How it's stored / applied.** `alignment.json` holds the overlay `transform`
**and the camera `view`**, so the client reproduces exactly what the admin set
up (WYSIWYG) rather than re-deriving its own framing:

```json
{
  "version": 1,
  "transform": { "tx": 300, "ty": -150, "scale": 0.75, "rotationDeg": 12 },
  "view": { "lonDeg": 206.8, "latDeg": -36.7, "fov": 45 },
  "opacity": 0.65
}
```

- `transform` is one affine (about the layout's anchor — the centroid of all plot
  vertices, recomputed identically in both views), applied to every vertex
  *before* projecting to the sphere. Without the saved `view`, the client would
  auto-frame the cluster and visually *cancel out* your scale/move; the saved
  `view` is what makes those changes show up.
- The file is fetched cache-busted, so dropping a new one in and reloading the
  client always reflects it (no stale cache).
- On the **client**, the committed file wins. In the **admin**, your in-progress
  draft wins only if it's newer than the committed file (so a freshly saved/edited
  file is picked up, but unsaved work isn't lost). **Reset** clears the draft.
- `alignment.json` may also carry an optional `"groundImage": { "file": "sample/plan.png", "opacity": 1 }`
  — see *Import & Trace* below. Persisted paths are always `sample/…` (never a
  transient `blob:` URL), and a missing image is skipped, not fatal.
- `alignment.json` may also carry an optional `"panoImage": { "file": "sample/aerial.web.jpg" }`
  set via **🖼 Background pano…** — the client loads this as the 360° background instead
  of the built-in `CONFIG.renderUrl` default (missing ⇒ falls back to the default).

---

## Admin: import & trace plots (PNG / DXF) — `Import / Trace plots…`

Real townships come as a **rendered site-plan PNG** or a **CAD drawing**, not as
hand-authored SVG. The admin's **⊕ Import / Trace plots…** button opens a 2D
editor that turns either into the app's `plots.svg` (+ a `plots.csv` skeleton).

**It opens on your current working layout, ready to edit.** Re-open it any time to
fix a price, change availability, or re-trace a parcel — the live plots, their data,
and the plan image are pre-loaded (no need to re-import). To switch to a *different*
layout, just **Load image** / **Load DXF** to replace it. So the round-trip is
symmetric: import → align → **Export site files…** for the client, then re-import
the working layout later to tweak and re-export.

- **PNG / JPG** — the plan loads on a canvas (scroll = zoom, drag = pan). Pick a mode:
  - **Auto** — *click once inside a parcel*; a flood-fill captures the cell, traces
    its boundary, and simplifies it to a polygon (the **Colour match** and
    **Smoothing** sliders tune sensitivity). One click per plot on a tidy plan.
  - **Manual** — click corners to draw a parcel (Enter / double-click to close);
    the fallback for cells auto-trace can't isolate.
  - **Edit** — drag corners, double-click a corner to delete it, **Snap to shared
    corners** keeps neighbours' edges aligned.
  - The PNG is **kept as a draped ground layer** in the viewer (landscaping graphics
    stay visible), with only the marked parcels becoming interactive polygons on top.
    A **Plan image** opacity slider appears in the admin bar.
  - **Large images are auto-resized.** Browsers can't decode gigapixel exports and a
    >4096 px texture exceeds the GPU limit, so the tool decodes via
    `createImageBitmap` and downscales to ≤ 4096 px (the hint shows the new size).
    **Export site files…** writes this resized `…​.web.png`, and the client loads
    that — so a 150 MB / 15000 px master plan just works. (If even decoding fails,
    resize the source to ≤ 4096 px first, e.g. `magick big.png -resize 4096x4096 plan.png`.)
- **DXF** (the DWG path) — convert DWG → DXF once (any CAD's *Save As*, or the free
  ODA File Converter), then **Load DXF**. Closed `LWPOLYLINE`/`POLYLINE` entities
  become parcels; a **Layer** picker isolates the plot-boundary layer from roads/
  dims; `TEXT`/`MTEXT` inside a parcel auto-fills its number. (Vector source ⇒ no
  draped image.)

Each captured plot gets an editable **id** and **status** in the side list, and
**selecting a plot expands an inline data editor** (Price, Area, Facing, Dimensions,
Tour URL, Notes) — so all the plot info is edited right here, then written into
`plots.csv` on export. **Use these plots →** loads them straight into the live pano
so you align them with the usual Scale/Rotate/Move tools. (Plot data is typed, by
design, not OCR'd from the picture.)

**Export site files…** writes `plots.svg`, `plots.csv`, `alignment.json` (and the
plan image, pano image, and `landmarks.json` when present) into a folder you pick —
point it at `sample/` and reload the client. (Falls back to individual downloads
where the directory picker isn't supported.)

---

## Admin: landmarks (`?admin=1` → **Landmarks** tab)

Points of interest on the horizon — a styled **banner** (icon + label + distance +
drive time) tied by a **connector line** to a **pin** you place anywhere in the scene.
The admin bar has two tabs — **Align** and **Landmarks** — to keep the two workflows
separate.

- **＋ Add landmark** drops a new one at the centre of your current view. Select it in
  the list to edit **Label / Distance / Drive time / Icon** (a category picker:
  airport, school, hospital, mall, train…).
- **Both the pin and the banner are anchored to fixed directions in the panorama**, so
  they stay on their part of the scene as you look around. **Drag the pin** onto the
  spot it marks; **drag the banner** to position it — the connector line stretches to
  keep them joined. Placement is pixel-exact (drag lands under the cursor).
- Add **any number** of landmarks; edit or delete them anytime.
- **Save landmarks… / Load…** write/read a `landmarks.json`; **Export site files…**
  also writes it, and it's kept in the auto-saved working session.
- **Client is view-only.** Landmarks are **off by default**; the **📍 toggle** in the
  on-screen controls shows/hides them (remembered per browser, like the plot-number
  toggle). Anchoring is scene-relative, so landmarks belong to a given pano — if you
  swap the background pano, re-place them.

`landmarks.json` shape: `{ "version":1, "landmarks":[ { "label","distance","driveTime",
"icon", "hotspot":{"lonDeg","latDeg"}, "banner":{"lonDeg","latDeg"} } ] }`.

---

## Data schema (CSV / Google Sheet)

One row per plot. Header row **exactly**:

| Column     | Required | Example                                                              | Notes |
|------------|----------|----------------------------------------------------------------------|-------|
| `plot_id`    | yes  | `Plot-A101`                                                          | **Must exactly match the SVG shape `id`.** The join key. |
| `status`     | yes  | `available`                                                          | `available` · `reserved` · `sold` (extendable). Drives colour. |
| `facing`     | no   | `East Facing`                                                        | Free text, shown in panel. |
| `size`       | no   | `1,850 sq ft`                                                        | Area. Free text, shown in panel (labelled **Area**). |
| `dimensions` | no   | `30' × 62'`                                                          | Free text, shown in panel. |
| `price`      | no   | `₹51,80,000`                                                         | Free text, shown in panel. |
| `block`      | no   | `A`                                                                  | Grouping / filtering. |
| `tour_url`   | no   | `https://demo.build91.in/Eleganza/index.htm?media=Plot-A101&skip-loading` | Full deep-linked 3DVista URL. **Empty ⇒ button disabled.** |
| `notes`      | no   | `Corner plot, east-facing`                                          | Optional panel text. |

The header is **order-independent and additive** — `parseCSV` is header-driven, so
missing columns simply read blank (older 7-column files still load). The admin
**Export site files…** writes this 9-column header.

Status colours (legible over the photo): **available → green**,
**reserved → amber**, **sold → muted red**, **unknown → neutral grey**. Defined
as CSS variables in `styles.css`; the join applies an `is-<status>` class —
shapes are **never hand-edited**.

---

## The SVG contract (`sample/plots.svg`)

`plots.svg` is parsed as **data** (polygon vertices in panorama-pixel space),
not rendered as SVG — `app.js` projects those vertices onto the sphere. Keep
this identical when you drop in real, surveyed geometry:

1. Root `<svg>` has a `viewBox` **exactly matching the equirectangular
   panorama's pixel dimensions** (here `0 0 12000 6000`). This is the pixel
   space the projection maps from — get it wrong and plots land in the wrong
   place.
2. Each plot is a `<polygon class="plot" id="Plot-…">` (matching the CSV
   `plot_id`) whose `points` are in those image pixels. (Convex polygons
   triangulate cleanly; the generator emits convex Voronoi cells.)
3. Status colour is applied at runtime in the 3D material — no inline fills.
4. Labels are generated from the `plot_id`; you don't need `<text>` in the SVG.

> **Performance notes (WebGL):** the panorama **texture** must be ≤ the GPU's max
> texture size. `loadPanoTexture()` is **GPU-aware**: it uses up to `PANO_TEX_CAP`
> (8192) capped at `min(8192, gpuMaxTexSize())`, so desktop (max ≥ 16384) gets the
> full 8192×4096 sharpness while mobile (max 4096) **auto-downscales to 4096**. The
> served `EleganzaPano360.web.jpg` is 8192×4096 (~6 MB); the full-res original is
> kept as `EleganzaPano360.full.jpg`. It also sets `texture.anisotropy = 16` (Three
> clamps to the GPU max) — **essential**: without it the highly-stretched UVs at the
> pole convergence pick a coarse mip and look fuzzy; with it the top-down stays sharp.
> `wrapS = RepeatWrapping` keeps the lon = 0/2π meridian seamless. The viewer renders
> on demand, so it's idle-cheap. WebGL is required; a clear notice shows if absent.
>
> **View limits (why it stays clean):** every equirectangular 360° degrades to a
> swirl at the **nadir/zenith** (the poles — worst on drone panos, which can't shoot
> straight down through the aircraft). To keep that out of frame the camera **pitch
> ranges the **full ±90°** so you can look straight down for a clean top-down "map"
> view (and straight up at the sky). The camera is driven by **yaw/pitch Euler
> angles** (`cam.rotation.set(lat, lon+π, 0, 'YXZ')`) rather than `lookAt`, because
> `lookAt` gimbal-locks at the poles. **FOV is capped at 120°** (`FOV_MAX`) so the
> view can zoom right out to frame the whole site; past ~120° a perspective camera
> fisheyes hard (for an extreme "little-planet" overview you'd switch to a
> stereographic projection). Saved views are clamped to these limits on load
> (`clampView()`).
>
> **Nadir patch:** drone 360s can't photograph straight down, so the source equirect's
> bottom ~2–3% is a blurry fill that converges into a "swirl" when viewed top-down.
> `EleganzaPano360.web.jpg` is **nadir-patched** (the surrounding ground is mirror-
> extended over that band — see the ImageMagick recipe in git history) so the top-down
> reads clean; the full-res original is kept as `EleganzaPano360.full.jpg`. A faint
> radial blur remains at the exact pole — inherent to equirectangular spheres.
>
> **Asset caching:** `index.html` imports `app.js` cache-busted
> (`import('./app.js?v='+Date.now())`) and the pano texture is fetched `no-store`, so
> code/texture edits always take effect on reload (no hard-refresh needed during dev).

---

## 3DVista deep-link format

```
https://<host>/<tour>/index.htm?media=<PanoramaName>&skip-loading
# optional framing:  &yaw=<-180..180>&pitch=<-90..90>&fov=<1..150>
```

- `media` (or `media-index`) selects the panorama for that plot. The prototype
  passes `media=<plot_id>`; in production **`<plot_id>` must match a panorama
  name inside the Eleganza tour**. Unknown media names are ignored by 3DVista
  (it opens the default scene) — verified: the deep-link opens the real tour.
  To drop the param entirely, set `DEEPLINK_MEDIA = false` in the generator.
- `skip-loading` makes the jump seamless (no loading screen).
- **Host the tour on the same domain** as this map in production to avoid
  cross-origin iframe issues.
- **Reverse link (not built):** in production, a hotspot inside the 3DVista tour
  can link back to the map URL for two-way navigation.

The per-plot URL base is the single constant `CONFIG.TOUR_BASE_URL` in `app.js`
(and `TOUR_BASE_URL` in the generator). Change it in one place + regenerate.

---

## Real-asset swap guide

### 1. Plot geometry: synthetic Voronoi → surveyed parcels
The prototype generates organic irregular parcels (Voronoi of jittered seeds,
clipped to an irregular site boundary, inset for lanes). To use **real surveyed
geometry**, export the plot-layout DWG/DXF to SVG (CloudConvert / AutoDWG /
mygeodata / Inkscape): each plot = one shape, `id="Plot-…"`, `viewBox` = the
panorama's pixel size. Save as `sample/plots.svg`. Obey the **SVG contract**
above. (Keep using the generator if you just need a realistic placeholder.)

### 2. Render: the aerial 360° panorama
The backdrop **must be a true 2:1 equirectangular** 360° image
(`sample/EleganzaPano360.jpg`, 12000×6000). The app loads a **texture-safe
copy** (the original exceeds the GPU max texture size):

```bash
# regenerate the texture copy after replacing the original (ImageMagick):
magick sample/EleganzaPano360.jpg -resize 4096x2048 -strip -quality 82 sample/EleganzaPano360.web.jpg
```

Point `CONFIG.renderUrl` at it. The SVG `viewBox` must match the **original**
equirectangular's pixel dimensions (the projection maps from that space), and
the generator's `SITE` fractions place the plot overlay over the site band of
the image. *(If you re-shoot the pano, the camera/north orientation may differ —
nudge `SITE` so the parcels sit over the developable ground.)*

### 3. Data: local CSV → Google Sheet (optional)
For the prototype, edit `sample/plots.csv` directly. To switch to a published
**Google Sheet** later:

1. Create the sheet with the §schema header row.
2. **File → Share → Publish to web → CSV**.
3. Copy the Sheet ID from its URL
   (`https://docs.google.com/spreadsheets/d/`**`<SHEET_ID>`**`/edit`).
4. In `app.js` set:
   ```js
   USE_GOOGLE_SHEET: true,
   SHEET_ID: '<your-sheet-id>',
   SHEET_NAME: 'Sheet1',
   ```
   `app.js` then fetches the gviz CSV endpoint and **falls back to the local
   sample** (non-blocking notice) on failure. Use **Refresh** to re-pull.

> **Privacy caveat:** a published sheet is **publicly readable**. Fine for
> availability data. For privacy, front it with a small **serverless proxy**
> (e.g. a Next.js route / edge function) reading the sheet server-side with a
> service account, returning only needed fields. A marked stub + comment lives
> in `app.js` (`CONFIG` block); the proxy itself is intentionally **not** built.

### 4. 3DVista
Host each tour's HTML5 export (same domain recommended). Set
`CONFIG.TOUR_BASE_URL` and fill `tour_url` per plot using the deep-link format
above. Empty `tour_url` ⇒ the "Walk through" button is disabled for that plot.

---

## Features

- **360° look-around** — drag to rotate, scroll / pinch to zoom (FOV), on-screen
  zoom buttons. Auto-frames the plot cluster on load; **⊡ recenters** on the
  plots; look around to explore the whole site.
- **Plots projected onto the ground** — irregular parcels sit on their real
  ground pixels and track the view in perspective.
- **Hover** highlights a plot (raycast) and shows a tooltip (id + status).
- **Legend + status filter** — click a chip to toggle that status on/off.
- **Last-synced timestamp + Refresh** — re-pulls the data source.
- **Info panel** — id, status, size, price, block, notes, styled by status.
- **Deep-linked 3DVista modal** — focus-trapped, Esc / backdrop to close,
  "open in new tab" fallback.
- **Admin alignment tool** (`?admin=1`) — drag/scale/rotate the overlay live,
  save to a JSON file the client view imports; reload it later to fine-tune.
- **Mobile-first responsive** — info panel becomes a bottom sheet; touch
  drag/pinch to navigate the panorama.

---

## Notes / constraints honoured

- Standalone — touches nothing outside this folder; one vendored dependency
  (Three.js), no build step, no CDN.
- Status colouring is **purely data-driven**; geometry is never hand-edited.
- Google Sheet path is documented and stubbed (not wired) per the chosen config.
