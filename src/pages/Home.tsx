import { useEffect, useRef, useState } from "react";
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
import { radioGroupKeys, radioTabIndex } from "../lib/radioGroup";

const SCORES = [1, 2, 3, 4, 5] as const;

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
  const selectRef = useRef<HTMLSelectElement>(null);
  // The search replaces nothing but unmounts on pick/cancel; send focus back to the select.
  const closeSearch = () => {
    setSearching(false);
    requestAnimationFrame(() => selectRef.current?.focus());
  };

  const axes = data?.axes ?? [];
  useEffect(() => {
    if (axisIndex === null && axes.length)
      setAxisIndex(Math.floor(Math.random() * axes.length));
  }, [axes.length, axisIndex]);
  const axis = axisIndex === null ? null : axes[axisIndex % axes.length];
  const stars = axis ? (ratings[axis._id] ?? 0) : 0;
  const rate = (n: number) => {
    if (!axis) return;
    setRatings((r) => {
      const next = { ...r };
      if (n) next[axis._id] = n;
      else delete next[axis._id];
      return next;
    });
  };
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
        {/* The select sits beside the <h1>, not inside it, so the heading's
            accessible name isn’t polluted by every option. */}
        <div className={s.headline}>
          <h1 className={s.lead}>What did you think of</h1>
          <span className={s.pick}>
            {/* The hidden sizer makes the select exactly as wide as the chosen name. */}
            <span className={s.selectWrap}>
              <span className={s.sizer} aria-hidden>
                {selectedName || "\u00a0"}
              </span>
              <select
                ref={selectRef}
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
            <span aria-hidden>?</span>
          </span>
        </div>

        {searching && (
          <div className={s.otherModel}>
            <ModelPicker
              autoFocus
              label="Find another model"
              placeholder="Which model? Search 300+ models…"
              onPick={(m) => {
                setExtra(m);
                setPicked(m.versionId);
                closeSearch();
              }}
            />
            <button
              type="button"
              className={s.cancelSearch}
              onClick={closeSearch}
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
          <div className={s.axisPick}>
            {axis && (
              <>
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
              </>
            )}
          </div>
          <div
            className={s.stars}
            role="radiogroup"
            aria-label={
              axis ? `${axis.name} rating (optional)` : "Rating (optional)"
            }
            onKeyDown={radioGroupKeys(SCORES, (n) => rate(n), () => rate(0))}
          >
            {SCORES.map((n, i) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                tabIndex={radioTabIndex(SCORES, stars, i)}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className={n <= stars ? s.starOn : s.starOff}
                onClick={() => rate(stars === n ? 0 : n)}
              >
                {n <= stars ? "★" : "☆"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={s.continue}
            disabled={!started}
            aria-describedby={started ? undefined : "finish-hint"}
            onClick={onFinish}
          >
            Finish your review →
          </button>
        </div>
        {!started && (
          <p id="finish-hint" className={s.axisHint}>
            Write something or give it a rating to continue.
          </p>
        )}

        {/* Hold the line's height while loading so the hero doesn't jump. */}
        {data === undefined && <p className={s.count}>{"\u00a0"}</p>}
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
