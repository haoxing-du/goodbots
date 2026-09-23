import { useEffect, useId, useRef, useState } from "react";
import type { PickedModel } from "./ModelPicker";
import s from "./ModelMenu.module.css";

/**
 * The homepage headline's model choice: the chosen name set in the headline
 * type, opening a styled listbox of featured models plus "Search all models…".
 * Replaces a native <select>, whose open list can't be styled.
 */
export function ModelMenu({
  models,
  value,
  onChange,
  onSearch,
  buttonRef,
}: {
  models: PickedModel[];
  value: string;
  onChange: (versionId: string) => void;
  /** Chosen from the last row; the page opens its catalog search. */
  onSearch: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const selected = models.find((m) => m.versionId === value);
  // Options are the models, then the search row.
  const count = models.length + 1;

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  const show = () => {
    setActive(Math.max(0, models.findIndex((m) => m.versionId === value)));
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const choose = (i: number) => {
    close(i < models.length);
    if (i < models.length) onChange(models[i].versionId);
    else onSearch();
  };

  return (
    <div className={s.menu} ref={root}>
      <button
        ref={(el) => {
          button.current = el;
          if (buttonRef) buttonRef.current = el;
        }}
        type="button"
        className={s.button}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`Model: ${selected?.displayName ?? "none"}`}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className={s.name}>{selected?.displayName ?? " "}</span>
        <svg className={s.chevron} viewBox="0 0 16 16" aria-hidden>
          <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label="Models"
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          className={s.list}
          onKeyDown={(e) => {
            const move = (i: number) => {
              e.preventDefault();
              setActive((i + count) % count);
            };
            if (e.key === "ArrowDown") move(active + 1);
            else if (e.key === "ArrowUp") move(active - 1);
            else if (e.key === "Home") move(0);
            else if (e.key === "End") move(count - 1);
            else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              choose(active);
            } else if (e.key === "Escape") {
              e.preventDefault();
              close(true);
            } else if (e.key === "Tab") close(false);
          }}
        >
          {models.map((m, i) => (
            <li
              key={m.versionId}
              id={`${id}-${i}`}
              role="option"
              aria-selected={m.versionId === value}
              className={i === active ? s.optionActive : s.option}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span className={s.optionText}>
                <span className={s.optionName}>{m.displayName}</span>
                <span className={s.optionMeta}>{m.provider}</span>
              </span>
              {m.versionId === value && (
                <svg className={s.check} viewBox="0 0 16 16" aria-hidden>
                  <path d="m3 8.5 3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              )}
            </li>
          ))}
          <li role="separator" className={s.separator} />
          <li
            id={`${id}-${models.length}`}
            role="option"
            aria-selected={false}
            className={`${active === models.length ? s.optionActive : s.option} ${s.search}`}
            onPointerEnter={() => setActive(models.length)}
            onClick={() => choose(models.length)}
          >
            <svg className={s.searchIcon} viewBox="0 0 16 16" aria-hidden>
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Search all models…
          </li>
        </ul>
      )}
    </div>
  );
}
