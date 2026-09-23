import {
  internalAction,
  internalMutation,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { CORE_AXES } from "./lib";

/**
 * Makes the axes table match CORE_AXES (names, hints, order). Idempotent; runs
 * with every catalog sync, so a fresh deployment gets its core axes without
 * the seed script. An axis dropped from CORE_AXES becomes a regular custom axis.
 */
export async function ensureCoreAxes(ctx: MutationCtx) {
  const axes = await ctx.db.query("axes").collect();
  const bySlug = new Map(axes.map((a) => [a.slug, a]));
  for (const [order, a] of CORE_AXES.entries()) {
    const existing = bySlug.get(a.slug);
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: a.name,
        hint: a.hint,
        core: true,
        order,
        status: "active",
      });
    } else {
      await ctx.db.insert("axes", {
        ...a,
        core: true,
        order,
        status: "active",
        ratingCount: 0,
        createdAt: Date.now(),
      });
    }
  }
  const coreSlugs = new Set<string>(CORE_AXES.map((a) => a.slug));
  for (const a of axes) {
    if (a.core && !coreSlugs.has(a.slug))
      await ctx.db.patch(a._id, { core: false, order: undefined });
  }
}

export const syncCoreAxes = internalMutation({
  args: {},
  handler: async (ctx) => ensureCoreAxes(ctx),
});

/** First-deploy setup: `npx convex run setup:init --prod`. Safe to re-run. */
export const init = internalAction({
  args: {},
  handler: async (ctx): Promise<{ coreAxes: string; catalog: { total: number; added: number } }> => {
    await ctx.runMutation(internal.setup.syncCoreAxes, {});
    const catalog: { total: number; added: number } = await ctx.runAction(internal.catalog.sync, {});
    return { coreAxes: "ok", catalog };
  },
});
