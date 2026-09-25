import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { ReviewCard } from "../../convex/reviews";
import { useSignIn } from "./SignIn";
import { writePath } from "../lib/paths";
import s from "./XPost.module.css";

/** Text with its links (X's t.co short links, in imported posts) made clickable. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer nofollow">
            {part.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** A review's text, with links made clickable when it was imported from X. */
export function ReviewText({ r }: { r: Pick<ReviewCard, "text" | "xUrl"> }) {
  return r.xUrl ? <Linkified text={r.text} /> : <>{r.text}</>;
}

/**
 * The line under a review imported from X: where it came from, and either an
 * invitation for its author to claim it (sign in with X) or, once they have, to
 * add the ratings and head-to-head an X post can't carry.
 */
export function XImportNote({ r }: { r: ReviewCard }) {
  const me = useQuery(api.users.me);
  const { open } = useSignIn();
  if (!r.xUrl) return null;
  const source = (
    <a href={r.xUrl} target="_blank" rel="noreferrer">
      {r.user?.imported ? "From their post on X ↗" : "From a post on X ↗"}
    </a>
  );
  const addRatings = r.version && `${writePath(r.version.versionId)}&fromX=1`;
  if (r.user?.imported) {
    return (
      <p className={s.note}>
        {source} · Is this you?{" "}
        <button
          type="button"
          className={s.claim}
          onClick={() =>
            // After signing in, land on the review itself: it has both "Delete" and
            // "Add ratings or a head-to-head".
            open(
              `Sign in with X as @${r.user?.xHandle} to claim this review. Then you can add ratings and a head-to-head, or delete it.`,
              `/r/${r._id}`,
            )
          }
        >
          Sign in with X to claim or remove it
        </button>
      </p>
    );
  }
  const mine = me && r.user && me._id === r.user._id;
  const unrated = !r.overall && r.scores.length === 0;
  return (
    <p className={s.note}>
      {source}
      {mine && unrated && addRatings && (
        <>
          {" "}
          · <Link to={addRatings}>Add ratings or a head-to-head</Link>
        </>
      )}
    </p>
  );
}
