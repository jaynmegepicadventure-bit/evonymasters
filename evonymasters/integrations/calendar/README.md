# EvonyMasters Events & Monsters Calendar and Live Availability

**Status: draft PR #10.** Do not merge or release until the two Cloudflare Workers have been redeployed and the public/admin behavior has been tested. No admin login or Cloudflare configuration is provisioned automatically by this repository.

## Data flow

- The **EVONYMASTERS** Google Sheet remains the source for catalog names and rewards.
- `evonymasters-sheet-sync` validates Sheet data and exposes `/v3/search` and `/v4/calendar/catalog`. Its **DATA** KV and **SYNC_SECRET** must remain unchanged.
- `evonymasters-calendar` stores only schedule rules in its **CALENDAR** KV namespace (`evonymasters-calendar-data`). Its admin interface is protected by Cloudflare Access and `ADMIN_EMAILS`.
- For *globally correct* Live Only filtering and availability sorting before pagination, **both Workers must have read access to the same CALENDAR KV namespace**:
  - Calendar Worker: **CALENDAR** → `evonymasters-calendar-data`
  - Sheet-sync Worker: **CALENDAR** → `evonymasters-calendar-data` (additional read-only use in code)
- The site's homepage, Events, Chest Finder and individual boss pages read published occurrences from the public Calendar Worker. The Resource Finder's source table reads calculated availability from sheet-sync's `/v3/search`.
- The public calendar is available at `/calendar/` once the website PR is merged and deployed.

## Deployment order

1. Deploy the latest `integrations/sheets-sync/worker.mjs` from PR #10 to **evonymasters-sheet-sync**. Preserve **DATA**, **SYNC_SECRET**, and the sync endpoint.
2. On the sheet-sync Worker, open **Settings → Bindings → Add → KV namespace** and add **CALENDAR**, pointing at the **existing** `evonymasters-calendar-data` namespace. **Do not create a new KV namespace.** This binding is required for availability column values, global availability sorting and Show Live Only in the Resource Finder. Test `/v4/calendar/catalog`.
3. Deploy the latest `integrations/calendar/worker.mjs` from PR #10 to **evonymasters-calendar**. Keep **CALENDAR**, **ADMIN_EMAILS** and the **CATALOG_SERVICE** service binding to `evonymasters-sheet-sync` intact.
4. Keep the Cloudflare Zero Trust Access application restricted to `/admin*` and `/api/admin/*`, with **Allow → Emails** matching **ADMIN_EMAILS**. Do **not** place `/api/events` behind Access.
5. Ensure a fresh Google Sheets sync occurs *after* deploying the updated sheet-sync Worker. The revised EVENTS **REWARD METHOD** header is mapped to the public **Reward Activity** search column. Older snapshots lacking the field will display a fallback from **ITEM AVAILABILITY**.
6. Sign into `https://evonymasters-calendar.jaynmegepicadventure.workers.dev/admin/`. Verify catalog loading. Save a real or clearly identified test schedule. **Save publishes immediately.** Check that a fresh public `/api/events?from=YYYY-MM-DD&to=YYYY-MM-DD` request returns it. Then pause or delete the test schedule.
7. Test `/v3/search?q=refining%20stone&sort=availability` and `&liveOnly=true` against published schedules. Confirm that **Live** sources sort before **Upcoming** and **Unscheduled**, and that results are sorted before pagination.
8. Merge the PR only after tests, then verify the public website: homepage Live Now, Events cards, Resource Finder, Chest Finder, individual monster guides and Calendar in desktop/mobile browsers.

## Admin workflow

1. Search by event/monster name or unique ID; filter categories and Scheduled/Unscheduled. Families appear **once** by default. Tick **Show individual monster levels** to select specific levels. **Select all** selects all matches to the active filters rather than just the currently visible list.
2. Choose one of the six scheduling modes:
   - **Every day**: no start/end dates and no review date.
   - **Specific dates**: click multiple dates on the UTC picker.
   - **Every weekend**: every Saturday and Sunday in UTC, indefinitely.
   - **Alternate weekends**: select the first active **Saturday** (required), optional final date; repeats every 14 days covering Saturday and Sunday.
   - **Selected weekdays**: choose Sun–Sat weekdays, indefinitely.
   - **Every X days**: select first active date and interval of 2–365 days, with optional final date.
3. Click **Save and publish**. The system derives a schedule title from the records and rule, and updates/replaces previously scheduled selected targets rather than silently creating overlapping duplicates. Dates use Evony server UTC; no separate time fields.
4. In **Manage existing schedules**, edit, pause/resume, unpublish/publish or delete. Errors appear in a dialog. Pause and Unpublish do not delete the schedule.

**Important:** Existing schedule records created with older modes remain readable for backward compatibility, though those modes are no longer offered for new schedules. Review and resave older schedules before removing their legacy settings. A schedule can be published by an admin without independent verification from Evony servers: green **LIVE** means *scheduled as available today in Evony UTC*, not that the game was polled.

## Player-facing changes

- **Resource Finder**: Frequency and Notes / How to Obtain are removed from the main result table. Notes remain under **View reward details**. Event rows show **Activity** and **Reward Activity**, sourced from **REWARD METHOD** in the EVENTS tab, with Reward Activity immediately after Activity. Boss and Box tabs omit those two event columns. Activity dropdown beneath the source tabs is removed. Search headers including Availability sort the full match set; **Show Live Only** filters globally before paging.
- **Events**: Live / upcoming indicators on event cards and a Live Only checkbox.
- **Homepage**: a Live Now section populated by published event and monster rules.
- **Chest Finder**: a source-availability indicator, where linked source records permit one. This is not a guarantee a specific chest will drop.
- **Monster detail pages**: published UTC schedule status, next scheduled date or an unavailable/unscheduled message.
- **Public calendar**: day/week/month/upcoming views and category filtering.

## Public API and security

- **Sync Worker**: `GET /v4/calendar/catalog`; `GET /v3/search?q=...&sort=availability&liveOnly=true`.
- **Calendar Worker**: `GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=all&includeAlways=true`, maximum 93-day interval; private `/api/admin/catalog`, `/api/admin/schedules`, `/api/admin/schedules/:id`.
- Public pages never expose email allowlists, Access identity or the raw schedule KV data. Calendar admin writes require a verified Cloudflare Access identity and an exact email match in `ADMIN_EMAILS`.
- The current KV-based write workflow is intended for a small number of admins. Simultaneous edits can conflict because KV does not offer transactions; consider D1 if concurrent admin work becomes routine.
- Browsers use UTC day boundaries and refresh availability on page load. Live status is based on manually maintained schedules, not a direct connection to the game.
