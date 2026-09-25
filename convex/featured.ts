import { ConvexError, v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib";

/** Used until an admin saves a list (e.g. on a fresh production deployment). */
export const DEFAULT_FEATURED = [
  "anthropic/claude-opus-5.5",
  "anthropic/claude-fable-5.1",
  "openai/gpt-6-astra",
  "openai/gpt-6-sol",
  "openai/gpt-6-luna",
  "x-ai/grok-4.7",
  "deepseek/deepseek-v4-pro-0813",
];

export type FeaturedModel = { versionId: string; displayName: string; provider: string };

/** Resolves a model id to a name, from its page if it has one, else from the catalog. */
export async function describe(ctx: QueryCtx, versionId: string): Promise<FeaturedModel | null> {
  const version = await ctx.db
    .query("versions")
    .withIndex("by_versionId", (q) => q.eq("versionId", versionId))
    .unique();
  if (version?.status === "active") {
    const provider = await ctx.db.get(version.providerId);
    return { versionId, displayName: version.displayName, provider: provider?.name ?? "" };
  }
  const entry = await ctx.db
    .query("catalog")
    .withIndex("by_orId", (q) => q.eq("orId", versionId))
    .unique();
  return entry ? { versionId, displayName: entry.name, provider: entry.provider } : null;
}

/** The homepage's headline models, in order. Unknown ids are skipped. */
export async function featuredModels(ctx: QueryCtx): Promise<FeaturedModel[]> {
  const rows = (await ctx.db.query("featured").collect()).sort((a, b) => a.order - b.order);
  const ids = rows.length ? rows.map((r) => r.versionId) : DEFAULT_FEATURED;
  const out = [];
  for (const id of ids) {
    const m = await describe(ctx, id);
    if (m) out.push(m);
  }
  return out;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const saved = await ctx.db.query("featured").first();
    return { models: await featuredModels(ctx), isDefault: !saved };
  },
});

/** Replaces the homepage list (admin). */
export const set = mutation({
  args: { versionIds: v.array(v.string()) },
  handler: async (ctx, { versionIds }) => {
    await requireAdmin(ctx);
    if (versionIds.length === 0) throw new ConvexError("Pick at least one model.");
    if (versionIds.length > 20) throw new ConvexError("Keep it to 20 models or fewer.");
    for (const id of versionIds) {
      if (!(await describe(ctx, id))) throw new ConvexError(`Unknown model: ${id}`);
    }
    for (const row of await ctx.db.query("featured").collect()) await ctx.db.delete(row._id);
    for (const [order, versionId] of versionIds.entries()) {
      await ctx.db.insert("featured", { versionId, order });
    }
  },
});
