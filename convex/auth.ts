import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import Twitter from "@auth/core/providers/twitter";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { internal } from "./_generated/api";
import { MagicLink } from "./magicLink";
import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { claimImports } from "./xPosts";
import { ensureHandle } from "./lib";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    MagicLink(),
    Twitter({
      // Ask X only for what sign-in needs. X requires users.read + tweet.read to read
      // the signed-in profile; the default also asks for offline.access ("stay
      // connected"), which we don't use since we never call X after sign-in.
      authorization: "https://x.com/i/oauth2/authorize?scope=users.read%20tweet.read",
      // X doesn't return email; keep the username as the public X handle.
      profile(response) {
        // X answers /2/users/me with { data: {...} }, or with an error body (e.g. when the
        // developer app's access tier or credits don't cover it). Surface the error.
        const data = (response as { data?: typeof response.data }).data;
        if (!data?.id) {
          throw new Error(`X profile lookup failed: ${JSON.stringify(response).slice(0, 500)}`);
        }
        return {
          id: data.id,
          name: data.name,
          image: data.profile_image_url,
          xHandle: data.username,
          xId: data.id,
        };
      },
    }),
    Google({
      // Keep the email only if Google has verified it. The email links this sign-in to
      // an existing account with the same address, and ADMIN_EMAILS matches on it.
      profile(profile) {
        const verified = profile.email_verified === true;
        return {
          id: profile.sub,
          name: profile.name,
          image: profile.picture,
          ...(verified ? { email: profile.email, emailVerified: true } : {}),
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
      // Take over reviews imported from this X account first, so its handle is free.
      await claimImports(ctx as unknown as MutationCtx, userId as Id<"users">);
      await ensureHandle(ctx as unknown as MutationCtx, userId as Id<"users">);
    },
  },
});
