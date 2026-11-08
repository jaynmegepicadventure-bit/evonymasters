# EvonyMasters Events & Monsters Calendar: deployment and administration

**Status:** The calendar implementation is in draft PR #10 until the required Cloudflare Workers and login are configured and tested. Do **not** merge it as a fully operational live calendar before completing these steps.

## Architecture and data ownership

- Google Sheets `EVONYMASTERS` remains the reward source. No spreadsheet edits are required.
- The existing independent Cloudflare `evonymasters-sheet-sync` Worker holds the validated reward snapshot. The change to `integrations/sheets-sync/worker.mjs` adds `GET /v4/calendar/catalog`, a read-only list of **all unique events, bosses, event bosses, regular monsters, monster families, and individual levels**.
- The separate new Cloudflare `evonymasters-calendar` Worker fetches this live catalog on the server when an administrator opens the editor. It stores only calendar **schedule rules** in a dedicated `CALENDAR` KV namespace. It never duplicates reward contents or changes existing Sheets data.
- The website `/calendar/` displays publicly published schedule occurrences returned by the calendar Worker, using day/week/month/upcoming views and filters.
- The admin UI is served by the calendar Worker from its own `/admin/` path, sharing origin with its private API.
- Existing EVENT ID and MONSTER ID columns in the spreadsheet were blank when checked. The catalog therefore uses **stable identity keys based on the normalized event name, or monster category + name + level**, not spreadsheet row numbers. Monster-family entries group all levels by type/name. If a name or category is renamed, the identity changes, so review existing schedules when renaming records.

## Suggested safe deployment order

1. Deploy updated `evonymasters/integrations/sheets-sync/worker.mjs` to the existing `evonymasters-sheet-sync` Cloudflare Worker. **Keep the existing DATA KV binding and SYNC_SECRET unchanged**. Test `GET https://evonymasters-sheet-sync.jaynmegepicadventure.workers.dev/v4/calendar/catalog`; it should respond with `entries` containing the new unique event/monster catalog and family/level records.
2. In Cloudflare Workers & Pages, create a **separate Worker** named `evonymasters-calendar`. Use the code in `integrations/calendar/worker.mjs`.
3. Create a new KV namespace and bind it to this new Worker as `CALENDAR`. Do not reuse the reward-sync Worker's `DATA` binding.
4. Set Worker environment variable `ADMIN_EMAILS` to a comma-separated list of the exact approved administrator emails. No shared or public password is needed. Optionally set `CATALOG_URL` if the reward sync Worker is on a different URL than `https://evonymasters-sheet-sync.jaynmegepicadventure.workers.dev/v4/calendar/catalog`.
5. Configure **Cloudflare Zero Trust Access** for this Worker hostname on paths `/admin*` **and** `/api/admin/*`, with an allow policy limited to the same approved email addresses. Do not protect the entire host, otherwise the public `GET /api/events` API cannot be loaded by visitors.
6. Verify that `GET /api/admin/catalog` without an authenticated Access session returns HTTP 403; with an approved Access account it returns entries. The Worker checks `ctx.access.getIdentity()` **and** `ADMIN_EMAILS`. A successful authenticated request never relies merely on a spoofable header.
7. Open `https://evonymasters-calendar.jaynmegepicadventure.workers.dev/admin/`, sign in and confirm that the **Events/Monsters** selection list loads automatically. Add a test draft by selecting multiple records, assigning dates and saving. Drafts must not appear in `/api/events`. Publish a test schedule, check the public API, then unpublish or delete the test.
8. Merge PR #10 and verify the new `/calendar/` route on the website. Test desktop/mobile, multiple schedule types and date navigation. There are no invented dates or automatic assumptions based on the `FREQUENCY` reward metadata.

## Administrator workflow

1. Search and filter the automatic catalog by `Event`, `Boss`, `Event Boss`, or `Regular Monster`. The **Unscheduled** filter highlights sources without any recorded schedule. Tick many entries at once or use `Select visible`. Whole-family entries cover the boss family; individual level entries allow more precise schedules.
2. Choose one of seven rules:
   - **Specific dates**: click multiple dates in the picker.
   - **Date range**: one uninterrupted date range (inclusive).
   - **Daily**: repeat every UTC day between start and end dates, or indefinitely with a review date.
   - **Weekly**: select Sun–Sat weekdays and an optional end date.
   - **Every X days**: choose an interval from 2–365 days.
   - **Ongoing**: continuously active from a start date until an optional end date.
   - **Always available**: permanent availability, hidden from public calendar by default unless the visitor enables it.
3. Enter UTC start/end times if known, confidence `Confirmed` or `Tentative`, optional individual date exclusions, and notes / source URL.
4. Select **Draft** initially; **Published** controls public visibility. **Paused** overrides public visibility without deleting data.
5. Choose whether to **Add** another schedule or **Replace** existing schedules for the selected records. Replace detaches only selected records from previous schedule groups, retaining other targets.
6. **Review after** is mandatory for indefinite daily, weekly, interval, range-less ongoing schedules. After the review date, public occurrences automatically display `Needs Review` rather than `Confirmed` until an admin updates the schedule.
7. Edit, pause, unpublish or delete existing schedule groups from the bottom list. Avoid simultaneously editing the same KV key in multiple browser sessions.

## APIs

- `GET /v4/calendar/catalog` (on `evonymasters-sheet-sync`): complete deduplicated event and monster reference catalog.
- `GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=all&includeAlways=false`: public, expanded dated occurrences. Filters `kind` to `Event`, `Boss`, `Event Boss`, `Regular Monster`, or `all`; 93-day maximum query window. With `includeAlways=true`, permanent monsters are included in the requested days.
- `GET /api/admin/catalog`: protected catalog.
- `GET /api/admin/schedules`: protected schedule groups, including drafts.
- `POST /api/admin/schedules`: bulk create.
- `PUT /api/admin/schedules/:id`: update, pause or publish a group.
- `DELETE /api/admin/schedules/:id`: remove a group.

## Security, reliability and known limitations

- The code **fails closed** when `ctx.access` is missing or the user's email is not explicitly allowed. The public API is read-only; write calls require same-origin and validated input.
- Cloudflare Access setup is required externally; this repository does not provision or change a Cloudflare account.
- KV is eventually consistent and can lose simultaneous updates. This version targets a small admin team editing at low frequency. Consider D1 for multi-user editing or audit/version history.
- Recurring schedules are **not inferred** from reward data. Unknown event dates stay unscheduled. All times use Evony server time (UTC) and all date boundaries are inclusive.
- Calendar page groups daily occurrences; its public availability is dependent on the new Worker being deployed. Until the Worker exists, the public page shows a temporary-unavailable message.
- Cloudflare documentation for Access Worker identity: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
