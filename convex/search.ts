import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { publicUser, statsFor } from "./lib";

export type ModelHit = {
  versionId: string;
  displayName: string;
  provider: string;
  reviewCount: number; // 0 = in the catalog, nobody has reviewed it yet
  releasedAt?: number;
};

/**
 * Models matching a query: every model with a page (word-prefix match, so hand-added
 * ones are found) plus the OpenRouter catalog (full-text search). Reviewed models first.
 */
export async function searchModels(ctx: QueryCtx, q: string, limit: number): Promise<ModelHit[]> {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  const startsWord = (s: string) =>
    s.toLowerCase().startsWith(term) ||
    s.toLowerCase().split(/[\s\-_./]+/).some((w) => w.startsWith(term));
  // Every typed word is the start of some word in the name/provider ("gemini 3" → Gemini 3.x).
  const terms = term.split(/\s+/).filter(Boolean);
  const matchesAll = (h: { displayName: string; provider: string }) => {
    const words = `${h.displayName} ${h.provider}`.toLowerCase().split(/[\s\-_/]+/);
    return terms.every((t) => words.some((w) => w.startsWith(t)));
  };

  const [versions, providers, catalogHits] = await Promise.all([
    ctx.db.query("versions").collect(),
    ctx.db.query("providers").collect(),
    ctx.db
      .query("catalog")
      .withSearchIndex("search", (x) => x.search("searchText", q))
      .take(limit),
  ]);
  const providerName = new Map(providers.map((p) => [p._id, p.name]));
  const hits = new Map<string, ModelHit>();
  for (const ver of versions) {
    if (ver.status !== "active") continue;
    const provider = providerName.get(ver.providerId) ?? "";
    const multi = term.includes(" ") && `${ver.displayName} ${provider}`.toLowerCase().includes(term);
    if (!multi && !startsWord(ver.displayName) && !startsWord(ver.versionId) && !startsWord(provider)) continue;
    const stats = await statsFor(ctx, ver._id);
    hits.set(ver.versionId, {
      versionId: ver.versionId,
      displayName: ver.displayName,
      provider,
      reviewCount: stats?.reviewCount ?? 0,
      releasedAt: ver.releasedAt,
    });
  }
  for (const c of catalogHits) {
    if (hits.has(c.orId)) continue;
    const onSite = versions.find((ver) => ver.versionId === c.orId && ver.status === "active");
    const stats = onSite ? await statsFor(ctx, onSite._id) : null;
    hits.set(c.orId, {
      versionId: c.orId,
      displayName: c.name,
      provider: c.provider,
      reviewCount: stats?.reviewCount ?? 0,
      releasedAt: c.releasedAt,
    });
  }
  // Close matches first (all typed words match): reviewed ones by review count, then
  // unreviewed newest first. Looser full-text matches after, in relevance order.
  const all = [...hits.values()];
  const close = all.filter(matchesAll);
  const loose = all.filter((h) => !matchesAll(h));
  const reviewed = close.filter((h) => h.reviewCount > 0).sort((a, b) => b.reviewCount - a.reviewCount);
  const fresh = close
    .filter((h) => h.reviewCount === 0)
    .sort((a, b) => (b.releasedAt ?? 0) - (a.releasedAt ?? 0));
  return [...reviewed, ...fresh, ...loose].slice(0, limit);
}

/** Model picker search (write page, homepage, request form). */
export const models = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => await searchModels(ctx, q, 12),
});

/** Search page: models (site + catalog) and reviewers by name/handle prefix. */
export const all = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const term = q.trim().toLowerCase().replace(/^@/, "");
    if (!term) return { models: [], reviewers: [] };
    const modelHits = await searchModels(ctx, q, 24);

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
