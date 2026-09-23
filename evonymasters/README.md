# evonymasters — Monster Finder

Independent fan-made Evony: The King's Return monster reference. **The starter contains no unverified monster records or copyrighted game images.** Until data is entered, the site displays a clear empty state.

## Local development

Requires Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Open the localhost URL shown in your terminal. `npm run validate:data && npm test && npm run check && npm run build` runs the same checks as CI.

## Data model and search

- `db/001_schema.sql` creates `items`, `events`, `monsters`, and `monster_rewards` with constraints and RLS enabled.
- `db/002_seed_items.sql` seeds an initial item vocabulary; expand it as real data is verified.
- `src/data/monsters.json` is the **reviewed public export** used by the static site. No database keys are shipped to visitors.
- The browser searches this JSON locally and supports monster-name/event keyword matching, reward and monster-type filters, name/stamina/power sorting, and suggestions.
- Guaranteed and possible rewards are rendered separately. Unknown stats must be `null`, not guessed.

### Monster JSON shape

```json
{
  "id": "verified-monster-slug",
  "name": "Verified monster name",
  "type": "Boss",
  "level": null,
  "power": null,
  "stamina": null,
  "image": null,
  "event": null,
  "updatedAt": null,
  "rewards": [
    {"itemId":"wood","quantity":null,"unit":null,"kind":"possible","notes":null}
  ]
}
```

Only publish sourced game facts. `image` should be a locally hosted, rights-cleared path such as `/monsters/example.webp`; verify publisher fan-content terms before adding game artwork. `possible` means not guaranteed, not a claimed drop probability. Preserve source URLs and verification dates in PostgreSQL.

## Supabase setup (optional until editorial workflow is needed)

1. Create a free Supabase project.
2. In SQL Editor, run `db/001_schema.sql`, then `db/002_seed_items.sql`.
3. Add verified monster rows and reward rows through SQL Editor or a trusted import script.
4. Export approved records into `src/data/monsters.json` using a local, server-side script (to be added once data entry begins), review the JSON, then commit it. **Never** expose `DATABASE_URL`, service-role keys or the Supabase admin API to the frontend.
5. Keep RLS enabled and do not add anonymous write policies. Back up data exports independently.

The SQL schema is ready; automated database-to-JSON export is intentionally not implemented yet because the data-entry workflow and credentials have not been chosen.

## GitHub setup

```bash
git init
git add .
git commit -m "Initial evonymasters monster finder"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/evonymasters.git
git push -u origin main
```

Create the **empty** GitHub repository before adding `origin`. The workflow at `.github/workflows/ci.yml` validates data, tests search, type-checks Astro and builds on pushes and PRs. Never commit `.env`.

## Cloudflare Pages setup

1. In Cloudflare Dashboard, go to **Workers & Pages → Create → Pages → Connect to Git** and authorize the GitHub repository.
2. Select `evonymasters`; framework preset **Astro** (or configure manually).
3. Build command: `npm run build`; output directory: `dist`; Node.js version: `22` (set environment variable `NODE_VERSION=22` if necessary).
4. Deploy. Cloudflare supplies a `*.pages.dev` URL and preview deployments for pull requests.
5. Optionally configure a custom domain later. Set `SITE_URL` to the production URL if using canonical URLs in future.

GitHub Actions performs CI; Cloudflare's Git integration performs deployment on pushes to `main` and generates previews. Do **not** also add a second deployment action unless you deliberately switch deployment strategies.

## Next development milestones

1. Source and verify the first monster batch, reward types, power and stamina, and image permissions.
2. Build a trusted database-to-JSON export with review and provenance fields.
3. Expand reward categories and optionally add filters for level, event availability and guaranteed-versus-possible rewards.
4. Add monster detail pages and a contribution/correction process.

Not affiliated with or endorsed by the game's publisher.
