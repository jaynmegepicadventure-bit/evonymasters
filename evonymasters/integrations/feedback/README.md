# EvonyMasters feedback form deployment

**Status: GitHub source prepared, not live until its own Cloudflare Worker and secrets are configured.** The page displays the email fallback until the backend is ready.

## What it does

The contact page on https://www.evonymasters.com/contact/ sends requests to the separate Worker named evonymasters-feedback. The Worker verifies Cloudflare Turnstile server-side, validates five file uploads, stores the message and files in a private R2 bucket, and sends a notification to the contact mailbox using Brevo. This is not a public upload bucket. The existing mailto link is retained.

## Setup, in this order

1. In Cloudflare R2, create a **private bucket** named evonymasters-feedback-private. Do NOT enable public access. Configure a bucket lifecycle rule that deletes all objects after 90 days. Both private submission records and uploaded files belong in this bucket.
2. In Cloudflare Turnstile, create a widget accepting **www.evonymasters.com**. Obtain the public site key and private secret key. Use real keys, not testing keys.
3. Under Workers & Pages, create a **new, separate Worker** named evonymasters-feedback. Do not replace the existing site Worker, Calendar Worker or Sheet Sync Worker. Paste the code from integrations/feedback/worker.mjs and deploy.
4. Add a Cloudflare R2 binding with variable name **SUBMISSIONS**, selecting the evonymasters-feedback-private bucket.
5. Add Worker secrets: **TURNSTILE_SECRET** (private Turnstile key), **BREVO_API_KEY** (transactional email API key, not SMTP key), **ADMIN_TOKEN** (a cryptographically random 32+ character value stored in a password manager), and **MAIL_FROM** (verified sender in Brevo). Optionally add **MAIL_TO** (defaults to contact@evonymasters.com).
6. Add Worker plain variable **TURNSTILE_SITE_KEY**, the public Turnstile key. Only this key is meant to be exposed to the browser.
7. Ensure Brevo is authorized to send transactional emails from MAIL_FROM and that messages to contact@evonymasters.com arrive correctly. An accepted Brevo request does not guarantee inbox delivery.
8. Visit https://evonymasters-feedback.jaynmegepicadventure.workers.dev/api/config and check that it reports enabled:true. When incomplete, it reports enabled:false, and the contact page offers email instead of enabling a broken form.
9. Open https://www.evonymasters.com/contact/ and submit a harmless test message with a simple PNG image. Confirm the reference number, check private R2 storage, and check the notification email.
10. Add a rate-limit rule for POST /api/feedback where available, and monitor usage and spam. Turnstile reduces automated abuse but does not guarantee none.

Never send private keys or admin tokens in a chat or commit them to GitHub. Do not expose the R2 bucket publicly.

## Form limits and storage

Up to five attachments, maximum 5 MiB each and 20 MiB combined. Accepted media types: PNG, JPG, WebP, PDF and TXT. Message length 15–4000 characters. Contact name and email are optional and only used to handle the submitted message. Request size is bounded by the Worker and hosting limits. Do not submit game credentials, passwords or private information.

Set the 90-day deletion lifecycle rule before enabling the system. Do not reuse player submissions for marketing or publish questions without permission.

## Protected submission retrieval

These endpoints are available to a private HTTP client that passes Authorization: Bearer <ADMIN_TOKEN>. Never call them from public frontend JavaScript.

- GET /api/admin/submissions returns up to 100 submission summaries. If truncated, use R2's dashboard for older objects; pagination is a future improvement.
- GET /api/admin/submissions/{id} returns one private JSON submission.
- GET /api/admin/submissions/{id}/files/{index} downloads an attached file (index 0 through 4).

If saving fails, visitors receive an error and no success confirmation. If R2 saves the record but Brevo fails, the response reports a stored submission and warns that the notification is pending. Review R2 periodically, because email notification retries are not automated in this version.

## Scope

The Astro website remains statically hosted. Feedback is handled by a separate Worker and private R2 bucket. No Cloudflare infrastructure has been created or deployed by this GitHub change.