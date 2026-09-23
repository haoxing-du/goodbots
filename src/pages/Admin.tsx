import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { UserLink, PageLoading } from "../components/bits";
import { ModelPicker, PickedModel } from "../components/ModelPicker";
import { shortDate } from "../lib/format";
import ui from "../components/ui.module.css";
import f from "./forms.module.css";
import s from "./Admin.module.css";
import { useTitle } from "../lib/useTitle";
import { useConfirm } from "../components/Confirm";

function errText(e: unknown, fallback: string) {
  return e instanceof ConvexError ? String(e.data) : fallback;
}

export function Admin() {
  useTitle("Admin");
  const me = useQuery(api.users.me);
  if (me === undefined) return <PageLoading />;
  if (!me?.isAdmin) {
    return (
      <div className={ui.page}>
        <h1 className={ui.serifTitle}>Admins only</h1>
        <p className={f.lede}>
          This page is for GoodBots admins. Sign in with an admin account to manage the catalog.
        </p>
      </div>
    );
  }
  return (
    <div className={ui.page}>
      <h1 className={ui.serifTitle}>Admin</h1>
      <HomepageModels />
      <Requests />
      <AddVersion />
      <MergeModels />
      <Axes />
    </div>
  );
}

function Requests() {
  const confirm = useConfirm();
  const requests = useQuery(api.requests.pending);
  const resolve = useMutation(api.requests.resolve);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (requestId: Id<"modelRequests">, approve: boolean) => {
    setError(null);
    setBusyId(requestId);
    try {
      await resolve({ requestId, approve, displayName: names[requestId] });
    } catch (e) {
      setError(errText(e, "Couldn’t update the request. Try again."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <h2 className={ui.sectionLabel}>Pending requests</h2>
      <div className={`${ui.card} ${ui.rows}`}>
        {requests?.length === 0 && (
          <div className={ui.empty}>No pending requests.</div>
        )}
        {requests?.map((r) => (
          <div key={r._id} className={s.request}>
            <div>
              <div className={s.reqTitle}>
                {r.name} <span className={ui.meta}>{r.versionId}</span>
              </div>
              <div className={ui.meta}>
                {r.provider} · {shortDate(r.createdAt)} · by{" "}
                <UserLink user={r.user} />
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
              placeholder={`Display name (default: ${r.name})`}
              aria-label="Display name"
              value={names[r._id] ?? ""}
              onChange={(e) => setNames({ ...names, [r._id]: e.target.value })}
            />
            <div className={s.actions}>
              <button
                type="button"
                className={ui.btn}
                disabled={busyId === r._id}
                onClick={() => void act(r._id, true)}
              >
                Approve
              </button>
              <button
                type="button"
                className={`${ui.btnGhost} ${ui.btnDanger}`}
                disabled={busyId === r._id}
                onClick={async () => {
                  const ok = await confirm({
                    title: `Reject the request for ${r.name}?`,
                    body: "This can’t be undone.",
                    confirm: "Reject request",
                    danger: true,
                  });
                  if (ok) void act(r._id, false);
                }}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && <p className={ui.error} role="alert">{error}</p>}
    </section>
  );
}

const EMPTY = { provider: "", versionId: "", displayName: "" };

function AddVersion() {
  const add = useMutation(api.admin.addVersion);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const input = (
    key: keyof typeof EMPTY,
    label: string,
    placeholder: string,
  ) => (
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
      <h2 className={ui.sectionLabel}>Add a model</h2>
      <form
        className={`${ui.card} ${f.cardPad} ${f.form}`}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setMsg(null);
          setBusy(true);
          try {
            await add(form);
            setMsg({ ok: true, text: `Added ${form.displayName}.` });
            setForm(EMPTY);
          } catch (err) {
            setMsg({
              ok: false,
              text: errText(err, "Couldn’t add that model. Try again."),
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className={f.hint}>
          For models not in the OpenRouter catalog (catalog models get a page on
          their first review). Ids look like provider/model; the provider part
          is taken from the provider name if omitted.
        </p>
        <div className={f.row}>
          {input("provider", "Provider", "Anthropic")}
          {input("versionId", "Model id", "anthropic/claude-opus-5.5")}
        </div>
        <div className={f.row}>
          {input("displayName", "Display name", "Claude Opus 5.5")}
        </div>
        {msg && <p className={msg.ok ? f.ok : ui.error} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
        <div>
          <button type="submit" className={ui.btn} disabled={busy}>
            {busy ? "Adding…" : "Add model"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Axes() {
  const confirm = useConfirm();
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
      setMsg({ ok: false, text: errText(e, "Couldn’t update that axis. Try again.") });
    }
  };

  return (
    <section>
      <h2 className={ui.sectionLabel}>Axes</h2>
      <div className={`${ui.card} ${ui.rows}`}>
        {axes?.map((a) => (
          <div key={a._id} className={s.axis}>
            <div>
              <div
                className={a.status === "hidden" ? s.axisHidden : s.reqTitle}
              >
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
                      const status =
                        a.status === "hidden" ? "active" : "hidden";
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
                  onChange={(e) =>
                    setTargets({ ...targets, [a._id]: e.target.value })
                  }
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
                  onClick={async () => {
                    const into = axes.find((b) => b._id === targets[a._id]);
                    if (
                      !into ||
                      !(await confirm({
                        title: `Merge ${a.name} into ${into.name}?`,
                        body: "Scores move to the target axis. This can’t be undone.",
                        confirm: "Merge axes",
                        danger: true,
                      }))
                    )
                      return;
                    void run(async () => {
                      const r = await merge({
                        fromId: a._id,
                        intoId: into._id,
                      });
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
      {msg && <p className={msg.ok ? f.ok : ui.error} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </section>
  );
}

function MergeModels() {
  const confirm = useConfirm();
  const versions = useQuery(api.models.allVersions);
  const merge = useMutation(api.admin.mergeVersion);
  const [from, setFrom] = useState("");
  const [into, setInto] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const name = (id: string) =>
    versions?.find((v) => v.versionId === id)?.displayName ?? id;

  const select = (value: string, set: (v: string) => void, label: string) => (
    <select
      className={ui.input}
      value={value}
      aria-label={label}
      onChange={(e) => set(e.target.value)}
    >
      <option value="">{label}…</option>
      {versions?.map((v) => (
        <option key={v._id} value={v.versionId}>
          {v.displayName} · {v.versionId}
        </option>
      ))}
    </select>
  );

  return (
    <section>
      <h2 className={ui.sectionLabel}>Merge models</h2>
      <div className={`${ui.card} ${f.cardPad} ${f.form}`}>
        <p className={f.hint}>
          For duplicates (e.g. a hand-added model that later appeared in the
          catalog). Reviews, scores and takes move to the second model; if
          someone reviewed both, their newer review is kept. The first model’s
          page redirects.
        </p>
        <div className={s.mergeRow}>
          {select(from, setFrom, "Merge")}
          <span className={ui.meta}>into</span>
          {select(into, setInto, "Into")}
          <button
            type="button"
            className={ui.btn}
            disabled={!from || !into || from === into}
            onClick={async () => {
              if (
                !(await confirm({
                  title: `Merge ${name(from)} into ${name(into)}?`,
                  body: "Reviews move to the target model. This can’t be undone.",
                  confirm: "Merge models",
                  danger: true,
                }))
              )
                return;
              setMsg(null);
              try {
                const r = await merge({ from, into });
                setMsg({
                  ok: true,
                  text: `Merged ${name(from)} into ${name(into)}: ${r.moved} reviews moved, ${r.dropped} older duplicates dropped.`,
                });
                setFrom("");
                setInto("");
              } catch (e) {
                setMsg({
                  ok: false,
                  text: errText(e, "Couldn’t merge those models. Nothing was changed; try again."),
                });
              }
            }}
          >
            Merge
          </button>
        </div>
        {msg && <p className={msg.ok ? f.ok : ui.error} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      </div>
    </section>
  );
}

function HomepageModels() {
  const data = useQuery(api.featured.list);
  const save = useMutation(api.featured.set);
  const [draft, setDraft] = useState<PickedModel[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const models = draft ?? data?.models ?? [];
  const edit = (next: PickedModel[]) => {
    setDraft(next);
    setMsg(null);
  };
  const list = useRef<HTMLOListElement>(null);
  const move = (i: number, by: number) => {
    const next = [...models];
    const [m] = next.splice(i, 1);
    next.splice(i + by, 0, m);
    edit(next);
    // Follow the item; if it hit an end, that arrow is now disabled, so use the other one.
    requestAnimationFrame(() => {
      const [up, down] = list.current?.children[i + by]?.querySelectorAll("button") ?? [];
      const want = by < 0 ? up : down;
      (want && !want.disabled ? want : by < 0 ? down : up)?.focus();
    });
  };

  return (
    <section>
      <h2 className={ui.sectionLabel}>Homepage models</h2>
      <div className={`${ui.card} ${f.cardPad} ${f.form}`}>
        <p className={f.hint}>
          The models in the homepage headline (&ldquo;What did you think of
          …?&rdquo;), in order; the first is selected by default. Any catalog
          model works, reviewed or not.
          {data?.isDefault &&
            " Showing the built-in default list; saving makes it yours."}
        </p>
        <ol ref={list} className={s.featured}>
          {models.map((m, i) => (
            <li key={m.versionId} className={s.featuredRow}>
              <span>
                {m.displayName} <span className={ui.meta}>{m.versionId}</span>
              </span>
              <span className={s.actions}>
                <button
                  type="button"
                  className={ui.btnGhost}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Move ${m.displayName} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={ui.btnGhost}
                  disabled={i === models.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move ${m.displayName} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={ui.btnGhost}
                  onClick={() =>
                    edit(models.filter((x) => x.versionId !== m.versionId))
                  }
                  aria-label={`Remove ${m.displayName}`}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
        <ModelPicker
          label="Add a homepage model"
          placeholder="Add a model…"
          onPick={(m) => {
            if (!models.some((x) => x.versionId === m.versionId))
              edit([...models, m]);
          }}
        />
        <div className={s.actions}>
          <button
            type="button"
            className={ui.btn}
            disabled={!draft || models.length === 0}
            onClick={async () => {
              try {
                await save({ versionIds: models.map((m) => m.versionId) });
                setDraft(null);
                setMsg({ ok: true, text: "Saved. The homepage is updated." });
              } catch (e) {
                setMsg({
                  ok: false,
                  text: errText(e, "Couldn’t save the list. Try again."),
                });
              }
            }}
          >
            Save
          </button>
          {draft && (
            <button
              type="button"
              className={ui.btnGhost}
              onClick={() => edit(data?.models ?? [])}
            >
              Discard changes
            </button>
          )}
        </div>
        {msg && <p className={msg.ok ? f.ok : ui.error} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      </div>
    </section>
  );
}
