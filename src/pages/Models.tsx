import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Pills } from "../components/Pills";
import { Stars } from "../components/bits";
import { ModelPicker } from "../components/ModelPicker";
import { fmtAvg, fmtCount } from "../lib/format";
import { versionPath } from "../lib/paths";
import ui from "../components/ui.module.css";
import s from "./Models.module.css";
import { useTitle } from "../lib/useTitle";
import { axisVars } from "../lib/axes";

type ListedVersion = NonNullable<
  ReturnType<typeof useQuery<typeof api.models.list>>
>[number];
/** A model card: a reviewed model, or one that so far only has posts from X. */
type Version = Omit<ListedVersion, "_id"> & { xCount: number };
type View = "provider" | "all";

const VIEW_KEY = "gb.modelsView";

export function Models() {
  const navigate = useNavigate();
  useTitle("Models");
  // Only models people have reviewed or posted about on X; the full catalog is reachable through search.
  const listed = useQuery(api.models.list);
  const xModels = useQuery(api.xPosts.models);
  const versions = listed && xModels ? withXModels(listed, xModels) : undefined;
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "all" ? "all" : "provider";
    } catch {
      return "provider";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* storage unavailable */
    }
  }, [view]);

  return (
    <div className={ui.page}>
      <header className={s.head}>
        <h1 className={ui.serifTitle}>Models</h1>
        <div className={s.headActions}>
          <Pills
            label="Group models"
            options={[
              { value: "provider", label: "By provider" },
              { value: "all", label: "All models" },
            ]}
            value={view}
            onChange={setView}
          />
          <Link to="/request" className={ui.btnGhost}>
            Request a model
          </Link>
        </div>
      </header>

      {versions && versions.length === 0 && (
        <div className={`${ui.card} ${s.emptyCard}`}>
          <p>
            No reviews yet. Every model on OpenRouter is here; find one and
            write the first review.
          </p>
          <ModelPicker
            label="Find a model"
            onPick={(m) => navigate(versionPath(m.versionId))}
          />
        </div>
      )}
      {versions &&
        versions.length > 0 &&
        (view === "all" ? (
          <section>
            <h2 className={ui.sectionLabel}>By overall rating</h2>
            <Grid versions={versions} />
          </section>
        ) : (
          // Provider blocks share rows: each spans as many columns as it has models.
          <div className={s.families}>
            {packRows(families(versions), 3).map((f) => (
              <section
                key={f.slug}
                className={s[`span${Math.min(f.versions.length, 3)}`]}
              >
                <div className={s.familyHead}>
                  <h2 className={s.familyName}>{f.name}</h2>
                </div>
                <Grid versions={f.versions} />
              </section>
            ))}
          </div>
        ))}
    </div>
  );
}

function withXModels(
  listed: ListedVersion[],
  xModels: NonNullable<ReturnType<typeof useQuery<typeof api.xPosts.models>>>,
): Version[] {
  const xCount = new Map(xModels.map((m) => [m.versionId, m.count]));
  const cards: Version[] = listed
    .map((v) => ({ ...v, xCount: xCount.get(v.versionId) ?? 0 }))
    .filter((v) => v.reviewCount > 0 || v.xCount > 0);
  const shown = new Set(cards.map((c) => c.versionId));
  const noRatings = (listed[0]?.axes ?? []).map((a) => ({ ...a, avg: null }));
  for (const m of xModels) {
    if (shown.has(m.versionId)) continue;
    cards.push({
      versionId: m.versionId,
      displayName: m.displayName,
      releasedAt: m.releasedAt,
      provider: m.provider,
      providerSlug: m.providerSlug,
      reviewCount: 0,
      overall: null,
      axes: noRatings,
      xCount: m.count,
    });
  }
  return cards.sort(
    (a, b) =>
      (b.overall ?? -1) - (a.overall ?? -1) || b.reviewCount - a.reviewCount || b.xCount - a.xCount,
  );
}

/** Group by provider: providers ordered by their best-rated model, models newest first. */
function families(versions: Version[]) {
  const map = new Map<
    string,
    { slug: string; name: string; versions: Version[] }
  >();
  for (const v of versions) {
    const f = map.get(v.providerSlug) ?? {
      slug: v.providerSlug,
      name: v.provider,
      versions: [],
    };
    f.versions.push(v);
    map.set(v.providerSlug, f);
  }
  const best = (f: { versions: Version[] }) =>
    Math.max(...f.versions.map((v) => v.overall ?? -1));
  return [...map.values()]
    .map((f) => ({
      ...f,
      versions: [...f.versions].sort((a, b) => b.releasedAt - a.releasedAt),
    }))
    .sort((a, b) => best(b) - best(a));
}

/**
 * Order families so each 3-column row fills before the next starts, pulling
 * a later (smaller) family forward only to fill a gap. Doing this in the DOM
 * rather than with grid-auto-flow: dense keeps tab and reading order the
 * same as what's on screen.
 */
function packRows<T extends { versions: unknown[] }>(items: T[], cols: number) {
  const span = (f: T) => Math.min(f.versions.length, cols);
  const left = [...items];
  const out: T[] = [];
  let free = cols;
  while (left.length) {
    const i = left.findIndex((f) => span(f) <= free);
    const [f] = left.splice(i === -1 ? 0 : i, 1);
    if (i === -1) free = cols; // nothing fits: start a new row
    out.push(f);
    free -= span(f);
    if (free === 0) free = cols;
  }
  return out;
}

function Grid({ versions }: { versions: Version[] }) {
  return (
    <div
      className={s.grid}
      style={{ "--cols": Math.min(versions.length, 3) } as React.CSSProperties}
    >
      {versions.map((v) => (
        <Link key={v.versionId} to={versionPath(v.versionId)} className={s.card}>
          <div className={s.cardTop}>
            <span className={ui.monoLabel}>{v.provider}</span>
            <span className={ui.meta}>
              {v.reviewCount > 0 && (
                <>
                  {fmtCount(v.reviewCount)} {v.reviewCount === 1 ? "review" : "reviews"}
                </>
              )}
              {v.reviewCount > 0 && v.xCount > 0 && " · "}
              {v.xCount > 0 && <>{fmtCount(v.xCount)} {v.xCount === 1 ? "post" : "posts"} from X</>}
            </span>
          </div>
          <div>
            <div className={s.name}>{v.displayName}</div>
            <div className={ui.meta}>{v.versionId}</div>
          </div>
          <div className={s.overall}>
            <span className={s.overallNum}>{fmtAvg(v.overall)}</span>
            {v.overall != null ? (
              <Stars value={v.overall} size={14} />
            ) : (
              <span className={ui.meta}>No ratings yet</span>
            )}
          </div>
          <div className={s.axes}>
            {v.axes.map((a) => (
              <div key={a._id} className={s.axis} style={axisVars(a.slug)}>
                <span className={s.axisLabel}>{a.name}</span>
                <span className={s.axisValue}>{fmtAvg(a.avg)}</span>
              </div>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}
