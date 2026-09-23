import { Link } from "react-router-dom";
import s from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={s.footer}>
      <Link to="/about">About</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/terms">Terms</Link>
    </footer>
  );
}
