import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { ModelPicker } from "../components/ModelPicker";
import { writePath } from "../lib/paths";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { useSignIn } from "../components/SignIn";
import ui from "../components/ui.module.css";
import f from "./forms.module.css";
import { useTitle } from "../lib/useTitle";

const EMPTY = { name: "", versionId: "", provider: "", link: "" };

export function RequestModel() {
  useTitle("Request a model");
  const create = useMutation(api.requests.create);
  const { requireAuth } = useSignIn();
  const [form, setForm] = useState(EMPTY);
  const [sent, setSent] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field = (
    key: keyof typeof EMPTY,
    label: string,
    placeholder: string,
    required = true,
  ) => (
    <label className={f.field}>
      <span className={f.label}>
        {label}
        {!required && " · optional"}
      </span>
      <input
        className={ui.input}
        value={form[key]}
        required={required}
        autoFocus={key === "name"}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className={ui.page}>
      <div>
        <h1 className={ui.serifTitle}>Request a model</h1>
        <p className={f.lede}>
          Most models are already here: we list everything on OpenRouter,
          updated every few hours. Search first, and if it's there you can
          review it right away.
        </p>
      </div>
      <div className={f.form}>
        <ModelPicker
          label="Search for the model"
          placeholder="Search models…"
          onPick={(m) => navigate(writePath(m.versionId))}
        />
        {!showForm && (
          <div>
            <button
              type="button"
              className={ui.linkBtn}
              onClick={() => setShowForm(true)}
            >
              It's not listed. Request it.
            </button>
          </div>
        )}
      </div>
      {showForm && (
        <form
          className={f.form}
          onSubmit={(e) => {
            e.preventDefault();
            requireAuth(async () => {
              if (busy) return;
              setError(null);
              setBusy(true);
              try {
                await create(form);
                setForm(EMPTY);
                setSent(true);
              } catch (err) {
                setError(
                  err instanceof ConvexError
                    ? String(err.data)
                    : "Couldn't send the request. Check your connection and try again.",
                );
              } finally {
                setBusy(false);
              }
            }, "Sign in to request a model.");
          }}
        >
          {sent && (
            <div className={f.ok} role="status">
              Request sent. An admin will review it.
            </div>
          )}
          <div className={f.row}>
            {field("name", "Model name", "Claude Sonnet 5")}
            {field("provider", "Provider", "Anthropic")}
          </div>
          {field("versionId", "Version id", "claude-sonnet-4-5")}
          {field("link", "Link", "Announcement or docs URL", false)}
          {error && <p className={ui.error} role="alert">{error}</p>}
          <div>
            <button type="submit" className={ui.btn} disabled={busy}>
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
