import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export const reactionKind = v.union(
  v.literal("agree"),
  v.literal("disagree"),
  v.literal("useful"),
  v.literal("hot"),
  v.literal("lol"),
);

export const reactionCounts = v.object({
  agree: v.number(),
  disagree: v.number(),
  useful: v.number(),
  hot: v.number(),
  lol: v.number(),
});

const axisStat = v.object({
  sum: v.number(),
  count: v.number(),
  hist: v.array(v.number()), // counts of 1..5
});

export default defineSchema({
  ...authTables,

  // Extends Convex Auth's users table with GoodBots profile fields.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Set by the user on their profile. Takes priority over `name`, which the
    // OAuth provider overwrites on every sign-in.
    displayName: v.optional(v.string()),
    handle: v.optional(v.string()),
    handleLower: v.optional(v.string()),
    nameLower: v.optional(v.string()),
    xHandle: v.optional(v.string()),
    xId: v.optional(v.string()), // X's permanent numeric account id (usernames can change)
    joinedAt: v.optional(v.number()), // seeded users only; real users use _creationTime
  })
    .index("email", ["email"])
    .index("by_handle", ["handleLower"])
    .index("by_name", ["nameLower"]),

  // Who makes a model ("Anthropic", slug "anthropic"). Used to group models.
  providers: defineTable({
    name: v.string(),
    slug: v.string(), // first segment of version ids, e.g. "anthropic"
  }).index("by_slug", ["slug"]),

  // Every model OpenRouter lists, synced by a cron (convex/catalog.ts). A site
  // model page (versions row) is only created when someone first reviews one.
  catalog: defineTable({
    orId: v.string(), // e.g. "anthropic/claude-opus-4.1" (no :free/:batch suffix)
    name: v.string(), // "Claude Opus 4.1"
    provider: v.string(), // "Anthropic"
    providerSlug: v.string(), // "anthropic"
    releasedAt: v.optional(v.number()),
    hfId: v.optional(v.string()),
    contextLength: v.optional(v.number()),
    deprecatedAt: v.optional(v.number()),
    searchText: v.string(), // name + provider + id, for the search index
    lastSeenAt: v.number(), // last sync that listed it (entries are never deleted)
  })
    .index("by_orId", ["orId"])
    .searchIndex("search", { searchField: "searchText" }),

  // A model with a page on the site (created on its first review, or by an admin).
  versions: defineTable({
    providerId: v.id("providers"),
    versionId: v.string(), // "<provider>/<model>", e.g. "anthropic/claude-opus-4.1" (= OpenRouter id)
    displayName: v.string(),
    releasedAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("hidden")),
    source: v.union(v.literal("catalog"), v.literal("manual")),
    mergedInto: v.optional(v.string()), // set when an admin merged this model into another
  })
    .index("by_provider", ["providerId"])
    .index("by_versionId", ["versionId"]),

  // Things to rate models on. Core axes are seeded; anyone signed in can add more.
  axes: defineTable({
    name: v.string(),
    slug: v.string(), // normalized name, unique
    hint: v.optional(v.string()),
    core: v.boolean(),
    order: v.optional(v.number()), // display order for core axes
    status: v.union(v.literal("active"), v.literal("hidden")),
    ratingCount: v.number(), // site-wide number of scores on this axis
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_creator", ["createdBy", "createdAt"]),

  reviews: defineTable({
    userId: v.id("users"),
    versionId: v.id("versions"),
    overall: v.optional(v.number()), // 1–5 stars, optional
    reactionCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_version", ["userId", "versionId"])
    .index("by_user", ["userId"])
    .index("by_version", ["versionId"])
    .index("by_version_reactions", ["versionId", "reactionCount"])
    .index("by_updatedAt", ["updatedAt"]),

  reviewEntries: defineTable({
    reviewId: v.id("reviews"),
    text: v.string(),
    image: v.optional(v.id("_storage")), // one screenshot per entry
    imageAlt: v.optional(v.string()), // the screenshot's caption, shown under it
    prompt: v.optional(v.string()), // legacy: the form no longer offers prompt/response
    response: v.optional(v.string()),
    overallAtTime: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_review", ["reviewId", "createdAt"]),

  // Screenshots uploaded but not yet attached to a review entry. The row is
  // deleted when the image is posted; a cron deletes stale ones and their files.
  uploads: defineTable({
    storageId: v.id("_storage"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_storage", ["storageId"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  // One row per review per rated axis (the review's current scores).
  reviewScores: defineTable({
    reviewId: v.id("reviews"),
    userId: v.id("users"),
    versionId: v.id("versions"),
    axisId: v.id("axes"),
    score: v.number(),
  })
    .index("by_review", ["reviewId"])
    .index("by_user", ["userId"])
    .index("by_axis", ["axisId"]),

  // Denormalized per-version, per-axis aggregates, updated in the same mutations.
  axisStats: defineTable({
    versionId: v.id("versions"),
    axisId: v.id("axes"),
    sum: v.number(),
    count: v.number(),
    hist: v.array(v.number()), // counts of 1..5
  })
    .index("by_version_axis", ["versionId", "axisId"])
    .index("by_axis", ["axisId"]),

  reactions: defineTable({
    reviewId: v.id("reviews"),
    userId: v.id("users"),
    kind: reactionKind,
    createdAt: v.number(),
  })
    .index("by_review_user_kind", ["reviewId", "userId", "kind"])
    .index("by_review", ["reviewId"])
    .index("by_user", ["userId"])
    .index("by_createdAt", ["createdAt"]),

  takes: defineTable({
    userId: v.id("users"),
    winnerVersionId: v.id("versions"),
    loserVersionId: v.id("versions"),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_winner", ["winnerVersionId"])
    .index("by_loser", ["loserVersionId"])
    .index("by_user", ["userId", "createdAt"]),

  modelRequests: defineTable({
    userId: v.id("users"),
    name: v.string(), // model name, e.g. "Claude Opus 5.5"
    versionId: v.string(),
    provider: v.string(),
    link: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_user", ["userId"]),

  // Homepage headline models, in order (admin-picked). Empty = DEFAULT_FEATURED in featured.ts.
  featured: defineTable({
    versionId: v.string(), // "<provider>/<model>"; may be a catalog model without a page yet
    order: v.number(),
  }),

  // Singleton row of site-wide counters.
  siteStats: defineTable({
    reviewerCount: v.number(), // users with at least one review
  }),

  // Site analytics, one row per UTC day ("2026-09-22"). Rebuilt hourly for recent
  // days by convex/analytics.ts; a day's counts freeze once it's past the recount window.
  dailyStats: defineTable({
    day: v.string(),
    signups: v.number(),
    activated: v.number(), // of that day's signups, how many posted a review within 7 days
    reviews: v.number(), // new reviews (first post on a model)
    updates: v.number(), // follow-up entries on existing reviews
    reactions: reactionCounts,
    takes: v.number(), // head-to-heads
    axes: v.number(), // custom axes created
    requests: v.number(), // model requests
    models: v.number(), // new model pages
    activeUsers: v.number(), // distinct users who reviewed, updated, reacted or did a head-to-head
    // Added later, so optional (read missing as 0).
    signupsX: v.optional(v.number()), // signed up with X
    signupsEmail: v.optional(v.number()), // signed up with an email link
    reviewsWithImage: v.optional(v.number()), // new reviews whose first entry has a screenshot
    reviewsRated: v.optional(v.number()), // new reviews that score at least one axis
    reviewWords: v.optional(v.number()), // words across new reviews' first entries
  }).index("by_day", ["day"]),

  // Who was active on each UTC day, so a period's distinct active users can be counted.
  dailyActiveUsers: defineTable({
    day: v.string(),
    userId: v.id("users"),
  })
    .index("by_day", ["day"])
    .index("by_userId_and_day", ["userId", "day"]),

  versionStats: defineTable({
    versionId: v.id("versions"),
    reviewCount: v.number(),
    overall: axisStat, // overall stars (optional per review)
    takeCount: v.number(),
  }).index("by_version", ["versionId"]),
});
