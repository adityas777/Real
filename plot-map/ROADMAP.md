# Build91 Plot Map — Feature Roadmap

> Planning doc for three upcoming features. Written 2026-07-15. This is a **plan**, not
> code. It builds on the current architecture (see [CLAUDE.md](CLAUDE.md)): a zero-build
> Three.js client, a `projects/<id>/` data model, and the Python-stdlib `server.py`.

## Decisions locked (from product owner)

| # | Feature | Decision |
|---|---------|----------|
| 1 | Google-Sheet plot data | **Live** read in the client, with the committed `plots.csv` as **fallback**. |
| 1 | Sheet access model | **Public / "Published to web"** — browser reads the CSV directly, no keys, no proxy. |
| 2 | Standalone / embed | **Portable folder bundle** (self-contained folder, any static host). |
| 3 | Third feature | **Enquiry / lead capture** per plot. |

## Open decisions still needed (flagged inline as ❓)

- **F3 lead delivery:** where do submitted enquiries go? (Google Form→Sheet, `server.py`
  endpoint, or WhatsApp/email deep-link.) Recommendation below — please confirm.
- ~~**F1 column mapping:** require the sheet to use the exact `plots.csv` headers, or add a
  mapping UI?~~ **Shipped as: exact headers required for v1** (`plot_id` join key; a mapping
  UI is a later nicety).
- ~~**F1 auto-refresh:** poll the sheet on an interval, or only on load + manual Refresh?~~
  **Shipped as: load + manual ↻ Refresh only** (no auto-poll yet — deferred, low priority).
- ~~**F2 admin stripping:** ship the bundle's `app.js` as-is (admin code dead but harmless)
  or add a build step that removes it?~~ **Shipped as-is for v1** (admin code inert without
  `?admin`; a strip/minify step is deferred).

## Suggested sequencing

**F1 (data) → F3 (enquiry) → F2 (bundle).** F1 is the data foundation; F3 leans on the
same Google ecosystem; F2 ships last so the bundle captures live data + working enquiry.
Each is independently shippable.

> **Progress:** ✅ **F1 done** (2026-07-23) · ✅ **F2 done** (2026-07-27) · ⏳ **F3 remaining**.
> (F2 shipped ahead of F3; when F3 lands, re-export bundles so they carry the enquiry form —
> `gform`/`whatsapp` delivery modes work with no server, `server` mode falls back gracefully.)

---

# Feature 1 — Google Sheet as the live plot-data source

> **Status: ✅ Implemented 2026-07-23.** Per-project sheet config in `alignment.json`'s
> `data` block; admin **Plot data** section (toggle + link field + **Test**); client live
> read (gviz for a share link, `/pub` for a Publish-to-web link) with committed-`plots.csv`
> fallback; sync label shows the source; Save/Export snapshots the sheet into `plots.csv`;
> ↻ Refresh re-pulls. Steps 1–3 done; step 4 (auto-poll) deferred. See `CLAUDE.md`
> "Current status" for the verification notes.

## Goal
Plot **status** (available/reserved/sold) and detail fields come from a Google Sheet the
sales team edits, so the client reflects changes **without re-publishing**. If the sheet is
unreachable, fall back to the last committed `plots.csv`.

## Current state (already in the code)
- `CONFIG.USE_GOOGLE_SHEET` / `SHEET_ID` / `SHEET_NAME` / `sheetCsvUrl()` — a **global** stub.
- `loadData()` already branches: if the sheet is configured it fetches the `gviz` CSV,
  parses it, and on error falls back to the committed CSV.
- Join model: `state.rows` is keyed by `plot_id`; `applyData()` joins rows to SVG geometry
  by the polygon `id`. **Sheet `plot_id` must match the `plots.svg` polygon id exactly.**

## Approach (live + committed fallback, public sheet)
Move the sheet config from global `CONFIG` to **per-project** (each site has its own sheet).

- **Config home:** `alignment.json` gains a `data` block:
  ```json
  "data": { "source": "sheet", "sheet": { "url": "https://docs.google.com/…", "gid": "0", "enabled": true } }
  ```
  Absent/`source:"file"` ⇒ behave exactly as today (committed `plots.csv`).
- **URL handling:** admin pastes any normal Google Sheet URL; parse out the spreadsheet id
  + `gid`; build the read URL. Two public forms, tried in order:
  1. **Published CSV:** `…/pub?output=csv&gid=<gid>` (from File → Share → Publish to web).
  2. **gviz CSV:** `…/gviz/tq?tqx=out:csv&gid=<gid>` (needs "anyone with link can view").
- **Live read (client):** `loadData()` fetches the sheet CSV (cache-busted) → `parseCSV` →
  normalize (`status` lower-cased to available|reserved|sold; unknown ⇒ `unknown`; rows
  with no `plot_id`/non-matching id ignored) → `state.rows`. On **any** failure (network,
  CORS, quota, malformed) → fetch committed `projects/<id>/plots.csv`.
- **Snapshot on save:** when admin Saves/Exports, also pull the sheet **once** and write
  `plots.csv` — this is the fallback snapshot **and** what the standalone bundle bakes in.
- **Refresh:** the existing Refresh button re-pulls the sheet. ❓ optional auto-poll
  (e.g. every 2–5 min) behind a config flag.
- **Sync indicator:** `syncMeta` shows the source — e.g. `30 plots · live sheet · synced 3:12 PM`
  or `… · cached (sheet unreachable) · …`.

## Column contract
Sheet header row should match `plots.csv`: `plot_id, status, facing, size, dimensions,
price, block, tour_url, notes`. `plot_id` is the **join key**; extra columns ignored;
missing columns read blank. (❓ mapping UI is a later nicety.)

## Admin UX
A **"Plot data"** section (Align tab): a URL field (paste sheet link) + **Test** button
that fetches and reports "✓ 30 rows, plot_id column found, 28 match the layout" or a clear
error, an enable/disable toggle, and a note that the sheet must be **public / published**.

## Edge cases & risks
- **CORS** — the `pub?output=csv` and `gviz` endpoints generally allow browser GETs; if a
  host/sheet blocks it, the committed-CSV fallback covers it. (Server proxy is the escape
  hatch but was ruled out to keep the standalone bundle server-free.)
- **Google caching (~5 min)** on published sheets ⇒ status changes aren't instant; document it.
- **Rate limits / large sheets** ⇒ debounce refresh; cap rows.
- **Scope:** the sheet drives **plots only**. Landmarks/amenities stay file-based (`*.json`).
- **`plot_id` mismatch** is the #1 support issue — the Test button must surface match count.

## Phased steps
1. Per-project sheet config in `alignment.json` + admin URL field + **Test**.
2. Client live fetch + normalize + committed-CSV fallback + `syncMeta` source label.
3. Admin Save/Export snapshots `plots.csv` from the sheet.
4. (Optional) auto-poll + "last sheet sync" display.

## Verification
- Mock a public sheet; confirm join + status colours + legend counts.
- Kill the sheet (bad URL) → falls back to committed CSV, shows "cached".
- Edit a status in the sheet → Refresh → colour changes without re-publishing.
- `node --check`, no console errors.

---

# Feature 2 — Standalone / embeddable export (portable folder bundle)

> **Status: ✅ Implemented 2026-07-27.** `server.py` `GET /api/export-bundle?project=<id>`
> (`do_bundle`) zips the app shell + the project's files (under `data/`) into `<id>/`, baking
> `window.B91_BUNDLE={project,dataBase:'./data'}` into `index.html`. `app.js`'s `const BUNDLE`
> forces view-only, points `assetBase` at `./data`, and skips all `/api/*`. Admin **⋯ menu →
> Export standalone site…** (`exportBundle`) downloads the zip and copies an `<iframe>` embed
> snippet. Steps 1–4 done; step 5 (strip admin/server code) deferred — ships inert. Verified
> from a plain `python -m http.server` (no API): renders fully, zero `/api` calls, no errors.

## Goal
Produce a **self-contained folder** for one project that runs **view-only** on any static
host (or opened via a plain static server) — no admin, no `server.py`, no write API — and
can be embedded in an existing site via an `<iframe>`.

## Current state
The app is already near-static: `index.html` + `app.js` + `styles.css` +
`vendor/three.module.js` + `projects/<id>/` data. Admin and client share `app.js`, gated by
`?admin`; the client is already view-only and hides the project bar.

## Approach (portable folder bundle)
Assemble `dist/<project>/` (downloadable as a zip) containing:
```
index.html            # view-only shell; a baked <script>window.B91_BUNDLE={project,dataBase}</script>
app.js                # shipped as-is (admin code inert without ?admin) — see ❓ stripping
styles.css
vendor/three.module.js
data/                 # the project's plots.svg, plots.csv, alignment.json, landmarks.json,
                      # amenities.json + all images (pano/plan/logo/renders)
```
- **Bundle-mode boot flag:** `index.html` bakes `window.B91_BUNDLE = { project, dataBase:'./data' }`.
  `app.js` reads it → sets `state.assetBase` to `dataBase`, forces **view-only** (ignore
  `?admin`), and **skips all `/api/*` calls** (no server in a bundle).
- **Data:** bake the current `plots.csv` snapshot so the bundle works offline. **Live sheet
  still works** in the bundle too (public URL, any host with network) with the baked CSV as
  fallback — nice synergy with F1's public-sheet choice.
- **Zero-build preserved:** the folder keeps the relative ES-module `import` of
  `three.module.js`; no bundler needed. (Static hosts must serve `.js` with the right MIME —
  virtually all do.)
- **Producer:** a `server.py` endpoint `GET /api/export-bundle?project=<id>` that zips the
  app shell + project files into `dist/` (or streams a `.zip` download). Server-side keeps
  the client dependency-free (no JSZip).
- **Admin action:** an **"Export standalone site…"** button (project ⋯ menu) → calls the
  endpoint → downloads the zip, with a one-line "unzip and upload anywhere" hint.
- **Embed:** a **"Copy embed code"** helper producing
  `<iframe src="https://YOURHOST/index.html" style="width:100%;aspect-ratio:16/9;border:0" allowfullscreen></iframe>`
  plus responsive/sizing guidance.

## Edge cases & risks
- **File size** — panos are 4–6 MB; the folder bundle keeps them as sibling files (fine).
  (This is why single-file `.html` was **not** chosen — data-URIs would bloat it.)
- **MIME/module** — a few ancient static hosts mis-serve `.mjs`/module JS; we keep `.js`.
- **Host CSP / iframe** — the embedding site's CSP may restrict iframes; document
  `frame-ancestors`/`allowfullscreen` needs.
- **Relative paths** — everything resolves from `dataBase`; no absolute `/projects/…`.
- **Admin dead code** — ships but never runs without `?admin`; ❓ optional strip step later.

## Phased steps
1. Bundle-mode boot flag (`window.B91_BUNDLE`) → assetBase + view-only + skip `/api`.
2. `server.py` `export-bundle` endpoint (copy shell + project → zip).
3. Admin **Export standalone…** action + download.
4. **Copy embed code** helper + sizing docs.
5. (Optional) build step to strip admin/server code and shrink `app.js`.

## Verification
- Export a bundle; serve the folder from a **different** dir with `python -m http.server`.
- Confirm: plots, pano, landmarks, amenities, brand all render; **no admin UI**; **no
  `/api` calls / console errors**; live sheet works if public, else baked CSV.
- Drop the `<iframe>` into a scratch HTML page and confirm it renders + fullscreens.

---

# Feature 3 — Enquiry / lead capture per plot

## Goal
A visitor viewing a plot can register interest (name, phone, email, message) tied to that
plot; the lead reaches the builder. Must work in the **standalone bundle** (no server).

## Approach
- **UI:** an **"I'm interested"** button in the plot popover (`openPanel`) — and optionally
  the amenity card — opens a compact form pre-filled with the plot id/name. Submit → inline
  thank-you. Honeypot field + basic validation (no CAPTCHA).
- **Delivery — ❓ confirm (recommendation ranked):**
  1. **Google Form → Sheet (recommended)** — a hidden `formResponse` POST to a Google Form
     appends the lead to a Sheet. **No backend, works in the static bundle**, and fits the
     Google-Sheet theme (F1). Admin pastes the Form's URL + field ids once.
  2. **`server.py` `/api/lead`** — append to `projects/<id>/leads.csv` and/or email via SMTP.
     Richer/owned, but **only works when the server runs** → not in a pure static bundle.
  3. **WhatsApp / mailto deep-link** — `wa.me/<number>?text=…` or `mailto:` prefilled. No
     storage/central capture, but zero setup; good ultra-simple fallback.
- **Config (per-project, `alignment.json`):**
  ```json
  "leads": { "mode": "gform", "gform": { "action": "…/formResponse", "fields": { "plot":"entry.1", "name":"entry.2", … } },
             "whatsapp": "+91…", "consentText": "…" }
  ```
- **Bundle interplay:** `gform`/`whatsapp` modes work in the static bundle; `server` mode
  auto-falls back to `whatsapp`/`mailto` when there's no server.
- **Privacy:** collects personal data → show a short consent line; post only to the
  configured endpoint; no third-party trackers.

## Admin UX
A **"Enquiries"** section: choose mode (Google Form / Server / WhatsApp), paste the Form
URL (with a short "how to get the field ids" note) or WhatsApp number, and a consent-text
field. A **Test** submit that confirms a row lands.

## Edge cases & risks
- **Spam** — honeypot + minimal rate-limit + validation (CAPTCHA is out of scope/blocked).
- **Google Form field ids** are opaque (`entry.12345`) — the admin help must explain how to
  read them (pre-fill link trick); consider a tiny mapping helper.
- **Delivery failure** — show a graceful fallback (offer WhatsApp/mailto) rather than losing
  the lead.
- **Duplicate submits** — disable the button while sending; debounce.

## Phased steps
1. Enquiry button + form UI in the plot popover (pre-filled, validated, honeypot).
2. Per-project `leads` config + admin UX.
3. Delivery adapters: Google Form (primary) → `server.py /api/lead` (optional) → WhatsApp/mailto (fallback).
4. Confirmation UX + failure fallback; works in the standalone bundle.

## Verification
- Submit in `gform` mode → row appears in the Sheet; validation + honeypot behave.
- `server` mode → row in `leads.csv`; then run as a static bundle → auto-falls back to WhatsApp.
- `node --check`, no console errors.

---

# Cross-cutting concerns

- **Security:** the write API (`/api/save|rename|delete`) is still **unauthenticated** on
  `0.0.0.0`. Independent of these features, but worth a shared-token gate if the LAN isn't
  fully trusted. The **lead** endpoint (if built) needs spam hardening.
- **Backward compatibility:** every existing project with no `data`/`leads` config behaves
  exactly as today (committed CSV, no enquiry). All new config is additive/optional.
- **Docs discipline:** each feature ships with `CLAUDE.md` + `README.md` updates in the same
  turn (see the `keep-docs-current` skill).

# Rough effort (relative)

| Feature | Complexity | Notes |
|---------|-----------|-------|
| F1 Google Sheet (live+fallback) | **M** | Stub exists; mostly config-per-project + admin UI + fallback polish. |
| F3 Enquiry (Google Form mode) | **M** | Form UI + per-project config + one delivery adapter. |
| F2 Portable bundle | **M–L** | Server zip endpoint + bundle boot-flag; testing across hosts. |
