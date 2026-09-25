import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ReviewCard } from "../components/ReviewCard";
import { versionPath } from "../lib/paths";
import { useNoIndex, useTitle } from "../lib/useTitle";
import { NotFound } from "./NotFound";
import { PageLoading } from "../components/bits";
import ui from "../components/ui.module.css";
import s from "./ReviewPage.module.css";

/** A single review's shareable page. */
export function ReviewPage() {
  const { id = "" } = useParams();
  const r = useQuery(api.reviews.get, { id });
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
      <ReviewCard r={r} />
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
