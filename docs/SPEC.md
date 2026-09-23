# GoodBots — MVP spec

A Goodreads/Yelp for LLMs. People rate specific model versions on five fun axes, write opinionated reviews, post "X > Y" head-to-head takes, and find reviewers whose taste matches theirs. Not a benchmark site.

Design reference: [`DESIGN.md`](DESIGN.md) (screens 4a–4d).

## Stack
- **Convex** (DB, queries/mutations, realtime) + **Convex Auth** with **email magic links** and **X (Twitter)** OAuth.
- Frontend: React (Vite or Next.js). Fonts: Newsreader (headlines, review text), Geist (UI), Geist Mono (labels, numbers).

## Access
- Logged-out users can browse everything (feed, model pages, profiles).
- Sign-in required to review, react, post takes, request models. Prompt sign-in on the action.
- Signed-in users can set their display name and @handle on their profile.
- Handles: X sign-ins use their X username. Email sign-ups pick a name and handle on first sign-in (never derived from the email address), and can't review, react, take or request until they do.
- Axis names/descriptions, names and handles go through a basic profanity filter (`obscenity`). Review text is not filtered.

## Rating model
- **Overall**: 1–5 stars, optional.
- **Core axes** (1–5, each optional): Smarts ("gets hard things right"), Taste ("knows what good looks like"), Vibes ("pleasant to talk to"), Aligned ("is a good bot").
- **Custom axes** (1–5, optional): any signed-in reviewer can add an axis while reviewing ("Design", "Dessert recipes"…). Names are 2–40 characters and deduplicated by slug. The write form lists every axis anyone has rated on (core first, then by popularity). Admins can hide or merge custom axes.
- **Text**: the only required field. Optional prompt/response snippet (two plain-text fields).
- **Anti-anchoring**: the write screen never shows community scores until after you post. After posting, show avg + your delta per axis.

## Rules
- **One review per user per model version.** Posting again on the same version adds a dated **update**: new text entry + new scores that replace the current scores. Earlier entries stay visible as history (see 4d).
- **Head-to-head takes**: separate post type, `A > B` on overall, optional one-line reason. Unlimited per user. Model page shows per-opponent win %, counting only each person's most recent take on that pair (one vote per person), and the number of people.
- **Deletion**: people can delete their own reviews (with history) and takes, and their whole account (reviews, takes, reactions, model requests and sign-in records; axes they created stay). All stats are updated in the same mutation. Admins can delete any review or take.
- **Reactions**: Agree, Disagree, Useful, Hot take, Lol. Toggle; a user may hold several on one review.
- **Model catalog**: synced every 6 hours from OpenRouter's public model list (routers, "latest" aliases and :free/:batch copies filtered out; entries never deleted). Any catalog model can be reviewed; its page is created on its first review. Model ids are OpenRouter-style (`provider/model`) and pages live at `/m/<provider>/<model>`. Models not in the catalog: users request them (name, id, provider, link) and admins approve, or admins add them by hand. Admins can merge duplicate models (newer review wins when someone reviewed both; the old URL redirects).
- **No moderation, verification, screenshots, tweet embeds, divisive badges, or reviewer filter in v1.**

## Homepage
- "What do you think of [model]?" with a text box and one randomly suggested core axis to rate (shuffleable, optional). "Finish your review" carries the text and ratings into the write page.
- Stat cards: best overall / vibes / smarts / taste / aligned (versions with 20+ ratings on that axis) and most reviewed in the last 7 days.

## Taste match
- Between viewer V and reviewer R: over model versions both have reviewed (**min 3 shared**), compare overall + any shared axis scores (core or custom).
- `match = 100 × (1 − mean(|a − b|) / 4)`, rounded. Hide the chip when fewer than 3 shared versions, or for logged-out viewers.
- Recompute on review write (store per-pair in `tasteMatches`, or compute on read for MVP scale).
- Shown on every review card and on profiles; the /reviews sidebar lists top 3 matches ("Reviewers like you").

## Screens
1. **Home feed (4b)**: tabs Latest (chronological) / Top this week (most reactions in 7 days). Right rail: models by overall rating, reviewers like you.
2. **Model page (4a)**: one page per model version (`/m/<version-id>`); versions of the same family are separate pages, not tabs. Name, provider, version id, overall + review count + take count. Four core axis cards with averages, plus "Also rated on" for custom axes; "Show distributions" toggle swaps in a 1–5 histogram (off by default). Head-to-head list + inline take composer. Reviews sorted Top, filterable by star rating.
3. **Write a review (4c)**: version picker, prior-review notice when updating, overall stars, five axes, text, optional snippet, post → reveal community comparison.
4. **Reviewer profile (4d)**: name, X handle if signed in with X, join date, taste match with viewer, counts. Ratings table (one row per version), latest review with update history, takes list.
5. **Request a model**: search the catalog first; the request form is only for models that aren't listed.
6. **Admin**: approve/reject model requests, add models by hand, merge models, hide/merge axes.
7. **Search**: models (site + full catalog; close matches first, reviewed before unreviewed, unreviewed newest first) and reviewers by name/handle prefix. The same search powers the model pickers on the write page and homepage.
8. **Models page**: reviewed models only, grouped by provider (default) or ranked by overall rating.

## Data (Convex tables)
- `users`: name, handle, avatarUrl, xHandle?, createdAt
- `providers`: name, slug (first segment of model ids)
- `catalog`: orId, name, provider, providerSlug, releasedAt?, hfId?, contextLength?, deprecatedAt?, searchText (search index), lastSeenAt — the OpenRouter mirror
- `versions` (a model with a page): providerId, versionId (e.g. `anthropic/claude-opus-4.1`), displayName, releasedAt?, status, source (catalog/manual), mergedInto?
- `axes`: name, slug (unique), hint?, core, order?, status (active/hidden), ratingCount, createdBy?, createdAt
- `reviews`: userId, versionId, overall?, reactionCount, createdAt, updatedAt — unique (userId, versionId)
- `reviewScores`: reviewId, userId, versionId, axisId, score — a review's current axis scores
- `reviewEntries`: reviewId, text, prompt?, response?, overallAtTime?, createdAt (first entry = original, later = updates)
- `reactions`: reviewId, userId, kind — unique (reviewId, userId, kind)
- `takes`: userId, winnerVersionId, loserVersionId, reason?, createdAt
- `modelRequests`: userId, family, versionId, provider, link, status
- `versionStats` (denormalized, updated in mutations): versionId, reviewCount, overall sum/count/1–5 histogram, takeCount
- `axisStats` (denormalized, updated in mutations): versionId, axisId, sum, count, 1–5 histogram
- `siteStats`: reviewerCount (users with at least one review)

## Out of scope for v1
Follow/friends, replies/threads, notifications, verification, moderation tools, screenshot upload, tweet embeds, divisive badge, reviewer filter, mobile-specific layouts (keep it responsive).
