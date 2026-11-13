// EvonyMasters Feedback API. Deploy as a separate Cloudflare Worker.
// Bind an R2 bucket called SUBMISSIONS. Set TURNSTILE_SECRET, BREVO_API_KEY,
// ADMIN_TOKEN and MAIL_FROM via Worker Secrets; never commit credentials.
const ORIGIN = "https://www.evonymasters.com";
const MAX_FILE = 5 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024;
const MAX_REQUEST = 21 * 1024 * 1024;
const TYPES = new Map([
  ["image/png", ".png"], ["image/jpeg", ".jpg"], ["image/webp", ".webp"],
  ["application/pdf", ".pdf"], ["text/plain", ".txt"]
]);
const CATEGORIES = new Set(["data", "bug", "idea", "question", "other"]);
const encoder = new TextEncoder();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...headers
  }});
const cors = origin => origin === ORIGIN ? {
  "access-control-allow-origin": ORIGIN, "vary": "Origin",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "600"
} : {};
const clean = (v, max) => String(v || "").trim().slice(0, max);
const emailValid = email => !email || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200);
const isReady = env => Boolean(env.SUBMISSIONS && env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY && env.BREVO_API_KEY && env.MAIL_FROM && env.ADMIN_TOKEN);
const allowedHost = request => {
  const u = new URL(request.url);
  return u.protocol === "https:" && (u.hostname.endsWith(".workers.dev") || u.hostname === "feedback.evonymasters.com");
};
function safeEqual(a, b) {
  const x = encoder.encode(a), y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function authorize(request, env) {
  const auth = request.headers.get("authorization") || "";
  const expected = env.ADMIN_TOKEN || "";
  return expected.length >= 24 && safeEqual(auth, "Bearer " + expected);
}
async function verifyTurnstile(token, request, env) {
  if (!token || token.length > 2048) return false;
  const payload = new FormData();
  payload.set("secret", env.TURNSTILE_SECRET);
  payload.set("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) payload.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: payload });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true && result.hostname === "www.evonymasters.com";
  } catch { return false; }
}
async function sendNotification(entry, env) {
  const summary = [
    "New EvonyMasters feedback: " + entry.id,
    "Category: " + entry.category,
    "Player name: " + (entry.name || "Not provided"),
    "Reply email: " + (entry.email || "Not provided"),
    "Page: " + (entry.page || "Not provided"),
    "Attachments: " + entry.files.map(f => f.name).join(", "),
    "",
    "Message:",
    entry.message,
    "",
    "Attachments are stored privately in R2, not attached to this notification.",
    "Retrieve them through the protected feedback admin API. See README."
  ].join("\n");
  const payload = {
    sender: { name: "EvonyMasters Feedback", email: env.MAIL_FROM },
    to: [{ email: env.MAIL_TO || "contact@evonymasters.com" }],
    subject: "EvonyMasters feedback: " + entry.category + " (" + entry.id.slice(0, 8) + ")",
    textContent: summary
  };
  if (entry.email) payload.replyTo = { email: entry.email };
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": env.BREVO_API_KEY, "accept": "application/json" },
    body: JSON.stringify(payload)
  });
  return response.ok;
}
async function submit(request, env) {
  if (request.headers.get("origin") !== ORIGIN) return json({ error: "Origin not permitted" }, 403);
  if (!isReady(env)) return json({ error: "Feedback is not available yet. Please use email for now." }, 503);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_REQUEST) return json({ error: "Upload is too large (20 MB total)." }, 413);
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data;")) return json({ error: "Invalid submission format." }, 415);
  let body;
  try { body = await request.formData(); } catch { return json({ error: "Unable to read the submission." }, 400); }
  const category = clean(body.get("category"), 40);
  const name = clean(body.get("name"), 100);
  const email = clean(body.get("email"), 200);
  const page = clean(body.get("page"), 300);
  const message = clean(body.get("message"), 4000);
  const hp = clean(body.get("website"), 100);
  if (hp) return json({ error: "Submission rejected." }, 400);
  if (!CATEGORIES.has(category) || message.length < 15 || message.length > 4000 || !emailValid(email))
    return json({ error: "Please choose a category and enter a message of at least 15 characters. Check your email address if provided." }, 400);
  const files = body.getAll("files").filter(v => typeof v !== "string" && v && v.size > 0);
  if (files.length > 5) return json({ error: "You may attach up to 5 files." }, 400);
  let sum = 0;
  for (const f of files) {
    sum += f.size;
    if (f.size > MAX_FILE || !TYPES.has(f.type) || !/^[\p{L}\p{N} ._()\-]+$/u.test(f.name.slice(0, 160)))
      return json({ error: "Use PNG, JPG, WebP, PDF or TXT files, up to 5 MB each, with simple filenames." }, 400);
  }
  if (sum > MAX_TOTAL) return json({ error: "Maximum total attachment size is 20 MB." }, 413);
  if (!await verifyTurnstile(clean(body.get("cf-turnstile-response"), 2048), request, env))
    return json({ error: "Security check failed or expired. Please try again." }, 403);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const entry = { id, createdAt: now, category, name, email, page, message, files: [] };
  const created = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i], extension = TYPES.get(f.type);
      const key = "files/" + id + "/" + i + extension;
      await env.SUBMISSIONS.put(key, f, {
        httpMetadata: { contentType: f.type, contentDisposition: "attachment" },
        customMetadata: { submission: id }
      });
      created.push(key);
      entry.files.push({ key, name: f.name.slice(0, 160), contentType: f.type, size: f.size });
    }
    await env.SUBMISSIONS.put("submissions/" + id + ".json", JSON.stringify(entry), {
      httpMetadata: { contentType: "application/json" }
    });
  } catch {
    await Promise.all(created.map(key => env.SUBMISSIONS.delete(key).catch(() => {})));
    return json({ error: "We could not securely save your feedback. Please try again." }, 503);
  }
  let notified = false;
  try { notified = await sendNotification(entry, env); } catch { /* Entry remains safely stored */ }
  return json({ ok: true, id, emailNotified: notified }, 201);
}
async function admin(request, env, url) {
  if (!authorize(request, env)) return json({ error: "Not authorized" }, 401, { "www-authenticate": "Bearer" });
  if (!env.SUBMISSIONS) return json({ error: "R2 storage binding missing" }, 503);
  if (url.pathname === "/api/admin/submissions") {
    const items = await env.SUBMISSIONS.list({ prefix: "submissions/", limit: 100 });
    const results = await Promise.all(items.objects.map(async x => {
      const o = await env.SUBMISSIONS.get(x.key);
      if (!o) return null;
      const e = await o.json();
      return { id: e.id, createdAt: e.createdAt, category: e.category, name: e.name, email: e.email, attachmentCount: e.files.length };
    }));
    return json({ submissions: results.filter(Boolean), truncated: items.truncated });
  }
  const match = url.pathname.match(/^\/api\/admin\/submissions\/([0-9a-f-]{36})(?:\/files\/([0-4]))?$/);
  if (!match) return json({ error: "Not found" }, 404);
  const obj = await env.SUBMISSIONS.get("submissions/" + match[1] + ".json");
  if (!obj) return json({ error: "Not found" }, 404);
  const entry = await obj.json();
  if (match[2] === undefined) return json(entry);
  const f = entry.files[Number(match[2])];
  if (!f) return json({ error: "File not found" }, 404);
  const file = await env.SUBMISSIONS.get(f.key);
  if (!file) return json({ error: "File not found" }, 404);
  return new Response(file.body, { headers: {
    "content-type": "application/octet-stream",
    "content-disposition": 'attachment; filename="attachment-' + match[2] + TYPES.get(f.contentType) + '"',
    "x-content-type-options": "nosniff", "cache-control": "no-store"
  }});
}
export default {
  async fetch(request, env) {
    if (!allowedHost(request)) return json({ error: "Invalid host" }, 400);
    const url = new URL(request.url), origin = request.headers.get("origin") || "";
    if (url.pathname.startsWith("/api/admin/")) {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      try { return await admin(request, env, url); } catch { return json({ error: "Admin request failed" }, 500); }
    }
    if (origin && origin !== ORIGIN) return json({ error: "Origin not permitted" }, 403);
    const headers = cors(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname === "/api/config" && request.method === "GET")
      return json({ enabled: isReady(env), siteKey: isReady(env) ? env.TURNSTILE_SITE_KEY : null }, 200, headers);
    if (url.pathname === "/api/feedback" && request.method === "POST") {
      try {
        const response = await submit(request, env);
        const h = new Headers(response.headers);
        for (const [k, v] of Object.entries(headers)) h.set(k, v);
        return new Response(response.body, { status: response.status, headers: h });
      } catch { return json({ error: "Feedback service failed. Please try again." }, 500, headers); }
    }
    return json({ error: "Not found" }, 404, headers);
  }
};
