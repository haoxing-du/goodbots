import { useEffect } from "react";

/** Sets the browser tab title: "<title> · GoodBots", or just "GoodBots". */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · GoodBots` : "GoodBots";
  }, [title]);
}

/** While `on`, asks search engines not to list this page (a robots noindex tag). */
export function useNoIndex(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex";
    document.head.appendChild(tag);
    return () => tag.remove();
  }, [on]);
}
