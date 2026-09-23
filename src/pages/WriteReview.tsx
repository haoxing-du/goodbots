import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { MinimalBar } from "../components/TopBar";
import { useSignIn } from "../components/SignIn";
import { AXES } from "../lib/axes";
import { Draft, loadDraft, saveDraft } from "../lib/draft";
import { proseDate } from "../lib/format";
import ui from "../components/ui.module.css";
import s from "./WriteReview.module.css";

export function WriteReview() {
  const [params, setParams] = useSearchParams();
  const data = useQuery(api.reviews.forWrite);
  const upsert = useMutation(api.reviews.upsert);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { open, requireAuth } = useSignIn();

  // Text and stars started on the homepage arrive through the saved draft.
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [posted, setPosted] = useState<Id<"versions"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) open("Sign in to write a review. You can browse without an account.");
  }, [isLoading, isAuthenticated, open]);

  useEffect(() => {
    if (!posted) saveDraft(draft);
  }, [draft, posted]);

  const selected = useMemo(() => {
    if (!data) return null;
    const want = params.get("v");
    return data.options.find((o) => o.versionId === want) ?? data.options[0] ?? null;
  }, [data, params]);

  const community = useQuery(
    api.reviews.communityAfterPost,
    posted ? { versionId: posted } : "skip",
  );

  if (!data) return <MinimalBar />;
  if (!selected) {
    return (
      <>
        <MinimalBar />
        <div className={ui.page}>
          <p>No models to review yet.</p>
        </div>
      </>
    );
  }

  const done = posted === selected._id;
  const priorAt = data.prior[selected._id];
  const rated = AXES.filter((a) => draft.axes[a.key]).length;
  const canPost = draft.overall > 0 && draft.text.trim().length > 0 && !busy;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = () =>
    requireAuth(async () => {
      if (!canPost) return;
      setBusy(true);
      setError(null);
      try {
        await upsert({
          versionId: selected._id,
          overall: draft.overall,
          ...draft.axes,
          text: draft.text,
          prompt: draft.showSnippet ? draft.prompt : undefined,
          response: draft.showSnippet ? draft.response : undefined,
        });
        setPosted(selected._id);
        saveDraft(null);
      } catch (e) {
        setError(e instanceof ConvexError ? String(e.data) : "Couldn't post your review. Try again.");
      } finally {
        setBusy(false);
      }
    }, "Sign in to post your review. Your draft is kept.");

  return (
    <>
      <MinimalBar />
      <div className={s.layout}>
        <div className={s.main}>
          <h1 className={ui.serifTitle}>Review a model</h1>

          <select
            className={`${ui.input} ${s.versionSelect}`}
            value={selected.versionId}
            disabled={done}
            aria-label="Model version"
            onChange={(e) => {
              setPosted(null);
              setParams({ v: e.target.value }, { replace: true });
            }}
          >
            {data.options.map((o) => (
              <option key={o._id} value={o.versionId}>
                {o.displayName} · {o.versionId}
              </option>
            ))}
          </select>

          {priorAt && !done && (
            <div className={s.notice}>
              You reviewed this version on {proseDate(priorAt)}. Posting now adds a dated update to that
              review; the new scores replace the old ones.
            </div>
          )}

          {done && (
            <div className={s.posted} role="status">
              <span>Posted. Community averages are now shown next to your scores.</span>
              <span className={s.postedActions}>
                <Link to={`/m/${selected.modelSlug}/${selected.versionId}`}>See it on the model page</Link>
                <button
                  type="button"
                  className={ui.btnGhost}
                  onClick={() => setPosted(null)}
                >
                  Edit
                </button>
              </span>
            </div>
          )}

          <div className={`${ui.card} ${ui.rows} ${s.ratingCard}`}>
            <div className={s.overallRow}>
              <div>
                <div className={s.axisLabel}>Overall</div>
                <div className={s.axisHint}>Required</div>
              </div>
              <div className={s.starButtons} role="radiogroup" aria-label="Overall stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={draft.overall === n}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    disabled={done}
                    className={n <= draft.overall ? s.starOn : s.starOff}
                    onClick={() => set({ overall: draft.overall === n ? 0 : n })}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className={s.rightCell}>
                {done && community?.avg.overall != null ? (
                  <Delta mine={draft.overall} avg={community.avg.overall} />
                ) : draft.overall ? (
                  `${draft.overall} of 5`
                ) : (
                  "Tap to rate"
                )}
              </div>
            </div>
            {AXES.map((a) => {
              const v = draft.axes[a.key] ?? 0;
              const avg = community?.avg[a.key];
              return (
                <div key={a.key} className={s.axisRow}>
                  <div>
                    <div className={s.axisLabel}>{a.label}</div>
                    <div className={s.axisHint}>{a.hint}</div>
                  </div>
                  <div className={s.numButtons} role="radiogroup" aria-label={a.label}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={v === n}
                        disabled={done}
                        className={v === n ? s.numOn : s.numOff}
                        onClick={() => set({ axes: { ...draft.axes, [a.key]: v === n ? undefined : n } })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className={s.rightCell}>
                    {done && avg != null ? <Delta mine={v || null} avg={avg} /> : "optional"}
                  </div>
                </div>
              );
            })}
          </div>

          <label className={s.field}>
            <span className={ui.sectionLabel}>Your review</span>
            <textarea
              className={s.textarea}
              rows={6}
              value={draft.text}
              disabled={done}
              onChange={(e) => set({ text: e.target.value })}
              placeholder="What did you use it for? Where did it surprise you? Hot takes welcome — argue for them."
            />
          </label>

          <div>
            <button
              type="button"
              className={ui.linkBtn}
              disabled={done}
              onClick={() => set({ showSnippet: !draft.showSnippet })}
            >
              {draft.showSnippet ? "Remove prompt / response" : "+ Add prompt / response"}
            </button>
            {draft.showSnippet && (
              <div className={s.snippet}>
                <textarea
                  className={s.monoArea}
                  rows={4}
                  value={draft.prompt}
                  disabled={done}
                  onChange={(e) => set({ prompt: e.target.value })}
                  placeholder="prompt ›"
                  aria-label="Prompt"
                />
                <textarea
                  className={s.monoArea}
                  rows={4}
                  value={draft.response}
                  disabled={done}
                  onChange={(e) => set({ response: e.target.value })}
                  placeholder="model ›"
                  aria-label="Model response"
                />
              </div>
            )}
          </div>

          {!done && (
            <div className={s.footer}>
              <span className={s.progress}>
                {draft.overall ? "Overall rated" : "Overall needed"} · {rated} of 5 axes · community scores
                appear after you post
              </span>
              <button type="button" className={ui.btn} disabled={!canPost} onClick={submit}>
                {busy ? "Posting…" : "Post review"}
              </button>
            </div>
          )}
          {error && <p className={ui.error}>{error}</p>}
        </div>

        <aside className={s.aside}>
          <div className={ui.sectionLabel}>Scale</div>
          <ul className={s.scale}>
            <li>
              <b>1</b> — actively bad
            </li>
            <li>
              <b>3</b> — fine, forgettable
            </li>
            <li>
              <b>5</b> — best I've used
            </li>
          </ul>
          <p className={s.asideNote}>
            Skip any axis you haven't tested. Overall stars and text are required.
          </p>
        </aside>
      </div>
    </>
  );
}

function Delta({ mine, avg }: { mine: number | null; avg: number }) {
  if (!mine) return <span>avg {avg.toFixed(1)} · —</span>;
  const d = mine - avg;
  const cls = d >= 0.5 ? s.deltaUp : d <= -0.5 ? s.deltaDown : s.deltaFlat;
  return (
    <span>
      avg {avg.toFixed(1)} · <span className={cls}>{(d >= 0 ? "+" : "−") + Math.abs(d).toFixed(1)}</span>
    </span>
  );
}
