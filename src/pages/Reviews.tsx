import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Pills } from "../components/Pills";
import { AxisScores, Avatar, DeleteReview, MatchChip, Stars, UserLink } from "../components/bits";
import { Reactions } from "../components/Reactions";
import { fmtAvg, timeAgo } from "../lib/format";
import ui from "../components/ui.module.css";
import s from "./Reviews.module.css";
import { versionPath } from "../lib/paths";

export function Reviews() {
  const [tab, setTab] = useState<"latest" | "top">("latest");
  const feed = useQuery(api.reviews.feed, { tab });
  const summary = useQuery(api.reviews.feedSummary);

  return (
    <div className={s.layout}>
      <div className={s.main}>
        <header className={s.head}>
          <div>
            <h1 className={ui.serifTitle}>What people think</h1>
            {summary && (
              <p className={s.summary}>
                {summary.today} {summary.today === 1 ? "review" : "reviews"} today
                {summary.mostReviewed && <> · {summary.mostReviewed} most reviewed this week</>}
              </p>
            )}
          </div>
          <Pills
            label="Feed"
            options={[
              { value: "latest", label: "Latest" },
              { value: "top", label: "Top this week" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </header>

        <div className={s.cards}>
          {feed && feed.length === 0 && (
            <div className={`${ui.card} ${ui.empty}`}>
              {tab === "top" ? "No reactions this week yet." : "No reviews yet."}
            </div>
          )}
          {feed?.map((r) => (
            <article key={r._id} className={`${ui.card} ${s.card}`}>
              <div className={s.cardTop}>
                {r.version && (
                  <Link to={versionPath(r.version.versionId)} className={s.modelChip}>
                    {r.version.displayName}
                  </Link>
                )}
                <MatchChip match={r.match} />
                <span className={s.when}>
                  <DeleteReview reviewId={r._id} authorId={r.user?._id} />
                  <span className={ui.meta}>{timeAgo(r.updatedAt)}</span>
                </span>
              </div>
              <div className={s.byline}>
                <UserLink user={r.user} className={s.name} />
                {r.overall && <Stars value={r.overall} />}
              </div>
              <p className={`${ui.body} ${s.text}`}>{r.text}</p>
              <AxisScores scores={r.scores} />
              <Reactions reviewId={r._id} counts={r.reactionCounts} mine={r.myReactions} />
            </article>
          ))}
        </div>
      </div>

      <aside className={s.rail}>
        <ModelsRail />
        <ReviewersLikeYou />
      </aside>
    </div>
  );
}

function ModelsRail() {
  const models = useQuery(api.models.list);
  return (
    <section>
      <h2 className={ui.sectionLabel}>Models · overall</h2>
      <div className={`${s.railList} ${ui.rows}`}>
        {models
          ?.filter((m) => m.reviewCount > 0)
          .slice(0, 8)
          .map((m) => (
            <Link key={m._id} to={versionPath(m.versionId)} className={s.railRow}>
              <span>
                <span className={s.railName}>{m.displayName}</span>
                <span className={s.railVer}>{m.versionId}</span>
              </span>
              <span className={s.railAvg}>{fmtAvg(m.overall)}</span>
            </Link>
          ))}
      </div>
    </section>
  );
}

function ReviewersLikeYou() {
  const me = useQuery(api.users.me);
  const matches = useQuery(api.users.reviewersLikeYou);
  return (
    <section>
      <h2 className={ui.sectionLabel}>Reviewers like you</h2>
      {!me ? (
        <p className={s.railNote}>Sign in and review three models to see whose taste matches yours.</p>
      ) : matches && matches.length === 0 ? (
        <p className={s.railNote}>
          Review at least three models that other people have reviewed to find your taste matches.
        </p>
      ) : (
        <div className={s.people}>
          {matches?.map((p) => (
            <Link key={p.user._id} to={`/u/${p.user.handle}`} className={s.person}>
              <Avatar name={p.user.name} image={p.user.image} />
              <span className={s.personName}>{p.user.name}</span>
              <span className={s.oliveChip}>{p.match}%</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
