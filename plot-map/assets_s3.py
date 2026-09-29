#!/usr/bin/env python3
"""Keep each project's WORKING FILES in S3, under one folder per project.

Design, rules and edge cases: ADMIN-DATA-SYNC.md — keep it in step with this file.

    s3://<bucket>/ZEROX-PROJECTS-FINAL/<project>/…     every file in projects/<project>/

Why this exists, and how it differs from publish_s3.py: that one builds a project's CLIENT SITE
(app shell + data, version-stamped, index.html rewritten) and drops it at the bucket root, which is
what a share link points at. This one holds the project's raw working files — panoramas, plans,
renders, videos, brochures, the JSON the admin edits — so a project is not tied to one laptop.

The model (agreed 2026-09-26):
- S3 is where the admin's work lives. Save writes the files locally and then UPLOADS them — every
  Save queues an upload job (push_*), jobs for one project run one after another, and each job
  sends only what is still different when it starts. Nothing is uploaded except by Save.
- projects/<project>/ is the local working copy. Opening a project in the admin first compares it
  with S3 (plan): anything S3 has that this machine lacks, or has an older copy of, is downloaded
  (pull_*) — after the admin agrees, while the admin waits. When nothing changed there is nothing
  to download, so a project already in step opens straight away.
- A file this machine has CHANGED that is also different in S3 is a conflict: the admin chooses
  which copy wins. "S3" overwrites the local file; "local" keeps it, and the next Save uploads it.

Three records make that decision possible without guessing:
- the S3 manifest (MANIFEST_NAME, in the bucket): md5 + size of every file there. Merged, never
  rewritten from one machine's view — an entry is only ever added or updated, so one machine that
  lacks a file cannot make it disappear for the others.
- the local sync record (SYNC_RECORD, beside the files): for each file, the content this machine
  and S3 last agreed on, plus the local size/mtime at that moment (so unchanged files are not
  re-hashed after a restart). Local == record means "not edited here since the last sync".
- the files themselves.

Hashes are md5 of the bytes, except text files (TEXT_EXTS), whose CRLF line endings are folded to
LF first: git on Windows (core.autocrlf) rewrites line endings on checkout, and that alone must not
look like an edit.

Never synced: anything whose path has a part starting with "." (the sync record above, generated
.pwa-icon-*.png, .backup-* folders the renumber tool leaves), the
pre-compression masters in _originals/.originals, half-written *.part files and OS droppings. These
are machine-local by nature, and a file that can never be downloaded must never be uploaded — it
would read as "missing here" on every other machine forever.

Nothing is ever deleted from S3 here; deletion stays a manual act.

Settings come from publish.config.json, the same file ☁ Publish uses.
"""

import collections
import hashlib
import itertools
import json
import os
import sys
import threading
import time

import deploy_s3
import publish_s3
from publish_s3 import PublishError, PROJECT_ID_RE, aws_message, load_config

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECTS_DIR = os.path.join(ROOT, "projects")

BASE_PREFIX = "ZEROX-PROJECTS-FINAL/"
MANIFEST_NAME = ".b91-assets.json"      # in S3, beside the project's files
SYNC_RECORD = ".b91-sync.json"          # local, beside the project's files
HASH_KIND = "md5-lf"                    # md5; text files hashed with CRLF folded to LF

TEXT_EXTS = {".json", ".svg", ".csv", ".txt", ".md", ".html", ".htm", ".css", ".js", ".xml",
             ".webmanifest"}
SKIP_DIRS = {"_originals", "__pycache__"}          # plus every name starting with "."
SKIP_NAMES = {"thumbs.db", "desktop.ini"}
SKIP_SUFFIXES = (".part", ".tmp")

BIG_FILE = 8 * 1024 * 1024              # record progress to S3 after each file at least this big
JOB_HISTORY = 40                        # upload jobs kept for the widget


# ─── Paths ────────────────────────────────────────────────────────────────────────────────────

def project_prefix(pid):
    """This project's folder in the bucket. One validated id only, so a bad id can't escape the
    ZEROX-PROJECTS-FINAL/ folder and touch the published sites at the bucket root."""
    if not PROJECT_ID_RE.match(pid or ""):
        raise PublishError("Invalid project id.")
    return BASE_PREFIX + pid + "/"


def is_synced_path(rel):
    """Whether a project-relative path takes part in syncing at all (see the module notes)."""
    parts = (rel or "").replace("\\", "/").split("/")
    if any(not p or p.startswith(".") for p in parts):
        return False
    if any(p.lower() in SKIP_DIRS for p in parts[:-1]):
        return False
    name = parts[-1].lower()
    return name not in SKIP_NAMES and not name.endswith(SKIP_SUFFIXES)


def _local_path(pid, rel):
    """projects/<pid>/<rel>, refusing anything that would land outside the project folder."""
    root = os.path.realpath(os.path.join(PROJECTS_DIR, pid))
    dest = os.path.realpath(os.path.join(root, rel.replace("/", os.sep)))
    if not dest.startswith(root + os.sep):
        raise PublishError(f"Refusing a path outside the project: {rel}")
    return dest


def _local_files(pid):
    """Every syncable file in projects/<pid>/, as {relative path: absolute path}. A project that
    only exists in S3 so far simply has none."""
    base = os.path.join(PROJECTS_DIR, pid)
    out = {}
    if not os.path.isdir(base):
        return out
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d.lower() not in SKIP_DIRS]
        for fn in files:
            path = os.path.join(root, fn)
            rel = os.path.relpath(path, base).replace(os.sep, "/")
            if is_synced_path(rel):
                out[rel] = path
    return out


# ─── Hashing ──────────────────────────────────────────────────────────────────────────────────

def _is_text(rel):
    return os.path.splitext(rel)[1].lower() in TEXT_EXTS


def _md5_of(path):
    h = hashlib.md5()
    if _is_text(path):
        with open(path, "rb") as fh:
            h.update(fh.read().replace(b"\r\n", b"\n"))
    else:
        with open(path, "rb") as fh:
            for block in iter(lambda: fh.read(1 << 20), b""):
                h.update(block)
    return h.hexdigest()


def _md5_bytes(rel, data):
    return hashlib.md5(data.replace(b"\r\n", b"\n") if _is_text(rel) else data).hexdigest()


_hash_cache = {}
_hash_lock = threading.Lock()


def _stat_md5(path, rec=None):
    """(size, mtime_ns, md5) of a local file. Hashes only when the file changed since it was last
    hashed — in this process, or (via the sync record `rec`) at the last sync."""
    st = os.stat(path)
    key = os.path.normcase(path)
    with _hash_lock:
        hit = _hash_cache.get(key)
    if hit and hit[0] == st.st_size and hit[1] == st.st_mtime_ns:
        return hit
    if rec and rec.get("md5") and rec.get("size") == st.st_size and rec.get("mtime") == st.st_mtime_ns:
        md5 = rec["md5"]
    else:
        md5 = _md5_of(path)
    out = (st.st_size, st.st_mtime_ns, md5)
    with _hash_lock:
        _hash_cache[key] = out
    return out


# ─── The local sync record ────────────────────────────────────────────────────────────────────

def _load_record(pid):
    """{rel: {md5, size, mtime}} as of the last time this machine and S3 agreed on each file. A
    record written for another project id (the folder was renamed or copied) or another hash kind
    is ignored: it describes some other S3 folder."""
    try:
        with open(os.path.join(PROJECTS_DIR, pid, SYNC_RECORD), "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if data.get("project") != pid or data.get("prefix") != project_prefix(pid) or data.get("hash") != HASH_KIND:
            return {}
        files = data.get("files")
        return files if isinstance(files, dict) else {}
    except Exception:
        return {}


def _save_record(pid, files):
    base = os.path.join(PROJECTS_DIR, pid)
    os.makedirs(base, exist_ok=True)
    path = os.path.join(base, SYNC_RECORD)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump({"project": pid, "prefix": project_prefix(pid), "hash": HASH_KIND,
                   "savedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "files": files},
                  fh, indent=1, sort_keys=True)
    os.replace(tmp, path)


def _agreed(size, mtime, md5):
    return {"md5": md5, "size": size, "mtime": mtime}


# ─── S3 ───────────────────────────────────────────────────────────────────────────────────────

def _clients(cfg):
    """An S3 client that gives up in seconds, not minutes, when there is no network: the admin is
    watching a loading screen while plan() waits on it."""
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        raise PublishError("Cloud sync needs the boto3 package on this server — run: pip install boto3")
    session = boto3.Session(profile_name=(cfg.get("awsProfile") or None), region_name=cfg["region"])
    return session.client("s3", config=Config(connect_timeout=4, read_timeout=60,
                                               retries={"max_attempts": 2, "mode": "standard"}))


def _connect():
    cfg = load_config()
    return cfg, cfg["bucket"], _clients(cfg)


def _load_manifest(s3, bucket, prefix):
    """(files, kind): what S3 holds, by the manifest. A project never uploaded has none — that is
    an empty folder, not an error. Anything else going wrong IS an error: treating an unreadable
    manifest as empty would make every local file look new and every S3 file look absent."""
    try:
        body = s3.get_object(Bucket=bucket, Key=prefix + MANIFEST_NAME)["Body"].read()
    except Exception as e:
        code = ((getattr(e, "response", {}) or {}).get("Error", {}) or {}).get("Code", "")
        if code in ("NoSuchKey", "404", "NotFound"):
            return {}, HASH_KIND
        raise
    data = json.loads(body.decode("utf-8"))
    files = data.get("files") if isinstance(data, dict) else None
    return (files if isinstance(files, dict) else {}), (data.get("hash") or "md5")


def _merge_manifest(s3, bucket, prefix, pid, updates):
    """Apply {rel: {md5, size}} to the manifest in S3. Re-reads it first, so entries another
    machine wrote in the meantime are kept; nothing is ever dropped."""
    files, _kind = _load_manifest(s3, bucket, prefix)
    files.update(updates)
    s3.put_object(Bucket=bucket, Key=prefix + MANIFEST_NAME, ContentType="application/json",
                  CacheControl="no-store",
                  Body=json.dumps({"project": pid, "hash": HASH_KIND,
                                   "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                   "files": files}, indent=1, sort_keys=True).encode("utf-8"))
    return files


def _s3_text_md5(s3, bucket, key, rel):
    """Hash of a small S3 text file as HASH_KIND reckons it — used once per file for manifests
    written before line endings were folded (their md5 is of the raw bytes)."""
    return _md5_bytes(rel, s3.get_object(Bucket=bucket, Key=key)["Body"].read())


# ─── Per-project coordination ─────────────────────────────────────────────────────────────────
# One transfer at a time per project: a download and an upload of the same project must never
# interleave (each rewrites the sync record from what it saw). Different projects run in parallel.

_locks_guard = threading.Lock()
_transfer_locks = collections.defaultdict(threading.Lock)
_record_locks = collections.defaultdict(threading.Lock)


def _transfer_lock(pid):
    with _locks_guard:
        return _transfer_locks[pid]


def _record_lock(pid):
    with _locks_guard:
        return _record_locks[pid]


def busy(pid):
    """Is an upload for this project running or waiting, or a download running?"""
    with _jobs_lock:
        if any(j["project"] == pid and j["state"] in ("queued", "uploading") for j in _push_jobs):
            return True
        pj = _pull_jobs.get(pid)
        return bool(pj and pj.get("state") == "running")


def any_busy():
    """Is ANY project uploading, waiting to upload, or downloading? (server.py's /api/idle: the
    sleep/wake host must not stop mid-transfer.)"""
    with _jobs_lock:
        if any(j["state"] in ("queued", "uploading") for j in _push_jobs):
            return True
        return any(pj.get("state") == "running" for pj in _pull_jobs.values())


# ─── Plan: what opening this project needs ────────────────────────────────────────────────────

def plan(pid, _inside=False):
    """Compare projects/<pid>/ with S3. Nothing is transferred; files already in step are noted in
    the sync record so the next comparison doesn't have to hash them.

    Returns {ok, download:[{path,size,reason}], conflicts:[{path,localSize,s3Size,kind}],
    localOnly, inSync, bytes, busy}. reason: "missing" (not on this machine) | "updated" (changed
    in S3, untouched here). conflict kind: "local" (edited here, S3 unchanged since the last sync)
    | "both" (edited here AND changed in S3) | "unknown" (never synced on this machine, differs).
    While an upload or download of the project is under way the answer would be stale by the time
    it arrived, so it is just {busy: true} — except for the transfer itself (`_inside`)."""
    project_prefix(pid)
    if not _inside and busy(pid):
        return {"ok": True, "busy": True}
    cfg, bucket, s3 = _connect()
    prefix = project_prefix(pid)
    remote, kind = _load_manifest(s3, bucket, prefix)
    local = _local_files(pid)
    with _record_lock(pid):
        record = _load_record(pid)
    record_changed, manifest_fixes = False, {}
    download, conflicts, in_sync, local_only = [], [], 0, 0

    for rel in sorted(set(remote) | set(local)):
        m = remote.get(rel)
        if m is not None and not is_synced_path(rel):
            continue                                  # an old manifest may list a dot-file
        if rel not in local:
            download.append({"path": rel, "size": int(m.get("size") or 0), "reason": "missing"})
            continue
        size, mtime, md5 = _stat_md5(local[rel], record.get(rel))
        if m is None:
            local_only += 1
            continue
        s3_md5 = m.get("md5") or ""
        if s3_md5 != md5 and kind != HASH_KIND and _is_text(rel) and s3_md5:
            # Written before text line endings were folded: settle it by the real content.
            try:
                folded = _s3_text_md5(s3, bucket, prefix + rel, rel)
                if folded != s3_md5:
                    manifest_fixes[rel] = {"md5": folded, "size": m.get("size")}
                    s3_md5 = folded
            except Exception:
                pass
        if s3_md5 == md5:
            in_sync += 1
            if record.get(rel) != _agreed(size, mtime, md5):
                record[rel] = _agreed(size, mtime, md5)
                record_changed = True
            continue
        base = record.get(rel)
        if base and base.get("md5") == md5:
            download.append({"path": rel, "size": int(m.get("size") or 0), "reason": "updated"})
        else:
            conflicts.append({"path": rel, "localSize": size, "s3Size": int(m.get("size") or 0),
                              "kind": "unknown" if not base else ("local" if base.get("md5") == s3_md5 else "both")})

    if record_changed:
        with _record_lock(pid):
            fresh = _load_record(pid)
            for rel, rec in record.items():
                fresh[rel] = rec
            _save_record(pid, fresh)
    if manifest_fixes:
        try:
            _merge_manifest(s3, bucket, prefix, pid, manifest_fixes)
        except Exception:
            pass
    return {"ok": True, "busy": False, "download": download, "conflicts": conflicts,
            "inSync": in_sync, "localOnly": local_only,
            "bytes": sum(d["size"] for d in download),
            "conflictBytes": sum(c["s3Size"] for c in conflicts)}


# ─── Pull: bring S3's copy down (admin open) ──────────────────────────────────────────────────

_jobs_lock = threading.Lock()
_pull_jobs = {}


def _set_pull(pid, **kw):
    with _jobs_lock:
        _pull_jobs.setdefault(pid, {}).update(kw)


def pull_status(pid):
    with _jobs_lock:
        return dict(_pull_jobs.get(pid) or {})


def start_pull(pid, use):
    """Download what plan() says is needed, in the background; progress at pull_status(pid).
    use="s3": conflicting files are replaced by S3's copy too. use="local": they are kept, and
    uploaded by the next Save."""
    project_prefix(pid)
    if use not in ("s3", "local"):
        raise PublishError("Choose which copy to use: s3 or local.")
    if busy(pid):
        return {"ok": False, "busy": True, "error": "This project is still uploading or downloading."}
    _set_pull(pid, state="running", use=use, filesTotal=0, filesDone=0, bytesTotal=0, bytesDone=0,
              current="", error=None, startedAt=time.time(), endedAt=None)

    def run():
        try:
            with _transfer_lock(pid):
                _pull(pid, use)
        except Exception as e:
            _set_pull(pid, state="error", error=aws_message(e), endedAt=time.time())

    threading.Thread(target=run, daemon=True).start()
    return {"ok": True, "started": True}


def _pull(pid, use):
    p = plan(pid, _inside=True)
    todo = list(p["download"])
    if use == "s3":
        todo += [{"path": c["path"], "size": c["s3Size"], "reason": "conflict"} for c in p["conflicts"]]
    # Media first, the JSON/SVG that point at it last: if the download stops half-way, the working
    # copy never holds a data file that names a picture which hasn't arrived yet.
    todo.sort(key=lambda d: (_is_text(d["path"]), d["size"]))
    total = sum(d["size"] for d in todo)
    _set_pull(pid, filesTotal=len(todo), bytesTotal=total)
    if not todo:
        _set_pull(pid, state="done", endedAt=time.time())
        return
    cfg, bucket, s3 = _connect()
    prefix = project_prefix(pid)
    remote, _kind = _load_manifest(s3, bucket, prefix)
    done_bytes, fixes = 0, {}
    for i, d in enumerate(todo, 1):
        rel = d["path"]
        dest = _local_path(pid, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        tmp = dest + ".part"
        _set_pull(pid, current=rel)
        base_bytes = done_bytes

        def progress(n, _base=[0]):
            _base[0] += n
            _set_pull(pid, bytesDone=base_bytes + _base[0])

        try:
            s3.download_file(bucket, prefix + rel, tmp, Callback=progress)
            md5 = _md5_of(tmp)
            os.replace(tmp, dest)
        except Exception:
            try:
                if os.path.exists(tmp):
                    os.remove(tmp)
            except Exception:
                pass
            raise
        st = os.stat(dest)
        with _hash_lock:
            _hash_cache[os.path.normcase(dest)] = (st.st_size, st.st_mtime_ns, md5)
        with _record_lock(pid):
            rec = _load_record(pid)
            rec[rel] = _agreed(st.st_size, st.st_mtime_ns, md5)
            _save_record(pid, rec)
        m = remote.get(rel) or {}
        if m.get("md5") != md5 or m.get("size") != st.st_size:
            fixes[rel] = {"md5": md5, "size": st.st_size}   # the manifest was behind the object
        done_bytes += d["size"]
        _set_pull(pid, filesDone=i, bytesDone=done_bytes)
    if fixes:
        try:
            _merge_manifest(s3, bucket, prefix, pid, fixes)
        except Exception:
            pass
    _set_pull(pid, state="done", current="", endedAt=time.time())


# ─── Push: upload jobs, one queue per project (every Save adds one) ───────────────────────────

_push_jobs = []                      # oldest first; each a dict the widget reads
_job_ids = itertools.count(1)
_workers = set()                     # projects with a worker thread running


def _job_view(j):
    return {k: v for k, v in j.items() if not k.startswith("_")}


def jobs():
    """Every recent upload job, newest first — what the admin's upload widget shows."""
    with _jobs_lock:
        return [_job_view(j) for j in reversed(_push_jobs)]


def _set_job(job, **kw):
    with _jobs_lock:
        job.update(kw)


def enqueue_push(pid, label=""):
    """Queue an upload of this project's changes. Returns the job at once; the work happens on
    the project's worker thread, after any upload already queued for the same project."""
    project_prefix(pid)
    load_config()                    # not configured → PublishError now, not a failed job later
    job = {"id": next(_job_ids), "project": pid, "label": label or "", "state": "queued",
           "createdAt": time.time(), "startedAt": None, "endedAt": None,
           "filesTotal": 0, "filesDone": 0, "bytesTotal": 0, "bytesDone": 0,
           "current": "", "uploaded": 0, "keptNewer": 0, "error": None}
    with _jobs_lock:
        _push_jobs.append(job)
        while len(_push_jobs) > JOB_HISTORY:
            old = next((x for x in _push_jobs if x["state"] in ("done", "error")), None)
            if not old:
                break
            _push_jobs.remove(old)
        start = pid not in _workers
        _workers.add(pid)
    if start:
        threading.Thread(target=_push_worker, args=(pid,), daemon=True).start()
    return _job_view(job)


def retry(job_id):
    with _jobs_lock:
        old = next((j for j in _push_jobs if j["id"] == job_id), None)
    if not old:
        raise PublishError("That upload is no longer listed.")
    return enqueue_push(old["project"], old.get("label") or "")


def _push_worker(pid):
    while True:
        with _jobs_lock:
            job = next((j for j in _push_jobs if j["project"] == pid and j["state"] == "queued"), None)
            if job is None:
                _workers.discard(pid)
                return
        try:
            with _transfer_lock(pid):          # stays "queued" while a download of it finishes
                _set_job(job, state="uploading", startedAt=time.time())
                _push(pid, job)
            _set_job(job, state="done", current="", endedAt=time.time())
        except Exception as e:
            _set_job(job, state="error", current="", error=aws_message(e), endedAt=time.time())


def _push(pid, job):
    """Upload local files S3 doesn't already have — but never a file this machine hasn't touched
    since the last sync while S3 holds something different: that is someone else's newer work, and
    an untouched older copy must not overwrite it."""
    if not os.path.isdir(os.path.join(PROJECTS_DIR, pid)):
        raise PublishError(f"No such project folder: projects/{pid}")
    cfg, bucket, s3 = _connect()
    prefix = project_prefix(pid)
    remote, _kind = _load_manifest(s3, bucket, prefix)
    local = _local_files(pid)
    with _record_lock(pid):
        record = _load_record(pid)
    todo, adopted, kept = [], {}, 0
    for rel, path in sorted(local.items()):
        size, mtime, md5 = _stat_md5(path, record.get(rel))
        m = remote.get(rel)
        if m and m.get("md5") == md5:
            if record.get(rel) != _agreed(size, mtime, md5):
                adopted[rel] = _agreed(size, mtime, md5)
            continue
        base = record.get(rel)
        if m and base and base.get("md5") == md5:
            kept += 1
            continue
        todo.append((rel, path, size, mtime, md5))
    if adopted:
        with _record_lock(pid):
            rec = _load_record(pid)
            rec.update(adopted)
            _save_record(pid, rec)
    total = sum(t[2] for t in todo)
    _set_job(job, filesTotal=len(todo), bytesTotal=total, keptNewer=kept)

    done_bytes, pending = 0, {}
    for i, (rel, path, size, mtime, md5) in enumerate(todo, 1):
        _set_job(job, current=rel)
        base_bytes = done_bytes

        def progress(n, _sent=[0]):
            _sent[0] += n
            _set_job(job, bytesDone=base_bytes + min(_sent[0], size))

        s3.upload_file(path, bucket, prefix + rel, Callback=progress, ExtraArgs={
            "ContentType": deploy_s3.content_type_for(__import__("pathlib").Path(path)),
            "CacheControl": "no-cache",      # a working copy: the same name is overwritten on every save
        })
        try:
            st = os.stat(path)
            unchanged = st.st_size == size and st.st_mtime_ns == mtime
        except OSError:
            unchanged = False
        if unchanged:
            pending[rel] = {"md5": md5, "size": size}
            with _record_lock(pid):
                rec = _load_record(pid)
                rec[rel] = _agreed(size, mtime, md5)
                _save_record(pid, rec)
        else:
            # Saved again while it was going up: what S3 got is unknown. Mark it so, and the upload
            # queued by that later save sends it again.
            pending[rel] = {"md5": "", "size": -1}
        done_bytes += size
        _set_job(job, filesDone=i, bytesDone=done_bytes, uploaded=i)
        if size >= BIG_FILE:
            _merge_manifest(s3, bucket, prefix, pid, pending)   # a long job survives an interruption
            pending = {}
    if pending:
        _merge_manifest(s3, bucket, prefix, pid, pending)


# ─── Projects that exist in S3 ────────────────────────────────────────────────────────────────

_cloud_cache = {"at": 0.0, "ids": []}


def cloud_projects(max_age=60):
    """Project ids with a folder in ZEROX-PROJECTS-FINAL/ — so the admin's switcher can offer a
    project this machine has never had. Cached briefly; any failure is simply "none"."""
    now = time.time()
    if now - _cloud_cache["at"] < max_age:
        return list(_cloud_cache["ids"])
    ids = []
    try:
        cfg, bucket, s3 = _connect()
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=BASE_PREFIX, Delimiter="/"):
            for cp in page.get("CommonPrefixes") or []:
                pid = cp["Prefix"][len(BASE_PREFIX):].rstrip("/")
                if PROJECT_ID_RE.match(pid):
                    ids.append(pid)
    except Exception:
        ids = list(_cloud_cache["ids"])
    _cloud_cache.update(at=now, ids=ids)
    return list(ids)


# ─── CLI: upload whole projects by hand (first-time migration) ────────────────────────────────

def _cli():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        print("usage: python assets_s3.py --all | <project> [<project> …]   (uploads, like Save)")
        return 0
    if args[0] == "--all":
        names = sorted(d for d in os.listdir(PROJECTS_DIR)
                       if os.path.isdir(os.path.join(PROJECTS_DIR, d)) and PROJECT_ID_RE.match(d))
    else:
        names = args
    for pid in names:
        job = {"project": pid}
        try:
            with _transfer_lock(pid):
                _push(pid, job)
            print(f"  {pid}: uploaded {job.get('uploaded', 0)} file(s), "
                  f"{job.get('bytesTotal', 0) / 1e6:.0f} MB; {job.get('keptNewer', 0)} newer in S3 left alone")
        except Exception as e:
            print(f"  {pid}: FAILED — {aws_message(e)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
