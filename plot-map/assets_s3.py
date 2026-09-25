#!/usr/bin/env python3
"""Mirror each project's SOURCE files to S3, under one folder per project.

    s3://<bucket>/ZEROX-PROJECTS-FINAL/<project>/…     every file in projects/<project>/

Why this exists, and how it differs from publish_s3.py: that one builds a project's CLIENT SITE
(app shell + data, version-stamped, index.html rewritten) and drops it at the bucket root, which is
what a share link points at. This one copies the project's raw working files — panoramas, plans,
renders, videos, brochures, the JSON the admin edits — so the assets live somewhere other than one
laptop. The admin keeps a local working copy; this keeps S3 in step with it.

Upload is incremental against a manifest stored beside the files (MANIFEST_NAME): each file's md5
and size, so a save that changed one caption re-sends one small JSON rather than a 200 MB video.
Nothing is ever deleted from S3 here — see sync_project's `delete` note.

Objects are readable through the bucket's CloudFront domain (the owner chose that over a private
bucket, 2026-09-25): anyone with a URL can fetch a project's originals.

Settings come from publish.config.json, the same file ☁ Publish uses, so there is one place to
configure a bucket and one AWS login to maintain.
"""

import hashlib
import json
import os
import sys
import threading

import deploy_s3
import publish_s3
from publish_s3 import PublishError, PROJECT_ID_RE, aws_message, load_config

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECTS_DIR = os.path.join(ROOT, "projects")

# The folder every project sits under, as asked for.
BASE_PREFIX = "ZEROX-PROJECTS-FINAL/"
MANIFEST_NAME = ".b91-assets.json"

# Never mirrored: the pre-compression masters kept beside a project (hundreds of MB that exist only
# so a compression can be undone locally), and the OS droppings that turn up in any media folder.
SKIP_DIRS = {".originals", "_originals", "__pycache__"}
SKIP_NAMES = {"thumbs.db", "desktop.ini", ".ds_store"}

_jobs = {}
_jobs_lock = threading.Lock()


def project_prefix(pid):
    """This project's folder in the bucket. One validated id only, so a bad id can't escape the
    ZEROX-PROJECTS-FINAL/ folder and touch the published sites at the bucket root."""
    if not PROJECT_ID_RE.match(pid or ""):
        raise PublishError("Invalid project id.")
    return BASE_PREFIX + pid + "/"


def _local_files(pid):
    """Every mirrorable file in projects/<pid>/, as {relative path: absolute path}."""
    base = os.path.join(PROJECTS_DIR, pid)
    if not os.path.isdir(base):
        raise PublishError(f"No such project folder: projects/{pid}")
    out = {}
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d.lower() not in SKIP_DIRS]
        for fn in files:
            if fn.lower() in SKIP_NAMES:
                continue
            path = os.path.join(root, fn)
            rel = os.path.relpath(path, base).replace(os.sep, "/")
            out[rel] = path
    return out


def _md5(path, chunk=1024 * 1024):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def _load_manifest(s3, bucket, prefix):
    """What S3 already holds, by this module's own reckoning. Missing or unreadable means "assume
    nothing is there" — the worst case is one extra full upload, never a silent gap."""
    try:
        body = s3.get_object(Bucket=bucket, Key=prefix + MANIFEST_NAME)["Body"].read()
        data = json.loads(body.decode("utf-8"))
        return data.get("files", {}) if isinstance(data, dict) else {}
    except Exception:
        return {}


def _job(pid):
    with _jobs_lock:
        return dict(_jobs.get(pid) or {})


def _set_job(pid, **kw):
    with _jobs_lock:
        job = _jobs.setdefault(pid, {})
        job.update(kw)


def status(pid):
    """What the admin UI polls: the last/current mirror for this project."""
    job = _job(pid)
    return {"ok": True, "prefix": BASE_PREFIX + (pid or "") + "/", "job": job or None}


def sync_project(pid, progress=None, delete=False):
    """Upload everything in projects/<pid>/ that S3 does not already have, and refresh the manifest.

    `delete` is off by default and deliberately so: this mirror is a safety net for assets, and a
    local folder that is missing a file (a half-synced machine, a project someone copied in part)
    must never be able to wipe the copy in S3. Removing something from S3 stays a manual act.
    """
    cfg = load_config()
    bucket = cfg["bucket"]
    prefix = project_prefix(pid)
    s3, _cf = publish_s3._clients(cfg)

    files = _local_files(pid)
    have = _load_manifest(s3, bucket, prefix)

    todo, unchanged, manifest = [], 0, {}
    for rel, path in sorted(files.items()):
        size = os.path.getsize(path)
        prev = have.get(rel)
        # md5 only when size matches what we recorded — hashing a 200 MB video to learn it grew is
        # wasted work.
        digest = None
        if prev and prev.get("size") == size:
            digest = _md5(path)
            if digest == prev.get("md5"):
                manifest[rel] = prev
                unchanged += 1
                continue
        if digest is None:
            digest = _md5(path)
        todo.append((rel, path, size, digest))

    total_bytes = sum(t[2] for t in todo)
    _set_job(pid, running=True, phase="uploading", filesTotal=len(todo), filesDone=0,
             bytesTotal=total_bytes, bytesDone=0, unchanged=unchanged, error=None, result=None)

    done_bytes = 0
    for i, (rel, path, size, digest) in enumerate(todo, 1):
        try:
            s3.upload_file(path, bucket, prefix + rel, ExtraArgs={
                "ContentType": deploy_s3.content_type_for(__import__("pathlib").Path(path)),
                "CacheControl": "public, max-age=31536000, immutable",
            })
        except Exception as e:
            _set_job(pid, running=False, phase="error", error=aws_message(e))
            raise
        manifest[rel] = {"md5": digest, "size": size}
        done_bytes += size
        _set_job(pid, filesDone=i, bytesDone=done_bytes)
        if progress:
            progress(i, len(todo), done_bytes, total_bytes)

    s3.put_object(Bucket=bucket, Key=prefix + MANIFEST_NAME, ContentType="application/json",
                  CacheControl="no-store",
                  Body=json.dumps({"project": pid, "files": manifest}, indent=1).encode("utf-8"))

    result = {"uploaded": len(todo), "unchanged": unchanged, "bytes": total_bytes,
              "prefix": prefix, "url": (cfg.get("publicBaseUrl") or "").rstrip("/") + "/" + prefix}
    _set_job(pid, running=False, phase="done", result=result)
    return result


def _safe_rel(rel):
    """A relative path that can only ever land inside the project folder. Guards the on-demand
    fetch below, which takes its path from a URL."""
    rel = (rel or "").replace("\\", "/").lstrip("/")
    if not rel or rel.startswith(".") or ".." in rel.split("/"):
        return None
    return rel


def fetch_file(pid, rel):
    """Pull ONE file down from S3 into projects/<pid>/, if it is there. Returns the local path, or
    None. This is what makes a machine without the assets work: the server asks for a file it does
    not have, gets it once, and keeps it — so the second visit is local speed.
    Never raises: a missing object, no config or no network simply means "not available", and the
    caller falls back to its normal 404."""
    rel = _safe_rel(rel)
    if not rel:
        return None
    tmp = None                      # referenced by the cleanup below even if we fail before it exists
    try:
        cfg = load_config()
        s3, _cf = publish_s3._clients(cfg)
        key = project_prefix(pid) + rel
        dest = os.path.join(PROJECTS_DIR, pid, rel.replace("/", os.sep))
        root = os.path.realpath(os.path.join(PROJECTS_DIR, pid))
        if not os.path.realpath(dest).startswith(root + os.sep) and os.path.realpath(dest) != root:
            return None
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        tmp = dest + ".part"
        s3.download_file(cfg["bucket"], key, tmp)
        os.replace(tmp, dest)
        return dest
    except Exception:
        try:
            if tmp and os.path.exists(tmp):
                os.remove(tmp)      # never leave a half-downloaded .part behind to be served
        except Exception:
            pass
        return None


def pull_project(pid, missing_only=True):
    """Bring a project's files down from S3 — everything the manifest lists that this machine does
    not already have. Used when the admin opens a project on a fresh machine, so the small JSON the
    editor needs is there before it asks, rather than arriving file-by-file."""
    cfg = load_config()
    bucket = cfg["bucket"]
    prefix = project_prefix(pid)
    s3, _cf = publish_s3._clients(cfg)
    have = _load_manifest(s3, bucket, prefix)
    if not have:
        _set_job(pid, running=False, phase="done",
                 result={"downloaded": 0, "skipped": 0, "note": "nothing in S3 for this project"})
        return {"downloaded": 0, "skipped": 0}

    base = os.path.join(PROJECTS_DIR, pid)
    todo = []
    for rel, meta in have.items():
        local = os.path.join(base, rel.replace("/", os.sep))
        if missing_only and os.path.isfile(local) and os.path.getsize(local) == meta.get("size"):
            continue
        todo.append((rel, meta.get("size") or 0))

    total = sum(t[1] for t in todo)
    _set_job(pid, running=True, phase="downloading", filesTotal=len(todo), filesDone=0,
             bytesTotal=total, bytesDone=0, unchanged=len(have) - len(todo), error=None, result=None)
    done = 0
    for i, (rel, size) in enumerate(todo, 1):
        if fetch_file(pid, rel):
            done += size
        _set_job(pid, filesDone=i, bytesDone=done)
    result = {"downloaded": len(todo), "skipped": len(have) - len(todo), "bytes": total}
    _set_job(pid, running=False, phase="done", result=result)
    return result


def pull_in_background(pid):
    if _job(pid).get("running"):
        return {"ok": True, "already": True}

    def run():
        try:
            pull_project(pid)
        except Exception as e:
            _set_job(pid, running=False, phase="error", error=aws_message(e))

    _set_job(pid, running=True, phase="starting", filesTotal=0, filesDone=0, bytesTotal=0,
             bytesDone=0, unchanged=0, error=None, result=None)
    threading.Thread(target=run, daemon=True).start()
    return {"ok": True, "started": True}


def sync_in_background(pid):
    """Fire and forget, for the Save path: an admin pressing Save must not wait on S3, and a failed
    upload must not fail the save — the local write has already succeeded by then. The outcome
    lands in status(pid) either way."""
    if _job(pid).get("running"):
        return {"ok": True, "already": True}

    def run():
        try:
            sync_project(pid)
        except Exception as e:
            _set_job(pid, running=False, phase="error", error=aws_message(e))

    _set_job(pid, running=True, phase="starting", filesTotal=0, filesDone=0, bytesTotal=0,
             bytesDone=0, unchanged=0, error=None, result=None)
    threading.Thread(target=run, daemon=True).start()
    return {"ok": True, "started": True}


def _cli():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        print("usage: python assets_s3.py --all | <project> [<project> …]")
        return 0
    if args[0] == "--all":
        names = sorted(d for d in os.listdir(PROJECTS_DIR)
                       if os.path.isdir(os.path.join(PROJECTS_DIR, d)) and PROJECT_ID_RE.match(d))
    else:
        names = args
    total_up = total_bytes = 0
    for pid in names:
        try:
            def show(i, n, done, tot):
                pct = (done / tot * 100) if tot else 100
                print(f"\r  {pid}: {i}/{n} files, {done/1e6:.0f}/{tot/1e6:.0f} MB ({pct:.0f}%)",
                      end="", flush=True)
            res = sync_project(pid, progress=show)
            print(f"\r  {pid}: uploaded {res['uploaded']} file(s), {res['bytes']/1e6:.0f} MB; "
                  f"{res['unchanged']} already there" + " " * 20)
            total_up += res["uploaded"]
            total_bytes += res["bytes"]
        except Exception as e:
            print(f"\r  {pid}: FAILED — {aws_message(e)}" + " " * 20)
    print(f"\ndone: {total_up} file(s), {total_bytes/1e6:.0f} MB uploaded to {BASE_PREFIX}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
