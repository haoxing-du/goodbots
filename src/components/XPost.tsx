import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { XPost } from "../../convex/xPosts";
import { Avatar, ConfirmDelete } from "./bits";
import { proseDate } from "../lib/format";
import { versionPath, writePath } from "../lib/paths";
import ui from "./ui.module.css";
import rc from "./ReviewCard.module.css";
import s from "./XPost.module.css";

/** Post text with its links (X's t.co short links) made clickable. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer nofollow">
            {part.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** The author's name, linking to their X profile (styled like a reviewer's name). */
export function XAuthorLink({ post, className = "" }: { post: { authorName: string; authorHandle: string }; className?: string }) {
  return (
    <a href={`https://x.com/${post.authorHandle}`} target="_blank" rel="noreferrer" className={`${s.author} ${className}`}>
      {post.authorName}
    </a>
  );
}

/** A public post from X shown on a model page, laid out like a review card. */
export function XPostCard({ post, versionId }: { post: XPost; versionId: string }) {
  const remove = useMutation(api.xPosts.remove);
  const cutOff = post.text.endsWith("…");
  return (
    <article className={`${ui.card} ${rc.review}`}>
      <div className={rc.reviewer}>
        <div className={rc.who}>
          <Avatar name={post.authorName} />
          <div>
            <XAuthorLink post={post} className={rc.whoName} />
            <div className={ui.meta}>@{post.authorHandle}</div>
          </div>
        </div>
      </div>
      <div className={rc.reviewBody}>
        <div className={rc.reviewTop}>
          <span className={s.source}>From X</span>
          <span className={rc.reviewMeta}>
            {post.canRemove && (
              <ConfirmDelete
                title="Remove this post from GoodBots?"
                body={post.mine ? "It stays on X. It just won’t show here any more." : "It stays on X."}
                confirmLabel="Remove post"
                label="Remove"
                busyLabel="Removing…"
                run={() => remove({ postId: post._id })}
              />
            )}
            <a href={post.url} target="_blank" rel="noreferrer" className={`${ui.meta} ${rc.permalink}`}>
              {proseDate(post.postedAt)}
              {new Date(post.postedAt).getFullYear() !== new Date().getFullYear() &&
                `, ${new Date(post.postedAt).getFullYear()}`}{" "}
              ↗
            </a>
          </span>
        </div>
        <p className={ui.body}>
          <Linkified text={post.text} />
        </p>
        {cutOff && (
          <a href={post.url} target="_blank" rel="noreferrer" className={s.more}>
            Read the full post on X ↗
          </a>
        )}
        {post.mine && (
          <div className={s.claim}>
            <span>This is your post. Turn it into a review so you can add ratings and update it later.</span>
            <Link to={`${writePath(versionId)}&fromX=${post._id}`} className={ui.btn}>
              Turn into a review
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

/** The "From X" section of a model page. */
export function FromX({
  posts,
  versionId,
  displayName,
}: {
  posts: XPost[] | undefined;
  versionId: string;
  displayName: string;
}) {
  if (!posts?.length) return null;
  return (
    <section id="from-x">
      <h2 className={ui.sectionLabel}>
        From X · {posts.length} {posts.length === 1 ? "post" : "posts"}
      </h2>
      <p className={s.hint}>
        Public posts about {displayName}, picked by GoodBots. Wrote one of these? Sign in with X to turn it into a
        review, or to remove it.
      </p>
      <div className={s.cards}>
        {posts.map((p) => (
          <XPostCard key={p._id} post={p} versionId={versionId} />
        ))}
      </div>
    </section>
  );
}

/** On your own profile: your posts from X that GoodBots features, to turn into reviews. */
export function YourXPosts() {
  const posts = useQuery(api.xPosts.mine);
  if (!posts?.length) return null;
  return (
    <section>
      <h2 className={ui.sectionLabel}>Your posts from X on GoodBots</h2>
      <div className={`${ui.card} ${ui.rows}`}>
        {posts.map((p) => (
          <div key={p._id} className={s.yourRow}>
            <div className={s.yourText}>
              <Link to={`${versionPath(p.versionId)}#from-x`}>{p.model}</Link>
              <span className={s.snippet}>
                {p.text.length > 120 ? `${p.text.slice(0, 120).trimEnd()}…` : p.text}
              </span>
            </div>
            <Link to={`${writePath(p.versionId)}&fromX=${p._id}`} className={`${ui.btnGhost} ${s.noUnderline}`}>
              Turn into a review
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
