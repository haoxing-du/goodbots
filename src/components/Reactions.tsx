import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { REACTIONS, ReactionKind } from "../lib/axes";
import { useSignIn } from "./SignIn";
import s from "./Reactions.module.css";

export function Reactions({
  reviewId,
  counts,
  mine,
}: {
  reviewId: Id<"reviews">;
  counts: Record<ReactionKind, number>;
  mine: ReactionKind[];
}) {
  const toggle = useMutation(api.reactions.toggle);
  const { requireAuth } = useSignIn();
  // Optimistic copy of the server state; resyncs whenever the server state changes.
  const [local, setLocal] = useState({ counts, mine });
  const serverKey = JSON.stringify([counts, mine]);
  useEffect(() => setLocal({ counts, mine }), [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onClick = (kind: ReactionKind) =>
    requireAuth(() => {
      const on = local.mine.includes(kind);
      setLocal((prev) => ({
        counts: { ...prev.counts, [kind]: prev.counts[kind] + (on ? -1 : 1) },
        mine: on ? prev.mine.filter((k) => k !== kind) : [...prev.mine, kind],
      }));
      toggle({ reviewId, kind }).catch(() => setLocal({ counts, mine }));
    }, "Sign in to react to reviews.");

  return (
    <div className={s.row}>
      {REACTIONS.map(({ kind, label }) => {
        const on = local.mine.includes(kind);
        return (
          <button
            key={kind}
            type="button"
            className={on ? s.on : s.off}
            aria-pressed={on}
            onClick={() => onClick(kind)}
          >
            {label} <span className={s.count}>{local.counts[kind]}</span>
          </button>
        );
      })}
    </div>
  );
}
