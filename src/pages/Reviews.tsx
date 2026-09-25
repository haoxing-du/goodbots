import { useState } from "react";
import { Link } from "react-router-dom";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Pills } from "../components/Pills";
import {
  AxisChips,
  Avatar,
  DeleteReview,
  LoadMore,
  MatchChip,
  ReviewImage,
  Snippet,
  Stars,
  UserLink,
} from "../components/bits";
import type { ReviewCard as ReviewCardData } from "../../convex/reviews";
import type { XFeedPost } from "../../convex/xPosts";
import { Linkified, XAuthorLink } from "../components/XPost";
import { Reactions } from "../components/Reactions";
import { fmtAvg, timeAgo } from "../lib/format";
import ui from "../components/ui.module.css";
import s from "./Reviews.module.css";
import { versionPath } from "../lib/paths";
import { useTitle } from "../lib/useTitle";
import { useMasonry } from "../lib/useMasonry";

// Masonry grid: 4px rows, 16px between cards (matches .board in the CSS).
const BOARD_ROW = 4;
const BOARD_GAP = 16;

export function Reviews() {
  useTitle("Reviews");
  const [tab, setTab] = useState<"latest" | "top">("latest");
  // Both feeds stay subscribed so switching tabs doesn't blank the list.
  const latest = usePaginatedQuery(api.reviews.feedLatest, {}, { initialNumItems: 20 });
  const top = useQuery(api.reviews.feedTop, {});
  const xPosts = useQuery(api.xPosts.feed);
  // Latest mixes in posts from X by date. While older reviews are still unloaded, only
  // show posts at least as new as the oldest loaded review, so the order stays true.
  const latestItems = (() => {
    if (latest.status === "LoadingFirstPage" || xPosts === undefined) return undefined;
    const oldest =
      latest.status === "Exhausted" ? -Infinity : (latest.results.at(-1)?.updatedAt ?? -Infinity);
    return [
      ...latest.results.map((r) => ({ at: r.updatedAt, review: r })),
      ...xPosts.filter((p) => p.postedAt >= oldest).map((p) => ({ at: p.postedAt, x: p })),
    ].sort((a, b) => b.at - a.at);
  })();
  const feed =
    tab === "latest" ? latestItems : top?.map((r) => ({ at: r.updatedAt, review: r }));
  const summary = useQuery(api.reviews.feedSummary);
  const board = useMasonry<HTMLDivElement>(BOARD_ROW, BOARD_GAP);

  return (
    <div className={s.layout}>
      <div className={s.main}>
        <header className={s.head}>
          <div>
            <h1 className={ui.serifTitle}>What people think</h1>
            {summary && (summary.today > 0 || summary.xToday > 0 || summary.mostReviewed) && (
              <p className={s.summary}>
                {summary.today} {summary.today === 1 ? "review" : "reviews"}
                {summary.xToday > 0 && (
                  <>
                    {" "}
                    and {summary.xToday} {summary.xToday === 1 ? "post" : "posts"} from X
                  </>
                )}{" "}
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

        <div className={s.board} ref={board}>
          {feed === undefined && (
            <div className={`${ui.card} ${ui.skelCard} ${s.wide}`} aria-busy="true" />
          )}
          {feed && feed.length === 0 && (
            <div className={`${ui.card} ${ui.empty} ${s.wide}`}>
              {tab === "top" ? (
                "No reactions this week yet."
              ) : (
                <>
                  No reviews yet. <Link to="/write">Be the first to write one.</Link>
                </>
              )}
            </div>
          )}
          {feed?.map((item) =>
            "review" in item && item.review ? (
              <Post key={item.review._id} r={item.review} />
            ) : "x" in item && item.x ? (
              <XPostTile key={item.x._id} p={item.x} />
            ) : null,
          )}
          {tab === "latest" && (
            <div className={s.wide}>
              <LoadMore status={latest.status} loadMore={latest.loadMore} />
            </div>
          )}
        </div>
      </div>

      <aside className={s.rail}>
        <ModelsRail />
        <ReviewersLikeYou />
      </aside>
    </div>
  );
}

// Past this many characters a card clamps to 8 lines and links to the full review.
const LONG_REVIEW = 420;

function Post({ r }: { r: ReviewCardData }) {
  const long = r.text.length > LONG_REVIEW;
  return (
    <article className={`${ui.card} ${s.post}`}>
      <header className={s.postHead}>
        <Avatar name={r.user?.name ?? "?"} image={r.user?.image} size={36} />
        <div className={s.who}>
          <UserLink user={r.user} className={s.name} />
          <span className={s.meta}>
            {r.user && <>@{r.user.handle} · </>}
            <Link to={`/r/${r._id}`}>{timeAgo(r.updatedAt)}</Link>
          </span>
        </div>
        <MatchChip match={r.match} />
      </header>
      {(r.version || r.overall) && (
        <div className={s.postModel}>
          {r.version && (
            <Link to={versionPath(r.version.versionId)} className={s.modelChip}>
              {r.version.displayName}
            </Link>
          )}
          {r.overall ? <Stars value={r.overall} size={13} /> : null}
        </div>
      )}
      <p className={`${s.text} ${long ? s.clamped : ""}`}>{r.text}</p>
      {long && (
        <Link to={`/r/${r._id}`} className={s.more}>
          Read the full review
        </Link>
      )}
      <Snippet prompt={r.prompt} response={r.response} />
      <ReviewImage image={r.image} />
      <AxisChips scores={r.scores} />
      <footer className={s.postFoot}>
        <Reactions reviewId={r._id} counts={r.reactionCounts} mine={r.myReactions} compact />
        <DeleteReview reviewId={r._id} authorId={r.user?._id} />
      </footer>
    </article>
  );
}

/** A post from X in the feed, laid out like a review post. */
function XPostTile({ p }: { p: XFeedPost }) {
  const long = p.text.length > LONG_REVIEW;
  return (
    <article className={`${ui.card} ${s.post}`}>
      <header className={s.postHead}>
        <Avatar name={p.authorName} size={36} />
        <div className={s.who}>
          <XAuthorLink post={p} className={s.name} />
          <span className={s.meta}>
            @{p.authorHandle} ·{" "}
            <a href={p.url} target="_blank" rel="noreferrer">
              {timeAgo(p.postedAt)} on X ↗
            </a>
          </span>
        </div>
      </header>
      <div className={s.postModel}>
        <Link to={`${versionPath(p.versionId)}#from-x`} className={s.modelChip}>
          {p.model}
        </Link>
      </div>
      <p className={`${s.text} ${long ? s.clamped : ""}`}>
        <Linkified text={p.text} />
      </p>
      {(long || p.text.endsWith("…")) && (
        <a href={p.url} target="_blank" rel="noreferrer" className={s.more}>
          Read the full post on X ↗
        </a>
      )}
    </article>
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
