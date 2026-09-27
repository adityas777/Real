# CLAUDE.md — Emagicor/ZeroxRealEstate

The active project in this repo is the **Build91 Interactive Plot Map**, a standalone
zero-build Three.js 360° panorama plot-map app.

➡️ **It lives in [`plot-map/`](plot-map/). Start there and read
[`plot-map/CLAUDE.md`](plot-map/CLAUDE.md)** — that's the full agent handoff
(architecture, code map, how to run/verify, conventions, gotchas, current status).

- Run it with the `plot-map` launch config (`python server.py 8731` — serves the app
  and handles admin server-side saves). Sites live in `projects/<id>/` — **not in git** (ignored;
  their home is S3, see `plot-map/ADMIN-DATA-SYNC.md`); client =
  `/?project=<id>` (default `sample`), admin = `/?admin=1&project=<id>`.
- **Admin project data (cloud ⇄ local):** how a project's working files move between S3 and a
  machine is specified in [`plot-map/ADMIN-DATA-SYNC.md`](plot-map/ADMIN-DATA-SYNC.md) — read it
  before changing `assets_s3.py`, `/api/assets/*` or the admin Save path, and update it with them.
- After any change to the app, keep the docs current — see the project skill
  `plot-map/.claude/skills/keep-docs-current/`.
