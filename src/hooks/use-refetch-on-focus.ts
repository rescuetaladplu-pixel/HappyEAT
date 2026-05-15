import { useEffect, useRef } from "react";

/**
 * Calls `callback` whenever the browser tab regains focus or becomes visible.
 * Use this on customer-facing pages so SPA navigation back to a page (or
 * returning to the tab) refetches latest data without a hard refresh.
 *
 * The callback is debounced to avoid double-firing when both events fire at once.
 */
export function useRefetchOnFocus(callback: () => void, enabled = true) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const trigger = () => {
      const now = Date.now();
      if (now - last < 500) return;
      last = now;
      cbRef.current();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") trigger();
    };
    window.addEventListener("focus", trigger);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", trigger);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
