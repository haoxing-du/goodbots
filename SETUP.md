# GoodBots — setup & deploy

React + TypeScript + Vite frontend, Convex backend (database, functions, realtime) and Convex Auth with email magic-link and X sign-in.

```
convex/            backend
  schema.ts        tables (users, models, versions, reviews, reviewEntries, reactions,
                   takes, modelRequests, versionStats)
  auth.ts          Convex Auth: email magic link, X (Twitter), local-only demo sign-in
  magicLink.ts     magic-link email provider (Resend; logs the link when no key is set)
  lib.ts           auth helpers, ADMIN_EMAILS check, versionStats upkeep, taste match
  reviews.ts       upsert (review + dated entry + stats in one mutation), feed, model reviews
  models.ts        model list, model page (stats, head-to-head)
  users.ts         profile, reviewers like you
  takes.ts, reactions.ts, requests.ts, admin.ts, search.ts
  catalog.ts       OpenRouter model-list sync (catalog table); crons.ts runs it every 6 hours
  seed.ts          seed:run / seed:reset
src/
  theme.css        all design tokens
  components/      TopBar, SignIn dialog, Pills, Reactions, Stars/MatchChip/Avatar…
  pages/           Home, Models, ModelPage, WriteReview, Profile, RequestModel, Admin, Search
scripts/generateKeys.mjs   creates the JWT keys Convex Auth needs
middleware.ts   Vercel edge middleware: Open Graph tags for link-preview crawlers
api/og.ts       Vercel edge function: the 1200×630 link-preview image (layout in api/_og-tree.ts)
```

Routes: `/`, `/reviews`, `/models`, `/m/:provider/:model` (one page per model, ids like `anthropic/claude-opus-4.1`), `/r/:reviewId` (one review, for sharing), `/write?v=:versionId`, `/u/:handle`, `/request`, `/admin`, `/search?q=`.

## Local setup

Requires Node 20+.

```sh
npm install
npx convex dev          # first run: log in / create a project (or pick a local deployment)
```

Leave `convex dev` running; it writes `VITE_CONVEX_URL` to `.env.local`. In a second terminal:

```sh
node scripts/generateKeys.mjs                       # sets JWT_PRIVATE_KEY + JWKS
npx convex env set SITE_URL http://localhost:5173
npx convex env set DEMO_LOGIN true                  # optional: sign in without OAuth keys
npx convex env set ADMIN_EMAILS demo@goodbots.local # optional: demo user can use /admin
npx convex run seed:run                             # 7 models, 41 reviewers, 144 reviews, takes, reactions
npx convex env set OPENROUTER_API_KEY sk-or-...     # for the model-catalog sync
npx convex run catalog:sync                         # optional: fill the model catalog now (the cron also runs it)
npx vite
```

Open http://localhost:5173. `npm run dev` runs Vite and `convex dev` together once the setup above is done.

**Signing in locally, no keys needed:**
- **Email magic link:** enter any address. Without `AUTH_RESEND_KEY`, no email is sent. The link is printed in the `npx convex dev` terminal (`[magic link] Sign-in link for …`); open it in the same browser.
- **Demo reviewer:** with `DEMO_LOGIN=true`, dev builds also offer "Local dev: sign in as the demo reviewer". The demo reviewer has reviewed 4 versions, so taste-match chips and "Reviewers like you" show up. Never set `DEMO_LOGIN` on a production deployment.

To start the data over: `npx convex run seed:reset && npx convex run seed:run`. Reset removes all app data and the seeded users, and keeps real accounts.

Typecheck: `npm run typecheck`. Production build: `npm run build`.

## Environment variables

All of these are set on the **Convex deployment** (`npx convex env set NAME value`, or in the dashboard). None go in the frontend.

| Variable | Purpose |
|---|---|
| `JWT_PRIVATE_KEY`, `JWKS` | Convex Auth signing keys. Create with `node scripts/generateKeys.mjs` (it sets them on the current deployment). |
| `SITE_URL` | Where the frontend lives; OAuth redirects back here. `http://localhost:5173` locally, your Vercel URL in prod. |
| `AUTH_RESEND_KEY` | [Resend](https://resend.com) API key for sending magic links. Unset = links are logged instead of emailed (local dev only). |
| `AUTH_EMAIL_FROM` | Sender, e.g. `GoodBots <login@yourdomain.com>`. The domain must be verified in Resend. Defaults to `GoodBots <onboarding@resend.dev>`, Resend's test sender, which can only deliver to your own Resend account's address. |
| `AUTH_TWITTER_ID`, `AUTH_TWITTER_SECRET` | X OAuth 2.0 client. |
| `OPENROUTER_API_KEY` | OpenRouter API key for the model-catalog sync (`catalog:sync`, every 6 hours). Listing models is free; any key from openrouter.ai → Keys works. |
| `ADMIN_EMAILS` | Comma-separated emails allowed to use `/admin`. Matched against the signed-in user's email, so admins sign in with the email link (X doesn't share email). |
| `DEMO_LOGIN` | `true` enables the local demo sign-in. Dev only. |

The frontend needs only `VITE_CONVEX_URL`. `convex dev` writes it to `.env.local` locally; on Vercel it's set by the deploy command below.

### Email (Resend)

1. Create a Resend account and an API key, then set `AUTH_RESEND_KEY`.
2. For real users, verify a domain you own in Resend (it gives you DNS records to add), then set `AUTH_EMAIL_FROM` to an address on it. Until then, the default test sender only delivers to your own Resend account's address, which is fine for trying it out.

Magic links point back to `SITE_URL` (the page you signed in from) and expire after 1 hour.

### X (Twitter)

At [developer.x.com](https://developer.x.com/en/portal/dashboard), go to your app's User authentication settings and enable OAuth 2.0 with type "Web App". The callback URI is your Convex **HTTP actions** URL (ends in `.convex.site`; dashboard → Settings → URL & Deploy Key) plus the provider path: `https://<deployment>.convex.site/api/auth/callback/twitter`. Use the OAuth 2.0 Client ID and Secret, not the API key.

Dev and prod deployments have different `.convex.site` URLs, so register both callbacks (or use separate X apps).

## Deploy (Convex + Vercel)

1. **Convex production deployment.** In the Convex dashboard, open your project's Production deployment and set the env vars above (`SITE_URL` = your Vercel URL). Run `generateKeys.mjs` against prod: `CONVEX_DEPLOY_KEY=<prod key> node scripts/generateKeys.mjs`, or paste the values into the dashboard. Don't set `DEMO_LOGIN`.
2. **Deploy key.** Dashboard → Production → Settings → generate a **Production deploy key**.
3. **Vercel.** Import the repo, framework preset **Vite**, then:
   - Build command: `npx convex deploy --cmd 'npm run build'`
   - Output directory: `dist`
   - Environment variables:
     - `CONVEX_DEPLOY_KEY` = the production deploy key
     - `CONVEX_SITE_URL` = the production deployment's HTTP actions URL (`https://<deployment>.convex.site`). The link-preview middleware uses it; without it, shared links fall back to the site-wide preview.

   `convex deploy` pushes the backend, then runs the frontend build with `VITE_CONVEX_URL` pointing at production.
4. **SPA routing.** `vercel.json` rewrites every path except `/api/*` to `index.html` so deep links like `/m/claude-opus-4-1` work.
   **Link previews:** when X, Slack, iMessage and similar crawlers fetch `/`, `/m/…`, `/u/…` or `/r/…`, `middleware.ts` asks Convex (`GET <CONVEX_SITE_URL>/meta?path=…`) for the page's title and description and adds Open Graph/Twitter tags pointing at `/api/og?…` for the image. Regular visitors aren't affected. Check with X's or LinkedIn's post inspector after deploying.
5. **Seed (optional).** To load the demo data into prod: `npx convex run seed:run --prod`. Or start empty and add models from `/admin`.
