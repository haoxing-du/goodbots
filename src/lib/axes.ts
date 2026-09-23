/** An axis score as returned with reviews (axes come from the server now). */
export type AxisScore = { _id: string; name: string; core: boolean; hint?: string; score: number };

export const REACTIONS = [
  { kind: "agree", label: "Agree" },
  { kind: "disagree", label: "Disagree" },
  { kind: "useful", label: "Useful" },
  { kind: "hot", label: "Hot take" },
  { kind: "lol", label: "Lol" },
] as const;

export type ReactionKind = (typeof REACTIONS)[number]["kind"];
