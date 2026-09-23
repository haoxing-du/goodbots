import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import s from "./ModelPicker.module.css";

export type PickedModel = { versionId: string; displayName: string; provider: string };

/**
 * Search box over every model: ones with reviews first, then the whole
 * OpenRouter catalog. Empty query shows the most-reviewed models.
 */
export function ModelPicker({
  onPick,
  autoFocus,
  placeholder = "Search models: Claude, GPT, Gemini, Qwen…",
  label = "Search models",
}: {
  onPick: (m: PickedModel) => void;
  autoFocus?: boolean;
  placeholder?: string;
  label?: string;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(t);
  }, [q]);

  const searched = useQuery(api.search.models, debounced.trim() ? { q: debounced } : "skip");
  const popular = useQuery(api.models.list, debounced.trim() ? "skip" : {});
  const results =
    (debounced.trim()
      ? searched
      : popular
          ?.filter((m) => m.reviewCount > 0)
          .sort((a, b) => b.reviewCount - a.reviewCount)
          .slice(0, 8)
          .map((m) => ({ versionId: m.versionId, displayName: m.displayName, provider: m.provider, reviewCount: m.reviewCount }))) ?? [];

  useEffect(() => setActive(0), [debounced]);

  const pick = (m: PickedModel) => {
    onPick({ versionId: m.versionId, displayName: m.displayName, provider: m.provider });
    setQ("");
    setOpen(false);
  };

  return (
    <div className={s.picker}>
      <input
        ref={inputRef}
        className={s.input}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={q}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className={s.panel}>
          <ul id={listId} role="listbox" className={s.list} aria-label="Models">
            {results.map((m, i) => (
              <li
                key={m.versionId}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? s.optionActive : s.option}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus until the click lands
                  pick(m);
                }}
              >
                <span className={s.name}>{m.displayName}</span>
                <span className={s.meta}>
                  {m.provider}
                  {m.reviewCount > 0 ? ` · ${m.reviewCount} ${m.reviewCount === 1 ? "review" : "reviews"}` : " · new"}
                </span>
              </li>
            ))}
          </ul>
          {debounced.trim() && searched?.length === 0 && (
            <div className={s.empty} role="status">
              No models match. You can request it.
            </div>
          )}
          <div className={s.credit}>
            Model list from{" "}
            <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer">
              OpenRouter
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
