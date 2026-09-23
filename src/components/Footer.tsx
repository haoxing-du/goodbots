import { Link } from "react-router-dom";
import { SOURCE } from "../pages/Legal";
import s from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={s.footer}>
      <Link to="/about">About</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/terms">Terms</Link>
      <a href={SOURCE}>GitHub</a>
    </footer>
  );
}
