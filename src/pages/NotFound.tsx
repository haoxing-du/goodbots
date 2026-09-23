import { Link } from "react-router-dom";
import ui from "../components/ui.module.css";
import { useTitle } from "../lib/useTitle";

export function NotFound({ what = "page" }: { what?: string }) {
  useTitle("Not found");
  return (
    <div className={ui.page}>
      <h1 className={ui.serifTitle}>No such {what}</h1>
      <p>
        <Link to="/">Back to the feed</Link>
      </p>
    </div>
  );
}
