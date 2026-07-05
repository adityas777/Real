
## 1. Objective (plain language)

Build a **web-based interactive plot map** for a township with ~10 plots. A buyer sees a high-resolution aerial 360 degrees drone shot image of the property site overlayed with 3d plot render of the development with every plot outlined. Each plot is **clickable**, **colour-coded by sales status** (Available / Reserved / Sold), and clicking one opens an **info panel** plus a **"Walk through this plot"** button that launches the matching **3DVista virtual tour**, deep-linked straight to that plot's scene.

All plot data — status, price, size, and the tour link — is driven by a single **Google Sheet**, so non-technical sales staff update one spreadsheet and the map recolours and re-routes automatically. No CMS, no backend required for the prototype.

This prototype must **run immediately with synthetic sample data** (a generated plot grid, a placeholder render, and either a local sample sheet or a published Google Sheet). Real assets get swapped in afterwards.

---

## 2. Architecture (the important decision)

The **custom web map is the shell** ("storefront"). The **3DVista tours are embedded destinations** ("rooms") that the map links into. The two stay **loosely coupled by URLs** — they never merge. This keeps the map responsive, brandable, analytics-friendly, and independently maintainable, while 3DVista does what it's good at (the immersive walkthrough).

```
Google Sheet (status + tour_url per plot)
        │  fetched as CSV at runtime
        ▼
Custom Web Map  ── SVG plot layer over high-res render ──►  click plot
        │                                                      │
        │  info panel (status / size / price)                  │
        ▼                                                      ▼
"Walk through" button ──► modal iframe ──► hosted 3DVista tour
                                            (deep-linked: index.htm?media=Plot-A101&skip-loading)
```

**Do NOT invert this** (do not embed the map inside 3DVista's Web Frame). The map is the primary sales surface and must own the shell.

---

## 3. Phase 0 — Confirm & audit (DO THIS FIRST, before writing code)

Ask me these questions and wait for answers. Propose sensible defaults so I can just say "defaults are fine."

1. **Target shape of the prototype** (default: **A**):
   - **A. Standalone static prototype** — a self-contained folder (`index.html` + `app.js` + `styles.css` + `/sample` assets). Runs with any static server, zero framework, zero risk to my existing repo. *Recommended for validating the mechanism.*
   - **B. Next.js component** — a single route/component dropped into my existing Build91 Next.js codebase. **If B is chosen, first audit the existing repo** (router type — app vs pages, styling system, existing routes, aliases) and **propose** where files go. **Never delete or overwrite existing routes, integrations, or config. No hardcoded assumptions about file structure — detect it.**
2. **Data source for the prototype** (default: **local sample CSV/JSON now, Google Sheet wiring stubbed and documented**):
   - Local `sample/plots.csv` only, or
   - A live **published Google Sheet** I provide (give me the exact publish steps + the `gviz` URL format), or
   - Both (local fallback if the sheet fetch fails). *Recommended.*
3. **Plot geometry source** (default: **generate a synthetic grid of ~400 plots** so it runs today):
   - Generate a synthetic SVG plot grid now, **or**
   - I'll provide a real `plots.svg` exported from our DWG (each plot = a `<path>`/`<polygon>` with an `id`). Document the expected SVG contract either way.
4. **3DVista tour** (default: **placeholder iframe pointing to a dummy URL**, with the real deep-link format documented):
   - Use a placeholder for now, or
   - I'll give you a real hosted tour base URL to wire in.
5. **Status set & colours** (default below — confirm or override):
   - `available` → green, `reserved` → gold/amber, `sold` → muted red/grey, `unknown` → neutral.

After I answer, restate the plan in 3–5 lines, then proceed.

---

## 4. Phase 1 — Runnable skeleton with sample data

Goal: something I can open in a browser within minutes.

- Scaffold the chosen shape (default: standalone folder).
- **Generate sample assets** so it runs with no real data:
  - `sample/render.jpg` — a placeholder render (a dark canvas with a subtle grid is fine; or generate a simple SVG-based placeholder). Document the real-asset spec: high-res (≥4000px wide), top-down or fixed camera-matched perspective.
  - `sample/plots.svg` — a generated grid of ~400 plot shapes. **SVG contract:**
    - Root `<svg>` has a `viewBox` exactly matching the render's pixel dimensions, so the overlay registers 1:1.
    - Each plot is a single shape with `id="Plot-A101"` (matching the data `plot_id`) and a class like `plot`.
    - No inline fills that fight the status styling (status drives `fill` via CSS class / JS).
  - `sample/plots.csv` — sample data (see schema in §7), ~400 rows with a realistic mix of statuses.
- Render the SVG **as a positioned layer over the render image**, both inside a responsive container that preserves aspect ratio. The map must pan/zoom gracefully on desktop and mobile (a lightweight pan-zoom is fine; no heavy deps).

**Acceptance:** open the page → see the render with 400 outlined, individually hoverable plots. Hover highlights a plot and shows its id in a tooltip.

---

## 5. Phase 2 — Wire the data (status → colour)

- Load plot data. Default: read `sample/plots.csv`. If a Google Sheet is configured, fetch it at runtime from the **published CSV endpoint**:
  ```
  https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&sheet=<SHEET_NAME>
  ```
  Parse CSV (a tiny inline parser, or Papa Parse if a dep is acceptable). On fetch failure, fall back to the local sample and show a non-blocking notice.
- Build a `Map<plot_id, row>`. For each SVG plot shape, apply a status class (`is-available` / `is-reserved` / `is-sold` / `is-unknown`) that sets the fill + outline. Recolour purely from data — **never hand-edit shapes**.
- Add a **legend** and **status filter** (toggle to show only Available, etc.).
- Add a small **"last synced" timestamp** and a manual **Refresh** button (re-fetch the sheet).

**Document the public-sheet caveat:** a published sheet is publicly readable. Fine for availability data. If privacy is needed later, note the option of a tiny serverless proxy (e.g. a Next.js route / edge function) that reads the sheet server-side with a service account and returns only the needed fields. Don't build the proxy in the prototype; just leave a clearly-marked stub + comment.

**Acceptance:** changing a status value in the sample data (or the sheet, then Refresh) recolours the corresponding plot.

---

## 6. Phase 3 — Click → info panel → deep-linked 3DVista tour

- On plot click: open a side/bottom **info panel** showing `plot_id`, `status`, `size`, `price`, and any `notes`. Style by status.
- Include a **"Walk through this plot"** button, enabled only when the row has a `tour_url`.
- Clicking it opens a **modal lightbox containing an `<iframe>`** loaded with the plot's `tour_url`. Document the **3DVista deep-link format** so real URLs slot in:
  ```
  https://<host>/tours/<tour>/index.htm?media=<PanoramaName>&skip-loading
  # optional framing:  &yaw=<-180..180>&pitch=<-90..90>&fov=<1..150>
  ```
  - `media` (or `media-index`) selects the panorama for that plot.
  - `skip-loading` makes the jump seamless (no loading screen).
  - Host the tour on the **same domain** as the map in production to avoid cross-origin iframe issues; note this in a comment.
- Modal has a clear close control and is keyboard-accessible (Esc to close, focus trap).
- Note (don't build) the **reverse link**: in production, a hotspot inside the 3DVista tour can link back to the map URL for two-way navigation.

**Acceptance:** click an Available plot → panel opens → "Walk through" → modal opens the (placeholder) tour iframe deep-linked to that plot.

---

## 7. Data schema (Google Sheet / sample CSV)

One row per plot. Header row exactly:

| Column | Required | Example | Notes |
|---|---|---|---|
| `plot_id` | yes | `Plot-A101` | **Must exactly match the SVG shape `id`.** This is the join key. |
| `status` | yes | `available` | One of: `available`, `reserved`, `sold` (extendable). Drives colour. |
| `size` | no | `1500 sq ft` | Free text shown in panel. |
| `price` | no | `₹42,00,000` | Free text shown in panel. |
| `block` | no | `A` | For grouping/filtering. |
| `tour_url` | no | `https://studio.build91.in/tours/phase1/index.htm?media=Plot-A101&skip-loading` | Full deep-linked 3DVista URL. Empty = button disabled. |
| `notes` | no | `Corner plot, east-facing` | Optional panel text. |

Generate ~400 realistic sample rows for the prototype.

---

## 8. Design direction

Premium, **dark-mode-first**: deep charcoal background, **gold accent** (Build91 aesthetic), high contrast, generous spacing, smooth hover/transition states. Status colours must remain legible on dark. Mobile-first responsive: the map, panel, filter, and modal all work on a phone. Keep it fast — minimal/zero heavy dependencies. If building in the Next.js path, follow our existing styling system rather than introducing a new one.

---

## 9. Real-asset swap guide (include as `README.md` in the output)

Document, step by step, how to replace the samples with production assets:

1. **Plot geometry from DWG → SVG.** Export the plot-layout DWG/DXF to SVG (CloudConvert / AutoDWG / mygeodata / Inkscape). Ensure each plot becomes one shape; assign `id="Plot-…"` per plot (script or Inkscape object IDs). Set the SVG `viewBox` to the render's pixel size.
2. **Render.** Drop in the high-res aerial/render at `render.jpg` (or update the path). Confirm the SVG `viewBox` matches its dimensions so plots align.
3. **Google Sheet.** Create the sheet with the §7 header. Publish to web (File → Share → Publish to web → CSV), copy the Sheet ID, set `SHEET_ID`/`SHEET_NAME` in config.
4. **3DVista.** Host each tour's HTML5 export (same domain recommended). Fill `tour_url` per plot using the deep-link format in §6.

---

## 10. Deliverables checklist

- [ ] Confirm gate completed (Phase 0 answered).
- [ ] Runnable prototype with synthetic 400-plot grid + placeholder render.
- [ ] Data-driven status colouring (local sample + documented Google Sheet path).
- [ ] Legend + status filter + refresh/last-synced.
- [ ] Click → info panel → deep-linked 3DVista modal (placeholder URL).
- [ ] `README.md` real-asset swap guide.
- [ ] No modification/deletion of any existing repo files (if Next.js path: audit-first, files only where I approved).

---

## 11. Constraints (do not violate)

- Confirm before building; restate the plan after Phase 0.
- Standalone prototype must not touch my existing Next.js project unless I explicitly choose the Next.js path.
- If Next.js path: audit the existing stack first; no hardcoded structure; never delete existing routes/integrations/config.
- Keep dependencies minimal and justified.
- Everything must run and be visibly demonstrable at each phase boundary.
