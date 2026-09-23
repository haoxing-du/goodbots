// Vercel Edge Function: renders the 1200×630 link-preview image for a page.
// Query params (set by middleware.ts): kind, title, sub, stat, stars, quote.
import { ImageResponse } from "@vercel/og";
import { loadFonts, ogTree } from "./_og-tree";

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  const [serif, sans, mono] = await loadFonts();
  const tree = ogTree(new URL(req.url).searchParams);
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
