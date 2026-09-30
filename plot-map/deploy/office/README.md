# Running the Build91 admin on an office computer

**The plan (decided 2026-09-30):**
1. Run the admin on **one computer in the office** with a fixed IP, for internal use (mainly
   Kriti, the same way she uses 3DVista).
2. **Watch the usage for one month.** The server logs it (below).
3. If usage grows, or the admin is needed from outside the office, move it to **AWS EC2,
   Option A** (sleep/wake + Elastic IP). That guide is ready in `../ec2/README.md`.

The admin runs as today's local setup: `server.py` on port **8731**. Nothing extra to install
beyond Python.

---

## One-time setup of the office computer

> If the office computer is the one that already runs the admin today, steps 2–5 are done.
> Just do steps 1, 6 and 7.

1. **Fixed IP address.** Other computers reach the admin at `http://<this PC's IP>:8731`, so
   the IP must not change. In the office router, give this PC a **DHCP reservation** (or set a
   static IP). Check the IP with `ipconfig` (the "IPv4 Address" line).
2. **Python 3.** Install from python.org and **tick "Add python.exe to PATH"**. The start file
   installs the two libraries it needs (boto3, Pillow) by itself the first time.
3. **The code.** Clone the repository, e.g. to `C:\Build91\ZeroxRealEstate`:
   ```
   git clone https://github.com/Emagicor/ZeroxRealEstate.git C:\Build91\ZeroxRealEstate
   cd C:\Build91\ZeroxRealEstate
   git checkout feature/plot-map-admin-updates
   ```
4. **Publish settings.** Copy `plot-map\publish.config.json` from the computer that runs the
   admin today into `plot-map\` here. It holds the ☁ Publish password, so copy it by USB or
   in person, not by email.
5. **AWS access** (for 💾 Save → S3 and ☁ Publish). Give this PC its **own** narrow AWS login;
   don't reuse keys from `.env.local`:
   1. AWS console → **IAM → Users → Create user** `plotmap-office` (no console access).
   2. Attach a policy with the JSON from `../ec2/iam/ec2-role-policy.json` (replace `ACCOUNT_ID`).
   3. The user → **Security credentials → Create access key** ("Application running outside AWS").
   4. On this PC, install the AWS CLI and run `aws configure`. Paste the key, region
      `ap-south-1`. (`publish.config.json` uses `"awsProfile": "default"`, i.e. this login.)
6. **Let other office computers in.** Double-click **`plot-map\allow-office-access.bat`** once,
   and say *Yes* to the administrator prompt. It opens port 8731 for the office network only.
   Windows must treat the office network as **Private**: Settings → Network → the connection → *Private network*.
7. **Stay awake.** Settings → System → Power: set sleep to **Never** while plugged in, at least
   during office hours. A sleeping PC means no admin for anyone.

Optional: **start it automatically** when the PC logs in. Press `Win+R`, type `shell:startup`,
and copy the *Build91 - Start Admin* shortcut into that folder. The links file then opens by
itself after every login.

## Every day

**On the office computer:** double-click **Build91 - Start Admin** on the Desktop. (The first run
of `plot-map\start-admin.bat` creates the Start/Stop shortcuts there.) It:
- starts the admin server **and** the internet link (a Cloudflare quick tunnel) in the
  background, with no windows to keep open;
- writes **`Build91 LINKS.txt`** to the Desktop and opens it in Notepad. For every project it
  lists the CLIENT and ADMIN links: *Internet* (tunnel), *Office network* (this PC's IP) and
  *This computer* (localhost).

Double-clicking again while it runs just refreshes the links file. **Build91 - Stop Admin**
(`stop-admin.bat`) stops the server and the tunnel.

- The **internet links change every time** the tunnel starts (e.g. after a restart), so share the
  new ones from the file.
- Anyone with an **admin internet link can edit projects**, so send only CLIENT links to clients.
- The plain-language version for a non-IT user is `Build91 - HOW TO GET THE LINKS.txt` on the
  Desktop.

Opening a project for the first time on a PC shows *"Which copy should this project use?"*.
Choose the **cloud copy**; it downloads the project from S3. After that, 💾 Save uploads
changes back to S3 as usual.

## After one month: read the usage

On the office computer, in the `plot-map` folder:

```
python usage_report.py 2026-10
```

It prints the days used, the number of sessions, active hours, usage per computer, and every
session. It also shows **"EC2 would run ~N h"**: how many hours an EC2 sleep/wake server would
have been on for the same usage (each session plus its 60-minute idle wait), for the cost
estimate. The raw log is `plot-map\usage-log.csv`: one line per minute of real use per
computer. The admin page's own background checks aren't counted.

Move to EC2 (Option A) when, for example:
- the admin is needed **outside the office** (home, site visits, clients), or
- more people use it, or it's needed when this PC is off.

## Updating to a new version

Double-click **Build91 - Stop Admin**, then:
```
cd C:\Build91\ZeroxRealEstate
git pull
```
and double-click **Build91 - Start Admin** again.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Python is not installed" | Install Python 3 with *Add to PATH* ticked, then run the file again. |
| Other PCs can't open the link | Run `allow-office-access.bat` once; set the network to *Private*; check both PCs are on the same office network; confirm the IP with `ipconfig`. |
| The link stopped working one day | The PC's IP changed. Set the DHCP reservation (step 1) and re-share the link. |
| Save / cloud download says "AWS refused" or "no AWS login" | Step 5: `aws configure` on this PC, with the `plotmap-office` user's key. |
| "Publishing isn't set up on this server" | `plot-map\publish.config.json` is missing (step 4). |
| Internet links show a Cloudflare error | Stop, wait 10 s, Start again, and use the NEW links from the file. |

## Security

- This setup has **no login**. That's fine inside the office network, and that's all it's open
  to: the firewall rule only allows the local network.
- **Never forward port 8731 on the office router to the internet.** Anyone could then change or
  delete projects. For access from outside, use the EC2 setup, which has HTTPS and a login.
- The AWS key on this PC can only reach the project bucket and CloudFront. It can't touch the
  rest of the AWS account.
