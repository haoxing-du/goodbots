# Later: fix once the site is real

Known limits that are fine at MVP scale but worth revisiting once GoodBots has real traffic. Roughly in priority order within each section.

## Speed

Most of these compute on read what could be stored and updated in the same mutations, like `versionStats` already is.

- **Taste match** is recomputed on every page view. Each review card loads the viewer's scores and each author's scores (`matcherFor` / `scoreMapFor` in `convex/lib.ts`). Store per-pair matches in a `tasteMatches` table updated on review write, as the spec allows.
- **"Reviewers like you"** (`users.reviewersLikeYou`) scans every reviewer of every version the viewer reviewed.
- **`homeStats`** reads all `versionStats`, `axisStats` for each core axis, every review from the last 7 days, and every `reviewScores` row of each popular custom axis (to count distinct raters). Keep a `raterCount` on `axes` and weekly counts per version.
- **"Top this week"** (`reviews.feedTop`) collects every reaction from the last 7 days and tallies in memory, capped at the top 50. It needs a stored weekly score and real pagination.
- **Review cards** each load all their reactions to count them. Store per-kind counts on the review.
- **`reviews.forWrite`** looks up your latest entry for every review you've written.
- **`models.list`** makes two queries per version, and **search** scans all versions in memory. Both are fine for dozens of models, not thousands.
- **Profiles** show every rating and only the latest 20 takes, with no "load more".

## Abuse and rate limits

- **No rate limits** on reviews, reactions, takes, model requests, or magic-link emails (each one costs a Resend send). [`@convex-dev/rate-limiter`](https://www.convex.dev/components/rate-limiter) fits.
- You can **react to your own review**.
- The write form lists **every axis anyone has rated**, including ones only one person has used (a deliberate choice for now). As the list grows, show only popular axes and tuck the rest behind "More axes", or require a few raters, as the homepage already does (3).
- The **profanity filter** (`obscenity`) misses spaced-out letters ("f u c k") and flags some names ("Dick Van Dyke"). Review text isn't filtered, by design.
- There's no **report/flag** button. Admins can hide axes and delete reviews/takes, but have no way to hear about problems.
- **Link-preview crawler detection** in `middleware.ts` is a user-agent regex; add crawlers as they show up.

## Model catalog

- **OpenRouter terms:** the sync calls the documented `/api/v1/models` endpoint with an API key and stores only basic facts (id, name, provider, dates), crediting OpenRouter in the picker. Their terms don't expressly license republishing the list (only the separate CC BY 4.0 Data API is), which we've accepted for now. If that changes, the fallback is the CC BY rankings data plus manual adds.
- **Open-weight coverage:** OpenRouter lists the popular open models, not the long tail of Hugging Face fine-tunes. A Hugging Face source could be added to the same `catalog` table (there's already an `hfId` field).
- **"Latest" aliases** (`~anthropic/claude-opus-latest` etc.) are filtered out today; they could power "I used ChatGPT → which version is that?" suggestions.
- **No alert if the sync breaks** (OpenRouter changes its format or is down). The action logs and throws; add monitoring.
- **Deprecated models** keep their pages (by design) but aren't marked as retired anywhere yet (`deprecatedAt` is stored).
- Unreviewed catalog pages (`/m/<id>` for a model with no reviews) are served to crawlers with no preview metadata.

## Product leftovers

- **Hidden axes still count toward taste match** (their scores are kept).
- **Changing your handle breaks links** to your old profile URL. Keep old handles as redirects.
- The homepage text box **only auto-grows in Chromium** (`field-sizing: content`). Safari and Firefox keep it at 3 lines.
- **Rankings have no minimum review count.** A version with one 5★ review can outrank one with hundreds (deferred on purpose).
- **Star filters and "Overall best"** only count reviews that include overall stars, which are now optional.
- If a new axis is **rejected on post** (filter or daily cap), it stays in your draft until you click Remove.
- **Seed data** dates are relative to when `seed:run` ran, so "this week" numbers go stale in a long-lived dev database. Reseed.

## Launch checklist (not code)

- Resend: API key (`AUTH_RESEND_KEY`) and a verified sending domain (`AUTH_EMAIL_FROM`).
- X developer app and `AUTH_TWITTER_ID` / `AUTH_TWITTER_SECRET` on the production deployment.
- Vercel env: `CONVEX_DEPLOY_KEY` and `CONVEX_SITE_URL`. Then check a shared link in X's and LinkedIn's post inspectors.
- `ADMIN_EMAILS` set to real admin addresses. Never set `DEMO_LOGIN` in production.
