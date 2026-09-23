# GoodBots

Like Goodreads, but for our AIs.

GoodBots is a review site for specific LLM versions. Rate a model on whatever you care about: four built-in axes (Smarts, Taste, Vibes, Aligned) plus any you add yourself, like "Design" or "Dessert recipes". Write an opinionated review, post "A > B" head-to-head takes, react to other people's reviews, and find reviewers whose taste matches yours. It is not a benchmark site.

## Features

- **Rate on anything:** four core axes, plus custom axes anyone can add while reviewing. Only the text is required; overall stars and every axis are optional.
- **Model pages:** average score on each axis, 1–5 distributions, an "Also rated on" list of custom axes, head-to-head win rates against each opponent, and reviews filterable by star rating.
- **Reviews:** one per person per model version. Reviewing again adds a dated update, and your profile keeps the history.
- **No anchoring:** the review form hides community scores until you post, then shows how your scores compare.
- **Taste match:** once you and another reviewer share 3+ reviewed versions, their reviews show a match %: `100 × (1 − mean |score difference| / 4)`.
- **Reactions:** Agree, Disagree, Useful, Hot take, Lol.
- **Every model:** the catalog mirrors OpenRouter's model list (300+ models, refreshed every 6 hours), so almost anything can be reviewed right away; a model gets its page on its first review. Anything missing can be requested. Admins can merge duplicate models and hide or merge custom axes.
- **Sign-in:** email magic link or X. Browsing needs no account.

## Stack

React + TypeScript + Vite, with [Convex](https://convex.dev) for the database, server functions and realtime updates, and [Convex Auth](https://labs.convex.dev/auth) for sign-in.

## Quick start

```sh
npm install
npx convex dev            # log in and create a deployment; leave it running
node scripts/generateKeys.mjs
npx convex env set SITE_URL http://localhost:5173
npx convex env set DEMO_LOGIN true
npx convex run seed:run   # sample models, reviewers, reviews and takes
npx vite                  # in a second terminal
```

To sign in locally without setting up email, use the "Local dev: sign in as the demo reviewer" option, or enter any email and open the magic link printed in the `convex dev` terminal.

[`SETUP.md`](SETUP.md) covers environment variables, email and X setup, and deploying to Convex + Vercel.

## Docs

- [`docs/SPEC.md`](docs/SPEC.md): product rules, data model, scope
- [`docs/DESIGN.md`](docs/DESIGN.md): design handoff (layout, tokens, behavior)
- [`docs/PROMPT.md`](docs/PROMPT.md): the prompt the MVP was built from
- [`docs/LATER.md`](docs/LATER.md): known limits to fix once there's real traffic (speed, rate limits, leftovers)

## License

[MIT](LICENSE)
