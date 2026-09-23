import { Link } from "react-router-dom";
import ui from "../components/ui.module.css";
import { useTitle } from "../lib/useTitle";
import s from "./Legal.module.css";

const CONTACT = "hello@goodbots.review";
export const SOURCE = "https://github.com/haoxing-du/goodbots";
const UPDATED = "September 23, 2026";

function Mail({ children }: { children: React.ReactNode }) {
  return <a href={`mailto:${CONTACT}`}>{children}</a>;
}

export function About() {
  useTitle("About");
  return (
    <div className={ui.page}>
      <article className={s.prose}>
        <h1 className={ui.serifTitle}>About</h1>
        <p>GoodBots is made by <a href="https://x.com/haoxingdu">Haoxing Du</a>.</p>
        <p>
          Questions or feedback? <Mail>Email me</Mail> or <a href="https://x.com/haoxingdu">get in touch on X</a>.
        </p>
        <p>
          GoodBots is open source. The code is <a href={SOURCE}>on GitHub</a>.
        </p>
      </article>
    </div>
  );
}

export function Privacy() {
  useTitle("Privacy");
  return (
    <div className={ui.page}>
      <article className={s.prose}>
        <h1 className={ui.serifTitle}>Privacy</h1>
        <p className={s.updated}>Last updated {UPDATED}</p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <b>Email sign-in:</b> your email address. It is never shown publicly.
          </li>
          <li>
            <b>X sign-in:</b> your X name, username and profile picture. We get no email address, and we
            can’t post to your X account. X’s sign-in permission technically also covers reading your
            posts, but we never read or store them.
          </li>
          <li>
            <b>What you post:</b> your name, handle, reviews, scores, takes, reactions, screenshots and model
            requests. All of these are public, except model requests.
          </li>
        </ul>

        <h2>How we use it</h2>
        <p>
          To run and improve the site. Your browser stores a sign-in token to keep you signed in.
        </p>
        <p>
          We may also analyze site data, for example for research about AI models, and share, license or
          sell it, for example as a dataset. This covers what you post, which is already public, and
          aggregate statistics. We may add analytics tools to see how the site is used.
        </p>
        <p>
          Your email address stays private. We don’t sell it or share it, except with the services below
          to run the site, or if the law requires it.
        </p>

        <h2>Who else handles it</h2>
        <p>
          Convex (database), Vercel (hosting), Resend (sign-in emails) and X (if you sign in with X). Anyone
          we share or license data to, as described above.
        </p>

        <h2>Deleting your data</h2>
        <p>
          On your profile, choose “Edit profile”, then “Delete account” to permanently remove your
          account and everything you posted. You can also <Mail>email us</Mail>. Deleting removes your
          data from GoodBots, but not from copies already shared or published before you deleted it.
        </p>

        <h2>Changes</h2>
        <p>
          We may update this policy. We’ll change the date above when we do.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about your data? <Mail>Email us</Mail>.
        </p>
      </article>
    </div>
  );
}

export function Terms() {
  useTitle("Terms");
  return (
    <div className={ui.page}>
      <article className={s.prose}>
        <h1 className={ui.serifTitle}>Terms of use</h1>
        <p className={s.updated}>Last updated {UPDATED}</p>
        <ul>
          <li>You must be at least 13 to create an account.</li>
          <li>
            You own what you post. You give GoodBots a free, worldwide, permanent license to use, copy,
            display, modify and distribute it, and to let others do the same, including in datasets we
            share, license or sell. Deleting your content removes it from the site, but not from copies
            already shared.
          </li>
          <li>
            Don’t post anything illegal, harassing or spammy, or anyone else’s private information. Check
            screenshots before you upload them.
          </li>
          <li>We may remove content or accounts that break these rules.</li>
          <li>
            GoodBots is provided as is, with no warranty. Reviews are users’ opinions, not ours. To the extent
            the law allows, we aren’t liable for damages from using the site.
          </li>
          <li>
            We may update these terms. If you keep using the site, you accept the updated terms. These terms
            are governed by US law.
          </li>
        </ul>
        <p>
          Also see the <Link to="/privacy">privacy policy</Link>. Questions? <Mail>Email us</Mail>.
        </p>
      </article>
    </div>
  );
}
