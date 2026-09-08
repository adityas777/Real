# Changelog

Running log of changes made by Claude in this session/project going forward.
Newest entries at the top. Each entry: what changed, why, and files touched.

---

## 2026-09-08 (virtual tour Phase 1, step 1: tour.json data model + admin Tour tab)

First code for the virtual tour. `app.js`, `index.html`, `styles.css`. Ships the data
model + a 4th admin **Tour** tab for managing tours and their node panoramas. Hotspot
linking + the client crossfade viewer are the next steps (not in this change).

- **Data model (`tour.json`, D-13):** one file per project holding **many** tours —
  `{ version, tours:[{ id, name, startNode, nodes:[{ id, name, pano{file}, defaultView{lonDeg,latDeg,fov} }],
  links:[{ from, to, hotspot{lonDeg,latDeg}, label }] }] }`. New `parseTours`/`buildToursData`/
  `loadToursFile`/`setTours`/`tourNodeBlobFiles`/`saveToursAs` mirror the landmarks/amenities
  pattern exactly (basename-resolved node images, `loadProjectFile`/`saveToProject`). `parseTours`
  drops links whose from/to node no longer exists and repairs a dangling `startNode`.
- **State:** `state.tours` + admin `tourSel`/`tourNodeSel` (client `tourActive`/`tourNode`
  reserved for the viewer step).
- **Persistence wired:** `buildSession` snapshots tours (incl. node pano blobs) → session
  autosave/restore; `exportSite` writes `tour.json` + fresh node images (and the empty-check
  now counts tours); boot loads tours (session > committed `tour.json` > none).
- **Admin Tour tab:** ＋ Add tour, inline rename, delete; per-tour node list — ＋ Add node
  (upload a pano, auto-resized to a texture-safe `.web.jpg` via `resizeImageToBlob` at the
  pano cap), rename node, ☆/★ set start node, delete node; Save tours… / Load…. `setAdminTab`
  is now 4-way (align/landmarks/amenities/tour); `refreshTourList` renders it.
- **Verified** end-to-end via the in-app Browser pane against a throwaway `zztourtest`
  project (removed after): Tour tab shows; add tour → "Tour 1"; two node panos uploaded →
  2 nodes; rename tour + node, set start node, delete node; **server save wrote
  `projects/zztourtest/tour.json` + 3 node images** with basename `sample/tour-t1-nN.web.jpg`
  paths and `startNode:"n2"`; **session-discarded reload restored** the tour, 2 nodes and
  start node from the committed file; zero console errors; `node --check` + `python ast.parse`.

---

## 2026-09-08 (virtual tour: 0-B signed off, all OQs answered, Phase 1 scope locked — planning only)

Docs only (`VIRTUAL-TOUR.md`, this file). No app code yet. The owner reviewed the `spike/`
tour and green-lit building **node/hotspot placement + linking as a real admin feature**,
and answered every open question. Recorded in `VIRTUAL-TOUR.md`:
- **Decisions locked:** D-1 → **(a) drag-to-place only**; D-9 → **new Tour tab**; all
  others as recommended. New build decisions: **D-11** client viewer *takes over the main
  pano* (reuses camera + landmark projection/drag), **D-12** menu launches a tour via a new
  **`panotour`** content type → `openClientPanoTour(tourId)`, **D-13** one
  `projects/<id>/tour.json` holding **many** tours.
- **OQ answers:** colour-only (no depth) → **crossfade, no glide**; ~15 nodes/tour,
  ~30/project → LRU+prefetch required; **separate tours launched from the menu** (not one
  graph, not auto-linked to the plot map); HTTPS to come for WebXR (Phase 3); scale/units
  moot while colour-only.
- **Consequence:** **Phase 2 (depth glide) deferred** (both prerequisites declined); Phase 1
  = the crossfade 3DVista replacement, now `🟡 in progress`.

Next: implement Phase 1 in the order data model → Tour tab → hotspot authoring → client
crossfade viewer → menu launch. See `VIRTUAL-TOUR.md` Phase 1.

---

## 2026-09-04 (landscape-phone responsiveness: status pills, contact card, drawer scroll)

`styles.css` only. Reported as "contact page, and the sold / available / reserved buttons"
being broken on mobile. Both were real and both were **measured**, not guessed: the client
bundle was driven headless at six viewports (552×225, 651×280, 828×295, 899×317, 916×335
inner, plus desktop) with a probe reporting every visible element that falls outside the
viewport, and whether overflowing content is reachable by scrolling.

- **The status pills were literally off the top of the screen.** `.zoom-controls` is a
  bottom-anchored column and had grown taller than a landscape phone: at 651×280 it stood
  **370px against ~260px of room**, so it overflowed UPWARDS and pushed Available / Reserved
  / Sold to negative y — invisible, untappable, with nothing to scroll. At 552×225 all three
  were gone; on taller phones one or two survived, which is why it looked intermittent.
  **Fix (structural, not another round of shrinking):** the pills LEAVE that column and dock
  to the **top-right** edge as a row, so the two groups are anchored to opposite edges that
  always exist and neither can push the other off. The column below then only has to fit six
  icons (6×28 + 5×4 = 188px, inside the ~200px a 552×225 phone leaves). `max-height` +
  `flex-wrap: wrap-reverse` stay as a safety net so an even shorter viewport wraps sideways
  rather than off-screen — `wrap-reverse` specifically, because a right-anchored stack must
  grow LEFT. An intermediate attempt left the pills in the column and relied on wrapping
  alone; the screenshot showed the icons stranded mid-screen, which is why they were moved
  out instead.
- **The contact card hid its own content where nobody could reach it.**
  `.contact-modal-right` is `justify-content: center` + `overflow-y: auto`; when the content
  is taller than the column, a centred flex column overflows at BOTH ends and **the part
  past the start edge cannot be scrolled to**. Measured at 828×295: the details hung ~90px
  off the top, unreachable. Now `justify-content: safe center` (base rule and the landscape
  block), which falls back to flex-start exactly when content doesn't fit; a browser that
  doesn't know the keyword drops the declaration and gets flex-start too. **This is the
  third time this same trap has appeared in this project** — see the landmark drawer's
  `.cat-nav`. Plus a landscape tier that keeps the side-by-side layout (vertical space is
  the scarce one) and tightens padding/type: the card now FITS entirely at 651×280 and up,
  and merely scrolls (37px, all reachable) at 552×225.
- **The drawer menu couldn't scroll, so its last items were simply lost.** `.cat-nav` had
  `overflow-y: auto` but no `min-height: 0` — and a flex item's default `min-height: auto`
  refuses to shrink below its content, so the nav just grew past the drawer and the bottom
  rows fell off the screen (measured: a `.cat-btn` 16px below the viewport at 651×280).
  `overflow-y: auto` on a flex child is decorative without `min-height: 0`. Now scrollable at
  every phone size tested.

**Verification (final pass, all six viewports):** every status pill and control icon fully
on-screen at all of them; `navScrollable=true` on every phone; contact card `fits` at
651×280+ and `scrolls(37px)` at 552×225; and **`unreachableTop=0px` everywhere**, which is
the metric that actually proves the `safe center` fix. Desktop (1264×765) confirmed
unchanged: pills correctly absent (they live in the topbar legend there), icons on-screen,
contact fits. Screenshots at 844×390 and 568×320 confirm it visually, not just numerically.
The 1.3GB test bundle was deleted afterwards; no project files were touched.

---

## 2026-09-04 (background audio accepts a VIDEO, and uses only its sound)

Follow-up to the audio feature: the ⚙️ Settings → 🎵 Audio… picker now takes a video too
(MP4 / WebM / MOV / MKV alongside the audio formats), loops it, and plays **only its sound
track** — the picture is never shown.

- **No extraction step, by design.** An `<audio>` element handed an `.mp4` demuxes it and
  plays the sound track; the picture simply isn't rendered because an audio element has no
  video surface. One code path serves both kinds. The alternative — `decodeAudioData` into
  an AudioBuffer — would pull the whole file into memory as raw PCM (hundreds of MB for a
  short clip) to reach the same audible result.
- **Measured cost, stated honestly rather than hidden:** with a real 2.4MB MP4 the client
  reported `AUDIObytes=17343` (the sound track genuinely decoding and playing, looped) but
  also `VIDEObytes=110237` — **Chrome still decodes video frames even in an `<audio>`
  element**, and the file ships at full video size. So a video works, but an audio-only file
  is lighter on both bandwidth and battery. The admin hint says exactly that; it is not
  presented as free.
- **A silent video is detected and reported.** A clip picked for its music may have no sound
  track at all, in which case nothing would ever play with no clue why — and this is not
  hypothetical: scanning the sample project's MP4 boxes, 3 of 11 carry only a `vide` handler
  and no `soun`. `warnIfSilentVideo()` checks `mozHasAudio` (Firefox) and `audioTracks`
  (spec/Safari) where available, and **falls back to Chrome's `webkitAudioDecodedByteCount`
  after a brief MUTED play** — muted playback is exempt from the autoplay policy, so it
  needs no gesture. Verified to discriminate correctly on real files:
  `withsound.mp4=true(bytes:6949) | silent.mp4=false(bytes:0)`. Where a browser gives no
  definitive answer it stays quiet rather than crying wolf on a good file.
- Export writes a video-sourced track with a `video/*` content type; `sw.js`'s
  `isRangedMediaPath` already covered the video containers.

**Verification:** `node --check`. End-to-end via a throwaway `audiotest` project (**deleted
afterwards**, and the bulky scratch copies with it — `projects/` is back to the user's own
nine): a real 2.4MB MP4 with a sound track played through `#siteAudio` as
`src=audio.mp4 paused=false loop=true t=0.5/19.8 AUDIObytes=17343`. The silent-clip detection
was validated as a standalone browser probe against both a sound-bearing and a video-only
file. **First test was a false negative worth recording:** the smallest sample MP4 was picked
for speed and reported `audioBytesDecoded=0` — which looked like the feature failing, but an
MP4-box scan showed that clip has no `soun` track at all. Check the fixture before doubting
the code.

---

## 2026-09-04 (admin-uploaded background audio)

Admin ⚙️ **Settings** gains a **🎵 Audio…** picker beside the logo; the track loops
quietly for client visitors and the existing 🔊 button mutes it. `app.js`, `index.html`,
`styles.css`, `sw.js`.

- **Stored exactly like the brand logo**, so it inherits every path that already works:
  `state.audio {file, blob, name, _url, _ver}`, `audio: { file }` in `alignment.json`,
  `siteAudioSrc()` preferring a fresh blob over the committed path (cache-busted with the
  alignment's `savedAt`, so re-uploading over the same filename can't serve a stale track),
  shipped by Export, carried in the working session, copied on save-as, and prefetched by
  the offline layer. **Not re-encoded** — there's no browser-side `resizeImageToBlob`
  equivalent for audio, so the admin's file ships as-is and `setSiteAudioFile` warns above
  8MB instead of silently shrinking it.
- **One button, two sources.** With a track configured the 🔊 button controls it; with none,
  the original synthesised ambience is untouched, so projects that never set audio behave
  exactly as before.
- **Autoplay is handled, not assumed.** Every current browser refuses audible playback
  before the visitor interacts with the page, so `play()` rejects on load through no fault
  of ours. That's recovered from rather than treated as an error: `armAudioGesture()` waits
  for the first real pointerdown/keydown and starts there. Verified both ways — with
  playback allowed it starts on load; with it blocked the page stays silent, the button
  honestly reads 🔇, and **zero errors** are thrown.
- **The visitor's choice sticks** (`b91-audio-muted`, alongside the other toggle prefs): a
  visitor who mutes stays muted on their next visit, and for them the track's `src` is
  never even attached — no download at all.
- **Admin never gets music started at it** mid-edit; 🔊 previews on demand.
- **`sw.js`: `isVideoPath` → `isRangedMediaPath`, now covering `mp3|m4a|aac|oga|wav|weba|flac`.**
  This is a correctness fix, not tidying: an `<audio>` element requests its src with byte-range
  headers and gets `206 Partial Content` back, and caching a single 206 under the resource
  URL silently corrupts the cache — only that one slice would ever be served again. That is
  the exact hazard `respondVideo` exists to prevent, and audio extensions were falling
  through to the ordinary cache path instead.

**Two real bugs found by testing, both the same root cause — async playback state:**
`setAudioMutedPref(false)` and the button/`state.audioPlaying` update all sat inside
`play()`'s `.then()`. But `el.paused` flips synchronously while the promise only settles once
playback has actually BEGUN, so (1) an unmute read back as still muted, and (2) `audioPlaying`
stayed false, meaning an immediate second press **re-started the track instead of muting it**.
Fixed by recording intent synchronously on the click and only walking it back if playback is
genuinely refused — the preference records what the visitor asked for, not how fast the
media loaded.

**Verification:** `node --check` on `app.js` and `sw.js`. End-to-end in a real browser via a
throwaway `audiotest` project (a Python-generated 32KB WAV, **deleted afterwards** — nothing
left in `projects/`) exported as a bundle and driven headless: first visit
`[src=audio.wav?v=<savedAt> paused=false loop=true vol=0.35 btn=🔊]`; mute → unmute →
re-mute clicked back-to-back all land correctly (`pref` 1→0→1, glyph following each press);
a returning muted visitor gets `paused=true srcAttached=false`; autoplay blocked gives
`paused=true btn=🔇 errors=0`. The bundle also confirmed `audio.wav` ships in `data/`
automatically. **Not verified:** the admin Settings UI itself (headless admin capture is
unreliable here — see the gotchas), so the picker/Clear/status wiring is code-reasoned only.

**Testing note worth keeping:** in BUNDLE mode all project data is inlined, so `init()` can
run to completion in microtasks *before* the parser reaches an end-of-body `<script>`. A probe
that sets `localStorage` down there is already too late — it must go in `<head>`. A first
attempt at the mute-persistence test looked like a product bug because of exactly this.

---

## 2026-09-04 (client menu skips folders that offer no choice)

`app.js` only. A folder is a navigation aid, not content — drilling into one that presents
no actual decision costs a tap and shows a screen with nothing on it to choose. The live
`anandman` menu had both shapes of this:

| Folder | Contents | Was | Now |
|---|---|---|---|
| LOCATION INTELLIGENCE | 1 video | submenu with one row, then play | plays on the first tap |
| WALKTHROUGH VIDEO | 1 video | same | plays on the first tap |
| BROCHURE | 1 PDF | same | opens on the first tap |
| gallery | 25 `image` children | list of 25 rows titled GALLERY 1..25 | image viewer at photo 1 |
| VIRTUAL TOUR | nothing | drilled into "No items inside this category." | brief notice, menu stays put |

The gallery list was pure friction: every one of those 25 rows landed in the SAME viewer,
because `openClientFolderImageModal` already gathers every image sibling regardless of which
was picked.

- **`resolveFolderTarget(node)`** is the new single decision point, returning `open` /
  `images` / `menu` / `empty`. Rules: exactly one child → open it (recursing while each
  level still offers only one thing, so a folder-inside-a-folder-inside... collapses in one
  tap); all children are `image` nodes → open the viewer at the FIRST one and let prev/next
  do the rest; anything else (sub-folders, or a mix of content types) → the submenu, as
  before, because that IS a real choice. Guarded by a `seen` set and an 8-hop cap: a
  hand-edited or round-tripped tree could point a folder at an ancestor, and walking that
  inside a click handler would hang the page.
- **`activateMenuNode(node, {fromRoot})`** is now the one "visitor clicked a menu row" path,
  shared by the root list and the submenu list so the two can't drift apart. When a skip
  lands on a deeper folder, only that folder is pushed onto `state.menuNavStack` — which
  keeps Back honest: it returns the visitor where they came from, not through levels that
  were skipped on their behalf.
- **`menuRowOpensSubmenu(node)`** drives the `›` affordance, so a row only wears the
  "there's more inside" arrow when clicking it actually opens a submenu. On the live menu
  that leaves the arrow on LANDMARKS alone — confirmed by screenshot.
- **Autoplay needed no change:** `openClientVideoModal` already calls `player.play()` for a
  local file, and both `getYoutubeEmbedUrl`/`getVimeoEmbedUrl` already append `autoplay=1`.
  The video was always going to play; the extra tap was the whole problem.
- **Admin is untouched** — the drawer is client-only and the menu builder still shows and
  edits the true nested structure, so an admin can always see what they actually built.
  Chosen with the user: an empty folder shows a notice rather than a dead-end screen (and
  is NOT auto-hidden — an unfinished section staying visible is the admin's signal), and
  the skip recurses through as many single-item levels as it finds.

**Verification:** `node --check` clean. 26 assertions drive the real extracted
`resolveFolderTarget`/`menuRowOpensSubmenu` against the live `anandman` tree plus edge cases
— two sub-folders, images+video mixed, two videos, a single `gallery`-type child, an empty
folder, a folder whose only child is an empty folder, a contact node, a self-referencing
folder, and nesting past the hop cap (the last two must terminate rather than hang) — all
green. Then end-to-end in a real browser via the bundle-export `file://` route: clicking
GALLERY gives `galleryOpen=true counter=(1 / 25) name=GALLERY 1`, and clicking WALKTHROUGH
VIDEO gives `videoModalOpen=true playerVisible=block srcSet=true paused=false
submenuShown=false`. **Caveat on that last one:** headless needed
`--autoplay-policy=no-user-gesture-required`, because a synthetic `.click()` isn't a user
gesture to Chrome's autoplay policy. A real tap is, so this confirms the wiring reaches
`play()` with no submenu in between — not that autoplay survives every browser policy.

---

## 2026-09-04 (collapsed drawer: a rail, not a clipped half-button)

`styles.css` only. Follow-up to the drawer restyle, from a two-image before/after: the
COLLAPSED state was the problem, not the panel tint.

- **`translateX(-100%)` cut the reopen button in half.** The toggle sits at `right:-20px`
  and is 38px wide, so it spans drawer-x `[W-18, W+20]`; sliding the drawer's right edge
  exactly onto the screen's left edge put it at screen x `[-18, +20]` — **18 of its 38px
  off-screen**, a half-circle bleeding off the edge with no panel behind it. The old comment
  called that "a docked pull-the-drawer-back-out tab" and defended it; the reference mock
  says otherwise, and it reads as clipped chrome rather than a control.
  **Fix:** collapse to `translateX(calc(-100% + var(--collapsed-rail)))` with the rail at
  38px, leaving a slim sliver of the panel on screen and the whole toggle sitting on it.
  Verified by screenshot: rail 0–38px, toggle fully visible at 20–58px — matching the mock's
  0–38 / 15–55. The rail must stay >= the toggle's 20px overhang or the clipping returns.
- **The rail was streaked with cropped menu text.** It exposes the panel's right 38px, which
  is the tail END of the menu rows — so the first render of it showed sliced labels and a
  column of row `›` arrows instead of a plain sliver of glass. The panel's CONTENTS now fade
  out while collapsed (`.cat-drawer.is-collapsed .cat-drawer-inner > *`), keeping only its
  background. The toggle is a sibling of `.cat-drawer-inner`, not a child, so it's untouched
  and stays visible — that markup detail is what makes the one-line fix possible.
  `visibility` rides along on a delayed step so the hidden menu can't be tabbed into:
  invisible-but-focusable is a keyboard trap, not a cosmetic detail.
- **The rail passes pointer events through** (`pointer-events: none !important`, at higher
  specificity to beat `.cat-drawer-inner`'s own `auto !important`), so a drag starting on it
  pans the panorama instead of dying on an inert panel edge. The toggle keeps its own
  `auto`, so the one thing worth clicking there still works.
- **Kept:** the counter-transform warning. The fix moves the DRAWER, not the button — the
  toggle still rides the parent transform with no counter-transform of its own, which is
  exactly why nothing floats loose mid-screen the way the reverted 2026-09-02 attempt did.

**Verification:** screenshot-confirmed at 1280×860 via the bundle-export `file://` route,
in BOTH states — collapsed (clean rail, whole toggle, scene visible through the rail:
(55,69,87) against (73,87,103) beside it) and expanded (logo, all 8 menu rows, footer, panel
translucency all intact). The collapsed state was forced by injecting `is-collapsed` into the
exported BUNDLE copy only; the source is untouched by that.

---

## 2026-09-04 (client drawer: translucent panel + reference proportions)

`styles.css` only — no markup or JS changed. Requested with a reference mock: make the
client's left menu see-through "not very much transparent but that much that things can be
seen", and match the mock's logo/menu sizing and margins.

- **The panel is translucent, not frosted.** Was `rgba(30,34,43,0.88)` + `blur(16px)`; now a
  vertical gradient of `rgba(16,20,29,.58–.74)` + `blur(2px)`. **The blur mattered more than
  the alpha:** a 16px backdrop blur destroys every recognisable feature behind the glass, so
  the panel read as an opaque frosted slab even at 0.88 — dropping to 2px is what actually
  lets the treeline and horizon read through. The gradient is densest at the very top and
  bottom (behind the logo, and behind the footer icons) and thinnest across the middle where
  the menu sits over the usually-darker ground half of the pano — legibility bought where
  it's needed, transparency spent where it shows. Menu labels, brand text and the logo
  additionally carry their own `text-shadow`/`drop-shadow`, so a bright sky behind the panel
  can't wash them out.
- **The brand lockup now shows at every screen size**, not just on phones. This REVERSES a
  previously documented decision ("desktop's top bar already carries it, showing it twice
  costs menu space") — done deliberately at the user's request, since the mock puts the
  logo at the head of the drawer and the whole composition hangs off it. Re-hiding it on
  desktop is a design change, not a cleanup; the comment in `styles.css` says so.
- **Proportions matched to the mock:** drawer 250 → 282px, inner padding 24/18 → 34/26,
  logo lockup up to 168×148 (was 150×82, which squashed a tall lockup), menu rows
  `11px/12px` at 13.5px with 1px tracking and a 3px gap (≈ the mock's 40px rhythm), and the
  footer icons centred with the divider rule dropped — on a translucent panel a hairline
  reads as a scratch on the glass.
- **The menu is vertically centred in the space between logo and footer** (`justify-content:
  safe center`), which is the airy block the mock shows. `safe`, not plain `center`: a
  centred flex column that outgrows its box overflows in BOTH directions and the overflow
  past the start edge is unreachable by scrolling, so a long menu on a short window would
  lose its first items with no way to get at them. A browser that doesn't know the keyword
  drops the declaration and gets `flex-start` — top-aligned, never clipped, the right way
  to fail.
- **Both phone layouts keep their compact fit.** Portrait and landscape already tighten this
  drawer so all 8 items fit without scrolling — the drawer is the only navigation on a
  phone, so an item below the fold is effectively missing. Added overrides hold the small
  logo, the tight brand margin and `justify-content: flex-start` there, and landscape keeps
  the old 250px width (282 of an 844px screen is a third of it). Those overrides need the
  `body:not(.is-admin)` / `.cat-drawer` prefixes for specificity — the base rules are
  declared LATER in the file and a media query adds no specificity of its own, the same
  cascade trap already recorded twice in this project.

**Verification — screenshot-confirmed, unusually for this project.** This is client-only
styling, so the bundle-export route works (`GET /api/export-bundle?project=anandman` → unzip
→ headless Chrome on the `file://` index): checked at desktop 1280×860 and phone-landscape
844×420, both rendering correctly with all 8 menu items visible and unclipped. Transparency
was then confirmed by MEASURING pixels rather than by eye — sampling the panel where bright
sky sits behind it versus dark ground gave (66,80,97) and (37,45,56), tracking the backdrop
exactly as alpha compositing predicts (predicted (56,65,79) at α≈0.68 against a measured
(56,67,83) on the first pass), which a solid panel could not do. That measurement is what
caught the first attempt being too subtle to actually see through; the alpha was lowered ~0.10
and re-measured. Admin is unaffected (`body.is-admin .cat-drawer { display:none }`).

---

## 2026-09-04 (camera aimed at the category's MIRROR IMAGE)

- **`state.view.lon` and a stored landmark lon run in OPPOSITE directions, and the
  category camera code mixed them.** Reported after the previous pan fixes: HEALTHCARE and
  EDUCATION panned fine, but COMMERCIAL, CONNECTIVITY, LIFESTYLE and TEMPLE were still
  wrong. That split is the whole diagnosis. A stored lon uses `atan2(-v.x, v.z)` (the pano
  is viewed from inside, texture X-mirrored). `state.view.lon` is the camera YAW, fed to
  `cam.rotation.set(lat, lon + PI, 0, 'YXZ')`; working that matrix out, the camera's
  forward vector is `(cos(lat)sin(lon), sin(lat), cos(lat)cos(lon))` — the X-mirror of
  `dirFromLonLat`. So `state.view.lon = L` looks at stored lon **−L**.
  `computeLandmarkPanRange` built its arc with the stored-lon formula while its own doc
  comment promised "in `state.view.lon`'s radian convention", and every consumer
  (`animateCameraTo`, the `updateCamera` clamp, the idle sweep) treats it as camera lon.
  Net effect: **the camera was aimed at each category's mirror image across lon 0**, off by
  twice the category's offset from centre. Measured on the user's own project:

  | category | arc centre (stored lon) | aiming error | reported |
  |---|---|---|---|
  | HEALTHCARE | ~2° | ~4° | worked |
  | EDUCATION | ~−6° | ~12° | worked |
  | COMMERCIAL | ~−17° | ~34° | broken |
  | CONNECTIVITY | ~−33° | ~66° | broken |
  | LIFESTYLE | ~−41° | ~82° | broken |
  | TEMPLE | ~53° | ~106° | broken |

  A category sitting near lon 0 is its own mirror, so the error vanished into a 100°+ FOV
  and those two looked correct — which is exactly why this survived the earlier round of
  pan fixes. Projecting each landmark through a faithful reproduction of three.js' YXZ
  camera confirmed it before any change: COMMERCIAL 2 of 3 landmarks off-screen,
  CONNECTIVITY 4 of 5, LIFESTYLE 3 of 6, **TEMPLE 2 of 2** — against 0 of 2 and 0 of 6 for
  the two that worked. Exact match with the user's list.
  **Fix:** one named helper, `viewLonFromDir(v) = atan2(+v.x, v.z)`, with the two
  conventions written out above it, used by `computeLandmarkPanRange`, the ALL-branch
  centroid target, and `computeHome` (same latent bug there — masked because its pitch is
  −86°, i.e. nearly straight down, where yaw barely shows). `lonLatFromDir` keeps
  `atan2(-v.x, v.z)`: it is the stored-lon inverse and is correct as-is.
  **After:** all 6 categories frame every one of their landmarks (or, for a swept one,
  reveal all of them across the pass), on desktop and phone-landscape alike.
- **A swept category is now timed, not speed-capped.** CONNECTIVITY's 161° arc can't fit
  one frame (177° with padding, past the 120° FOV cap), so it tours — but at the ambient
  idle-drift rate that traverse took **134 seconds**, roughly a pixel every 20 frames,
  which reads as a frozen camera showing one landmark rather than as a sweep. The range now
  carries its own `radPerMs`, sized so one pass takes `LANDMARK_SWEEP_MS` (24s) whatever
  the arc's width — self-scaling, so every project's tour is equally readable instead of
  depending on how wide that particular category happens to be. CONNECTIVITY now crosses at
  7.4°/s and all 5 landmarks come into view. A category that FITS still sways at the
  ambient rate: that's ambience, not a tour.
- **Corrected a stale comment rather than trusting it.** The sweep branch claimed "minLon
  is the visual right edge and increasing lon sweeps leftward". With the range now in
  camera lon, `sweepMin` is the visual LEFT edge and the tour reads left-to-right —
  measured (at `sweepMin`, every visible landmark of a real 5-landmark category sat in the
  left half), not assumed, and the comment now says so along with a note to re-measure if
  anyone flips a convention here again.

**Files:** `app.js` only. **Verification:** `node --check` + `ast.parse` on `server.py`
clean; a harness projects the real landmarks through a faithful three.js YXZ camera
reproduction and asserts per category — 6/6 PASS (5 fitted categories: every landmark
on-screen at rest; CONNECTIVITY: 5/5 revealed across the pass). The earlier fly-in
assertions (0.0° first-frame jump, 0 frozen frames) and the landmark `featured` assertions
still pass. A grep guard confirms the only remaining `atan2(-v.x, ...)` in code is
`lonLatFromDir`, where it belongs. **Still not** browser-confirmed — headless capture of
this app is unreliable (see the gotchas), so the on-screen result wants a real look.

---

## 2026-09-04 (camera pan on category select)

Four fixes in the landmark-category camera path, all in `app.js`. Reported as "some issue
with panning of camera when selecting any of the categories"; diagnosed by replaying the
real `computeLandmarkPanRange`/`meanDirection`/`isLandmarkMatchCategory` sources against the
user's own `projects/anandman` landmarks + saved view, frame by frame, rather than by eye.

- **The arc clamp was eating the fly-in — the main bug.** `applyCategoryFilter` installs
  `state.landmarkPanRange` and *then* calls `animateCameraTo`, but `updateCamera` enforced
  that range as a hard clamp on `state.view.lon` **every frame**. The fly-in by definition
  starts outside the range it just installed, so every frame rendered pinned to the range
  boundary: the camera snapped to the destination on frame 1 and sat frozen while only the
  FOV (not clamped) animated. Measured across the six categories in that project: 5 of 6
  jumped **15.6–70.2° instantly** and stayed frozen for **22–29 of 36** animation frames.
  For a "fits" category the range is only ±3.5° wide (`LANDMARK_SWAY_HALF`), so essentially
  the entire journey sat outside it. CONNECTIVITY was the exception — wide-arc sweep branch
  whose range happened to contain the starting view — which is exactly why the problem felt
  inconsistent from category to category.
  **Fix:** `updateCamera` skips the clamp while `cameraAnimTimer` is live. The arc lock is
  meant to bound where the view can *wander*, not to fight the animation delivering it
  there, so it now engages the moment the fly-in ends (with the camera already inside it).
  All six categories now pan the full distance with a 0.0° first-frame jump and 0 frozen
  frames, and every one still lands inside its arc so the clamp engages without a snap.
- **Every landmark DOM rebuild re-flew the camera.** `rebuildLandmarkDOM()` ends by calling
  `applyCategoryFilter(state.selectedCategory)` — it only wants the highlight/dim classes
  re-applied to the freshly-created nodes, but it got the whole camera move too. With `ALL`
  selected `panInfo` is null while `validDirs` isn't, so the third branch fired
  `animateCameraTo(centroid, 72)`. Consequences: at client boot `setLandmarks()` → rebuild
  dragged the camera **45.5° off the saved `alignment.json` view and forced FOV 72**,
  breaking the documented WYSIWYG guarantee; and in admin, `addLandmark`/`deleteLandmark`/
  `setLandmarkRender` each yanked the view away right after a pin was dropped at the centre
  of it. **Fix:** `applyCategoryFilter(cat, { moveCamera = true })`; `rebuildLandmarkDOM`
  passes `moveCamera:false` for a styling-only refresh. (The one recursive path —
  `applyCategoryFilter` → `rebuildLandmarkDOM` when `lmDom` is empty → back — terminates:
  the inner call is styling-only and `lmDom` is populated by then.)
- **A "fits" category was framed on the wrong centre.** The fit decision and the FOV it
  picks both come from the arc `[minLon,maxLon]`, but the camera aimed at
  `meanDirection(dirs)`. For an uneven spread those differ — COMMERCIAL's vector mean sat
  **12.9° off the arc centre**, pushing an edge landmark outside the very frame the fit
  calculation had promised would hold all three. **Fix:** aim at `(minLon + maxLon) / 2`.
  Latitude still comes from the mean (no seam to straddle vertically). Verified: all five
  "fits" categories now contain every one of their landmarks.
- **Idle auto-pan was frame-rate dependent.** `lon += 0.00035` *per frame* meant the same
  scene drifted twice as fast on a 120Hz phone as on a 60Hz laptop, and crawled whenever
  the frame rate dipped. **Fix:** `AUTOPAN_RATE` (rad per ms) × a `dtMs` capped at 100ms
  (so returning to a backgrounded tab resumes rather than lurching). The rate is the exact
  per-ms equivalent of the old 60fps constant, so the feel on a 60Hz display is unchanged.
  **Not changed:** the sweep speed itself — 1.20°/s, i.e. ~134s for one pass of
  CONNECTIVITY's 161° arc. That's a taste call, not a bug; say so if it should be quicker.

**Verification:** `node --check app.js` + `ast.parse` on `server.py` clean; the landmark
`featured` assertions still pass unchanged. The before/after frame-by-frame replays live in
the session scratchpad (`sim_pan.mjs` / `sim_pan_after.mjs`) — they drive the real extracted
functions, so they measure the shipped math, not a paraphrase of it. **Not** confirmed in a
live browser: headless capture of this app is unreliable (see the gotchas), so the actual
on-screen smoothness wants a real look.

---

## 2026-09-04 (later same day)

- **The show-by-default control is now a ✓ ✕ PAIR, not a single toggle — the first
  version inverted people's intent.** Reported straight after shipping: "the landmarks that
  were tick marked are not currently visible, which is quite the opposite of what I
  expected." The engine was correct — checked the user's live `projects/anandman/landmarks.json`
  and replayed the real `parseLandmarks`/`isLandmarkShown` over it in Node: 15 `featured:true`
  landmarks draw in the default view, the 9 `featured:false` ones don't, and both `NIT Raipur`
  and `RITEE College` still come back under EDUCATION. Exactly as designed. **The UI was the
  bug.** Every landmark starts ticked (backwards compatibility), so a single button showing
  the CURRENT state reads as an ACTION — "tick the ones I want up-front" — and going down
  the list clicking the wanted landmarks turned each one OFF. The hidden set proves it: AIMS
  Raipur, NIT Raipur, Raipur Railway and the Bilaspur Highway, i.e. precisely the marquee
  landmarks anyone would feature.
  **Fix:** two separate buttons per row (`.ax-lm-vis-grp` holding `.ax-lm-vis-yes` +
  `.ax-lm-vis-no`), which makes every click idempotent — ✓ always means show, ✕ always
  means hide, and clicking the already-active half is an explicit no-op
  (`setLandmarkFeatured` early-returns when the value wouldn't change, so it can't flip and
  can't fire a spurious save). The active half is filled, the inactive half sits at
  `opacity:.45`. This is also what the original request literally asked for — "a tick and
  cross button in front of every landmark" — two buttons, not one.
  **Also added, since curating ~24 landmarks one row at a time is the real workflow:**
  `setAllLandmarksFeatured(on)` behind **✓ Show all** / **✕ Hide all** (`#axLmShowAll`/
  `#axLmHideAll`), and a live `✓ N of M shown by default` count (`#axLmCount`) refreshed by
  `refreshLmList`. "Hide all, then ✓ the handful you want" is now both the fastest way to
  curate and the one-click recovery from having picked the wrong set. The × delete button is
  untouched in behaviour and position.
  Files: `app.js`, `index.html` (bulk row + rewritten legend), `styles.css`
  (`.ax-lm-vis-grp`/`.ax-lm-vis-yes`/`.ax-lm-vis-no`/`.ax-lm-bulk`/`.ax-lm-count`).
  **Verification:** `node --check` clean; the 11 extracted-source assertions still pass
  unchanged (the visibility engine wasn't touched); the inversion diagnosis was confirmed
  against the user's real project data rather than reasoned about. Button styling remains
  un-screenshot-able here (headless admin limitation) — needs the user's eyes.
  **Lesson worth keeping:** a state-showing toggle whose default is "on for everything"
  invites exactly this inversion. When the job is "pick the few you want" out of a
  fully-on list, give it two explicit buttons, not one that flips.

---

## 2026-09-04

- **Landmarks can now be kept out of the default view without being deleted — a
  per-landmark tick/cross in the admin list.** Projects that had grown to ~20 landmarks
  drew all of them at once in the client's default (no category picked) view, which read
  as clutter. Each landmark now carries a `featured` flag, toggled by a ✓/✕ button
  in the admin Landmarks list, and visibility is decided in one place,
  `isLandmarkShown(lm, cat)` (`app.js`, next to `isLandmarkMatchCategory`):
  - **No category picked (ALL)** → only ticked (`featured !== false`) landmarks draw.
  - **A category picked** → *every* landmark in that category draws, ticked or not — a
    category view is a deliberate, complete list, so an unticked landmark is never
    unreachable, just not shouted about up-front.
  - **Admin, Landmarks tab** → always draws everything, so an unticked landmark can still
    be found and dragged; its banner gets `.is-unfeatured` (dashed outline + faded) so it's
    obvious which ones the client holds back.
  `applyCategoryFilter`'s ALL camera framing and `renderLandmarks`' mobile density cap both
  now count the same featured set, so the camera frames what's actually on screen and
  "+N more" stays truthful.
- **The tick/cross is deliberately not a delete, and the UI says so.** The pre-existing
  × delete button stays exactly where it was; the new toggle sits immediately to its
  left with a different shape and colour (green filled ✓ when on, hollow muted ✕ when
  off), both buttons carry explicit `title`/`aria-label` text spelling out
  "does NOT delete" vs "DELETE permanently", the row itself dims and goes dashed when
  unticked, a legend block above the list explains all three states, and `setAxStatus`
  reports the new state plus a running "N of M show by default" count — warning outright
  if the last tick is removed and the default view would be empty.
- **Persistence:** `featured` round-trips through `landmarks.json`
  (`buildLandmarksData`/`parseLandmarks`), the browser session snapshot, and Export.
  **Backwards compatible:** an existing `landmarks.json` has no `featured` key, and the
  parse defaults it to `true` (`l.featured !== false`), so every current project looks
  exactly as it does today until an admin unticks something.
  Files: `app.js`, `index.html` (legend markup in `#axTabLandmarks`), `styles.css`
  (`.ax-lm-vis`, `.ax-lm-legend`, `.ax-lm-li.is-hidden-default`, `.lm-banner.is-unfeatured`).
  **Verification:** `node --check app.js` + `python -c "import ast; ast.parse(...)"` on
  `server.py` both clean; the visibility/persistence logic was unit-tested by extracting
  the real `parseLandmarks` / `buildLandmarksData` / `isLandmarkShown` sources out of
  `app.js` and running 11 assertions in Node (legacy default, `false` surviving a
  save→load round-trip, ALL hiding vs category showing, admin override) — all green.
  The visual result (button styling, dashed hidden rows) is **not** screenshot-confirmed:
  headless screenshotting of admin mode remains unreliable here (see the gotcha in
  CLAUDE.md), so the CSS is code-reasoned only and wants a look in a real browser.

---

## 2026-09-08 (fix 2) — client drawer shows only the authored menu; SW served stale config

- **Removed the hardcoded `AERIAL VIEW` and `LANDMARKS` rows** from the client drawer
  (`renderClientSidebar`). The drawer is now exactly the menu built in admin. A project
  with no authored menu shows **no drawer at all** rather than an empty panel.
  Files: `app.js`.
- **…and made both authorable instead, so the removal isn't a net loss.** 5 of 9 projects
  here have landmarks but no menu items, and the drawer row was the only **desktop** route
  into the landmark category filter (`openLandmarksCategoryPicker` is otherwise reachable
  only from the mobile overflow hint). Added two zero-configuration content types —
  **📍 Landmarks** and **🗺️ Aerial View** — dispatched from `openNodeContent`, described by
  `NO_CONFIG_CONTENT_TYPES` (which drives the wizard hint that replaces the URL/upload
  row). Any project that wants those rows back adds them in the menu builder.
  Files: `app.js`, `index.html`.
- **Service worker served STALE project config — the real reason a new menu item didn't
  appear.** `sw.js` used `staleWhileRevalidate` for everything under `/projects/`, which
  returns the *previous* copy on the first load after an admin save and only refreshes on a
  **second** reload. For an authoring tool that reads as "my change didn't save". Project
  **config** files (`.json`/`.csv`/`.svg` — a few KB each) are now **network-first with
  cache fallback**; images and media stay stale-while-revalidate (large, and already
  cache-busted by their own `_ver`). `VERSION` bumped to `v2` so an installed worker drops
  the old caches and cannot keep serving under the previous rules. Files: `sw.js`.
- Note: the `act === 'aerial'` / `act === 'landmarks'` click handlers in
  `wireClientSidebarButtons` and `wireViewControls` are now unreachable (nothing emits
  `data-act` any more). Left in place rather than removed in the same pass.

## 2026-09-08 (fix) — `panotour` menu items lost their `tourId` on save

- **`cleanNodeForSave` is a whitelist, and it silently dropped `content.tourId`.** It
  rebuilds `content` from `url` + `fileName` only (plus `images` for galleries), so every
  save of a `panotour` menu item threw the tour reference away. The item still appeared in
  the menu and simply did nothing when clicked — the worst kind of failure. Added `tourId`
  to the whitelist, with a comment marking it as a whitelist so the next content type that
  carries its own field doesn't repeat this. Files: `app.js`.
- **`openClientPanoTour` now fails loudly and recovers where it safely can.** A missing
  `tourId` with exactly one tour in the project opens that tour (no ambiguity, and it
  repairs items saved before the fix); with several tours it says which control to use
  instead of doing nothing. Files: `app.js`.
- **Repaired existing data:** `projects/pano-testamit/alignment.json`'s "3BHK" menu item
  had `content:{url:"",fileName:""}` — re-pointed at tour `t1`.
- **Not a bug, worth documenting:** `wireAdmin` hides the client nav drawer
  (`els.catDrawer.hidden = true`) whenever `?admin=1` is set, because admin has its own
  sidebar. The menu is therefore **only ever visible in the client view** — the reported
  "menu is not visible" was this, on top of the `tourId` loss above.

## 2026-09-08 (later) — tour viewer, hotspot linking, `panotour` menu type

- **Fixed: every saved tour node pano was a 15-byte `[object Object]` file.**
  `resizeImageToBlob` returns `{ blob, W, H }`, but `addTourNodeFromFile` stored the
  **wrapper** as `panoBlob`, so `serverSave` stringified it. Every node image the admin
  had uploaded was silently destroyed on save (the files existed on disk, which is why
  the earlier end-to-end check passed — it verified files were *written*, not that they
  decoded). Now unwraps `out.blob`. Repaired the three corrupt uploads in
  `projects/pano-testamit/` from the demo renders. Files: `app.js`.

- **Client tour viewer — `openClientPanoTour` (Phase 1 steps 2–5).** Ported from the
  Phase 0 spike onto this file's own conventions: reuses `loadPanoTexture` (GPU cap +
  `flipY=false` — the spike's default-flipY bug rendered panos upside down),
  `dirFromLonLat`/`projectDir` from the landmark path, and the existing pano sphere.
  Per **D-11** the tour **takes over the main viewer** rather than opening a second
  canvas: plots/drape/landmarks/amenities hide, the sphere swaps textures, and
  `closePanoTour` restores the saved view + texture exactly. Crossfade is a second
  sphere at 0.985× **sharing the pano geometry** (dispose material only, never the shared
  geometry). Heading is *carried over* between nodes; `defaultView` applies on entry only,
  so walking never spins the camera. LRU texture cache (`TOUR_CACHE_MAX = 3`) + one-hop
  neighbour prefetch, straight from the 0-A finding that download weight (~2 MB/node) and
  GPU residency (~179 MB/node) are separate problems. Tour chrome (`refreshTourBar`):
  title, room strip, exit. Files: `app.js`, `index.html` (`#tourHotspots`, `#tourBar`),
  `styles.css`.

- **Hotspot authoring (Phase 1 steps 3/1.4).** Nav hotspots are direction-anchored and
  projected each frame, exactly like landmarks. In the admin **Tour** tab, each node row
  gets a **▶ open in viewer** button; while a tour is open the tab grows a hotspot editor
  for the current room — add (drops at view centre), retarget, relabel, delete, and
  **drag onto the doorway** (`startTourHsDrag`, same raycast→`lonLatFromDir` model as
  landmark pins). Plus **⌖ Set this view as the room's start view**. Client taps route
  through `pick()` because `#pano` grabs pointer capture (the amenity-pin trap again).
  Files: `app.js`, `styles.css`.

- **New menu content type `panotour`.** Distinct from the existing `tour`, which iframes
  an **external** 3DVista/Kuula URL or uploaded file; `panotour` stores a **`tourId`**
  referencing a tour in this project's `tour.json` (D-12). Added the wizard type card
  (🧭 360° Tour), a tour picker replacing the URL/upload row (`renderWizardTourPicker`,
  which warns when a tour has no nodes or no hotspot links), save/edit round-trip via
  `wizardState.tourId`, and the `openNodeContent` branch. Files: `app.js`, `index.html`.

- **`server.py`: tour-only projects + tours in the standalone bundle.**
  `/api/projects` and `do_bundle` required a `plots.svg`, which hid tour-only projects
  entirely; both now accept `plots.svg` **or** `tour.json`. `tour.json` added to
  `BUNDLE_DATA_FILES`, and new `tour_pano_basenames()` feeds node panos into
  `build_embedded_images_json` — they are WebGL textures, so under `file://` they must be
  data: URIs like the background pano (a loose sibling file is rejected as tainted).
  Closes the Phase 1.7 bundle gap. Files: `server.py`.

- **Demo project made openable.** `projects/panotour-demo/` was spike-format
  (`{nodes, links}`) which `parseTours` reads as zero tours, and had no `alignment.json`
  → empty `menuConfig.tree` → **no menu at all on the client**, which is why the feature
  looked broken. Added `spike/seed-demo-tour.py`: converts it to the app's
  `{tours:[…]}` shape (9 rooms, 16 links, living room as hub/start) and writes an
  `alignment.json` carrying a `panotour` menu item. Hotspot directions are evenly spread,
  **not surveyed** — drag them onto real doorways in admin. Also moved the 343 MB of raw
  PNG masters into `panotour-demo/_source/`: `do_bundle` copies every **top-level** file
  into `data/`, so the masters were shipping in every export — **bundle went 392 MB →
  43.5 MB**. Files: `spike/seed-demo-tour.py` (new), `projects/panotour-demo/*`.

- **Verified:** `node --check app.js`, `python ast.parse server.py`; all new helpers /
  CSS classes / HTML ids cross-checked as defined; `/api/projects` now lists
  `panotour-demo`; client + admin URLs 200; real bundle built via the endpoint contains
  `data/tour.json`, the tour (9 nodes / 16 links) embedded in `B91_BUNDLE_FILES`, and all
  9 node panos in `B91_BUNDLE_IMAGES`; seeded tour has no dangling links.
  **Not verified in-browser** — no browser tooling in this session, so the visual result
  (crossfade, hotspot placement, takeover/restore) needs the user's eyes.

## 2026-09-03

- **A manual drag now releases the landmark category's pan arc.** Selecting a category
  frames its landmarks and confines the view to their arc (`state.landmarkPanRange`,
  enforced in `updateCamera` — the single place the view is consumed, so auto-pan, the
  fly-in AND a drag were all equally bound by it). The framing is wanted; the cage isn't:
  a visitor who deliberately drags should be able to look anywhere. Now the first real
  drag (>6px, client only) clears the range and cancels any in-flight fly-in, restoring
  free 360° look and free idle spin. The category FILTER is deliberately untouched —
  that's `state.selectedCategory`, so the chosen landmarks stay highlighted while the
  visitor looks around, and tapping a category again re-frames as before. Admin is
  unaffected (the clamp never applied there), and with no category selected the range is
  already null so this is a no-op. `app.js` only.
  **Verification honesty:** this one is code-reasoned + syntax-checked only. I tried to
  prove it by scripting the real interaction in the exported bundle (select a category,
  then dispatch a long synthetic pointer drag) and measuring the landmark banners' on-screen
  positions — but a control run with NO category selected, where no clamp exists at all,
  showed the banners equally motionless (`before/mid/after` identical). So synthetic
  `PointerEvent`s don't drive this app's pan handler in headless: the harness can't
  distinguish "clamp released" from "drag never happened", making the test worthless rather
  than reassuring. Needs a real device/browser to confirm.

- **Portrait is now GATED, not nudged — phone visitors must rotate before any content is
  shown.** Follow-up to the rotate prompt below, at the user's request: the animated screen
  is no longer a dismissible hint but a hard requirement.
  - `.rotate-hint` became `position: fixed` + fully opaque (`var(--bg)`) at `z-index: 300`,
    above every panel and modal. A translucent version would still leave the squeezed,
    unusable portrait layout visible underneath, which is the very thing this exists to
    prevent.
  - Removed BOTH dismiss paths — the ~5s auto-hide timer and the tap-to-close handler.
    Either would have dropped the visitor into the portrait layout the gate is there to
    keep them out of. The only way past it is actually turning the device.
  - Orientation detection now listens on the orientation media query, `resize`, AND
    `orientationchange` (the media query fires before the viewport settles on some mobile
    browsers, and `isMobilePortrait()` reads `window.innerWidth` — `resize` is what
    reliably catches up), with a short delay on the orientation events for the same reason.
  - Both manifests (`server.py`'s generated one and the static one bundles ship with) now
    declare `"orientation": "landscape"`, so an INSTALLED app simply opens the right way up
    and never meets the gate at all.
  - Unaffected on purpose: desktop (`isMobilePortrait()` is never true on a real desktop
    window), admin (already `!state.admin`), and tablets in portrait (>720px wide), which
    get the normal layout rather than being blocked.
  - **Verified by screenshot:** 390x844 portrait shows ONLY the rotate screen with no
    content visible behind it; 844x390 landscape and 1400x900 desktop are unchanged.
    Files: `styles.css`, `app.js`, `server.py`, `manifest.webmanifest`.

- **All three status filters on landscape phones, plus an animated rotate prompt.**
  - **Reserved and Sold joined Available.** Landscape hides the header legend, and its
    stand-in only carried "Available", so a phone visitor couldn't see or filter the other
    two statuses at all. Replaced the single `#zoomAvailableBtn` with a
    `#zoomStatusGroup` of three (`.zoom-status-btn`, ids `zoomAvailableBtn`/
    `zoomReservedBtn`/`zoomSoldBtn`), each carrying its status colour dot and live count,
    right-aligned above the zoom controls. Made them read as controls rather than labels:
    34px min tap height, a lit gold border for the pressed/on state (dimmed + grayscaled +
    struck-through count when off), and a press scale. Sync now runs through one helper,
    `syncZoomStatusButtons()` — counts from `renderLegend`, pressed-state from
    `toggleFilter` — so the chips can't drift from the header legend, and clicks are wired
    generically off each button's `data-status`.
  - **Animated "rotate your phone" prompt** replaces the plain text toast, which was easy
    to miss and didn't communicate the ask as directly as motion does. New `#rotateHint`
    overlay: dimmed blurred backdrop, a gold phone outline that turns 0deg → -90deg on a
    2.6s loop with a hold at each end (a continuous spin reads as a loading spinner rather
    than an instruction), a curved arrow, and the line "Rotate your phone / The map opens up
    in landscape". Auto-clears after ~5s, and clears instantly on tap or as soon as the
    device is actually turned (rotating INTO landscape means the hint was obeyed — leaving
    it covering the view they just asked for would be perverse). Honours
    `prefers-reduced-motion` by showing the end state without animating. Not persisted as
    dismissed-forever on purpose: it's a momentary nudge, and someone who rotates back to
    portrait later is in the same situation again.
  - **Verified by screenshot** (bundle-export/`file://`): 844x390 shows all three chips
    colour-coded and right-aligned; 390x844 shows the rotate overlay rendering correctly;
    1400x900 desktop unchanged — legend still in the top bar, no floating chips, no overlay.
    Files: `index.html`, `styles.css`, `app.js`.

- **Collapsed drawer's arrow pointed the wrong way — two fixes cancelling each other out.**
  `app.js` already swaps the glyph (`‹` ⇄ `›`) in both the toggle handler and the portrait
  auto-collapse, and `styles.css` ALSO rotated `.cat-toggle-ico` 180° for `.is-collapsed`.
  Applied together they undo one another, so a collapsed drawer showed a left-pointing
  ("close") arrow when it was already closed and should have been inviting the visitor to
  open it rightwards. Removed the CSS rotation, leaving the JS glyph swap as the single
  source of truth (comment left in its place so it isn't reintroduced). Verified by
  screenshot: collapsed portrait now shows `›` docked at the left edge, open landscape
  still shows `‹`. `styles.css` only.

- **Home-screen icon is now the ADMIN'S logo, and the phone menu leads with the project's
  branding.** Two related asks, with a reference screenshot for the menu layout.
  - **Per-project PWA identity.** The manifest was static, so every project installed as a
    generic "Build91" icon. A manifest is static JSON by nature, so the per-project version
    has to be server-generated: new `GET /manifest.webmanifest?project=<id>` in server.py
    emits the admin's brand name/tagline and icons built from their logo, and
    `setupPwaIdentity()` (app.js, runs during module eval, before the browser evaluates
    installability) appends the current `?project=` to the `<link rel="manifest">` and the
    apple-touch-icon. New `GET /api/pwa-icon-{192,512,512m}.png?project=<id>` letterboxes
    the logo onto a square canvas at the required size (home-screen icons must be square
    and >=192px or the site isn't considered installable, and a logo is rarely either); the
    maskable variant gets extra padding since the OS crops it to its own shape. Results are
    cached beside the project as `.pwa-icon-*.png`, regenerated when the logo is newer.
    Pillow is an OPTIONAL import (`_pillow_ok()`) — this server is stdlib-only by design,
    and without it, or without a project logo, it falls back to the bundled B91 icons.
    Verified: the manifest for `sample` returns the admin's "ANDAMAN - ELEGANZA" naming, and
    the generated 192px icon is a correct square rendering of their actual logo.
  - **Drawer branding on phones.** The drawer had no branding at all; the logo lived only in
    the top bar, which is squeezed in portrait and hidden outright in landscape — so on a
    phone the visitor never saw whose site it was. Added `.cat-drawer-brand` (populated by
    `applyBrand`, so it can't drift from the top bar's version), shown ONLY on phones:
    stacked and centered in portrait, and a compact grid in landscape (logo spanning both
    text lines) where vertical space is scarce. Menu rows were tightened at the same time so
    the whole menu fits without scrolling — an item below the fold is effectively missing
    when the drawer is the only navigation. When a logo image loads, the name/tagline text
    is suppressed (`has-logo`), since a logo almost always contains the wordmark already —
    it was otherwise printed twice.
  - **Cascade gotcha hit again en route:** these mobile overrides sit ~line 790 while the
    drawer's base rules are at ~1030+, and a media query adds no specificity — so the later
    base rules silently won and the whole block did nothing (the first screenshot showed no
    branding and untightened rows). Fixed by scoping each override with `.cat-drawer`.
    Caught only because it was screenshotted; worth remembering that "the CSS is in the file"
    is not evidence it applies.
  - **Verified by screenshot** (bundle-export/`file://` route) at 844x390 landscape, 390x844
    portrait, and 1400x900 desktop: branding renders correctly in both phone orientations
    with every menu item visible and no scrollbar, and desktop is unchanged (no drawer
    branding, original spacing). Files: `server.py`, `app.js`, `index.html`, `styles.css`.

- **Landmark/amenity labels no longer cling to the screen edges — out-of-view markers now
  simply leave view.** User screenshot showed several "New landmark" banners stacked
  against the right edge (and one half-cut on the left), tracking along while panning.
  Cause: both renderers clamped the label's x into the viewport so it could never be cut
  off (`Math.max(halfW+margin, Math.min(W-halfW-margin, x))` in `renderLandmarks`, and the
  equivalent `translateX(calc(-50% + Npx))` chip nudge in `renderAmenities`). Reasonable in
  isolation, but it meant everything currently off-frame piled up on the sides instead of
  being out of shot. Removed both clamps: markers now sit at their true projected position,
  and one whose label wouldn't fit fully is hidden rather than shown clipped — so it
  disappears cleanly at the edge instead of sliding along it. Per the user: "if they are out
  of scope let them be".
  **Verified by screenshot** via the bundle-export/`file://` route (the reliable one for
  rendering work): at 760px the banners now sit spread at their real positions with no edge
  stack, and at 390px (phone portrait) three show, none clipped, none crowding the sides.
  Note the banner still partly hidden behind the open category drawer on desktop is
  unrelated and pre-existing — the drawer is an overlay on top of the pano, not a column
  beside it. `app.js` only.

- **Contact-card photo was never pre-downloaded — found from a precise user observation.**
  Reported symptom: opening the installed shortcut in airplane mode, SOME images were
  missing; turning the net on loaded them; afterwards they worked offline too. That
  sequence is diagnostic — it means those files were absent from the pre-download list but
  got cached as a side effect of being viewed online (the runtime stale-while-revalidate
  path), i.e. a gap in `collectOfflineAssets`, not a caching failure and NOT (as the user
  reasonably wondered) an inherent "needs net on first open" behaviour.
  Root cause: the menu walk handled `parent` and `child` nodes and skipped everything else,
  but the Contact card is its own node kind (`kind: 'contact'`) whose photo lives at
  `node.contact.image`, outside the `content` object the walk inspects. Now collected,
  resolved via `assetUrl(c.image)` exactly as `openClientContactModal` does so the cache
  key matches what the viewer requests. Also hardened two adjacent cases the viewers accept
  but the collector ignored: a local path stored in `content.url` instead of `content.fileName`,
  and the same for a gallery entry's `url`.
  **Verified by replaying the collector's logic in Node against the real committed project
  files:** 22 items collected (was 21), contact photo present, every collected path exists
  on disk, totalling 142.3MB — note that's less than the 252MB folder, because `sample`
  contains 7 videos of which only 4 are actually linked in the menu.
  Checked and found NOT affected: landmark/amenity renders (`parseLandmarks`/`parseAmenities`
  unwrap `render.file` to a string, which `renderSrc` handles) and plot media (the two refs
  in this project's `plots.csv` are genuinely external `http(s)` links, correctly excluded).

- **Install prompt stopped producing a home-screen shortcut — caused by the auto-reload
  added earlier the same day.** `clients.claim()` fires `controllerchange` on a FIRST
  visit too (no previous controller), not just when a new worker replaces an old one — so
  every fresh visit reloaded itself mid-boot, and that reload discarded the captured
  `beforeinstallprompt` event. Tapping Add then downloaded the content but silently did
  nothing about installing, because there was no prompt left to fire. Guarded the reload on
  `hadControllerAtLoad` so it only runs for a genuine update. Also: `prompt()` is only
  valid inside the originating tap, so it can't be deferred or retried — when no install
  event is available, the flow now says where the manual control is (menu ⋮ → Install app,
  or Share → Add to Home Screen on iOS) instead of skipping it silently. `app.js` only.
- **Page navigation is no longer network-first without a deadline.** Asked whether a
  first offline open has to wait on resources: it doesn't (everything is served locally),
  but the navigation handler awaited the network and only fell back to cache on failure —
  fine when fully offline (fails instantly) yet potentially many seconds on a WEAK signal,
  which is the worse case for an app whose promise is "opens instantly". Now, when a
  cached copy exists, the network gets a 2.5s head start (so an online visit still picks up
  the latest) and the cached copy wins if it doesn't answer in time; the network attempt
  continues regardless and refreshes the cache for next launch. First-ever visit (nothing
  cached) is unchanged. `sw.js` only.
  Worth recording from the same investigation: startup cost is dominated by IMAGE DECODE,
  not networking — `sample` carries a 4.9MB pano JPEG plus a **20.9MB** site-plan PNG, both
  decoded, downscaled to the GPU texture cap and uploaded on every launch, cached or not.
  Recompressing that PNG is the single biggest available startup win. (Whole project: 252MB,
  of which ~161MB is video — relevant to the storage-quota entry below.)

- **Actually attack the storage ceiling rather than just report it — request persistent
  storage, and warn before downloading if the project can't fit.** Follow-up to the entry
  below, after the user (emphatically) restated that EVERYTHING — video, images, PDF —
  must be available offline. Nothing about what gets downloaded changed; what changed is
  the chance it survives:
  - `requestPersistentStorage()` calls `navigator.storage.persist()` from inside the Add
    tap (browsers are more willing to grant it during a user gesture). This is the API
    that lifts the two limits that would otherwise truncate a video-heavy project: the
    data becomes exempt from eviction under storage pressure, and Chromium grants a much
    larger quota than the default best-effort allowance. No-op where unsupported.
  - `storageHeadroom()` (`navigator.storage.estimate()`) is checked BEFORE the prompt
    commits: if the project is larger than the free space, the banner says so up front
    ("may exceed this phone's free space (X left)") instead of letting the visitor sit
    through a download that gets silently cut off at the quota.
  - The partial-save message now distinguishes causes — `"N/M saved — phone storage full"`
    vs plain `"N/M saved"` — because those need different responses (free up space or trim
    the project, vs. just retry on a better connection).
  - Note for the real rollout: iOS Safari is the tight one, and its allowance is
    materially larger once the site is installed to the Home Screen — which the combined
    prompt already encourages in the same tap.

- **"Downloaded" now means "verified present in the cache", not "the bytes came down"
  — closing a silent-failure gap that video is the most likely thing to hit.** Prompted by
  the user asking whether video actually gets cached on phones. It does by design (video is
  collected, sized, fetched unranged so the WHOLE file is stored, and served back through
  `respondVideo`'s byte-range slicing so offline seeking works) — but the honesty of the
  "Done" message still rested on an assumption: that `cache.put()` in `sw.js` succeeded.
  It can reject on its own, most plausibly on a per-origin **storage quota**, which video
  is exactly what blows past (mobile browsers cap this; iOS Safari tightly). Those writes
  happen in the worker, detached from the response the page sees, so a quota failure was
  invisible to the download loop and would have been reported as success — the same false
  "Done" this flow already got burned by once, just one layer deeper.
  - New `verifyCachedItems()` (app.js): after the fetch loop, asks Cache Storage directly
    (the page shares it with the worker) which items are actually there, matching the same
    query-stripped keys `sw.js` writes. Anything missing counts toward the `"N/M saved"`
    total and blocks the per-project "saved" flag, so a quota-truncated save re-offers
    instead of claiming success.
  - `sw.js`: every `cache.put()` now has a `.catch()` — previously a rejection became an
    unhandled promise rejection that no surrounding `catch` could see.
  - Still unverified on a real device: whether the videos in this project actually fit
    within the phone's quota, and the byte-range playback path itself (`respondVideo`/
    `sliceRange`) under a real seek/replay.

- **Android has no inline PDF viewer at all — added a JS-rendered brochure viewer
  (pdf.js) for that platform.** The previous fix (open the PDF via a direct top-level
  navigation instead of an iframe) was based on the assumption that Chrome's built-in PDF
  viewer would take over on a real navigation. Real-device retest disproved it: Android
  showed its "Download file again? File name already exists" dialog instead — i.e. it
  downloads PDFs rather than displaying them, in an iframe AND on direct navigation.
  Confirmed the server isn't at fault (`Content-type: application/pdf`, no
  `Content-Disposition`, and the same file previews fine on iOS), so this is simply a
  missing browser capability (Chrome for Android only gained an inline PDF viewer in
  fairly recent versions). Nothing at the URL/markup level can work around that, so
  Android now renders the pages itself:
  - Vendored **pdf.js 3.11.174** (`vendor/pdf.min.js` + `vendor/pdf.worker.min.js`,
    ~1.4MB). v3 deliberately, not v4 — v4 relies on `Promise.withResolvers` and similar
    modern syntax that the older Android builds this exists to serve don't have.
  - `loadPdfJs()` injects it as a classic `<script>` on demand (it's a UMD build defining
    `window.pdfjsLib`; app.js is an ES module and can't `import` it) — only loaded when a
    brochure is actually opened on Android, never on other platforms.
  - `renderPdfInto()` draws pages sequentially into stacked canvases in the existing
    brochure modal (new `#clientBrochureCanvas` container + `.brochure-canvas` styles);
    sequential rather than parallel so a long brochure doesn't spike memory on exactly the
    low-end devices that need this path. iOS/desktop keep the native iframe viewer, which
    is the better experience (real text selection, pinch-zoom) where it actually works.
  - **Fail-safe:** a hang is not a rejection, so a `.catch` alone couldn't prevent a
    visitor being stranded on "Loading brochure…". Page 1 painting races a 12s deadline;
    if the deadline wins, the render is abandoned (`shouldStop`) and the PDF is handed to
    the phone's own handling — a download, not a preview, but never a dead end.
  - Both pdf.js files added to `sw.js`'s `SHELL_URLS` so they're precached — a visitor may
    well open the brochure for the first time only after going offline.
  - Canvases are dropped in `closeCustomModal` (they can be tens of MB on a long brochure).
  - **Verified as far as this environment allows:** pdf.js API loads (`pdfjsLib.version`
    reported 3.11.174), its worker spawns and replies `action: "ready"`, a plain `fetch` of
    the same PDF returns all 115,685 bytes, and a generic Worker round-trips — but
    `getDocument().promise` never settles under headless `--virtual-time-budget`, which
    deadlocks on pdf.js's multi-step worker handshake (the same class of headless async
    stall seen repeatedly this session, and the reason the fail-safe above matters
    regardless). The rendering itself still needs a real-device confirmation.

- **Brochure PDF still showed as a broken "tap Open" card on Android after the caching
  fixes above — turned out to be a completely different, pre-existing bug, unrelated to
  offline caching at all.** User re-tested and saw the exact same card; a targeted
  question narrowed it down: it happens the same way even ONLINE, before airplane mode —
  meaning it was never a cache-miss issue. Root cause: Android Chrome frequently refuses
  to render a PDF inline inside an `<iframe>` (how the Brochure viewer displays it) and
  downloads it instead, showing exactly this native "file downloaded, tap Open" card — a
  known, longstanding platform limitation, not something fixable by changing what's
  cached or how. A direct top-level navigation to the same PDF URL reliably uses Chrome's
  built-in PDF viewer instead, so `openClientBrochureModal` now detects Android
  (`/Android/i.test(navigator.userAgent)`) and opens the PDF with `window.open(src,
  '_blank')` instead of populating the modal's iframe. This still works offline: a new tab
  is a top-level navigation, same as any other, so `sw.js`'s existing project-asset
  navigation routing (see the earlier entry today) serves it from cache exactly the same
  way. Not applied to iOS/desktop — no evidence of the same iframe limitation there (the
  iPhone's earlier failure was a genuine cache-miss, a different bug, already fixed), and
  the in-app modal is the nicer experience where it actually works. `app.js` only.

- **Merged the two separate prompts (content download, then a plain install offer) into
  ONE combined "Add to Home Screen" banner, per explicit user request.** The user noticed
  Android's own native install popup shows its own "Installing…" progress after tapping
  Add, and asked why our download-with-progress step wasn't just folded into that same
  action — discussed and confirmed: the native prompt only builds the app-icon wrapper (it
  has no idea what a "gallery photo" is), the content download is the only thing that
  makes the site actually usable offline, so they're unrelated jobs but were needlessly
  presented as two separate user actions.
  - `#offlineSaveBanner` is now the ONLY banner — `#installBanner` and its dedicated
    functions (`maybeShowInstallBanner`, `hideInstallBanner`, `maybeShowIosInstallTip`)
    are removed, along with the CSS/markup that went with them.
  - The single `Add` button now does both jobs at once, neither blocking the other: calls
    `deferredInstallPrompt.prompt()` (native install dialog, where available — fire-and-
    forget, its `userChoice` isn't awaited) AND starts `runOfflineDownload` in the same
    click handler. Size/consent is still shown up front before the tap (per the earlier
    "ask first" decision — unchanged), but it's one action from there, not two.
  - `beforeinstallprompt`'s top-level listener now only captures the event
    (`deferredInstallPrompt = e`) — it no longer independently triggers any banner itself,
    closing the exact bypass-the-mobile-gate hole from the last entry (there's now only
    one place, `maybeOfferOfflineSave`, that ever shows anything, and it's only ever
    called from the already-mobile-gated `registerOfflineSupport`).
  - iOS Safari (no `beforeinstallprompt`, ever) gets the same banner and the same "Add"
    button, which still starts the content download — the sub-text additionally says
    "tap Share → Add to Home Screen after" for the one part that genuinely can't be
    automated on iOS (Apple gives web pages no API for it at all).
  - New `isIosSafari()` helper (extracted from the old `maybeShowIosInstallTip`, reused
    for the "is there any install path at all" check that decides whether to show the
    banner when a project happens to have zero local assets to cache).
  - Files: `app.js` (the bulk of it), `index.html` (retired `#installBanner` markup, added
    `id="offlineSaveTitle"` so the merged banner's heading can be set dynamically),
    `styles.css` (retired `.install-banner*` rules).

- **"Save for offline" reported 100%/Done while a PDF (and possibly others) had actually
  failed to cache — real bug, caught via real-device testing on both iPhone and Android
  showing the same failure.** `runOfflineDownload`'s per-item `catch` swallowed any
  fetch failure and still called `bump()` to keep the progress bar moving ("best-effort,
  not all-or-nothing" — reasonable intent, wrong execution): a failed request counted
  identically to a real success, so "Done" could mean either. Worse, the code also never
  checked `res.ok` on a "successful" fetch — sw.js's own synthetic `503 Offline` fallback
  response (if something failed further upstream) would have been silently treated as the
  real file and cached/counted as done. And regardless of outcome, the project always got
  marked `b91-offline-saved-<id>` = saved, permanently suppressing the prompt on any later
  visit — so even a fully failed run gave no way to retry.
  Fixed: `fetchOnce()` now throws on a non-OK response, not just a network error; each
  item gets one retry (today's demo tunnel — a free `cloudflared` quick tunnel — has
  already dropped requests under concurrent load, so a transient failure is a real,
  expected case, not hypothetical); failures are collected in a `failed[]` array instead
  of being discarded, `bump()` still runs on a final failure so the bar reaches 100%
  rather than stalling, but the closing state is honest about it (`"N/M saved"` instead of
  `"Done"`), and the `b91-offline-saved-<id>` flag is only set when `failed.length === 0`
  — a partial save leaves the prompt available again on the next visit instead of
  declaring false victory. Also lowered download concurrency (3 → 2) and sorted the queue
  so images/PDF go before video, on the theory that a constrained/flaky connection is more
  likely to sustain several small transfers than several concurrent large ones — the
  cheap items are what a partial failure should cost, not the video. `app.js` only.

- **Desktop mobile-gate follow-up: banner still showed on desktop even after the same-day
  gate above, because the gate lived in the wrong place.** User reloaded on desktop and
  still saw "Add to Home Screen." Root cause: `registerOfflineSupport()`'s mobile gate only
  stops *registration* from happening on new visits — it doesn't touch two things that
  bypass it entirely: (1) `maybeShowInstallBanner()` itself had no device check of its own,
  and is called directly by the top-level `beforeinstallprompt` listener, completely
  independent of `registerOfflineSupport()`; (2) a browser that had already registered
  `sw.js` on an earlier visit (before the mobile gate existed) keeps satisfying the
  browser's own install-eligibility check on every later visit regardless of what the gate
  now prevents going forward. Fixed both: `maybeShowInstallBanner()` now checks
  `isMobilePortrait() || isMobileLandscape()` directly (the actual display gate, not just
  the registration one — this is the fix that matters, since it blocks the banner
  regardless of which code path tries to trigger it), and `registerOfflineSupport()`'s
  desktop branch now actively `unregister()`s any existing service worker + deletes this
  app's caches instead of just returning, so a browser that tested this before the gate
  existed actually reverts instead of staying stuck. `app.js` only. A desktop tab that
  already has the old banner open needs one reload to pick this up.

- **"Add to Home Screen" banner never actually disappeared after Add/✕, and offered on
  desktop too (both caught by the user via real-device testing).**
  - **CSS bug:** `.install-banner { display: flex; ... }` was unconditional — same
    specificity as the UA stylesheet's `[hidden]{display:none}`, and later in cascade
    order, so it silently won every time `hideInstallBanner()` set `.hidden = true`. The
    banner stayed visibly on screen no matter what was tapped. Fixed with an explicit
    `.install-banner[hidden] { display: none; }` override (verified directly via an
    isolated test page — before the fix `getComputedStyle(...).display` read `flex` with
    the `hidden` attribute present; after, it correctly reads `none`). Added the same
    explicit `[hidden]` rule to `.offline-save-banner` defensively, even though it isn't
    actually affected today (no unconditional `display` of its own) — so it can't regress
    the same way later.
  - **Desktop scope bug:** the whole offline layer (service worker registration + both
    banners) had no device gating at all — it ran for any client page load, desktop
    included, even though desktop already has a real offline mechanism (⋯ → Export
    standalone site…) that this PWA layer was always meant to be a phone-only alternative
    to (see the Mobile Offline Rollout doc — this was scoped as mobile-only from the start
    of that discussion, it just hadn't been enforced in code yet). Fixed by gating
    `registerOfflineSupport()` on `isMobilePortrait() || isMobileLandscape()` — the same
    width+orientation checks the rest of the mobile-responsive pass already uses, already
    tuned to exclude a resized desktop window. On desktop this now means the service
    worker is never registered at all, so neither banner nor the offline cache applies —
    unchanged from before this whole initiative started. A desktop browser that already
    registered the worker on an earlier visit (before this fix shipped) keeps its existing
    registration; not actively unregistered (low-probability edge case, not worth the
    complexity of a cleanup path for something this new).
  - Files: `styles.css` (the two `[hidden]` rules), `app.js` (the mobile gate + its comment
    in `registerOfflineSupport`).

- **Brochure PDF served the entire app shell instead of the PDF, offline (real bug, found
  via real-device testing on the temporary tunnel demo).** The Brochure viewer loads its
  PDF into an `<iframe>` (`openClientBrochureModal`, app.js), and a browser treats an
  iframe's `src` load as a navigation — same `mode: 'navigate'` as the actual page. `sw.js`
  had one rule for every navigation: on a network failure, fall back to the cached app
  shell (`index.html`) — correct for reopening the app itself, but this meant an uncached
  PDF, offline, fell back to serving the **whole raw app shell** inside the little brochure
  iframe (unstyled `index.html` markup, confirmed from the user's screenshot). Fixed by
  routing project-asset navigations (path includes `/projects/` or `/data/`) through the
  same data-cache path as any other asset *before* the real-page-navigation branch, so a
  PDF is now cached/served like the file it is — not treated as a page load. `sw.js` only.
- **Eager "Save for offline" download — photos, PDF, and video, with a consent prompt and
  a real progress UI (user request, after testing showed gallery images/video/PDF weren't
  available offline unless each one had specifically been opened while online first).**
  Previously every non-shell asset was cache-on-view only (by design, mirroring video's
  intentional "cache only when actually played" behavior) — reasonable for video's size,
  but meant a buyer had to manually click through every photo and PDF before losing signal
  for a complete offline experience, which isn't realistic for a real demo. The user asked
  for everything to download automatically — but explicitly gated behind a size-and-consent
  prompt rather than starting silently, since eagerly pulling potentially hundreds of MB of
  video the instant the page loads could be an unwelcome, unannounced hit on a buyer's data
  plan (see the two-question discussion this session: broaden caching → recommended; ask
  first vs. auto-start → "ask first" recommended and chosen).
  - New: `collectOfflineAssets()` (app.js) walks `state.menuConfig.tree` (mirrors
    server.py's `scan_menu_for_online_content`'s walk of the same shape, but collecting
    local files instead of flagging external ones) plus `state.landmarks`/`state.amenities`
    render images, the pano, the site-plan, and the brand logo — collecting every same-
    origin (i.e. actually cacheable) asset URL for the current project. Plot-level media
    (`getPlotMediaList`) is deliberately NOT walked — those URLs are always meant to point
    out to an externally-hosted tour/video by design, so they'd be filtered out as external
    anyway. `estimateOfflineSize()` HEAD-requests each URL (real network request, bypasses
    the service worker since it only intercepts GET) to sum a total byte count without
    downloading anything yet.
  - New UI: `#offlineSaveBanner` (index.html) — a "Save for offline? · approx. XXX MB ·
    [Not now] [Download]" prompt that, on Download, morphs into a progress bar with a live
    percentage and a rolling ETA (`runOfflineDownload`, tracked via
    `Response.body.getReader()` byte counts, not just a file-count proxy). Shown once per
    project per browser — `localStorage` (`b91-offline-saved-<projectId>` /
    `b91-offline-declined-<projectId>`) suppresses re-asking on a later visit, mirroring
    the install banner's own existing dismiss pattern. Runs *before* the install banner in
    `registerOfflineSupport()` (chained, not simultaneous) so the two prompts don't stack.
    The actual downloads are plain `fetch()` calls with limited concurrency (3 at a time);
    no new caching code was needed in app.js — each fetch is transparently intercepted and
    stored by `sw.js`'s existing stale-while-revalidate (images/PDF) and `respondVideo`
    (video, unranged full-file GET → cached as the complete file) logic, exactly the same
    as if the user had opened that item themselves.
  - `registerOfflineSupport()` also hardened: `navigator.serviceWorker.ready` is now raced
    against a 5s timeout (`Promise.race`) rather than awaited unconditionally, so a stalled
    activation (flaky connection, or another open tab pinning an older worker) can't wedge
    the rest of boot — it now falls through to the install offer alone instead of hanging.
  - **Verification limits, stated plainly:** this could not be visually confirmed in this
    session. The live-server headless-screenshot method hit this project's own
    already-documented pano-texture-loading hang under headless — every single capture
    attempt (multiple virtual-time-budgets up to 20s, both before and after the
    `serviceWorker.ready` timeout fix) stopped at "Loading…" well before `init()` reaches
    `registerOfflineSupport()`, while the "Add to Home Screen" banner that WAS visible in
    those captures comes from a fully independent `beforeinstallprompt` listener — its
    presence says nothing about whether this new code ran. The bundle-export screenshot
    method (this project's usual reliable fallback) can't test this feature at all either:
    it forces `file://`, where service workers can't register and `fetch()` is blocked, so
    the feature is structurally inapplicable there. What WAS verified directly: `node
    --check` on both files; the real `sample` project's committed `alignment.json` genuinely
    has 17 local, cacheable assets (9 images, 4 PDFs, 4 videos) confirming the collector
    has real content to find, not an empty list; and a careful manual trace of every code
    path against the actual data shapes in this project. Needs a real-device pass over the
    tunnel before this is called solid.

## 2026-09-02


- **Added [VIRTUAL-TOUR.md](VIRTUAL-TOUR.md) — living plan for a multi-node panoramic
  virtual tour with hotspot navigation + WebXR.** Planning only; **no code written**.
  Captures a requirements Q&A with the product owner: replace 3DVista with our own tour
  engine (L1), panos are **3D renders** interior + exterior (L2), glide-through-space
  transition preferred (L4), WebXR on Quest with mono acceptable (L5/L6). Key technical
  finding: because the panos are rendered rather than photographed, a **depth pass** comes
  essentially free, which makes a real-parallax "glide" transition achievable by displacing
  a sphere mesh into a depth proxy — no photogrammetry or mesh reconstruction needed.
  Key tension logged: **eyeballed node placement (L3) is incompatible with the glide**,
  since depth warping needs the true inter-node translation vector (decision D-1,
  recommending the 3D scene's camera transforms be exported instead). Structure: locked
  decisions, a separate **Open Questions** table (external unknowns, OQ-1..7) and a
  separate **Decisions to be made** table (engineering choices with recommendations,
  D-1..9), a **render pipeline contract** flagged as the project's largest risk (radial vs
  planar depth, units, camera manifest), then Phases 0–5 with checkboxes — Phase 0 being a
  deliberately throwaway validation spike that proves the depth warp on two real adjacent
  interior nodes before any product is built around it. Doc carries a Progress Log to be
  appended each session. Files: `VIRTUAL-TOUR.md` (new), `CLAUDE.md` (planning-docs pointer
  in the header, new "Current status" entry).


- **Client offline layer (PWA) — minimal service worker + manifest + install prompt,
  built to demo mobile offline over a temporary tunnel while the real hosting decision
  (see the "Mobile Offline Rollout" doc) is still pending with the boss.** Client-only,
  same restriction as everywhere else in this initiative: a service worker can only
  register on a secure context (`https://` or `localhost`) — verified directly again this
  session (same "URL protocol... not supported" error as before) — so being on the same
  LAN as the boss doesn't by itself make a phone demo possible; a temporary HTTPS tunnel
  (e.g. `cloudflared` quick tunnel) in front of the already-running `server.py` is still
  needed for the live demo, not yet set up (no tunnel tool installed on this machine yet).
  New files: **`sw.js`** (root-scoped service worker — see its own header comment for the
  full design), **`manifest.webmanifest`** (static, generic branding — intentionally not
  per-project; see rationale below), **`icons/icon-192.png`**, **`icons/icon-512.png`**,
  **`icons/icon-512-maskable.png`** (generated via Pillow to match the existing
  `.brand-mark` gold-gradient "B91" look, not hand-drawn).
  - **Cache design (`sw.js`):** three caches — shell (app.js/styles.css/vendor/three.module.js/
    manifest/icons, precached on `install`), data (`projects/<id>/*.json|csv|svg` +
    pano/plan/amenity images, cached opportunistically on first request), media (video,
    cached only once actually requested — i.e. only after a buyer opens a video, since
    `<video>` in the client viewer never gets a `src` until `openClientVideoModal` sets one
    — see **Conventions & gotchas** for why this needed byte-range handling). Data/shell
    keys strip the cache-busting `?t=`/`?v=` query app.js always appends (`dataUrl`/
    `assetUrl`) before using the URL as a Cache Storage key, then stale-while-revalidate:
    serve the cached copy immediately, refresh it in the background from a real network
    fetch (which still carries the fresh cache-busting query) — otherwise every reload's
    unique query would be a cache miss, defeating the cache entirely.
  - **Admin is explicitly out of scope, twice over:** `registerOfflineSupport()` (app.js,
    called at the end of the successful boot path) never runs at all when `state.admin` is
    true, so a service worker is never even installed from an admin browser session in the
    first place. As a second, independent guard — since a worker's scope is the whole
    origin by default and could in principle already be installed in the same browser from
    an earlier client visit — `sw.js`'s own fetch handler checks for `admin=1` on every
    request (the navigated document's URL, or via `clients.get(event.clientId)` for
    subresource fetches from an already-open admin tab) and always falls through to a
    plain network fetch, untouched, when it finds it.
  - **Install prompt:** a small dismissible banner (`#installBanner`, new markup in
    index.html + `.install-banner*` styles.css rules) appears once `beforeinstallprompt`
    fires (Chrome/Edge/Android) with a working "Add" button, or — since iOS Safari never
    fires that event — swaps to manual "Tap Share → Add to Home Screen" instructions
    there instead (`maybeShowIosInstallTip`, UA-sniffed). Dismissal and installed-state
    are remembered in localStorage (`b91-pwa-dismissed`/`b91-pwa-installed`) so it doesn't
    nag on every visit.
  - **`manifest.webmanifest` is static/generic on purpose, not per-project:** its
    `start_url` can't dynamically reflect whichever `?project=<id>` the buyer was
    browsing when they tapped "Add to Home Screen" without a server-generated manifest
    route (a real web manifest file is static JSON, not templated per request) — skipped
    for now since the actual planned rollout (per the Mobile Offline Rollout doc) hosts
    each project as its own standalone bundle export at its own URL, which has no
    multi-project ambiguity to begin with; this only matters for today's throwaway
    same-server demo, where it's an acceptable footnote, not a blocker.
  - `server.py`: registered `.webmanifest` → `application/manifest+json` in the
    `mimetypes` module at import time (Python doesn't know this extension by default,
    which would otherwise serve it as `application/octet-stream`); no other server changes
    — `sw.js`/`manifest.webmanifest`/`icons/*` are served automatically by the existing
    static file handler, same as any other file in the project root.
  - **Verified:** `node --check` on `sw.js` and (with its one ES `import` line stripped,
    same trick the bundle export's own syntax-check precedent uses) `app.js`; `sw.js`/
    `manifest.webmanifest`/`icons/*.png` all served with 200 + correct Content-Type over
    `http://localhost:8731`; `beforeinstallprompt` fired on the real client page (Edge
    headless, fresh profile) — since Chrome only offers that once it's confirmed a valid
    manifest AND an active, fetch-handling service worker, this is real (not just
    code-reasoned) confirmation that registration succeeds end-to-end; a live screenshot
    of the client page shows the install banner rendered correctly, styled on-brand, not
    obstructing the zoom-controls column. **Not verified:** actual offline behavior after
    a real network cutoff (needs the tunnel + a real device, not yet done), and video
    byte-range caching specifically (`respondVideo`/`sliceRange` in sw.js) — implemented
    per documented `<video>` Range-request behavior but not exercised against a real
    seek/replay yet. Admin-mode regression could not be visually confirmed this session —
    hit the same live-server headless-screenshot unreliability already on record in this
    file (dynamic `import()` + `--virtual-time-budget` don't compose reliably; one capture
    mid-load showed the pre-JS DOM state, looking identical for both `?admin=1` and plain
    client URLs) — but a direct isolated check confirmed `state.admin` itself parses
    correctly from `?admin=1` (unaffected by this change, and nothing added here touches
    `wireAdmin()`/admin-detection logic), so this is treated as the same known testing
    limitation, not a new regression.

- **Landscape zoom-controls column misaligned — Available pill vs. icon row.** User
  screenshotted the landscape client and pointed out the alignment/margin looked off:
  the `.zoom-controls` column (Available pill + `#`/📍/🏛️/+/−/⊡ icon buttons) is a
  `flex-direction: column` stack with no `align-items` set, so it defaulted to
  flex-start (left). Every other child is the same 38px `.btn-icon` square, so this was
  invisible everywhere else — but the landscape-only Available pill (icon+label+count)
  is wider, and the container sizes itself to its widest child while staying pinned via
  `right: 16px`. Net effect: the pill's right edge sat at the intended 16px margin, but
  the narrower icon squares below it left-aligned to the pill's *left* edge instead,
  landing well short of that same right margin — the ragged, inconsistent column the
  user saw. Root-caused via reading the CSS (no JS involved) and fixed by adding
  `align-items: flex-end` to `.zoom-controls`, scoped inside the existing
  `body:not(.is-admin)` block of the landscape-only media query
  (`@media (orientation: landscape) and (max-height: 500px)`) so desktop and admin are
  untouched; also tightened the pill's padding slightly and nudged the container's
  right/bottom margin and item gap in for a cleaner fit on a short screen. Verified via
  the bundle-export screenshot workaround at 844×390 on the `sample` project — pill and
  icon column now share one right edge. `styles.css` only.

- **Mobile responsiveness pass — portrait fixes plus new orientation-aware landscape
  handling.** User asked for both client and admin to work well on phones; this entry
  covers the client-side work, verified via the bundle-export screenshot workaround (see
  **Conventions & gotchas**) at three viewports on the real `sample` project (which has
  exactly 12 landmarks): 390×844 (portrait), 844×390 (landscape), 1400×900 (desktop).

  **Portrait fixes:**
  - `.cat-drawer` now defaults to `is-collapsed` at boot on narrow portrait screens
    (`wireViewControls`, app.js) instead of covering ~64% of the screen before the visitor
    has even seen the panorama; desktop unchanged. Since `.cat-drawer-toggle` is a DOM
    child of `.cat-drawer`, added a counter-transform
    (`.cat-drawer.is-collapsed .cat-drawer-toggle`) so it stays visible/tappable when
    collapsed. `.cat-drawer`'s width changed from `width:250px;max-width:82vw` to
    `width:min(250px,82vw)` (identical result) so the counter-transform can reference the
    same expression.
  - `renderLandmarks()`/`renderAmenities()` (app.js) clamp each label's horizontal
    position to stay fully on-screen instead of running off the edge — the landmark
    connector line's endpoint moves with the clamp so it still visually reaches the
    banner; the amenity fix nudges just the `.am-chip` (an extra offset on top of its
    existing `translateX(-50%)`), leaving the pin exactly on its true hotspot.
  - New `LANDMARK_MOBILE_CAP = 6` (app.js): when more landmarks match the current filter
    than that on a mobile viewport, only the first 6 render — landmarks with a render
    image (`renderSrc(lm)`, the same signal behind the existing `.has-render` hover-card
    feature) are prioritized to stay visible — and a new `#lmOverflowHint` pill
    (index.html/styles.css) shows e.g. "+6 more — filter by category", wired (once, in
    `wireViewControls`, not per-frame) to a new `openLandmarksCategoryPicker()` (app.js)
    that jumps straight into the existing category picker.
  - `.sync-meta` now truncates with an ellipsis instead of overflowing past the viewport
    edge (`.sync{min-width:0}` + `.sync-meta{overflow:hidden;text-overflow:ellipsis;
    max-width:46vw}`); `.lm-ico`/`.lm-label`/`.lm-sub-bar`/`.am-chip`/`.am-ico`/`.am-label`
    shrink a bit to reduce (not eliminate — see the caveat below) how often labels
    collide; `.wizard-types-grid` (the menu-item wizard's content-type picker) drops from
    3 to 2 columns at `≤480px`.

  **New this pass — landscape gets different treatment than portrait, not the same mobile
  squeeze:** the user shared reference screenshots (desktop-quality layouts — a well
  margined site plan with a legend panel, a well-spaced landmarks view) and asked
  specifically for landscape mobile to look like those, with desktop required to stay
  completely untouched.
  - New `isMobilePortrait()` (app.js: `innerWidth<=720 && matchMedia('(orientation:
    portrait)').matches`) replaces the old plain-width check for the drawer-collapse and
    a new rotate hint (below) — a landscape phone, even one narrower than 720px, no
    longer gets the portrait squeeze. The big mobile CSS block (topbar/legend/sync/label
    sizing/modal-dialog) is now gated `@media (max-width:720px) and (orientation:
    portrait)` instead of plain `max-width:720px` — this only *narrows* which viewports
    the existing rules apply to, so there is no way it can newly affect desktop.
  - New `isMobileLandscape()` (app.js: `innerWidth<=900 && matchMedia('(orientation:
    landscape)').matches`) — a separate, wider threshold used **only** for the landmark
    density cap. Landscape testing showed even 844px width still overlaps heavily with a
    dozen full-size, uncapped labels, so `renderLandmarks()`'s cap trigger is
    `isMobilePortrait() || isMobileLandscape()` while the drawer-collapse and portrait CSS
    stayed portrait-exclusive.
  - New, minimal `@media (orientation:landscape) and (max-height:500px)` block
    (styles.css): hides the topbar tagline, trims topbar padding slightly. Most of the
    "looks like the reference" result came from *excluding* landscape from the portrait
    squeeze, not from adding new landscape rules — the underlying desktop-style layout
    already resembles the reference once portrait's squeeze isn't forced onto it.
  - New rotate hint: `wireViewControls()` (app.js), non-admin only, calls
    `showNotice('Tip: rotate your device to landscape for the best view.')` once at boot
    if `isMobilePortrait()`, and again via a `matchMedia` change listener if the visitor
    rotates back into portrait later in the session.

  **Verified:** portrait screenshot shows the collapsed drawer + rotate hint + "+6 more"
  hint; landscape screenshot shows the open drawer, a clean single-row topbar matching the
  reference images, and "+6 more" (needed once the cap was extended to landscape), with
  no rotate hint; desktop screenshot (1400×900) shows all 12 landmarks full-size and
  uncapped, the full topbar subtitle, and no hints of any kind — confirming desktop is
  unaffected.

  **Still unresolved, worth restating — now covers both orientations:** the density cap
  reduces landmark-vs-landmark overlap, it does not eliminate it; the labels that DO stay
  visible can still overlap each other somewhat, confirmed in both the portrait and
  landscape verification screenshots. This remains a deliberate scope boundary (real
  collision-avoidance/clustering was discussed and explicitly not chosen for this pass),
  not an oversight. Admin-side mobile behavior is still not visually verified this
  session (see **Conventions & gotchas**) — a human needs to check it on an actual phone.

  **Same-day follow-up: topbar hidden entirely in landscape, replaced by a floating
  "Available" button.** The user tested the above on a real device and found the topbar
  (brand + full legend + sync + Refresh) ate a disproportionate share of a short
  landscape screen; asked to hide it there and keep just the one thing worth keeping —
  seeing/filtering to available plots — as a compact bottom-right button.
  - New `#zoomAvailableBtn` (index.html), first child inside the existing `.zoom-controls`
    floating column — same dot/label/count as the header's "Available" chip, styled with
    the dark floating backdrop the other zoom-control buttons already use. `display:none`
    by default; only shown inside the landscape media query.
  - The landscape media query now also hides `.topbar` entirely and reveals
    `#zoomAvailableBtn` — both scoped `body:not(.is-admin)`, so admin keeps its topbar in
    landscape regardless (not something the user asked to change, and not tested for
    admin).
  - `renderLegend()`/`toggleFilter()` (app.js) now keep `#zoomAvailableBtn`'s count and
    `aria-pressed` in sync with the header chips (previously only updated the chips); a
    new click listener calls the exact same `toggleFilter('available')` the header chip
    already calls, so behavior is identical, just relocated.
  - **Hit a real CSS Grid bug getting here** — see the new **Conventions & gotchas** entry
    on `display:none` and grid item placement; first attempt produced a fully black
    screenshot (canvas rendered at `height="0"`), root-caused and fixed by collapsing
    `.topbar` in place instead of removing it from grid flow.
  - **Verified**: fresh bundle export, screenshotted at 844×390 (landscape — topbar gone,
    "Available 1" pill correct, drawer/hint still work, pano now fills nearly the full
    height), 1400×900 (desktop — completely unaffected), 390×844 (portrait — completely
    unaffected).

  **Second same-day follow-up: the collapsed drawer's toggle button, fixed properly this
  time.** When the drawer was first made to default-collapse (earlier in this same pass),
  a counter-transform was added to keep `.cat-drawer-toggle` reachable — it worked (the
  button stayed visible/tappable), but pushed it all the way back to its *open-state*
  position: ~230px in from the left edge, floating with nothing around it to anchor it.
  The user tested this on a real device and correctly called it out as looking like a
  stray/buggy floating button, not a deliberate control — **that earlier fix was the wrong
  call, worth being honest about rather than glossing over.**
  - Investigated whether hiding the toggle entirely (as first requested) was actually
    safe: found the bottom-left icon cluster (fullscreen/mute/autopan —
    `.cat-drawer-foot`) is *also* a child of `.cat-drawer`, confirmed via screenshot that
    it disappears along with the drawer when collapsed too — meaning the toggle is
    currently the **only** way back into the menu once collapsed. Flagged this and the
    user chose: dock it at the screen's left edge instead, rather than hide it with no
    replacement.
  - The actual fix, worked out from the transform math and then confirmed by screenshot:
    **delete the counter-transform, don't replace it with different positioning math.**
    The toggle's own unmodified base position (poking ~20px past the drawer's right edge
    when open — long-standing, unrelated to this pass) rides along with the parent's
    `-100%` collapse shift when no override fights it, landing docked ~20px past the
    *screen's* left edge instead — the same half-in/half-out visual language it already
    used on the drawer's edge, just anchored to the screen edge now. One rule removed in
    styles.css (`.cat-drawer.is-collapsed .cat-drawer-toggle`), replaced with a comment
    explaining why no override is needed — so a future edit doesn't reintroduce the
    counter-transform without understanding why it was wrong.
  - **Verified**: fresh bundle-export screenshot at 390×844 (portrait, collapsed by
    default) — toggle now shows as a small tab docked at the left edge, not floating
    mid-screen. No app.js or index.html changes; drawer's open-state appearance and the
    default-collapse behavior itself are unchanged.

  Files: `styles.css`.

## 2026-08-31

- **Standalone export now genuinely runs offline via `file://` — no server, not even a
  static one.** Previously "⋯ menu → Export standalone site…" produced a folder that
  *looked* self-contained but silently failed if opened by double-clicking `index.html`:
  verified directly (a minimal repro in headless Edge) that both the dynamic
  `<script type="module">import(...)</script>` used to load `app.js`, and every
  `fetch()` call the app makes for its own data (`plots.svg/csv`, `alignment/landmarks/
  amenities.json`), throw `Failed to fetch` under `file://`. Classic `<script src>` and
  `<img src>` do not — so most images/video (already `<img>`/`<video>`-based: logos,
  landmark/amenity renders, contact photos, gallery photos) needed no changes. The pano
  and site-plan images turned out to be the exception — see the follow-up fix below.
  - `server.py`'s `do_bundle` now rewrites the shipped copies at export time only (the
    live/served app is untouched): `module_to_global()` turns the vendored
    `vendor/three.module.js` — a single flat module whose only import/export surface is
    one trailing `export { A, B, C, ... };` line — into `vendor/three.global.js`
    (`window.THREE = {...}`); `strip_named_import()` removes `app.js`'s one
    `import * as THREE from './vendor/three.module.js';` line; `build_embedded_files_json()`
    + `bake_bundle_html()` embed the project's 5 core data files inline as
    `window.B91_BUNDLE_FILES` and swap the module script tag for two classic ones.
  - `app.js` gained `loadProjectFile(name)` (next to `dataUrl`) — a fetch-Response-shaped
    helper that the 5 data-loading call sites (`loadCommittedCSV`, `loadGeometry`,
    `loadAlignmentFile`, `loadLandmarksFile`, `loadAmenitiesFile`) now go through; in
    bundle mode it reads `B91_BUNDLE_FILES` instead of fetching. `loadData()` also skips
    the live Google Sheet attempt entirely in bundle mode (`!BUNDLE &&` guard) — a
    `file://` export can never reach one, so it goes straight to the embedded CSV.
  - New: **export-time flagging.** Any admin menu item (video/pdf/tour/link/gallery photo)
    whose active content is a pasted URL rather than an uploaded file still needs internet
    even in the offline bundle — that content lives elsewhere and can't be embedded.
    `scan_menu_for_online_content()` (server.py) walks the menu tree and a new
    `GET /api/export-bundle-check?project=<id>` route reports them; `exportBundle()`
    (app.js) calls it before downloading. **Revised same day** (see below) to a real popup
    with a per-item **Edit** jump instead of a plain list — the admin can still export
    anyway either way (non-blocking, by design). A matching `noteIfExternal()` helper in
    the client viewer surfaces the same "needs an internet connection" notice at
    watch-time for video/tour/PDF items resolved to an external URL (not wired into
    gallery photos or plain `link` items — a broken image / an outbound link are already
    self-explanatory, so a notice there would just be noise).
  - **Verified end-to-end**, not just unit-level: exported the real `sample` project
    (1 plot, 11 landmarks, 3 amenities, a real menu tree — none URL-backed, so
    `flagged: []` correctly), unzipped it, and opened its `index.html` via a literal
    `file://` URL in headless Edge with **no server running at all**. Confirmed zero
    console errors, a real `<canvas data-engine="three.js r160">` (Three.js initialized
    from the classic-script global), landmark banner DOM elements rendered, and the
    header showing "1 plots · project sample" (plots.csv loaded from embedded data, sheet
    fetch correctly skipped). Files: `server.py`, `app.js`.
  - **Follow-up same day: the pano background and site-plan (drape) image weren't
    rendering** in that first export, while everything else (plots, landmarks, amenities,
    menu content) worked. Root cause, verified with a second direct test: those two
    specifically are uploaded to a **WebGL texture** (`texImage2D`), and — unlike a plain
    `<img>`, which loads fine under `file://` — a texture sourced from a `file://` path is
    **rejected as tainted/cross-origin even from the same folder**. Confirmed with a
    minimal repro: `gl.texImage2D` on an `<img>` loaded from a local file throws
    `SecurityError: ... contains cross-origin data`; the identical call using a `data:`
    URI succeeds. Fix: `server.py` gained `build_embedded_images_json()` (base64-embeds
    just `panoImage.file`/`groundImage.file` as `window.B91_BUNDLE_IMAGES`, keyed by
    basename) and `read_alignment()` (factored out of `do_bundle_check`, now shared);
    `bake_bundle_html()` grew a 4th param to bake the new flag in too. `app.js`'s
    `assetUrl()` checks `BUNDLE_IMAGES` first and returns the embedded `data:` URI when
    present — a single-point change, so every other image (which was never affected)
    resolves exactly as before. **Verified**: re-exported `sample`, confirmed both
    `Demo.web.jpg` and `Map_DesignCutOut10.web.png` present as `data:image/...;base64,...`
    in the shipped `index.html`, then opened it via `file://` with no server running and
    **took an actual screenshot** (a DOM dump can't show WebGL canvas pixels) confirming
    the aerial pano now renders correctly with landmarks and menu overlaid, no console
    errors.
  - **Second follow-up same day: export-time flagging rebuilt as a real popup with a
    per-item Edit jump**, replacing the plain `confirm()` — a `confirm()` can only show
    text and OK/Cancel, so fixing a flagged item meant cancelling the export, finding that
    item in the menu tree, editing it separately, then re-exporting. New `#exportFlaggedModal`
    (`index.html`, reuses the existing `.modal.custom-feature-modal` pattern — no new CSS)
    lists each flagged item (title, content type, its current URL) with an **Edit** button;
    clicking it calls `openNodeBuilderModal(nodeId)` — the same "Add/Edit Menu Item" wizard
    used everywhere else — pre-loaded on that exact item, ready to swap the pasted link for
    an upload. `scan_menu_for_online_content()` (server.py) now includes each item's `id`
    and current `url` in its response (previously just `title`/`contentType`) so the client
    can make that jump. New `showExportFlaggedModal(flagged)` (app.js, next to
    `exportBundle`) drives it — resolves `true` only on "Export Anyway"; both "Cancel
    Export" and "Edit" resolve `false`. **Verified**: `node --check` passed; loaded the
    real admin page headlessly with zero console errors and all 4 new element ids present
    in the DOM; created a throwaway test project with one URL-backed item and one
    file-backed item, hit the real `/api/export-bundle-check` endpoint, and confirmed only
    the URL-backed one came back flagged, correctly carrying its `id`/`url`. **Not**
    verified: an actual interactive click-through of Edit/Proceed/Cancel in a live browser
    session — no browser-automation tool was available this session, only headless
    page-load + DOM-dump + screenshot. Worth a manual click-through before calling this
    fully proven, though the logic reuses already-proven helpers
    (`openCustomModal`/`closeCustomModal`, `openNodeBuilderModal(id)`) rather than new
    mechanics of its own.
  - **Third follow-up same day: amenities weren't covered by the flagging at all.** The
    user reported a YouTube video in one of their **amenities** (a separate feature from
    the menu tree — in-layout icon pins with their own `tour_url`) didn't trigger the
    popup — correctly: `scan_menu_for_online_content()` only ever walked the menu tree,
    never `amenities.json`. Confirmed against real data before fixing: the `sample`
    project's "Priyadarshi Satyakam aasram" amenity has a YouTube `tour_url` and wasn't
    being flagged. Fix: new `scan_amenities_for_online_content()` + `read_amenities()`
    (server.py, same pattern as the menu-tree scan) — any amenity with a non-empty
    `tour_url` is flagged (amenities have **no upload alternative at all** for it, so any
    value there is inherently a pasted link). `do_bundle_check` now merges both scans.
    Each flagged entry now carries a `"source"` (`"menu"` or `"amenity"`) so
    `showExportFlaggedModal`'s Edit button routes correctly — `openNodeBuilderModal(id)`
    only understands menu-tree nodes; an amenity's Edit now calls `setAdminTab('amenities')`
    + `selectAmenity(id)` instead. Also added `noteIfExternal()` to `openModal()` — the one
    shared function that opens tour/video/image content for **both** plots and amenities —
    so the runtime "needs an internet connection" notice now covers amenity tours too (and
    incidentally plot walkthroughs, which is accurate even though plots aren't part of the
    export-time flag list — see below).
    **Deliberately NOT extended to plots** (`plots.csv`'s own `tour_url`/`video_url`/
    `image_url`): a plot's tour link is *always* meant to point to an external 3DVista
    tour — that's this app's whole "storefront" design from day one, not an admin mistake
    the way an unflagged menu item or amenity link is (those two have a real "did you mean
    to upload instead?" choice; a plot's tour never offers one). Worth revisiting if the
    admin actually wants plot tour links called out too — that'd be a bigger addition
    (CSV + `media_json` parsing), not a small follow-up like this one. **Verified**:
    `node --check` passed; hit the real `/api/export-bundle-check?project=sample` against
    unmodified real data and confirmed the YouTube-linked amenity now comes back flagged
    with the right `id`/`title`/`url`/`source`; reloaded the real admin page headlessly
    afterward with zero console errors. Same caveat as above: Edit was not clicked through
    interactively.

- **Client Contact Card modal redesigned as a full-screen page.** Was a small
  centered ~900x500 box; `#clientContactModal`'s dialog is now 100vw/100dvh
  (no border-radius/shadow — a true takeover, not a card). The info side keeps
  the same admin-set fields (`node.contact`: title/about/phone/email/image —
  `openClientContactModal` in app.js is unchanged throughout) but presents them
  with a "Get in touch" eyebrow (small accent-colored rule + label), a serif
  display title (`Georgia`/`ui-serif` stack — no external font, stays
  offline-friendly), and the address/phone/email as icon rows with hairline
  separators instead of plain "Label: value" text. The icon rows use inline
  SVG line-icons (pin/phone/envelope) instead of emoji, since emoji render
  inconsistently across OS/browser and read as less premium. Palette shifted
  from the generic slate/cyan first pass to a warm editorial one — off-white
  panel (`#faf7f2`), warm charcoal ink (`#1c1917`), bronze/gold accent
  (`#a8752c`, via `--contact-accent` custom props scoped to
  `.contact-modal-right`) — to better match the warm interior photography
  admins tend to use here; close button is a circular subtle button. Mobile
  (`≤768px`) stacks image (38vh) over content, still full-screen. Cleaned up
  ~15 inline `style="..."` attributes on `#clientContactModal`'s markup that
  were dead weight — the CSS block already controlled everything via
  `!important` — and added a `.contact-modal-backdrop` rule
  (position:absolute/inset:0/z-index:1) since that one was previously *only*
  an inline style with no CSS-side equivalent (removing it without replacing
  would've broken backdrop click-to-close). Files: `index.html`
  (`#clientContactModal` markup), `styles.css` (`.contact-modal-*` block,
  ~line 1418+).

- **Fixed a black strap over admin wizard step text.** The "Add Menu Item"
  wizard's step body (`.custom-modal-body`) had no background of its own, so
  it inherited `.modal-body`'s `background:#000` (meant for other modals like
  the image/video lightbox) — showing as a solid black bar right above each
  step's heading (e.g. "Item Title & Content Type"). Fixed by giving
  `.custom-modal-body` `background: transparent` so it shows the wizard
  dialog's own dark panel color instead. File: `styles.css`.

- **Landmark category camera panning now "fits" instead of always sweeping.**
  Selecting a landmark category in the client used to always pan the camera across a
  window at least 45° wide (`MIN_SWEEP_ARC`), even for a tight cluster of landmarks —
  causing visibly excessive panning for categories that could've been shown in one
  frame. `computeLandmarkPanRange` now makes a fit-or-sweep decision: if the matched
  landmarks' bounding arc (plus 8° padding each side) fits within `FOV_MAX` (120°), the
  camera frames the whole group at a fitted FOV (55–120°) and idles with a small gentle
  sway instead of panning; only a category that genuinely can't fit in one frame still
  sweeps, now sized to its real leftmost/rightmost extent instead of an inflated
  minimum. Removed `MIN_SWEEP_ARC`/`SWEEP_EDGE_PAD`/`withSweepBounds`; added
  `LANDMARK_EDGE_PAD`/`LANDMARK_FIT_FOV_CAP`/`LANDMARK_FIT_FOV_FLOOR`/
  `LANDMARK_SWEEP_FOV`/`LANDMARK_SWAY_HALF` and a small `meanDirection` helper.
  `renderLoop`'s idle ping-pong and `updateCamera`'s hard clamp are unchanged — they
  just operate on a tiny sway window or a real sweep window depending on the fit
  decision. Verified in-browser by the user: a 2-landmark Education category that
  previously swept now correctly frames both landmarks together. Files: `app.js`
  (`computeLandmarkPanRange`, `applyCategoryFilter`), `CLAUDE.md` (new code-map bullet).

## 2026-08-27

- **Created this changelog.** From now on, every change made via Claude will be
  logged here as it happens (not batched at the end of a session).
