import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Stars } from "../components/bits";
import { fmtAvg, fmtCount } from "../lib/format";
import { versionPath } from "../lib/paths";
import ui from "../components/ui.module.css";
import s from "./Models.module.css";

export function Models() {
  const models = useQuery(api.models.list);
  return (
    <div className={ui.page}>
      <header className={s.head}>
        <h1 className={ui.serifTitle}>Models</h1>
        <Link to="/request" className={ui.btnGhost}>
          Request a model
        </Link>
      </header>
      <section>
        <h2 className={ui.sectionLabel}>By overall rating</h2>
        <div className={`${ui.card} ${ui.rows}`}>
          {models?.map((m) => (
            <div key={m._id} className={s.row}>
              <div>
                <div className={ui.monoLabel}>{m.provider}</div>
                <Link to={`/m/${m.slug}`} className={s.family}>
                  {m.family}
                </Link>
              </div>
              <div className={s.versions}>
                {m.versions.map((v) => (
                  <Link key={v._id} to={versionPath(v.versionId)} className={s.version}>
                    <span>
                      <span className={s.vName}>{v.displayName}</span>
                      <span className={ui.meta}>{v.versionId}</span>
                    </span>
                    <span className={s.vStats}>
                      {v.overall != null && <Stars value={v.overall} size={12} />}
                      <span className={s.avg}>{fmtAvg(v.overall)}</span>
                      <span className={ui.meta}>
                        {fmtCount(v.reviewCount)} {v.reviewCount === 1 ? "review" : "reviews"}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
