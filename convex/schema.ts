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

  versions: defineTable({
    modelId: v.id("models"),
    versionId: v.string(),
    displayName: v.string(),
    releasedAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("hidden")),
  })
    .index("by_model", ["modelId"])
    .index("by_versionId", ["versionId"]),

  reviews: defineTable({
    userId: v.id("users"),
    versionId: v.id("versions"),
    overall: v.number(),
    smarts: v.optional(v.number()),
    taste: v.optional(v.number()),
    vibes: v.optional(v.number()),
    aligned: v.optional(v.number()),
    mom: v.optional(v.number()),
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
    overallAtTime: v.number(),
    createdAt: v.number(),
  }).index("by_review", ["reviewId", "createdAt"]),

  reactions: defineTable({
    reviewId: v.id("reviews"),
    userId: v.id("users"),
    kind: reactionKind,
    createdAt: v.number(),
  })
    .index("by_review_user_kind", ["reviewId", "userId", "kind"])
    .index("by_review", ["reviewId"])
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
  }).index("by_status", ["status"]),

  // Singleton row of site-wide counters.
  siteStats: defineTable({
    reviewerCount: v.number(), // users with at least one review
  }),

  versionStats: defineTable({
    versionId: v.id("versions"),
    reviewCount: v.number(),
    overall: axisStat,
    smarts: axisStat,
    taste: axisStat,
    vibes: axisStat,
    aligned: axisStat,
    mom: axisStat,
    takeCount: v.number(),
  }).index("by_version", ["versionId"]),
});
