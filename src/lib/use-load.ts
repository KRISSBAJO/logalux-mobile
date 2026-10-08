// Loads something from the API for a screen: the data, whether it is loading, the error sentence
// if it failed, and a way to load it again (pull to refresh, or after a change).
import { useCallback, useEffect, useRef, useState } from "react";

export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const turn = useRef(0);

  const run = useCallback(async (pull = false) => {
    const mine = ++turn.current; // only the newest request may answer
    if (pull) setRefreshing(true);
    else setLoading(true);
    try {
      const out = await load();
      if (mine === turn.current) { setData(out); setError(""); }
    } catch (e) {
      if (mine === turn.current) setError((e as Error).message || "Something went wrong.");
    } finally {
      if (mine === turn.current) { setLoading(false); setRefreshing(false); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { void run(); }, [run]);

  return { data, error, loading, refreshing, reload: () => run(false), refresh: () => run(true), setData };
}
