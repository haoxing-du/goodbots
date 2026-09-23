import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Pills } from "../components/Pills";
import {
  AxisScores,
  Avatar,
  DeleteReview,
  MatchChip,
  Snippet,
  Stars,
  UserLink,
} from "../components/bits";
import { Reactions } from "../components/Reactions";
import { useSignIn } from "../components/SignIn";
import { fmtAvg, fmtCount, timeAgo } from "../lib/format";
import { NotFound } from "./NotFound";
import ui from "../components/ui.module.css";
import s from "./ModelPage.module.css";
import { versionPath } from "../lib/paths";

export function ModelPage() {
  const { id = "" } = useParams();
  const data = useQuery(api.models.page, { id });

  if (data === undefined) return <div className={ui.page} />;
  if (data === null) return <NotFound what="model" />;
  if (data.redirectTo !== null) return <Navigate to={versionPath(data.redirectTo)} replace />;
  const { model, version } = data;
  const overall = data.overall;

  return (
    <div className={ui.page}>
      <header className={s.header}>
        <div>
          <div className={ui.monoLabel}>
            {model.provider} · <span className={s.versionId}>{version.versionId}</span>
          </div>
          <h1 className={s.name}>{version.displayName}</h1>
          <p className={s.summary}>
            {fmtCount(data.reviewCount)} {data.reviewCount === 1 ? "review" : "reviews"} ·{" "}
            <span className={s.rating}>{fmtAvg(overall.avg)} overall</span> ·{" "}
            {fmtCount(data.takeCount)} head-to-head {data.takeCount === 1 ? "take" : "takes"}
          </p>
        </div>
      </header>

      <AxisGrid
        axes={data.axes.filter((a) => a.core)}
        custom={data.axes.filter((a) => !a.core).sort((a, b) => b.count - a.count)}
      />

      <HeadToHead
        versionId={version._id}
        displayName={version.displayName}
        rows={data.headToHead}
      />

      <ReviewList versionId={version._id} />
    </div>
  );
}

type AxisStat = {
  _id: string;
  name: string;
  hint?: string;
  avg: number | null;
  count: number;
  hist: number[];
};

function AxisGrid({ axes, custom }: { axes: AxisStat[]; custom: AxisStat[] }) {
  const [dist, setDist] = useState(() => {
    try {
      return sessionStorage.getItem("gb.dist") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("gb.dist", dist ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [dist]);

  return (
    <section>
      <div className={ui.sectionHead}>
        <h2 className={ui.sectionLabel}>Ratings · 1–5</h2>
        <label className={s.toggle}>
          <input type="checkbox" checked={dist} onChange={(e) => setDist(e.target.checked)} />
          <span className={s.check} aria-hidden />
          Show distributions
        </label>
      </div>
      <div className={s.axes}>
        {axes.map((a) => {
          const rounded = a.avg == null ? 0 : Math.round(a.avg);
          const max = Math.max(1, ...a.hist);
          return (
            <div key={a._id} className={`${ui.card} ${s.axisCard}`}>
              <div className={ui.monoLabel}>{a.name}</div>
              <div className={s.avg}>{fmtAvg(a.avg)}</div>
              {dist ? (
                <div className={s.hist} aria-label={`${a.name} distribution`}>
                  {a.hist.map((c, i) => (
                    <div key={i} className={s.bin} title={`${i + 1}: ${c}`}>
                      <div className={s.bar} style={{ height: Math.max(3, (c / max) * 38) }} />
                      <span className={s.binLabel}>{i + 1}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={s.pips} aria-hidden>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={n <= rounded ? s.pipOn : s.pipOff} />
                  ))}
                </div>
              )}
              <div className={s.hint}>{a.hint}</div>
            </div>
          );
        })}
      </div>
      {custom.length > 0 && (
        <div className={s.also}>
          <h3 className={s.alsoLabel}>Also rated on</h3>
          <div className={s.alsoGrid}>
            {custom.map((a) => {
              const rounded = a.avg == null ? 0 : Math.round(a.avg);
              const max = Math.max(1, ...a.hist);
              return (
                <div key={a._id} className={`${ui.card} ${s.alsoCard}`} title={a.hint}>
                  <span className={s.alsoName}>{a.name}</span>
                  <span className={s.alsoAvg}>{fmtAvg(a.avg)}</span>
                  {dist ? (
                    <span className={s.alsoHist} aria-label={`${a.name} distribution`}>
                      {a.hist.map((c, i) => (
                        <span
                          key={i}
                          className={s.alsoBar}
                          title={`${i + 1}: ${c}`}
                          style={{ height: Math.max(2, (c / max) * 24) }}
                        />
                      ))}
                    </span>
                  ) : (
                    <span className={s.alsoPips} aria-hidden>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={n <= rounded ? s.pipOn : s.pipOff} />
                      ))}
                    </span>
                  )}
                  <span className={s.alsoCount}>
                    {fmtCount(a.count)} {a.count === 1 ? "rating" : "ratings"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

type H2HRow = {
  opponent: { _id: Id<"versions">; displayName: string; versionId: string; modelSlug: string } | null;
  winPct: number;
  total: number;
  quote: string | null;
  quoteBy: string | null;
};

function HeadToHead({
  versionId,
  displayName,
  rows,
}: {
  versionId: Id<"versions">;
  displayName: string;
  rows: H2HRow[];
}) {
  return (
    <section>
      <h2 className={ui.sectionLabel}>Head to head · overall</h2>
      <div className={`${ui.card} ${ui.rows} ${s.h2h}`}>
        {rows.length === 0 && <div className={ui.empty}>No takes yet. Be the first to call it.</div>}
        {rows.map((h) => (
          <div key={h.opponent!._id} className={s.h2hRow}>
            <div className={s.vs}>
              vs{" "}
              <Link to={versionPath(h.opponent!.versionId)}>
                {h.opponent!.displayName}
              </Link>
            </div>
            <div>
              <div className={s.split} aria-hidden>
                <span style={{ width: `${h.winPct}%` }} />
              </div>
              <div className={s.splitCaption}>
                <span>
                  {h.winPct}% {displayName}
                </span>
                <span>
                  {100 - h.winPct}% {h.opponent!.displayName}
                </span>
              </div>
            </div>
            <div className={s.quote}>
              {h.quote && (
                <>
                  “{h.quote}”{" "}
                  {h.quoteBy && (
                    <UserLink user={{ handle: h.quoteBy, name: h.quoteBy }} className={s.quoteBy}>
                      @{h.quoteBy}
                    </UserLink>
                  )}
                </>
              )}
            </div>
            <div className={s.takeCount}>
              {fmtCount(h.total)} {h.total === 1 ? "person" : "people"}
            </div>
          </div>
        ))}
        <TakeComposer versionId={versionId} />
      </div>
    </section>
  );
}

function TakeComposer({ versionId }: { versionId: Id<"versions"> }) {
  const all = useQuery(api.models.allVersions);
  const post = useMutation(api.takes.create);
  const { requireAuth } = useSignIn();
  const [left, setLeft] = useState<Id<"versions">>(versionId);
  const [right, setRight] = useState<Id<"versions"> | "">("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setLeft(versionId);
    setRight("");
  }, [versionId]);

  if (!all) return <div className={s.composer} />;
  const nameOf = (id: Id<"versions">) => all.find((v) => v._id === id)?.displayName ?? "";
  const opponent = right || all.find((v) => v._id !== left)?._id || "";

  const submit = () =>
    requireAuth(async () => {
      if (!opponent) return;
      try {
        await post({ winnerVersionId: left, loserVersionId: opponent, reason: reason || undefined });
        setReason("");
        setStatus("Take posted.");
      } catch (e) {
        setStatus(e instanceof ConvexError ? String(e.data) : "Couldn't post that take.");
      }
    }, "Sign in to post a head-to-head take.");

  return (
    <form
      className={s.composer}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className={ui.monoLabel}>Your take</span>
      <button
        type="button"
        className={s.takeLeft}
        title="Swap sides"
        onClick={() => {
          if (!opponent) return;
          setRight(left);
          setLeft(opponent);
        }}
      >
        {nameOf(left)}
      </button>
      <span className={s.gt}>&gt;</span>
      <select
        className={ui.input}
        value={opponent}
        onChange={(e) => setRight(e.target.value as Id<"versions">)}
        aria-label="Opponent"
      >
        {all
          .filter((v) => v._id !== left)
          .map((v) => (
            <option key={v._id} value={v._id}>
              {v.displayName}
            </option>
          ))}
      </select>
      <input
        className={`${ui.input} ${s.because}`}
        value={reason}
        maxLength={200}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Because…"
        aria-label="Reason (optional)"
      />
      <button type="submit" className={ui.btn}>
        Post take
      </button>
      {status && (
        <span className={s.status} role="status">
          {status}
        </span>
      )}
    </form>
  );
}

function ReviewList({ versionId }: { versionId: Id<"versions"> }) {
  const [stars, setStars] = useState(0);
  const reviews = useQuery(api.reviews.byVersion, { versionId, stars: stars || undefined });

  return (
    <section>
      <div className={ui.sectionHead}>
        <h2 className={ui.sectionLabel}>Reviews · top</h2>
        <Pills
          label="Filter by stars"
          options={[0, 5, 4, 3, 2, 1].map((n) => ({ value: n, label: n ? `${n}★` : "All" }))}
          value={stars}
          onChange={setStars}
        />
      </div>
      <div className={s.reviewCards}>
        {reviews && reviews.length === 0 && (
          <div className={`${ui.card} ${ui.empty}`}>
            {stars ? `No ${stars}★ reviews yet.` : "No reviews yet. Write the first one."}
          </div>
        )}
        {reviews?.map((r) => (
          <article key={r._id} className={`${ui.card} ${s.review}`}>
            <div className={s.reviewer}>
              <div className={s.who}>
                <Avatar name={r.user?.name ?? "?"} image={r.user?.image} />
                <div>
                  <UserLink user={r.user} className={s.whoName} />
                  <div className={ui.meta}>@{r.user?.handle}</div>
                </div>
              </div>
              <MatchChip match={r.match} />
              <AxisScores scores={r.scores} stacked />
            </div>
            <div className={s.reviewBody}>
              <div className={s.reviewTop}>
                {r.overall ? <Stars value={r.overall} /> : <span />}
                <span className={s.reviewMeta}>
                  <DeleteReview reviewId={r._id} authorId={r.user?._id} />
                  <span className={ui.meta}>{timeAgo(r.updatedAt)}</span>
                </span>
              </div>
              <p className={ui.body}>{r.text}</p>
              <Snippet prompt={r.prompt} response={r.response} />
              <Reactions reviewId={r._id} counts={r.reactionCounts} mine={r.myReactions} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
