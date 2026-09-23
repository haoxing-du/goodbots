import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx } from "./_generated/server";
import { getOrCreateStats, requireAdmin } from "./lib";

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Adds a version, creating its model (by family) if needed. */
export async function createVersion(
  ctx: MutationCtx,
  args: {
    family: string;
    provider: string;
    versionId: string;
    displayName: string;
    releasedAt?: number;
  },
) {
  const versionId = args.versionId.trim();
  const dupe = await ctx.db
    .query("versions")
    .withIndex("by_versionId", (q) => q.eq("versionId", versionId))
    .first();
  if (dupe) throw new ConvexError(`Version ${versionId} already exists.`);

  const slug = slugify(args.family);
  let model = await ctx.db
    .query("models")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!model) {
    const id = await ctx.db.insert("models", {
      family: args.family.trim(),
      familyLower: args.family.trim().toLowerCase(),
      provider: args.provider.trim(),
      slug,
    });
    model = (await ctx.db.get(id))!;
  }
  const id = await ctx.db.insert("versions", {
    modelId: model._id,
    versionId,
    displayName: args.displayName.trim(),
    releasedAt: args.releasedAt ?? Date.now(),
    status: "active",
  });
  await getOrCreateStats(ctx, id);
  return id;
}

export const addVersion = mutation({
  args: {
    family: v.string(),
    provider: v.string(),
    versionId: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!args.family.trim() || !args.versionId.trim() || !args.displayName.trim()) {
      throw new ConvexError("Family, version id and display name are required.");
    }
    await createVersion(ctx, args);
  },
});
