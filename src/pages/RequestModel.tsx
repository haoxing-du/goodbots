import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { useSignIn } from "../components/SignIn";
import ui from "../components/ui.module.css";
import f from "./forms.module.css";
import { useTitle } from "../lib/useTitle";

const EMPTY = { family: "", versionId: "", provider: "", link: "" };

export function RequestModel() {
  useTitle("Request a model");
  const create = useMutation(api.requests.create);
  const { requireAuth } = useSignIn();
  const [form, setForm] = useState(EMPTY);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (key: keyof typeof EMPTY, label: string, placeholder: string, required = true) => (
    <label className={f.field}>
      <span className={f.label}>
        {label}
        {!required && " · optional"}
      </span>
      <input
        className={ui.input}
        value={form[key]}
        required={required}
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
          The catalog is curated. Tell us which model version is missing and an admin will add it.
        </p>
      </div>
      <form
        className={f.form}
        onSubmit={(e) => {
          e.preventDefault();
          requireAuth(async () => {
            setError(null);
            try {
              await create(form);
              setForm(EMPTY);
              setSent(true);
            } catch (err) {
              setError(err instanceof ConvexError ? String(err.data) : "Couldn't send the request.");
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
          {field("family", "Model family", "Claude Sonnet")}
          {field("provider", "Provider", "Anthropic")}
        </div>
        {field("versionId", "Version id", "claude-sonnet-4-5")}
        {field("link", "Link", "Announcement or docs URL", false)}
        {error && <p className={ui.error}>{error}</p>}
        <div>
          <button type="submit" className={ui.btn}>
            Send request
          </button>
        </div>
      </form>
    </div>
  );
}
