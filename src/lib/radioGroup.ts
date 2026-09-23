import type { KeyboardEvent } from "react";

/**
 * Keyboard behavior for a button-based role="radiogroup": arrow keys and
 * Home/End move focus and select, like native radios. Pass `onClear` for
 * optional ratings so Delete/Backspace can unset the value.
 */
export function radioGroupKeys<T>(
  values: readonly T[],
  onChange: (v: T) => void,
  onClear?: () => void,
) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const radios = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'),
    );
    if (!radios.length) return;
    const at = radios.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (at + 1) % radios.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (at - 1 + radios.length) % radios.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = radios.length - 1;
        break;
      case "Delete":
      case "Backspace":
        if (!onClear) return;
        e.preventDefault();
        onClear();
        return;
      default:
        return;
    }
    e.preventDefault();
    radios[next].focus();
    onChange(values[next]);
  };
}

/** Roving tabindex: only the checked radio (or the first, if none) is a Tab stop. */
export function radioTabIndex<T>(values: readonly T[], value: T, i: number) {
  const checked = values.indexOf(value);
  return i === (checked === -1 ? 0 : checked) ? 0 : -1;
}
