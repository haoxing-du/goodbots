export const AXES = [
  { key: "smarts", label: "Smarts", short: "Smarts", hint: "Gets hard things right" },
  { key: "taste", label: "Taste", short: "Taste", hint: "Knows what good looks like" },
  { key: "vibes", label: "Vibes", short: "Vibes", hint: "Pleasant to talk to" },
  { key: "aligned", label: "Aligned", short: "Aligned", hint: "Honest, not sycophantic" },
  { key: "mom", label: "Mom-approved", short: "Mom", hint: "Would recommend to mom" },
] as const;

export type AxisKey = (typeof AXES)[number]["key"];

export const REACTIONS = [
  { kind: "agree", label: "Agree" },
  { kind: "disagree", label: "Disagree" },
  { kind: "useful", label: "Useful" },
  { kind: "hot", label: "Hot take" },
  { kind: "lol", label: "Lol" },
] as const;

export type ReactionKind = (typeof REACTIONS)[number]["kind"];
