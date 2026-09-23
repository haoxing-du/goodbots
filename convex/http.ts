import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

// Link-preview metadata for a page path, used by the Vercel edge middleware
// that serves Open Graph tags to crawlers. Public data only.
http.route({
  path: "/meta",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const path = new URL(req.url).searchParams.get("path") ?? "/";
    const meta = await ctx.runQuery(internal.og.forPath, { path });
    return new Response(JSON.stringify(meta), {
      status: meta ? 200 : 404,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
    });
  }),
});

export default http;
