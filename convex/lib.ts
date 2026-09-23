import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

export const AXES = ["smarts", "taste", "vibes", "aligned", "mom"] as const;
export type Axis = (typeof AXES)[number];
export type Scores = { overall: number } & Partial<Record<Axis, number>>;

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

export function scoresOf(r: Doc<"reviews">): Scores {
  const s: Scores = { overall: r.overall };
  for (const a of AXES) if (r[a] !== undefined) s[a] = r[a];
  return s;
}

// ---------- versionStats ----------

const emptyAxis = () => ({ sum: 0, count: 0, hist: [0, 0, 0, 0, 0] });

export async function getOrCreateStats(
  ctx: MutationCtx,
  versionId: Id<"versions">,
) {
  const existing = await ctx.db
    .query("versionStats")
    .withIndex("by_version", (q) => q.eq("versionId", versionId))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("versionStats", {
    versionId,
    reviewCount: 0,
    overall: emptyAxis(),
    smarts: emptyAxis(),
    taste: emptyAxis(),
    vibes: emptyAxis(),
    aligned: emptyAxis(),
    mom: emptyAxis(),
    takeCount: 0,
  });
  return (await ctx.db.get(id))!;
}

/** Remove `prev` scores (if any) and add `next` scores (if any) to a version's stats. */
export async function applyScoresToStats(
  ctx: MutationCtx,
  versionId: Id<"versions">,
  prev: Scores | null,
  next: Scores | null,
) {
  const stats = await getOrCreateStats(ctx, versionId);
  const patch: Partial<Doc<"versionStats">> = {
    reviewCount: stats.reviewCount + (next ? 1 : 0) - (prev ? 1 : 0),
  };
  for (const key of ["overall", ...AXES] as const) {
    const cur = stats[key];
    const out = { sum: cur.sum, count: cur.count, hist: [...cur.hist] };
    const p = prev?.[key];
    const n = next?.[key];
    if (p !== undefined) {
      out.sum -= p;
      out.count -= 1;
      out.hist[p - 1] -= 1;
    }
    if (n !== undefined) {
      out.sum += n;
      out.count += 1;
      out.hist[n - 1] += 1;
    }
    patch[key] = out;
  }
  await ctx.db.patch(stats._id, patch);
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

export type ScoreMap = Map<Id<"versions">, Scores>;

export async function scoreMapFor(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<ScoreMap> {
  const reviews = await ctx.db
    .query("reviews")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Map(reviews.map((r) => [r.versionId, scoresOf(r)]));
}

export const MIN_SHARED = 3;

/** 100 × (1 − mean|a − b| / 4) over overall + shared axes of shared versions; null below 3 shared versions. */
export function tasteMatch(a: ScoreMap, b: ScoreMap): number | null {
  let shared = 0;
  let total = 0;
  let n = 0;
  for (const [versionId, sa] of a) {
    const sb = b.get(versionId);
    if (!sb) continue;
    shared++;
    for (const key of ["overall", ...AXES] as const) {
      const x = sa[key];
      const y = sb[key];
      if (x === undefined || y === undefined) continue;
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
