# CLAUDE.md — Emagicor/ZeroxRealEstate

The active project in this repo is the **Build91 Interactive Plot Map**, a standalone
zero-build Three.js 360° panorama plot-map app.

➡️ **It lives in [`plot-map/`](plot-map/). Start there and read
[`plot-map/CLAUDE.md`](plot-map/CLAUDE.md)** — that's the full agent handoff
(architecture, code map, how to run/verify, conventions, gotchas, current status).

- Run it with the `plot-map` launch config (`python server.py 8731` — serves the app
  and handles admin server-side saves). Sites live in `projects/<id>/`; client =
  `/?project=<id>` (default `sample`), admin = `/?admin=1&project=<id>`.
- After any change to the app, keep the docs current — see the project skill
  `plot-map/.claude/skills/keep-docs-current/`.
