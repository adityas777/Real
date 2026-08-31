---
name: keep-docs-current
description: Keep the Build91 plot-map project docs current after ANY change to the app. Invoke at the end of a turn in which you edited app.js, index.html, styles.css, or the sample/ contract for the plot-map project (…/ZeroxRealEstate/plot-map) — before summarizing to the user. Ensures CHANGELOG.md, CLAUDE.md, README.md, and inline comments always reflect the latest state so a fresh agent or a swapped Claude account can restart seamlessly. Also use when the user asks to "document", "update the docs", "summarize the project", or "write a handoff".
---

# Keep the plot-map docs current

This project is a single-file, no-build Three.js app whose only durable, cross-account
memory is the **repo-committed docs**. (The per-account `~/.claude` memory does NOT
survive an account swap.) So documentation is part of "done": a change isn't finished
until the docs reflect it.

## When to run

- **Every turn where you changed** `app.js`, `index.html`, `styles.css`, or the
  `sample/` file contract — run this before you write your closing summary.
- When the user asks to document / summarize / write a handoff.
- Skip only for pure read-only investigation or throwaway experiments you reverted.

## The checklist

Work through these; update only what your change actually touched.

1. **`CHANGELOG.md`** — append a dated entry for every change (what changed, why,
   files touched), newest entry on top. Do this for every change, not just the ones
   that also touch CLAUDE.md/README.md below.

2. **`CLAUDE.md`** (agent handoff — the most important file):
   - **Code map** — if you added/removed/renamed a function or section, update the
     bullet for that section so the map still matches `app.js`.
   - **Conventions & gotchas** — if you hit or fixed a non-obvious trap, record it.
   - **Data files & contract** — if you changed `alignment.json` / `plots.*` /
     `landmarks.json` shape or added a `sample/` asset type, update the contract.
   - **Current status / open items** — reflect what's now done, and any new TODO.
   - **How to run / verify** — update if the launch config, URLs, or verification
     approach changed.

3. **`README.md`** (user-facing): update the feature description, the admin workflow,
   and any JSON examples the user relies on. Keep it in the user's voice (what/why/how),
   not implementation detail.

4. **Inline comments in the code**: keep a short "why" next to non-obvious logic you
   added or changed (handedness, projection, cache-busting, texture caps, etc.).

5. **Optional — `~/.claude` memory** (`plot-map-prototype.md`): if you have memory
   access this session, mirror the key new facts there too. But treat it as a *cache*,
   not the source of truth — CLAUDE.md/README are canonical because they travel with
   the repo.

## Rules

- **Same turn, before the summary.** Never defer with "I'll document later."
- **Accurate over exhaustive.** If code and docs disagree, the code is truth — fix the
  doc to match, and prefer deleting a stale claim over leaving it wrong.
- **Don't invent status.** Only mark something "verified" if you actually verified it
  this session (preview_eval / node --check), and say how.
- **Keep it scannable.** Short bullets, real file/function names, `path:line` where useful.
- **Don't document volatile user data.** `sample/` holds the user's live exported site
  (their panos/plans/plots) — document the *contract/structure*, never enumerate or
  depend on their specific current files, and never overwrite their data.

## Quick verification that docs are in sync

- Every top-level function/section in `app.js` has a corresponding line in the CLAUDE.md
  code map (spot-check the ones you touched).
- `README.md` mentions every admin control and client toggle a user can see.
- `CLAUDE.md` "Current status" has no stale "not yet built" for something that now exists.
