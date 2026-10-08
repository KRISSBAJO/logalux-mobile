// Loads a "Grow" screen's data: waits for the sign-in, turns a refusal (403) into the "ask a manager" state,
// and reads again quietly when the screen comes back into view.
import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { DENIED, orDenied, signedIn } from "./mc-util";
import { useLoad } from "./use-load";

export function useGrow<T>(s: { businessToken: string | null }, load: () => Promise<T>, deps: unknown[] = []) {
  const q = useLoad<T | typeof DENIED>(signedIn(s, () => orDenied(load)), [s.businessToken, ...deps]);
  const fresh = useRef(q.refresh);
  fresh.current = q.refresh;
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!s.businessToken) return;
    if (seen.current) void fresh.current();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));
  const d = q.data && q.data !== DENIED ? (q.data as T) : null;
  return { ...q, d, denied: q.data === DENIED };
}
