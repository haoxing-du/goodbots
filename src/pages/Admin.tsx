import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { UserLink } from "../components/bits";
import { shortDate } from "../lib/format";
import ui from "../components/ui.module.css";
import f from "./forms.module.css";
import s from "./Admin.module.css";

function errText(e: unknown, fallback: string) {
  return e instanceof ConvexError ? String(e.data) : fallback;
}

export function Admin() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <div className={ui.page} />;
  if (!me?.isAdmin) {
    return (
      <div className={ui.page}>
        <h1 className={ui.serifTitle}>Admins only</h1>
        <p className={f.lede}>Sign in with an email listed in ADMIN_EMAILS to manage the catalog.</p>
      </div>
    );
  }
  return (
    <div className={ui.page}>
      <h1 className={ui.serifTitle}>Admin</h1>
      <Requests />
      <AddVersion />
      <Axes />
    </div>
  );
}

function Requests() {
  const requests = useQuery(api.requests.pending);
  const resolve = useMutation(api.requests.resolve);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const act = async (requestId: Id<"modelRequests">, approve: boolean) => {
    setError(null);
    try {
      await resolve({ requestId, approve, displayName: names[requestId] });
    } catch (e) {
      setError(errText(e, "Couldn't update the request."));
    }
  };

  return (
    <section>
      <h2 className={ui.sectionLabel}>Pending requests</h2>
      <div className={`${ui.card} ${ui.rows}`}>
        {requests?.length === 0 && <div className={ui.empty}>No pending requests.</div>}
        {requests?.map((r) => (
          <div key={r._id} className={s.request}>
            <div>
              <div className={s.reqTitle}>
                {r.family} <span className={ui.meta}>{r.versionId}</span>
              </div>
              <div className={ui.meta}>
                {r.provider} · {shortDate(r.createdAt)} · by <UserLink user={r.user} />
                {r.link && (
                  <>
                    {" "}
                    ·{" "}
                    <a href={r.link} target="_blank" rel="noreferrer">
                      link
                    </a>
                  </>
                )}
              </div>
            </div>
            <input
              className={ui.input}
              placeholder={`Display name (default: ${r.family})`}
              aria-label="Display name"
              value={names[r._id] ?? ""}
              onChange={(e) => setNames({ ...names, [r._id]: e.target.value })}
            />
            <div className={s.actions}>
              <button type="button" className={ui.btn} onClick={() => void act(r._id, true)}>
                Approve
              </button>
              <button type="button" className={ui.btnGhost} onClick={() => void act(r._id, false)}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && <p className={ui.error}>{error}</p>}
    </section>
  );
}

const EMPTY = { family: "", provider: "", versionId: "", displayName: "" };

function AddVersion() {
  const add = useMutation(api.admin.addVersion);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const input = (key: keyof typeof EMPTY, label: string, placeholder: string) => (
    <label className={f.field}>
      <span className={f.label}>{label}</span>
      <input
        className={ui.input}
        required
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <section>
      <h2 className={ui.sectionLabel}>Add a version</h2>
      <form
        className={`${ui.card} ${f.cardPad} ${f.form}`}
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            await add(form);
            setMsg({ ok: true, text: `Added ${form.displayName}.` });
            setForm(EMPTY);
          } catch (err) {
            setMsg({ ok: false, text: errText(err, "Couldn't add that version.") });
          }
        }}
      >
        <p className={f.hint}>An existing family adds a new version to that model; a new family creates the model.</p>
        <div className={f.row}>
          {input("family", "Model family", "Claude Opus")}
          {input("provider", "Provider", "Anthropic")}
        </div>
        <div className={f.row}>
          {input("versionId", "Version id", "claude-opus-4-1")}
          {input("displayName", "Display name", "Claude Opus 4.1")}
        </div>
        {msg && <p className={msg.ok ? f.ok : ui.error}>{msg.text}</p>}
        <div>
          <button type="submit" className={ui.btn}>
            Add version
          </button>
        </div>
      </form>
    </section>
  );
}

function Axes() {
  const axes = useQuery(api.admin.axes);
  const setStatus = useMutation(api.admin.setAxisStatus);
  const merge = useMutation(api.admin.mergeAxis);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (fn: () => Promise<string>) => {
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: errText(e, "Couldn't update that axis.") });
    }
  };

  return (
    <section>
      <h2 className={ui.sectionLabel}>Axes</h2>
      <div className={`${ui.card} ${ui.rows}`}>
        {axes?.map((a) => (
          <div key={a._id} className={s.axis}>
            <div>
              <div className={a.status === "hidden" ? s.axisHidden : s.reqTitle}>
                {a.name}{" "}
                <span className={ui.meta}>
                  {a.core ? "core" : "custom"}
                  {a.status === "hidden" && " · hidden"}
                </span>
              </div>
              <div className={ui.meta}>
                {a.ratingCount} {a.ratingCount === 1 ? "rating" : "ratings"}
                {a.createdBy && (
                  <>
                    {" "}
                    · added by <UserLink user={a.createdBy} />
                  </>
                )}
              </div>
            </div>
            {!a.core && (
              <div className={s.actions}>
                <button
                  type="button"
                  className={ui.btnGhost}
                  onClick={() =>
                    void run(async () => {
                      const status = a.status === "hidden" ? "active" : "hidden";
                      await setStatus({ axisId: a._id, status });
                      return `${a.name} is now ${status === "hidden" ? "hidden" : "visible"}.`;
                    })
                  }
                >
                  {a.status === "hidden" ? "Unhide" : "Hide"}
                </button>
                <select
                  className={ui.input}
                  aria-label={`Merge ${a.name} into`}
                  value={targets[a._id] ?? ""}
                  onChange={(e) => setTargets({ ...targets, [a._id]: e.target.value })}
                >
                  <option value="">Merge into…</option>
                  {axes
                    .filter((b) => b._id !== a._id && b.status === "active")
                    .map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className={ui.btnGhost}
                  disabled={!targets[a._id]}
                  onClick={() => {
                    const into = axes.find((b) => b._id === targets[a._id]);
                    if (!into || !window.confirm(`Merge ${a.name} into ${into.name}? This can't be undone.`)) return;
                    void run(async () => {
                      const r = await merge({ fromId: a._id, intoId: into._id });
                      return `Merged ${a.name} into ${into.name}: ${r.moved} scores moved, ${r.dropped} duplicates dropped.`;
                    });
                  }}
                >
                  Merge
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {msg && <p className={msg.ok ? f.ok : ui.error}>{msg.text}</p>}
    </section>
  );
}
