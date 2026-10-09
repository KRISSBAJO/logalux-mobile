// A response belongs to one resource and account. Never show it under a different owner.
import { useSession } from "./session";
import { useCallback, useEffect, useRef, useState } from "react";

export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const session = useSession();
  const owner = `${session.clientToken ?? ""}:${session.businessToken ?? ""}`;
  const [resource, setResource] = useState(() => ({ owner, deps, load }));
  // Adjust during render so a changed route/account never gets a frame of the old data.
  // The loader is deliberately captured only when its declared dependencies change.
  if (resource.owner !== owner || resource.deps.length !== deps.length || deps.some((value, i) => !Object.is(value, resource.deps[i]))) {
    setResource({ owner, deps, load });
  }
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const turn = useRef(0);
  const [answeredBy, setAnsweredBy] = useState<typeof resource | null>(null);
  const [failedBy, setFailedBy] = useState<typeof resource | null>(null);
  const run = useCallback(async (pull = false) => {
    const mine = ++turn.current;
    if (pull) setRefreshing(true); else setLoading(true);
    try {
      const out = await resource.load();
      if (mine === turn.current) { setData(out); setAnsweredBy(resource); setError(""); }
    } catch (e) {
      if (mine === turn.current) { setFailedBy(resource); setError((e as Error).message || "Something went wrong."); }
    } finally {
      if (mine === turn.current) { setLoading(false); setRefreshing(false); }
    }
  }, [resource]);
  const cancel = useCallback(() => { turn.current++; }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void run(); });
    return () => { active = false; cancel(); };
  }, [run, cancel]);
  return { data: answeredBy === resource ? data : null, error: failedBy === resource ? error : "", loading: answeredBy !== resource && failedBy !== resource ? true : loading, refreshing, reload: () => run(false), refresh: () => run(true), setData };
}
