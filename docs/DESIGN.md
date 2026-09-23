# Handoff: GoodBots MVP

> This is the original design handoff the app was built from. The HTML mockup it mentions is no longer in the repo; the built app in `src/` is now the reference. For running the app, see [`SETUP.md`](../SETUP.md).

## Overview
GoodBots is a review site for LLMs (Goodreads/Yelp for models). Users rate specific model **versions** on overall stars + five quirky axes, write opinionated reviews, post "A > B" head-to-head takes, react to reviews, and see a taste-match % with other reviewers. Product rules, data model and scope live in **[`SPEC.md`](SPEC.md)** — read it first.

## About the design files
`design/GoodBots Screens.dc.html` (not included in this repo) was a **design reference built in HTML**, not production code. Open it in a browser (keep `support.js` beside it). It's a pan/zoom canvas with four 1280px-wide screens, 4a–4d, and working interactions: reactions, the distributions toggle, feed tabs, rating and submitting a review. Rebuild these screens in the target stack (React + Convex, see SPEC.md). Do not ship or port the HTML runtime. The file uses a custom `{{ }}` templating layer; read it only for layout, copy and values.

## Fidelity
**High-fidelity.** Match colors, type, spacing, radii and copy closely. The sample data is fake; replace it with seeded Convex data.

## Screens

Global chrome (4a, 4b, 4d):
- Top bar, background `#fbfaf7`, bottom border `1px #e4e2da`, padding `16px 48px`, gap 28px.
- Wordmark "GoodBots": Newsreader 22px, weight 400, letter-spacing -.01em, followed by five 11px ★ (Geist, letter-spacing 1px) with a 4px gap. The tops of the stars line up with the tops of the capitals (margin-top 4px). The stars use the `-star` axis colors in hue order: vibes red, overall gold, aligned green, smarts blue, taste violet. They keep their colors on hover and never wrap. At other sizes: stars 0.5×, gap 0.16× and margin-top 0.17× of the word size. Email and the social image use the hex fallbacks.
- Favicon: `public/favicon.svg`, a single star with a diagonal gradient through the five star hues (lighter hues in dark mode). `public/apple-touch-icon.png` is the same star, 120px, on a 180px `#f5f4ef` square.
- Nav "Home" and "Models": Geist Mono 12px, uppercase, letter-spacing .06em. Active `#171715`, inactive `#8a877d`.
- Search input 260px: white, border `1px #e4e2da`, radius 6, padding `8px 12px`, placeholder "Search models or reviewers".
- "Write a review" button: `#171715` background, white Geist 14/500 text, radius 4, padding `9px 16px`, hover `#3a3935`.
- Page background `#f5f4ef`. Content padding `44px 48px 56px`. Sections are stacked 40px apart.

Shared patterns:
- **Section label**: Geist Mono 12px, uppercase, letter-spacing .08em, `#4a4943`, 14px above its content.
- **Card**: white, `1px #e4e2da` border, radius 8. List rows inside cards are divided by `1px #eeede7`.
- **Segmented pill control**: white, `1px #e4e2da` border, radius 999, Geist Mono 12px, items padded `9px 14px`. Selected item is `#171715` with white text.
- **Taste-match chip**: Geist Mono 11px, padding `3px 7px`, radius 4.
  - ≥70%: bg `#f6f7e6`, border `#d9dcae`, text `#5c5c10`
  - 50–69%: bg `#f5f4ef`, border `#e4e2da`, text `#4a4943`
  - <50%: bg `#fcf1ea`, border `#efc9b3`, text `#a3441a`
  - Hidden when fewer than 3 shared versions.
- **Reaction button**: Geist 13px label plus a Geist Mono 11px count at 70% opacity, padding `5px 10px`, radius 4. Off: bg `#fbfaf7`, border `#e4e2da`. On: bg and border `#171715`, white text. Reactions: Agree, Disagree, Useful, Hot take, Lol.
- **Review body text**: Newsreader 19px / 1.5.
- **Stars**: ★ glyphs, filled `#171715`, empty `#dcdad2`, letter-spacing 2px.

### 4a — Model page
**Header row**, space-between:
- Left side:
  - Provider: mono label `#8a877d`.
  - Model name: Newsreader 52px / 1.0, letter-spacing -.02em.
  - Summary line in Geist 18px `#5f5d56`: "1,284 reviews · **4.3 overall** · 738 head-to-head takes". The rating segment is `#6b6b12`.
- Right side: "VERSION" label plus a segmented control of version IDs.

**Ratings · 1–5**:
- A 5-column grid, gap 14.
- Each axis card: padding 20, min-height 196.
  - Mono axis label.
  - Average: Geist 40px weight 300, tabular numbers.
  - A row of 5 pips (10px tall, radius 2). Filled up to the rounded average in `#8f8f24`; empty `#eeede7`.
  - Mono 12px hint in `#6b6b12`.
- **Show distributions** toggle (top right, checkbox style, off by default): replaces the pips with a 5-bar histogram, 52px tall, bars `#8f8f24`, mono 1–5 labels underneath.

**Head to head · overall**:
- A card of rows, grid `200px 180px 1fr 110px`, padding `16px 24px`. Columns:
  - "vs {opponent}"
  - A 6px split bar: `#171715` for the win share, `#dcdad2` for the rest, with a mono caption "58% Opus · 42% GPT-5"
  - The top quote with its handle
  - "{n} takes"
- Footer row, bg `#fbfaf7`: "YOUR TAKE" [this model] > [select opponent] [Because… input] [Post take].
  - Clicking the left model swaps the two sides.

**Reviews · top**:
- Star filter segmented control: All, 5★…1★.
- A card with one row per review, grid `230px 1fr`, gap 36, padding `26px 28px`.
- Left column:
  - Avatar: 32px circle with initials, `#f5f4ef` fill, border.
  - Name (14/500) and handle (mono 11px).
  - Taste-match chip.
  - Per-axis scores in mono 11px uppercase.
- Right column:
  - Stars, with relative time on the right.
  - Body text.
  - Optional prompt/response snippet box: `#f5f4ef` bg, border, radius 6, mono 12px. Line prefixes are "prompt ›" in `#8a877d` and "model ›" in `#6b6b12`.
  - Reactions row.

### 4b — Home feed
**Two columns**: `1fr 380px`. The right rail is white, with a left border and padding `44px 32px`.

**Main column header**:
- Title "What people think": Newsreader 44px.
- Summary line in Geist 17px, e.g. "218 reviews today · GPT-5 trending up · …".
- Tabs segmented control: LATEST / TOP THIS WEEK.
  - Latest: chronological.
  - Top this week: most reactions in 7 days.

**Feed cards**, stacked 14px apart, padding `22px 26px`:
- Top row: model chip (13px, `#f5f4ef`, border, radius 4) and taste-match chip; time on the right.
- Reviewer name (15/500) and stars.
- Body text (max-width 66ch).
- Mono axis scores inline.
- Reactions row.

**Right rail**:
- "MODELS · OVERALL": a bordered list. Each row shows name 15px, version in mono 11px, and the average in Geist 18/300.
- "REVIEWERS LIKE YOU": the top 3 taste matches as bordered rows, each with an olive match chip.

### 4c — Write a review
The top bar shows the wordmark and "CANCEL" only. Layout is two columns, `760px 1fr`, gap 48.

**Left column**:
- Title "Review a model": Newsreader 44px.
- Version select: min-width 360, radius 4.
- When the user already reviewed this version, show an olive notice (bg `#f6f7e6`, border `#d9dcae`, radius 6): "You reviewed this version on Aug 12. Posting now adds a dated update to that review; the new scores replace the old ones."
- Rating card:
  - Overall row, required (bg `#fbfaf7`): five 30px ★ buttons and an "n of 5" status.
  - Five axis rows, grid `220px 1fr 150px`, each with:
    - Mono label and hint.
    - Five 38px number buttons, radius 4, mono 14px. Selected: `#171715` with white text. Hover: border `#171715`.
    - A right cell reading "optional".
  - Clicking the selected value again clears it.
- "YOUR REVIEW": textarea, Newsreader 19px, 6 rows, radius 8. Placeholder: "What did you use it for? Where did it surprise you? Hot takes welcome — argue for them."
- An underlined "+ Add prompt / response" link reveals two mono textareas side by side.
- Footer:
  - Status in mono: "Overall rated · 3 of 5 axes · community scores appear after you post".
  - "Post review" button: disabled (`#dcdad2`) until overall stars and text are both filled.

**After posting**:
- A card appears: "Posted. Community averages are now shown next to your scores." with an Edit button.
- Each axis row's right cell shows "avg 4.3 · +0.7". The delta is olive when ≥ +0.5, rust when ≤ −0.5, neutral otherwise.
- **Never show community numbers before submit.**

**Right column**: a scale legend (1 actively bad / 3 fine, forgettable / 5 best I've used) and the note "Skip any axis you haven't tested."

### 4d — Reviewer profile
**Header**:
- 72px initials avatar (Newsreader 28).
- Name: Newsreader 44px.
- Subline: "@handle on X · joined Jun 2026 · **86% taste match with you**" (olive).
- Right side: pill with "14 reviews | 37 takes".

**RATINGS table** card:
- Header row: bg `#fbfaf7`, mono 11px uppercase.
- Columns: `1.6fr 120px repeat(5,.7fr) 90px` — Model (name + mono version) / Overall stars / Smarts / Taste / Vibes / Aligned / Mom / Updated.

**Two columns** below, `1fr 420px`:
- **Latest review · with updates**: entries newest first, each with a 2px left rule (`#171715` for the latest, `#dcdad2` for older). Entry heading is mono, e.g. "UPDATE · SEP 20 · 4★ → 5★", then body text.
- **Takes**: rows reading "A > B" (with a mono ">"), date, and the optional reason in Newsreader 17px.

## Interactions & behavior
- **Access:** logged-out users can browse everything. Every write action (review, react, take, request) opens sign-in (Google or X).
- **Reactions:** toggle optimistically. A user can hold several reactions on one review.
- **Distributions toggle:** view-only, per session.
- **Version switcher:** changes route, e.g. `/m/claude-opus/claude-opus-4-1`.
- **Hover:** buttons darken (primary `#3a3935`). Selectable controls get a `#171715` border on hover.
- **Focus:** `2px solid #171715` outline, offset 2.
- **Motion:** none required. Keep transitions ≤150ms if added.
- **Responsive:** below ~900px, collapse two-column layouts to one column. The axis grid becomes 2–3 columns, then a list.

## State / data
See SPEC.md for the Convex tables (users, models, versions, reviews, reviewEntries, reactions, takes, modelRequests, versionStats) and the taste-match formula.

## Design tokens
**Colors**:
- Page `#f5f4ef`. Raised/bar `#fbfaf7`. Card `#ffffff`.
- Border `#e4e2da`. Row divider `#eeede7`. Canvas outline `#cfccc2`.
- Ink `#171715`. Ink-2 `#2f2e2a`. Muted `#4a4943`, `#5f5d56`, `#8a877d`. Disabled / empty star `#dcdad2`.
- Olive: text `#6b6b12` / `#5c5c10`, fill `#8f8f24`, tint bg `#f6f7e6`, tint border `#d9dcae`.
- Rust (negative delta, low match only): text `#a3441a`, tint bg `#fcf1ea`, tint border `#efc9b3`.
- Axes (Prism): one hue per core axis plus overall. Each hue has `--axis-X` for text and fills (oklch 0.5 0.13, at least 4.5:1 on white), `-bg` (0.965 0.022), `-border` (0.86 0.05) and `-star` (0.66 0.15). The `-star` step is for logo stars and graphics only, never for body text.

  | axis | hue | text | star (light bg) | star (dark bg) |
  |---|---|---|---|---|
  | overall | 70 gold | `#915200` | `#cb7f00` | `#df9b44` |
  | smarts | 235 blue | `#006ca2` | `#009ee0` | `#47b7f1` |
  | taste | 305 violet | `#754d9e` | `#a878db` | `#be95ec` |
  | vibes | 25 red | `#a03f3c` | `#df6862` | `#f28881` |
  | aligned | 150 green | `#137738` | `#3eab5e` | `#69c27e` |

**Type**:
- Newsreader 400 for headlines (52 / 44 / 22) and review body (19 / 1.5; 17 for take reasons).
- Geist 300/400/500 for UI (18 / 17 / 16 / 15 / 14 / 13). Big numerals are 40 / 300.
- Geist Mono 400 for labels (12, uppercase, tracking .06–.08em) and metadata (11).

**Radii**: 4 (buttons, chips, inputs), 6 (search, notices, snippets), 8 (cards), 999 (segmented pills), 50% (avatars).

**Spacing**: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 28 / 32 / 36 / 40 / 48 / 56.

**Shadows**: none — borders only.

## Assets
None. Avatars are initials or user photos from OAuth. There are no icons in the MVP.

## Files
- `SPEC.md`: product rules, data model, scope.
- `PROMPT.md`: the kickoff prompt to paste into Claude Code.
- `design/GoodBots Screens.dc.html` + `design/support.js`: interactive design reference (not included).
