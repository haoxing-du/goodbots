import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { assertClean } from "./moderation";

/** The seeded axes every review form starts with, in display order. */
export const CORE_AXES = [
  { slug: "smarts", name: "Smarts", hint: "Gets hard things right" },
  { slug: "taste", name: "Taste", hint: "Knows what good looks like" },
  { slug: "vibes", name: "Vibes", hint: "Pleasant to talk to" },
  { slug: "aligned", name: "Aligned", hint: "Is a good bot" },
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

/** A signed-in user who has picked a handle; required for anything public. */
export async function requireMember(ctx: QueryCtx) {
  const user = await requireUser(ctx);
  if (!user.handle) throw new ConvexError("Pick a handle first.");
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
  assertClean(name, "axis name");
  return { name, slug };
}

/** Anyone can add axes, but at most this many per day. */
export const MAX_NEW_AXES_PER_DAY = 5;
const DAY = 24 * 60 * 60 * 1000;

export type ScoreInput = { axisId?: Id<"axes">; name?: string; hint?: string; score: number };

export function cleanAxisHint(raw: string | undefined) {
  const hint = raw?.trim().replace(/\s+/g, " ");
  if (!hint) return undefined;
  if (hint.length > 80) throw new ConvexError("Keep the description to one line (80 characters).");
  assertClean(hint, "description");
  return hint;
}

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
        const recent = await ctx.db
          .query("axes")
          .withIndex("by_creator", (q) => q.eq("createdBy", userId).gte("createdAt", Date.now() - DAY))
          .collect();
        if (recent.length >= MAX_NEW_AXES_PER_DAY) {
          throw new ConvexError(
            `You can add up to ${MAX_NEW_AXES_PER_DAY} new axes a day. Rate on existing ones for now.`,
          );
        }
        const id = await ctx.db.insert("axes", {
          name,
          slug,
          hint: cleanAxisHint(input.hint),
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

/** Takes a review out of its version's review count and overall-star stats. */
export async function removeFromVersionStats(ctx: MutationCtx, review: Doc<"reviews">) {
  const stats = await getOrCreateStats(ctx, review.versionId);
  await ctx.db.patch(stats._id, {
    reviewCount: Math.max(0, stats.reviewCount - 1),
    overall: review.overall ? bump(stats.overall, review.overall, -1) : stats.overall,
  });
}

/** Deletes a review with its entries, scores and reactions, keeping every stat in sync. */
export async function deleteReviewCascade(ctx: MutationCtx, review: Doc<"reviews">) {
  await replaceReviewScores(ctx, review, new Map());
  await removeFromVersionStats(ctx, review);
  const images = new Set<Id<"_storage">>();
  for (const e of await ctx.db
    .query("reviewEntries")
    .withIndex("by_review", (q) => q.eq("reviewId", review._id))
    .collect()) {
    await ctx.db.delete(e._id);
    if (e.image) images.add(e.image);
  }
  for (const id of images) await ctx.storage.delete(id);
  for (const r of await ctx.db
    .query("reactions")
    .withIndex("by_review", (q) => q.eq("reviewId", review._id))
    .collect()) {
    await ctx.db.delete(r._id);
  }
  await ctx.db.delete(review._id);
  const another = await ctx.db
    .query("reviews")
    .withIndex("by_user", (q) => q.eq("userId", review.userId))
    .first();
  if (!another) await bumpReviewerCount(ctx, -1);
}

/** Post an "A > B" take. Re-posting the same pair within `replaceWithin` ms replaces it. */
export async function createTake(
  ctx: MutationCtx,
  userId: Id<"users">,
  winnerVersionId: Id<"versions">,
  loserVersionId: Id<"versions">,
  reason?: string,
  replaceWithin = 0,
) {
  if (winnerVersionId === loserVersionId) throw new ConvexError("Pick two different models.");
  if (replaceWithin > 0) {
    const pair = new Set([winnerVersionId, loserVersionId]);
    const recent = await ctx.db
      .query("takes")
      .withIndex("by_user", (q) => q.eq("userId", userId).gte("createdAt", Date.now() - replaceWithin))
      .collect();
    for (const t of recent) {
      if (pair.has(t.winnerVersionId) && pair.has(t.loserVersionId)) await deleteTake(ctx, t);
    }
  }
  const trimmed = reason?.trim().slice(0, 200);
  await ctx.db.insert("takes", {
    userId,
    winnerVersionId,
    loserVersionId,
    reason: trimmed || undefined,
    createdAt: Date.now(),
  });
  await bumpTakeCount(ctx, winnerVersionId, 1);
  await bumpTakeCount(ctx, loserVersionId, 1);
}

export async function deleteTake(ctx: MutationCtx, take: Doc<"takes">) {
  await bumpTakeCount(ctx, take.winnerVersionId, -1);
  await bumpTakeCount(ctx, take.loserVersionId, -1);
  await ctx.db.delete(take._id);
}

export async function bumpReviewerCount(ctx: MutationCtx, by: number) {
  const row = await ctx.db.query("siteStats").first();
  if (row) await ctx.db.patch(row._id, { reviewerCount: Math.max(0, row.reviewerCount + by) });
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
  const provider = await ctx.db.get(version.providerId);
  return {
    _id: version._id,
    versionId: version.versionId,
    displayName: version.displayName,
    provider: provider?.name ?? "",
  };
}

// ---------- models (versions) ----------

export function slugPart(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/** "<provider>/<model>" from a provider name and a raw id (which may already include the provider). */
export function normalizeVersionId(provider: string, raw: string) {
  const [a, b] = raw.includes("/") ? raw.split("/", 2) : [provider, raw];
  const id = `${slugPart(a)}/${slugPart(b)}`;
  if (!/^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9.-]*$/.test(id)) {
    throw new ConvexError("Model ids look like provider/model, e.g. anthropic/claude-opus-4.1.");
  }
  return id;
}

export async function getOrCreateProvider(ctx: MutationCtx, slug: string, name: string) {
  const existing = await ctx.db
    .query("providers")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("providers", { name: name.trim() || slug, slug });
}

/** Creates a model page (versions row + empty stats). Throws if the id is taken. */
export async function createVersion(
  ctx: MutationCtx,
  args: {
    versionId: string; // already normalized
    displayName: string;
    provider: string; // display name
    releasedAt?: number;
    source: "catalog" | "manual";
  },
) {
  const dupe = await ctx.db
    .query("versions")
    .withIndex("by_versionId", (q) => q.eq("versionId", args.versionId))
    .first();
  if (dupe) throw new ConvexError(`${args.versionId} already exists.`);
  const providerId = await getOrCreateProvider(ctx, args.versionId.split("/")[0], args.provider);
  const id = await ctx.db.insert("versions", {
    providerId,
    versionId: args.versionId,
    displayName: args.displayName.trim(),
    releasedAt: args.releasedAt,
    status: "active",
    source: args.source,
  });
  await getOrCreateStats(ctx, id);
  return id;
}

/**
 * The model page for an id, creating it from the OpenRouter catalog if this is
 * its first review. Null if the id is neither on the site nor in the catalog.
 */
export async function findOrActivateVersion(ctx: MutationCtx, versionId: string) {
  const existing = await ctx.db
    .query("versions")
    .withIndex("by_versionId", (q) => q.eq("versionId", versionId))
    .unique();
  if (existing?.mergedInto) return await findOrActivateVersion(ctx, existing.mergedInto);
  if (existing) return existing.status === "active" ? existing : null;
  const entry = await ctx.db
    .query("catalog")
    .withIndex("by_orId", (q) => q.eq("orId", versionId))
    .unique();
  if (!entry) return null;
  const id = await createVersion(ctx, {
    versionId,
    displayName: entry.name,
    provider: entry.provider,
    releasedAt: entry.releasedAt,
    source: "catalog",
  });
  return (await ctx.db.get(id))!;
}
