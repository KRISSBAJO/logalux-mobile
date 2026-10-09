// Who is signed in. The app has two sides, a client's and a business's, and a person can be
// signed in to either or both; `mode` is the side they are looking at.
// Tokens are kept in the phone's secure storage (the keychain), never in plain storage.
import * as SecureStore from "expo-secure-store";
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { api, ApiError, type Row } from "./api";

export type Mode = "client" | "business";

type State = {
  ready: boolean;
  mode: Mode;
  clientToken: string | null;
  businessToken: string | null;
  customer: Row | null; // {id, email, first_name, last_name, phone, email_verified, phone_verified, preferred_channel}
  merchant: Row | null; // {id, name, email, role, staff_id, business_id, business, slug, currency, timezone, market, plan, status, permissions}
};

type Session = State & {
  setMode: (m: Mode) => void;
  signInClient: (email: string, password: string) => Promise<void>;
  /** Signs the client in with a token the API has just handed over, for example after a texted code was verified. */
  signInClientToken: (token: string) => Promise<void>;
  signUpClient: (fields: { first_name: string; last_name: string; email: string; phone: string; password: string; ref?: string }) => Promise<void>;
  /** Answers `{needCode: true}` when the account has two-step sign-in on and no code was given. */
  signInBusiness: (email: string, password: string, code?: string) => Promise<{ needCode: boolean }>;
  signOut: (which: Mode) => Promise<void>;
  /** Reloads the signed-in person from the API, for example after they change their details. */
  refresh: () => Promise<void>;
  /** Calls the API as the signed-in client. */
  capi: <T = Row>(path: string, opts?: { method?: string; body?: unknown; form?: FormData }) => Promise<T>;
  /** Calls the merchant API (paths start after /v1/m) as the signed-in business person. */
  mapi: <T = Row>(path: string, opts?: { method?: string; body?: unknown; form?: FormData }) => Promise<T>;
};

const KEYS = { client: "lx_client_token", business: "lx_business_token", mode: "lx_mode" } as const;

// Secure storage does not exist in a browser. There the app is only run for development, and the
// browser's own storage stands in.
const store = {
  get: async (k: string) => {
    if (Platform.OS === "web") {
      try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; }
    }
    return SecureStore.getItemAsync(k);
  },
  set: async (k: string, v: string | null) => {
    if (Platform.OS === "web") {
      try { if (v === null) globalThis.localStorage?.removeItem(k); else globalThis.localStorage?.setItem(k, v); } catch { /* storage blocked */ }
      return;
    }
    if (v === null) await SecureStore.deleteItemAsync(k);
    else await SecureStore.setItemAsync(k, v);
  },
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>({ ready: false, mode: "client", clientToken: null, businessToken: null, customer: null, merchant: null });

  const load = useCallback(async (clientToken: string | null, businessToken: string | null) => {
    // A token the API no longer accepts is dropped; any other failure (no connection) keeps it for next time.
    const who = async (path: string, token: string | null, pick: (r: Row) => Row) => {
      if (!token) return { token: null, who: null };
      try {
        return { token, who: pick(await api(path, { token })) };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          return { token: null, who: null };
        }
        return { token, who: null };
      }
    };
    const [cl, bz] = await Promise.all([
      who("/auth/me?brief=1", clientToken, (r) => r.user),
      who("/m/me", businessToken, (r) => ({ ...r.merchant, badges: r.badges, businesses: r.businesses })),
    ]);
    return { clientToken: cl.token, customer: cl.who, businessToken: bz.token, merchant: bz.who };
  }, []);

  useEffect(() => {
    (async () => {
      const [ct, bt, m] = await Promise.all([store.get(KEYS.client), store.get(KEYS.business), store.get(KEYS.mode)]);
      const got = await load(ct, bt);
      setS({ ready: true, mode: m === "business" && got.businessToken ? "business" : "client", ...got });
    })();
  }, [load]);

  const value = useMemo<Session>(() => {
    const setMode = (mode: Mode) => { void store.set(KEYS.mode, mode); setS((x) => ({ ...x, mode })); };
    return {
      ...s,
      setMode,
      signInClient: async (email, password) => {
        const out = await api<Row>("/auth/login", { body: { email, password } });
        await store.set(KEYS.client, out.token);
        const got = await load(out.token, s.businessToken);
        await store.set(KEYS.mode, "client");
        setS((x) => ({ ...x, ...got, mode: "client" }));
      },
      signInClientToken: async (token) => {
        await store.set(KEYS.client, token);
        const got = await load(token, s.businessToken);
        await store.set(KEYS.mode, "client");
        setS((x) => ({ ...x, ...got, mode: "client" }));
      },
      signUpClient: async (fields) => {
        const out = await api<Row>("/auth/signup", { body: fields });
        await store.set(KEYS.client, out.token);
        const got = await load(out.token, s.businessToken);
        await store.set(KEYS.mode, "client");
        setS((x) => ({ ...x, ...got, mode: "client" }));
      },
      signInBusiness: async (email, password, code) => {
        try {
          const out = await api<Row>("/m/login", { body: { email, password, code: code ?? "" } });
          await store.set(KEYS.business, out.token);
          const got = await load(s.clientToken, out.token);
          await store.set(KEYS.mode, "business");
          setS((x) => ({ ...x, ...got, mode: "business" }));
          return { needCode: false };
        } catch (e) {
          if (e instanceof ApiError && e.body?.need_code && !code) return { needCode: true };
          throw e;
        }
      },
      signOut: async (which) => {
        const token = which === "client" ? s.clientToken : s.businessToken;
        setS((x) => (which === "client" ? { ...x, clientToken: null, customer: null } : { ...x, businessToken: null, merchant: null, mode: "client" }));
        if (token) void api(which === "client" ? "/auth/logout" : "/m/logout", { method: "POST", token, body: {} }).catch(() => undefined);
        const key = which === "client" ? KEYS.client : KEYS.business;
        if (await store.get(key) === token) await store.set(key, null);
      },
      refresh: async () => {
        const got = await load(s.clientToken, s.businessToken);
        setS((x) => x.clientToken === s.clientToken && x.businessToken === s.businessToken ? { ...x, ...got } : x);
      },
      capi: async (path, opts = {}) => {
        try { return await api(path, { ...opts, token: s.clientToken }); }
        catch (e) {
          if (e instanceof ApiError && e.status === 401 && s.clientToken) {
            setS(x => x.clientToken === s.clientToken ? { ...x, clientToken: null, customer: null } : x);
            if (await store.get(KEYS.client) === s.clientToken) await store.set(KEYS.client, null);
          }
          throw e;
        }
      },
      mapi: (path, opts = {}) => api("/m" + path, { ...opts, token: s.businessToken }),
    };
  }, [s, load]);

  return <Ctx.Provider value={value}><Fragment key={`${s.clientToken ?? "guest"}:${s.businessToken ?? "guest"}`}>{children}</Fragment></Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
