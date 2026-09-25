import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSignIn } from "../components/SignIn";
import { ModelMenu } from "../components/ModelMenu";
import { ModelPicker, PickedModel } from "../components/ModelPicker";
import { mergeIntoDraft } from "../lib/draft";
import { fmtCount } from "../lib/format";
import { FeedBoard, ReviewPost } from "../components/FeedCards";
import ui from "../components/ui.module.css";
import s from "./Home.module.css";
import { versionPath } from "../lib/paths";
import { useTitle } from "../lib/useTitle";
import { radioGroupKeys, radioTabIndex } from "../lib/radioGroup";
import { axisVars } from "../lib/axes";

const SCORES = [1, 2, 3, 4, 5] as const;


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
  const menuRef = useRef<HTMLButtonElement>(null);
  // The catalog search unmounts on pick/cancel; send focus back to the model menu.
  const closeSearch = () => {
    setSearching(false);
    requestAnimationFrame(() => menuRef.current?.focus());
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

  // The menu lists featured models; "Search all models…" opens a search over the
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
        {/* The model menu sits beside the <h1>, not inside it, so the heading’s
            accessible name isn’t polluted by every option. */}
        <div className={s.headline}>
          <h1 className={s.lead}>What do you think of</h1>
          <span className={s.pick}>
            <ModelMenu
              models={options}
              value={versionId}
              onChange={setPicked}
              onSearch={() => setSearching(true)}
              buttonRef={menuRef}
            />
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
            style={axisVars(axis?.slug)}
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
            onClick={onFinish}
          >
            Finish your review →
          </button>
        </div>

        {/* Hold the line's height while loading so the hero doesn't jump. */}
        {data === undefined && <p className={s.count}>{"\u00a0"}</p>}
        {data && data.reviewerCount > 0 && (
          <p className={s.count}>
            {fmtCount(data.reviewerCount)}{" "}
            {data.reviewerCount === 1 ? "person has" : "people have"} weighed in on{" "}
            {fmtCount(data.reviewedModelCount)}{" "}
            {data.reviewedModelCount === 1 ? "model" : "models"}
          </p>
        )}
      </section>

      <HomeBoard cards={data?.cards.filter((c) => c.version !== null)} />
    </>
  );
}

const LATEST_ON_HOME = 9;

type StatCard = NonNullable<ReturnType<typeof useQuery<typeof api.home.homeStats>>>["cards"][number];

/**
 * Under the hero: the newest reviews with the "best at" stat cards spread among them
 * on one board, so both show up near the top instead of stats first, reviews after.
 */
function HomeBoard({ cards }: { cards: StatCard[] | undefined }) {
  const latest = usePaginatedQuery(api.reviews.feedLatest, {}, { initialNumItems: LATEST_ON_HOME });
  if (latest.status === "LoadingFirstPage" || cards === undefined) return null;
  const reviews = latest.results.slice(0, LATEST_ON_HOME);
  if (reviews.length === 0 && cards.length === 0) return null;

  // Stat card k goes at an even spacing through the combined list (first one second).
  const total = reviews.length + cards.length;
  const statAt = new Map(cards.map((c, k) => [Math.min(total - 1, Math.floor((k * total) / cards.length) + 1), c]));
  const items = [];
  const queue = [...reviews];
  for (let i = 0; i < total; i++) {
    const card = statAt.get(i);
    const review = card ? undefined : queue.shift();
    if (card) items.push(<StatTile key={card.key} c={card} />);
    else if (review) items.push(<ReviewPost key={review._id} r={review} />);
  }
  // Any stat cards whose slot collided go last.
  for (const c of cards) if (![...statAt.values()].includes(c)) items.push(<StatTile key={c.key} c={c} />);

  return (
    <section className={s.latest}>
      <div className={ui.sectionHead}>
        <h2 className={ui.sectionLabel}>Latest takes</h2>
        <Link to="/reviews" className={s.latestAll}>
          All reviews →
        </Link>
      </div>
      <FeedBoard>{items}</FeedBoard>
    </section>
  );
}

function StatTile({ c }: { c: StatCard }) {
  if (!c.version) return null;
  return (
    <Link to={versionPath(c.version.versionId)} className={s.card} style={axisVars(c.key)}>
      <span className={s.cardLabel}>{c.label}</span>
      <span className={s.cardRow}>
        <span className={s.cardModel}>{c.version.displayName}</span>
        {c.value && <span className={s.cardNum}>{c.value}</span>}
      </span>
      <span className={s.cardCaption}>{c.caption}</span>
    </Link>
  );
}
