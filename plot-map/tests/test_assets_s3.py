"""Offline checks for assets_s3's sync rules (ADMIN-DATA-SYNC.md section 13).

Runs assets_s3 against a fake in-memory S3 and a temporary projects folder: no network, no AWS,
nothing in the real projects/ folder is touched. Run from plot-map/:  python tests/test_assets_s3.py
Add a case here for every new sync rule."""
import io, json, os, shutil, sys, tempfile, threading, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import assets_s3 as A


class NoSuchKey(Exception):
    def __init__(self):
        self.response = {"Error": {"Code": "NoSuchKey"}}


class FakeS3:
    def __init__(self):
        self.objects, self.lock, self.slow = {}, threading.Lock(), 0.0
        self.uploads = []

    def get_object(self, Bucket, Key):
        with self.lock:
            if Key not in self.objects:
                raise NoSuchKey()
            return {"Body": io.BytesIO(self.objects[Key])}

    def put_object(self, Bucket, Key, Body, **kw):
        with self.lock:
            self.objects[Key] = Body

    def upload_file(self, path, Bucket, Key, Callback=None, ExtraArgs=None):
        data = open(path, "rb").read()
        time.sleep(self.slow)
        with self.lock:
            self.objects[Key] = data
            self.uploads.append(Key.rsplit("/", 1)[-1])
        if Callback:
            Callback(len(data))

    def download_file(self, Bucket, Key, dest, Callback=None):
        with self.lock:
            data = self.objects[Key]
        open(dest, "wb").write(data)
        if Callback:
            Callback(len(data))


s3 = FakeS3()
A._connect = lambda: ({}, "bucket", s3)
A.load_config = lambda: {}
tmp = tempfile.mkdtemp()
A.PROJECTS_DIR = tmp
pid = "demo"
P = os.path.join(tmp, pid)
os.makedirs(os.path.join(P, ".backup-x"))
os.makedirs(os.path.join(P, "_originals"))
w = lambda rel, data: open(os.path.join(P, rel), "wb").write(data)
w("alignment.json", b'{"a":1}\n')
w("pano.web.jpg", b"J" * 5000)
w(".pwa-icon-192.png", b"icon")
w(".backup-x/old.json", b"{}")
w("_originals/master.png", b"M" * 100)
fails = []
check = lambda cond, msg: (print(("ok   " if cond else "FAIL ") + msg), cond or fails.append(msg))
prefix = A.project_prefix(pid)


def wait_jobs():
    for _ in range(200):
        if not A.busy(pid):
            return
        time.sleep(0.02)


# 1. First save uploads only syncable files; dot-files and _originals never go up.
A.enqueue_push(pid); wait_jobs()
check(sorted(s3.uploads) == ["alignment.json", "pano.web.jpg"], f"first push uploads only syncable files: {sorted(s3.uploads)}")
man = json.loads(s3.objects[prefix + A.MANIFEST_NAME])
check(set(man["files"]) == {"alignment.json", "pano.web.jpg"}, "manifest lists exactly those")
check(os.path.isfile(os.path.join(P, A.SYNC_RECORD)), "local sync record written")

# 2. Plan when in step: nothing to do.
p = A.plan(pid)
check(not p["download"] and not p["conflicts"] and p["inSync"] == 2, f"in step -> nothing to do ({p['inSync']} in sync)")

# 3. CRLF-only change (git autocrlf) is not an edit.
w("alignment.json", b'{"a":1}\r\n')
p = A.plan(pid)
check(not p["conflicts"] and not p["download"], "CRLF-only difference is not a conflict")

# 4. Local edit -> conflict kind 'local'; choosing local keeps it; next Save uploads it.
w("alignment.json", b'{"a":2}\n')
p = A.plan(pid)
check([c["kind"] for c in p["conflicts"]] == ["local"], f"local edit -> conflict 'local': {p['conflicts']}")
A.start_pull(pid, "local"); wait_jobs()
check(open(os.path.join(P, "alignment.json"), "rb").read() == b'{"a":2}\n', "use=local keeps this computer's file")
s3.uploads.clear(); A.enqueue_push(pid); wait_jobs()
check(s3.uploads == ["alignment.json"], f"next Save uploads only the edited file: {s3.uploads}")

# 5. Another machine updates S3; local untouched -> plain download ('updated'), no conflict.
s3.objects[prefix + "pano.web.jpg"] = b"K" * 6000
A._merge_manifest(s3, "b", prefix, pid, {"pano.web.jpg": {"md5": A._md5_bytes("pano.web.jpg", b"K" * 6000), "size": 6000}})
p = A.plan(pid)
check([d["reason"] for d in p["download"]] == ["updated"] and not p["conflicts"], f"S3 newer, local untouched -> download: {p['download']}")
# ...and a Save meanwhile must NOT push the stale local pano over it.
s3.uploads.clear(); A.enqueue_push(pid); wait_jobs()
job = A.jobs()[0]
check(s3.uploads == [] and job["keptNewer"] == 1, f"Save leaves the newer S3 copy alone (keptNewer={job['keptNewer']})")
A.start_pull(pid, "s3"); wait_jobs()
check(open(os.path.join(P, "pano.web.jpg"), "rb").read() == b"K" * 6000, "pull brings the newer copy down")

# 6. Both changed -> 'both'; use=s3 overwrites local.
w("alignment.json", b'{"a":3}\n')
s3.objects[prefix + "alignment.json"] = b'{"a":9}\n'
A._merge_manifest(s3, "b", prefix, pid, {"alignment.json": {"md5": A._md5_bytes("alignment.json", b'{"a":9}\n'), "size": 8}})
p = A.plan(pid)
check([c["kind"] for c in p["conflicts"]] == ["both"], f"both changed -> 'both': {p['conflicts']}")
A.start_pull(pid, "s3"); wait_jobs()
check(open(os.path.join(P, "alignment.json"), "rb").read() == b'{"a":9}\n', "use=s3 replaces this computer's file")

# 7. Missing locally -> 'missing' download; a never-synced differing file -> 'unknown'.
os.remove(os.path.join(P, "pano.web.jpg"))
os.remove(os.path.join(P, A.SYNC_RECORD))
w("alignment.json", b'{"a":7}\n')
p = A.plan(pid)
check([d["reason"] for d in p["download"]] == ["missing"], "deleted file -> 'missing'")
check([c["kind"] for c in p["conflicts"]] == ["unknown"], "no sync record + differs -> 'unknown'")

# 8. Two saves in a row: the second waits for the first, and picks up what changed since.
w("alignment.json", b'{"a":9}\n'); A.plan(pid)            # back in step, record rebuilt
A.start_pull(pid, "s3"); wait_jobs()
s3.slow = 0.4; s3.uploads.clear()
w("video.mp4", b"V" * 9000)
j1 = A.enqueue_push(pid)
time.sleep(0.1)
w("landmarks.json", b'{"l":1}\n')
j2 = A.enqueue_push(pid)
time.sleep(0.1)
states = {j["id"]: j["state"] for j in A.jobs()}
check(states[j1["id"]] == "uploading" and states[j2["id"]] == "queued", f"second Save queued behind the first: {states}")
wait_jobs(); s3.slow = 0
check("video.mp4" in s3.uploads and "landmarks.json" in s3.uploads, f"both saves' files reached S3: {s3.uploads}")
man = json.loads(s3.objects[prefix + A.MANIFEST_NAME])
check({"video.mp4", "landmarks.json", "alignment.json", "pano.web.jpg"} <= set(man["files"]), "manifest kept every entry")

# 9. Nothing is ever dropped from the manifest by a machine that lacks a file.
os.remove(os.path.join(P, "video.mp4"))
w("alignment.json", b'{"a":10}\n'); A.enqueue_push(pid); wait_jobs()
man = json.loads(s3.objects[prefix + A.MANIFEST_NAME])
check("video.mp4" in man["files"], "a local deletion never removes the file from the S3 manifest")

shutil.rmtree(tmp)
print("\nALL PASSED" if not fails else f"\n{len(fails)} FAILED")
