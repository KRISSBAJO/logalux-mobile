// The city the client is browsing. LogaLuxe serves two: Nashville (market "US") and Lagos (market "NG").
// The choice is shared by every screen that reads it and is remembered between visits.
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

export type Market = "US" | "NG";
export type City = { market: Market; city: string; label: string };

export const CITIES: City[] = [
  { market: "US", city: "Nashville", label: "Nashville, TN" },
  { market: "NG", city: "Lagos", label: "Lagos" },
];

const KEY = "lx_ca_market";

// The same storage approach as the session: the keychain on a phone, the browser's own storage on the web.
const store = {
  get: async () => {
    if (Platform.OS === "web") {
      try { return globalThis.localStorage?.getItem(KEY) ?? null; } catch { return null; }
    }
    try { return await SecureStore.getItemAsync(KEY); } catch { return null; }
  },
  set: async (v: Market) => {
    if (Platform.OS === "web") {
      try { globalThis.localStorage?.setItem(KEY, v); } catch { /* storage blocked */ }
      return;
    }
    try { await SecureStore.setItemAsync(KEY, v); } catch { /* the choice still holds for this visit */ }
  },
};

let state: { market: Market; ready: boolean } = { market: "US", ready: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let started = false;

function start() {
  if (started) return;
  started = true;
  void store.get().then((v) => {
    // A choice made before the stored one was read wins.
    state = { market: state.ready ? state.market : v === "NG" ? "NG" : "US", ready: true };
    emit();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  start();
  return () => { listeners.delete(l); };
}

export function setMarket(market: Market) {
  state = { market, ready: true };
  emit();
  void store.set(market);
}

/**
 * The chosen city. `ready` is false for the moment it takes to read the remembered choice:
 * wait for it before loading anything that depends on the city.
 */
export function useCity() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  const at = CITIES.find((x) => x.market === s.market) ?? CITIES[0];
  return { market: at.market, city: at.city, label: at.label, ready: s.ready, setMarket };
}
