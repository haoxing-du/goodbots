import { convexAuth } from "@convex-dev/auth/server";
import Twitter from "@auth/core/providers/twitter";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { internal } from "./_generated/api";
import { MagicLink } from "./magicLink";
import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    MagicLink(),
    Twitter({
      // X doesn't return email; keep the username as the public X handle.
      profile({ data }) {
        return {
          id: data.id,
          name: data.name,
          image: data.profile_image_url,
          xHandle: data.username,
        };
      },
    }),
    // Local-only: sign in as the seeded "demo" reviewer without OAuth keys.
    // Enabled only when the DEMO_LOGIN env var is "true". Never set it in production.
    ConvexCredentials({
      id: "demo",
      authorize: async (_credentials, ctx) => {
        if (process.env.DEMO_LOGIN !== "true") return null;
        const userId = await ctx.runQuery(internal.users.demoUserId, {});
        return userId ? { userId } : null;
      },
    }),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      await ensureHandle(ctx as unknown as MutationCtx, userId as Id<"users">);
    },
  },
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

async function ensureHandle(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return;
  const patch: Record<string, string> = {};
  const shownName = user.displayName ?? user.name;
  if (shownName && user.nameLower !== shownName.toLowerCase()) {
    patch.nameLower = shownName.toLowerCase();
  }
  if (!user.handle) {
    const base =
      slugify(user.xHandle ?? user.name ?? user.email?.split("@")[0] ?? "") ||
      "reader";
    let handle = base;
    for (let i = 2; ; i++) {
      const taken = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handleLower", handle))
        .first();
      if (!taken || taken._id === userId) break;
      handle = `${base}${i}`;
    }
    patch.handle = handle;
    patch.handleLower = handle;
  }
  if (Object.keys(patch).length) await ctx.db.patch(userId, patch);
}
