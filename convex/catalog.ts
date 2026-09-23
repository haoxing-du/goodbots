import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Syncs OpenRouter's public model list into the `catalog` table.
// https://openrouter.ai/api/v1/models (no key needed). Runs every 6 hours (crons.ts).

const SOURCE = "https://openrouter.ai/api/v1/models";

type OpenRouterModel = {
  id: string;
  name: string;
  created?: number;
  hugging_face_id?: string | null;
  context_length?: number | null;
  expiration_date?: string | null;
};

type Entry = {
  orId: string;
  name: string;
  provider: string;
  providerSlug: string;
  releasedAt?: number;
  hfId?: string;
  contextLength?: number;
  deprecatedAt?: number;
};

/** Drops routers, "latest" aliases and :free/:batch copies; cleans names. Exported for tests. */
export function normalize(models: OpenRouterModel[]): Entry[] {
  // Provider display names, learned from "Provider: Model" names.
  const providerNames = new Map<string, string>();
  for (const m of models) {
    const [prefix] = m.name.split(": ");
    if (m.name.includes(": ")) providerNames.set(m.id.replace(/^~/, "").split("/")[0], prefix);
  }
  const byId = new Map<string, Entry & { plain: boolean }>();
  for (const m of models) {
    if (m.id.startsWith("~") || m.id.startsWith("openrouter/")) continue; // aliases, routers
    const [base, variant] = m.id.split(":");
    const providerSlug = base.split("/")[0];
    const provider =
      providerNames.get(providerSlug) ??
      providerSlug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const name = (m.name.includes(": ") ? m.name.slice(m.name.indexOf(": ") + 2) : m.name)
      .replace(/\s*\((free|batch)\)\s*$/i, "")
      .trim();
    const entry = {
      orId: base,
      name,
      provider,
      providerSlug,
      releasedAt: m.created ? m.created * 1000 : undefined,
      hfId: m.hugging_face_id || undefined,
      contextLength: m.context_length ?? undefined,
      deprecatedAt: m.expiration_date ? Date.parse(m.expiration_date) || undefined : undefined,
      plain: !variant,
    };
    const prev = byId.get(base);
    // Prefer the plain id over :free/:batch copies of the same model.
    if (!prev || (!prev.plain && entry.plain)) byId.set(base, entry);
  }
  return [...byId.values()].map(({ plain: _plain, ...e }) => e);
}

export const sync = internalAction({
  args: {},
  handler: async (ctx) => {
    const res = await fetch(SOURCE);
    if (!res.ok) throw new Error(`OpenRouter models: HTTP ${res.status}`);
    const { data } = (await res.json()) as { data: OpenRouterModel[] };
    const entries = normalize(data);
    const now = Date.now();
    let added = 0;
    for (let i = 0; i < entries.length; i += 100) {
      added += await ctx.runMutation(internal.catalog.upsertBatch, {
        entries: entries.slice(i, i + 100),
        now,
      });
    }
    console.log(`[catalog] synced ${entries.length} models from OpenRouter (${added} new)`);
    return { total: entries.length, added };
  },
});

const entryValidator = v.object({
  orId: v.string(),
  name: v.string(),
  provider: v.string(),
  providerSlug: v.string(),
  releasedAt: v.optional(v.number()),
  hfId: v.optional(v.string()),
  contextLength: v.optional(v.number()),
  deprecatedAt: v.optional(v.number()),
});

export const upsertBatch = internalMutation({
  args: { entries: v.array(entryValidator), now: v.number() },
  handler: async (ctx, { entries, now }) => {
    let added = 0;
    for (const e of entries) {
      const doc = { ...e, searchText: `${e.name} ${e.provider} ${e.orId.replace(/[/-]/g, " ")}`, lastSeenAt: now };
      const existing = await ctx.db
        .query("catalog")
        .withIndex("by_orId", (q) => q.eq("orId", e.orId))
        .unique();
      if (existing) await ctx.db.replace(existing._id, doc);
      else {
        await ctx.db.insert("catalog", doc);
        added++;
      }
    }
    return added;
  },
});
