# Google Earth background — what it costs

> **Scope:** the cost of the **current** Google Earth aerial background (v1, commit `209e129`,
> see [GoogleEarthView.md](GoogleEarthView.md)) — what Google bills, when our code triggers a
> bill, what a project costs per month, and what could make it cost more.
>
> **Sources:**
> - **Google's prices:** checked 2026-09-28 against Google's own pages (links in §9). Prices
>   change — re-check before quoting a client.
> - **When our code bills:** read from `app.js` at `209e129` (line numbers in §3).
>
> **Not measured yet:** real visitor numbers, data (MB) per visit, and whether Google bills a
> refused request. Those are marked ⚠ below.

---

## 1. The short answer

- **Only one thing is billed:** Google's **Photorealistic 3D Tiles**, per **root request**.
  Our code makes **one root request each time a page of a Google-mode project opens**.
  Everything else (the tiles themselves, looking around, tours) is free.
- **Who pays:** each **client**, on their own Google Cloud account and key (decision D-5).
  Build91 pays nothing to Google.
- **India pricing** (for a client whose Google billing account is in India):
  - **7,000 page opens a month are free.**
  - After that, **$3.30 per 1,000**.
  - A typical project stays **free or costs a few dollars a month**. A busy one (50,000 opens
    a month) costs about **$142**.
- **Build91's own cost** (serving the extra code from our site): effectively **$0**.
- **The biggest avoidable cost:** today every page open is billed, **even when the visitor never
  looks at the aerial view** (e.g. a link that opens straight into a tour or video). See §7, R-1.

## 2. What Google bills

Google Maps Platform bills Photorealistic 3D Tiles as one SKU,
**"Map Tiles API: Photorealistic 3D Tiles"**. Google calls each billed request an "event".

- **One event = one root tileset request** (`tile.googleapis.com/v1/3dtiles/root.json?key=…`).
- It opens a **session**. Google's docs: *"Timed session tokens allow for up to three hours of
  renderer tile requests from a single root tileset request."*
- **The tile requests inside a session are not billed.** Google: tile requests
  *"don't impact your daily quota"* and are *"unlimited"*. A view that loads 800 tiles is still
  **one** event.

### Price lists (USD, per 1,000 events, per month)

**India** — for customers whose billing account is in India:

| Events per month | Price per 1,000 |
|---|---|
| First **7,000** | **free** |
| 7,001 – 5,000,000 | **$3.30** |
| above 5,000,000 | $2.40 |

**Global** — for billing accounts outside India, for comparison:

| Events per month | Price per 1,000 |
|---|---|
| First **1,000** | **free** |
| 1,001 – 100,000 | $6.00 |
| 100,001 – 500,000 | $5.10 |
| 500,001 – 1,000,000 | $4.20 |
| 1,000,001 – 5,000,000 | $3.30 |
| above 5,000,000 | $2.40 |

Notes:
- The **free allowance is per billing account, per month**, not per key or per project. Because
  each client uses their own account (D-5), **each client gets their own 7,000**. If a client
  already uses 3D Tiles elsewhere on the same billing account, that usage shares the allowance.
- Prices are in USD. ⚠ Indian invoices normally add **18% GST** — confirm on a client's first
  invoice.
- Google's own limits: at most **10,000 root requests per day** per project, and 12,000 tile
  requests per minute.

## 3. When our code makes a billed request

Everything below was read from `app.js`. **Billed** means one root request.

### Visitors (published site, client link, iframe embed)

| What the visitor does | Billed? | Why |
|---|---|---|
| **Opens the page** | **1** | Boot calls `startGoogleLayer()` right after `initThree` (`app.js` ~13309), for every page load of a Google-mode project. |
| **Reloads the page / opens it in another tab** | **1 each** | Every load is a fresh start. |
| Looks around, zooms, idles | 0 | Same session; the tiles are free. |
| Opens a 360° tour and comes back | 0 | Tours only **pause** drawing (`googleDrawing()` / `geoTourCovers()`); the layer and its session stay. |
| Keeps the page open more than **3 hours** | +1 per 3 h | The session expires; the library fetches a new root (`GoogleCloudAuthPlugin`, `autoRefreshToken: true`). |
| **Any tile request fails with a 4xx error** | +1 | The library treats **any** 4xx on a tile as an expired session and refetches the root. Concurrent failures share one refetch. Rare. |
| Loses the connection, then gets it back | +1 | Only after a failed start (`online` listener, `app.js` ~1310). |
| Uses the offline copy or a standalone bundle | 0 | Plan-only; no Google request is made (D-8). |
| Link previews (WhatsApp, etc.) | 0 | Previews don't run the page's scripts. |

⚠ Whether Google bills a **refused** root request (bad key, quota hit, website not allowed) is
not stated in Google's docs. It doesn't change the totals much either way.

### Admin (billed to the same client key)

| Admin action | Billed? |
|---|---|
| Opening the project in the admin | 1 per page load |
| **Test** (key) | 1 per press |
| **Use this key** | 1 (restarts the layer) |
| **Find the site** (new location) | 1 (restarts the layer, `setGoogleSite`) |
| Switching the background to Google Earth | 1 (`setBackgroundKind`) |
| Drone height / distance / direction, top-down view, two-point align, measure, Save | 0 |

Setting up one project realistically takes **20–50 events**. That's well inside the free
allowance and doesn't matter for cost.

## 4. What a project costs per month

**Assumption:** 1 page open = 1 event. Real traffic is usually a bit **higher** than the number
of visitors, because of reloads (see R-2).

| Page opens per month | India price | Global price |
|---|---|---|
| 2,000 | **$0** | $6 |
| 7,000 | **$0** | $36 |
| 10,000 | $9.90 | $54 |
| 25,000 | $59.40 | $144 |
| 50,000 | $141.90 | $294 |
| 100,000 | $306.90 | $594 |

How to work it out:
- **India:** (opens − 7,000) × $3.30 / 1,000.
- **Global:** (opens − 1,000) × $6 / 1,000, up to 100,000.
- ⚠ Before GST.

**For scale:** a real-estate project page with 50–300 visits a day is about 1,500–9,000 page
opens a month. On India pricing that is **free to about $7 a month**.

## 5. Build91's own costs

| Item | Cost |
|---|---|
| **Google** | $0 — each client's key is billed to the client (D-5). |
| **Serving the extra code** (`vendor/3d-tiles-renderer-*`, three addons, Draco, logo; about 700 KB, loaded only by Google-mode projects) | Effectively $0. It's served from our S3/CloudFront and cached by the browser after the first visit. 10,000 first visits ≈ 7 GB, inside CloudFront's always-free 1 TB a month. |
| **S3 storage** of that code | Negligible (under 1 MB per published project). |
| **Project data** | Smaller than a pano project: a Google-mode project has no background image to store or download. |

## 6. What visitors pay

- **Money:** nothing.
- **Mobile data:** the tiles come from Google to the visitor's phone. ⚠ MB per visit is **not
  measured yet**. It's an open Phase 0 item in [GoogleEarthView.md](GoogleEarthView.md) §10,
  and should be measured on a phone before launch.

## 7. What could make it cost more

| # | Risk | Effect | What would fix it |
|---|---|---|---|
| **R-1** | **Every page open is billed, even if the aerial view is never shown.** Boot always starts the Google layer, including when a link opens straight into a tour, video or gallery. | Pays for views nobody sees. | **Start the layer only when the aerial view is actually on screen.** Code change, not done. Probably the biggest saving. |
| **R-2** | **Reloads.** Each reload is a new event. iPhones also reload a tab silently after it was in the background, or after a graphics-memory crash (the eleganzav2 iPhone issue). | More events than visitors. | Fix the iPhone memory problem. |
| R-3 | **Any tile 4xx** starts a new session (library behaviour). | Rare extra events. | Watch in Google's console; only act if it shows up. |
| R-4 | **A viral link or bots** | Sudden spike. | Daily quota cap in Google Cloud (§8). When it's hit, visitors get plan-only, not an error. |
| R-5 | **Admin testing on the client's key** | Tiny (tens of events). | None needed. Use a Build91 test key for experiments. |
| R-6 | **Key copied from the page** | Keys are visible in the page by design. | The key's website restriction (only the project's addresses) and Map Tiles API only (G4). |
| R-7 | **Shared billing account** | The client's other 3D Tiles use eats the same 7,000 free. | Mention it when onboarding the client. |
| R-8 | **Google changes prices** | Any. | Re-check Google's pricing page before quoting; this doc is dated. |

**Not a cost driver today:** Places API (place-name search is a later Phase 4 item). If it's
built, it's billed as a separate SKU and needs its own estimate.

## 8. Recommended cost controls for each client

Put these in the client setup steps (the admin panel's "Instructions for the client"):

1. **Daily quota cap** on the Map Tiles API root requests (Google Cloud → APIs & Services →
   Map Tiles API → Quotas):
   - To **stay within the free allowance** on India pricing: about **230 a day** (7,000 ÷ 30).
   - For a paid project: the monthly budget divided by 30, converted with the prices above.
2. **Budget alert:** Billing → Budgets & alerts, e.g. at $5, with email.
3. **A dedicated website key**, limited to the project's addresses and to Map Tiles API only
   (G4). Never a server key.

When the daily cap is reached, the rest of that day's visitors see plots over the site plan
with a short note, not an error. That's the fallback in [GoogleEarthView.md](GoogleEarthView.md) §7.

## 9. Sources

Checked 2026-09-28.
- Google Maps Platform global price list:
  https://developers.google.com/maps/billing-and-pricing/pricing
- Google Maps Platform India price list:
  https://developers.google.com/maps/billing-and-pricing/pricing-india
- Map Tiles API usage and billing (sessions, quotas):
  https://developers.google.com/maps/documentation/tile/usage-and-billing
- Our code:
  - `app.js` — `startGoogleLayer`, `testGoogleKey`, `setGoogleSite`, `setBackgroundKind`;
  - `vendor/3d-tiles-renderer-0.3.46/src/plugins/three/GoogleCloudAuthPlugin.js` — session refresh.

## 10. Open items

- ⚠ **Measure on phones:** MB per visit and events per visit (to see how many reloads really
  happen).
- ⚠ **Check a client's first invoice:** GST, and whether refused requests are billed.
- **Decide R-1**, starting the layer only when the aerial view is shown. That's a code change.
