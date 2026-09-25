import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { Avatar, ConfirmDelete, DeleteReview, Stars, PageLoading } from "../components/bits";
import { monthYear, shortDate } from "../lib/format";
import { versionPath } from "../lib/paths";
import { NotFound } from "./NotFound";
import ui from "../components/ui.module.css";
import s from "./Profile.module.css";
import { useTitle } from "../lib/useTitle";
import { useConfirm } from "../components/Confirm";
import { YourXPosts } from "../components/XPost";

type VersionRef = {
  displayName: string;
  versionId: string;
} | null;

function VersionLink({ v }: { v: VersionRef }) {
  if (!v) return <span>Removed model</span>;
  return <Link to={versionPath(v.versionId)}>{v.displayName}</Link>;
}

export function Profile() {
  const { handle = "" } = useParams();
  const data = useQuery(api.users.profile, { handle });
  useTitle(data ? `${data.user.name} (@${data.user.handle})` : undefined);
  const removeTake = useMutation(api.takes.remove);
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);

  if (data === undefined) return <PageLoading />;
  if (data === null) return <NotFound what="reviewer" />;
  const { user, latestReview } = data;

  return (
    <div className={ui.page}>
      {data.needsName && !editing && (
        <div className={s.nudge}>
          <span>Add your name so people know who wrote your reviews.</span>
          <button
            type="button"
            className={ui.btnGhost}
            onClick={() => setEditing(true)}
          >
            Add name
          </button>
        </div>
      )}
      <header className={s.header}>
        <div className={s.identity}>
          <Avatar
            name={user.name}
            image={user.image}
            size={72}
            className={s.bigAvatar}
          />
          {editing ? (
            <EditProfile
              name={data.needsName ? "" : user.name}
              handle={user.handle}
              onDone={() => {
                setEditing(false);
                requestAnimationFrame(() => editButton.current?.focus());
              }}
            />
          ) : (
            <div>
              <h1 className={ui.serifTitle}>{user.name}</h1>
              <p className={s.subline}>
                {user.xHandle ? (
                  <>
                    <a
                      href={`https://x.com/${user.xHandle}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      @{user.xHandle}
                    </a>{" "}
                    on X
                  </>
                ) : (
                  <>@{user.handle}</>
                )}{" "}
                · joined {monthYear(user.joinedAt)}
                {data.match != null && (
                  <>
                    {" "}
                    ·{" "}
                    <span className={ui.olive}>
                      {data.match}% taste match with you
                    </span>
                  </>
                )}
              </p>
              {data.isMe && (
                <button
                  ref={editButton}
                  type="button"
                  className={`${ui.linkBtn} ${s.editLink}`}
                  onClick={() => setEditing(true)}
                >
                  Edit profile
                </button>
              )}
            </div>
          )}
        </div>
        <div className={s.counts}>
          <span>
            {data.reviewCount} {data.reviewCount === 1 ? "review" : "reviews"}
          </span>
          <span className={s.countSep} aria-hidden />
          <span>
            {data.takeCount} {data.takeCount === 1 ? "take" : "takes"}
          </span>
        </div>
      </header>

      {data.isMe && <YourXPosts />}

      <section>
        <h2 className={ui.sectionLabel}>Ratings</h2>
        <div className={`${ui.card} ${s.tableWrap}`} role="region" aria-label="Ratings" tabIndex={0}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Model</th>
                <th>Overall</th>
                {data.coreAxes.map((a) => (
                  <th key={a._id}>{a.name}</th>
                ))}
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.ratings.length === 0 && (
                <tr>
                  <td colSpan={data.coreAxes.length + 3} className={ui.empty}>
                    {data.isMe ? (
                      <>
                        You haven’t reviewed a model yet. <Link to="/write">Write a review</Link>
                      </>
                    ) : (
                      `No reviews from @${user.handle} yet.`
                    )}
                  </td>
                </tr>
              )}
              {data.ratings.map((r) => (
                <tr key={r._id}>
                  <td>
                    <span className={s.modelName}>
                      <VersionLink v={r.version} />
                    </span>
                    <span className={ui.meta}>{r.version?.versionId}</span>
                    {r.scores.some((x) => !x.core) && (
                      <span className={s.customScores}>
                        {r.scores
                          .filter((x) => !x.core)
                          .map((x) => `${x.name} ${x.score}`)
                          .join(" · ")}
                      </span>
                    )}
                  </td>
                  <td data-label="Overall">{r.overall ? <Stars value={r.overall} size={13} /> : <span className={s.num}>—</span>}</td>
                  {data.coreAxes.map((a) => (
                    <td key={a._id} className={s.num} data-label={a.name}>
                      {r.scores.find((x) => x._id === a._id)?.score ?? "—"}
                    </td>
                  ))}
                  <td className={s.num} data-label="Updated">
                    {shortDate(r.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className={s.columns}>
        <section>
          <h2 className={ui.sectionLabel}>Latest review · with updates</h2>
          {latestReview ? (
            <div className={`${ui.card} ${s.latest}`}>
              <div className={s.latestHead}>
                <span className={s.latestModel}>
                  <VersionLink v={latestReview.version} />
                </span>
                {latestReview.overall && <Stars value={latestReview.overall} />}
                {data.isMe && (
                  <span className={s.headDelete}>
                    <DeleteReview reviewId={latestReview._id} authorId={user._id} />
                  </span>
                )}
              </div>
              {latestReview.entries.map((e, i) => {
                const older = latestReview.entries[i + 1];
                const isOriginal = !older;
                const stars = !e.overallAtTime
                  ? null
                  : older?.overallAtTime && older.overallAtTime !== e.overallAtTime
                    ? `${older.overallAtTime}★ → ${e.overallAtTime}★`
                    : `${e.overallAtTime}★`;
                return (
                  <div
                    key={e._id}
                    className={i === 0 ? s.entryLatest : s.entryOld}
                  >
                    <div className={s.entryHead}>
                      {isOriginal ? "Original" : "Update"} ·{" "}
                      {shortDate(e.createdAt)}
                      {stars && ` · ${stars}`}
                    </div>
                    <p className={ui.body}>{e.text}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`${ui.card} ${ui.empty}`}>
              {data.isMe ? "Your latest review will show here." : `No reviews from @${user.handle} yet.`}
            </div>
          )}
        </section>

        <section>
          <h2 className={ui.sectionLabel}>Takes</h2>
          <div className={s.takeCards}>
            {data.takes.length === 0 && (
              <div className={`${ui.card} ${ui.empty}`}>
                {data.isMe
                  ? "No takes yet. Post one from any model page’s head-to-head section."
                  : `No takes from @${user.handle} yet.`}
              </div>
            )}
            {data.takes.map((t) => (
              <div key={t._id} className={`${ui.card} ${s.take}`}>
                <div className={s.takeHead}>
                  <span className={s.takeLine}>
                    <VersionLink v={t.winner} />{" "}
                    <span className={s.gt}>&gt;</span>{" "}
                    <VersionLink v={t.loser} />
                  </span>
                  <span className={s.takeMeta}>
                    {data.isMe && (
                      <ConfirmDelete
                        title="Delete this take?"
                        body="This can’t be undone."
                        confirmLabel="Delete take"
                        run={() => removeTake({ takeId: t._id })}
                      />
                    )}
                    <span className={ui.meta}>{shortDate(t.createdAt)}</span>
                  </span>
                </div>
                {t.reason && <p className={s.reason}>{t.reason}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function EditProfile({
  name: initialName,
  handle: initialHandle,
  onDone,
}: {
  name: string;
  handle: string;
  onDone: () => void;
}) {
  const update = useMutation(api.users.updateProfile);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const [name, setName] = useState(initialName);
  const [deleting, setDeleting] = useState(false);
  const confirm = useConfirm();
  const [handle, setHandle] = useState(initialHandle);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className={s.editForm}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          const saved = await update({ name, handle });
          onDone();
          if (saved !== initialHandle)
            navigate(`/u/${saved}`, { replace: true });
        } catch (err) {
          setError(
            err instanceof ConvexError
              ? String(err.data)
              : "Couldn’t save your profile. Try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className={s.editField}>
        <span className={ui.monoLabel}>Name</span>
        <input
          className={`${ui.input} ${s.nameInput}`}
          value={name}
          maxLength={50}
          required
          autoFocus
          placeholder="Your name"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className={s.editField}>
        <span className={ui.monoLabel}>Handle</span>
        <span className={s.handleWrap}>
          <span className={s.at} aria-hidden>
            @
          </span>
          <input
            className={`${ui.input} ${s.handleInput}`}
            value={handle}
            maxLength={20}
            required
            pattern="[A-Za-z0-9_]{3,20}"
            title="3–20 letters, numbers or underscores"
            onChange={(e) => setHandle(e.target.value)}
          />
        </span>
      </label>
      {error && <p className={ui.error} role="alert">{error}</p>}
      <div className={s.editActions}>
        <button type="submit" className={ui.btn} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className={ui.btnGhost} onClick={onDone}>
          Cancel
        </button>
      </div>
      <button
        type="button"
        className={s.deleteAccount}
        disabled={deleting}
        onClick={async () => {
          const ok = await confirm({
            title: "Delete your account?",
            body: "This permanently deletes your account, reviews, takes and reactions.",
            confirm: "Delete account",
            danger: true,
            typeToConfirm: initialHandle,
          });
          if (!ok) return;
          setDeleting(true);
          try {
            await deleteAccount();
          } catch (err) {
            setDeleting(false);
            setError(
              err instanceof ConvexError
                ? String(err.data)
                : "Couldn’t delete your account. Nothing was deleted; try again.",
            );
            return;
          }
          // The account is gone either way; a failed sign-out just leaves a stale session.
          await signOut().catch(() => {});
          navigate("/", { replace: true });
        }}
      >
        {deleting ? "Deleting account…" : "Delete account…"}
      </button>
    </form>
  );
}
