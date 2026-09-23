import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import ui from "./ui.module.css";
import s from "./Confirm.module.css";

type ConfirmOptions = {
  title: string;
  body?: string;
  /** Label for the confirming button; names the action, e.g. "Delete take". */
  confirm: string;
  /** Destructive actions get the danger treatment. */
  danger?: boolean;
  /** If set, the confirm button stays disabled until this exact text is typed. */
  typeToConfirm?: string;
};

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** `const confirm = useConfirm(); if (await confirm({...})) …` in place of window.confirm. */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setOpen({ ...o, resolve })),
    [],
  );
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {open && (
        <ConfirmDialog
          {...open}
          onDone={(ok) => {
            open.resolve(ok);
            setOpen(null);
          }}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  title,
  body,
  confirm,
  danger,
  typeToConfirm,
  onDone,
}: ConfirmOptions & { onDone: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const result = useRef(false);
  // The element that opened the dialog gets focus back when it closes.
  const opener = useRef(document.activeElement as HTMLElement | null);

  useEffect(() => {
    ref.current?.showModal();
    const back = opener.current;
    return () => back?.focus();
  }, []);

  const ready = !typeToConfirm || typed.trim().replace(/^@/, "") === typeToConfirm;
  const close = (ok: boolean) => {
    result.current = ok;
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="confirm-title"
      onClose={() => onDone(result.current)}
    >
      <form
        className={s.inner}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) close(true);
        }}
      >
        <h2 id="confirm-title" className={s.title}>
          {title}
        </h2>
        {body && <p className={s.body}>{body}</p>}
        {typeToConfirm && (
          <label className={s.field}>
            <span>
              Type <b>{typeToConfirm}</b> to confirm
            </span>
            <input
              className={ui.input}
              value={typed}
              autoFocus
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
        )}
        <div className={s.buttons}>
          <button type="button" className={ui.btnGhost} autoFocus={!typeToConfirm} onClick={() => close(false)}>
            Cancel
          </button>
          <button type="submit" className={danger ? s.danger : ui.btn} disabled={!ready}>
            {confirm}
          </button>
        </div>
      </form>
    </dialog>
  );
}
