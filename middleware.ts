// Vercel Routing Middleware: link-preview crawlers (X, Slack, iMessage…) don't
// run JavaScript, so for them we fetch the page's metadata from Convex and put
// Open Graph / Twitter tags into index.html. Everyone else gets the SPA as-is.
//
// Needs CONVEX_SITE_URL (the deployment's .convex.site URL) in Vercel's env.

export const config = { matcher: ["/", "/m/:path*", "/u/:path*", "/r/:path*"] };

const CRAWLERS =
  /bot|crawler|spider|preview|facebookexternalhit|slack|discord|whatsapp|telegram|embedly|iframely|linkedin|pinterest|skype|vkshare|mastodon|bluesky|applebot/i;

type PageMeta = {
  title: string;
  description: string;
  image: Record<string, string | number | undefined>;
  noindex?: boolean;
};

export default async function middleware(req: Request): Promise<Response | undefined> {
  if (!CRAWLERS.test(req.headers.get("user-agent") ?? "")) return undefined;
  const site = process.env.CONVEX_SITE_URL;
  if (!site) return undefined;
  const url = new URL(req.url);
  try {
    const [metaRes, htmlRes] = await Promise.all([
      fetch(`${site}/meta?path=${encodeURIComponent(url.pathname)}`),
      fetch(new URL("/index.html", url)),
    ]);
    if (!metaRes.ok || !htmlRes.ok) return undefined;
    const meta = (await metaRes.json()) as PageMeta;
    const html = injectMeta(await htmlRes.text(), meta, url);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch {
    return undefined; // fall back to the plain SPA
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A short FNV-1a hash, for cache-busting. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** Replaces the default tags between <!--meta--> and <!--/meta--> in index.html. */
export function injectMeta(html: string, meta: PageMeta, url: URL) {
  // The image endpoint looks the card up by path; `v` changes when the card does.
  const params = new URLSearchParams({ path: url.pathname, v: hash(JSON.stringify(meta.image)) });
  const image = `${url.origin}/api/og?${params}`;
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<meta property="og:site_name" content="GoodBots" />`,
    `<meta property="og:type" content="${meta.image.kind === "review" ? "article" : "website"}" />`,
    `<meta property="og:url" content="${esc(url.origin + url.pathname)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    ...(meta.noindex ? [`<meta name="robots" content="noindex" />`] : []),
  ].join("\n    ");
  return html.replace(/<!--meta-->[\s\S]*?<!--\/meta-->/, `<!--meta-->\n    ${tags}\n    <!--/meta-->`);
}
