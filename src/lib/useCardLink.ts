import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

// Clicks on these keep doing their own thing instead of opening the card's page.
const INTERACTIVE = "a, button, input, textarea, select, label, summary, [role='button'], [role='radio']";

/**
 * Makes a whole card open `to` when clicked anywhere that isn't already a link or
 * a control. Cmd/Ctrl/Shift-click and middle-click open a new tab; selecting text
 * doesn't navigate. The card should still contain a real link to `to` (for
 * keyboard and screen-reader users): this only widens the mouse target.
 */
export function useCardLink(to: string) {
  const navigate = useNavigate();
  const shouldIgnore = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    // Portaled UI (dialogs) bubbles through React but isn't inside the card.
    if (!e.currentTarget.contains(target)) return true;
    if (target.closest(INTERACTIVE)) return true;
    return !!window.getSelection()?.toString();
  };
  return {
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (e.defaultPrevented || shouldIgnore(e)) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey) window.open(to, "_blank", "noopener");
      else navigate(to);
    },
    onAuxClick: (e: MouseEvent<HTMLElement>) => {
      if (e.button !== 1 || shouldIgnore(e)) return;
      window.open(to, "_blank", "noopener");
    },
  };
}
