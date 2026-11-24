# Chest Finder same-origin gateway

The public Chest Finder currently fetches the separate sheet-sync Worker across origins. Some Safari sessions report `browser network request failed` even when the remote Worker returns HTTP 200 to other browsers.

This is a **Cloudflare Worker route** for the existing Cloudflare Worker-hosted website, **not a Pages Function**. This change cannot activate itself through a GitHub merge. The Cloudflare account owner must deploy and attach it.

## Install in Cloudflare

1. In Cloudflare > Workers & Pages, create a Worker named `evonymasters-chest-gateway` and deploy the contents of `worker.mjs`.
2. Under that Worker's **Settings > Bindings**, add a **Service binding** named `SHEET_SYNC` targeting the existing `evonymasters-sheet-sync` Worker. No secret is needed in the site.
3. Under **Settings > Domains & Routes**, add Worker routes `www.evonymasters.com/api/chests*` and `evonymasters.com/api/chests*`. They must belong to the Cloudflare-proxied `evonymasters.com` zone. Do not replace the website Worker or override its other routes.
4. Test `https://www.evonymasters.com/api/chests?q=Lumber&page=0` and `https://www.evonymasters.com/api/chests/events`. Both must return JSON, not the website's 404 HTML. Also test the apex-domain path.
5. Once the gateway is routed, refresh Chest Finder. It tries the same-origin gateway first, remembers successful discovery for the page session, and uses the existing direct endpoint as a fallback when this route is not installed.

The gateway allows only three GET routes and forwards only approved paths and query parameters to the existing public API. It doesn't bypass the data Worker's search validation, authenticate sheet uploads, or expose the private workbook. The gateway uses a Cloudflare service binding to avoid Worker-to-Worker network restrictions.

## Limitations

This mitigates browser cross-origin connection failures. It will not fix a genuine outage of the sheet-sync Worker's KV store, CPU, or rate limits. Cloudflare deployment and runtime must be separately verified before declaring the change live.

Cloudflare Workers routes docs: https://developers.cloudflare.com/workers/configuration/routing/routes/
Cloudflare service bindings docs: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
