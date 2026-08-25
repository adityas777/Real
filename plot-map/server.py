#!/usr/bin/env python3
"""
Build91 Interactive Plot Map — tiny zero-dependency dev/admin server.

Serves the static app (like `python -m http.server`) AND adds a small write API so
the admin view can SAVE a project's files straight to disk instead of downloading
them. Each project is a directory under ./projects/<project-id>/.

  GET  /                         → the client app (index.html)
  GET  /?project=<id>            → client loads projects/<id>/  (handled in JS)
  GET  /api/projects             → { "projects": ["sample", ...] }  (dirs with plots.svg)
  GET  /api/export-bundle?project=<id>
                                 → a .zip of a self-contained, view-only "standalone site"
                                   (app shell + the project's files under data/) for any host
  POST /api/save                 → body { project, files:[{name,encoding,data}] }
                                   writes each file into projects/<project>/, returns JSON

Safety: project ids and file names are sanitised and every write is confined to the
projects/ root (no path traversal). It binds to 0.0.0.0 so other devices on the LAN can
reach it (e.g. admin plotting from a remote browser). NOTE: the write API
(/api/save,/rename,/delete) is UNAUTHENTICATED — only run this on a trusted / firewalled
network. Set HOST=127.0.0.1 (env) to restrict it back to this machine only.

Run:  python server.py [port]      (default 8731)
"""
import json
import os
import re
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECTS_DIR = os.path.join(ROOT, "projects")
PROJECT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")

def safe_project(pid):
    """Return a validated project id or None."""
    pid = (pid or "").strip().lower()
    return pid if PROJECT_ID_RE.match(pid) else None

def safe_filename(name):
    """basename only, no separators / traversal / hidden files."""
    name = (name or "").strip()
    if not name or "/" in name or "\\" in name or ".." in name or name.startswith("."):
        return None
    if name != os.path.basename(name):
        return None
    return name

# The app shell files (relative to ROOT) that a standalone bundle ships alongside the data.
BUNDLE_SHELL = ["index.html", "app.js", "styles.css", os.path.join("vendor", "three.module.js")]

def inject_bundle_flag(html, pid):
    """Bake window.B91_BUNDLE into the exported index.html so app.js boots in view-only
    bundle mode and reads its data from ./data (pid is already sanitised → safe in JSON)."""
    flag = '<script>window.B91_BUNDLE = {"project": "%s", "dataBase": "./data"};</script>' % pid
    m = re.search(r"<head[^>]*>", html, re.IGNORECASE)
    return (html[:m.end()] + "\n  " + flag + html[m.end():]) if m else (flag + html)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = self.path.split("?", 1)[0]
        if route == "/api/projects":
            projects = []
            if os.path.isdir(PROJECTS_DIR):
                for name in sorted(os.listdir(PROJECTS_DIR)):
                    if name.startswith("."):
                        continue                    # skip .trash and other hidden dirs
                    d = os.path.join(PROJECTS_DIR, name)
                    if os.path.isdir(d) and os.path.isfile(os.path.join(d, "plots.svg")):
                        projects.append(name)
            return self._send_json(200, {"projects": projects})
        if route == "/api/export-bundle":
            return self.do_bundle()
        return super().do_GET()

    def do_bundle(self):
        """Zip a self-contained, view-only copy of one project (app shell + data/) → download."""
        import io
        import zipfile
        from urllib.parse import urlparse, parse_qs
        pid = safe_project((parse_qs(urlparse(self.path).query).get("project") or [""])[0])
        if not pid:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        src = os.path.join(PROJECTS_DIR, pid)
        if not os.path.isdir(src) or not os.path.isfile(os.path.join(src, "plots.svg")):
            return self._send_json(404, {"ok": False, "error": f"'{pid}' not found"})
        buf = io.BytesIO()
        try:
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                for rel in BUNDLE_SHELL:                       # the app itself, at the bundle root
                    p = os.path.join(ROOT, rel)
                    if not os.path.isfile(p):
                        continue
                    with open(p, "rb") as fh:
                        data = fh.read()
                    if rel == "index.html":
                        data = inject_bundle_flag(data.decode("utf-8"), pid).encode("utf-8")
                    z.writestr(f"{pid}/" + rel.replace(os.sep, "/"), data)
                for name in sorted(os.listdir(src)):           # the project's files under data/
                    if name.startswith("."):
                        continue
                    fp = os.path.join(src, name)
                    if os.path.isfile(fp):
                        z.write(fp, f"{pid}/data/{name}")
        except Exception as e:
            return self._send_json(500, {"ok": False, "error": str(e)})
        body = buf.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", f'attachment; filename="{pid}-plotmap.zip"')
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_POST(self):
        route = self.path.split("?", 1)[0]
        if route == "/api/rename":
            return self.do_rename()
        if route == "/api/delete":
            return self.do_delete()
        if route != "/api/save":
            return self._send_json(404, {"ok": False, "error": "not found"})
        try:
            payload = self._read_json()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"bad request: {e}"})

        project = safe_project(payload.get("project"))
        if not project:
            return self._send_json(400, {"ok": False, "error": "invalid project id (use a-z 0-9 - _)"})
        files = payload.get("files")
        if not isinstance(files, list) or not files:
            return self._send_json(400, {"ok": False, "error": "no files"})

        dest = os.path.join(PROJECTS_DIR, project)
        os.makedirs(dest, exist_ok=True)
        real_root = os.path.realpath(PROJECTS_DIR)
        written, skipped = [], []
        import base64
        for f in files:
            name = safe_filename(f.get("name"))
            if not name:
                skipped.append(f.get("name"))
                continue
            path = os.path.join(dest, name)
            if not os.path.realpath(path).startswith(real_root + os.sep):
                skipped.append(name)
                continue
            data = f.get("data", "")
            try:
                raw = base64.b64decode(data) if f.get("encoding") == "base64" else str(data).encode("utf-8")
                with open(path, "wb") as out:
                    out.write(raw)
                written.append(name)
            except Exception:
                skipped.append(name)

        return self._send_json(200, {
            "ok": True, "project": project,
            "dir": os.path.relpath(dest, ROOT).replace(os.sep, "/"),
            "written": written, "skipped": skipped,
        })

    def do_rename(self):
        try:
            p = self._read_json()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"bad request: {e}"})
        src_id, dst_id = safe_project(p.get("from")), safe_project(p.get("to"))
        if not src_id or not dst_id:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        src, dst = os.path.join(PROJECTS_DIR, src_id), os.path.join(PROJECTS_DIR, dst_id)
        if not os.path.isdir(src):
            return self._send_json(404, {"ok": False, "error": f"'{src_id}' not found"})
        if os.path.exists(dst):
            return self._send_json(409, {"ok": False, "error": f"'{dst_id}' already exists"})
        try:
            os.rename(src, dst)
        except Exception as e:
            return self._send_json(500, {"ok": False, "error": str(e)})
        return self._send_json(200, {"ok": True, "from": src_id, "to": dst_id})

    def do_delete(self):
        import shutil, time
        try:
            p = self._read_json()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"bad request: {e}"})
        pid = safe_project(p.get("project"))
        if not pid:
            return self._send_json(400, {"ok": False, "error": "invalid project id"})
        src = os.path.join(PROJECTS_DIR, pid)
        if not os.path.isdir(src):
            return self._send_json(404, {"ok": False, "error": f"'{pid}' not found"})
        # not a hard delete: move to projects/.trash/<id>-<epoch> so it's recoverable
        trash = os.path.join(PROJECTS_DIR, ".trash")
        os.makedirs(trash, exist_ok=True)
        dest = os.path.join(trash, f"{pid}-{int(time.time())}")
        try:
            shutil.move(src, dest)
        except Exception as e:
            return self._send_json(500, {"ok": False, "error": str(e)})
        return self._send_json(200, {"ok": True, "project": pid, "trash": os.path.relpath(dest, ROOT).replace(os.sep, "/")})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

def lan_ip():
    """Best-effort LAN address to print (no packets actually sent)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80)); ip = s.getsockname()[0]; s.close()
        return ip
    except Exception:
        return "your-lan-ip"

class DualStackServer(ThreadingHTTPServer):
    """ThreadingHTTPServer configured for IPv4/IPv6 compatibility."""
    def __init__(self, server_address, RequestHandlerClass, bind_and_activate=True):
        host, port = server_address
        if ":" in host:
            self.address_family = socket.AF_INET6
        else:
            self.address_family = socket.AF_INET
        super().__init__(server_address, RequestHandlerClass, bind_and_activate)


    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            try:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except (AttributeError, OSError):
                pass
        super().server_bind()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    # "" or 0.0.0.0 = all interfaces so LAN devices & IPv4/IPv6 localhost can reach it.
    host = os.environ.get("HOST", "")
    os.makedirs(PROJECTS_DIR, exist_ok=True)
    httpd = DualStackServer((host, port), Handler)
    print(f"Build91 plot-map server listening on {host or 'all interfaces'}:{port}  (projects dir: {PROJECTS_DIR})")
    print(f"  local:  http://localhost:{port}/  or  http://127.0.0.1:{port}/")
    print(f"  LAN:    http://{lan_ip()}:{port}/   (admin: add ?admin=1&project=<id>)")
    print("  WARNING: the save/rename/delete API is open to your LAN with no auth. Use only on a trusted network.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()

if __name__ == "__main__":
    main()
