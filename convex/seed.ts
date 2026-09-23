import { internalMutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import {
  applyOverallToStats,
  bumpTakeCount,
  CORE_AXES,
  REACTION_KINDS,
  createVersion,
  replaceReviewScores,
} from "./lib";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// [seed key, model id (OpenRouter-style), display name, provider, released days ago, source].
// Claude Opus 4 and Grok 4 have been retired from OpenRouter, so they're added by hand.
const MODELS = [
  ["claude-opus-4-1", "anthropic/claude-opus-4.1", "Claude Opus 4.1", "Anthropic", 48, "catalog"],
  ["claude-opus-4", "anthropic/claude-opus-4", "Claude Opus 4", "Anthropic", 120, "manual"],
  ["gpt-5-2025-08-07", "openai/gpt-5", "GPT-5", "OpenAI", 45, "catalog"],
  ["gemini-2.5-pro", "google/gemini-2.5-pro", "Gemini 2.5 Pro", "Google", 170, "catalog"],
  ["deepseek-v3.1", "deepseek/deepseek-chat-v3.1", "DeepSeek V3.1", "DeepSeek", 30, "catalog"],
  ["grok-4-0709", "x-ai/grok-4", "Grok 4", "xAI", 75, "manual"],
  ["llama-4-maverick", "meta-llama/llama-4-maverick", "Llama 4 Maverick", "Meta", 165, "catalog"],
] as const;

// [name, handle, xHandle?, joined days ago]
const USERS = [
  ["Priya Raman", "priya_r", "priya_r", 100],
  ["Jonah Becker", "jonahb", "jonahb", 90],
  ["Lena Ortiz", "lena_evals", "lena_evals", 110],
  ["Sam Okafor", "samokafor", undefined, 60],
  ["Mira Chen", "mirac", "mirachen", 80],
  ["Ade Laniyan", "ade_l", "ade_l", 70],
  ["Kai Thompson", "kt_builds", "kt_builds", 95],
  ["Rosa Delgado", "rosad", undefined, 50],
  ["Theo Park", "theopark", "theopark", 40],
  ["Nadia Haddad", "nadia_h", undefined, 35],
  ["Demo Reviewer", "demo", undefined, 20],
] as const;

type Handle = (typeof USERS)[number][1];
type Ver = (typeof MODELS)[number][0];
// overall, smarts, taste, vibes, aligned, mom-approved (0 = skipped). Mom-approved
// used to be a core axis; it's now a regular custom axis.
type S = [number, number, number, number, number, number];

// Custom axes people "added" — [name, one-line description, created by].
const CUSTOM_AXES: [string, string, Handle][] = [
  ["Mom-approved", "Would recommend to mom", "mirac"],
  ["Coding", "Writes code that works the first time", "kt_builds"],
  ["Design", "Makes things look good", "priya_r"],
  ["Humor", "Is actually funny", "jonahb"],
  ["Dessert recipes", "Knows its way around a pastry", "mirac"],
  ["Long documents", "Keeps track of very long inputs", "lena_evals"],
];

type Entry = { text: string; overall: number; ago: number; prompt?: string; response?: string };
// `c`: custom axis scores by slug.
const REVIEWS: { by: Handle; v: Ver; s: S; c?: Record<string, number>; entries: Entry[] }[] = [
  {
    by: "priya_r", v: "claude-opus-4-1", s: [5, 5, 5, 4, 5, 4], c: { design: 4, "long-documents": 5 },
    entries: [
      { overall: 4, ago: 41 * DAY, text: "Pushes back on bad ideas instead of polishing them. A bit long-winded in chat." },
      {
        overall: 5, ago: 2 * DAY,
        text: "The first model that pushes back on my bad ideas instead of polishing them. Asked it to \"make this abstract punchier\" and it told me the results section doesn't support the claim. It was right.",
        prompt: "Make this abstract punchier.",
        response: "Happy to — but the claim in line 2 isn't supported by Table 3. Want me to soften it or…",
      },
    ],
  },
  { by: "jonahb", v: "claude-opus-4-1", s: [2, 5, 4, 1, 4, 2], entries: [{ overall: 2, ago: 4 * DAY, text: "Brilliant coworker you would never get a beer with. Every answer is a memo. I asked for a yes or no and got three headers and a caveat section." }] },
  { by: "lena_evals", v: "claude-opus-4-1", s: [4, 5, 4, 4, 4, 3], entries: [{ overall: 4, ago: 7 * DAY, text: "Great taste in code and prose. Too cautious for my mom though — she asked about a mole and got a very polite \"see a doctor\" essay." }] },
  { by: "kt_builds", v: "claude-opus-4-1", s: [5, 5, 5, 4, 4, 0], c: { coding: 5 }, entries: [{ overall: 5, ago: 9 * DAY, text: "Refactored a 4k-line module without losing the plot once. The only model I let touch migrations." }] },
  { by: "samokafor", v: "gpt-5-2025-08-07", s: [4, 5, 3, 3, 4, 4], c: { design: 2 }, entries: [{ overall: 4, ago: 12 * MIN, text: "Smartest thing I've used for math proofs, and it knows it. Taste is fine, nothing more — its UI suggestions all look like the same SaaS landing page." }] },
  { by: "priya_r", v: "gpt-5-2025-08-07", s: [4, 5, 3, 3, 4, 4], entries: [{ overall: 4, ago: 20 * DAY, text: "Writes like a consultant: correct, confident, and just slightly padded. Excellent at finding the bug I swore wasn't there." }] },
  { by: "jonahb", v: "gpt-5-2025-08-07", s: [5, 5, 4, 4, 3, 4], entries: [{ overall: 5, ago: 3 * HOUR, text: "Finally, a model that answers the question I asked. Short when I want short, long when I ask for long." }] },
  { by: "lena_evals", v: "gpt-5-2025-08-07", s: [4, 5, 3, 3, 3, 3], entries: [{ overall: 4, ago: 6 * DAY, text: "Top-tier on my eval suite. Still agrees with me a little too fast when I'm wrong on purpose." }] },
  { by: "mirac", v: "gemini-2.5-pro", s: [5, 4, 4, 5, 4, 5], c: { "dessert-recipes": 5, "long-documents": 5 }, entries: [{ overall: 5, ago: 1 * HOUR, text: "Underrated. The long-context recall is absurd and it's the only one my mom actually enjoys talking to. Warm without being a golden retriever." }] },
  { by: "priya_r", v: "gemini-2.5-pro", s: [4, 4, 4, 4, 4, 5], entries: [{ overall: 4, ago: 39 * DAY, text: "Remembers the whole doc and doesn't flatter you. Occasionally forgets what format I asked for." }] },
  { by: "lena_evals", v: "gemini-2.5-pro", s: [4, 4, 3, 4, 4, 4], entries: [{ overall: 4, ago: 15 * DAY, text: "Reliable workhorse. Dropped a 900-page PDF in and got citations that actually checked out." }] },
  { by: "ade_l", v: "grok-4-0709", s: [3, 4, 2, 4, 2, 2], c: { humor: 4 }, entries: [{ overall: 3, ago: 5 * HOUR, text: "Fun, fast, and will absolutely tell you what you want to hear. Great for brainstorming, I would not let it near my taxes." }] },
  { by: "priya_r", v: "grok-4-0709", s: [2, 4, 2, 4, 1, 2], entries: [{ overall: 2, ago: 54 * DAY, text: "Entertaining until you need it to be right. Called my obviously broken proof \"elegant\"." }] },
  { by: "jonahb", v: "grok-4-0709", s: [4, 4, 3, 5, 3, 3], c: { humor: 5 }, entries: [{ overall: 4, ago: 2 * DAY, text: "The only model with a sense of humor that lands. Yes it's a little reckless. So am I." }] },
  { by: "theopark", v: "deepseek-v3.1", s: [4, 4, 3, 3, 4, 3], c: { coding: 5 }, entries: [{ overall: 4, ago: 8 * HOUR, text: "Absurd value. It's 90% of the frontier for a rounding error of the price, and the thinking mode is genuinely good at code." }] },
  { by: "lena_evals", v: "deepseek-v3.1", s: [4, 4, 3, 3, 4, 0], entries: [{ overall: 4, ago: 10 * DAY, text: "Surprisingly strict about not making things up. Prose is flat but the reasoning is clean." }] },
  { by: "rosad", v: "llama-4-maverick", s: [3, 3, 3, 3, 3, 3], entries: [{ overall: 3, ago: 1 * DAY, text: "Fine, forgettable, and I can run it myself. That last part carries a lot of weight." }] },
  { by: "samokafor", v: "llama-4-maverick", s: [3, 3, 2, 4, 3, 3], entries: [{ overall: 3, ago: 11 * DAY, text: "Chatty and friendly, but it gets lost on anything multi-step. Nice for quick rewrites." }] },
  { by: "nadia_h", v: "claude-opus-4", s: [4, 4, 5, 4, 4, 4], entries: [{ overall: 4, ago: 30 * DAY, text: "The version that made me cancel my other subscription. 4.1 is better at code, but this one wrote nicer." }] },
  { by: "kt_builds", v: "gpt-5-2025-08-07", s: [4, 5, 3, 3, 4, 0], c: { coding: 4 }, entries: [{ overall: 4, ago: 13 * HOUR, text: "Fantastic at planning agents. Less fantastic at admitting a tool call failed." }] },
  { by: "demo", v: "claude-opus-4-1", s: [5, 5, 4, 4, 5, 4], c: { coding: 5 }, entries: [{ overall: 5, ago: 5 * DAY, text: "Best editor I've worked with, human or otherwise." }] },
  { by: "demo", v: "gpt-5-2025-08-07", s: [4, 5, 3, 3, 4, 3], entries: [{ overall: 4, ago: 6 * DAY, text: "Sharp and fast. Gives me the answer, then three things I didn't ask about." }] },
  { by: "demo", v: "gemini-2.5-pro", s: [4, 4, 4, 5, 4, 5], c: { "long-documents": 4 }, entries: [{ overall: 4, ago: 8 * DAY, text: "The friendliest of the bunch, and it never loses track of a long doc." }] },
  { by: "demo", v: "grok-4-0709", s: [2, 4, 2, 4, 1, 2], entries: [{ overall: 2, ago: 9 * DAY, text: "Funny. Wrong a lot. Agrees with anything." }] },
];

// [by, winner, loser, reason?, days ago]
const TAKES: [Handle, Ver, Ver, string | undefined, number][] = [
  ["priya_r", "claude-opus-4-1", "gpt-5-2025-08-07", "Opus writes like an editor, GPT-5 writes like a consultant.", 1],
  ["lena_evals", "gpt-5-2025-08-07", "claude-opus-4-1", "GPT-5 wins on raw correctness; Opus wins on judgment. Correctness pays my bills.", 3],
  ["kt_builds", "claude-opus-4-1", "gpt-5-2025-08-07", undefined, 4],
  ["nadia_h", "claude-opus-4-1", "gpt-5-2025-08-07", undefined, 5],
  ["samokafor", "gpt-5-2025-08-07", "claude-opus-4-1", undefined, 2],
  ["kt_builds", "claude-opus-4-1", "gemini-2.5-pro", "Gemini remembers more, Opus understands more.", 6],
  ["priya_r", "claude-opus-4-1", "gemini-2.5-pro", undefined, 12],
  ["mirac", "gemini-2.5-pro", "claude-opus-4-1", "Gemini is kinder and just as right.", 2],
  ["lena_evals", "claude-opus-4-1", "grok-4-0709", "Not close. Grok is fun until you need it to be right.", 7],
  ["theopark", "claude-opus-4-1", "grok-4-0709", undefined, 3],
  ["priya_r", "gemini-2.5-pro", "grok-4-0709", "Remembers the whole doc and doesn't flatter you.", 14],
  ["priya_r", "gpt-5-2025-08-07", "llama-4-maverick", undefined, 23],
  ["theopark", "deepseek-v3.1", "llama-4-maverick", "Same price class, one of them can reason.", 1],
  ["jonahb", "grok-4-0709", "claude-opus-4-1", "At least Grok gets to the point.", 4],
  ["ade_l", "grok-4-0709", "gpt-5-2025-08-07", undefined, 5],
  ["rosad", "deepseek-v3.1", "gpt-5-2025-08-07", "Ninety percent as good for a tenth of the price.", 8],
  ["mirac", "gemini-2.5-pro", "gpt-5-2025-08-07", undefined, 9],
  ["samokafor", "gpt-5-2025-08-07", "gemini-2.5-pro", "Better at proofs. Not close.", 10],
  ["demo", "claude-opus-4-1", "gpt-5-2025-08-07", undefined, 6],
];

// Background reviewers so the homepage "best" cards (20+ reviews) have data.
// Their reviews are short and dated 2–8 weeks ago, so the curated ones above
// stay on top of the Latest feed.
const FIRST = ["Alex", "Bea", "Carlos", "Dana", "Eli", "Farah", "Gus", "Hana", "Ivan", "Jade", "Kofi", "Liv", "Marco", "Noor", "Oren", "Pia", "Quinn", "Ravi", "Sofia", "Tariq", "Uma", "Vic", "Wren", "Xiu", "Yusuf", "Zoe", "Ines", "Ben", "Cleo", "Dev"];
const LAST = ["Abbott", "Brandt", "Cruz", "Dunn", "Eze", "Fong", "Garza", "Holm", "Ito", "Jensen", "Kaur", "Lund", "Moreau", "Nakamura", "Ortega", "Petrov", "Quist", "Rossi", "Sato", "Tan", "Ueda", "Varga", "Weber", "Xu", "Yilmaz", "Zamora", "Ali", "Berg", "Costa", "Diaz"];
const BULK_USERS = FIRST.map((first, i) => {
  const name = `${first} ${LAST[i]}`;
  return { name, handle: `${first}_${LAST[i]}`.toLowerCase() };
});

// Per-version mean scores: overall, smarts, taste, vibes, aligned, mom-approved.
const BULK_PROFILES: Record<string, [number, number, number, number, number, number]> = {
  "claude-opus-4-1": [4.3, 4.6, 4.9, 3.6, 3.9, 3.5],
  "gpt-5-2025-08-07": [4.2, 4.8, 3.4, 3.5, 3.9, 3.9],
  "gemini-2.5-pro": [4.1, 4.2, 3.7, 3.9, 4.6, 4.5],
  "deepseek-v3.1": [3.9, 4.1, 3.3, 3.2, 3.9, 3.1],
  "grok-4-0709": [3.3, 3.8, 3.0, 4.6, 2.6, 2.7],
};
// Per-version means for custom axes; each background review rates one of them 35% of the time.
const BULK_CUSTOM: Record<string, Record<string, number>> = {
  coding: { "claude-opus-4-1": 4.7, "gpt-5-2025-08-07": 4.5, "gemini-2.5-pro": 4.0, "deepseek-v3.1": 4.4, "grok-4-0709": 3.6 },
  design: { "claude-opus-4-1": 4.4, "gpt-5-2025-08-07": 3.2, "gemini-2.5-pro": 3.8, "deepseek-v3.1": 3.0, "grok-4-0709": 3.3 },
  humor: { "claude-opus-4-1": 3.4, "gpt-5-2025-08-07": 3.0, "gemini-2.5-pro": 3.8, "deepseek-v3.1": 2.9, "grok-4-0709": 4.6 },
  "dessert-recipes": { "claude-opus-4-1": 4.1, "gpt-5-2025-08-07": 4.0, "gemini-2.5-pro": 4.5, "deepseek-v3.1": 3.5, "grok-4-0709": 3.2 },
  "long-documents": { "claude-opus-4-1": 4.3, "gpt-5-2025-08-07": 4.1, "gemini-2.5-pro": 4.8, "deepseek-v3.1": 3.6, "grok-4-0709": 3.0 },
};

const BULK_TEXT: Record<string, string[]> = {
  "claude-opus-4-1": ["Best writing partner I've had.", "Careful, sometimes too careful.", "Catches my mistakes before I do.", "Long answers, but good ones."],
  "gpt-5-2025-08-07": ["Fast and sharp on technical questions.", "Great at math, bland at prose.", "Reliable default for work.", "Confident even when it shouldn't be."],
  "gemini-2.5-pro": ["Handles huge documents without blinking.", "Friendly and surprisingly thorough.", "My parents' favorite by far.", "Solid all-rounder."],
  "deepseek-v3.1": ["Great value for coding.", "Plain prose, clean reasoning.", "Does the job, nothing fancy.", "Better than the price suggests."],
  "grok-4-0709": ["Fun to talk to, hard to trust.", "Funny, fast, often wrong.", "Good for brainstorming only.", "Says what you want to hear."],
};

// Slugs for the positional score arrays above (`s` without overall, and BULK_PROFILES).
const POSITIONAL_AXES = ["smarts", "taste", "vibes", "aligned", "mom-approved"];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("versions").first()) {
      return "Already seeded. Run seed:reset first to start over.";
    }
    const now = Date.now();

    const versions = new Map<string, Id<"versions">>();
    for (const [key, versionId, displayName, provider, releasedDaysAgo, source] of MODELS) {
      versions.set(
        key,
        await createVersion(ctx, {
          versionId,
          displayName,
          provider,
          releasedAt: now - releasedDaysAgo * DAY,
          source,
        }),
      );
    }

    const users = new Map<string, Id<"users">>();
    for (const [name, handle, xHandle, joinedDaysAgo] of USERS) {
      users.set(
        handle,
        await ctx.db.insert("users", {
          name,
          nameLower: name.toLowerCase(),
          handle,
          handleLower: handle,
          xHandle,
          joinedAt: now - joinedDaysAgo * DAY,
          // Lets the local demo sign-in act as admin via ADMIN_EMAILS=demo@goodbots.local.
          email: handle === "demo" ? "demo@goodbots.local" : undefined,
        }),
      );
    }

    // Axes: the five core ones, then a few custom ones "added" by reviewers.
    const axisBySlug = new Map<string, Id<"axes">>();
    for (const [i, a] of CORE_AXES.entries()) {
      axisBySlug.set(
        a.slug,
        await ctx.db.insert("axes", { ...a, core: true, order: i, status: "active", ratingCount: 0, createdAt: now }),
      );
    }
    for (const [name, hint, by] of CUSTOM_AXES) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      axisBySlug.set(
        slug,
        await ctx.db.insert("axes", {
          name,
          slug,
          hint,
          core: false,
          status: "active",
          ratingCount: 0,
          createdBy: users.get(by),
          createdAt: now - 30 * DAY,
        }),
      );
    }

    /** Inserts a review with its overall + axis scores and keeps all stats in sync. */
    const seedReview = async (args: {
      userId: Id<"users">;
      versionId: Id<"versions">;
      overall: number | undefined;
      core: (number | undefined)[]; // positional: smarts, taste, vibes, aligned, mom-approved
      custom?: Record<string, number>;
      createdAt: number;
      updatedAt: number;
    }) => {
      const reviewId = await ctx.db.insert("reviews", {
        userId: args.userId,
        versionId: args.versionId,
        overall: args.overall,
        reactionCount: 0,
        createdAt: args.createdAt,
        updatedAt: args.updatedAt,
      });
      await applyOverallToStats(ctx, args.versionId, null, args.overall);
      const scores = new Map<Id<"axes">, number>();
      POSITIONAL_AXES.forEach((slug, i) => {
        const n = args.core[i];
        if (n) scores.set(axisBySlug.get(slug)!, n);
      });
      for (const [slug, n] of Object.entries(args.custom ?? {})) scores.set(axisBySlug.get(slug)!, n);
      await replaceReviewScores(ctx, { _id: reviewId, userId: args.userId, versionId: args.versionId }, scores);
      return reviewId;
    };

    const reviewIds: Id<"reviews">[] = [];
    for (const r of REVIEWS) {
      const [overall, ...core] = r.s.map((n) => n || undefined);
      const versionId = versions.get(r.v)!;
      const reviewId = await seedReview({
        userId: users.get(r.by)!,
        versionId,
        overall,
        core,
        custom: r.c,
        createdAt: now - r.entries[0].ago,
        updatedAt: now - r.entries[r.entries.length - 1].ago,
      });
      for (const e of r.entries) {
        await ctx.db.insert("reviewEntries", {
          reviewId,
          text: e.text,
          prompt: e.prompt,
          response: e.response,
          overallAtTime: e.overall,
          createdAt: now - e.ago,
        });
      }
      reviewIds.push(reviewId);
    }

    // Background reviewers: user i skips version j when (i + j) % 5 === 0.
    const bulkRand = rng(7);
    const bulkVersions = Object.keys(BULK_PROFILES);
    const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
    for (const [i, u] of BULK_USERS.entries()) {
      const userId = await ctx.db.insert("users", {
        name: u.name,
        nameLower: u.name.toLowerCase(),
        handle: u.handle,
        handleLower: u.handle,
        joinedAt: now - (60 + i) * DAY,
      });
      users.set(u.handle, userId);
      for (const [j, v] of bulkVersions.entries()) {
        if ((i + j) % 5 === 0) continue;
        const p = BULK_PROFILES[v];
        const s = p.map((mean) => clamp(mean + (bulkRand() * 2 - 1) * 1.2));
        // Core axes are skipped 15% of the time; the custom Mom-approved is rated only 20% of the time.
        const core = s.slice(1).map((n, k) => (bulkRand() < (k === 4 ? 0.8 : 0.15) ? undefined : n));
        const custom: Record<string, number> = {};
        if (bulkRand() < 0.35) {
          const slugs = Object.keys(BULK_CUSTOM);
          const slug = slugs[Math.floor(bulkRand() * slugs.length)];
          custom[slug] = clamp(BULK_CUSTOM[slug][v] + (bulkRand() * 2 - 1) * 1.2);
        }
        const at = now - (14 + Math.floor(bulkRand() * 42)) * DAY;
        const reviewId = await seedReview({
          userId,
          versionId: versions.get(v)!,
          overall: s[0],
          core,
          custom,
          createdAt: at,
          updatedAt: at,
        });
        const texts = BULK_TEXT[v];
        await ctx.db.insert("reviewEntries", {
          reviewId,
          text: texts[(i + j) % texts.length],
          overallAtTime: s[0],
          createdAt: at,
        });
      }
    }

    // Site counters: everyone seeded above has at least one review.
    const reviewers = new Set((await ctx.db.query("reviews").collect()).map((r) => r.userId));
    await ctx.db.insert("siteStats", { reviewerCount: reviewers.size });

    // Reactions (curated reviews only): each other user reacts with some probability.
    const rand = rng(42);
    const handles = USERS.map((u) => u[1] as string);
    for (const reviewId of reviewIds) {
      const review = (await ctx.db.get(reviewId))!;
      let count = 0;
      for (const h of handles) {
        const userId = users.get(h)!;
        if (userId === review.userId) continue;
        for (const kind of REACTION_KINDS) {
          const p = kind === "agree" ? 0.45 : kind === "useful" ? 0.3 : 0.15;
          if (rand() > p) continue;
          const age = Math.min(now - review.createdAt, 6 * DAY) * rand();
          await ctx.db.insert("reactions", { reviewId, userId, kind, createdAt: now - age });
          count++;
        }
      }
      await ctx.db.patch(reviewId, { reactionCount: count });
    }

    for (const [by, w, l, reason, daysAgo] of TAKES) {
      const winnerVersionId = versions.get(w)!;
      const loserVersionId = versions.get(l)!;
      await ctx.db.insert("takes", {
        userId: users.get(by)!,
        winnerVersionId,
        loserVersionId,
        reason,
        createdAt: now - daysAgo * DAY,
      });
      await bumpTakeCount(ctx, winnerVersionId, 1);
      await bumpTakeCount(ctx, loserVersionId, 1);
    }

    const reviewTotal = (await ctx.db.query("reviews").collect()).length;
    return `Seeded ${versions.size} versions, ${users.size} users, ${reviewTotal} reviews, ${TAKES.length} takes.`;
  },
});

const APP_TABLES = [
  "providers",
  "versions",
  "axes",
  "reviews",
  "reviewEntries",
  "reviewScores",
  "axisStats",
  "reactions",
  "takes",
  "modelRequests",
  "versionStats",
  "siteStats",
] as const;

async function clear(ctx: MutationCtx, table: (typeof APP_TABLES)[number]) {
  for (const doc of await ctx.db.query(table).collect()) await ctx.db.delete(doc._id);
}

/** Deletes all app data and the seeded users (real signed-in users are kept). */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const t of APP_TABLES) {
      await clear(ctx, t);
    }
    const seeded = new Set<string>([...USERS.map((u) => u[1]), ...BULK_USERS.map((u) => u.handle)]);
    for (const u of await ctx.db.query("users").collect()) {
      const seedEmail = !u.email || u.email.endsWith("@goodbots.local");
      if (seedEmail && u.handle && seeded.has(u.handle)) await ctx.db.delete(u._id);
    }
    return "Cleared.";
  },
});
