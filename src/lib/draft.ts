/** An in-progress review, shared by the homepage hero and the write page. */
export type Draft = {
  overall: number; // 0 = not rated (optional)
  scores: Record<string, number>; // axisId → 1–5
  newAxes: { name: string; hint?: string; score: number }[]; // axes this reviewer is adding
  text: string;
  showSnippet: boolean;
  prompt: string;
  response: string;
};

export const EMPTY_DRAFT: Draft = {
  overall: 0,
  scores: {},
  newAxes: [],
  text: "",
  showSnippet: false,
  prompt: "",
  response: "",
};

const KEY = "gb.draft";
const MAX_AGE = 24 * 60 * 60 * 1000;

// localStorage (not sessionStorage) so the draft survives sign-in, including a
// magic link opened in a new tab. Drafts older than a day are dropped.
export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_DRAFT;
    const { savedAt, draft } = JSON.parse(raw) as { savedAt: number; draft: Partial<Draft> };
    if (!savedAt || Date.now() - savedAt > MAX_AGE) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...draft };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), draft }));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
