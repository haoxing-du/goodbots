import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useNavigate } from "react-router-dom";
import s from "./SignIn.module.css";

type Ctx = {
  /** Opens the sign-in dialog. `redirectTo` is where to land after sign-in (default: here). */
  open: (reason?: string, redirectTo?: string) => void;
  /** Runs `fn` when signed in; otherwise opens the sign-in dialog. */
  requireAuth: (fn: () => void, reason?: string, redirectTo?: string) => void;
};

const SignInContext = createContext<Ctx | null>(null);

export function SignInProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const [reason, setReason] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string | undefined>();

  const open = useCallback((why?: string, to?: string) => {
    setReason(why ?? "Sign in to join in.");
    setRedirectTo(to);
  }, []);
  const requireAuth = useCallback(
    (fn: () => void, why?: string, to?: string) => {
      if (isAuthenticated) fn();
      else open(why, to);
    },
    [isAuthenticated, open],
  );

  useEffect(() => {
    if (isAuthenticated) setReason(null);
  }, [isAuthenticated]);

  return (
    <SignInContext.Provider value={{ open, requireAuth }}>
      {children}
      {reason !== null && (
        <SignInDialog reason={reason} redirectTo={redirectTo} onClose={() => setReason(null)} />
      )}
      <HandleGate />
    </SignInContext.Provider>
  );
}

export function useSignIn() {
  const ctx = useContext(SignInContext);
  if (!ctx) throw new Error("useSignIn must be used inside SignInProvider");
  return ctx;
}

function SignInDialog({
  reason,
  redirectTo: target,
  onClose,
}: {
  reason: string;
  redirectTo?: string;
  onClose: () => void;
}) {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const redirectTo = () => target ?? window.location.pathname + window.location.search;

  const go = (provider: string) => {
    setError(null);
    signIn(provider, { redirectTo: redirectTo() })
      .then(({ signingIn }) => {
        // OAuth leaves the page; credential sign-in (demo) completes here, so navigate ourselves.
        if (signingIn && target) navigate(target);
      })
      .catch(() => setError("Couldn't sign in that way. Try again, or use an email link instead."));
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    if (!to) return;
    setError(null);
    setSending(true);
    try {
      await signIn("email", { email: to, redirectTo: redirectTo() });
      setSentTo(to);
    } catch {
      setError("Couldn't send the link. Check the address and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="signin-title"
    >
      <div className={s.inner}>
        <h2 id="signin-title" className={s.title}>
          Sign in to GoodBots
        </h2>
        {sentTo ? (
          <div className={s.sent} role="status">
            <p>
              Check your inbox. We sent a sign-in link to <b>{sentTo}</b>. It expires in 1 hour.
            </p>
            {import.meta.env.DEV && (
              <p className={s.devNote}>
                Local dev without AUTH_RESEND_KEY: the link is printed in the <code>npx convex dev</code>{" "}
                terminal.
              </p>
            )}
            <button type="button" className={s.back} onClick={() => setSentTo(null)}>
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <p className={s.reason}>{reason}</p>
            <form className={s.emailForm} onSubmit={sendLink}>
              <input
                className={s.email}
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                aria-label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" className={s.provider} disabled={sending}>
                {sending ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
            <div className={s.or} aria-hidden>
              or
            </div>
            <div className={s.buttons}>
              <button type="button" className={s.secondary} onClick={() => go("twitter")}>
                Continue with X
              </button>
              {import.meta.env.DEV && (
                <button type="button" className={s.demo} onClick={() => go("demo")}>
                  Local dev: sign in as the demo reviewer
                </button>
              )}
            </div>
          </>
        )}
        {error && <p className={s.error}>{error}</p>}
        <button type="button" className={s.close} onClick={() => ref.current?.close()}>
          Not now
        </button>
      </div>
    </dialog>
  );
}

/**
 * Email sign-ups have no handle until they pick one. Until then this dialog
 * stays open (the server also refuses reviews, reactions and takes).
 */
function HandleGate() {
  const me = useQuery(api.users.me);
  if (!me?.needsHandle) return null;
  return <HandleDialog />;
}

function HandleDialog() {
  const update = useMutation(api.users.updateProfile);
  const { signOut } = useAuthActions();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="handle-title"
      onCancel={(e) => e.preventDefault() /* not dismissable */}
    >
      <form
        className={s.inner}
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          try {
            await update({ name, handle });
          } catch (err) {
            setError(err instanceof ConvexError ? String(err.data) : "Couldn't save. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 id="handle-title" className={s.title}>
          Pick a handle
        </h2>
        <p className={s.reason}>
          This is how you'll show up next to your reviews. Your email stays private.
        </p>
        <label className={s.field}>
          <span className={s.label}>Name</span>
          <input
            className={s.email}
            value={name}
            maxLength={50}
            required
            autoFocus
            placeholder="Your name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className={s.field}>
          <span className={s.label}>Handle</span>
          <span className={s.handleWrap}>
            <span className={s.at} aria-hidden>
              @
            </span>
            <input
              className={s.email}
              value={handle}
              maxLength={20}
              required
              pattern="[A-Za-z0-9_]{3,20}"
              title="3–20 letters, numbers or underscores"
              placeholder="your_handle"
              onChange={(e) => setHandle(e.target.value)}
            />
          </span>
        </label>
        {error && <p className={s.error}>{error}</p>}
        <button type="submit" className={s.provider} disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </button>
        <button type="button" className={s.close} onClick={() => void signOut()}>
          Sign out
        </button>
      </form>
    </dialog>
  );
}
