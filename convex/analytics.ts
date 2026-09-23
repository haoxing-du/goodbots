import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { publicUser, requireAdmin } from "./lib";
import { featuredModels } from "./featured";

const DAY = 24 * 60 * 60 * 1000;
// A signup counts as "activated" if they post a review within this long.
const ACTIVATION_WINDOW = 7 * DAY;
// Recount this many recent days each run, so activation (which can change for a
// week after signup) and late deletions settle before a day freezes.
const RECOUNT_DAYS = 9;

/** UTC day key, e.g. "2026-09-22". */
export function dayKey(t: number) {
  return new Date(t).toISOString().slice(0, 10);
}

export function dayStart(day: string) {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Recounts one UTC day's dailyStats row and its dailyActiveUsers rows. */
export const rollupDay = internalMutation({
  args: { day: v.string() },
  handler: async (ctx, { day }) => {
    const start = dayStart(day);
    const end = start + DAY;
    const active = new Set<Id<"users">>();

    let signups = 0;
    let activated = 0;
    let signupsX = 0;
    let signupsEmail = 0;
    for await (const user of ctx.db
      .query("users")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", start).lt("_creationTime", end))) {
      if (user.isAnonymous) continue;
      signups++;
      const first = await ctx.db
        .query("reviews")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();
      if (first && first._creationTime - user._creationTime <= ACTIVATION_WINDOW) activated++;
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
        .first();
      if (account?.provider === "twitter") signupsX++;
      else if (account?.provider === "email") signupsEmail++;
    }

    let reviews = 0;
    let reviewsWithImage = 0;
    let reviewsRated = 0;
    let reviewWords = 0;
    for await (const review of ctx.db
      .query("reviews")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", start).lt("_creationTime", end))) {
      reviews++;
      active.add(review.userId);
      const [entry, score] = await Promise.all([
        ctx.db
          .query("reviewEntries")
          .withIndex("by_review", (q) => q.eq("reviewId", review._id))
          .first(),
        ctx.db
          .query("reviewScores")
          .withIndex("by_review", (q) => q.eq("reviewId", review._id))
          .first(),
      ]);
      if (entry?.image) reviewsWithImage++;
      if (entry) reviewWords += entry.text.split(/\s+/).filter(Boolean).length;
      if (score) reviewsRated++;
    }

    let updates = 0;
    for await (const entry of ctx.db
      .query("reviewEntries")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", start).lt("_creationTime", end))) {
      const review = await ctx.db.get(entry.reviewId);
      if (!review) continue;
      active.add(review.userId);
      // A review's first entry is written in the same mutation, with the same timestamp.
      if (entry.createdAt !== review.createdAt) updates++;
    }

    const reactions = { agree: 0, disagree: 0, useful: 0, hot: 0, lol: 0 };
    for await (const reaction of ctx.db
      .query("reactions")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", start).lt("createdAt", end))) {
      reactions[reaction.kind]++;
      active.add(reaction.userId);
    }

    let takes = 0;
    for await (const take of ctx.db
      .query("takes")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", start).lt("_creationTime", end))) {
      takes++;
      active.add(take.userId);
    }

    let axes = 0;
    for await (const axis of ctx.db
      .query("axes")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", start).lt("_creationTime", end))) {
      if (!axis.core) axes++;
    }

    let requests = 0;
    for await (const _ of ctx.db
      .query("modelRequests")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", start).lt("_creationTime", end))) {
      requests++;
    }

    let models = 0;
    for await (const _ of ctx.db
      .query("versions")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", start).lt("_creationTime", end))) {
      models++;
    }

    const row = {
      day,
      signups,
      activated,
      reviews,
      updates,
      reactions,
      takes,
      axes,
      requests,
      models,
      activeUsers: active.size,
      signupsX,
      signupsEmail,
      reviewsWithImage,
      reviewsRated,
      reviewWords,
    };
    const existing = await ctx.db
      .query("dailyStats")
      .withIndex("by_day", (q) => q.eq("day", day))
      .unique();
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("dailyStats", row);

    // Sync the day's active-user rows, touching only what changed.
    for await (const row of ctx.db
      .query("dailyActiveUsers")
      .withIndex("by_day", (q) => q.eq("day", day))) {
      if (!active.delete(row.userId)) await ctx.db.delete(row._id);
    }
    for (const userId of active) await ctx.db.insert("dailyActiveUsers", { day, userId });
  },
});

/** Cron: recount today only, so launch-day numbers stay fresh between full refreshes. */
export const refreshToday = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.analytics.rollupDay, { day: dayKey(Date.now()) });
  },
});

/** Cron: recount the last few days, each in its own transaction. */
export const refresh = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (let i = 0; i < RECOUNT_DAYS; i++) {
      await ctx.scheduler.runAfter(0, internal.analytics.rollupDay, { day: dayKey(now - i * DAY) });
    }
  },
});

/** One-off: build rows for every day since the first user signed up. `npx convex run analytics:backfill` */
export const backfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const first = await ctx.db.query("users").first();
    if (!first) return 0;
    const today = dayStart(dayKey(Date.now()));
    let days = 0;
    for (let t = dayStart(dayKey(first._creationTime)); t <= today; t += DAY) {
      await ctx.scheduler.runAfter(0, internal.analytics.rollupDay, { day: dayKey(t) });
      days++;
    }
    return days;
  },
});

// ---------- admin page ----------

type Counts = Required<Omit<Doc<"dailyStats">, "_id" | "_creationTime" | "day">>;
type DayRow = Counts & { day: string };

const emptyCounts = (): Counts => ({
  signups: 0,
  activated: 0,
  reviews: 0,
  updates: 0,
  reactions: { agree: 0, disagree: 0, useful: 0, hot: 0, lol: 0 },
  takes: 0,
  axes: 0,
  requests: 0,
  models: 0,
  activeUsers: 0,
  signupsX: 0,
  signupsEmail: 0,
  reviewsWithImage: 0,
  reviewsRated: 0,
  reviewWords: 0,
});

function addCounts(into: Counts, row: Counts) {
  for (const key of Object.keys(into) as (keyof Counts)[]) {
    if (key === "reactions") {
      for (const kind of Object.keys(into.reactions) as (keyof Counts["reactions"])[]) {
        into.reactions[kind] += row.reactions[kind];
      }
    } else {
      into[key] += row[key];
    }
  }
  return into;
}

// Reviews scanned for the period's top lists.
const TOP_SCAN = 2000;
const TOP_N = 5;

/**
 * Site analytics for the admin page: daily series and totals for the `days`
 * ending `today` (a UTC day key from the client, since queries can't read the
 * clock), the same totals for the period before, all-time totals and top lists.
 */
export const overview = query({
  args: { today: v.string(), days: v.number() },
  handler: async (ctx, { today, days }) => {
    await requireAdmin(ctx);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || ![7, 30, 90].includes(days)) {
      throw new ConvexError("Pick 7, 30 or 90 days.");
    }
    const end = dayStart(today) + DAY;
    const start = end - days * DAY;
    const prevStart = start - days * DAY;

    const rows = new Map<string, DayRow>();
    const allTime = emptyCounts();
    for await (const { _id, _creationTime, ...stored } of ctx.db.query("dailyStats")) {
      const row: DayRow = { ...emptyCounts(), ...stored };
      addCounts(allTime, row);
      if (row.day >= dayKey(prevStart) && row.day <= today) rows.set(row.day, row);
    }
    const series = (from: number): DayRow[] =>
      Array.from({ length: days }, (_, i) => {
        const day = dayKey(from + i * DAY);
        return rows.get(day) ?? { day, ...emptyCounts() };
      });
    const current = series(start);
    const previous = series(prevStart);

    // Daily active users don't add up across days; count distinct users instead.
    const distinctActive = async (from: number, to: number) => {
      const users = new Set<Id<"users">>();
      for await (const row of ctx.db
        .query("dailyActiveUsers")
        .withIndex("by_day", (q) => q.gte("day", dayKey(from)).lt("day", dayKey(to)))) {
        users.add(row.userId);
      }
      return users;
    };
    // Of a period's active users, how many were also active before it.
    const countReturning = async (users: Set<Id<"users">>, from: number) => {
      let n = 0;
      for (const userId of users) {
        const before = await ctx.db
          .query("dailyActiveUsers")
          .withIndex("by_userId_and_day", (q) => q.eq("userId", userId).lt("day", dayKey(from)))
          .first();
        if (before) n++;
      }
      return n;
    };
    const active = await distinctActive(start, end);
    const prevActive = await distinctActive(prevStart, start);
    const totals = current.reduce(addCounts, emptyCounts());
    totals.activeUsers = active.size;
    const prevTotals = previous.reduce(addCounts, emptyCounts());
    prevTotals.activeUsers = prevActive.size;
    const returning = {
      now: await countReturning(active, start),
      before: await countReturning(prevActive, prevStart),
    };

    // Top lists, from reviews posted in the period.
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", start).lt("_creationTime", end))
      .order("desc")
      .take(TOP_SCAN);
    const tally = <K extends string>(keys: K[]) => {
      const counts = new Map<K, number>();
      for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
      return [...counts].sort((a, b) => b[1] - a[1]).slice(0, TOP_N);
    };
    const topModels = (
      await Promise.all(
        tally(reviews.map((r) => r.versionId)).map(async ([id, count]) => {
          const version = await ctx.db.get(id);
          return version && { versionId: version.versionId, displayName: version.displayName, count };
        }),
      )
    ).filter((m) => m !== null);
    const topReviewers = (
      await Promise.all(
        tally(reviews.map((r) => r.userId)).map(async ([id, count]) => {
          const user = await ctx.db.get(id);
          return user && { user: publicUser(user), count };
        }),
      )
    ).filter((u) => u !== null);
    const topReviews = (
      await Promise.all(
        reviews
          .filter((r) => r.reactionCount > 0)
          .sort((a, b) => b.reactionCount - a.reactionCount)
          .slice(0, TOP_N)
          .map(async (r) => {
            const [user, version] = await Promise.all([ctx.db.get(r.userId), ctx.db.get(r.versionId)]);
            return {
              reviewId: r._id,
              reactionCount: r.reactionCount,
              user: user ? publicUser(user) : null,
              model: version?.displayName ?? "Unknown model",
            };
          }),
      )
    );

    return {
      series: current,
      totals,
      prevTotals,
      allTime,
      returning,
      top: {
        models: topModels,
        reviewers: topReviewers,
        reviews: topReviews,
        capped: reviews.length === TOP_SCAN,
      },
    };
  },
});

const THIN_MAX = 1; // model pages with this many reviews or fewer need more
const THIN_SHOWN = 10;

/** Where reviews are missing: homepage models' review counts, and the newest thinly reviewed model pages. */
export const coverage = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const reviewCount = async (versionId: Id<"versions">) =>
      (
        await ctx.db
          .query("versionStats")
          .withIndex("by_version", (q) => q.eq("versionId", versionId))
          .unique()
      )?.reviewCount ?? 0;

    const featured = await Promise.all(
      (await featuredModels(ctx)).map(async (m) => {
        const version = await ctx.db
          .query("versions")
          .withIndex("by_versionId", (q) => q.eq("versionId", m.versionId))
          .unique();
        return {
          versionId: m.versionId,
          displayName: m.displayName,
          reviews: version?.status === "active" ? await reviewCount(version._id) : 0,
        };
      }),
    );

    const thin = [];
    for await (const version of ctx.db.query("versions")) {
      if (version.status !== "active") continue;
      const reviews = await reviewCount(version._id);
      if (reviews <= THIN_MAX) {
        thin.push({
          versionId: version.versionId,
          displayName: version.displayName,
          releasedAt: version.releasedAt ?? version._creationTime,
          reviews,
        });
      }
    }
    thin.sort((a, b) => b.releasedAt - a.releasedAt);

    return { featured, thin: thin.slice(0, THIN_SHOWN), thinTotal: thin.length };
  },
});
