import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ReviewCard } from "../components/ReviewCard";
import { AxisChips, Avatar, MatchChip, PageLoading, Stars, UserLink } from "../components/bits";
import { versionPath } from "../lib/paths";
import { proseDate } from "../lib/format";
import { useNoIndex, useTitle } from "../lib/useTitle";
import { NotFound } from "./NotFound";
import ui from "../components/ui.module.css";
import s from "./ReviewPage.module.css";

/** Everything one person wrote about one model (/r/:id): their current rating and every review. */
export function ReviewPage() {
  const { id = "" } = useParams();
  const r = useQuery(api.reviews.get, { id });
  useTitle(r ? `${r.user?.name ?? "Someone"} on ${r.version?.displayName}` : undefined);
  useNoIndex(!!r?.user?.imported); // an unclaimed post from X

  if (r === undefined) return <PageLoading />;
  if (r === null) return <NotFound what="review" />;
  const n = r.posts.length;
  return (
    <div className={ui.page}>
      <header>
        <div className={ui.monoLabel}>Reviews by {r.user?.name ?? "someone"}</div>
        {r.version && (
          <h1 className={s.title}>
            <Link to={versionPath(r.version.versionId)}>{r.version.displayName}</Link>
          </h1>
        )}
      </header>
      <section className={`${ui.card} ${s.rating}`} aria-label="Their current rating">
        <div className={s.ratingWho}>
          <Avatar name={r.user?.name ?? "?"} image={r.user?.image} />
          <div>
            <UserLink user={r.user} />
            <div className={ui.meta}>
              @{r.user?.handle} · {n} {n === 1 ? "review" : "reviews"} since {proseDate(r.createdAt)}
            </div>
          </div>
          <MatchChip match={r.match} />
        </div>
        {(r.overall || r.scores.length > 0) && (
          <div className={s.ratingNow}>
            <span className={ui.meta}>Rating now</span>
            {r.overall ? <Stars value={r.overall} /> : null}
            <AxisChips scores={r.scores} />
          </div>
        )}
      </section>
      <div className={s.posts}>
        {r.posts.map((p) => (
          <ReviewCard key={p._id} r={p} />
        ))}
      </div>
      {r.version && (
        <p>
          <Link to={versionPath(r.version.versionId)} className={s.more}>
            All reviews of {r.version.displayName} →
          </Link>
        </p>
      )}
    </div>
  );
}

/** One review's shareable page (/p/:id). */
export function PostPage() {
  const { id = "" } = useParams();
  const r = useQuery(api.reviews.post, { id });
  useTitle(r ? `${r.user?.name ?? "Someone"} on ${r.version?.displayName}` : undefined);
  useNoIndex(!!r?.user?.imported); // an unclaimed post from X

  if (r === undefined) return <PageLoading />;
  if (r === null) return <NotFound what="review" />;
  return (
    <div className={ui.page}>
      <header>
        <div className={ui.monoLabel}>Review</div>
        {r.version && (
          <h1 className={s.title}>
            <Link to={versionPath(r.version.versionId)}>{r.version.displayName}</Link>
          </h1>
        )}
      </header>
      <ReviewCard r={r} linked={false} />
      <div className={s.links}>
        {r.postCount > 1 && (
          <Link to={`/r/${r.reviewId}`} className={s.more}>
            All {r.postCount} reviews of {r.version?.displayName} by {r.user?.name ?? "them"} →
          </Link>
        )}
        {r.version && (
          <Link to={versionPath(r.version.versionId)} className={s.more}>
            All reviews of {r.version.displayName} →
          </Link>
        )}
      </div>
    </div>
  );
}
