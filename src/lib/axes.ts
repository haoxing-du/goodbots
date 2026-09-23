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
