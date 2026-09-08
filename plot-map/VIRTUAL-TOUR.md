# Panoramic Virtual Tour — living implementation plan

> **Status: 🟢 Phase 1 steps 1–5 BUILT (2026-09-08) — authoring + client viewer + menu
> launch are in `app.js`. ⚠️ Verified statically only; the visual behaviour has NOT been
> confirmed in a browser, so the owner's first run is the real test.** Remaining in
> Phase 1: 1.8 (info hotspots). Phase 2 (depth glide) is DEFERRED — the owner declined
> both its prerequisites (no depth pass / no exported camera transforms; D-1→(a)), so the
> tour is crossfade-only for the foreseeable future; the glide plan is retained below only
> if those assets ever appear.
> Started 2026-09-02 · last worked 2026-09-08.
>
> **Test the tour:** `python server.py 8731`, then
> <http://localhost:8731/?project=panotour-demo> (client — menu → *3BHK WALKTHROUGH*) or
> <http://localhost:8731/?admin=1&project=panotour-demo> (admin — **Tour** tab →
> *Open tour to place hotspots*). Seeded by `spike/seed-demo-tour.py`; hotspot directions
> are evenly spread, **not surveyed** — drag them onto real doorways, then Save.
>
> **Run the Phase 0 spike (superseded, kept for reference):** <http://localhost:8731/spike/>
>
> **This is a LIVE document.** It must survive agent restarts and Claude-account swaps.
> Update it in the same turn as any tour-related work — tick phase checkboxes, move items
> between the Open Questions / Decisions tables, and append to the Progress Log at the
> bottom. Treat an un-updated plan as an incomplete change. See
> [CLAUDE.md → Documentation discipline](CLAUDE.md#documentation-discipline).
>
> Builds on the current architecture (see [CLAUDE.md](CLAUDE.md)): zero-build Three.js
> client, `projects/<id>/` data model, Python-stdlib `server.py`.
> Sibling planning doc for the plot-map features: [ROADMAP.md](ROADMAP.md).

---

## 1. Goal

Build a **multi-node panoramic virtual tour with hotspot navigation** — the visitor stands
inside one 360° panorama, clicks a hotspot, and moves to the next node — **replacing
3DVista** as the "room" the plot map links into, with **WebXR support on Quest**.

Explicitly **not** replicating Matterport's full feature set. No dollhouse view, no
measurement tools, no mesh reconstruction, no automated capture pipeline.

### Why this is tractable

The panoramas are **3D renders, not photographs**. That single fact changes the
engineering:

- A renderer can emit a **depth pass** for free (same camera, one extra AOV). Per-pixel
  depth is exactly what photogrammetry exists to *recover* — we get it exact and noise-free.
- With colour + depth per node we can **displace a sphere mesh into a rough 3D proxy** of
  the space and fly the camera between nodes with **real parallax**. That is the
  "glide-through-space" feel, achieved without any mesh reconstruction.
- Camera world transforms are **known exactly** from the 3D scene, so node positions,
  heading continuity and the minimap are all free — none of the manual north-alignment
  drudgery that photographic tours require.

### Why most of it is already built

The tour *engine* is new. The *CMS around it* is not:

| Existing system | Reused as |
|---|---|
| **Landmarks** (direction-anchored, drag-to-place, screen-projected, save/load) | **Navigation hotspots** — this is ~80% of hotspot authoring, already debugged |
| **Amenities** (icon pin + info card + lightbox) | **Info hotspots** inside a tour |
| Pano sphere + `loadPanoTexture` + `gpuMaxTexSize()` cap | Node rendering (the GPU cap matters on Quest) |
| Yaw/pitch Euler camera + `clampView` + `setFov` | Tour camera |
| `projects/<id>/` + `server.py` save API + admin tabs | Tour authoring & publishing |
| IndexedDB working session | Unsaved tour-edit recovery |
| Standalone bundle export + `<iframe>` embed | Shipping a tour to any static host |
| Branding, popover/modal/lightbox UI | Tour chrome |

---

## 2. Decisions locked (from product owner, 2026-09-02)

| # | Question | Decision |
|---|---|---|
| L1 | Replace 3DVista, or coexist? | **Replace.** The tour engine becomes ours; `tour_url` eventually points at an internal route, not an external 3DVista URL. |
| L2 | Capture source | **3D renders** — interior *and* exterior. Not photography. |
| L3 | Node placement | **Eyeballed** (as stated) — ⚠️ **contested, see [D-1](#4-decisions-to-be-made-engineering)**. Eyeballed placement and the depth glide are mutually exclusive. |
| L4 | Transition fidelity | **Glide-through-space preferred**; crossfade acceptable as fallback. |
| L5 | VR target | **Real headset — WebXR in the Quest browser.** Not cardboard/magic-window. |
| L6 | Stereo | **Mono is acceptable** for v1. |

---

## 3. Open questions (need an answer from outside the code)

Owner = who can answer. Update **Status** and record the answer inline when resolved.
Resolved items stay in the table (struck through) so the history survives.

| # | Question | Why it matters | Owner | Status |
|---|---|---|---|---|
| **OQ-1** | Can the artists emit a **depth pass + camera transform manifest** for the renders that already exist, or must the back catalogue be **re-rendered**? | If existing content can't be reprocessed, the glide only applies to *new* sites and Phase 2 sequencing changes. **Gates Phase 0-C.** | 3D team | 🟠 **Partially answered 2026-09-03** — the `panotour-demo` set ships **colour only**: 9 × 8192×4096 RGB(A) PNG, no depth, no transforms. So *as delivered* the answer is no. Still open whether the source scenes can be re-rendered with the extra passes. |
| **OQ-8** | Are the 9 demo rooms **one coherent apartment** in a single 3D scene, or unrelated library renders? | Visual inspection suggests **different scenes**: floor/wall materials and styles differ markedly between rooms (Master Bedroom warm wood vs Living Room white marble vs Drawing Room grey). If they are unrelated, there is no shared coordinate system to recover, no true adjacency, and the demo can only ever be a **showcase reel**, not a spatial walk. Affects OQ-4 and how representative any Phase 0 result is. | 3D team | 🔴 Open |
| **OQ-2** | What DCC / renderer produces these? (Blender / 3ds Max+V-Ray / Corona / other) | Determines the exact depth-AOV setup, whether radial distance is available natively, and how the camera manifest gets exported. | 3D team | 🔴 Open |
| **OQ-3** | Typical **node count per tour**, and per project? (5 / 30 / 200) | Drives texture-lifecycle strategy. Under ~10 we can be naive; beyond that we need LRU + prefetch + progressive resolution. | Product owner | 🔴 Open |
| **OQ-4** | Are exteriors and interiors **one connected graph** (walk from the site into a villa) or separate tours linked from the plot map? | Affects the node graph model and whether the aerial pano becomes node zero. | Product owner | 🔴 Open |
| **OQ-5** | How many **existing 3DVista tours** must be migrated, and is there a deadline that runs alongside them? | Determines whether Phase 1 must ship at 3DVista parity or can ship minimal. | Product owner | 🔴 Open |
| **OQ-6** | What is the **production hosting** for tours? WebXR requires **HTTPS** — local `server.py` (plain HTTP) cannot serve VR. | Phase 3 cannot be tested without an HTTPS host. Standalone bundle on Netlify/S3 satisfies this. | Product owner | 🔴 Open |
| **OQ-7** | Is there a **scale/units convention** in the 3D scenes (metres? centimetres? arbitrary)? Consistent across artists and across projects? | Depth values and camera positions must share one unit system or the warp geometry is wrong. | 3D team | ✅ **Moot (2026-09-08).** Only matters for the depth-warp glide (Phase 2), which is deferred. Crossfade has no geometry warp and no inter-node camera translation, so units are irrelevant to everything now being built. Re-open only if the glide is revived. |

**✅ Owner resolutions — 2026-09-08.** All open questions answered; recorded here (the
table rows above are kept for history):
- **OQ-1 (depth pass):** stay colour-only for now, no changes. ⇒ **no glide; crossfade
  transition.**
- **OQ-8 (one scene vs library):** treat nodes as one coherent tour; **coherence is the
  admin's responsibility on upload** (they choose which panos belong together). No
  auto-adjacency inference needed.
- **OQ-2 (renderer/DCC):** N/A while colour-only (only mattered for the depth-AOV setup).
- **OQ-3 (node count):** **~15 nodes per tour, ~30 per project** ⇒ multiple tours per
  project; the spike's LRU + neighbour-prefetch texture lifecycle is required (a project
  won't hold 30 × ~45 MB in VRAM). Per-tour 15 is comfortably navigable.
- **OQ-4 (interior/exterior graph):** **separate tours, each launched from the menu** —
  NOT one connected graph and NOT auto-linked to the plot map. ⇒ `tour.json` holds
  **multiple independent tours**; a menu item launches one by id.
- **OQ-5 (3DVista migration):** ignore — no migration/deadline constraint.
- **OQ-6 (hosting/HTTPS):** yes — production will move to **HTTPS** (needed for WebXR in
  Phase 3; not needed for the Phase 1 crossfade authoring/viewing built now).

---

## 4. Decisions to be made (engineering)

Ours to make, but not yet made. Each carries a recommendation. Move to **Locked** with a
date once agreed; do not silently change a locked row.

| # | Decision | Options | Recommendation | Status |
|---|---|---|---|---|
| **D-1** | **Node positioning** — eyeballed vs exported camera transforms | (a) Admin drag-to-place only. (b) Import exact transforms from the render scene, admin override for edge cases. | **(b), strongly.** L3 as stated **kills the glide** — depth warping needs the true translation vector between nodes; a guessed one produces *wrong* parallax, which reads worse than none. Exporting transforms is a few lines of script, done once, and additionally buys free heading continuity, auto-generated hotspots and a working minimap. **Recommend reversing L3.** | 🔒 **Locked 2026-09-08 → (a) admin drag-to-place only** (owner overrode the recommendation). Consistent with colour-only/OQ-1: with no depth glide there's no need for true transforms. This **confirms Phase 2 (glide) is deferred** — it structurally needs (b). |
| **D-2** | **Depth encoding on disk** | 16-bit PNG · RGB-packed 24-bit PNG · EXR · KTX2 | **RGB-packed reciprocal depth in a lossless PNG**, unpacked in the shader. Canvas silently decodes 16-bit PNG down to **8 bits** (256 levels ⇒ visible terracing in the warp). Reciprocal (1/z) concentrates precision near the camera where parallax is strongest. **Never JPEG a depth map** — edge artifacts become geometric spikes. | 🟡 Recommended, unratified |
| **D-3** | **Depth resolution** relative to colour | Same as colour · ½ · ¼ | **¼ colour resolution** (e.g. 2048×1024 against an 8K colour pano). The depth map only drives a transition proxy, not final pixels. Keeps per-node depth in the low hundreds of KB. Revisit if silhouettes look chunky in Phase 0. | 🟡 Recommended, unratified |
| **D-4** | **Node texture format** | Equirect (as today) · Cubemap (6 faces) | **Equirect for Phase 0–1** (reuses the entire existing pano path). Revisit at Phase 2 if streaming/tiling pressure appears — cubemaps tile better and avoid pole distortion, but would fork the texture pipeline. | 🟡 Recommended, unratified |
| **D-5** | **VR transition style** | Same glide as desktop · fast fade-teleport in VR | **Fade-teleport in VR, glide on desktop** — user-uninitiated smooth translation is a textbook sim-sickness trigger. Implies the transition system must be **swappable per-platform**, not one global behaviour. Design for that from Phase 1. | 🟡 Recommended, unratified |
| **D-6** | **Tour data model home** | New `tour.json` per project · extend `alignment.json` · a `tours/` subdir per project | **`projects/<id>/tour.json`**, additive and optional — a project with no `tour.json` behaves exactly as today. Matches how `landmarks.json`/`amenities.json` were added. | 🟡 Recommended, unratified |
| **D-7** | **Plot-map ↔ tour relationship** | Tour is a separate mode · aerial pano becomes node zero of the same graph | **Separate mode for Phase 1** (lower risk, ships sooner); **unify in Phase 5** so clicking a plot descends into its tour. The unified version is something 3DVista structurally cannot do and is the strongest argument for owning the engine. | 🟡 Recommended, unratified |
| **D-8** | **Stereo in VR** | Mono sphere · render the depth-displaced proxy from two eye positions · true stereo re-render | **Mono for v1** per L6. Note that depth gives us a *free* pseudo-stereo option worth prototyping in Phase 3 — but disocclusion smears stop being masked by motion and sit persistently in peripheral vision. **Prototype, don't promise.** True stereo is a re-render (not a re-shoot) so that door stays open. | 🟡 Recommended, unratified |
| **D-10** | **One pano derivative or two?** | Single 8192×4096 for everyone · **8K desktop + 4K mobile** | **Two derivatives.** Many phones cap texture size at 4096, so an 8K pano is downloaded (2.3 MB), decoded (33 MP, ~1 s) and *then* thrown away by the existing downscale — paying full cost for a quarter of the result. Measured 4096×2048 q85: **0.69 MB/node (6.2 MB whole tour), ~45 MB VRAM** vs 179 MB. On mobile that is the difference between a tour that holds 3 rooms and one that holds 9. `prep-panos.py` already takes `--size`, so this is a pipeline flag, not new code. | 🟡 Recommended, unratified — raised by 0-A |
| **D-9** | **Hotspot authoring UX** | Fork the landmarks tab · new Tour tab reusing landmark internals | **New "Tour" tab reusing the landmark drag/projection internals.** Keeps concerns separate in the UI while sharing the debugged code underneath. | 🔒 **Locked 2026-09-08 → new Tour tab** (owner). 4th admin tab alongside Align/Landmarks/Amenities. |

**All other decisions accepted as their recommendation (owner, 2026-09-08).** The
Phase-1-relevant ones are now in force: **D-4** equirect nodes (reuse the existing pano
path), **D-5** swappable transition (crossfade on desktop; VR fade-teleport later),
**D-6** per-project `tour.json`, **D-10** two pano derivatives (8K desktop / 4K mobile —
a `prep`/resize flag, applied when node uploads land). D-2/D-3/D-8 are depth/stereo
concerns that only matter if Phase 2 is revived.

### New engineering decisions for the Phase 1 build (2026-09-08)

| # | Decision | Choice | Status |
|---|---|---|---|
| **D-11** | **Client tour viewer surface** — full-screen overlay with its own canvas, vs take over the existing main viewer | **Take over the main viewer.** Entering a tour swaps the pano sphere's texture per node, hides the plot overlay / landmarks / amenities / plot menu, projects nav hotspots through the **same HTML-overlay path as landmarks**, and crossfades by fading a second temporary sphere. Reuses the camera, `clampView`/`setFov`, projection and drag internals — far less new code than a parallel canvas. A tour ✕/Back restores the plot-map exactly. | 🔒 Locked |
| **D-12** | **How a menu item launches a tour** | New menu **`contentType: 'panotour'`** whose `content` is `{ tourId }`, dispatched in `openNodeContent` → `openClientPanoTour(tourId)`. Kept **distinct from the existing external-3DVista `tour` type** (which is an iframe URL/file), so both coexist during migration. | 🔒 Locked |
| **D-13** | **`tour.json` shape** — one tour per file vs many | **One `projects/<id>/tour.json` holding many tours** (OQ-4): `{ version, tours:[{ id, name, startNode, nodes:[{ id, name, pano{file}, defaultView{lonDeg,latDeg,fov} }], links:[{ from, to, hotspot{lonDeg,latDeg}, label }] }] }`. Absent ⇒ no tours (today's behaviour). Additive/optional, loaded/saved/exported/bundled/sessioned exactly like `landmarks.json`/`amenities.json`. | 🔒 Locked |

---

## 5. The render pipeline contract ⚠️

**The biggest risk on this project is not code — it is asset discipline.** Lock this before
anyone renders a second batch. Every node must ship:

1. **Colour** — equirectangular, 2:1, consistent resolution per project.
2. **Depth** — equirectangular, same camera, **radial distance from the camera**, *not*
   planar Z-depth. Most renderers default to planar Z; feeding planar Z into a spherical
   warp makes the whole room bulge. Lossless format, linear units, documented scale.
3. **Camera transform** — world position + rotation, in the scene's units, consistent axis
   convention across every node and every artist.

Also required per project: a single **scale/unit convention** (see OQ-7) and a stable node
id scheme.

If this is sloppy — planar depth on some nodes, missing transforms on others, a scene
rebuilt at a different scale halfway through — downstream time goes into asset forensics
rather than the viewer. **Write this contract down and hand it to the 3D team as a
one-pager before Phase 0 assets are produced.**

---

## 6. Phases

Each phase is independently shippable. Checkboxes are the live progress marker.

### Phase 0 — Validation spike (throwaway) 🟢 0-A/0-B done · 🔴 0-C blocked

> **Split on 2026-09-03.** The `panotour-demo` assets turned out to be colour-only, so the
> original single-phase plan (which assumed depth) could not run as written. Rather than
> stall, it was split into what these assets *can* answer (0-A, 0-B — both now built and
> genuinely useful) and what they cannot (0-C). The spike lives in
> **[`spike/`](spike/)**: `index.html` (harness), `prep-panos.py` (asset pipeline),
> `proj-test.mjs` (projection maths test). It does **not** touch `app.js`.

#### 0-A — Asset weight & texture lifecycle ✅ done

Answered with real measurements from the 9-room demo set:

| Finding | Value |
|---|---|
| Raw PNG renders (9 × 8192×4096) | **343 MB** — unshippable in any form |
| After `prep-panos.py` (8192×4096, q82 — the setting `app.js` already uses) | **20.8 MB total**, ~2.3 MB/node (**16.4×** smaller) |
| Est. GPU if all 9 resident (RGBA + mips) | **~1.6 GB** — impossible |

**The key distinction this made concrete: download weight and GPU residency are separate
problems, and JPEG only solves the first.** A 9-node tour downloads fine at ~21 MB but
cannot hold its nodes in VRAM, so **LRU eviction is mandatory rather than an
optimisation** — Phase 1.5 is not deferrable. The spike implements eviction + neighbour
prefetch with a live GPU-estimate readout so the ceiling is visible while navigating.

**What this means for the buyer.** Three moments decide whether the tour feels premium:

| Moment | Raw PNG (343 MB) | After prep (20.8 MB) |
|---|---|---|
| **First room appears** (2.3 MB vs 48 MB) | ~19 s on 20 Mbps 4G — they leave | **~0.9 s** on 4G, ~0.4 s on wifi |
| **Whole tour cached** | ~2.3 min on 4G | **~8 s** on 4G, ~3 s on wifi |
| **Next room on click** | always a wait | **instant** — prefetch has it already |

The third row is the one that sells. Because neighbours are prefetched while the visitor
is *looking around* a room, walking the tour in order feels seamless — no spinner between
rooms. What breaks that is **jumping** (clicking a distant room in a list): that node was
never prefetched, and if the cache has since evicted it, they wait again. So the
navigation UX should **favour hotspot walking over a room-jump menu**, and any jump target
needs a deliberate loading state rather than a frozen frame.

Add ~0.3 s desktop / ~1 s mobile of **JPEG decode** for an 8192×4096 frame on top of every
download — invisible when prefetched, very visible when not.

- [x] Repeatable asset-prep script emitting `.web.jpg` + a `tour.json` skeleton.
- [x] LRU cache with configurable capacity, never evicting the on-screen node.
- [x] Neighbour prefetch (toggleable) + per-node load timing + FPS + GPU meter.

#### 0-B — Multi-node navigation & crossfade ✅ built, needs visual sign-off

- [x] Node graph loaded from `tour.json`; 9 nodes, ring topology (placeholder — real
      adjacency needs OQ-4/OQ-8).
- [x] Direction-anchored hotspots projected to screen each frame — the same model
      `app.js` uses for landmarks, confirming Phase 1 can reuse that code.
- [x] **Swappable transition interface** (`cut` / `crossfade` / `glide`) with duration
      control. `glide` is *registered and refuses with an explanatory error* rather than
      being absent, so the seam Phase 2 slots into is real and visible.
- [x] Per-node **manual heading offset** slider — which exists precisely to demonstrate
      the authoring cost of **D-1**: with camera transforms this number is derived, not
      dialled.
- [ ] **Visual sign-off by the user** (WebGL can't be verified from this side — see
      *How to verify* in CLAUDE.md).

#### 0-C — Depth-warp glide 🔴 BLOCKED on OQ-1

Cannot start: no depth pass, no camera transforms. **Do not fake this with synthetic
depth** — a spike run on invented depth would validate only the arithmetic, not the thing
actually in question (real disocclusion behaviour at real node spacing), and would produce
false confidence. It stays blocked until real assets exist.

Original steps retained for when they do:

**Purpose:** prove the depth-warp glide works on *real* assets before building any product
around it. Interiors are the hard case — nodes sit close together, so parallax between them
is large, which is exactly where crossfades look worst and disocclusion is most visible. If
it holds up in an interior it will be trivial outdoors. **If it fails, we learn that for the
cost of a couple of days and ship crossfades instead (Phase 2 is dropped, everything else
proceeds unchanged).**

**Explicitly a throwaway.** Lives in `plot-map/spike/` (or a scratch dir), does **not**
touch `app.js`, is not wired into the admin, and is deleted or archived once the decision
is made. Do not let it grow into the implementation.

**Inputs required** (blocked on OQ-1 / OQ-2 / OQ-7):
- [ ] Two **adjacent interior** nodes from the same scene, ideally 2–4 m apart with partial
      mutual visibility (a doorway or a room corner — something where parallax is obvious).
- [ ] Colour equirect for each.
- [ ] Radial-distance depth for each, lossless, known units.
- [ ] Both camera world transforms, same coordinate system, same units.
- [ ] One extra pair from an **exterior** node for contrast (optional but useful).

**Steps:**
- [ ] 0.1 — Write the depth-decode path: load the depth image, unpack to linear distance,
      and **visually sanity-check it** (render depth as greyscale on the sphere). Confirm
      radial-vs-planar is correct here, before anything else is built on top of it.
- [ ] 0.2 — Build the displaced sphere: subdivided sphere (start ~512×256 verts), each
      vertex pushed along its ray by the decoded depth. Render node A from node A's
      position — should look **identical to the flat pano** (a correct proxy is invisible
      from its own capture point). This is the key correctness check.
- [ ] 0.3 — Place both nodes' proxies in a shared world using the camera transforms. Move
      the camera to node B's position while still rendering node A's proxy. Parallax should
      now be visibly, *correctly* wrong-looking (stretched, but geometrically plausible).
- [ ] 0.4 — Add the cross-dissolve: animate camera A→B over ~400–600 ms while blending A's
      proxy out and B's in. Tune duration and easing.
- [ ] 0.5 — Evaluate honestly against the success criteria below. Try the exterior pair.
- [ ] 0.6 — Record the verdict and measurements in the **Progress Log**, and set D-2/D-3
      to locked or revised based on what was observed.

**Success criteria (agree these before looking at the result, to avoid grading on a curve):**
- The transition reads as **moving through space**, not as a fade.
- Disocclusion smears are present but **not the thing the eye lands on** at full speed.
- No terracing/banding from depth quantisation (if there is, D-2 encoding is wrong).
- Comfortable at 60 fps on a normal laptop with two proxies live.
- A first-time viewer, shown it once, describes it as movement rather than as a glitch.

**Kill criteria:** if smearing dominates at realistic node spacing, or depth precision
can't be made sufficient, **drop Phase 2** and ship crossfades. That is an acceptable
outcome, not a failure — L4 explicitly permits it.

---

### Phase 1 — Multi-node tour with crossfade 🟢 steps 1–5 built (2026-09-08) · 1.8 open · awaiting in-browser sign-off

Ships a **usable 3DVista replacement** on its own, independent of whether Phase 0 succeeds.
**Now the active build** — scope locked by D-1(a)/D-9/D-11/D-12/D-13 above:
crossfade only, drag-to-place nodes + hotspots, **multiple tours per project**, each
launched from a **menu item** (`panotour` content type); the client viewer **takes over
the main pano** and reuses the landmark projection/drag internals. Build order this
phase: **(1) `tour.json` data model + load/save/export/session/bundle → (2) admin Tour
tab (create/rename/delete tours; per-tour node list; upload node panos; per-node default
view) → (3) hotspot authoring (drag-to-place a link hotspot on a node, pick its target
node) → (4) client tour viewer (enter/exit takeover, node switch, crossfade, projected
nav hotspots, heading continuity) → (5) menu `panotour` launch + LRU/prefetch texture
lifecycle.**

- [x] 1.1 — Tour data model (`projects/<id>/tour.json`, per D-6) — **done 2026-09-08**
      (many tours/project; parse/build/load/save/session/export wired; admin Tour tab
      manages tours + node uploads). Sketch:
      `{ version, nodes: [{ id, name, pano{file}, depth?{file}, position?{x,y,z},
      heading?, defaultView{lonDeg,latDeg,fov} }], links: [{ from, to, hotspot{lonDeg,latDeg},
      label? }], startNode }`. Absent file ⇒ today's single-pano behaviour, unchanged.
- [x] 1.2 — **done 2026-09-08.** Node switching in the viewer: load node, set default view, honour heading
      continuity (preserve the visitor's facing direction across the move).
- [x] 1.3 — **done 2026-09-08.** Crossfade transition, built behind a **swappable transition interface** (per
      D-5) so the glide and fade-teleport can slot in later without a rewrite.
- [x] 1.4 — **done 2026-09-08.** Navigation hotspots, reusing the landmark direction-anchoring, projection and
      drag internals.
- [x] 1.5 — **done 2026-09-08** (LRU cap 3 + one-hop prefetch; no low-res placeholder yet). Texture lifecycle: low-res placeholder that sharpens on arrival, prefetch of
      all one-hop neighbours, LRU eviction. **Sizing depends on OQ-3** — under ~10 nodes
      this can be deliberately naive and revisited.
- [x] 1.6 — **done 2026-09-08.** Admin **Tour** tab (per D-9): node list, add/remove nodes, link authoring,
      per-node default view, pano+depth upload.
- [x] 1.7 — **done 2026-09-08** (bundle gap closed: `tour.json` in `BUNDLE_DATA_FILES`, node panos in `B91_BUNDLE_IMAGES`). Tour state in the IndexedDB working session; `tour.json` + node images in
      Export / Save / standalone bundle.
- [ ] 1.8 — Info hotspots, reusing the amenity card + lightbox.

**Verification:** author a 3-node tour end-to-end in admin; save; load as client; navigate
all links; confirm heading continuity; export a standalone bundle and run it from a plain
`python -m http.server` with **zero `/api` calls**; `node --check`.

---

### Phase 2 — Depth-warp glide 🔴 not started · gated on Phase 0

- [ ] 2.1 — Promote the Phase 0 depth decode + displaced-proxy code into `app.js`, properly
      structured (the spike itself is discarded, not merged).
- [ ] 2.2 — Glide transition implementing the Phase 1 transition interface.
- [ ] 2.3 — **Automatic fallback to crossfade** for any node lacking a depth map or a
      position. This matters operationally: a node can ship before its depth pass exists.
- [ ] 2.4 — Camera-transform import in admin (per D-1) — paste/upload the manifest, with
      drag-to-place as the manual override.
- [ ] 2.5 — Tune: transition duration, easing, disocclusion mitigation, proxy vertex count.
- [ ] 2.6 — Perf budget check with two proxies live on mid-range mobile.

---

### Phase 3 — WebXR on Quest 🔴 not started

**The rendering is the easy half.** The existing `gpuMaxTexSize()` path already does the
right thing on mobile-class hardware. The hard half is that **none of the current UI exists
inside an XR session** — landmark banners, popovers, cards, admin bar are all DOM overlay
and are simply invisible in a headset.

- [ ] 3.1 — WebXR session lifecycle: enter/exit, XR-compatible renderer, reference space.
- [ ] 3.2 — **In-world UI layer**: hotspots as 3D objects, info cards as world-space planes.
      This is an interaction-design task more than a rendering one, and it is the bulk of
      the phase.
- [ ] 3.3 — Controller raycast input + hover/select affordances; gaze-fuse fallback.
- [ ] 3.4 — Fade-teleport transition for VR (per D-5).
- [ ] 3.5 — Comfort pass: transition speed, no uninitiated translation, vignetting if needed.
- [ ] 3.6 — HTTPS test path (blocked on OQ-6 — local `server.py` cannot serve WebXR).
- [ ] 3.7 — *(Optional, prototype only)* depth-derived pseudo-stereo (per D-8).

---

### Phase 4 — 3DVista parity items 🔴 not started

Scope here depends on OQ-5. Candidates, in likely priority order:

- [ ] 4.1 — Floor plan / minimap with node dots (free if D-1 lands as recommended).
- [ ] 4.2 — Autorotate / idle behaviour.
- [ ] 4.3 — Media hotspots (video, image, text) — largely covered by the existing
      multi-attachment plot media work.
- [ ] 4.4 — Tour-level branding, intro screen, loading state.
- [ ] 4.5 — Deep-linking into a specific node (`?tour=<id>&node=<id>`).

---

### Phase 5 — Unify with the plot map 🔴 not started

- [ ] 5.1 — Make the aerial pano **node zero** of the graph (per D-7).
- [ ] 5.2 — Clicking a plot **descends into that plot's tour** instead of opening an
      external URL.
- [ ] 5.3 — Migrate `tour_url` from 3DVista URLs to internal node references, keeping
      external URLs working for un-migrated plots.

---

## 7. Cross-cutting concerns

- **Backward compatibility.** Every project without a `tour.json` must behave exactly as
  today. All new config is additive and optional — the same discipline that made
  landmarks/amenities/branding safe to add.
- **Device long tail.** Replacing 3DVista means inheriting a decade of their
  device-compatibility fixes. Expect a tail of old-Android-browser issues they solved years
  ago. Budget for it; don't be surprised by it.
- **Security.** The `/api/save|rename|delete` API remains **unauthenticated**. Tours add
  more admin surface and larger uploads; the trusted-network constraint still applies and
  becomes more uncomfortable as more content flows through it.
- **Asset weight.** A multi-node tour is the largest thing this app has ever shipped.
  Bundle size, first-paint and mobile data use all need a deliberate answer at Phase 1.5,
  not a discovered one.
- **Docs discipline.** Every phase ships with `CHANGELOG.md` + `CLAUDE.md` + `README.md`
  updates *and* a tick in this file, in the same turn. See the `keep-docs-current` skill.

---

## 8. Progress log

Newest on top. One entry per work session, however small. Record what was done, what was
learned, and what the next agent should pick up.

### 2026-09-08 (latest) — Phase 1 steps 2–5: viewer, hotspot linking, `panotour` menu

The owner could not test step 1 because **nothing consumed the data yet**. Traced the full
chain and found four separate breaks, not one: `links: []` (no hotspot authoring), no menu
content type that could reference a tour, no client viewer, and `menuConfig.tree = []` on
the test project (so the client menu was empty — the visible symptom). All four now fixed.

**Bug found first, and it mattered:** every node pano the owner had uploaded was a
**15-byte `[object Object]`** on disk. `resizeImageToBlob` returns `{blob,W,H}`;
`addTourNodeFromFile` stored the wrapper as `panoBlob`, which `serverSave` stringified.
Step 1's verification passed because it checked files *appeared*, not that they decoded —
worth remembering as a verification-design lesson, not just a typo. Repaired the three
corrupt files in `pano-testamit`.

**Built**, reusing the spike rather than rewriting it: `openClientPanoTour`/`closePanoTour`
(D-11 takeover of the existing sphere — one WebGL context), `tourGoTo` + crossfade via a
second sphere sharing the pano geometry, `tourTex` LRU (cap 3) + one-hop prefetch straight
from the 0-A finding, direction-anchored nav hotspots projected each frame through the
landmark path, admin drag-to-place/retarget/relabel/delete + per-node start view, and the
`panotour` menu content type (`content.tourId` → `openClientPanoTour`) with a wizard tour
picker that warns when a tour has no nodes or no links. `server.py`: tour-only projects are
now real projects (`plots.svg` **or** `tour.json`), and the standalone bundle carries
`tour.json` + every node pano as a data: URI (they are WebGL textures, so `file://` rejects
them as loose files) — that closes the 1.7 gap flagged in the previous entry.

Two conventions worth carrying forward: hotspots store the **landmark/stored** lon
convention while `defaultView` stores a **camera** lon (mixing them mirrors placement), and
the crossfade sphere **shares** `three.pano.geometry` (dispose the material only).

**Demo:** `spike/seed-demo-tour.py` converts `panotour-demo` from the spike's flat
`{nodes,links}` shape (which `parseTours` reads as zero tours) into the app's `{tours:[…]}`
shape — 9 rooms, 16 links, living room as hub — and writes an `alignment.json` with a
`panotour` menu item. Its hotspot directions are **evenly spread, not surveyed**; they need
dragging onto real doorways. Also moved 343 MB of raw PNG masters into `_source/`:
`do_bundle` copies every top-level project file, so they were shipping in every export —
**bundle 392 MB → 43.5 MB**.

**Verification status — read this before trusting it.** Static only: `node --check`,
`ast.parse`, cross-checks that every new helper/CSS class/HTML id resolves, `/api/projects`
listing, and a real bundle built through the endpoint and inspected (tour + 9 panos
embedded). **No browser was available this session**, so the crossfade, hotspot placement,
takeover/restore and menu launch are *unproven visually*. The next session should either
drive it in a browser or take the owner's first run as the real test.

**Next:** owner runs `/?project=panotour-demo`; then 1.8 (info hotspots), and Phase 4
parity items (minimap is cheap now that nodes have a link graph, though without positions
it can only be a graph diagram, not a floor plan).

### 2026-09-08 (later) — Phase 1 step 1 built: tour.json data model + admin Tour tab

First tour code landed in `app.js`/`index.html`/`styles.css` (no `server.py` change yet —
bundle support for tours is still to come). Built the **data model** (`tour.json`, many
tours/project, D-13) — `parseTours`/`buildToursData`/`loadToursFile`/`setTours`/
`tourNodeBlobFiles`/`saveToursAs`, mirroring amenities — wired into `buildSession`
(node pano blobs ride the session), `exportSite` (writes `tour.json` + node images), and the
boot loader (session > committed file). Added a 4th admin **Tour** tab (`setAdminTab` now
4-way) with `refreshTourList`: add/rename/delete tour, per-tour node list with pano upload
(`addTourNodeFromFile` → `resizeImageToBlob` at the pano cap), rename node, set start node,
delete node, Save/Load.

Verified end-to-end in the in-app Browser pane on a throwaway `zztourtest` project (removed
after): add tour, upload 2 node panos, rename, set start, delete a node → server save wrote
`tour.json` (basename `sample/tour-t1-nN.web.jpg` paths, `startNode:"n2"`) + node images to
disk → **session-discarded reload restored** the tour/nodes/start-node from the committed
file. Zero console errors; `node --check` + `python ast.parse` clean.

**Checklist:** ✅ 1.1 (data model). 🟡 1.6 partial (node management + upload done; per-node
default-view and link authoring happen in the viewer — steps 3/1.2). 🟡 1.7 partial (session
+ Export done; **standalone bundle does NOT yet embed `tour.json`/node images** — needs a
`server.py` `do_bundle` change, and node panos are WebGL textures so they must go into
`B91_BUNDLE_IMAGES` like the pano/plan — TODO with the viewer).

**Next:** step 4 — the client crossfade **tour viewer** (D-11 takeover: swap node textures,
hide plot overlay, project nav hotspots via the landmark path, crossfade via a temp second
sphere), which is also where step 3 (hotspot drag-to-link) and per-node default-view live;
then step 5 (`panotour` menu launch) + LRU/prefetch.

### 2026-09-08 — owner signed off 0-B; all OQs answered; Phase 1 scope locked

The owner reviewed the `spike/` tour ("looks ok for now") and asked for **node + hotspot
placement and linking to the next pano to be a real admin feature**. Answered every open
question (see the OQ table / resolution block) and locked the decisions:
- **D-1 → (a) drag-to-place only**, **D-9 → new Tour tab**, all others as recommended.
- New build decisions **D-11** (viewer takes over the main pano), **D-12** (`panotour`
  menu content type → `openClientPanoTour(tourId)`), **D-13** (`tour.json` holds many
  tours).
- **Consequence:** Phase 2 (depth glide) is **deferred** — both its prerequisites were
  declined. We build the **crossfade** multi-node tour = the 3DVista replacement (Phase 1),
  which was always independently shippable.
- OQ-3 (15/tour, 30/project) confirms Phase 1.5's LRU + prefetch texture lifecycle is
  required, not optional.

**Next action:** implement Phase 1 (steps below) — data model → Tour tab authoring →
client crossfade viewer + hotspot nav → menu launch → persistence/session/export/bundle.
Nothing built yet this turn beyond locking the plan.

### 2026-09-03 (later) — upside-down pano fixed; per-node orientation added

User feedback on the 0-B harness: panos rendered **upside down**. **This was a spike bug,
not a stitching problem** — the source renders are fine. `app.js` sets `tex.flipY = false`
in all three of its texture paths; the spike used `TextureLoader`'s default `flipY = true`,
which flips the image on upload so `uv.y = 0` lands on the image *bottom*, putting the
floor at the zenith. **Second time the same lesson has bitten in this spike: matching
`app.js`'s geometry is not enough, the texture flags are half the convention.** Worth
carrying into Phase 1 as a checklist item.

Also added, per the user's request for a rotation control:
- **Per-node yaw** (−180…180 slider + ↺90 / ↻90 / 180 / Reset) and a **Flip 180°** toggle
  — a true *roll* (both axes), not a bare vertical flip, which would mirror the room.
- Implemented as a **texture transform** (`offset`/`repeat`/`center`), so it is free per
  frame and each node keeps its own value. Persists to `localStorage`.
- **⧉ Copy orientations** emits `[{id, yaw, flip}]` as JSON. This makes the spike produce
  the very data the renders shipped without — a hand-authored stand-in for the camera
  transforms of **D-1**, and a direct measure of that authoring cost (9 nodes dialled by
  hand vs one export script).
- Heading continuity is now the honest model: `view.lon` is simply carried across nodes,
  which only *means* anything once every node's yaw puts them in a shared frame.

New decision raised by 0-A: **D-10 — ship two pano derivatives** (8K desktop / 4K mobile).

### 2026-09-03 — Phase 0-A/0-B implemented; 0-C confirmed blocked

**Assets.** `projects/panotour-demo/` holds 9 interior renders (Master Bedroom, Bedroom ×2,
Washroom ×2, Living, Dining, Drawing, Kitchen), all correct 2:1 equirects at exactly
8192×4096 — which happens to match `PANO_TEX_CAP`, so no downscale is needed on desktop.
**Colour only: no depth, no camera transforms** ⇒ OQ-1 answered "not as delivered", 0-C
blocked. Visual inspection also suggests the rooms are *different scenes*, not one
apartment (logged as OQ-8) — if so there is no adjacency to recover and the demo is a
showcase reel rather than a spatial walk.

**Built** (`spike/`, throwaway, does not touch `app.js`):
- `prep-panos.py` — repeatable asset pipeline. **343 MB → 20.8 MB (16.4×)**, emits a
  `tour.json` skeleton. Warns on any non-2:1 source.
- `index.html` — multi-node harness: hotspot navigation, swappable transition interface,
  LRU texture cache + prefetch, live GPU/FPS/load instrumentation, per-node heading slider.
- `proj-test.mjs` — headless projection-maths test (no WebGL needed).

**Main 0-A finding:** download weight and GPU residency are *separate* problems and JPEG
only fixes the first. 21 MB downloads fine; ~1.6 GB of resident texture does not. **LRU
eviction is mandatory, not an optimisation** — Phase 1.5 cannot be deferred.

**⚠️ Incidental finding in `app.js` — worth a targeted check, not yet a confirmed bug.**
Writing the spike's projection maths surfaced that `app.js` pairs
`cam.rotation.set(lat, lon + PI, 0, 'YXZ')` (`updateCamera`, ~L820) with an **X-reflected**
`dirFromLonLat` (`-cl*sin(lon)`, ~L2911). Those two are **mirrored in x**: numerically,
looking at `view.lon = 137°` projects a hotspot stored at `lonDeg 137` to `ndc.x = -10.5`
(i.e. far off-screen) instead of the centre; only `lon = 0` and `180` come out right, which
is why it survives casual inspection. `PI - lon` is self-consistent for every longitude —
the spike uses that, and `spike/proj-test.mjs` demonstrates both side by side.
- This is **masked for landmarks**, which are drag-placed: screen→dir→store→dir→screen
  round-trips through the same reflection, so placement always looks correct.
- It should surface in `computeLandmarkPanRange` (~L1037), which derives lon via
  `atan2(-d.x, d.z)` (landmark space) and feeds it straight into `state.view.lon` (camera
  space) through `animateCameraTo` — no negation anywhere in that path.
- **But** the user verified category framing in-browser on 2026-08-31 and it behaved, so
  something may compensate that this tracing missed, or the test landmarks sat near
  lon 0/180. **Do not "fix" this blind** — reproduce first with a landmark at a large
  off-axis longitude. Filed here rather than acted on because it is outside this task.

**Next action:** user opens `/spike/` and signs off 0-B (does the crossfade read well? what
duration feels right? does the heading slider make D-1's cost obvious?). In parallel, chase
**OQ-1** and **OQ-8** with the 3D team — both gate whether 0-C ever runs.

### 2026-09-02 — Plan created
- Requirements gathered via Q&A with the product owner; L1–L6 locked (§2).
- Key finding: the panoramas are **renders, not photographs**, which makes the
  glide-through-space transition feasible via a render-supplied depth pass — no
  photogrammetry, no mesh reconstruction.
- Key tension identified: **L3 (eyeballed placement) is incompatible with L4 (glide)**.
  Logged as D-1 with a recommendation to reverse L3. **This needs an answer early** — it
  affects Phase 0's input requirements.
- **Next action:** answer **OQ-1** (can existing renders produce depth + camera
  transforms?), then acquire Phase 0 assets and run the spike.
- Nothing implemented. No code written.
