import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

/** The seeded axes every review form starts with, in display order. */
export const CORE_AXES = [
  { slug: "smarts", name: "Smarts", hint: "Gets hard things right" },
  { slug: "taste", name: "Taste", hint: "Knows what good looks like" },
  { slug: "vibes", name: "Vibes", hint: "Pleasant to talk to" },
  { slug: "aligned", name: "Aligned", hint: "Honest, not sycophantic" },
  { slug: "mom", name: "Mom-approved", hint: "Would recommend to mom" },
] as const;

export const REACTION_KINDS = [
  "agree",
  "disagree",
  "useful",
  "hot",
  "lol",
] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

// ---------- auth ----------

export async function getViewer(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  return userId ? await ctx.db.get(userId) : null;
}

export async function requireUser(ctx: QueryCtx) {
  const user = await getViewer(ctx);
  if (!user) throw new ConvexError("Sign in to do that.");
  return user;
}

export function isAdmin(user: Doc<"users"> | null) {
  if (!user?.email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}

export async function requireAdmin(ctx: QueryCtx) {
  const user = await requireUser(ctx);
  if (!isAdmin(user)) throw new ConvexError("Admins only.");
  return user;
}

// ---------- validation ----------

export function checkScore(n: number | undefined, label: string) {
  if (n === undefined) return;
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new ConvexError(`${label} must be a whole number from 1 to 5.`);
  }
}

// ---------- axes ----------

export function axisSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function cleanAxisName(raw: string) {
  const name = raw.trim().replace(/\s+/g, " ");
  const slug = axisSlug(name);
  if (name.length < 2 || name.length > 40 || !slug) {
    throw new ConvexError("Axis names must be 2–40 characters.");
  }
  if (slug === "overall") throw new ConvexError("“Overall” is already the star rating.");
  return { name, slug };
}

export type ScoreInput = { axisId?: Id<"axes">; name?: string; score: number };

/**
 * Turns score inputs into axisId → score, creating custom axes for new names.
 * An input names an existing axis by id, or any axis (existing or new) by name.
 */
export async function resolveScores(
  ctx: MutationCtx,
  userId: Id<"users">,
  inputs: ScoreInput[],
): Promise<Map<Id<"axes">, number>> {
  const out = new Map<Id<"axes">, number>();
  for (const input of inputs) {
    checkScore(input.score, "Scores");
    let axis: Doc<"axes"> | null = null;
    if (input.axisId) {
      axis = await ctx.db.get(input.axisId);
    } else if (input.name) {
      const { name, slug } = cleanAxisName(input.name);
      axis = await ctx.db
        .query("axes")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (!axis) {
        const id = await ctx.db.insert("axes", {
          name,
          slug,
          core: false,
          status: "active",
          ratingCount: 0,
          createdBy: userId,
          createdAt: Date.now(),
        });
        axis = await ctx.db.get(id);
      }
    }
    if (!axis || axis.status !== "active") throw new ConvexError("Unknown axis.");
    out.set(axis._id, input.score);
  }
  return out;
}

/** All axes by id (the table is small). */
export async function axisIndex(ctx: QueryCtx) {
  const axes = await ctx.db.query("axes").collect();
  return new Map(axes.map((a) => [a._id, a]));
}

/** Core axes first (in order), then custom axes by popularity, then name. */
export function compareAxes(a: Doc<"axes">, b: Doc<"axes">) {
  if (a.core !== b.core) return a.core ? -1 : 1;
  if (a.core) return (a.order ?? 0) - (b.order ?? 0);
  return b.ratingCount - a.ratingCount || a.name.localeCompare(b.name);
}

export function publicAxis(a: Doc<"axes">) {
  return { _id: a._id, name: a.name, slug: a.slug, hint: a.hint, core: a.core };
}

/** A review's current axis scores with axis names, in display order. Hidden axes are skipped. */
export async function scoresForReview(
  ctx: QueryCtx,
  reviewId: Id<"reviews">,
  axes: Map<Id<"axes">, Doc<"axes">>,
) {
  const rows = await ctx.db
    .query("reviewScores")
    .withIndex("by_review", (q) => q.eq("reviewId", reviewId))
    .collect();
  return rows
    .map((r) => ({ axis: axes.get(r.axisId), score: r.score }))
    .filter((x): x is { axis: Doc<"axes">; score: number } => x.axis?.status === "active")
    .sort((x, y) => compareAxes(x.axis, y.axis))
    .map(({ axis, score }) => ({ ...publicAxis(axis), score }));
}

// ---------- stats ----------

type Stat = { sum: number; count: number; hist: number[] };
const emptyStat = (): Stat => ({ sum: 0, count: 0, hist: [0, 0, 0, 0, 0] });

function bump(stat: Stat, score: number, sign: 1 | -1): Stat {
  const hist = [...stat.hist];
  hist[score - 1] += sign;
  return { sum: stat.sum + sign * score, count: stat.count + sign, hist };
}

export async function getOrCreateStats(ctx: MutationCtx, versionId: Id<"versions">) {
  const existing = await ctx.db
    .query("versionStats")
    .withIndex("by_version", (q) => q.eq("versionId", versionId))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("versionStats", {
    versionId,
    reviewCount: 0,
    overall: emptyStat(),
    takeCount: 0,
  });
  return (await ctx.db.get(id))!;
}

/**
 * Updates a version's review count and overall-star stats.
 * `prev` is the old overall (null when the review is new; undefined when it had no stars).
 */
export async function applyOverallToStats(
  ctx: MutationCtx,
  versionId: Id<"versions">,
  prev: number | undefined | null,
  next: number | undefined,
) {
  const stats = await getOrCreateStats(ctx, versionId);
  let overall: Stat = stats.overall;
  if (prev) overall = bump(overall, prev, -1);
  if (next) overall = bump(overall, next, 1);
  await ctx.db.patch(stats._id, {
    reviewCount: stats.reviewCount + (prev === null ? 1 : 0),
    overall,
  });
}

export async function bumpAxis(
  ctx: MutationCtx,
  versionId: Id<"versions">,
  axisId: Id<"axes">,
  score: number,
  sign: 1 | -1,
) {
  const stat = await ctx.db
    .query("axisStats")
    .withIndex("by_version_axis", (q) => q.eq("versionId", versionId).eq("axisId", axisId))
    .unique();
  if (stat) await ctx.db.patch(stat._id, bump(stat, score, sign));
  else await ctx.db.insert("axisStats", { versionId, axisId, ...bump(emptyStat(), score, sign) });
  const axis = await ctx.db.get(axisId);
  if (axis) await ctx.db.patch(axisId, { ratingCount: axis.ratingCount + sign });
}

/** Replaces a review's axis scores, keeping axisStats and axis rating counts in sync. */
export async function replaceReviewScores(
  ctx: MutationCtx,
  review: { _id: Id<"reviews">; userId: Id<"users">; versionId: Id<"versions"> },
  next: Map<Id<"axes">, number>,
) {
  const old = await ctx.db
    .query("reviewScores")
    .withIndex("by_review", (q) => q.eq("reviewId", review._id))
    .collect();
  for (const row of old) {
    await bumpAxis(ctx, review.versionId, row.axisId, row.score, -1);
    await ctx.db.delete(row._id);
  }
  for (const [axisId, score] of next) {
    await ctx.db.insert("reviewScores", {
      reviewId: review._id,
      userId: review.userId,
      versionId: review.versionId,
      axisId,
      score,
    });
    await bumpAxis(ctx, review.versionId, axisId, score, 1);
  }
}

export async function bumpReviewerCount(ctx: MutationCtx, by: number) {
  const row = await ctx.db.query("siteStats").first();
  if (row) await ctx.db.patch(row._id, { reviewerCount: row.reviewerCount + by });
  else await ctx.db.insert("siteStats", { reviewerCount: Math.max(0, by) });
}

export async function bumpTakeCount(
  ctx: MutationCtx,
  versionId: Id<"versions">,
  by: number,
) {
  const stats = await getOrCreateStats(ctx, versionId);
  await ctx.db.patch(stats._id, { takeCount: stats.takeCount + by });
}

export async function statsFor(ctx: QueryCtx, versionId: Id<"versions">) {
  return await ctx.db
    .query("versionStats")
    .withIndex("by_version", (q) => q.eq("versionId", versionId))
    .unique();
}

export function avg(a: { sum: number; count: number }) {
  return a.count ? a.sum / a.count : null;
}

// ---------- taste match ----------

/** versionId → ("overall" | axisId) → score, for one user. */
export type ScoreMap = Map<Id<"versions">, Map<string, number>>;

export async function scoreMapFor(ctx: QueryCtx, userId: Id<"users">): Promise<ScoreMap> {
  const [reviews, scores] = await Promise.all([
    ctx.db
      .query("reviews")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("reviewScores")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  const map: ScoreMap = new Map();
  for (const r of reviews) {
    const m = new Map<string, number>();
    if (r.overall) m.set("overall", r.overall);
    map.set(r.versionId, m);
  }
  for (const s of scores) map.get(s.versionId)?.set(s.axisId, s.score);
  return map;
}

export const MIN_SHARED = 3;

/**
 * 100 × (1 − mean|a − b| / 4) over every score both users gave (overall and any
 * shared axis, core or custom) on versions both reviewed; null below 3 shared versions.
 */
export function tasteMatch(a: ScoreMap, b: ScoreMap): number | null {
  let shared = 0;
  let total = 0;
  let n = 0;
  for (const [versionId, sa] of a) {
    const sb = b.get(versionId);
    if (!sb) continue;
    shared++;
    for (const [key, x] of sa) {
      const y = sb.get(key);
      if (y === undefined) continue;
      total += Math.abs(x - y);
      n++;
    }
  }
  if (shared < MIN_SHARED || n === 0) return null;
  return Math.round(100 * (1 - total / n / 4));
}

/** Returns a function giving the viewer's taste match with any user (cached per user). */
export async function matcherFor(ctx: QueryCtx, viewerId: Id<"users"> | null) {
  const viewerMap = viewerId ? await scoreMapFor(ctx, viewerId) : null;
  const cache = new Map<Id<"users">, number | null>();
  return async (userId: Id<"users">) => {
    if (!viewerId || !viewerMap || userId === viewerId) return null;
    if (!cache.has(userId)) {
      cache.set(userId, tasteMatch(viewerMap, await scoreMapFor(ctx, userId)));
    }
    return cache.get(userId)!;
  };
}

// ---------- shared shapes ----------

export function publicUser(u: Doc<"users">) {
  return {
    _id: u._id,
    name: u.displayName ?? u.name ?? u.handle ?? "Anonymous",
    handle: u.handle ?? "",
    image: u.image,
    xHandle: u.xHandle,
  };
}

export async function versionLabel(ctx: QueryCtx, versionId: Id<"versions">) {
  const version = await ctx.db.get(versionId);
  if (!version) return null;
  const model = await ctx.db.get(version.modelId);
  if (!model) return null;
  return {
    _id: version._id,
    versionId: version.versionId,
    displayName: version.displayName,
    modelSlug: model.slug,
    family: model.family,
  };
}
