import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useSignIn } from "./SignIn";
import { Avatar } from "./bits";
import s from "./TopBar.module.css";

export function TopBar() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const me = useQuery(api.users.me);
  const { open } = useSignIn();
  const { signOut } = useAuthActions();
  // The homepage has its own call to action, so it drops search and "Write a review".
  const location = useLocation();
  const isHome = location.pathname === "/";
  const menu = useRef<HTMLDetailsElement>(null);

  // <details> stays open across navigation and outside clicks; close it on both.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [location.key]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  return (
    <header className={isHome ? s.barPlain : s.bar}>
      <Link to="/" className={s.wordmark}>
        GoodBots
      </Link>
      <div className={s.spacer} />
      <nav className={s.nav} aria-label="Main">
        <NavLink to="/models" className={({ isActive }) => (isActive ? s.active : s.link)}>
          Models
        </NavLink>
        <NavLink to="/reviews" className={({ isActive }) => (isActive ? s.active : s.link)}>
          Reviews
        </NavLink>
      </nav>
      {!isHome && (
        <>
          <form
            role="search"
            className={s.searchForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <input
              className={s.search}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search models or reviewers"
              aria-label="Search models or reviewers"
            />
          </form>
          <Link to="/write" className={s.write}>
            Write a review
          </Link>
        </>
      )}
      {me === undefined ? (
        <span className={s.userSlot} />
      ) : me ? (
        <details
          ref={menu}
          className={s.menu}
          onKeyDown={(e) => {
            if (e.key === "Escape" && menu.current?.open) {
              menu.current.open = false;
              menu.current.querySelector("summary")?.focus();
            }
          }}
        >
          <summary className={s.menuButton} aria-label="Account">
            <Avatar name={me.name} image={me.image} size={32} />
          </summary>
          <div className={s.menuList}>
            <Link to={`/u/${me.handle}`}>Your profile</Link>
            <Link to="/request">Request a model</Link>
            {me.isAdmin && <Link to="/admin">Admin</Link>}
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </details>
      ) : (
        <button type="button" className={s.signIn} onClick={() => open()}>
          Sign in
        </button>
      )}
    </header>
  );
}

/** Minimal bar for the write screen: wordmark + Cancel. */
export function MinimalBar() {
  const navigate = useNavigate();
  return (
    <header className={s.bar}>
      <Link to="/" className={s.wordmark}>
        GoodBots
      </Link>
      <div className={s.spacer} />
      <button
        type="button"
        className={s.cancel}
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
      >
        Cancel
      </button>
    </header>
  );
}
