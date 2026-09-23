import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import s from "./SignIn.module.css";

type Ctx = {
  /** Opens the sign-in dialog. */
  open: (reason?: string) => void;
  /** Runs `fn` when signed in; otherwise opens the sign-in dialog. */
  requireAuth: (fn: () => void, reason?: string) => void;
};

const SignInContext = createContext<Ctx | null>(null);

export function SignInProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const [reason, setReason] = useState<string | null>(null);

  const open = useCallback((why?: string) => setReason(why ?? "Sign in to join in."), []);
  const requireAuth = useCallback(
    (fn: () => void, why?: string) => {
      if (isAuthenticated) fn();
      else open(why);
    },
    [isAuthenticated, open],
  );

  useEffect(() => {
    if (isAuthenticated) setReason(null);
  }, [isAuthenticated]);

  return (
    <SignInContext.Provider value={{ open, requireAuth }}>
      {children}
      {reason !== null && <SignInDialog reason={reason} onClose={() => setReason(null)} />}
    </SignInContext.Provider>
  );
}

export function useSignIn() {
  const ctx = useContext(SignInContext);
  if (!ctx) throw new Error("useSignIn must be used inside SignInProvider");
  return ctx;
}

function SignInDialog({ reason, onClose }: { reason: string; onClose: () => void }) {
  const { signIn } = useAuthActions();
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const redirectTo = () => window.location.pathname + window.location.search;

  const go = (provider: string) => {
    setError(null);
    void signIn(provider, { redirectTo: redirectTo() }).catch(() =>
      setError("Couldn't sign in. Check that this provider is configured."),
    );
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
