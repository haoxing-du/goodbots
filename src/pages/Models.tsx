import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Pills } from "../components/Pills";
import { Stars } from "../components/bits";
import { fmtAvg, fmtCount } from "../lib/format";
import { versionPath } from "../lib/paths";
import ui from "../components/ui.module.css";
import s from "./Models.module.css";
import { useTitle } from "../lib/useTitle";

type Version = NonNullable<ReturnType<typeof useQuery<typeof api.models.list>>>[number];
type View = "family" | "all";

const VIEW_KEY = "gb.modelsView";

export function Models() {
  useTitle("Models");
  const versions = useQuery(api.models.list);
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "all" ? "all" : "family";
    } catch {
      return "family";
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
              { value: "family", label: "By family" },
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

      {versions &&
        (view === "all" ? (
          <section>
            <h2 className={ui.sectionLabel}>By overall rating</h2>
            <Grid versions={versions} />
          </section>
        ) : (
          // Family blocks share rows: each spans as many columns as it has versions.
          <div className={s.families}>
            {families(versions).map((f) => (
              <section key={f.slug} className={s[`span${Math.min(f.versions.length, 3)}`]}>
                <div className={s.familyHead}>
                  <h2 className={s.familyName}>{f.name}</h2>
                  <span className={ui.monoLabel}>{f.provider}</span>
                </div>
                <Grid versions={f.versions} />
              </section>
            ))}
          </div>
        ))}
    </div>
  );
}

/** Group by family: families ordered by their best-rated version, versions newest first. */
function families(versions: Version[]) {
  const map = new Map<string, { slug: string; name: string; provider: string; versions: Version[] }>();
  for (const v of versions) {
    const f = map.get(v.familySlug) ?? { slug: v.familySlug, name: v.family, provider: v.provider, versions: [] };
    f.versions.push(v);
    map.set(v.familySlug, f);
  }
  const best = (f: { versions: Version[] }) => Math.max(...f.versions.map((v) => v.overall ?? -1));
  return [...map.values()]
    .map((f) => ({ ...f, versions: [...f.versions].sort((a, b) => b.releasedAt - a.releasedAt) }))
    .sort((a, b) => best(b) - best(a));
}

function Grid({ versions }: { versions: Version[] }) {
  return (
    <div className={s.grid} style={{ "--cols": Math.min(versions.length, 3) } as React.CSSProperties}>
      {versions.map((v) => (
        <Link key={v._id} to={versionPath(v.versionId)} className={s.card}>
          <div className={s.cardTop}>
            <span className={ui.monoLabel}>{v.provider}</span>
            <span className={ui.meta}>
              {fmtCount(v.reviewCount)} {v.reviewCount === 1 ? "review" : "reviews"}
            </span>
          </div>
          <div>
            <div className={s.name}>{v.displayName}</div>
            <div className={ui.meta}>{v.versionId}</div>
          </div>
          <div className={s.overall}>
            <span className={s.overallNum}>{fmtAvg(v.overall)}</span>
            {v.overall != null ? <Stars value={v.overall} size={14} /> : <span className={ui.meta}>no ratings yet</span>}
          </div>
          <div className={s.axes}>
            {v.axes.map((a) => (
              <div key={a._id} className={s.axis}>
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
