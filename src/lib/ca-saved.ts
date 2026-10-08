// The businesses a signed-in client has saved, and the heart that saves or removes one.
// A guest who presses the heart is sent to sign in and brought back.
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Row } from "./api";
import { useSession } from "./session";

export function useSaved(here: string) {
  const s = useSession();
  const [list, setList] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const turn = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++turn.current;
    if (!s.clientToken) { setList([]); return; }
    try {
      const out = await s.capi<{ favourites: Row[] }>("/auth/favourites");
      if (mine === turn.current) setList(out.favourites ?? []);
    } catch {
      // The hearts simply start empty; pressing one still works.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.clientToken]);

  useEffect(() => { void reload(); }, [reload]);

  const has = (slug: string) => list.some((f) => f.slug === slug);

  /** Saves or removes a business. The heart changes at once and goes back if the API refuses. */
  const toggle = async (b: { slug: string; name?: string }) => {
    if (!s.clientToken) {
      router.push(`/sign-in?next=${encodeURIComponent(here)}` as never);
      return;
    }
    const was = has(b.slug), before = list;
    turn.current++; // an answer still on its way would undo this press
    setError("");
    setList(was ? list.filter((f) => f.slug !== b.slug) : [{ ...b }, ...list]);
    try {
      await s.capi(`/auth/favourites/${encodeURIComponent(b.slug)}`, { method: was ? "DELETE" : "PUT" });
    } catch (e) {
      setList(before);
      setError((e as Error).message);
    }
  };

  return { list, has, toggle, reload, error };
}
