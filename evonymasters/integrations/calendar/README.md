# EvonyMasters Event Calendar

The calendar is a **separate Cloudflare Worker** from the existing website and Google Sheets sync Worker. It has a public read-only endpoint, and a Cloudflare Access-protected editor. No calendar dates have been invented or preloaded.

## What to deploy

- Source: `evonymasters/integrations/calendar/worker.mjs`
- Worker name: `evonymasters-calendar`
- Intended URL: `https://evonymasters-calendar.jaynmegepicadventure.workers.dev`
- KV binding: `CALENDAR` (create a new KV namespace; do not reuse `DATA` from `evonymasters-sheet-sync`)
- Environment variable: `ADMIN_EMAILS` (comma-separated list of the **exact** approved login emails, e.g. `you@example.com,editor@example.com`; do not use a broad email domain)
- This calendar Worker does **not** need your existing Google Apps Script `SYNC_SECRET`.

## Login configuration (required)

The code never accepts an unprotected client-side password. Admin requests require Cloudflare's authenticated `ctx.access` object and a matching `ADMIN_EMAILS` entry. The Worker denies admin access if either is missing.

1. In the Cloudflare dashboard, enable Zero Trust / Access.
2. Create a **self-hosted Cloudflare Access application** for the calendar Worker hostname. Protect the paths `/admin*` **and** `/api/admin/*`. Confirm both routes are covered. Use a policy including only approved editor email addresses or users.
3. Do **not** protect the entire calendar Worker hostname if you want its public `/api/events` endpoint accessible to all visitors.
4. Bind the newly created `CALENDAR` KV namespace and set `ADMIN_EMAILS` in the calendar Worker's Settings.
5. Deploy the calendar Worker code. Use the Cloudflare Access-protected URL `https://evonymasters-calendar.jaynmegepicadventure.workers.dev/admin/` to sign in.
6. Enter an event's name, start/end dates (inclusive, in **UTC / Evony server time**), optional UTC clock times, category, confidence and source. Use **Draft** for unverified events. Publish only when the dates are confirmed or clearly labelled tentative.
7. Visit the public `/calendar/` route on the website and verify the event appears in day/week/month/upcoming views. Check draft entries remain invisible to the public API.
8. Keep the separate Google Sheets `evonymasters-sheet-sync` Worker unchanged. Event schedule dates are managed in the calendar admin UI, not inferred from reward data.

Access configuration reference: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/
Worker authentication context: https://developers.cloudflare.com/workers/configuration/cloudflare-access/

## Endpoints

- `GET /api/events`: public, only published entries, start-date ascending. Enables CORS only for EvonyMasters' website origin.
- `GET /admin/`: authenticated editor, served by this Worker.
- `GET /api/admin/events`: authenticated read including drafts.
- `POST /api/admin/events`: authenticated add.
- `PUT /api/admin/events/:id`: authenticated edit / publish / unpublish.
- `DELETE /api/admin/events/:id`: authenticated delete.

Event fields: `name`, `startDate`, `endDate`, `startTime`, `endTime`, `category` (Event/Boss/Activity), `status` (Confirmed/Tentative), `published` (boolean), `notes`, `sourceUrl` (HTTPS URL), and optional `eventKey` used to link to reward guides. Only admins can write. Date formats use `YYYY-MM-DD`; times use `HH:MM` UTC.

## Important operational considerations

- Because calendar entries live in KV, this initial admin system is intended for **low-frequency editing by a small number of admins**. KV is eventually consistent and simultaneous editors could overwrite changes. For a multi-editor/high-frequency operation, migrate to D1 with transaction/version control.
- Cloudflare Access and the `ADMIN_EMAILS` allowlist **must both be configured**. Do not deploy without testing unauthenticated requests. Enabling Access on the whole Worker would make the public schedule unreadable.
- This implementation is deliberately independent of the `EVENTS` reward sheet. It does not assume events run on specific days or repeat according to their reward `FREQUENCY` field. Add one occurrence per confirmed run.
- The calendar's public UI can be deployed before this Worker; until the Worker exists, it displays a temporary-unavailable message rather than inventing dates.
- The site is built as static Astro pages. The admin editor is served from the calendar Worker's own hostname so its authenticated API and browser session share the same origin.
