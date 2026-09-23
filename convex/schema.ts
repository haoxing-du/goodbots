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
    joinedAt: v.optional(v.number()), // seeded users only; real users use _creationTime
  })
    .index("email", ["email"])
    .index("by_handle", ["handleLower"])
    .index("by_name", ["nameLower"]),

  models: defineTable({
    family: v.string(),
    familyLower: v.string(),
    provider: v.string(),
    slug: v.string(),
  })
    .index("by_slug", ["slug"])
    .index("by_family", ["familyLower"]),

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

  versions: defineTable({
    modelId: v.id("models"),
    versionId: v.string(),
    displayName: v.string(),
    releasedAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("hidden")),
  })
    .index("by_model", ["modelId"])
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
    prompt: v.optional(v.string()),
    response: v.optional(v.string()),
    overallAtTime: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_review", ["reviewId", "createdAt"]),

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
    family: v.string(),
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

  // Singleton row of site-wide counters.
  siteStats: defineTable({
    reviewerCount: v.number(), // users with at least one review
  }),

  versionStats: defineTable({
    versionId: v.id("versions"),
    reviewCount: v.number(),
    overall: axisStat, // overall stars (optional per review)
    takeCount: v.number(),
  }).index("by_version", ["versionId"]),
});
