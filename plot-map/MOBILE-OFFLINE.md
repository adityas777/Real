# Mobile offline — plan

**Implemented 2026-09-24/25, including strict offline mode (E).** Written 2026-09-24 from a
code review of `sw.js` and the offline section of `app.js`, then updated with the answers to the
decisions. The numbers follow the review's findings. Where the code lives and how it was tested:
see "Implementation" at the end.

| # | Finding | Decision |
|---|---|---|
| 1 | On iPhone the download lands in Safari, not in the home-screen app | Fix |
| 2 | The phone check deletes saved downloads | Fix |
| 3 | Google Sheet and offline | Clarified. The phone merges the sheet into its saved `plots.csv` |
| 4 | Offline plot availability is out of date | Fix, using the merged `plots.csv` from 3 |
| 5 | Replaced files never update on a phone | Fix: manual update from the menu |
| 6 | The app reloads itself when a new version arrives | Fix: never reload automatically |
| 7 | Downloads are fragile | Fix as suggested in the review |
| 8 | WhatsApp / Instagram / Facebook in-app browsers | Deferred |
| 9 | Download prompt shown on the home view | New: menu option only |
| E | Strict offline mode | Adopted. See the last section |

"Offline layer" below means the service worker (`sw.js`). "Offline panel" means the small
panel the menu option opens; it replaces today's automatic banner. "File list" is the list
of files with fingerprints described in section 5.

---

## How it works after these changes

- **One menu option.** It reads "SAVE FOR OFFLINE" when nothing is saved and "UPDATE OFFLINE
  COPY" when a copy exists. It handles the first download, a re-download and an update. There
  are no other offline prompts anywhere.
- **A saved copy is complete and fixed.** It is the same set of files a published demo has:
  - the app itself;
  - the project files (layout, alignment, landmarks, amenities, tours);
  - `plots.csv`, with the Google Sheet merged in;
  - every image, video, audio file and PDF.
- **The phone runs from the saved copy,** online or offline — strict offline mode, like an
  exported standalone folder. Nothing in it changes by itself, plot availability included: it
  is as of the last save/update, and the app says so.
- **Only the user updates it,** from the same menu option. The app restarts once after an
  update and at no other time.
- **Visitors who never save** keep today's online behaviour.

---

## 1. iPhone: save inside the home-screen app

**Today:**
- The banner downloads in the Safari tab and then tells the user to add the icon.
- On iOS a home-screen app has its own storage, separate from Safari. The icon therefore starts
  empty and fails offline, and opened online it offers the whole download again.
- Content left in a Safari tab can also be cleared after about 7 days without a visit.

**Plan:**
- On an iPhone or iPad in a browser tab, the menu option opens a short guide instead of
  downloading. This applies to Safari and to the other iOS browsers alike. The guide says:
  1. Tap **Share → Add to Home Screen**.
  2. Open the new icon from the Home Screen, while online.
  3. Open the menu there and choose **Save for offline**.
- Inside the home-screen app, the menu option downloads normally (sections 5 and 7).
- **Icon name:** today every iOS icon is titled "Build91". Name it after the project, so the user
  can find the icon they just added. Published demos get the name at publish time; the local
  server sets it per project.
- **iPads:** recognise them correctly, since tablets are included (Decision A). iPadOS presents
  itself as a Mac.
- Ask for persistent storage from inside the home-screen app.

**Done when:** on an iPhone, add the icon, open it online and save. Then switch to airplane
mode, force-quit and reopen the icon. The map, plots, pano, landmarks, amenities, tours, video,
audio and brochure all work.

---

## 2. Never delete a saved copy automatically

**Today:**
- Each launch checks the window width: at most 720px wide in portrait, 900px in landscape.
- A launch that fails the check removes the offline layer and deletes the saved content. On a
  published demo that is that demo's content; at the site root it is every project's.
- Triggers:
  - tablets;
  - "Desktop site" mode;
  - admin opened on the phone;
  - possibly the largest phones in landscape.

**Plan:**
- Remove automatic deletion. A saved copy is removed only when the user asks, through a "Remove
  from this phone" link inside the offline panel (useful to free space).
- Decide whether this is a phone or tablet from the device itself (touch screen, no mouse), not
  from the current window width. Rotation, large phones and "Desktop site" mode then can't
  change the answer. **Tablets are included** (Decision A).
- On a device that doesn't qualify (a desktop), don't set up offline, and leave anything already
  there alone. The old clean-up runs only when nothing is saved in that browser.
- Admin pages never set up offline and never delete anything.
- The brochure's offline-capable viewer uses the same device test. Every phone and tablet that
  can save can then read the brochure offline.

**Done when:** after saving on a phone, the saved copy is still there and works offline when you:
- open the site in landscape;
- open it with "Desktop site" switched on;
- open admin on the same phone.

---

## 3. The Google Sheet and offline

**Today (clarified, no change):**
- **The sheet is never stored on the phone,** during a save or at any other time. It is read
  live from Google on each online open, and applied in memory on top of `plots.csv`. The offline
  layer ignores requests to other sites, Google included.
- **"Save for offline" stores `plots.csv` from the server,** not the sheet.
- **The sheet reaches offline use only indirectly.** Every admin Save writes `plots.csv` with the
  sheet's values applied at that moment, and every Publish saves first. Offline, the phone
  therefore shows the sheet as it was at the last Save or Publish.
- **The same `plots.csv` is used in two other cases:** when the phone is online but can't reach
  the sheet, and in the standalone export.
- **Weak signal:** the app asks the live sheet before it shows the plots, and it doesn't give up
  quickly. On a weak signal the plots are held back until that request fails.

**Can the sheet data be saved into `plots.csv` when saving for offline? Yes, on the phone.**
- During Save and Update, the phone reads two things: the project's `plots.csv` from the server
  and the live Google Sheet. It merges them and stores the result as the phone's own saved
  `plots.csv`.
- **The merge follows the same rule as an admin Save.**
  - For every plot the sheet lists, each column the sheet has wins, blank cells included.
  - Columns only in `plots.csv`, such as media links, keep their values.
  - Plots the sheet doesn't list keep their values.
  - In practice the sheet's columns are the common ones, because every admin Save already copies
    them into `plots.csv`. Sheet-only additions such as Dimensions and Notes come across too.
- **Only the phone's copy changes.** The server's `plots.csv` is untouched: the phone never writes
  to the server, and a published demo is read-only.
- **Offline, the app simply reads the saved `plots.csv`.** No separate sheet copy is kept and no
  extra precedence rules are needed.
- **The time the sheet was read** is kept with the saved copy, for "Availability as of …".
- **If the sheet can't be read during the save,** the phone keeps the server's `plots.csv` as is,
  which carries the sheet as of the last admin Save or Publish. The result line says so.

---

## 4. Offline plot availability

- **A saved copy uses the merged `plots.csv` from section 3, online and offline.** It never reads
  the live sheet (strict offline mode), so there is no waiting on the sheet on a weak signal.
- **Fresh availability comes from Update,** which re-reads the sheet and merges it again.
  (Decision B — refreshing on every online read — fell away with strict mode.)
- **Say when the data is from.** "Availability as of 24 Sep, 6:10 pm" shows in the plot info card
  and the size-filter menu of a saved copy. Nothing is shown on the home view (section 9).

**Done when:**
1. Save, then change a plot's status in the sheet.
2. The phone keeps showing the saved status with its "as of" time, online or offline.
3. After Update, it shows the new status.

---

## 5. Update from the menu, using a file list

**Detecting changed files cleanly (Decision C, yes):**
- The server provides a file list for each project. It covers every file in the saved copy, with
  a fingerprint (size and content hash) for each.
- **Published demos:** `publish_s3.py` already computes a hash of every file for its incremental
  upload. Its record of those hashes is private, so publishing also writes a public file list next
  to the demo.
- **Local server:** `server.py` builds the same list on request. It remembers hashes by file date
  and size, so large videos aren't re-read every time.
- **The file list decides what the phone saves.** Today the app works this out itself by walking
  the menu, tours and landmarks, and it has missed files before (contact photos, tour panoramas).
  With the list, the saved copy is exactly what a published demo contains.
- **First save:** the list gives the exact download size up front. It replaces today's size probe
  of every file.
- **Update:** compare the server's list with the one saved on the phone. Download only changed or
  new files, and remove files the project no longer uses. `plots.csv` is re-merged with the sheet
  on every update (section 3).
- **Demos published before this change** have no list. They get one on their next publish; until
  then, Update downloads everything.

**The menu row and Update:**
- The row reads "SAVE FOR OFFLINE" or "UPDATE OFFLINE COPY". The panel shows when the copy was
  saved and how much space it uses.
- **Updates are safe to interrupt.** The previous saved copy keeps working throughout:
  - Large files are replaced one at a time, and each only after its new version has fully
    arrived.
  - The app, the project files and `plots.csv` switch over together at the very end.
- **One restart.** After a successful update the app restarts once. That is the only restart
  (section 6).

**"Update available" dot (Decision D, yes):**
- The file list carries one version stamp.
- When the menu is opened, one tiny request compares that stamp with the saved one.
- If the server is newer, the row shows a small dot and "Update available". Nothing shows on the
  home view, and nothing waits on the check.

**Done when:**
1. Replace a video and the brochure on the server, keeping the same file names.
2. The phone keeps playing its saved versions.
3. The menu row shows "Update available".
4. Update downloads only those two files, and afterwards the new versions play offline.

---

## 6. No automatic reload

- **No reloads:** remove the automatic page reload when a new version of the app arrives.
- **New offline layers wait:** a new version waits in the background instead of taking over at
  once.
- **Saved projects keep their app:** a saved project runs its saved app code. Browsers move to a
  newer offline layer once the app is fully closed, and even then the project still looks and
  behaves as saved.
- **New app code arrives only through Update** (section 5).
- **Visitors without a saved copy** don't get a reload either. They get the new version the next
  time they open the site.
- **Side benefit:** saved phones stop asking the network first for project files. That removes
  the other half of the weak-signal wait.

**Consequences to accept:**
- Fixes shipped later reach a saved phone only after the user updates. The dot (D) prompts for
  this.
- The browser still updates the offline layer on its own, so the offline layer must keep working
  with older saved app versions. Recorded as a rule in `CLAUDE.md`.
- (The earlier concern — a saved layout shown with a newer live sheet — is gone with strict mode:
  layout and availability always come from the same save/update.)

---

## 7. Reliable downloads

- **Stream into storage:** write each file straight into storage as it arrives, counting bytes on
  the way. Whole videos are no longer held in memory, and the progress bar moves smoothly instead
  of freezing on each video.
- **Pace downloads by size:** large files one at a time, small files two or three at a time.
- **Keep the screen awake** during the download where the phone allows it. Say "Keep this screen
  open until it finishes."
- **Pause and resume:**
  - If the user switches apps, locks the screen or loses signal, pause and continue when they
    return.
  - Files already saved aren't fetched again.
  - If the app was closed, the next tap on the menu option carries on.
- **Retry and report honestly:** retry failed files after a short wait. At the end, check what
  storage actually holds and report it, e.g. "142 of 145 saved — no connection" or "142 of 145
  saved — phone storage full".
- **Space:** keep the free-space check before starting, showing the space needed (from the file
  list) against the space free. Keep the persistent-storage request.
- **Wait until ready:** if the offline layer isn't set up yet (a slow first visit), show
  "Preparing…" rather than starting a download that would save nothing.

---

## 8. In-app browsers: deferred

This is not part of this plan.

---

## 9. Menu only

- **Remove the automatic banner** shown after the site loads. Also remove the "declined" and
  "saved" memory that existed only for that banner, including the stale `SW_VERSION = 'v12'`
  key.
- **The menu row is the only entry point.** It covers the first save, a re-download and an
  update, on both Android and iPhone.
- **Android install:** tapping Save still opens Android's install dialog where the browser offers
  one. Otherwise, the result line in the panel says "menu ⋮ → Install app". There is no separate
  pop-up.
- **Where the row appears:** only in the client view, on a phone or tablet, and on a secure
  (https) site.
- **Unsaved project opened offline:** show a plain message instead of the bare "Offline" text:
  "This project isn't saved on this phone — connect and use Menu → Save for offline."

---

## Phones that have already saved

- Phones that saved with the current version keep their download. On first run, the new version
  adopts what's already stored as the saved copy.
- Those files were saved before fingerprints existed. The first Update keeps each file whose size
  matches the server's file list and fetches the rest again. From then on, the fingerprints are
  exact.
- Nobody has to download the ~200 MB again.

---

## Build order

1. **Section 2.** It stops data loss, and it is small and independent. Ship it first.
2. **The file list** (section 5), on the publish side and the local server.
3. **Sections 5, 6, 7 and 9 together.** They define the saved copy and the menu flow.
4. **Sections 3 and 4.** The merged `plots.csv` and the "as of" label.
5. **Section 1.** The iOS guide plugs into the menu flow.

**Files expected to change:**
- `sw.js`
- `app.js`: the offline section, the menu row, plot-data loading and the plot info card
- `index.html`: the offline panel and the iOS guide
- `styles.css`
- `publish_s3.py`: the public file list and the iOS icon name
- `server.py`: the file list for the local server and the iOS icon name
- docs: `CLAUDE.md`, `README.md`, `CHANGELOG.md`

---

## Device test plan

| Device | Checks |
|---|---|
| iPhone, Safari tab | The menu shows the guide; nothing downloads in the tab |
| iPhone, home-screen app | Save → airplane mode → force-quit → reopen: everything works; Update after a server change |
| iPad, home-screen app | Same as iPhone, plus the brochure offline |
| Android phone, Chrome | Save and install → airplane mode → reopen from the icon; Update; resume after a screen lock mid-download |
| Android tablet | Save, offline use, brochure |
| Large phone (Pro Max / Ultra) in landscape | The menu row shows; the saved copy survives |
| Android "Desktop site" mode; admin on the phone | The saved copy is untouched |
| Any device | Change one file on the server → dot appears → Update fetches only that file |
| Any device | Deploy a new app version → no reload; the saved project is unchanged until Update |
| Any device | Nearly full storage → a clear "phone storage full" result; the previous saved copy still works |

---

## Decisions

| | Decision | Answer |
|---|---|---|
| A | Include tablets | **Yes** |
| B | Refresh the saved sheet data on each successful online read | **Dropped** — strict offline mode reads the sheet only on Update |
| C | Download only changed files | **Yes** — through the file list (section 5) |
| D | "Update available" dot | **Yes** — one request when the menu opens (section 5) |
| E | Strict offline mode | **Adopted** |

**Out of scope:** the "last N bytes" range requests.

---

## Strict offline mode: is it possible cleanly?

**The idea:** once a project is saved on a phone or tablet, it always runs from the saved copy,
whatever the connection. It behaves like the standalone export: a fixed copy that never reaches
out. The only online moment is the user tapping **Update offline copy** in the menu.

**Verdict: yes, cleanly, and it makes the plan simpler rather than harder.**

**Why it's clean:**
- **One rule in the offline layer.** For a saved project, answer every request from the saved copy
  and never from the network. No network-first, no stale-while-revalidate, no guessing about
  signal strength. It is the smallest, most predictable job the offline layer could have. That
  also makes the section 6 rule (stay compatible with older saved app versions) easy to keep.
- **The app already has a mode like this.** The standalone export never reads the Google Sheet and
  shows the `plots.csv` it was exported with. A saved copy would get the same treatment through its
  own flag, not by reusing the export's code (which also handles file:// and embedded images).
- **Weak signal stops mattering.** The app opens instantly every time, with no waits on project
  files or the sheet. This fully resolves the weak-signal finding.
- **Demos are predictable.** What the salesperson checked this morning is exactly what the client
  sees, whatever the signal on site.

**What changes in the plan if adopted:**
- **Section 4:** no live sheet read at all while a saved copy exists, online or not. Availability
  is always as of the last Update, so the "Availability as of …" label shows at all times for a
  saved copy, not only offline.
- **Decision B falls away.** There are no online reads to refresh from. Fresh availability comes
  from tapping Update, which also re-merges the sheet (section 3).
- **Decision D stays.** Its one tiny check runs only when the menu is opened, never changes what's
  shown, and fails silently with no signal.
- **Section 6 gets simpler.** The layout/sheet mismatch case disappears: layout and availability
  always come from the same Update.

**The honest limits, compared with the export folder:**
- **The browser owns the storage.** An export folder is files on disk. A saved copy lives in the
  browser's storage, which the user (clear site data, uninstall) or, under heavy storage pressure,
  the system can remove. Persistent storage, requested on save, makes that rare. If it happens, the
  app says "not saved on this phone" and one Update restores it.
- **The offline layer itself still updates when online.** Browsers enforce this and it can't be
  switched off. It doesn't break strict mode: the layer only serves the saved copy, and the saved
  app stays frozen.
- **External links still need internet,** exactly as in the export: YouTube/Vimeo videos,
  externally hosted tours, plot media links. The export already flags these for the admin
  (`scan_menu_for_online_content` in `server.py`). The offline panel can reuse that to say "3 items
  need internet".
- **Android vs iPhone:**
  - On Android, the browser tab and the home-screen app share storage, so the Chrome tab also
    runs the saved copy.
  - On iPhone only the home-screen app has it; the Safari tab stays the normal live site.
  - The Android behaviour is consistent ("this phone has a saved copy"). It can be limited to the
    home-screen app if preferred, at the cost of some extra logic. The recommendation is to keep
    it simple.
- **Unpublishing doesn't reach saved copies.** A demo that is later unpublished keeps working on
  phones that saved it, just as a copied export folder would, until the user removes it.
- **One address, several projects.**
  - This is cleanest on published demos, where one folder is one project.
  - On the local server, several projects share one address. The offline layer must work out
    which saved copy a request belongs to from the page's project. That is workable but slightly
    more involved.

**Decision: adopted.** It matches the promise ("saved = works like the export, always"), removes
the weak-signal and mismatch cases, and drops the live-overlay logic. The cost is that
availability is only as fresh as the last Update; the "as of" label and the update dot make that
visible.

---

## Implementation (2026-09-24/25)

- **`sw.js` (v50):** strict serving of saved copies, plain network otherwise, legacy fallback,
  "not saved on this device" page, byte-range slicing, no automatic takeover. It answers only its
  own app's pages (`isAppPage`) — found while testing a published folder under the root app.
- **`app.js`:** the "Offline (phones & tablets)" section near the end (`runOfflineSave`,
  `planOfflineSave`, `openOfflinePanel`, `checkForOfflineUpdate`, `maybeAdoptLegacyDownload`, …),
  `isTouchDevice`/`isIosDevice`, `mergeSheetIntoCsv`, `OFFLINE_COPY` in `loadData`, the "as of"
  line in `openPanel` and `openAreaMenu`.
- **Server:** `publish_s3.offline_list_bytes` + `offline-files.json` in every publish (uploaded
  last); `server.py` `/api/offline-files`; the iOS Home Screen name baked in at publish.
- **Tested** in the Browser pane with phone emulation (localhost, and a published folder built
  locally): first save, strict boot with the server stopped (menu, tours, audio, the eleganzav2
  video and brochure), update of only the changed files, removed files dropped, the update dot,
  the iPhone guide, Remove, adoption of an older download without re-downloading it, the legacy
  fallback offline, the "not saved" page, desktop and admin visits leaving copies alone, and a
  waiting offline layer started only by Update.
- **Still to test on real devices:** the iPhone sequence (section 1's "Done when") and an Android
  phone and tablet (install, airplane mode, lock the screen mid-download).

## Google Earth projects (2026-09-27)

A project whose aerial view is Google's live 3D view ([GoogleEarthView.md](GoogleEarthView.md)):

- **Google's imagery is never in the saved copy.** Their terms forbid storing it, and `sw.js`
  ignores other sites' requests. Offline, the aerial view shows the plots over the site plan
  with a short note.
- **Its offline list does carry the Google layer's own code** (`vendor/3d-tiles-renderer-*`,
  `vendor/three-r160-addons/`, `vendor/google-maps-logo/`, about 700 KB). A saved copy answers
  every same-site request itself, even when the phone is online, so without that code the
  Google view would fail on any phone that saved the site. With it, an online phone shows
  Google's view from its saved copy.
- **Pano projects are unchanged:** they don't get that code, and a Google project doesn't get
  the pano it keeps only for switching back.
- The rules are `publish_s3.shell_file_wanted` and `_project_files` (publish), and
  `server.offline_files` (local). Checked by `tests/test_google_earth.py`.
