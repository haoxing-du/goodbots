import { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ReviewCard as ReviewCardData } from "../../convex/reviews";
import type { XFeedPost } from "../../convex/xPosts";
import { AxisChips, Avatar, DeleteReview, MatchChip, ReviewImage, Snippet, Stars, UserLink } from "./bits";
import { Reactions } from "./Reactions";
import { Linkified, XAuthorLink } from "./XPost";
import { timeAgo } from "../lib/format";
import { versionPath } from "../lib/paths";
import { useMasonry } from "../lib/useMasonry";
import ui from "./ui.module.css";
import s from "./FeedCards.module.css";

/** Feed cards (reviews and posts from X) on a masonry board: the reviews page and the homepage. */

// Masonry grid: 4px rows, 16px between cards (matches .board in the CSS).
const BOARD_ROW = 4;
const BOARD_GAP = 16;

export function FeedBoard({ children }: { children: ReactNode }) {
  const board = useMasonry<HTMLDivElement>(BOARD_ROW, BOARD_GAP);
  return (
    <div className={s.board} ref={board}>
      {children}
    </div>
  );
}

/** Spans the whole board (empty states, "load more"). */
export const boardWide = s.wide;

export type FeedItem = { at: number; review?: ReviewCardData; x?: XFeedPost };

/**
 * Reviews and posts from X, newest first. Unless every review is loaded (`complete`),
 * only posts at least as new as the oldest review are kept, so the order stays true.
 */
export function mergeFeed(reviews: ReviewCardData[], xPosts: XFeedPost[], complete: boolean): FeedItem[] {
  const oldest = complete ? -Infinity : (reviews.at(-1)?.updatedAt ?? -Infinity);
  return [
    ...reviews.map((r) => ({ at: r.updatedAt, review: r })),
    ...xPosts.filter((p) => p.postedAt >= oldest).map((p) => ({ at: p.postedAt, x: p })),
  ].sort((a, b) => b.at - a.at);
}

export function FeedCard({ item }: { item: FeedItem }) {
  if (item.review) return <ReviewPost r={item.review} />;
  if (item.x) return <XPostTile p={item.x} />;
  return null;
}

// Past this many characters a card clamps to 8 lines and links to the full review.
const LONG_REVIEW = 420;

export function ReviewPost({ r }: { r: ReviewCardData }) {
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
export function XPostTile({ p }: { p: XFeedPost }) {
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
