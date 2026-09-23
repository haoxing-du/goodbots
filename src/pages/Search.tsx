import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Avatar } from "../components/bits";
import ui from "../components/ui.module.css";
import s from "./Search.module.css";
import { versionPath } from "../lib/paths";

export function Search() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const results = useQuery(api.search.all, { q });

  return (
    <div className={ui.page}>
      <h1 className={ui.serifTitle}>
        Results for <span className={s.q}>“{q}”</span>
      </h1>
      <div className={s.columns}>
        <section>
          <h2 className={ui.sectionLabel}>Models</h2>
          <div className={`${ui.card} ${ui.rows}`}>
            {results?.models.length === 0 && <div className={ui.empty}>No models match.</div>}
            {results?.models.map((m) => (
              <Link key={m._id} to={versionPath(m.versionId)} className={s.row}>
                <span className={s.name}>{m.displayName}</span>
                <span className={ui.meta}>
                  {m.provider} · {m.versionId}
                </span>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <h2 className={ui.sectionLabel}>Reviewers</h2>
          <div className={`${ui.card} ${ui.rows}`}>
            {results?.reviewers.length === 0 && <div className={ui.empty}>No reviewers match.</div>}
            {results?.reviewers.map((u) => (
              <Link key={u._id} to={`/u/${u.handle}`} className={s.row}>
                <Avatar name={u.name} image={u.image} />
                <span className={s.name}>{u.name}</span>
                <span className={ui.meta}>@{u.handle}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
