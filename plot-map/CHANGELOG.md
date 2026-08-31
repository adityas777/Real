# Changelog

Running log of changes made by Claude in this session/project going forward.
Newest entries at the top. Each entry: what changed, why, and files touched.

---

## 2026-08-31

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
