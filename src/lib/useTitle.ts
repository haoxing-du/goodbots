import { useEffect } from "react";

/** Sets the browser tab title: "<title> · GoodBots", or just "GoodBots". */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · GoodBots` : "GoodBots";
  }, [title]);
}
