// Layout of the link-preview image, shared by api/og.ts (and local tests).
// Files starting with "_" in api/ are not deployed as endpoints.

const C = {
  page: "#f5f4ef",
  ink: "#171715",
  muted: "#5f5d56",
  faint: "#6f6c63",
  empty: "#dcdad2",
  olive: "#8f8f24",
};

const font = (url: string) => fetch(url).then((r) => r.arrayBuffer());
let fonts: Promise<ArrayBuffer[]> | null = null;
export function loadFonts() {
  fonts ??= Promise.all([
    font("https://cdn.jsdelivr.net/fontsource/fonts/newsreader@latest/latin-400-normal.woff"),
    font("https://cdn.jsdelivr.net/fontsource/fonts/geist-sans@latest/latin-400-normal.woff"),
    font("https://cdn.jsdelivr.net/fontsource/fonts/geist-mono@latest/latin-400-normal.woff"),
  ]);
  return fonts;
}

export type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string | null | false)[]): Node => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter(Boolean) },
});

const STAR = "M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21.2l1.6-7L2 9.5l7.1-.6z";
function stars(n: number, size: number): Node {
  return {
    type: "div",
    props: {
      style: { display: "flex", gap: 6 },
      children: [1, 2, 3, 4, 5].map((i) => ({
        type: "svg",
        props: {
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          children: [{ type: "path", props: { d: STAR, fill: i <= n ? C.ink : C.empty } }],
        },
      })),
    },
  };
}

// Logo stars in hue order (red, gold, green, blue, violet); hex twins of the --axis-*-star tokens.
const LOGO_STARS = ["#df6862", "#cb7f00", "#3eab5e", "#009ee0", "#a878db"];
function wordmark(size: number): Node {
  const star = size * 0.5;
  return h(
    "div",
    { alignItems: "flex-start", gap: size * 0.16, lineHeight: 1 },
    h("div", { fontFamily: "Newsreader", fontSize: size, letterSpacing: size * -0.01 }, "GoodBots"),
    {
      type: "div",
      props: {
        style: { display: "flex", gap: star * 0.1, marginTop: size * 0.17 },
        children: LOGO_STARS.map((fill) => ({
          type: "svg",
          props: { width: star, height: star, viewBox: "0 0 24 24", children: [{ type: "path", props: { d: STAR, fill } }] },
        })),
      },
    },
  );
}

const LABEL: Record<string, string> = { site: "", model: "Model", user: "Reviewer", review: "Review" };

/** Builds the image tree from the query string (kind, title, sub, stat, stars, quote). */
export function ogTree(p: URLSearchParams): Node {
  const kind = p.get("kind") ?? "site";
  const title = (p.get("title") ?? "GoodBots").slice(0, 80);
  const sub = p.get("sub")?.slice(0, 100);
  const stat = p.get("stat");
  const n = Number(p.get("stars") ?? 0);
  const quote = p.get("quote")?.slice(0, 240);
  const titleSize = title.length > 28 ? 64 : 84;
  const tree = h(
    "div",
    {
      width: "100%",
      height: "100%",
      background: C.page,
      padding: "56px 72px",
      flexDirection: "column",
      justifyContent: "space-between",
      fontFamily: "Geist",
      color: C.ink,
    },
    h(
      "div",
      { justifyContent: "space-between", alignItems: "baseline" },
      wordmark(40),
      h("div", { fontFamily: "Geist Mono", fontSize: 22, letterSpacing: 2, color: C.faint, textTransform: "uppercase" }, LABEL[kind] ?? ""),
    ),
    h(
      "div",
      { flexDirection: "column", gap: 18 },
      h("div", { fontFamily: "Newsreader", fontSize: titleSize, lineHeight: 1.05, letterSpacing: -1.5 }, title),
      sub ? h("div", { fontSize: 30, color: C.muted }, sub) : null,
      stat || n
        ? h(
            "div",
            { alignItems: "center", gap: 24, marginTop: 6 },
            stat ? h("div", { fontSize: 72, fontWeight: 300, lineHeight: 1 }, stat) : null,
            n ? stars(n, 48) : null,
          )
        : null,
    ),
    quote
      ? h(
          "div",
          { borderLeft: `4px solid ${C.olive}`, paddingLeft: 24, fontFamily: "Newsreader", fontSize: 34, lineHeight: 1.35, color: C.ink },
          `“${quote}”`,
        )
      : h("div", { fontFamily: "Geist Mono", fontSize: 22, color: C.faint }, "Reviews of AI models, by the people who use them"),
  );

  return tree;
}
