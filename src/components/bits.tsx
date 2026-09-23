import { Link } from "react-router-dom";
import { initials } from "../lib/format";
import { AXES } from "../lib/axes";
import s from "./bits.module.css";

export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  const n = Math.round(value);
  return (
    <span className={s.stars} style={{ fontSize: size }} aria-label={`${n} of 5 stars`}>
      <span className={s.starOn}>{"★".repeat(n)}</span>
      <span className={s.starOff}>{"★".repeat(5 - n)}</span>
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

type ScoreSet = Partial<Record<(typeof AXES)[number]["key"], number>>;

/** Mono "SMARTS 5  TASTE 4 …" line; skipped axes are omitted. */
export function AxisScores({ scores, stacked }: { scores: ScoreSet; stacked?: boolean }) {
  const items = AXES.filter((a) => scores[a.key] !== undefined);
  if (!items.length) return null;
  return (
    <div className={stacked ? s.axisStack : s.axisInline}>
      {items.map((a) => (
        <span key={a.key} className={s.axisItem}>
          <span className={s.axisLabel}>{a.label}</span> <span className={s.axisValue}>{scores[a.key]}</span>
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
