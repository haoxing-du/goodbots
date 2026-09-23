import { v } from "convex/values";
import { query } from "./_generated/server";
import { publicUser } from "./lib";

/** Simple prefix match on model names/version ids and reviewer names/handles. */
export const all = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const term = q.trim().toLowerCase().replace(/^@/, "");
    if (!term) return { models: [], reviewers: [] };

    // The catalog is small and admin-curated, so match any word prefix in memory.
    const startsWord = (s: string) =>
      s.toLowerCase().startsWith(term) ||
      s.toLowerCase().split(/[\s\-_.]+/).some((w) => w.startsWith(term));
    const versions = await ctx.db.query("versions").collect();
    const models = await ctx.db.query("models").collect();
    const modelById = new Map(models.map((m) => [m._id, m]));
    const modelHits = versions
      .filter((ver) => ver.status === "active")
      .filter((ver) => {
        const m = modelById.get(ver.modelId);
        return (
          startsWord(ver.displayName) ||
          startsWord(ver.versionId) ||
          (m && (startsWord(m.family) || startsWord(m.provider)))
        );
      })
      .slice(0, 20)
      .map((ver) => {
        const m = modelById.get(ver.modelId)!;
        return {
          _id: ver._id,
          displayName: ver.displayName,
          versionId: ver.versionId,
          provider: m.provider,
          modelSlug: m.slug,
        };
      });

    const end = term + "￿";
    const [byName, byHandle] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_name", (x) => x.gte("nameLower", term).lt("nameLower", end))
        .take(10),
      ctx.db
        .query("users")
        .withIndex("by_handle", (x) => x.gte("handleLower", term).lt("handleLower", end))
        .take(10),
    ]);
    const seen = new Set<string>();
    const reviewers = [...byName, ...byHandle]
      .filter((u) => u.handle && !seen.has(u._id) && seen.add(u._id))
      .map(publicUser);

    return { models: modelHits, reviewers };
  },
});
