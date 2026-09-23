Build the GoodBots MVP in this directory: a Goodreads/Yelp-style site where people review specific LLM versions.

Read first:
- README.md — full design handoff (screens 4a–4d, exact tokens, behaviors).
- SPEC.md — product rules, Convex data model, scope. Anything "out of scope" stays out.
- design/GoodBots Screens.dc.html — open in a browser for the interactive visual reference. Rebuild it; don't port its runtime.

Stack: Convex (DB, queries, mutations, realtime) + Convex Auth with Google and X OAuth; React + TypeScript + Vite + React Router. Put the design tokens in one theme file. Fonts: Newsreader, Geist, Geist Mono.

Must-get-right:
1. One review per user per version; reviewing again appends a dated reviewEntry and replaces current scores. Show history on profiles.
2. The write-review page never shows community scores before submit; after submit, show avg + delta per axis.
3. Overall stars and text are required; the 5 axes (Smarts, Taste, Vibes, Aligned, Mom-approved) are optional 1–5.
4. Head-to-head takes (A > B, optional reason) are unlimited; model pages show win % per opponent.
5. Reactions: Agree, Disagree, Useful, Hot take, Lol — toggles, several allowed per user per review.
6. Taste match: ≥3 shared versions, 100 × (1 − mean abs diff / 4); hidden otherwise and when logged out.
7. versionStats (averages, 1–5 histograms, counts) stay denormalized and are updated in the same mutations.
8. Logged-out browsing everywhere; sign-in prompt on write actions.
9. Model requests + a minimal /admin page (ADMIN_EMAILS env var) to approve requests and add versions.

Process:
- First reply with a short plan (file tree, Convex schema, routes) and wait for my OK.
- Then build in order: schema + seed script (6 models, ~20 reviews, takes, reactions), auth, model page, write review, feed, profile, takes, request/admin, search.
- Typecheck and run after each step.
- Finish with a README section on local setup, env vars (OAuth keys, ADMIN_EMAILS) and deploying to Convex + Vercel.
