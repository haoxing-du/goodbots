import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSignIn } from "../components/SignIn";
import { ModelPicker, PickedModel } from "../components/ModelPicker";
import { mergeIntoDraft } from "../lib/draft";
import { fmtCount } from "../lib/format";
import s from "./Home.module.css";
import { versionPath } from "../lib/paths";
import { useTitle } from "../lib/useTitle";

const OTHER = "__other__";

export function Home() {
  useTitle(null);
  const data = useQuery(api.home.homeStats);
  const navigate = useNavigate();
  const { requireAuth } = useSignIn();
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState("");
  // One suggested axis at a time (random); ratings persist across shuffles.
  const [axisIndex, setAxisIndex] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});

  const axes = data?.axes ?? [];
  useEffect(() => {
    if (axisIndex === null && axes.length)
      setAxisIndex(Math.floor(Math.random() * axes.length));
  }, [axes.length, axisIndex]);
  const axis = axisIndex === null ? null : axes[axisIndex % axes.length];
  const stars = axis ? (ratings[axis._id] ?? 0) : 0;
  const shuffle = () => {
    if (axes.length < 2 || axisIndex === null) return;
    const step = 1 + Math.floor(Math.random() * (axes.length - 1)); // never the same axis
    setAxisIndex((axisIndex + step) % axes.length);
  };

  // The select lists reviewed models; "Something else…" opens a search over the
  // whole catalog, and the pick joins the list.
  const [extra, setExtra] = useState<PickedModel | null>(null);
  const [searching, setSearching] = useState(false);
  const options = [
    ...(extra && !data?.versions.some((v) => v.versionId === extra.versionId)
      ? [extra]
      : []),
    ...(data?.versions ?? []),
  ];
  const versionId = picked ?? options[0]?.versionId ?? "";
  const selectedName =
    options.find((v) => v.versionId === versionId)?.displayName ?? "";

  const started = Object.keys(ratings).length > 0 || text.trim().length > 0;

  const onFinish = () => {
    if (!started || !versionId) return;
    // Hand the text and axis ratings to the write page; the draft also survives sign-in.
    mergeIntoDraft(versionId, text, ratings);
    const to = `/write?v=${encodeURIComponent(versionId)}`;
    requireAuth(
      () => navigate(to),
      "Sign in to finish your review. What you wrote is kept.",
      to,
    );
  };

  return (
    <>
      <section className={s.hero}>
        <h1 className={s.headline}>
          <span>What did you think of</span>
          <span className={s.pick}>
            {/* The hidden sizer makes the select exactly as wide as the chosen name. */}
            <span className={s.selectWrap}>
              <span className={s.sizer} aria-hidden>
                {selectedName || "\u00a0"}
              </span>
              <select
                className={s.select}
                value={versionId}
                onChange={(e) => {
                  if (e.target.value === OTHER) setSearching(true);
                  else setPicked(e.target.value);
                }}
                aria-label="Model"
              >
                {options.map((v) => (
                  <option key={v.versionId} value={v.versionId}>
                    {v.displayName}
                  </option>
                ))}
                <option value={OTHER}>Something else…</option>
              </select>
            </span>
            <span>?</span>
          </span>
        </h1>

        {searching && (
          <div className={s.otherModel}>
            <ModelPicker
              autoFocus
              label="Find another model"
              placeholder="Which model? Search 300+ models…"
              onPick={(m) => {
                setExtra(m);
                setPicked(m.versionId);
                setSearching(false);
              }}
            />
            <button
              type="button"
              className={s.cancelSearch}
              onClick={() => setSearching(false)}
            >
              Cancel
            </button>
          </div>
        )}

        <textarea
          className={s.text}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Hot takes welcome."
          aria-label="Your review"
        />

        <div className={s.action}>
          {axis && (
            <div className={s.axisPick}>
              <div className={s.axisName}>
                <span>{axis.name}</span>
                <button
                  type="button"
                  className={s.shuffle}
                  onClick={shuffle}
                  aria-label="Suggest a different axis"
                  title="Suggest a different axis"
                >
                  ↻
                </button>
              </div>
              <div className={s.axisHint}>
                {axis.hint ? `${axis.hint} · optional` : "optional"}
              </div>
            </div>
          )}
          <div
            className={s.stars}
            role="radiogroup"
            aria-label={
              axis ? `${axis.name} rating (optional)` : "Rating (optional)"
            }
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className={n <= stars ? s.starOn : s.starOff}
                onClick={() => {
                  if (!axis) return;
                  setRatings((r) => {
                    const next = { ...r };
                    if (stars === n) delete next[axis._id];
                    else next[axis._id] = n;
                    return next;
                  });
                }}
              >
                {n <= stars ? "★" : "☆"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={s.continue}
            disabled={!started}
            onClick={onFinish}
          >
            Finish your review →
          </button>
        </div>

        {data && data.reviewerCount > 0 && (
          <p className={s.count}>
            {fmtCount(data.reviewerCount)}{" "}
            {data.reviewerCount === 1 ? "person has" : "people have"} reviewed{" "}
            {fmtCount(data.reviewedModelCount)}{" "}
            {data.reviewedModelCount === 1 ? "model" : "models"}
          </p>
        )}
      </section>

      {/* Only cards with a winner; on a brand-new site the section is hidden. */}
      {data?.cards.some((c) => c.version) && (
        <section className={s.cards} aria-label="Summary stats">
          {data.cards.map((c, i) => {
            if (!c.version) return null;
            const body = (
              <>
                <span className={s.cardLabel}>{c.label}</span>
                <span className={s.cardRow}>
                  <span className={s.cardModel}>
                    {c.version?.displayName ?? "—"}
                  </span>
                  {c.value && <span className={s.cardNum}>{c.value}</span>}
                </span>
                <span className={s.cardCaption}>{c.caption}</span>
              </>
            );
            const cls = `${s.card} ${s[`cat${i + 1}`]}`;
            return c.version ? (
              <Link
                key={c.key}
                to={versionPath(c.version.versionId)}
                className={cls}
              >
                {body}
              </Link>
            ) : (
              <div key={c.key} className={`${cls} ${s.cardEmpty}`}>
                {body}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
