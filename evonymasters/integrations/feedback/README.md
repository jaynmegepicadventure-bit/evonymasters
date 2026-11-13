# EvonyMasters Feedback Form: Google Backend

**Current status:** GitHub source is ready. The form is intentionally DISABLED until Google Apps Script, Cloudflare Turnstile, and the dedicated Cloudflare feedback Worker are fully configured. Email fallback remains available at contact@evonymasters.com.

No Brevo or R2 subscription is needed for feedback.

## Flow

Visitor fills form on https://www.evonymasters.com/contact/ -> Cloudflare Worker verifies Turnstile and validates files -> Worker forwards securely to a Google Apps Script Web App using a shared secret -> Apps Script logs feedback in a private Google Sheet, stores attachments in a private Google Drive folder, and emails an alert using MailApp/Gmail.

Up to 5 PNG/JPG/WebP/PDF/TXT files, 2 MiB per file, 8 MiB combined. These conservative limits are to keep Apps Script payloads manageable. Users need no Google account.

## Owner setup

1. In Google Drive create a private folder named EvonyMasters Feedback Attachments. Do not share this folder publicly. Copy the folder ID from its URL.
2. In Google Sheets create a private spreadsheet named EvonyMasters Feedback Log. Copy its spreadsheet ID from the URL.
3. Visit https://script.google.com and create a new standalone Apps Script project called EvonyMasters Feedback Receiver.
4. Copy **integrations/feedback/apps-script.gs** into the Apps Script editor. In Project Settings -> Script properties, add:
   - FEEDBACK_FOLDER_ID: private folder ID
   - FEEDBACK_SHEET_ID: private spreadsheet ID
   - FEEDBACK_NOTIFY_EMAIL: the email address that should receive notifications; contact@evonymasters.com if your current routing to Gmail works
   - FEEDBACK_SHARED_SECRET: a new random string with 32+ characters (generate with a password manager). **Do not share this string in chat or commit it in GitHub.**
5. In the Apps Script function picker, run initializeFeedbackSheet once. Approve the requested Google permissions. Then run installFeedbackRetention once, which schedules purgeExpiredFeedback daily to delete Sheet entries after 90 days and move associated Drive attachments to trash. Check that the time-based trigger appears in Apps Script -> Triggers.
6. Under Deploy -> New deployment, select type Web app. Set **Execute as: Me** and **Who has access: Anyone**. Authorize if prompted. Copy the deployment URL ending with /exec. It must be the script.google.com/macros/s/.../exec URL. Never use the /dev URL.
7. In Cloudflare Turnstile, create a widget for hostname **www.evonymasters.com**. Obtain both its public site key and private secret key.
8. Under Cloudflare Workers & Pages create a **new, separate Worker** named **evonymasters-feedback**. Do not overwrite your other three Workers. Replace Worker code with **integrations/feedback/worker.mjs** and deploy.
9. Configure the feedback Worker secrets:
   - TURNSTILE_SECRET: private key from Turnstile
   - APPS_SCRIPT_URL: Google Apps Script /exec deployment URL
   - FEEDBACK_SHARED_SECRET: the exact same private shared secret from Step 4
   Add plain variable TURNSTILE_SITE_KEY with the public Turnstile key.
10. Check https://evonymasters-feedback.jaynmegepicadventure.workers.dev/api/config. It should return enabled:true and the public siteKey after setup. Until then the public Feedback page offers the mailto fallback. The backend verifies hostname www.evonymasters.com on every Turnstile token.
11. Open the live Feedback page and test with a harmless, non-sensitive PNG under 2 MiB. Confirm the on-page receipt, the Sheet row, privately stored Drive attachment, and Gmail notification.
12. In Cloudflare, configure a rate-limit rule for the feedback Worker if your plan supports it (for example 5 submissions per IP per minute). Turnstile limits automated abuse but does not guarantee complete protection.

## Important precautions

- Keep the Google Sheet and Drive folder private to your team; Apps Script runs under your account, but players don't need Google login.
- The Apps Script deployment is publicly reachable, but its actions require the shared secret, which is only stored in Script Properties and the Worker Secret. The web page never receives it.
- Never share Turnstile private key, Gmail access tokens, shared secret, or /exec URL in public logs or screenshots.
- Google Workspace or personal Gmail quotas apply to MailApp. Notification delivery may fail even when storage succeeds. The response warns when the Gmail alert fails. Monitor the Sheet's Email notification column.
- The code checks message and attachments on both the Worker and Apps Script sides. This is an abuse-resistant starting implementation, not a substitute for production monitoring.
- Google Apps Script has execution and request-size limits; the 2 MiB/8 MiB settings reduce the chance of hitting them but do not guarantee acceptance. Test with different numbers and sizes of files.
- The cleanup removes the log row and trashes files after 90 days. Google Drive trash retention may outlast the 90-day period. Owners can empty trash earlier if appropriate.
- When changing Apps Script code after deployment, create a new version and update the deployment to use the new version. Saving code alone may not update the live web app.
- Until a full live form + attachment + notification test passes, do not tell visitors their messages are being received.
