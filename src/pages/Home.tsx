import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSignIn } from "../components/SignIn";
import { EMPTY_DRAFT, saveDraft } from "../lib/draft";
import { fmtCount } from "../lib/format";
import s from "./Home.module.css";

export function Home() {
  const data = useQuery(api.home.homeStats);
  const navigate = useNavigate();
  const { requireAuth } = useSignIn();
  const [picked, setPicked] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");

  const versionId = picked ?? data?.versions[0]?.versionId ?? "";
  const selectedName =
    data?.versions.find((v) => v.versionId === versionId)?.displayName ?? "";

  const started = stars > 0 || text.trim().length > 0;

  const onFinish = () => {
    if (!started || !versionId) return;
    // Hand the text and stars to the write page; the draft also survives sign-in.
    saveDraft({ ...EMPTY_DRAFT, text, overall: stars });
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
                onChange={(e) => setPicked(e.target.value)}
                aria-label="Model"
              >
                {data?.versions.map((v) => (
                  <option key={v._id} value={v.versionId}>
                    {v.displayName}
                  </option>
                ))}
              </select>
            </span>
            <span>?</span>
          </span>
        </h1>

        <textarea
          className={s.text}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Hot takes welcome"
          aria-label="Your review"
        />

        <div className={s.action}>
          <div
            className={s.stars}
            role="radiogroup"
            aria-label="Overall rating (optional)"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className={n <= stars ? s.starOn : s.starOff}
                onClick={() => setStars(stars === n ? 0 : n)}
              >
                ★
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

        {data && (
          <p className={s.count}>
            {fmtCount(data.reviewerCount)}{" "}
            {data.reviewerCount === 1 ? "person has" : "people have"} reviewed{" "}
            {fmtCount(data.reviewedModelCount)}{" "}
            {data.reviewedModelCount === 1 ? "model" : "models"}
          </p>
        )}
      </section>

      <section className={s.cards} aria-label="Summary stats">
        {data?.cards.map((c, i) => {
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
              to={`/m/${c.version.modelSlug}/${c.version.versionId}`}
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
    </>
  );
}
