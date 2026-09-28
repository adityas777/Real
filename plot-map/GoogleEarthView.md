# Google Earth View — living implementation plan

> **Status: 🟢 v1 BUILT — Phases 0–3 done (2026-09-27).** Phase 4 (capped orbit and fly,
> landmarks by coordinates, …) is later.
>
> **What works now**
> - **Admin setup:** in the Align tab, the admin chooses **Panorama photo** or **Google Earth**.
>   The floating **Google Earth setup** panel holds:
>   - the project's key, with a Test button and setup steps to send the client;
>   - the site;
>   - the drone;
>   - a top-down view, two-point align and measure.
> - **Visitors** see Google's live 3D view behind the plots, with Google's logo and credits.
>   Any failure falls back to plots over the site plan.
> - **Shipping:** publish, the offline copy and the standalone bundle each carry exactly
>   what a Google project needs.
>
> **How it was checked**
> - The owner looked at Google's real imagery at their site, from several heights, and
>   called it "all working fine" (the Phase 0 go, D-13).
> - Everything else was checked on the surveyed local test ground, to within centimetres,
>   plus 14 server-side tests (`tests/test_google_earth.py`).
> - **Not yet done:** a real publish to S3, and phones.
>
> **Keys:** one per project, from each client, managed by the admin (D-5, D-12).
>
> **This is a LIVE document.** Update it in the same change as any work on this feature:
> tick the phase checkboxes, move answered questions into Decisions, and add to the Progress
> log at the bottom. See [CLAUDE.md → Documentation discipline](CLAUDE.md#documentation-discipline).
>
> Builds on the current architecture in [CLAUDE.md](CLAUDE.md): the aerial view is a 360°
> photo on a sphere, with the plot layout projected onto it from a flat ground plane.
> Sibling planning docs: [ROADMAP.md](ROADMAP.md), [VIRTUAL-TOUR.md](VIRTUAL-TOUR.md).
>
> **Not this:** the September 2026 experiment `tools/google-earth-pano.html` saved a still
> 360° image made from Google's 3D data. That approach is **not** being used (see §4, option A).

---

## 1. Goal

Some projects have no drone shoot, because it isn't needed or isn't possible. For those, the
**aerial view** should show the plot layout over **Google's satellite / 3D view of the real
site** instead of a drone panorama.

- In the admin panel, each project chooses its aerial background:
  - **Panorama photo**: upload a 360° drone picture, as today.
  - **Google Earth**: pick the site's location; Google's live satellite / 3D view becomes
    the background.
- Once the background is in place, the admin traces the plots and overlays them **as they do
  today**. Statuses, the plot card, filters, landmarks, amenities, the menu and tours all work
  the same.

## 2. Words used in this plan

| Term | Meaning |
|---|---|
| **Google view** | The aerial background rendered live from Google's **Photorealistic 3D Tiles**. This is the same 3D imagery Google Earth shows. |
| **Pano mode / Google mode** | Which background a project uses. |
| **Viewpoint** | Where the virtual drone hangs in Google mode: latitude, longitude and height above the ground. The visitor looks around from this point, just like from a drone pano. |
| **Site placement** | Where the traced layout sits on Earth: its centre (lat/lng), its rotation from true north, and its scale in metres per plan pixel. |
| **Top-down view** | An admin-only camera looking straight down at the site, used to line the plan up with the ground. |

Google Earth itself cannot be embedded in a website. The developer route to the same imagery
is **Google Maps Platform**: its Map Tiles API serves the Photorealistic 3D Tiles. Everything
below uses that.

## 3. Decisions locked (from the product owner, 2026-09-27)

| # | Decision |
|---|---|
| D-1 | Per project, the admin chooses the aerial background: **panorama photo** or **Google Earth**. |
| D-2 | Google mode is for projects where a drone shoot isn't required or isn't possible. |
| D-3 | Plot tracing and overlay work **as they do today**. Plots come from the developer's own site plan. |
| D-4 | The September 2026 still-image experiment is not the approach. |
| D-5 | **Each project uses its own client's Google key**, and the client's Google Cloud account pays for it. The client creates a browser key to our instructions (§9) and the admin enters it in that project. *Revised the same day; the first answer was "the owner's account". The owner's account can still supply the Phase 0 test key.* |
| D-6 | **v1: look around from one point only.** Capped orbit and fly are wanted next (§10a). v1 must not block them. |
| D-7 | **One drone viewpoint per project.** Several viewpoints are not planned. |
| D-8 | **The Google view works only online.** The offline copy and the standalone bundle show plots over the site plan. |
| D-9 | **Strictly one background per project**: pano or Google, never both shown. The other mode's settings are kept only so switching back is lossless. |
| D-10 | **Google's terms are accepted by whoever owns the key**: each client for their project (per D-5), and the owner for the test key. §5 G1–G5 still bind the design. |
| D-11 | **Old Google imagery is acceptable.** |
| D-12 | **Exactly one Google key per project**; the admin manages which key value goes there. No separate Build91 key (OQ-8, answered 2026-09-27). Development without a key uses the local test tiles (§10). |
| D-13 | **Phase 0: go.** The owner put a key into `geo-test`, looked at Google's imagery at their site (21.278320, 81.589621) from several heights, and reported "all working fine" (2026-09-27). The default drone height stays 200 m; the owner's test project uses 300 m. |

## 4. Approach

### Recommended: live Google 3D tiles inside our existing viewer

Render Google's 3D tiles live in the **same three.js scene** the app already uses. They
replace only the panorama sphere. The camera stays fixed at the **viewpoint** and looks
around with the same drag, zoom and auto-pan as today. Everything drawn on top stays as it
is: plots, the site-plan drape, landmarks, amenities and the compass.

**Why the overlay needs almost no change.** Today the layout lies on a flat ground plane
**one unit below the camera**, and each point is projected to a direction from the camera
(`groundPoint` → `placeOnSphere`). A drone H metres above flat ground sees the ground in
exactly that geometry, with one unit equal to H metres. So:

- store the layout's site placement **in metres**, and
- divide by the viewpoint height,

and today's projection puts every plot on the right spot of the Google ground. The overlay
is drawn **over** the Google layer, just as it is drawn over the photo today, so trees or
buildings in Google's 3D mesh never hide plots.

**Why this over the alternatives.**
- It keeps one engine and one camera, so there's a single place to fix bugs.
- Every viewer feature works in both modes: WYSIWYG start view, landmark category framing,
  idle drift, plot click and hover, and tours.
- True north is known exactly in Google mode, so the compass calibrates itself.

### Alternatives considered

| Option | What it is | Verdict |
|---|---|---|
| **A. Still image from Google** | Render a 360° picture from Google's data once, save it, use it as the pano. | ❌ Least work, but Google's terms forbid storing or exporting their imagery (§5 G1), and the picture would go stale. This is what the September experiment did. |
| **B. Live 3D tiles in our viewer** | This plan. | ✅ Recommended. |
| **C. Google's own 3D map component** (Maps JavaScript API, `gmp-map-3d`) | Google draws the map; we add polygons and markers through its API. | ⚠️ Fallback only. Plots, labels, hover, landmarks, framing and tours would all be rebuilt as Google map objects in a second engine that can't share our camera. Reconsider only if B hits a terms or technical wall. |
| **D. Flat 2D satellite map** | A top-down satellite map (like Google Maps' satellite layer) with plot polygons on it. | ⏸ Later extra. It's cheap, simple and works everywhere, but it's a map, not an aerial view: no horizon, and landmarks can't sit on the skyline. Useful only as a fallback where Google's 3D data is poor (Phase 4); not as a second background (D-9). |
| **E. Other imagery providers** (Esri, Mapbox, Bing…) | Same idea, different supplier. | Out of scope; the ask is Google. |

## 5. Google's rules we must design around

Before building, check these against the current Google Maps Platform Terms and the Map Tiles
API policies (see OQ-6).

| # | Rule | What it means here |
|---|---|---|
| **G1** | **Live only, no storing.** | Imagery streams from Google on every visit. It must never be saved into S3, the project files, the visitor's offline copy, the standalone bundle, our service worker cache, screenshots, the loading-screen image or share previews. The browser's normal HTTP cache, as Google's headers allow, is fine. |
| **G2** | **Show Google's logo and the data credits.** | Whenever the Google view is on screen, show the Google logo plus the imagery credits that come with the tiles. None of our UI may cover them: the landmark drawer, zoom column, upload dock or plot popover. Check this at phone width and on a landscape phone. Credit Google in the visitor UI; don't use the Google Earth logo or imply endorsement. |
| **G3** | **No tracing from Google's imagery.** | Plots must come from the developer's own site plan (D-3). The tracer must never offer to trace, flood-fill or digitise from the Google picture. Lining our own plan up over the imagery is normal overlay use. |
| **G4** | **The API key is visible in the browser.** | That's normal for Maps Platform browser keys, but it means the key must be a **dedicated browser key**. Never reuse a client's server key, e.g. one kept as `GOOGLE_PLACES_API_KEY` in a server's environment: once it's in a web page, anyone can copy it and spend on every API it allows. The protection is restrictions set in Google Cloud: allowed websites (HTTP referrers), Map Tiles API only, and a daily quota cap. |
| **G5** | **It's billed**, to the client's account (D-5). | Google bills Photorealistic 3D Tiles per "root tileset" request, roughly **one per visitor visit**. Confirm the current price and monthly free allowance on Google's pricing page in Phase 0. Our client instructions recommend a budget alert and a daily cap. When the cap is hit, the visitor sees the plan-only fallback (§7), not an error. **Full cost breakdown: [GOOGLE-EARTH-COSTS.md](GOOGLE-EARTH-COSTS.md).** |

## 6. Admin workflow (as built, Phase 2)

All of this lives in the **Align** tab. The current "🖼 Background pano…" button becomes an
**Aerial background** choice:

1. **Choose the background:** ◉ Panorama photo / ○ Google Earth.
   - **Panorama photo** works exactly as today.
   - A project uses exactly one background (D-9).
   - **Switching never loses the other mode's settings.** The pano file and its alignment
     stay, and so do the Google site placement and viewpoint. They're only kept so switching
     back is lossless. Visitors see only the chosen one.
2. **Google key:** paste the client's key for this project and press **Test**.
   - Test makes one request to Google and names the problem in plain words: key not
     found, Map Tiles API not enabled, billing off, key limited to other APIs, or this
     website not allowed on the key.
   - **Instructions for the client** copies ready-to-send setup steps with this project's
     exact website addresses filled in (§9).
3. **Find the site:** paste a Google Maps or Google Earth link, or type "lat, lng". The view
   jumps to a top-down look at that spot.
   - A place-name search box is a later extra (Phase 4); it needs the Places API, which is
     billed separately.
4. **Place the layout (top-down view):** the traced plots and the site-plan drape appear
   half-transparent over the satellite ground.
   - **Moving, rotating and scaling** work as today, but in real units: scale reads
     "1 plan pixel = x m".
   - **Two-point align:** click a point on the plan, then the same point on the ground; do
     it twice. Move, rotation and scale are solved in one go. This is the fastest way to get
     it right.
   - **Measure:** click a plot edge to see its length in metres or feet, and compare it
     with that plot's `dimensions` (e.g. 30×40 ft). This catches a wrong scale before
     visitors do.
5. **Place the drone (viewpoint):** set its height with a slider (50–1000 m), and its
   **distance and compass direction from the site** (e.g. "200 m south"). The camera turns
   to face the site after each change.
   - *Built as numbers instead of a draggable marker.* They're exact, and they keep their
     meaning when the site moves.
   - The top-down view shows where the drone is.
6. **Save the start view** exactly as today (WYSIWYG).
7. **Landmarks and amenities:** as today, placed by dragging in the view.
8. **💾 Save:** only `alignment.json` changes. No image is uploaded for the background.

**Admin messages (built):**
- the panel's status line and the sidebar give `GEO_REASONS` in plain words: no site, no
  key, key not valid, website not allowed, API off, key limited to other APIs, billing,
  quota, offline, no ground;
- the Test button gives the same wording for a key before it's used.

*Not built:* a "Google's 3D data here looks flat or blurry" warning. There is no reliable
signal for it, so the admin judges it by eye.

## 7. What visitors see

- **The aerial view opens at the saved start view**, looking at the site from the drone
  point. Visitors look around and zoom as with a pano. Plots are coloured by status; click
  and hover work as today. The compass is correct on its own.
- **Loading:** tiles stream in, blurry then sharp. The loading curtain stays up until the
  start view is sharp enough, with a maximum wait (about 8 s, tuned in Phase 0), then lifts
  anyway.
- **Sky and distance:** Google's 3D data has no sky, so the app paints one. Distant ground
  fades into haze, which also hides the far-away tiles that are always low-detail.
- **Credits:** the Google logo and imagery credits show while the Google view is on screen
  (G2).
- **Tours:** opening a 360° tour hides the Google view and shows the room panorama; leaving
  brings the Google view back.
- **No internet, key problem or quota exhausted:** the view falls back to **plan only**: the
  plots and site-plan drape on a neutral ground under a plain sky, with a small note that the
  satellite view needs a connection. Everything else still works: plots, cards, filters,
  landmarks, menu.
- **Honest limits:**
  - The picture is whatever Google has. It may be months or years old, and it may show the
    land before roads were laid.
  - Sharpness depends on Google's coverage of the area.
  - We can't edit the imagery.

## 8. Effect on the rest of the app

| Area | Effect in Google mode |
|---|---|
| **Plot tracing** (Import / Trace) | Unchanged. It traces the developer's plan (G3). |
| **Plot overlay** | Same projection, drawn over the Google layer. The site placement is stored in metres; today's `transform` is derived from it at load. |
| **Site-plan drape** | Unchanged; it's the main aid for lining the plan up. |
| **Landmarks** | Work as today (a direction from the viewpoint). Phase 4 adds placing by coordinates. |
| **Amenities** | Work as today. |
| **Compass** | North is set automatically; `northDeg` isn't needed. |
| **Start view, idle drift, category framing** | Unchanged. |
| **Virtual tours** | The Google layer is hidden during a tour and restored on exit. |
| **Loading-screen image** | Unchanged. It must never be a capture of the Google view (G1). |
| **Admin cloud ⇄ local** ([ADMIN-DATA-SYNC.md](ADMIN-DATA-SYNC.md)) | Nothing new to sync. The background is a few settings in `alignment.json`, so Google-mode projects download much faster than drone ones. |
| **☁ Publish to web** | The key travels in `alignment.json` (§9). **Built:** a Google project publishes the tiles code (`vendor/3d-tiles-renderer-*`, `three-r160-addons`, `google-maps-logo`) and not a pano kept only for switching back. A pano project publishes exactly what it did before (`publish_s3.uses_google_background` / `shell_file_wanted`). |
| **Visitor offline copy** ([MOBILE-OFFLINE.md](MOBILE-OFFLINE.md)) | Google imagery is never saved (G1); `sw.js` ignores other sites' requests. **But a saved copy answers EVERY same-site request**, 404 for anything it lacks, even online. So a Google project's offline list includes the tiles code (our own files): online, the Google view still works from a saved copy; offline, plan only. Pano projects' lists are unchanged. |
| **Standalone bundle** (`file://`) | No Google view: it can't be guaranteed internet, and a `file://` page sends no website address, so a restricted key fails. The bundle shows plan-only, and the bundle pre-flight check warns the admin. The project's key is **left out** of the bundle. |
| **Iframe embeds on clients' sites** | Work. The tile requests come from the `re.build91.in` page inside the frame. |
| **Admin from another device on the LAN** | The project's key must also allow that address (§9). |

## 9. Data and configuration

### In the project (`alignment.json`, a new `background` block)

| Field | Meaning |
|---|---|
| `background.kind` | `pano` or `google`. **Absent means `pano`**, so every existing project is unchanged. |
| `background.google.site` | The layout's centre on Earth: lat, lng. |
| `background.google.bearingDeg` | The plan's rotation from true north. |
| `background.google.metresPerPx` | The plan's scale. |
| `background.google.viewpoint` | The drone's lat, lng and height above the ground. |
| `background.google.groundAltM` | The ground height Google reports at the site, measured when the admin places the layout and saved so visitors don't have to measure it. |
| `background.google.detail` | Optional quality level; the Phase 0 result is the default. |
| `background.google.apiKey` | The client's browser key for this project (D-5). |

Existing fields keep their meaning:
- `view` is still the start view.
- `transform` and `panoImage` stay stored for pano mode.
- `northDeg` is ignored in Google mode.

`alignmentData`/`parseAlignment` must round-trip a project that never uses Google mode
byte-identically, as the `area` block does.

### The Google key: one per project, from the client (D-5)

**Why the key lives in the project's `alignment.json`**
- Visitors' browsers must receive it anyway, so a website key is not a secret. Restrictions
  are what protect it (G4).
- It travels with the project: the S3 working copy, every admin machine, and the published
  site, with no extra plumbing.
- Project data is not in git, so the key never lands in git.
- The standalone bundle leaves it out (§8).

**The client's key setup.** The admin panel generates this as ready-to-send text with the
project id filled in.

1. **Project and billing:** in the client's Google Cloud account, pick or create a project
   and link billing.
2. **API:** APIs & Services → Library → enable **Map Tiles API**.
3. **Key:** Credentials → Create credentials → API key, named e.g. *Build91 – <project>*.
   - **Application restriction: Websites**, with exactly these entries:
     - `https://re.build91.in/<project-id>/*`
     - `https://d9diw1qcxp0ak.cloudfront.net/<project-id>/*`
     - `http://localhost:8731/*`, so Build91's admin can set the project up
   - **API restriction:** Map Tiles API only.
4. **Cost controls (recommended):**
   - Quotas: a per-day cap on Map Tiles API requests.
   - Billing → Budgets & alerts: a monthly budget with an e-mail alert.
5. **Hand-over:** send the key to Build91. The admin pastes it in the project's Google
   background panel and presses Test.

**Reusing a key the client already has** (e.g. one they call `GOOGLE_PLACES_API_KEY`) is
not advised, even if it passes Test:
- **Server keys:** keys for server use are usually restricted by IP address, which
  browsers can't pass, or not restricted at all.
- **One application restriction per key:** adding website limits for us would break the
  client's server use.
- **Exposure:** once the key is in a web page, anyone can copy it and spend on every API
  it allows.

A separate browser key limited to Map Tiles API is the rule. If place-name search (Phase 4)
is built, the client adds the Places API to this same browser key.

**Rotation:** when a client replaces their key, the admin pastes the new one, then Saves and
Publishes.

### New third-party code (vendored 2026-09-27)

`tools/vendor_3d_tiles.py` writes it all. It checks the npm sha512 of each package, copies
only the modules needed, and rewrites their bare `three` imports to relative paths, so the
library shares the app's own `vendor/three.module.min.js`: one three.js, no import map, still
zero-build. About 700 KB, **loaded only for Google-mode projects**; drone projects download
nothing extra (checked: 0 requests on laxmi).

- **`vendor/3d-tiles-renderer-0.3.46/`** (NASA-AMMOS 3DTilesRendererJS): 64 of its modules.
  0.3.46 is the **last release that supports three.js r160**; 0.4.0 and later need r166+.
  So no three.js upgrade was needed. Moving to a newer library means upgrading three.js
  for the whole app first, as its own change with a full test (every view, the standalone
  bundle's module→global rewrite, iOS).
- **`vendor/three-r160-addons/`**: GLTFLoader, DRACOLoader, BufferGeometryUtils and Pass
  from three@0.160.0, plus the Draco decoder (Google's tiles are Draco-compressed).
- **`vendor/google-maps-logo/`**: Google's official logo, from their attribution asset pack
  (G2).

## 10. Phases

### Phase 0: Go / no-go check 🟢 go (owner, 2026-09-27; D-13)

**Test key:** one key for the check itself, from the owner's account or a pilot client's.
Set it up with the client steps in §9, adding `http://localhost:8731/*` if missing. The
admin pastes it into the test project. **Don't paste keys into chat or commit them.**

**The check itself**

- [ ] Test key in place (above).
- [ ] For each real site (Anandam Eleganza, laxmi, and one planned no-drone site), look from
      100 / 200 / 400 m and record:
  - [ ] real 3D or flat satellite on terrain?
  - [ ] imagery sharpness and age;
  - [ ] seconds until sharp;
  - [ ] MB downloaded per visit (desktop and phone);
  - [ ] frame rate and memory on a mid-range Android and an iPhone.
- [x] Is 3DTilesRendererJS compatible with three.js r160? **Yes, pinned at 0.3.46**, the
      last release that is (see §9, New third-party code).
- [x] Measuring tool: the `?gdebug=1` readout (below).
- [ ] Cost per 1,000 visits at current prices; quota plan.
- [ ] Terms review for our use (OQ-6).
- **Output:** go / no-go, default height and detail, phone limits. Record them in Decisions.

**Running the check** (with a key; the Phase 2 key field doesn't exist yet):
1. Paste the key into `projects/geo-test/alignment.json` → `background.google.apiKey`.
   Keep it out of chat and git; `projects/` is git-ignored. `geo-test` sits at Anandam
   Eleganza. For another site, change `site` and `viewpoint` there.
2. Open `http://localhost:8731/?project=geo-test&gdebug=1`, then add `&gheight=100`,
   `&gheight=400`, or `&gdetail=` with a number to try other settings. The readout shows:
   - layer status and time to a sharp view;
   - ground height and detail level;
   - tiles visible, active and loading;
   - requests, MB, fps and JS memory.
3. **Phones:** open it on the phone from this server's LAN address (e.g.
   `http://192.168.x.x:8731/?project=geo-test&gdebug=1`). The dev options work on LAN
   addresses too, but the key must allow that address.
4. **Refused key:** the readout names the reason, e.g. `failed (bad-key)`. The admin view
   says it in words.
5. **After a change:** an open admin tab keeps its own draft, and that draft wins over the
   file. Use the visitor URL, or the admin's Discard session, after editing the file.

### Phase 1: Google layer in the viewer 🟢 built 2026-09-27 · checked on test tiles, not yet on Google's

- [x] `background.kind` read and written; pano mode untouched. The pano placement is parked
      and written back unchanged; laxmi, a pano project, loads no tiles code.
- [x] Tiles library loaded only in Google mode; camera fixed at the viewpoint; the look,
      zoom and FOV limits as today.
- [x] Painted sky and distance haze; draw distance 40 km.
- [x] Overlay projection fed from the metre-based site placement; overlay drawn over the
      Google layer. Test ground: every plot corner lands within **4–11 mm** of its
      surveyed rectangle, with a 30° plan bearing and the drone 200 m off the site.
- [x] Google logo and credits (G2), bottom-centre. Also shows "Plot layout: <brand>" so our
      data and Google's are told apart.
- [x] Loading curtain waits for a sharp first view, at most 8 s.
- [x] Compass north set automatically; checked against the test ground's north band.
- [x] Tours hide and restore the Google layer and its credits (checked by simulating the
      takeover).
- [x] Plan-only fallback: no key, key refused (a fake key gives `bad-key` in one request),
      offline, bundle, no ground found. Retried automatically when the connection returns.
- [x] **Extra:** the admin's existing Move layout / Scale / Rotate already act on the Google
      placement (they edit it in ground units; Save turns it back into metres and lat/lng).
- [ ] **Not yet proven:** Google's real tiles, including the Draco decoding path (the test
      ground isn't Draco-compressed), Google's credit strings, and phone performance. That
      is Phase 0.

### Phase 2: Admin setup 🟢 built 2026-09-27

- [x] Aerial background choice (Align tab), with switching checked both ways: the pano side
      gets its untouched placement back, and the Google side keeps site, scale, bearing and
      drone exactly.
- [x] Key field (masked, Show/Hide), **Test** (one request, plain-word result; a fake key
      gives "not valid"), **Use this key**, and the setup steps to send the client. The
      steps use this project's published addresses from the publish settings, plus
      localhost and this LAN address.
- [x] Find the site from a Google Maps / Earth link or "lat, lng". A place link's pin
      (`!3d…!4d…`) wins over its map centre (`@…`). The drone keeps its position relative
      to the site, and the ground is measured afresh.
- [x] **Top-down view** (a temporary viewpoint above the site, north up, the drone marked)
      and readouts in metres (m per plan pixel, bearing, size across).
- [x] **Two-point align**:
  - checked on the test ground, it lands the clicked plot within 3–8 cm and a plot 260 m
    away within about 40 cm;
  - the plan hides for the satellite clicks.
- [x] **Measure**: exact on the test grid, 50.0 m across one cell and 212 m across a
      diagonal.
- [x] Drone: height slider plus distance and direction from the site. The camera re-aims at
      the site (checked: 250 m south at 300 m → pitch −50.2°).
- [x] Admin messages (see §6). A "flat / blurry 3D data" warning was not built: there is
      no reliable signal for it.

### Phase 3: Shipping 🟢 built 2026-09-27

- [x] Per-project key in `alignment.json`:
  - [x] the admin key field with Test and plain-word errors (Phase 2);
  - [x] the setup steps for the client, with this project's addresses;
  - [x] the key left out of the standalone bundle, both the inline data and
        `data/alignment.json` (`server.without_google_key`).
- [x] Publish skips a pano kept only for switching back (`publish_s3._project_files`).
- [x] **The Google-only vendor code goes with Google projects only**, in both publish and the
      offline list (`GEO_VENDOR_PREFIXES`, `shell_file_wanted`).
  - Found while building: the saved offline copy answers every same-site request, so
    without this the Google view would fail on a phone with a saved copy, even online.
  - Pano projects' publish and offline lists are unchanged.
- [x] Offline copy and standalone bundle show plan-only; the bundle doesn't embed the unused
      pano. The bundle pre-flight check warns ("Aerial view — Google Earth background"), and
      its **Edit** opens the setup panel.
- [x] Docs: README admin section, CLAUDE.md code map / data contract / gotchas / status,
      ADMIN-DATA-SYNC.md, MOBILE-OFFLINE.md and this plan.
- [x] Tests: `tests/test_google_earth.py`, 14 checks, no network.
- [ ] Verification still open (§13): a real publish to S3 (outward-facing, so only on the
      owner's go), phones, a key refused for the website.

### Phase 4: Later 🔴 not started

- [ ] **Capped orbit and fly** (D-6): see §10a. It's the first thing after v1.
- [ ] **Landmarks by coordinates:** paste a Maps link and the landmark lands in the right
      direction; straight-line distance is filled in automatically. This is a prerequisite
      for orbit and fly.
- [ ] Place-name search box (Places API).
- [ ] **Hilly sites:** plots follow the terrain instead of one flat plane.
- [ ] Flat 2D satellite view (§4, option D), only as a fallback where Google's 3D data is
      poor. Not a second background (D-9).

Not planned, per the owner's decisions:
- several viewpoints per project (D-7);
- both backgrounds in one project (D-9).

### 10a. Capped orbit and fly (after v1): how it would work

**Yes, it can be capped.** The visitor moves freely, but only inside limits the admin sets
per project:
- **Radius** around the site centre, e.g. 1.5 km. The camera can't leave that circle.
- **Height band**, e.g. 80–600 m above the ground. No going underground, no flying off
  into space.
- **Always facing the site:** optional. Orbit keeps the site centre in view, and free-fly
  can wander within the circle.
- **Home button:** one tap flies back to the saved start view from the viewpoint.

The caps also:
- keep the view on the project, not on a free Google Earth tour of the city;
- bound how many tiles a visit can load, which means data on phones and cost.

**What changes from v1**

| Area | Change |
|---|---|
| **Plot overlay** | v1 projects plots from the fixed viewpoint, which is exact only from that point. Orbit draws them as real ground polygons in Google's 3D space. The metre-based site placement from v1 feeds this directly, so there's no re-alignment. |
| **Landmarks and amenities** | v1 stores each as a direction from the viewpoint, which is wrong once the camera moves. Orbit needs a real position for each. |
| **Controls** | Orbit and fly controls replace drag-to-look while moving. Idle drift and category framing become "fly to a shot" instead of "turn to a direction". |
| **Cost and data** | Billing is per visit (G5), so orbiting shouldn't add billed sessions; confirm in Phase 0. It does load more tiles, so more data on phones. The radius cap is what bounds it. |

**What v1 does now so orbit isn't blocked later** (D-6):
- store the site placement in lat/lng and metres, as §9 already does;
- when the admin places a landmark or amenity in Google mode, also save its **ground
  position** where the view can find one. Orbit then only needs coordinates for the far
  landmarks, via "Landmarks by coordinates".

**Effort:** about **M–L** on top of v1. Most of it is the 3D overlay and the new controls.

**Relative effort:** Phase 0 **S** · Phase 1 **L** · Phase 2 **M–L** · Phase 3 **M**.
Most of the risk is in Phase 0 and Phase 1.

## 11. Open questions (need an answer from the owner) ❓

**Still open:** none.

**Answered 2026-09-27** (now decisions in §3)

| # | Question | Answer |
|---|---|---|
| OQ-1 | Whose Google Cloud account and billing? | Each project's client, with their own key (D-5, revised). |
| OQ-1b | What budget and daily cap? | The client's call on their account; our client instructions recommend both (§9). |
| OQ-2 | Look around from one point, or fly and orbit? | Look around for v1; capped orbit and fly next (D-6, §10a). |
| OQ-3 | One viewpoint or several? | One (D-7). |
| OQ-4 | Is plan-only acceptable offline and in a bundle? | Yes; the Google view is online only (D-8). |
| OQ-5 | One background or both? | Strictly one (D-9). |
| OQ-6 | Who signs off on Google's terms? | Whoever owns the key: each client for their project (D-10). |
| OQ-7 | Is old imagery acceptable? | Yes (D-11). |
| OQ-8 | A separate Build91 admin key? | No. One key per project, managed by the admin (D-12). |

## 12. Risks

| Risk | Mitigation |
|---|---|
| Google's 3D data around semi-urban Indian sites may be flat or blurry. | Phase 0 checks real sites first; higher default height; haze; option D as a fallback. |
| **Hilly sites:** a flat overlay drifts off the ground. | Ground height measured at the site; flag slopes in admin; terrain-following in Phase 4. |
| Phone performance and data use. | Lower detail and memory caps on phones; limits set from Phase 0 numbers. |
| A cost spike (e.g. a link goes viral). | Daily quota cap plus budget alert; graceful plan-only fallback. |
| Key misuse. | A dedicated browser key per project, limited to that project's addresses and to Map Tiles API. Never a client's server key. |
| A client's key is wrong, expires or hits its cap. | Test in the admin; plan-only fallback for visitors; rotation is paste, Save, Publish. |
| The three.js upgrade the library might need. | Its own change, fully tested, before Phase 1. |
| Google changes its terms, pricing or API. | The core aerial view depends on a paid outside service. Keep drone mode first-class, and keep the plan-only fallback. |

## 13. Verification

Status 2026-09-27: ✅ = done, ⏳ = still to do.

- ✅ **Admin:** a Google-mode project set up end to end on the test ground (site, two-point
  align, drone, top-down, measure).
- ✅ **Switching:** pano → Google → pano is lossless.
- ✅ **Visitor, desktop:** Google's real tiles (owner), credits, compass, plots on the ground.
- ✅ **Tours:** in and out.
- ✅ **Fallbacks:** no key, fake key, bundle.
- ✅ **Server rules:** `tests/test_google_earth.py`.
- ⏳ **Still to do:** phones (Android, iPhone, landscape credits); a real publish plus the
  published page with a website-restricted key; an iframe embed; a key refused for the
  website; a simulated quota exhaustion.

The full checklist:

- **Admin:**
  - set up a Google-mode project end to end: find the site, two-point align, drone, start
    view, Save;
  - reopen it on another machine; nothing large downloads.
- **Switching:** pano → Google → pano restores the original pano alignment exactly;
  landmarks are untouched.
- **Visitor:**
  - desktop, Android phone and iPhone, portrait gate and landscape;
  - credits visible and uncovered at 375 px and on a landscape phone;
  - plots line up with the ground at the start view and at full zoom;
  - compass north matches the imagery.
- **Tours:** in and out, and the Google view returns.
- **Fallbacks:** offline, no key, a key refused for the website, a simulated quota
  exhaustion. Each gives plan-only with the note, never a blank or broken page.
- **Keys:**
  - Test reports each failure correctly: wrong key, API off, billing off, other-APIs-only
    key, website not allowed;
  - a key limited to project A's address fails on project B.
- **Distribution:**
  - publish, then check the published page loads with the restricted key;
  - an iframe embed works;
  - a standalone bundle shows plan-only and the export warned.
- **G1 audit:** no Google imagery in S3, the service worker cache, the offline copy or the
  bundle.

## 14. Where it lives in the code

**Built in Phase 1:** `app.js`, section "Aerial background: Google Earth", just after
`updatePanoName`.

- **Config and constants:** `GEO_*`, including `GEO_DEV` for the dev URL options and
  `GEO_REASONS` for plain-word failures.
- **Layer state:** the `geo` object. Its status runs `off` → `loading` → `measuring` → `ok`,
  or ends at `failed`.
- **Placement maths, no library needed:**
  - `geoMetresPerDeg` / `enuOffsetM` / `offsetLatLng`;
  - `parseBackground` / `backgroundData` (the `alignment.json` `background` block);
  - `applyBackgroundConfig` parks the pano transform, and `googleTransformFromPlacement`
    loads the Google placement into `state.transform`;
  - `googlePlacementNow` folds the admin's live edits back into metres and lat/lng;
  - `syncGoogleOverlayScale` is called from `recomputeAnchorAndK`.
- **The layer:** `startGoogleLayer` (lazy `import()` of the vendored library),
  `stopGoogleLayer` / `refreshBackgroundLayer`, `geoSkyDome`, `geoOrient` (measures the axes),
  `geoBeginGround` / `geoGroundHit` / `geoFinishGround` / `geoPlace`, and `geoStepLoading`.
- **Rendering:** `renderScene` replaces the plain render in `renderLoop`. It draws Google's
  scene, clears depth, then draws the usual scene over it.
- **Credits and debug:** `ensureGeoCredits` / `renderGeoCredits` (`.geo-credits` in
  `styles.css`), `ensureGeoDebug` / `renderGeoDebug`.
- **Compass:** `effectiveNorthDeg` is used by `updateCompass` and `northFacingLon`.
- **Boot:** `applyBackgroundConfig(chosen?.background)`, the pano isn't downloaded in Google
  mode, `startGoogleLayer()` runs after `initThree`, and `hideBootCurtain` honours
  `geo.holdCurtain`.
- **Tours:** `googleDrawing()` is false while `body.tour-open`. The room pano uses the
  sphere as always.

**Test and tooling:**
- `spike/geo-tiles-test/make_test_tiles.py` writes the surveyed test ground and the
  `projects/geo-test` project.
- `tools/vendor_3d_tiles.py` writes the vendored code.

**Built in Phase 2 (admin):** `app.js`, section "Google Earth: admin setup", right after the
Phase 1 section. Markup is `#axBgPano` / `#axBgGoogle` / `#axGeoBlock` in the Align tab and
`#geoPanel` after the admin bar (`index.html`); styles are `.ax-bg`, `.geo-panel`, `.geo-*`
and `.geo-picks` (`styles.css`).

- **Keeping the numbers straight:**
  - `bakeGooglePlacement` folds the live transform into the stored placement;
  - `reapplyGooglePlacement` does the reverse;
  - `activeViewpoint` is the drone, or the temporary top-down viewpoint
    (`geo.viewOverride`), and every metres ⇄ ground-units conversion goes through it;
  - `geoPlace` moves the WORLD so the active viewpoint sits at the camera. Tiles stay
    centred on `geo.origin`, the drone when they loaded.
- **Actions:**
  - `setBackgroundKind` (pano ⇄ Google);
  - `setGoogleSite` (restarts the layer, re-measures the ground), with `parseGeoLocation`;
  - `setGoogleDrone`, with `droneFromSite` / `placeDrone` / `viewAimedAtSite`;
  - `testGoogleKey`, `geoClientStepsText`;
  - `setGoogleTopDown`, `layoutRadiusM`.
- **Tools:**
  - `startGeoTool` / `cancelGeoTool` / `geoToolClick`, hooked into `wireViewControls`'s
    click, ahead of `pick`;
  - `groundToPlanPx`, `finishTwoPointAlign` (a complex-number similarity solve);
  - `geoAlignPlanVisible`, `setGeoToolHint`, `renderGeoPicks` (SVG over the view).
- **UI:** `updateGeoAdminUI` (called from `updatePanoName` and `onAlignmentChanged`),
  `updateGeoReadout`, `openGeoPanel` / `closeGeoPanel`, `wireGeoAdmin` (from `wireAdmin`).
- **The save:** `alignmentData` saves `geo.topDownView` as the start view while top-down is
  on.

**Built in Phase 3 (shipping):**
- **`publish_s3.py`:** `GEO_VENDOR_PREFIXES`, `uses_google_background`, `shell_file_wanted`.
  `_project_files` drops `panoImage` in Google mode.
- **`server.py`:**
  - `offline_files` (the same vendor rule);
  - `without_google_key` (the bundle's inline data and `data/alignment.json`);
  - `build_embedded_images_json` (no pano in Google mode);
  - `do_bundle_check` (the warning, source `background`).
- **`app.js`:** `showExportFlaggedModal` (Edit opens the panel), and `collectOfflineAssets`
  (no pano in Google mode).
- **`sw.js`:** unchanged. Its fetch handler already returns early for other sites, so
  Google's tiles are never cached. Keep it that way.

**Lessons from the September experiment** (still true for a live view):
- Google's data has no sky; paint one.
- Far-away ground is always low-detail and asks for thousands of tiles; cap the draw
  distance and add haze.
- Measure the east / north / up axes from the library rather than assuming its
  conventions.

## 15. Progress log

### 2026-09-27 (latest): Phases 2 and 3 built; Phase 0 go

The owner tried Google's real imagery at their site with their own key and several heights:
"No this is all working fine. Lets move onto the other phases please". Recorded as D-13.

**Phase 2 (admin setup):**
- the Aerial background choice;
- the floating setup panel: key, Test and client steps; site; drone; top-down view,
  two-point align and measure;
- see §14.

**Phase 3 (shipping):**
- the Google-only vendor code is published and in the offline list for Google projects only;
- the parked pano is left out of publish, the offline list and the bundle;
- the key is left out of bundles;
- the bundle export warns, and its Edit opens the panel;
- `tests/test_google_earth.py` has 14 checks.

**Checked on the test ground** (`?gtiles=`, so the owner's key made no requests; nothing was
saved; the admin draft left by testing was cleared):
- sidebar and panel;
- top-down view;
- two-point align: the clicked plot lands within 3–8 cm;
- measure: 50.0 m and 212 m;
- drone re-aim;
- Test with a fake key;
- site from a Maps place link (pin beats centre);
- pano ⇄ Google switching, lossless both ways.

**Found and fixed while testing**
- The site box didn't follow a moved layout.
- The drone distance was measured from the last-saved site instead of the live one.
- **Offline copy:** a saved copy answers every same-site request, so the tiles code has to be
  in a Google project's offline list or the view fails even online.

**Not done:** a real publish to S3 (outward-facing; waits for the owner), and phones.

### 2026-09-27 (latest): Phase 0 tooling + Phase 1 built

The owner answered OQ-8, one key per project managed by the admin (D-12), and asked to
build Phase 0, then Phase 1.

**Phase 0**
- There is no Google key yet, so only the non-key parts were done.
- **Compatibility settled:** 3d-tiles-renderer 0.3.46 is the last release for three.js r160,
  so it's vendored with `tools/vendor_3d_tiles.py`. No three.js upgrade.
- **Readout:** `?gdebug=1` shows the numbers the check needs.
- **Not done:** the real-imagery check, which waits for a key.

**Phase 1:** built in `app.js`; see §14.

**Test ground**
- `spike/geo-tiles-test/` is a surveyed 3D Tiles ground at Eleganza's coordinates:
  - a 50 m grid;
  - north / east / south / west bands in red / green / blue / yellow;
  - two painted plot rectangles.
- The matching `projects/geo-test` has the plan rotated 30° and the drone 200 m south at
  150 m.
- `?gtiles=` loads the test ground through the exact code path Google's tiles use.

**Checked in the Browser pane**
- Ground measured at exactly 290.0 m.
- World axes: east = +X, north = −Z.
- Every plot corner within 4–11 mm of its painted rectangle. Two independent paths agree:
  the tileset's own Earth transform, and the overlay maths.
- Save round-trip exact: site, 30°, 0.5 m/px, ground height, and the parked pano transform.
- Visitor view: curtain, credits, compass.
- Tour takeover and restore.
- No key, and a fake key (`bad-key`), both give plan only with the right message.
- laxmi (pano) is unaffected.
- The standalone bundle's `app.js` still parses as a classic script.

**Bugs found and fixed while testing**
- **Refused-key answer lost:** the Google plugin retries any 4xx as an expired session,
  which threw away Google's answer to a refused key. The root request is now a plain fetch.
- **Blank sky on a slow load:** a sea-level fallback when no ground had loaded put the
  camera under the ground. It now waits for a real hit, then fails to plan only.
- **Credits stayed up during tours:** now hidden.

**Not yet verified**
- Google's real tiles, which also means the Draco path and Google's credit strings.
- Phones.
- The bundle still carries the key (Phase 3).

### 2026-09-27 (latest): Google keys per project

The owner decided that each client supplies the Google key for their own project and pays
for it. D-5 and D-10 were revised.
- **Where the key lives:** `background.google.apiKey` in the project's `alignment.json` (§9).
  It travels with the project, is never in git, and is left out of standalone bundles.
- **Admin:** a key field with Test, plus ready-to-send client instructions containing the
  project's exact website addresses.
- **Other people's keys:** reusing an existing server key (e.g. `GOOGLE_PLACES_API_KEY`) is
  advised against (§9).
- **Phase 0** needs only one test key.
- **New question:** OQ-8, a Build91 admin-only key for setup.

### 2026-09-27 (later): Owner's answers recorded

Recorded as D-5 to D-11:
- the owner's own Google Cloud account and billing;
- v1 looks around from one point, with capped orbit and fly wanted next (new §10a);
- one viewpoint per project;
- plan-only when offline or in a bundle;
- strictly one background per project;
- the owner accepts Google's terms;
- old imagery is fine.

The owner wrote "Google earth view can be working only when offline"; that is read as
**online**. Phase 0 gained a Google Cloud setup checklist for the owner. "Several viewpoints"
and "both backgrounds" were dropped from Phase 4. Still open: the budget and daily cap
numbers (OQ-1b).

### 2026-09-27: Plan created

The owner asked for a per-project choice between a drone panorama and a Google Earth
background for the aerial view, for projects with no drone shoot. The plots are to be traced
and overlaid as today. Planning only, no code. The September still-image experiment was set
aside by the owner.
