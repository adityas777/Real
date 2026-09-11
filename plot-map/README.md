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

Serve the folder with the bundled server (it also handles admin **server-side saves**):

```bash
python server.py 8731        # from this directory (no dependencies — Python stdlib)
```

Then open the printed URL. The view auto-frames the plot cluster over the site; drag to
look around, scroll to zoom. (A plain `python -m http.server` still works for *viewing*;
admin saves then fall back to browser downloads.)

- **Client view:** `http://localhost:8731/?project=<id>`  (default `sample`)
- **Admin view:** `http://localhost:8731/?admin=1&project=<id>` (see below)

The server binds to **all interfaces (`0.0.0.0`)**, so other devices on the same network
can open it at `http://<your-lan-ip>:8731/` (the startup banner prints the address). ⚠️
The save/rename/delete API has **no authentication**, so only run it on a **trusted /
firewalled** network. To restrict it back to this machine only, start it with
`HOST=127.0.0.1 python server.py 8731`.

### Projects
Every site lives in its own directory under `projects/<id>/`. The client chooses which one
to show with the **`?project=<id>`** URL parameter (default **`sample`**); admin adds a
**project switcher** in the top header bar. Everything you Export/Save in admin is written
straight into the active project's directory by `server.py` — no manual folder copying or
downloads. The admin **⋯** menu creates, duplicates, renames and deletes projects.

---

## What's here

```
index.html                  # shell / layout
styles.css                  # premium dark-mode, gold accent, responsive
app.js                      # 360° viewer (Three.js) + data join, panel, modal
server.py                   # tiny stdlib server: static files + /api/save + /api/projects
README.md                   # this file
vendor/
  three.module.js           # Three.js (vendored; no build, no CDN)
tools/
  generate-samples.mjs      # parameterised IRREGULAR-parcel generator (source of truth)
projects/
  <id>/                     # one directory per site (client loads it via ?project=<id>)
    plots.svg               # plot overlay (one irregular polygon per plot, id = plot_id)
    plots.csv               # plot data (status / size / price / tour_url / …)
    alignment.json          # (optional) overlay transform + site branding; absent ⇒ generated placement
    logo.web.png            # (optional) site/builder logo shown in the client title bar
    landmarks.json          # (optional) horizon landmarks (banner + pin, optional render image)
    landmark-*.web.jpg      # (optional) per-landmark render images (shown on hover/tap)
    amenities.json          # (optional) in-layout amenities (icon pin + details + render image)
    amenity-*.web.jpg       # (optional) per-amenity full-size render images
    <pano>.web.jpg          # (optional) background 360° panorama for this project
  sample/                   # the default project (?project=sample)
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
- **Site branding:** set the **Project name**, an optional **Tagline**, and a **🏷 Logo**
  shown in the client's title bar (in place of the built-in “B91 / Build91”). Type to
  update the title bar live; upload a logo (auto-resized to a transparent-friendly
  `sample/logo.web.png`) or **Clear** it. With no logo, the mark shows the project’s
  initials. It’s stored as `"brand": { "name", "tagline", "logo": { "file" } }` in
  `alignment.json` (and the logo image is shipped by Export); the client paints the title
  bar from it, falling back to the `Build91` defaults when absent.
- **Plot data (live Google Sheet):** by default plot status/details come from the committed
  `plots.csv`. Tick **“Pull plot status & details from a Google Sheet,”** paste the sheet’s
  link, and hit **Test** — it fetches the sheet and reports how many rows it found and how
  many `plot_id`s match your layout. The client then reads the sheet **live** (so the sales
  team can flip a plot to *sold* in the sheet and it shows without re-publishing), falling
  back to the committed `plots.csv` if the sheet is ever unreachable. The **↻ Refresh**
  button (top bar) re-pulls it, and the sync line shows the source
  (*live sheet* / *cached · sheet unreachable*). **The sheet must be public** — either
  *Share → “Anyone with the link”* or *File → Share → Publish to web* — and its header row
  must match `plots.csv` (a `plot_id` column is required). On Save/Export the current sheet
  is snapshotted into `plots.csv` (the offline fallback). Stored as a `"data"` block in
  `alignment.json`. *Note: Google caches published sheets ~5 min, so edits aren’t instant.*
- **Project menu (top header bar, admin only):** the client view is view-only and shows no
  project controls. In admin, a **switcher** dropdown jumps between saved projects, and a
  **💾 Save** button — one click writes **all**
  project files (plots, alignment, landmarks, amenities + images) into the current
  project's folder, so you never have to open the sidebar's Export/Save… again. The **⋯**
  menu adds: **New project…** (opens a blank id to build from scratch), **Duplicate as…**
  (clone this whole site — images included — into a new id), **⬇ Export standalone site…**
  (see below), **Rename…**, and **Delete…**
  (type the id to confirm; the folder is moved to a recoverable `projects/.trash/`).
- **Export standalone site (⋯ menu):** downloads a **self-contained folder** (`<id>-plotmap.zip`
  → an `<id>/` folder) that runs the **view-only** client with **no server at all** — unzip it
  and just **double-click `index.html`**, or upload the folder to any static host (Netlify, S3,
  a plain web server) and open it there instead. It bakes a `data/` copy of the project (plots,
  alignment, landmarks, amenities + images), so it's a true offline snapshot — if the project
  uses a **live Google Sheet**, the exported copy always shows the plot data as it was *at
  export time* (it doesn't attempt to reach the sheet, even when hosted somewhere with
  internet — re-export after the sheet changes to refresh it). If any menu item (a video, PDF,
  virtual tour, or photo) is a **pasted link rather than an uploaded file**, you'll see a
  heads-up listing which ones before the download starts — those still need an internet
  connection to open, even offline export can't change that, since the content itself lives
  elsewhere. An **`<iframe>` embed snippet** is copied to your clipboard — paste it into any
  site to embed the map (replace `YOUR-HOST` with where you uploaded it). *(Needs `server.py`
  running to build the zip; a plain static server can't.)*
- **Offline on phones, without downloading anything:** when the client (view-only) page is
  reached over a real `https://` address, it also quietly installs itself for offline use
  the first time a visitor opens it — no zip, no app store. After that one visit, the same
  link keeps working with no signal at all, and a small "Add to Home Screen" prompt lets a
  buyer turn it into a home-screen icon that opens like an app. This needs a genuine secure
  origin (`https://`, or `localhost` for local testing) — a plain local-network address
  won't enable it, since phone/desktop browsers require a secure origin for this. Admin
  pages never get this treatment. *(Current status: the offline layer itself is built and
  verified locally; where a project actually gets hosted for buyers to use this is still
  being decided — see the project's internal offline-rollout notes.)*
- **Save As… / Save…:** write straight to the server (`projects/<id>/`) via `server.py`
  — no dialog, no download. (If the server isn't running they fall back to a download.)
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
  "opacity": 0.65,
  "brand": { "name": "Dholera Greens", "tagline": "Plots & Villas", "logo": { "file": "sample/logo.web.png" } }
}
```

(`brand` is optional — the title bar falls back to the built-in `Build91` defaults when it's absent.)

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
plan image, pano image, brand logo, `landmarks.json`, `amenities.json`, and every
landmark/amenity render image when present) **to the server** into `projects/<Project ID>/`,
then reload the client at `/?project=<id>`. (Falls back to individual downloads if the
server isn't reachable.)

---

## Admin: landmarks (`?admin=1` → **Landmarks** tab)

Points of interest on the horizon — a styled **banner** (icon + label + distance +
drive time) tied by a **connector line** to a **pin** you place anywhere in the scene.
The admin bar has two tabs — **Align** and **Landmarks** — to keep the two workflows
separate.

- **＋ Add landmark** drops a new one at the centre of your current view. Select it in
  the list to edit **Label / Distance / Drive time / Icon** (a category picker:
  airport, school, hospital, mall, train…), and to attach an optional **render image**.
- **Render image (optional).** Attach one via **Add image…** (auto-resized to a
  texture-safe `landmark-<label>.web.jpg`, shipped by Export). A landmark that has a
  render gets a small 🖼 badge; in the client, **hovering it (desktop)** or **tapping it
  (mobile)** pops a card with the label, distance/drive-time and a **render thumbnail** —
  click the thumbnail for the **full-size render** in a lightbox. Landmarks without a
  render behave exactly as before (banner only, not clickable).
- **Both the pin and the banner are anchored to fixed directions in the panorama**, so
  they stay on their part of the scene as you look around. **Drag the pin** onto the
  spot it marks; **drag the banner** to position it — the connector line stretches to
  keep them joined. Placement is pixel-exact (drag lands under the cursor).
- **✓ ✕ — which landmarks show up-front?** Every row has a **pair** of buttons, sitting
  *next to* (not instead of) the × delete button. The highlighted half is the landmark's
  current state, and clicking a half sets that state — clicking the one that's already
  active does nothing, so you can't flip a landmark by accident:
  - **✓ (green)** — show it by default: it appears straight away in the client's
    "all landmarks" view.
  - **✕** — hide it from that default view, so the horizon stays readable.
    **It is not deleted and not lost:** the moment a visitor picks its **category**, it
    appears in full alongside every other landmark in that category.
  - **× (the separate button)** still deletes the landmark permanently.
  - **✓ Show all / ✕ Hide all** above the list do the whole lot at once, and the counter
    beside them reads *"✓ N of M shown by default"*.
  Hidden rows show dashed and dimmed in the list, and while you're on the Landmarks tab
  you always see *every* landmark in the scene (the held-back ones outlined with a dashed
  border) so you can still drag and edit them. New landmarks start shown, and so does
  every landmark in a project saved before this option existed — which means the quickest
  way to curate a long list is **✕ Hide all**, then ✓ the handful you want up-front.
- Add **any number** of landmarks; edit or delete them anytime.
- **Save landmarks… / Load…** write/read a `landmarks.json`; **Export site files…**
  also writes it, and it's kept in the auto-saved working session.
- **Client is view-only.** Landmarks are **off by default**; the **📍 toggle** in the
  on-screen controls shows/hides them (remembered per browser, like the plot-number
  toggle). Anchoring is scene-relative, so landmarks belong to a given pano — if you
  swap the background pano, re-place them.

`landmarks.json` shape: `{ "version":1, "landmarks":[ { "label","distance","driveTime",
"icon", "featured":true, "render":{"file":"sample/…"}, "hotspot":{"lonDeg","latDeg"},
"banner":{"lonDeg","latDeg"} } ] }` (`render` omitted when no image is attached;
`featured:false` = the ✕ above, i.e. hidden from the default view but still shown under
its category — a file with no `featured` key is treated as ticked).

---

## Admin: amenities (`?admin=1` → **Amenities** tab)

Points of interest **inside** the layout — a clubhouse, temple, pool, park, gym… Each
is a **pin dot** marking the exact spot (like a landmark pin) with the icon + **name**
label floating just above it (that name *is* its label — no "Plot 123"), the usual
plot-style details, and an optional **render image** that opens full-screen when clicked. Amenities are **not for sale**, so they have **no status/colour** and
never appear in the legend or status filter. The admin bar's third tab, **Amenities**,
keeps this separate from Align and Landmarks.

- **＋ Add amenity** drops a new pin at the centre of your current view. Select it in
  the list to edit **Name / Icon / Facing / Size / Dimensions / Price / Block / Tour
  URL / Notes**, and to attach a render.
- **Icon** is a category picker (clubhouse, pool, gym, garden, playground, temple,
  parking, shop, school, hospital, gate…).
- **Add image… / Replace image…** attaches a full-size render; it's auto-resized to a
  texture-safe `.web.jpg` (named `amenity-<name>.web.jpg`) and shipped by Export.
- **Drag the pin** onto the spot it marks — placement is pixel-exact and scene-relative
  (amenities belong to a given pano; re-place them if you swap the background pano).
- Add **any number**; edit or delete anytime.
- **Save amenities… / Load…** write/read an `amenities.json`; **Export site files…**
  also writes it **plus every render image**, and it's kept in the auto-saved working
  session (render images included).
- **On the client**, amenities show as clickable icon-pins (on by default; the **🏛️
  toggle** in the on-screen controls hides/shows them, remembered per browser).
  Clicking a pin opens an **info card** with the details and a **render thumbnail** —
  click the thumbnail to view the **full-size render** in a lightbox (Esc / click
  outside to close).

`amenities.json` shape: `{ "version":1, "amenities":[ { "id","name","icon","facing",
"size","dimensions","price","block","tour_url","notes", "render":{"file":"sample/…"},
"hotspot":{"lonDeg","latDeg"} } ] }` (`render` omitted when no image is attached).

---

## Admin: virtual tours (`?admin=1` → **Tour** tab)

A **multi-node 360° walkthrough** built from your own panoramas — the visitor stands in a
room, clicks a hotspot on a doorway, and crossfades into the next room. This is our own
tour engine (it replaces linking out to 3DVista), and a project can hold **several
independent tours** — a 2BHK and a 3BHK, say — each launched from its own menu item.

**Build a tour:**

1. **Tour** tab → **＋ Add tour**, and give it a name (e.g. *3BHK Show Flat*).
2. **＋ Add node (upload pano)** once per room. Each image is auto-resized to a
   texture-safe `.web.jpg`. Rename the node to the room name — that name is what a
   hotspot says by default.
3. **★** marks the **start node** — the room visitors arrive in.
4. **▶ Open tour to place hotspots** opens the tour in the viewer itself (the plot map
   steps aside while you work).

**Inside the viewer**, the Tour tab grows a hotspot editor for whichever room you're
standing in:

- **＋ Add hotspot here** drops a link at the centre of your current view — then
  **drag it onto the doorway** it leads through. Pick its target room from the dropdown,
  and give it a label if the room name isn't what you want on screen.
- **🏠 Set as this room's start view** — visitors will face the direction you're looking
  now every time they arrive in this room, whether that's the very first room of the
  tour, a hotspot click, or the room-strip thumbnail. Pick a compass direction (N/E/S/W)
  in the dropdown right above the button at the same time, and the compass will point the
  right way once visitors are standing here too — each room can be calibrated
  independently, since every panorama has its own arbitrary "forward."
- **▶** on any node jumps you there so you can place its hotspots too.
- Links are one-way. For a doorway you can walk **both** ways, add a hotspot in each room.

> **Three menu rows are built in, not authored.** **🗺️ AERIAL VIEW**, **📍 LANDMARKS**, and
> **🧭 VIRTUAL TOUR** appear automatically — drag them to wherever you want in the menu
> builder, and switch any of them off (an ON/OFF switch right on the row, not a delete) if
> a particular project doesn't need it. They can't be deleted for good: turn one off and
> reload, and it reappears in the tree (still off) the next time the admin opens, so it's
> always there to switch back on later. LANDMARKS with zero landmarks saved still shows
> its picker (there's just nothing on the pano to frame); VIRTUAL TOUR with zero tours
> tells the visitor plainly rather than opening to nothing. With exactly one tour,
> clicking VIRTUAL TOUR opens straight into it; with several, it shows the tour list AND
> auto-plays whichever tour you added first (the **Tour** tab lists them in that same
> order; there's no reordering yet — delete and re-add if you need a different one on
> top), so visitors see something immediately instead of an empty list to pick from. A
> project with no OTHER authored items and every built-in switched off shows no
> drawer at all.
>
> **After saving in admin, the client may need one reload** to pick the change up — and if
> you had the client open already, reload it. (Project data is fetched fresh whenever
> you're online; it's only cached for offline use.)

**Put it on the client menu:** open the menu builder, add an item, choose the
**🧭 360° Tour** type, and pick your tour from the list. (This is different from the
*virtual tour* type, which embeds an **external** 3DVista/Kuula tour by URL.) Visitors
click that menu item and the tour takes over the screen. If the tour has **more than one
room**, the room list moves into the navigation drawer itself (the same panel LANDMARKS
uses for its categories) — every room is listed there, the one you're standing in is
highlighted, and there's an **✕ Exit Tour** row at the bottom of that same list to leave.
Clicking a hotspot on a doorway, or a room in the drawer, both jump you there the same
way — the drawer stays open to that tour's room list the whole time you're touring. A
tour with just **one** room skips that list entirely (nothing to pick between) — Exit
Tour still shows up wherever the drawer is currently anchored (the tour list, if your
project has more than one tour, or the plain root menu if it doesn't).

> **Performance, and why it matters to the visitor.** Panoramas are big. A room downloads
> in about a second on 4G, and the tour quietly pre-loads every room your current room
> links to — so *walking* the tour has no waiting. **Jumping** to a distant room from the
> drawer is the one move that can pause, because it was never pre-loaded. Only a few rooms
> are held in graphics memory at once (they're far too large to keep all of them), which
> is why a room you visited a while ago may load again.
>
> **Keep your full-resolution masters out of the project folder** — put them in a
> subfolder like `_source/`. Everything sitting directly in the project folder is copied
> into every standalone export, and raw renders will bloat it enormously.

`tour.json` shape: `{ version, tours:[{ id, name, startNode,
nodes:[{ id, name, pano:{file}, defaultView:{lonDeg,latDeg,fov} }],
links:[{ from, to, label, hotspot:{lonDeg,latDeg} }] }] }`. Tours ride the working
session, ship with **Export site files…**, and are embedded in the standalone bundle
(panoramas included, so an exported tour works offline).

---

## Data schema (CSV / Google Sheet)

One row per plot. Header row **exactly**:

| Column     | Required | Example                                                              | Notes |
|------------|----------|----------------------------------------------------------------------|-------|
| `plot_id`    | yes  | `Plot-A101` or `A101`                                                | The join key → the SVG shape `id`. **Prefix-tolerant:** a bare `A101` matches `Plot-A101` (and vice-versa), so a Google Sheet can list plain plot numbers. |
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
For the prototype, edit `projects/<id>/plots.csv` directly. To drive plot status live from a
**Google Sheet** instead, use the admin **Plot data** control (no code edits):

1. Create the sheet with the §schema header row (a `plot_id` column is required). Its values
   match your layout's plot ids **with or without the `Plot-` prefix** — a sheet listing plain
   numbers like `133` joins to the `Plot-133` polygon automatically.
2. Make it public — either **Share → “Anyone with the link”** (viewer) *or*
   **File → Share → Publish to web**.
3. In `?admin=1`, Align tab → **Plot data**, tick the toggle, paste the sheet link, and click
   **Test** (it reports row count + how many `plot_id`s match your layout). **Save**.

The client reads the sheet **live** (gviz CSV for a share link, the published CSV for a
Publish-to-web link), keyed by `plot_id`, and **falls back to the committed `plots.csv`** on
any failure. Use **↻ Refresh** to re-pull; the sync line shows *live sheet* or *cached ·
sheet unreachable*. The config is stored per-project in `alignment.json`'s `data` block, and
Save/Export snapshots the current sheet into `plots.csv` as the offline fallback.

> **Privacy caveat:** a public sheet is **publicly readable** — fine for availability data.
> The browser reads it directly (no server proxy), which is what lets a live sheet keep
> working inside a standalone/embedded export. For a private sheet you'd need a serverless
> proxy reading it with a service account; that's intentionally out of scope here.
> *Scope:* the sheet drives **plots only** — landmarks/amenities stay in their `*.json`
> files. Google caches published sheets ~5 min, so status changes aren't instant.

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
- **Virtual tours** — multi-node 360° walkthroughs built from your own panoramas, with
  drag-placed navigation hotspots and a crossfade between rooms; several per project,
  each launched from its own **🧭 360° Tour** menu item. Works in the standalone export.
- **Hover** highlights a plot (raycast) and shows a tooltip (id + status).
- **Legend + status filter** — click a chip to toggle that status on/off.
- **Last-synced timestamp + Refresh** — re-pulls the data source.
- **Info panel** — id, status, size, price, block, notes, styled by status.
- **Deep-linked 3DVista modal** — focus-trapped, Esc / backdrop to close,
  "open in new tab" fallback.
- **Landmarks** — horizon banners (icon + label + distance + drive time) on a
  connector line to a placed pin; **📍 toggle** on the client. Optional **render image**
  per landmark, shown as a card on hover (desktop) / tap (mobile) → lightbox. Each one can
  be **ticked/unticked** in admin to control whether it rides in the default view —
  unticked ones still appear under their category.
- **Amenities** — in-layout icon-pins (clubhouse, temple, pool…) with a name, the
  usual details, and a full-size **render image** shown in a lightbox on click; no
  status/colour; **🏛️ toggle** on the client (on by default).
- **Site branding** — configurable project name, tagline and logo in the client
  title bar (admin Align tab), stored in `alignment.json`.
- **Background music** — add a track under ⚙️ **Settings → 🎵 Audio…** and it loops quietly
  for visitors, who can silence it with the 🔊 button (their choice is remembered next
  visit). **A video works too** — drop in a clip whose music you want and only its sound is
  used, the picture is never shown. (It's stored at full video size though, so an audio file
  is lighter for visitors on mobile data; and if the clip has no sound track you'll be told.) Browsers refuse to start sound before someone interacts with the page, so it
  begins on the visitor's first tap rather than the instant the page loads — that's the
  browser's rule, not a setting. It doesn't play in admin; press 🔊 to preview. The file
  is shipped as uploaded, so keep it small (a few MB) for visitors on mobile data. The same logo also heads the
  client's left menu drawer, at every screen size.
- **The menu skips steps that aren't choices** — a section holding a single video, PDF or
  tour plays/opens on the first tap instead of showing a one-row submenu, and a gallery
  folder full of photos opens straight at the first photo (swipe or use ‹ › for the rest).
  Sections that hold several different things still show their list, and only those rows
  carry a › arrow. Build the menu however you like — the admin side always shows the real
  nested structure; this only affects what a visitor has to tap through.
- **Translucent menu drawer** — the client's left menu is a tinted glass pane rather than a
  solid panel: the panorama stays visible through it, so the view isn't walled off by the
  navigation. Labels carry their own shadow so they stay readable over bright sky.
- **Live Google Sheet plot data** — optionally drive plot status/details from a
  public Google Sheet (per project, set in the admin Plot data control), read live in
  the client with the committed `plots.csv` as automatic fallback.
- **Projects + server-side save** — each site is a `projects/<id>/` directory; the
  client loads one via `?project=<id>` and admin saves write straight to disk through
  `server.py` (with a browser-download fallback).
- **Standalone / embeddable export** — one click packages a project into a self-contained
  folder (zip) that runs view-only on any static host and embeds via `<iframe>` — no server,
  no admin, no build step.
- **Admin alignment tool** (`?admin=1`) — drag/scale/rotate the overlay live,
  save to a JSON file the client view imports; reload it later to fine-tune.
- **Mobile-first responsive** — info panel becomes a bottom sheet; touch
  drag/pinch to navigate the panorama.

---

## Notes / constraints honoured

- Standalone — touches nothing outside this folder; one vendored dependency
  (Three.js), no build step, no CDN.
- Status colouring is **purely data-driven**; geometry is never hand-edited.
- **Live Google Sheet** plot data is wired end-to-end (per-project, public sheet,
  committed-`plots.csv` fallback) — set it up from the admin **Plot data** control.
