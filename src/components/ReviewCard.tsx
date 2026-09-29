import { useState } from "react";
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
import { useCardLink } from "../lib/useCardLink";
import ui from "./ui.module.css";
import s from "./ReviewCard.module.css";

/**
 * A full review: reviewer column (name, match, axis scores) + stars, text, snippet, reactions.
 * Clicking the card opens the review's page, except on that page itself (`linked={false}`).
 */
export function ReviewCard({ r, linked = true }: { r: Post; linked?: boolean }) {
  const [editing, setEditing] = useState(false);
  const cardLink = useCardLink(`/p/${r._id}`);
  const link = linked && !editing;
  const meta = (
    <span className={s.reviewMeta}>
      {!editing && <EditPostLink r={r} onEdit={() => setEditing(true)} />}
      <DeletePost entryId={r._id} authorId={r.user?._id} />
      <PostTime r={r} className={`${ui.meta} ${s.permalink}`} />
    </span>
  );
  const body = editing ? (
    <EditPostForm entryId={r._id} text={r.text} onDone={() => setEditing(false)} />
  ) : (
    <p className={ui.body}>
      <ReviewText r={r} />
    </p>
  );
  return (
    <article className={`${ui.card} ${s.review} ${link ? s.linked : ""}`} {...(link ? cardLink : {})}>
      <div className={s.reviewer}>
        <div className={s.who}>
          <Avatar name={r.user?.name ?? "?"} image={r.user?.image} />
          <div>
            <UserLink user={r.user} className={s.whoName} />
            <div className={ui.meta}>@{r.user?.handle}</div>
          </div>
        </div>
        <MatchChip match={r.match} />
        <AxisChips scores={r.scores} />
      </div>
      <div className={s.reviewBody}>
        {r.overall ? (
          <>
            <div className={s.reviewTop}>
              <Stars value={r.overall} />
              {meta}
            </div>
            {body}
          </>
        ) : (
          // No stars to sit beside: the date and actions go next to the text instead.
          <div className={s.textRow}>
            {body}
            {meta}
          </div>
        )}
        <XImportNote r={r} />
        <Snippet prompt={r.prompt} response={r.response} />
        <ReviewImage image={r.image} />
        <Reactions entryId={r._id} counts={r.reactionCounts} mine={r.myReactions} />
      </div>
    </article>
  );
}

