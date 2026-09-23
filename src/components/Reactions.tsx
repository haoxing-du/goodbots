import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { REACTIONS, ReactionKind } from "../lib/axes";
import { useSignIn } from "./SignIn";
import s from "./Reactions.module.css";

export function Reactions({
  reviewId,
  counts,
  mine,
  compact,
}: {
  reviewId: Id<"reviews">;
  counts: Record<ReactionKind, number>;
  mine: ReactionKind[];
  /** Emoji + count only (the feed board); the label moves to the accessible name. */
  compact?: boolean;
}) {
  const toggle = useMutation(api.reactions.toggle);
  const { requireAuth } = useSignIn();
  // Optimistic copy of the server state; resyncs whenever the server state changes.
  const [local, setLocal] = useState({ counts, mine });
  const [failed, setFailed] = useState<string | null>(null);
  const serverKey = JSON.stringify([counts, mine]);
  useEffect(() => setLocal({ counts, mine }), [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onClick = (kind: ReactionKind) =>
    requireAuth(() => {
      const on = local.mine.includes(kind);
      setLocal((prev) => ({
        counts: { ...prev.counts, [kind]: prev.counts[kind] + (on ? -1 : 1) },
        mine: on ? prev.mine.filter((k) => k !== kind) : [...prev.mine, kind],
      }));
      setFailed(null);
      toggle({ reviewId, kind }).catch((e) => {
        setLocal({ counts, mine });
        setFailed(e instanceof ConvexError ? String(e.data) : "Couldn’t save your reaction. Try again.");
      });
    }, "Sign in to react to reviews.");

  return (
    <div className={s.row}>
      {REACTIONS.map(({ kind, label, emoji }) => {
        const on = local.mine.includes(kind);
        const n = local.counts[kind];
        return (
          <button
            key={kind}
            type="button"
            className={`${on ? s.on : s.off} ${compact ? s.compact : ""}`}
            aria-pressed={on}
            aria-label={compact ? `${label}, ${n}` : undefined}
            data-tip={compact ? label : undefined}
            onClick={() => onClick(kind)}
          >
            <span className={s.emoji} aria-hidden>
              {emoji}
            </span>
            {!compact && label} <span className={s.count}>{n}</span>
          </button>
        );
      })}
      <span className={s.failed} role="status">
        {failed}
      </span>
    </div>
  );
}
