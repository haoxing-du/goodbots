import { Link } from "react-router-dom";
import type { Post } from "../../convex/reviews";
import { timeAgo } from "../lib/format";

/** When a review was posted (and whether it's been edited), linking to its page. */
export function PostTime({ r, className }: { r: Pick<Post, "_id" | "createdAt" | "editedAt">; className?: string }) {
  return (
    <Link to={`/p/${r._id}`} className={className} title="Link to this review">
      {timeAgo(r.createdAt)}
      {r.editedAt && " · edited"}
    </Link>
  );
}
