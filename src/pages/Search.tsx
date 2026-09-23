import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Avatar } from "../components/bits";
import ui from "../components/ui.module.css";
import s from "./Search.module.css";
import { versionPath } from "../lib/paths";
import { useTitle } from "../lib/useTitle";

export function Search() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const results = useQuery(api.search.all, q.trim() ? { q } : "skip");
  useTitle(q.trim() ? `Search: ${q}` : "Search");

  if (!q.trim()) {
    return (
      <div className={ui.page}>
        <h1 className={ui.serifTitle}>Search</h1>
        <p className={ui.empty}>Search models or reviewers from the bar above.</p>
      </div>
    );
  }

  return (
    <div className={ui.page}>
      <h1 className={ui.serifTitle}>
        Results for <span className={s.q}>“{q}”</span>
      </h1>
      <section>
        <h2 className={ui.sectionLabel}>Models</h2>
        {!results && <div className={`${ui.card} ${ui.skelRow}`} aria-busy="true" />}
        {results?.models.length === 0 && <div className={`${ui.card} ${ui.empty}`}>
            No models match &ldquo;{q}&rdquo;. <Link to="/request">Request a model</Link>
          </div>}
        <div className={s.grid}>
          {results?.models.map((m) => (
            <Link key={m.versionId} to={versionPath(m.versionId)} className={s.card}>
              <span className={ui.monoLabel}>{m.provider}</span>
              <span className={s.modelName}>{m.displayName}</span>
              <span className={ui.meta}>
                {m.reviewCount > 0
                  ? `${m.reviewCount} ${m.reviewCount === 1 ? "review" : "reviews"}`
                  : "No reviews yet"}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section>
        <h2 className={ui.sectionLabel}>Reviewers</h2>
        {!results && <div className={`${ui.card} ${ui.skelRow}`} aria-busy="true" />}
        {results?.reviewers.length === 0 && <div className={`${ui.card} ${ui.empty}`}>No reviewers match.</div>}
        <div className={s.grid}>
          {results?.reviewers.map((u) => (
            <Link key={u._id} to={`/u/${u.handle}`} className={`${s.card} ${s.person}`}>
              <Avatar name={u.name} image={u.image} size={40} />
              <span>
                <span className={s.personName}>{u.name}</span>
                <span className={ui.meta}>@{u.handle}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
