import { useLayoutEffect, useRef } from "react";

/**
 * Masonry for a CSS grid whose rows are `rowUnit` px tall with no row gap:
 * each child spans as many rows as its height (plus `gap`) needs, so short
 * cards don't leave holes. Grid auto-placement keeps DOM order, so reading
 * and tab order still run left to right, top to bottom.
 */
export function useMasonry<T extends HTMLElement>(rowUnit: number, gap: number) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const fit = (el: HTMLElement) => {
      const h = el.getBoundingClientRect().height;
      el.style.gridRowEnd = `span ${Math.max(1, Math.ceil((h + gap) / rowUnit))}`;
    };
    const resize = new ResizeObserver((entries) => {
      for (const e of entries) fit(e.target as HTMLElement);
    });
    const watch = () => {
      for (const el of Array.from(grid.children) as HTMLElement[]) {
        resize.observe(el);
        fit(el);
      }
    };
    // New cards (load more, live updates) join as they're added.
    const mutations = new MutationObserver(watch);
    mutations.observe(grid, { childList: true });
    watch();
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [rowUnit, gap]);

  return ref;
}
