import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { initials } from "../lib/format";
import { AxisScore } from "../lib/axes";
import { useConfirm } from "./Confirm";
import s from "./bits.module.css";
import ui from "./ui.module.css";

/** Page-shaped placeholder while a page's main query loads; announced once. */
export function PageLoading() {
  return (
    <div className={ui.page} aria-busy="true">
      <span className={ui.srOnly} role="status">
        Loading…
      </span>
      <div className={ui.skelTitle} />
      <div className={`${ui.card} ${ui.skelCard}`} />
    </div>
  );
}

export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  const n = Math.round(value);
  return (
    <span className={s.stars} style={{ fontSize: size }} role="img" aria-label={`${n} of 5 stars`}>
      <span className={s.starOn} aria-hidden>{"★".repeat(n)}</span>
      <span className={s.starOff} aria-hidden>{"☆".repeat(5 - n)}</span>
    </span>
  );
}

export function MatchChip({ match }: { match: number | null | undefined }) {
  if (match == null) return null;
  const tone = match >= 70 ? s.matchHigh : match >= 50 ? s.matchMid : s.matchLow;
  return <span className={`${s.match} ${tone}`}>{match}% match</span>;
}

export function Avatar({
  name,
  image,
  size = 32,
  className = "",
}: {
  name: string;
  image?: string;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (image) {
    return <img className={`${s.avatar} ${className}`} src={image} alt="" style={style} referrerPolicy="no-referrer" />;
  }
  return (
    <span className={`${s.avatar} ${className}`} style={style} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function UserLink({
  user,
  className,
  children,
}: {
  user: { handle: string; name: string } | null;
  className?: string;
  children?: React.ReactNode;
}) {
  if (!user) return <span className={className}>Unknown</span>;
  return (
    <Link to={`/u/${user.handle}`} className={`${s.userLink} ${className ?? ""}`}>
      {children ?? user.name}
    </Link>
  );
}

/** Mono "SMARTS 5  TASTE 4 …" line; only axes the reviewer rated. */
export function AxisScores({ scores, stacked }: { scores: AxisScore[]; stacked?: boolean }) {
  if (!scores.length) return null;
  return (
    <div className={stacked ? s.axisStack : s.axisInline}>
      {scores.map((a) => (
        <span key={a._id} className={s.axisItem}>
          <span className={s.axisLabel}>{a.name}</span> <span className={s.axisValue}>{a.score}</span>
        </span>
      ))}
    </div>
  );
}

export function Snippet({ prompt, response }: { prompt?: string; response?: string }) {
  if (!prompt && !response) return null;
  return (
    <div className={s.snippet}>
      {prompt && (
        <div>
          <span className={s.snipPrompt}>prompt ›</span> {prompt}
        </div>
      )}
      {response && (
        <div>
          <span className={s.snipModel}>model ›</span> {response}
        </div>
      )}
    </div>
  );
}

/** Small "Delete" link on a review, shown to its author (and admins). */
export function DeleteReview({ reviewId, authorId }: { reviewId: Id<"reviews">; authorId?: string }) {
  const me = useQuery(api.users.me);
  const remove = useMutation(api.reviews.remove);
  if (!me || (me._id !== authorId && !me.isAdmin)) return null;
  return (
    <ConfirmDelete
      title="Delete this review?"
      body="Its update history goes too. This can't be undone."
      confirmLabel="Delete review"
      run={() => remove({ reviewId })}
    />
  );
}

export function ConfirmDelete({
  title,
  body,
  confirmLabel,
  run,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  run: () => Promise<unknown>;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={s.deleteLink}
        disabled={busy}
        onClick={async () => {
          if (!(await confirm({ title, body, confirm: confirmLabel, danger: true }))) return;
          setBusy(true);
          setError(null);
          try {
            await run();
          } catch (e) {
            setError(
              e instanceof ConvexError
                ? String(e.data)
                : "Couldn't delete that. Check your connection and try again.",
            );
            setBusy(false);
          }
        }}
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <span className={s.deleteError} role="alert">
          {error}
        </span>
      )}
    </>
  );
}

/** "Load more" for a paginated list; hidden when everything is loaded. */
export function LoadMore({
  status,
  loadMore,
  label = "Load more",
}: {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (n: number) => void;
  label?: string;
}) {
  if (status === "Exhausted" || status === "LoadingFirstPage") return null;
  return (
    <div className={s.loadMore}>
      <button
        type="button"
        className={s.loadMoreBtn}
        disabled={status === "LoadingMore"}
        onClick={() => loadMore(20)}
      >
        {status === "LoadingMore" ? "Loading…" : label}
      </button>
    </div>
  );
}
