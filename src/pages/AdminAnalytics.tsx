import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Pills } from "../components/Pills";
import { UserLink } from "../components/bits";
import { REACTIONS } from "../lib/axes";
import { fmtCount } from "../lib/format";
import ui from "../components/ui.module.css";
import s from "./AdminAnalytics.module.css";

type Overview = FunctionReturnType<typeof api.analytics.overview>;
type Counts = Overview["totals"];

const reactionTotal = (c: Counts) => Object.values(c.reactions).reduce((a, b) => a + b, 0);

const METRICS = [
  { key: "signups", label: "Signups", get: (c: Counts) => c.signups },
  { key: "activeUsers", label: "Active users", get: (c: Counts) => c.activeUsers },
  { key: "reviews", label: "New reviews", get: (c: Counts) => c.reviews },
  { key: "updates", label: "Review updates", get: (c: Counts) => c.updates },
  { key: "reactions", label: "Reactions", get: reactionTotal },
  { key: "takes", label: "Head-to-heads", get: (c: Counts) => c.takes },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

const PERIODS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-22" → "Sep 22" */
const dayLabel = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8))}`;

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));

export function Analytics() {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<MetricKey>("signups");
  const today = new Date().toISOString().slice(0, 10);
  const fresh = useQuery(api.analytics.overview, { today, days });
  // Keep the last result on screen (dimmed) while a new period loads.
  const [data, setData] = useState<Overview | undefined>(fresh);
  useEffect(() => {
    if (fresh) setData(fresh);
  }, [fresh]);

  return (
    <section>
      <div className={ui.sectionHead}>
        <h2 className={ui.sectionLabel}>Analytics</h2>
        <Pills label="Period" options={PERIODS} value={days} onChange={setDays} />
      </div>
      {!data ? (
        <div className={`${ui.card} ${s.loading}`} aria-busy="true" />
      ) : (
        <div className={s.body} style={{ opacity: fresh ? 1 : 0.5 }}>
          <Tiles data={data} metric={metric} onPick={setMetric} />
          <Rates data={data} />
          <Trend data={data} metric={metric} />
          <Reactions totals={data.totals} />
          <TopLists top={data.top} />
          <p className={ui.meta}>
            Counts are by UTC day and refresh hourly. Changes compare with the {days} days before.
          </p>
        </div>
      )}
    </section>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0) return <span className={s.flat}>{now === 0 ? "no change" : "new"}</span>;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return <span className={s.flat}>no change</span>;
  return (
    <span className={change > 0 ? s.up : s.down}>
      <span aria-hidden="true">{change > 0 ? "▲" : "▼"}</span>{" "}
      <span className={ui.srOnly}>{change > 0 ? "up" : "down"}</span>
      {Math.abs(change)}%
    </span>
  );
}

function Tiles({
  data,
  metric,
  onPick,
}: {
  data: Overview;
  metric: MetricKey;
  onPick: (m: MetricKey) => void;
}) {
  const { totals, prevTotals, allTime } = data;
  return (
    <div className={s.tiles} role="group" aria-label="Chart a metric">
      {METRICS.map((m) => (
        <button
          key={m.key}
          type="button"
          className={`${s.tile} ${metric === m.key ? s.tileOn : ""}`}
          aria-pressed={metric === m.key}
          onClick={() => onPick(m.key)}
        >
          <span className={s.tileLabel}>{m.label}</span>
          <span className={s.tileValue}>{fmtCount(m.get(totals))}</span>
          <span className={s.tileFoot}>
            <Delta now={m.get(totals)} before={m.get(prevTotals)} />
            {m.key !== "activeUsers" && <span>{fmtCount(m.get(allTime))} all time</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** A share, e.g. 12 of 40 → 30%, with last period's share for comparison. */
function Rate({
  label,
  part,
  whole,
  prev,
  of,
}: {
  label: string;
  part: number;
  whole: number;
  prev: [number, number];
  of: string;
}) {
  const now = pct(part, whole);
  const before = pct(...prev);
  return (
    <div className={s.tile}>
      <span className={s.tileLabel}>{label}</span>
      <span className={s.tileValue}>{now === null ? "—" : `${now}%`}</span>
      <span className={s.tileFoot}>
        <span>
          {fmtCount(part)} of {fmtCount(whole)} {of}
          {before !== null && ` · ${before}% before`}
        </span>
      </span>
    </div>
  );
}

function Rates({ data }: { data: Overview }) {
  const { totals: t, prevTotals: p, returning } = data;
  const words = (c: Counts) => (c.reviews ? Math.round(c.reviewWords / c.reviews) : null);
  const methodKnown = (c: Counts) => c.signupsX + c.signupsEmail;
  return (
    <div className={s.tiles}>
      <Rate
        label="Activation"
        part={t.activated}
        whole={t.signups}
        prev={[p.activated, p.signups]}
        of="new users reviewed within 7 days"
      />
      <Rate
        label="Returning"
        part={returning.now}
        whole={t.activeUsers}
        prev={[returning.before, p.activeUsers]}
        of="active users were active before"
      />
      <Rate
        label="Signups via X"
        part={t.signupsX}
        whole={methodKnown(t)}
        prev={[p.signupsX, methodKnown(p)]}
        of="signups (the rest used email)"
      />
      <Rate
        label="With screenshot"
        part={t.reviewsWithImage}
        whole={t.reviews}
        prev={[p.reviewsWithImage, p.reviews]}
        of="new reviews"
      />
      <Rate
        label="Rated an axis"
        part={t.reviewsRated}
        whole={t.reviews}
        prev={[p.reviewsRated, p.reviews]}
        of="new reviews"
      />
      <div className={s.tile}>
        <span className={s.tileLabel}>Review length</span>
        <span className={s.tileValue}>{words(t) ?? "—"}</span>
        <span className={s.tileFoot}>
          <span>
            words on average
            {words(p) !== null && ` · ${words(p)} before`}
          </span>
        </span>
      </div>
    </div>
  );
}

/** Rounds up to 1, 2 or 5 × a power of ten. */
function niceMax(n: number) {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  return ([1, 2, 5, 10].find((m) => m * pow >= n) ?? 10) * pow;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const CHART_H = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 36 };

function Trend({ data, metric }: { data: Overview; metric: MetricKey }) {
  const m = METRICS.find((x) => x.key === metric)!;
  const values = data.series.map((d) => m.get(d));
  const [box, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const max = niceMax(Math.max(...values));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const band = plotW / values.length;
  const barW = Math.max(1, Math.min(24, band - 2));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const x = (i: number) => PAD.left + i * band + (band - barW) / 2;
  const ticks = [0, max / 2, max];
  const labelAt = [0, Math.floor((values.length - 1) / 2), values.length - 1];

  const bar = (i: number, v: number) => {
    const top = y(v);
    const h = PAD.top + plotH - top;
    if (h <= 0) return null;
    const r = Math.min(4, barW / 2, h);
    const x0 = x(i);
    const base = PAD.top + plotH;
    return `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${base}Z`;
  };

  return (
    <div className={`${ui.card} ${s.chartCard}`}>
      <div className={s.chartHead}>
        <h3 className={s.chartTitle}>{m.label} per day</h3>
        {active !== null && (
          <p className={s.readout} aria-live="polite">
            <strong>{fmtCount(values[active])}</strong> {dayLabel(data.series[active].day)}
          </p>
        )}
      </div>
      <div
        ref={box}
        className={s.chart}
        tabIndex={0}
        role="img"
        aria-label={`${m.label} per day, ${dayLabel(data.series[0].day)} to ${dayLabel(data.series[values.length - 1].day)}. Use arrow keys to read each day.`}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const step = e.key === "ArrowLeft" ? -1 : 1;
          setActive((i) => Math.min(values.length - 1, Math.max(0, (i ?? values.length) + step)));
        }}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        {width > 0 && (
          <svg width={width} height={CHART_H} aria-hidden="true">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={s.grid} />
                <text x={PAD.left - 8} y={y(t)} className={s.tick} textAnchor="end" dominantBaseline="middle">
                  {fmtCount(t)}
                </text>
              </g>
            ))}
            {values.map((v, i) => {
              const d = bar(i, v);
              return d && <path key={i} d={d} className={i === active ? s.barOn : s.bar} />;
            })}
            {labelAt.map((i, k) => (
              <text
                key={k}
                x={PAD.left + i * band + band / 2}
                y={CHART_H - 6}
                className={s.tick}
                textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
              >
                {dayLabel(data.series[i].day)}
              </text>
            ))}
            {values.map((_, i) => (
              <rect
                key={i}
                x={PAD.left + i * band}
                y={PAD.top}
                width={band}
                height={plotH}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
              />
            ))}
          </svg>
        )}
      </div>
      <details className={s.table}>
        <summary className={ui.meta}>Show as table</summary>
        <div className={s.tableScroll}>
          <table>
            <thead>
              <tr>
                <th scope="col">Day</th>
                {METRICS.map((x) => (
                  <th key={x.key} scope="col">
                    {x.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data.series].reverse().map((d) => (
                <tr key={d.day}>
                  <th scope="row">{dayLabel(d.day)}</th>
                  {METRICS.map((x) => (
                    <td key={x.key}>{fmtCount(x.get(d))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Reactions({ totals }: { totals: Counts }) {
  const max = Math.max(1, ...Object.values(totals.reactions));
  const other = [
    { label: "Custom axes", n: totals.axes },
    { label: "Model requests", n: totals.requests },
    { label: "New model pages", n: totals.models },
  ];
  return (
    <div className={s.pair}>
      <div className={`${ui.card} ${s.chartCard}`}>
        <h3 className={s.chartTitle}>Reactions by kind</h3>
        <ul className={s.hbars}>
          {REACTIONS.map(({ kind, label, emoji }) => {
            const n = totals.reactions[kind];
            return (
              <li key={kind}>
                <span className={s.hbarLabel}>
                  <span aria-hidden="true">{emoji}</span> {label}
                </span>
                <span className={s.hbarTrack}>
                  {n > 0 && <span className={s.hbar} style={{ width: `${(n / max) * 100}%` }} />}
                  <span className={s.hbarValue}>{fmtCount(n)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className={`${ui.card} ${s.chartCard}`}>
        <h3 className={s.chartTitle}>Also new</h3>
        <dl className={s.stats}>
          {other.map((o) => (
            <div key={o.label}>
              <dt>{o.label}</dt>
              <dd>{fmtCount(o.n)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function TopList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className={`${ui.card} ${s.chartCard}`}>
      <h3 className={s.chartTitle}>{title}</h3>
      {children.length ? <ol className={s.top}>{children}</ol> : <p className={ui.meta}>{empty}</p>}
    </div>
  );
}

function TopLists({ top }: { top: Overview["top"] }) {
  return (
    <>
      <div className={s.trio}>
        <TopList title="Most reviewed models" empty="No new reviews.">
          {top.models.map((m) => (
            <li key={m.versionId}>
              <Link to={`/m/${m.versionId}`}>{m.displayName}</Link>
              <span className={s.topCount}>
                {fmtCount(m.count)} {m.count === 1 ? "review" : "reviews"}
              </span>
            </li>
          ))}
        </TopList>
        <TopList title="Most active reviewers" empty="No new reviews.">
          {top.reviewers.map((r) => (
            <li key={r.user._id}>
              <UserLink user={r.user} />
              <span className={s.topCount}>
                {fmtCount(r.count)} {r.count === 1 ? "review" : "reviews"}
              </span>
            </li>
          ))}
        </TopList>
        <TopList title="Most-reacted reviews" empty="No reactions on new reviews yet.">
          {top.reviews.map((r) => (
            <li key={r.reviewId}>
              <Link to={`/r/${r.reviewId}`}>
                {r.user?.name ?? "Unknown"} on {r.model}
              </Link>
              <span className={s.topCount}>
                {fmtCount(r.reactionCount)} {r.reactionCount === 1 ? "reaction" : "reactions"}
              </span>
            </li>
          ))}
        </TopList>
      </div>
      {top.capped && (
        <p className={ui.meta}>Top lists count only the most recent 2,000 reviews in this period.</p>
      )}
    </>
  );
}
