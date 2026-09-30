# Hosting the Build91 admin on AWS (sleep / wake)

This guide puts the admin panel on its own AWS server, reachable from anywhere at an address
like `https://admin.build91.in`. The server **sleeps when nobody is using it** and is woken up
by a link, so you pay for only the few hours it actually runs.

Everything needed is in this folder. Plan about **45–60 minutes** the first time.

> **Decision (2026-09-30):**
> - **Now:** the admin runs on an **office computer** for a one-month trial (`../office/README.md`).
> - **Later:** if usage grows, it moves here, using **Option A (Elastic IP)** in step 3. Follow Option A and skip everything marked "option B".
> - **Expected cost:** about **$7.20/month + 18% GST ≈ $8.50** (~₹720) on t3.small with a 20 GB disk. The office trial's `usage_report.py` shows the hours it would really run.

---

## How it works

```
 Admin user
    │  1. opens the WAKE-UP LINK (bookmark it)
    ▼
 Lambda "plotmap-wake"  ──── starts the server if it's asleep, shows "Waking up…"
    │  2. about 1–2 minutes later, it forwards the browser to the admin
    ▼
 https://admin.build91.in  ── Caddy (HTTPS + username/password)
    │
    ▼
 server.py (the admin app) ── saves projects on its disk, uploads to S3 on 💾 Save,
    │                          publishes to re.build91.in (same as on the office computer)
    ▼
 After 60 minutes with no use (and no upload/publish running) the server stops itself.
```

- **Client/visitor sites are not affected.** They stay on S3 + CloudFront (`re.build91.in`);
  this server is only for the admin.
- **Project data stays in S3** exactly as today (`re.build91.in/ZEROX-PROJECTS-FINAL/<id>/`).
  The server's disk is just its working copy, like the office computer's `projects/` folder.

### Monthly cost (Mumbai region, used 3–4 times a week)

| Item | Cost |
|---|---|
| EC2 `t3.small` while running (~20 h/month × ~$0.0224/h) | ~$0.45 |
| 20 GB disk (charged even while stopped) | ~$1.80 |
| Public address — **option A** Elastic IP (charged all month) | ~$3.65 |
| Public address — **option B** Route 53 zone (instead of A) | ~$0.50 |
| Lambda wake-up link | $0 (free tier) |
| **Total** | **~$6 with option A, ~$3 with option B** |

---

## Before you start

You need:
- [ ] The AWS console, with rights to create EC2, IAM roles, Lambda (and Route 53 for option B).
- [ ] Access to the **DNS settings of `build91.in`** (to add `admin.build91.in`).
- [ ] Read access to the GitHub repository `Emagicor/ZeroxRealEstate`.
- [ ] Your AWS **account ID** (top-right menu in the AWS console, 12 digits).

Use region **Asia Pacific (Mumbai) `ap-south-1`** for everything below.

---

## Step 1 — Permissions for the server (IAM role)

The server reaches S3 through an IAM role, so no AWS keys are ever stored on it.

1. **IAM → Policies → Create policy → JSON.** Paste `iam/ec2-role-policy.json` from this folder.
   Replace `ACCOUNT_ID` with your account ID. Check that `re.build91.in` and `ESB5IEEO3UHEP`
   match your bucket and CloudFront distribution (they're the same values as in
   `publish.config.json`). Name it **`plotmap-admin-s3`**.
2. **IAM → Roles → Create role.** Trusted entity: **AWS service → EC2**. Attach
   `plotmap-admin-s3`. Name it **`plotmap-admin-role`**.

## Step 2 — Launch the server (EC2)

**EC2 → Instances → Launch instances:**

| Setting | Value |
|---|---|
| Name | `plotmap-admin` |
| Image | **Ubuntu Server 24.04 LTS** (64-bit x86) |
| Instance type | **t3.small** (2 GB memory; don't go smaller, large panoramas need it) |
| Key pair | Create one (e.g. `plotmap-admin`), download the `.pem` file and keep it safe |
| Network → Security group | Create new, with 3 inbound rules: **SSH (22) from My IP**, **HTTP (80) from Anywhere**, **HTTPS (443) from Anywhere** |
| Storage | **20 GiB gp3** |
| Advanced details → IAM instance profile | **`plotmap-admin-role`** |
| Advanced details → **Shutdown behavior** | **Stop** ⚠️ must be *Stop*, never *Terminate*: the server shuts itself down when idle, and *Terminate* would delete it |
| Advanced details → Termination protection | **Enable** |

Launch it and note the **Instance ID** (`i-0…`).

## Step 3 — A fixed web address (Option A chosen)

The server's public IP changes every time it starts, so `admin.build91.in` needs one of these.

**Option A — Elastic IP (the chosen option, ~$3.65/month)**
1. **EC2 → Elastic IPs → Allocate** → then **Actions → Associate** with `plotmap-admin`.
2. In the DNS of `build91.in`, add an **A record**: `admin` → that Elastic IP.

**Option B — Route 53 updates the address on every wake-up (~$0.50/month)** *(not used, kept for reference)*
Only if `build91.in` (or a subdomain delegated to Route 53) is managed in Route 53.
1. Note the **Hosted zone ID** of the zone containing `admin.build91.in`.
2. Create an **A record** `admin.build91.in` → the instance's current public IP, **TTL 60**.
3. In step 6 you'll give the Lambda `HOSTED_ZONE_ID` and `RECORD_NAME`, and it re-points the
   record each time it wakes the server.

Wait until `admin.build91.in` resolves to the server (check with `nslookup admin.build91.in`)
before step 5, or Caddy can't get the HTTPS certificate.

## Step 4 — Put the code on the server

Connect over SSH (on Windows, PowerShell works):

```
ssh -i plotmap-admin.pem ubuntu@admin.build91.in
```

The repository is private, so give the server read access with a **deploy key**:

```
ssh-keygen -t ed25519 -f ~/.ssh/github_plotmap -N ""
cat ~/.ssh/github_plotmap.pub
```

Copy the printed line into **GitHub → the repository → Settings → Deploy keys → Add deploy
key** (read-only). Then:

```
printf 'Host github.com\n  IdentityFile ~/.ssh/github_plotmap\n' >> ~/.ssh/config
sudo mkdir -p /opt/plotmap && sudo chown ubuntu /opt/plotmap
git clone git@github.com:Emagicor/ZeroxRealEstate.git /opt/plotmap
cd /opt/plotmap && git checkout feature/plot-map-admin-updates   # or main, once merged
```

## Step 5 — Run the setup script

```
sudo bash /opt/plotmap/plot-map/deploy/ec2/setup.sh
```

It asks for:
- **Admin web address:** `admin.build91.in`
- **Admin login username + password.** Everyone using the admin signs in with these. Pick a strong password.
- **Publish password.** This is what the admin types in ☁ Publish. Use the same one as on the office computer.

The script then:
- installs Python, boto3, Pillow and Caddy;
- creates `publish.config.json` with `awsProfile` left **empty**, so the server uses the IAM role from step 1;
- installs the HTTPS + login config;
- sets the admin (`plotmap`) and idle shutdown (`plotmap-idle.timer`) to start on every boot.

It ends with **✔ server.py is running**.

**Test:** open `https://admin.build91.in/?admin=1&project=eleganzav2`. The browser asks for the
username/password, then the admin opens, with the usual *"Which copy should this project use?"*
download prompt. A fresh server has no projects yet, so choose to download from the cloud.

## Step 6 — The wake-up link (Lambda)

1. **IAM → Policies → Create policy → JSON.** Paste `iam/wake-lambda-policy.json`. Replace
   `ACCOUNT_ID` and `INSTANCE_ID`. With option A, delete the last block (`OptionBOnly_…`);
   with option B, replace `HOSTED_ZONE_ID`. Name it **`plotmap-wake`**.
2. **Lambda → Create function** → *Author from scratch*:
   - Name **`plotmap-wake`**, runtime **Python 3.12**.
   - Permissions → *Create a new role with basic Lambda permissions*.
3. **Code:** replace the code with `wake-lambda/lambda_function.py` from this folder → **Deploy**.
4. **Configuration → General configuration → Edit → Timeout: 15 seconds.**
5. **Configuration → Environment variables:**

   | Key | Value |
   |---|---|
   | `INSTANCE_ID` | `i-0…` from step 2 |
   | `ADMIN_ORIGIN` | `https://admin.build91.in` |
   | `WAKE_KEY` | a long random string, e.g. from a password generator (30+ characters) |
   | `HOSTED_ZONE_ID` | option B only |
   | `RECORD_NAME` | option B only: `admin.build91.in` |

6. **Configuration → Permissions →** click the role name → **Add permissions → Attach
   policies → `plotmap-wake`**.
7. **Configuration → Function URL → Create:** Auth type **NONE**. Copy the URL.

**The wake-up link** is that URL plus the key:

```
https://<function-url>/?key=<WAKE_KEY>
https://<function-url>/?key=<WAKE_KEY>&project=eleganzav2     ← opens a project directly
```

**Test it:** stop the instance (EC2 → Instance state → Stop), wait until it's *Stopped*, then open
the link. You should see *"Waking up the admin…"*, and after 1–2 minutes the admin login.

## Step 7 — Hand it over

Share with the admin users:
- the **wake-up link** (bookmark it; always start from it);
- the **admin username + password** from step 5.

That's all they need. The server switches itself off after 60 minutes without use.

---

## Everyday use

- **Always start from the wake-up link.** If the server is already awake, it goes straight to the admin.
- **Work as usual.** Press 💾 Save and it uploads to S3; ☁ Publish works as on the office computer.
- **Just close the tab when done.** The server stops about an hour later. It never stops in the
  middle of an upload, a download or a Publish.
- **Office computer and server both edit the same S3 projects.** Avoid editing the *same* project
  in both places at the same time. When one has older files, the download prompt ("Which copy
  should this project use?") shows it.

## Updating to a new version of the code

```
ssh -i plotmap-admin.pem ubuntu@admin.build91.in
cd /opt/plotmap && git pull
sudo systemctl restart plotmap
```

(If the server is asleep, wake it first with the link, or start it in the EC2 console.)

## Changing settings

| What | How |
|---|---|
| Idle time before it sleeps | `sudo nano /etc/systemd/system/plotmap-idle.service` → `IDLE_MINUTES=60` → `sudo systemctl daemon-reload` |
| Admin login password | run `setup.sh` again (it rewrites the login; projects are untouched) |
| Publish password | `sudo nano /opt/plotmap/plot-map/publish.config.json` → `sudo systemctl restart plotmap` |
| Keep it awake for a long session | nothing to do; any real use resets the 60-minute clock |
| Stop it right now | EC2 console → Instance state → Stop (or `sudo shutdown -h now`) |

## Troubleshooting

| Symptom | Check |
|---|---|
| Wake-up page says *Link not valid* | The `?key=` part is missing or differs from `WAKE_KEY`. |
| Wake-up page keeps saying *Almost ready…* for >5 min | SSH in: `sudo systemctl status plotmap caddy`, `sudo journalctl -u plotmap -n 50`. With option B, check the DNS record was updated (`nslookup admin.build91.in`). |
| Wake-up page shows an AWS error | The Lambda role lacks `plotmap-wake` (step 6.6), or the instance ID in the policy/env var is wrong. If the disk uses a custom KMS key, the Lambda also needs `kms:CreateGrant` on it. |
| Browser warns about the certificate | DNS didn't point to the server when Caddy started. Fix DNS, then `sudo systemctl restart caddy`. |
| Save / cloud download says "AWS refused the request" | The instance role (step 1) isn't attached, or the bucket/distribution names in the policy are wrong. |
| "Publishing isn't set up on this server" | `/opt/plotmap/plot-map/publish.config.json` is missing; run `setup.sh` again. |
| Server never goes to sleep | `journalctl -t plotmap-idle` shows why (e.g. "busy"). Something that polls the admin constantly (a monitoring tool, an open tab on a kiosk) counts as use. |
| Server went to sleep too early | Raise `IDLE_MINUTES` (above). It never sleeps in the first 20 minutes after a wake-up. |

## Security notes

- Everything except `/api/health` requires the admin username/password (Caddy). The admin
  app's own save/delete API has **no** login, which is why Caddy must stay in front of it.
  `server.py` listens on `127.0.0.1` only, so it can't be reached around Caddy.
- The wake-up link can only **start** this one server; it can't read or change anything. Keep
  the key private anyway, so nobody can wake the server (and run up its bill) at will.
- No AWS keys are on the server; it uses the IAM role. Only SSH from your own IP is allowed.
- `publish.config.json` (publish password) is readable only by the app user.

## Files in this folder

| File | What it is |
|---|---|
| `setup.sh` | One-time server setup (step 5) |
| `Caddyfile.template` | HTTPS + login in front of the admin |
| `plotmap.service` | Runs `server.py` on boot, restarts it if it crashes |
| `idle-shutdown.sh`, `plotmap-idle.service`, `plotmap-idle.timer` | Stop the server after `IDLE_MINUTES` without use |
| `wake-lambda/lambda_function.py` | The wake-up link |
| `iam/ec2-role-policy.json`, `iam/wake-lambda-policy.json` | Permissions for the server and the Lambda |

The server side of this lives in `server.py`: `/api/health` (unauthenticated "I'm up"), and
`/api/idle` (local only), which reports `idleSeconds` and whether an upload/download/publish is
`busy`.
