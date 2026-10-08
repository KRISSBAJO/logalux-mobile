// Hooks shared by the business calendar, clients and inbox screens.
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type Row } from "./api";
import { useSession } from "./session";

type Opts = { method?: string; body?: unknown; form?: FormData };

/**
 * The merchant API caller, as a function that stays the same between renders,
 * so it can sit in an effect without re-running it every time the session object is rebuilt.
 */
export function useMapi() {
  const s = useSession();
  const ref = useRef(s.mapi), token = useRef(s.businessToken);
  ref.current = s.mapi;
  token.current = s.businessToken;
  // Before the saved sign-in has been read there is no token yet: say so without a wasted call. Screens load again when it arrives.
  return useCallback(<T = Row>(path: string, opts?: Opts): Promise<T> => (token.current ? ref.current<T>(path, opts) : Promise.reject(new ApiError(401, "Sign in to your business to see this."))), []);
}

/** Reloads the signed-in person, which is what updates the unread badge on the Inbox tab. */
export function useBadgeRefresh() {
  const s = useSession();
  const ref = useRef(s.refresh);
  ref.current = s.refresh;
  return useCallback(() => { void ref.current().catch(() => undefined); }, []);
}

/** Runs when the screen comes back into view (not the first time it shows: the screen loads itself then). */
export function useRefocus(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    ref.current();
  }, []));
}

/** Runs every `ms` while the screen is in view. */
export function usePoll(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useFocusEffect(useCallback(() => {
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms]));
}

/** A value that follows what is typed, a moment later. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** A message shown for a few seconds after something was done. */
export function useFlash(ms = 6000) {
  const [flash, setFlash] = useState<{ kind: "ok" | "bad" | "gold"; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = useCallback((text: string, kind: "ok" | "bad" | "gold" = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setFlash({ kind, text });
    timer.current = setTimeout(() => setFlash(null), ms);
  }, [ms]);
  return { flash, show, clear: () => setFlash(null) };
}
