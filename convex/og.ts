import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { featuredModels } from "./featured";
import { avg, axisIndex, compareAxes, scoresForReview, statsFor, versionLabel } from "./lib";

/** What a link preview (Open Graph card) shows for a page. */
export type PageMeta = {
  title: string;
  description: string;
  image: {
    kind: "site" | "model" | "user" | "review";
    title: string;
    sub?: string;
    stat?: string; // e.g. "4.3"
    stars?: number; // 0–5
    quote?: string;
  };
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const SITE: PageMeta = {
  title: "GoodBots — Reviews of AI models, by the humans who interact with them",
  description:
    "Rate models on smarts, taste, vibes and whatever else you care about. See all the opinionated reviews, head-to-head takes, and reviewers whose taste matches yours.",
  image: { kind: "site", title: "So what did you think?" },
};

/** Meta for a path: "/", "/m/<provider>/<model>", "/u/<handle>" or "/r/<reviewId>". Null if unknown. */
export const forPath = internalQuery({
  args: { path: v.string() },
  handler: async (ctx, { path }): Promise<PageMeta | null> => {
    const [, kind, ...rest] = path.split("/");
    const id = rest.map(decodeURIComponent).join("/");
    if (!kind) {
      // Same model the homepage headline defaults to: the first featured one.
      const [lead] = await featuredModels(ctx);
      if (!lead) return SITE;
      return { ...SITE, image: { ...SITE.image, title: `So what did you think of\n${lead.displayName}?` } };
    }

    if (kind === "m" && id) {
      const version = await ctx.db
        .query("versions")
        .withIndex("by_versionId", (q) => q.eq("versionId", id))
        .unique();
      if (!version || version.status !== "active") return null;
      const provider = await ctx.db.get(version.providerId);
      const stats = await statsFor(ctx, version._id);
      const overall = stats ? avg(stats.overall) : null;
      const axes = await axisIndex(ctx);
      const coreStats = await ctx.db
        .query("axisStats")
        .withIndex("by_version_axis", (q) => q.eq("versionId", version._id))
        .collect();
      const core = coreStats
        .map((s) => ({ axis: axes.get(s.axisId), avg: avg(s) }))
        .filter((x) => x.axis?.core && x.avg != null)
        .sort((a, b) => compareAxes(a.axis!, b.axis!))
        .map((x) => `${x.axis!.name} ${x.avg!.toFixed(1)}`);
      const n = stats?.reviewCount ?? 0;
      return {
        title: `${version.displayName} on GoodBots`,
        description: [
          overall != null ? `${overall.toFixed(1)} overall from ${n} ${n === 1 ? "review" : "reviews"}` : `${n} reviews`,
          ...core,
        ].join(" · "),
        image: {
          kind: "model",
          title: version.displayName,
          sub: `${provider?.name ?? ""} · ${n} ${n === 1 ? "review" : "reviews"}`,
          stat: overall != null ? overall.toFixed(1) : undefined,
          stars: overall != null ? Math.round(overall) : undefined,
        },
      };
    }

    if (kind === "u" && id) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handleLower", id.toLowerCase()))
        .unique();
      if (!user?.handle) return null;
      const name = user.displayName ?? user.name ?? user.handle;
      const reviews = await ctx.db
        .query("reviews")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      const latest = reviews.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const latestVersion = latest ? await versionLabel(ctx, latest.versionId) : null;
      const entry = latest
        ? await ctx.db
            .query("reviewEntries")
            .withIndex("by_review", (q) => q.eq("reviewId", latest._id))
            .order("desc")
            .first()
        : null;
      return {
        title: `${name} (@${user.handle}) on GoodBots`,
        description: entry
          ? `${reviews.length} reviews. Latest, on ${latestVersion?.displayName}: “${clip(entry.text, 160)}”`
          : `${name} reviews AI models on GoodBots.`,
        image: {
          kind: "user",
          title: name,
          sub: `@${user.handle} · ${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}`,
          quote: entry ? clip(entry.text, 180) : undefined,
        },
      };
    }

    if (kind === "r" && id) {
      const reviewId = ctx.db.normalizeId("reviews", id);
      const review = reviewId ? await ctx.db.get(reviewId) : null;
      if (!review) return null;
      const [user, version, entry, scores] = await Promise.all([
        ctx.db.get(review.userId),
        versionLabel(ctx, review.versionId),
        ctx.db
          .query("reviewEntries")
          .withIndex("by_review", (q) => q.eq("reviewId", review._id))
          .order("desc")
          .first(),
        scoresForReview(ctx, review._id, await axisIndex(ctx)),
      ]);
      const name = user?.displayName ?? user?.name ?? user?.handle ?? "Someone";
      const stars = review.overall ? ` ${"★".repeat(review.overall)}${"☆".repeat(5 - review.overall)}` : "";
      return {
        title: `${name} on ${version?.displayName}:${stars}`,
        description: clip(
          [entry?.text ?? "", scores.map((s) => `${s.name} ${s.score}`).join(" · ")].filter(Boolean).join(" — "),
          280,
        ),
        image: {
          kind: "review",
          title: version?.displayName ?? "A model",
          sub: `${name}${user?.handle ? ` (@${user.handle})` : ""}`,
          stars: review.overall,
          quote: clip(entry?.text ?? "", 220),
        },
      };
    }
    return null;
  },
});
