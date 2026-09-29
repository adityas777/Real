"""Build91 admin — the wake-up link (README.md, step 7).

An AWS Lambda behind a Function URL. Opening

    https://<function-url>/?key=<WAKE_KEY>[&project=<id>]

starts the admin's EC2 instance if it is stopped, shows a "waking up" page that refreshes
itself every few seconds, and sends the browser on to the admin as soon as it answers.
The server stops itself again when idle (idle-shutdown.sh), so this link is the way in.

Environment variables (Lambda → Configuration → Environment variables):
  INSTANCE_ID     the admin instance, e.g. i-0123456789abcdef0              (required)
  ADMIN_ORIGIN    https://admin.build91.in                                   (required)
  WAKE_KEY        a long random string; the link only works with it          (required)
  HOSTED_ZONE_ID  only for README option B (no Elastic IP): the Route 53 zone
  RECORD_NAME     only for option B: the DNS name to point at the instance, e.g. admin.build91.in
Python 3.12 runtime; boto3 is built in, nothing to package.
"""
import hmac
import html
import os
import urllib.parse
import urllib.request

import boto3

ec2 = boto3.client("ec2")
INSTANCE_ID = os.environ["INSTANCE_ID"]
ADMIN_ORIGIN = os.environ["ADMIN_ORIGIN"].rstrip("/")
WAKE_KEY = os.environ["WAKE_KEY"]
HOSTED_ZONE_ID = os.environ.get("HOSTED_ZONE_ID", "").strip()
RECORD_NAME = os.environ.get("RECORD_NAME", "").strip().rstrip(".")


def page(title, message, refresh=True, status=200):
    meta = '<meta http-equiv="refresh" content="5">' if refresh else ""
    spinner = '<div class="spin"></div>' if refresh else ""
    body = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">{meta}
<title>{html.escape(title)}</title>
<style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1218;color:#e8eaee;
font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}}
.box{{text-align:center;padding:32px 28px;max-width:420px}}
h1{{font-size:19px;margin:0 0 8px}} p{{margin:0;color:#aab0bb}}
.spin{{width:34px;height:34px;margin:0 auto 18px;border-radius:50%;border:3px solid #2a2f3a;
border-top-color:#d4af37;animation:s .8s linear infinite}}
@keyframes s{{to{{transform:rotate(360deg)}}}}
</style></head><body><div class="box">{spinner}<h1>{html.escape(title)}</h1><p>{message}</p></div></body></html>"""
    return {"statusCode": status, "headers": {"Content-Type": "text/html; charset=utf-8",
                                              "Cache-Control": "no-store"}, "body": body}


def admin_url(qs):
    project = (qs.get("project") or "").strip()
    q = {"admin": "1"}
    if project:
        q["project"] = project
    return f"{ADMIN_ORIGIN}/?{urllib.parse.urlencode(q)}"


def server_answers():
    try:
        with urllib.request.urlopen(f"{ADMIN_ORIGIN}/api/health", timeout=4) as r:
            return r.status == 200
    except Exception:
        return False


def point_dns(ip):
    """Option B only: aim RECORD_NAME at the instance's new public IP (it changes on every start)."""
    if not (HOSTED_ZONE_ID and RECORD_NAME and ip):
        return
    boto3.client("route53").change_resource_record_sets(
        HostedZoneId=HOSTED_ZONE_ID,
        ChangeBatch={"Changes": [{"Action": "UPSERT", "ResourceRecordSet": {
            "Name": RECORD_NAME, "Type": "A", "TTL": 60, "ResourceRecords": [{"Value": ip}]}}]})


def lambda_handler(event, context):
    qs = event.get("queryStringParameters") or {}
    if not hmac.compare_digest(str(qs.get("key", "")), WAKE_KEY):
        return page("Link not valid", "This wake-up link is missing its key. Use the full link you were given.",
                    refresh=False, status=403)

    inst = ec2.describe_instances(InstanceIds=[INSTANCE_ID])["Reservations"][0]["Instances"][0]
    state = inst["State"]["Name"]

    if state == "stopped":
        ec2.start_instances(InstanceIds=[INSTANCE_ID])
        return page("Waking up the admin…", "Starting the server. This takes about 1–2 minutes; "
                    "this page will open the admin by itself.")
    if state == "stopping":
        return page("One moment…", "The server was just going to sleep. It will start again as soon as "
                    "it has stopped — keep this page open.")
    if state == "pending":
        return page("Waking up the admin…", "The server is starting. Keep this page open.")
    if state == "running":
        point_dns(inst.get("PublicIpAddress"))
        if server_answers():
            return {"statusCode": 302, "headers": {"Location": admin_url(qs), "Cache-Control": "no-store"}, "body": ""}
        return page("Almost ready…", "The server is up and the admin is starting. Keep this page open.")
    return page("Can't start the admin", f"The server is in the state “{html.escape(state)}”. "
                "Ask the person who set it up to check it in the AWS console.", refresh=False, status=500)
