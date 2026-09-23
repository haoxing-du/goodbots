import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

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
    }

    let reviews = 0;
    for await (const review of ctx.db
      .query("reviews")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", start).lt("_creationTime", end))) {
      reviews++;
      active.add(review.userId);
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
