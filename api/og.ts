// Vercel Edge Function: renders the 1200×630 link-preview image for a page.
// Query params (set by middleware.ts): path, the page it's for, and v, a hash of
// the card's content that changes the URL (and so skips caches) when it changes.
// The card's text comes from Convex, never from the URL, so nobody can make a
// GoodBots card that says whatever they like.
import { ImageResponse } from "@vercel/og";
import { loadFonts, ogTree } from "./_og-tree";

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "/";
  const [[serif, sans, mono], params] = await Promise.all([loadFonts(), cardParams(path)]);
  const tree = ogTree(params);
  return new ImageResponse(tree as unknown as React.ReactElement, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Newsreader", data: serif, weight: 400, style: "normal" },
      { name: "Geist", data: sans, weight: 400, style: "normal" },
      { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
    ],
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
}

/** The card for a page, from Convex's /meta; the plain site card if that fails. */
async function cardParams(path: string) {
  const params = new URLSearchParams();
  const site = process.env.CONVEX_SITE_URL;
  if (!site) return params;
  try {
    const res = await fetch(`${site}/meta?path=${encodeURIComponent(path)}`);
    if (!res.ok) return params;
    const meta = (await res.json()) as { image: Record<string, string | number | undefined> };
    for (const [k, v] of Object.entries(meta.image)) if (v !== undefined && v !== "") params.set(k, String(v));
  } catch {
    // fall through to the site card
  }
  return params;
}
