import { Link } from "react-router-dom";
import type { ReviewCard as ReviewCardData } from "../../convex/reviews";
import { AxisChips, Avatar, DeleteReview, MatchChip, ReviewImage, Snippet, Stars, UserLink } from "./bits";
import { Reactions } from "./Reactions";
import { ReviewText, XImportNote } from "./XPost";
import { timeAgo } from "../lib/format";
import ui from "./ui.module.css";
import s from "./ReviewCard.module.css";

/** A full review: reviewer column (name, match, axis scores) + stars, text, snippet, reactions. */
export function ReviewCard({ r }: { r: ReviewCardData }) {
  return (
    <article className={`${ui.card} ${s.review}`}>
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
        <div className={s.reviewTop}>
          {r.overall ? <Stars value={r.overall} /> : <span />}
          <span className={s.reviewMeta}>
            <DeleteReview reviewId={r._id} authorId={r.user?._id} />
            <Link to={`/r/${r._id}`} className={`${ui.meta} ${s.permalink}`} title="Link to this review">
              {timeAgo(r.updatedAt)}
            </Link>
          </span>
        </div>
        <p className={ui.body}>
          <ReviewText r={r} />
        </p>
        <XImportNote r={r} />
        <Snippet prompt={r.prompt} response={r.response} />
        <ReviewImage image={r.image} />
        <Reactions reviewId={r._id} counts={r.reactionCounts} mine={r.myReactions} />
      </div>
    </article>
  );
}
