import type { CSSProperties } from "react";

/** An axis score as returned with reviews (axes come from the server now). */
export type AxisScore = {
  _id: string;
  name: string;
  slug?: string;
  core: boolean;
  hint?: string;
  score: number;
};

export const REACTIONS = [
  { kind: "agree", label: "Agree", emoji: "👍" },
  { kind: "disagree", label: "Disagree", emoji: "👎" },
  { kind: "useful", label: "Useful", emoji: "💡" },
  { kind: "hot", label: "Hot take", emoji: "🔥" },
  { kind: "lol", label: "Lol", emoji: "😂" },
] as const;

export type ReactionKind = (typeof REACTIONS)[number]["kind"];

// Core axes (plus "overall") with their own hue (--axis-<slug> tokens in theme.css).
const COLORED_AXES = new Set(["overall", "smarts", "taste", "vibes", "aligned"]);

/**
 * CSS variables that color an element for one axis: --axis (text/fill),
 * --axis-bg, --axis-border and --axis-star (a brighter hue for star glyphs). Undefined for custom axes, so styles fall
 * back to their neutral defaults via var(--axis, …).
 */
export function axisVars(slug: string | undefined): CSSProperties | undefined {
  if (!slug || !COLORED_AXES.has(slug)) return undefined;
  return {
    "--axis": `var(--axis-${slug})`,
    "--axis-bg": `var(--axis-${slug}-bg)`,
    "--axis-border": `var(--axis-${slug}-border)`,
    "--axis-star": `var(--axis-${slug}-star)`,
  } as CSSProperties;
}
