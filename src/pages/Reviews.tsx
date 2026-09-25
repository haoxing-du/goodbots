import { useState } from "react";
import { Link } from "react-router-dom";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Pills } from "../components/Pills";
import { Avatar, LoadMore } from "../components/bits";
import { FeedBoard, ReviewPost, boardWide } from "../components/FeedCards";
import { fmtAvg } from "../lib/format";
import ui from "../components/ui.module.css";
import s from "./Reviews.module.css";
import { versionPath } from "../lib/paths";
import { useTitle } from "../lib/useTitle";

export function Reviews() {
  useTitle("Reviews");
  const [tab, setTab] = useState<"latest" | "top">("latest");
  // Both feeds stay subscribed so switching tabs doesn't blank the list.
  const latest = usePaginatedQuery(api.reviews.feedLatest, {}, { initialNumItems: 20 });
  const top = useQuery(api.reviews.feedTop, {});
  const feed =
    tab === "latest"
      ? latest.status === "LoadingFirstPage"
        ? undefined
        : latest.results
      : top;
  const summary = useQuery(api.reviews.feedSummary);

  return (
    <div className={s.layout}>
      <div className={s.main}>
        <header className={s.head}>
          <div>
            <h1 className={ui.serifTitle}>What people think</h1>
            {summary && (summary.today > 0 || summary.mostReviewed) && (
              <p className={s.summary}>
                {summary.today} {summary.today === 1 ? "review" : "reviews"}{" "}
                today
                {summary.mostReviewed && (
                  <> · {summary.mostReviewed} most reviewed this week</>
                )}
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

        <FeedBoard>
          {feed === undefined && (
            <div className={`${ui.card} ${ui.skelCard} ${boardWide}`} aria-busy="true" />
          )}
          {feed && feed.length === 0 && (
            <div className={`${ui.card} ${ui.empty} ${boardWide}`}>
              {tab === "top" ? (
                "No reactions this week yet."
              ) : (
                <>
                  No reviews yet. <Link to="/write">Be the first to write one.</Link>
                </>
              )}
            </div>
          )}
          {feed?.map((r) => <ReviewPost key={r._id} r={r} />)}
          {tab === "latest" && (
            <div className={boardWide}>
              <LoadMore status={latest.status} loadMore={latest.loadMore} />
            </div>
          )}
        </FeedBoard>
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
  const rated = models?.filter((m) => m.reviewCount > 0) ?? [];
  return (
    <section>
      <h2 className={ui.sectionLabel}>Models · overall</h2>
      {models && rated.length === 0 && (
        <p className={s.railNote}>No ratings yet.</p>
      )}
      {rated.length > 0 && (
        <div className={`${s.railList} ${ui.rows}`}>
          {rated.slice(0, 8).map((m) => (
            <Link key={m._id} to={versionPath(m.versionId)} className={s.railRow}>
              <span>
                <span className={s.railName}>{m.displayName}</span>
                <span className={s.railVer}>{m.versionId}</span>
              </span>
              <span className={s.railAvg}>{fmtAvg(m.overall)}</span>
            </Link>
          ))}
        </div>
      )}
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
        <p className={s.railNote}>
          Sign in and review three models to see whose taste matches yours.
        </p>
      ) : matches && matches.length === 0 ? (
        <p className={s.railNote}>
          Review at least three models that other people have reviewed to find
          your taste matches.
        </p>
      ) : (
        <div className={s.people}>
          {matches?.map((p) => (
            <Link
              key={p.user._id}
              to={`/u/${p.user.handle}`}
              className={s.person}
            >
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
