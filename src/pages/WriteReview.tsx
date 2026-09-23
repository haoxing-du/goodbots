import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { MinimalBar } from "../components/TopBar";
import { useSignIn } from "../components/SignIn";
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
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // Axes added in this draft that don't exist yet (after posting they do, and merge in).
  const knownSlugs = new Set(data.axes.map((a) => a.slug));
  const pendingAxes = draft.newAxes.filter((n) => !knownSlugs.has(axisSlug(n.name)));
  // Your score on an axis: while editing, from the draft; after posting, from the server.
  const valueFor = (axis: { _id: string; slug: string }) =>
    done
      ? (community?.mine.axes[axis._id] ?? 0)
      : (draft.scores[axis._id] ?? draft.newAxes.find((n) => axisSlug(n.name) === axis.slug)?.score ?? 0);
  const setScore = (axis: { _id: string; slug: string }, n: number) =>
    setDraft((d) => {
      const scores = { ...d.scores };
      if (n) scores[axis._id] = n;
      else delete scores[axis._id];
      return { ...d, scores, newAxes: d.newAxes.filter((x) => axisSlug(x.name) !== axis.slug) };
    });
  const setNewScore = (name: string, n: number) =>
    set({ newAxes: draft.newAxes.map((x) => (x.name === name ? { ...x, score: n } : x)) });

  const rated =
    data.axes.filter((a) => valueFor(a) > 0).length + pendingAxes.filter((a) => a.score > 0).length;
  const canPost = draft.text.trim().length > 0 && !busy;

  const submit = () =>
    requireAuth(async () => {
      if (!canPost) return;
      setBusy(true);
      setError(null);
      try {
        await upsert({
          versionId: selected._id,
          overall: draft.overall || undefined,
          scores: [
            ...Object.entries(draft.scores).map(([axisId, score]) => ({
              axisId: axisId as Id<"axes">,
              score,
            })),
            ...draft.newAxes
              .filter((x) => x.score > 0)
              .map((x) => ({ name: x.name, hint: x.hint, score: x.score })),
          ],
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
                <div className={s.axisHint}>Optional</div>
              </div>
              <div className={s.starButtons} role="radiogroup" aria-label="Overall stars">
                {[1, 2, 3, 4, 5].map((n) => {
                  const v = done ? (community?.mine.overall ?? 0) : draft.overall;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={v === n}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      disabled={done}
                      className={n <= v ? s.starOn : s.starOff}
                      onClick={() => set({ overall: draft.overall === n ? 0 : n })}
                    >
                      ★
                    </button>
                  );
                })}
              </div>
              <div className={s.rightCell}>
                {done && community?.overall != null ? (
                  <Delta mine={community.mine.overall ?? null} avg={community.overall} />
                ) : draft.overall ? (
                  `${draft.overall} of 5`
                ) : (
                  "optional"
                )}
              </div>
            </div>
            {data.axes.map((a) => {
              const v = valueFor(a);
              const avg = community?.axes[a._id];
              return (
                <AxisRow
                  key={a._id}
                  name={a.name}
                  hint={a.hint ?? (a.core ? undefined : "Added by reviewers")}
                  value={v}
                  disabled={done}
                  onChange={(n) => setScore(a, n)}
                  right={done && avg != null ? <Delta mine={v || null} avg={avg} /> : "optional"}
                />
              );
            })}
            {!done &&
              pendingAxes.map((x) => (
                <AxisRow
                  key={x.name}
                  name={x.name}
                  hint={x.hint ?? "New axis"}
                  value={x.score}
                  onChange={(n) => setNewScore(x.name, n)}
                  right={
                    <button
                      type="button"
                      className={s.removeAxis}
                      onClick={() => set({ newAxes: draft.newAxes.filter((y) => y.name !== x.name) })}
                    >
                      Remove
                    </button>
                  }
                />
              ))}
            {!done && (
              <AddAxis
                existing={data.axes}
                pending={pendingAxes.map((x) => x.name)}
                onAdd={(name, hint) => set({ newAxes: [...draft.newAxes, { name, hint, score: 0 }] })}
              />
            )}
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
                {rated} {rated === 1 ? "axis" : "axes"} rated · community scores appear after you post
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
            Skip anything you haven't tested; only the text is required. Missing an axis? Add
            your own at the bottom of the list.
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

function axisSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function AxisRow({
  name,
  hint,
  value,
  disabled,
  onChange,
  right,
}: {
  name: string;
  hint?: string;
  value: number;
  disabled?: boolean;
  onChange: (n: number) => void;
  right: React.ReactNode;
}) {
  return (
    <div className={s.axisRow}>
      <div>
        <div className={s.axisLabel}>{name}</div>
        {hint && <div className={s.axisHint}>{hint}</div>}
      </div>
      <div className={s.numButtons} role="radiogroup" aria-label={name}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            disabled={disabled}
            className={value === n ? s.numOn : s.numOff}
            onClick={() => onChange(value === n ? 0 : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className={s.rightCell}>{right}</div>
    </div>
  );
}

/** "+ Rate it on something else": adds a custom axis row to this review. */
function AddAxis({
  existing,
  pending,
  onAdd,
}: {
  existing: { name: string; slug: string }[];
  pending: string[];
  onAdd: (name: string, hint?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [hint, setHint] = useState("");
  const [note, setNote] = useState<string | null>(null);

  if (!open) {
    return (
      <div className={s.addRow}>
        <button type="button" className={ui.linkBtn} onClick={() => setOpen(true)}>
          + Rate it on something else
        </button>
      </div>
    );
  }

  const add = () => {
    const clean = name.trim().replace(/\s+/g, " ");
    const slug = axisSlug(clean);
    if (clean.length < 2 || clean.length > 40 || !slug) {
      setNote("Use 2–40 characters.");
      return;
    }
    if (slug === "overall") {
      setNote("Overall is the star rating above.");
      return;
    }
    const match = existing.find((a) => a.slug === slug);
    if (match) {
      setNote(`${match.name} is already on the list above.`);
      return;
    }
    if (pending.some((p) => axisSlug(p) === slug)) {
      setNote("You've already added that.");
      return;
    }
    onAdd(clean, hint.trim().replace(/\s+/g, " ") || undefined);
    setName("");
    setHint("");
    setNote(null);
  };

  return (
    <form
      className={s.addRow}
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input
        className={`${ui.input} ${s.addName}`}
        value={name}
        maxLength={40}
        autoFocus
        placeholder="Axis name"
        aria-label="New axis name"
        onChange={(e) => {
          setName(e.target.value);
          setNote(null);
        }}
      />
      <input
        className={`${ui.input} ${s.addHint}`}
        value={hint}
        maxLength={80}
        placeholder="What it means, in one line (optional)"
        aria-label="New axis description"
        onChange={(e) => setHint(e.target.value)}
      />
      <button type="submit" className={ui.btnGhost}>
        Add
      </button>
      {note && <span className={s.addNote}>{note}</span>}
    </form>
  );
}
