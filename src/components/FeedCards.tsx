import { ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "../../convex/reviews";
import {
  AxisChips,
  Avatar,
  DeletePost,
  EditPostForm,
  EditPostLink,
  MatchChip,
  ReviewImage,
  Snippet,
  Stars,
  UserLink,
} from "./bits";
import { Reactions } from "./Reactions";
import { ReviewText, XImportNote } from "./XPost";
import { PostTime } from "./PostTime";
import { versionPath } from "../lib/paths";
import { useMasonry } from "../lib/useMasonry";
import { useCardLink } from "../lib/useCardLink";
import ui from "./ui.module.css";
import s from "./FeedCards.module.css";

/** Review cards on a masonry board: the reviews page and the homepage. */

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

// Past this many characters a card clamps to 8 lines and links to the full review.
const LONG_REVIEW = 420;

export function ReviewPost({ r }: { r: Post }) {
  const [editing, setEditing] = useState(false);
  const long = r.text.length > LONG_REVIEW;
  const cardLink = useCardLink(`/p/${r._id}`);
  return (
    <article className={`${ui.card} ${s.post} ${editing ? "" : s.linked}`} {...(editing ? {} : cardLink)}>
      <header className={s.postHead}>
        <Avatar name={r.user?.name ?? "?"} image={r.user?.image} size={36} />
        <div className={s.who}>
          <UserLink user={r.user} className={s.name} />
          <span className={s.meta}>
            {r.user && <>@{r.user.handle} · </>}
            <PostTime r={r} />
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
      {editing ? (
        <EditPostForm entryId={r._id} text={r.text} onDone={() => setEditing(false)} />
      ) : (
        <p className={`${s.text} ${long ? s.clamped : ""}`}>
          <ReviewText r={r} />
        </p>
      )}
      {long && !editing && (
        <Link to={`/p/${r._id}`} className={s.more}>
          Read the full review
        </Link>
      )}
      <Snippet prompt={r.prompt} response={r.response} />
      <ReviewImage image={r.image} />
      <AxisChips scores={r.scores} />
      <XImportNote r={r} />
      <footer className={s.postFoot}>
        <Reactions entryId={r._id} counts={r.reactionCounts} mine={r.myReactions} compact />
        <span className={s.postActions}>
          {!editing && <EditPostLink r={r} onEdit={() => setEditing(true)} />}
          <DeletePost entryId={r._id} authorId={r.user?._id} />
        </span>
      </footer>
    </article>
  );
}
