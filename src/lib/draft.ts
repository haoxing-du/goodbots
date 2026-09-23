/** An in-progress review, shared by the homepage hero and the write page. */
export type Draft = {
  overall: number; // 0 = not rated (optional)
  scores: Record<string, number>; // axisId → 1–5
  newAxes: { name: string; hint?: string; score: number }[]; // axes this reviewer is adding
  text: string;
  image: { id: string; url: string } | null; // an uploaded, not yet posted screenshot
  imageCaption: string;
  versus: { versionId: string; reviewedWins: boolean } | null; // optional head-to-head (versions _id)
};

export const EMPTY_DRAFT: Draft = {
  overall: 0,
  scores: {},
  newAxes: [],
  text: "",
  image: null,
  imageCaption: "",
  versus: null,
};

const KEY = "gb.drafts"; // { [versionId]: { savedAt, draft } }
const MAX_AGE = 24 * 60 * 60 * 1000;

type Store = Record<string, { savedAt: number; draft: Partial<Draft> }>;

// localStorage (not sessionStorage) so a draft survives sign-in, including a
// magic link opened in a new tab. One draft per model version; drafts older
// than a day are dropped.
function readStore(): Store {
  try {
    const store = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
    const now = Date.now();
    for (const [k, v] of Object.entries(store)) if (!v?.savedAt || now - v.savedAt > MAX_AGE) delete store[k];
    return store;
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
    localStorage.removeItem("gb.draft"); // pre-per-version key
  } catch {
    /* storage unavailable */
  }
}

export function loadDraft(versionId: string): Draft {
  const entry = readStore()[versionId];
  if (!entry) return EMPTY_DRAFT;
  // Drop fields from older drafts (the prompt/response snippet).
  const { showSnippet: _s, prompt: _p, response: _r, ...rest } = entry.draft as Partial<Draft> & {
    showSnippet?: unknown;
    prompt?: unknown;
    response?: unknown;
  };
  return { ...EMPTY_DRAFT, ...rest };
}

export function saveDraft(versionId: string, draft: Draft | null) {
  const store = readStore();
  if (draft) store[versionId] = { savedAt: Date.now(), draft };
  else delete store[versionId];
  writeStore(store);
}

/** Adds homepage text/ratings to a version's draft without wiping what's already there. */
export function mergeIntoDraft(versionId: string, text: string, scores: Record<string, number>) {
  const existing = loadDraft(versionId);
  saveDraft(versionId, {
    ...existing,
    text: text.trim() ? text : existing.text,
    scores: { ...existing.scores, ...scores },
  });
}
