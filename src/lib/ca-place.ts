// Where the client is looking. LogaLuxe works anywhere in the United States and Nigeria: the
// place is whatever the person chose, else where their device is (only when they ask), else the
// API's guess from their internet address, else the busiest place. The choice is shared by every
// screen that reads it and a choice made by hand is remembered between visits. Nothing here lists
// a city: the places LogaLuxe serves are wherever live businesses are, read from the API.
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { api, qs } from "./api";

/** A city, a state or a whole country. `point` is a spot with no page of its own: open country, or somewhere we do not serve. */
export type Place = {
  slug: string; kind: "city" | "state" | "country" | "point";
  city: string; region: string; region_name: string; country: string; country_name: string; label: string;
  lat: number; lng: number; businesses: number; categories?: Record<string, number>;
  currency: string; unit: "mi" | "km"; timezone: string;
  /** Set when the place is listed in relation to a point. */
  distance_km?: number; distance?: number; distance_text?: string;
};
export type Country = { code: string; name: string; currency: string; unit: "mi" | "km"; places: number; businesses: number };
export type Point = { lat: number; lng: number };

/** How the place came to be: `picked` by hand, `device` from "Use my exact location", `ip` a guess from the internet address, `default` we could not tell. */
export type Source = "picked" | "device" | "ip" | "default";

/**
 * What is kept: the place, how it was reached, and `home`, the country we think the person is really in.
 * When the place's country differs from `home` they are browsing another country on purpose.
 */
export type Chosen = { slug: string; kind: Place["kind"]; label: string; city: string; region: string; country: string; lat: number; lng: number; src: Source; home: string };

/** What GET /v1/businesses says about where it looked. */
export type Geo = {
  mode: string; scope: string; unit: "mi" | "km"; origin: Point | null; place: Place | null;
  radius_asked: number | null; radius_used: number | null; widened: boolean; within_asked: number | null;
  nearest: { label: string; slug: string; distance_text: string } | null; notice: string; nearest_places: Place[];
};

type Located = { source: "edge" | "ip" | "default"; approximate: boolean; country: string; country_name: string; served: boolean; place: Place | null; default: Place | null; nearest: Place[] };

const KEYS = { place: "lx_ca_place", denied: "lx_ca_geo_no", recent: "lx_ca_recent" } as const;
const served = (c: string | undefined) => c === "US" || c === "NG";
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const round = (n: number) => Math.round(n * 1000) / 1000; // about a hundred metres: enough for a distance, no more exact than it needs to be

// The same storage approach as the session: the keychain on a phone, the browser's own storage on the web.
const store = {
  get: async (k: string) => {
    if (Platform.OS === "web") {
      try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; }
    }
    try { return await SecureStore.getItemAsync(k); } catch { return null; }
  },
  set: async (k: string, v: string | null) => {
    if (Platform.OS === "web") {
      try { if (v === null) globalThis.localStorage?.removeItem(k); else globalThis.localStorage?.setItem(k, v); } catch { /* storage blocked */ }
      return;
    }
    try { if (v === null) await SecureStore.deleteItemAsync(k); else await SecureStore.setItemAsync(k, v); } catch { /* the choice still holds for this visit */ }
  },
};

// ---------- words ----------

/** "the United States", "Nigeria", inside a sentence. */
export const inCountry = (country: string) => (country === "US" ? "the United States" : country === "NG" ? "Nigeria" : country || "your country");
/** The money of a country, in a sentence: "naira", "US dollars". */
export const moneyName = (country: string) => (country === "NG" ? "naira" : "US dollars");
/** Who takes the payment in a country. */
export const providerName = (country: string) => (country === "NG" ? "Paystack" : "Stripe");
/** "4 professionals", "1 professional". */
export const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "professional" : "professionals"}`;
/** "Nashville" from "Nashville, TN": the short name for a heading. */
export const shortName = (p: { city?: string; label: string }) => p.city || p.label;
/** The name of a place as a button reads it: a country is "All of Nigeria". */
export const placeName = (p: { kind: string; country: string; label: string }) => (p.kind === "country" ? `All of ${inCountry(p.country)}` : p.label);

/** The shop on the website for a country: the country is named outright, so the link opens that shop wherever the visitor is looking. */
export const shopHref = (country: string) => `/shop?country=${country === "NG" ? "ng" : "us"}`;

/** Kilometres between two points on the globe. */
export function kmBetween(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "2.3 mi" or "14 km", the way the API writes a distance: one decimal under ten, whole numbers above. */
export function distanceLabel(km: number, unit: "mi" | "km"): string {
  const n = unit === "mi" ? km / 1.609344 : km;
  if (!Number.isFinite(n)) return "";
  return `${n < 9.95 ? (Math.round(n * 10) / 10).toFixed(1) : Math.round(n).toLocaleString("en-US")} ${unit}`;
}

// ---------- the store ----------

type State = {
  ready: boolean;
  chosen: Chosen | null;
  /** The API's own description of the place, when it gave one (business counts, time zone). */
  known: Place | null;
  /** The country the person seems to be in when it is not one we serve: "We do not serve Ghana yet". */
  elsewhere: string;
  /** They said no to sharing the device's position: the panel says so instead of asking again by itself. */
  denied: boolean;
  recent: Place[];
  /** Every place with live businesses, and the countries, from GET /v1/places. */
  places: Place[]; countries: Country[]; busiest: Place | null;
  error: string;
};

let state: State = { ready: false, chosen: null, known: null, elsewhere: "", denied: false, recent: [], places: [], countries: [], busiest: null, error: "" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const patch = (change: Partial<State>) => { state = { ...state, ...change }; emit(); };
let started = false;

export function toChosen(p: Pick<Place, "slug" | "kind" | "label" | "city" | "region" | "country" | "lat" | "lng">, src: Source, home = ""): Chosen {
  return { slug: p.slug, kind: p.kind, label: p.label, city: p.city, region: p.region, country: p.country, lat: round(p.lat), lng: round(p.lng), src, home: /^[A-Z]{2}$/.test(home) ? home : "" };
}

function readChosen(raw: string | null): Chosen | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<Chosen>;
    if (typeof c.label !== "string" || !c.label || !finite(c.lat) || !finite(c.lng) || Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180) return null;
    return {
      slug: typeof c.slug === "string" ? c.slug : "", kind: c.kind === "state" || c.kind === "point" || c.kind === "country" ? c.kind : "city",
      label: c.label, city: String(c.city ?? ""), region: String(c.region ?? ""), country: String(c.country ?? "").slice(0, 2).toUpperCase(),
      lat: c.lat, lng: c.lng, src: c.src === "device" ? "device" : "picked", home: typeof c.home === "string" && /^[A-Z]{2}$/.test(c.home) ? c.home : "",
    };
  } catch {
    return null;
  }
}

function readRecent(raw: string | null): Place[] {
  try {
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.label === "string" && typeof p.slug === "string" && finite(p.lat) && finite(p.lng)).slice(0, 4) : [];
  } catch {
    return [];
  }
}

/** Development only, on the web: `localStorage.lx_dev_ip = "102.89.23.4"` tries the flow as if from that address. The API honours it only in development. */
function devGeoIp(): string {
  if (!__DEV__ || Platform.OS !== "web") return "";
  try { const v = globalThis.localStorage?.getItem("lx_dev_ip") ?? ""; return /^[0-9a-fA-F.:]{3,45}$/.test(v) ? v : ""; } catch { return ""; }
}

/** The first guess: the API's reading of the internet address, else its busiest place. */
async function locate(): Promise<Partial<State>> {
  const dev = devGeoIp();
  const got = await api<Located>(`/locate${qs({ geo_ip: dev })}`);
  if (got.place && got.source !== "default" && got.served) {
    return { chosen: toChosen(got.place, "ip", got.place.country), known: got.place, elsewhere: "" };
  }
  const place = got.default ?? state.busiest;
  const elsewhere = got.source !== "default" && !got.served ? got.country_name || got.country : "";
  // With no guess at all, the country we started them in stands for theirs, so a switch to the other country is still announced.
  return place ? { chosen: toChosen(place, "default", place.country), known: place, elsewhere } : { chosen: null, known: null, elsewhere };
}

async function start() {
  if (started) return;
  started = true;
  const [rawPlace, rawDenied, rawRecent] = await Promise.all([store.get(KEYS.place), store.get(KEYS.denied), store.get(KEYS.recent)]);
  const kept = readChosen(rawPlace);
  patch({ denied: rawDenied === "1", recent: readRecent(rawRecent) });
  // The list of places is wanted by the panel and for a place's business count. It is not fatal when it fails.
  const lists = api<{ places: Place[]; countries: Country[]; default: Place | null }>("/places")
    .then((d) => patch({ places: d.places ?? [], countries: (d.countries ?? []).filter((c) => c.businesses > 0), busiest: d.default ?? null }))
    .catch(() => undefined);
  if (kept) {
    // A choice made before the stored one was read wins.
    if (!state.chosen) patch({ chosen: kept, ready: true });
    await lists;
    patch({ known: state.places.find((p) => p.slug && p.slug === state.chosen?.slug) ?? null });
    return;
  }
  await lists;
  if (state.chosen) { patch({ ready: true }); return; }
  try {
    patch({ ...(await locate()), ready: true, error: "" });
  } catch (e) {
    patch({ ready: true, error: (e as Error).message || "We could not work out where to look." });
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  void start();
  return () => { listeners.delete(l); };
}

/** Choose a place by hand. It is remembered, and goes to the top of the recent list. */
export function setPlace(p: Place) {
  const home = state.chosen?.home || (served(state.chosen?.country) ? state.chosen!.country : "");
  const chosen = toChosen(p, "picked", home);
  const recent = [p, ...state.recent.filter((r) => !(r.slug === p.slug && r.kind === p.kind))].slice(0, 4);
  patch({ chosen, known: p, recent, elsewhere: "", error: "" });
  void store.set(KEYS.place, JSON.stringify(chosen));
  void store.set(KEYS.recent, JSON.stringify(recent));
}

/** Browse a whole country on purpose: a gift for someone there, or a visit. The banner then says so. */
export async function switchCountry(code: string) {
  const name = state.countries.find((c) => c.code === code)?.name ?? inCountry(code).replace(/^the /, "");
  const slug = name.toLowerCase().replace(/[^a-z]+/g, "-");
  let place: Place | null = null;
  try { place = (await api<{ place: Place }>(`/places/${slug}`)).place; } catch { /* the country is still chosen, without its counts */ }
  setPlace(place ?? { slug, kind: "country", city: "", region: "", region_name: "", country: code, country_name: name, label: name, lat: 0, lng: 0, businesses: 0, currency: code === "NG" ? "NGN" : "USD", unit: code === "US" ? "mi" : "km", timezone: "" });
}

/** Forget the chosen place and any refusal, and go back to the first guess. */
export async function forget() {
  await Promise.all([store.set(KEYS.place, null), store.set(KEYS.denied, null)]);
  patch({ denied: false, chosen: null, known: null, ready: false, error: "" });
  try {
    patch({ ...(await locate()), ready: true });
  } catch (e) {
    patch({ ready: true, error: (e as Error).message || "We could not work out where to look." });
  }
}

/** Try the first guess again, after it failed. */
export async function reload() {
  patch({ ready: false, error: "" });
  try {
    patch({ ...(await locate()), ready: true });
  } catch (e) {
    patch({ ready: true, error: (e as Error).message || "We could not work out where to look." });
  }
}

// ---------- the device's own position ----------

class Refused extends Error { denied = true; }

// Foreground only: called after the person presses Use my exact location.
const NATIVE_POSITION = async (): Promise<Point> => {
  const L = await import("expo-location");
  if (!(await L.hasServicesEnabledAsync())) throw new Error("Location services are off. Enable them in Settings, or choose a place.");
  if ((await L.requestForegroundPermissionsAsync()).status !== "granted") throw new Refused("denied");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const p = await Promise.race([
      L.getCurrentPositionAsync({ accuracy: L.Accuracy.Balanced }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Getting your location took too long. Try again, or choose a place.")), 12000); }),
    ]);
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } finally { clearTimeout(timer); }
};

function devicePosition(): Promise<Point> {
  if (Platform.OS === "web") {
    const g = (globalThis as { navigator?: { geolocation?: { getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number } }) => void, no: (e: { code: number }) => void, o: object) => void } } }).navigator?.geolocation;
    if (!g) return Promise.reject(new Error("This browser cannot share a location. Choose a place instead."));
    return new Promise((resolve, reject) => g.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e.code === 1 ? new Refused("denied") : new Error("We could not get your location. Try again, or choose a place.")),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
    ));
  }
  if (NATIVE_POSITION) return NATIVE_POSITION();
  return Promise.reject(new Error("Exact location is not switched on in this build of the app yet. Choose a place instead."));
}

export type FoundMe = { ok: true; place: Place } | { ok: false; why: string };

/**
 * "Use my exact location": the only thing that asks the device where it is. The position is rounded to about
 * a hundred metres and turned into a place by the API. A refusal is remembered, so the app does not keep asking.
 */
export async function useExactLocation(): Promise<FoundMe> {
  let at: Point;
  try {
    at = await devicePosition();
  } catch (e) {
    if ((e as Refused).denied) {
      patch({ denied: true });
      void store.set(KEYS.denied, "1");
      return { ok: false, why: Platform.OS === "web" ? "Your browser did not share your location. You can allow it in the browser's site settings, or choose a place." : "Location was not allowed. You can allow it in your phone's settings, or choose a place." };
    }
    return { ok: false, why: (e as Error).message || "We could not get your location. Try again, or choose a place." };
  }
  const lat = round(at.lat), lng = round(at.lng);
  try {
    const got = await api<{ place: Place | null; source: string; country: string; served: boolean; unit: "mi" | "km"; nearest: Place[] }>(`/places/reverse${qs({ lat, lng })}`);
    if (!got.place) return { ok: false, why: "We found you, but could not name the place. Choose one instead." };
    // The device's own position is kept, so distances are from where the person is, not from the middle of the town.
    const place: Place = { ...got.place, label: got.place.label || "Your location", lat, lng };
    const home = got.served && got.place.kind !== "point" ? got.place.country : state.chosen?.home ?? "";
    const chosen = toChosen(place, "device", home);
    patch({ chosen, known: got.place, denied: false, elsewhere: got.served ? "" : got.country || "", error: "" });
    void store.set(KEYS.place, JSON.stringify(chosen));
    void store.set(KEYS.denied, null);
    return { ok: true, place };
  } catch (e) {
    return { ok: false, why: (e as Error).message || "We could not look up where you are just now. Choose a place instead." };
  }
}

// ---------- the hook ----------

/** The query that asks GET /v1/businesses for this place: nearest first from a point, else the place itself, always inside the country being browsed. */
export function businessQuery(w: { chosen: Chosen | null; scope: string }): Record<string, string | number | undefined> {
  const ch = w.chosen;
  if (!ch) return {};
  const point = ch.src === "device" || ch.kind === "point" || (ch.kind === "city" && ch.lat !== 0 && ch.lng !== 0);
  if (point) return { lat: ch.lat, lng: ch.lng, scope: w.scope || undefined };
  if (ch.kind === "country") return { country: ch.country, scope: w.scope || undefined };
  return { place: ch.slug || undefined, scope: w.scope || undefined };
}

/**
 * Where the client is looking. `ready` is false for the moment it takes to read the remembered choice or ask
 * the API for a guess: wait for it before loading anything that depends on the place.
 */
export function usePlace() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  const ch = s.chosen;
  // Somewhere we do not trade (a point abroad): they are shown the country with the most businesses.
  const scope = ch ? (served(ch.country) ? ch.country : s.busiest?.country ?? "US") : "";
  const home = ch?.home && served(ch.home) ? ch.home : "";
  const place: Place | null = ch ? (s.known && s.known.slug === ch.slug && ch.src === "picked" ? s.known : {
    slug: ch.slug, kind: ch.kind, city: ch.city, region: ch.region, region_name: s.known?.region_name ?? ch.region, country: ch.country, country_name: s.known?.country_name ?? ch.country,
    label: ch.label, lat: ch.lat, lng: ch.lng, businesses: s.known?.businesses ?? 0, categories: s.known?.categories, currency: ch.country === "NG" ? "NGN" : "USD", unit: ch.country === "US" ? "mi" : "km", timezone: s.known?.timezone ?? "",
  }) : null;
  const point: Point | null = ch && (ch.src === "device" || ch.kind === "point" || ch.kind === "city") && (ch.lat !== 0 || ch.lng !== 0) ? { lat: ch.lat, lng: ch.lng } : null;
  return {
    ready: s.ready, error: s.error, place, chosen: ch, source: (ch?.src ?? "default") as Source, approximate: ch?.src === "ip" || ch?.src === "default",
    scope, home, abroad: !!home && !!scope && home !== scope, elsewhere: s.elsewhere,
    currency: scope === "NG" ? "NGN" : "USD", unit: (scope === "US" ? "mi" : "km") as "mi" | "km",
    /** Where distances are measured from: the device, or the middle of the place. Null for a state or a country. */
    point, denied: s.denied, recent: s.recent, places: s.places, countries: s.countries,
    query: businessQuery({ chosen: ch, scope }),
    setPlace, useExactLocation, forget, switchCountry, reload,
  };
}

export type Where = ReturnType<typeof usePlace>;

/** One calm line about where the person is looking: "Near Nashville, TN", "We think you are near Atlanta, GA". */
export function whereLine(w: Pick<Where, "place" | "source" | "elsewhere">): string {
  const p = w.place;
  if (!p) return "";
  if (w.elsewhere) return `We do not serve ${w.elsewhere} yet. Showing ${p.label}`;
  if (p.kind === "country") return w.source === "ip" ? `We think you are in ${inCountry(p.country)}` : `Across ${inCountry(p.country)}`;
  if (p.kind === "state") return `In ${p.label}`;
  if (w.source === "ip") return `We think you are near ${p.label}`;
  if (w.source === "device") return `Nearest to you, around ${p.label}`;
  if (w.source === "default") return `We could not tell where you are, so we started you in ${p.label}`;
  return `Near ${p.label}`;
}

// ---------- states and addresses, for the business forms ----------

export type StateRow = { value: string; code: string; name: string };
let statesCache: Record<string, StateRow[]> | null = null;
/** The states of both countries, for a form. Asked once. */
export async function loadStates(): Promise<Record<string, StateRow[]>> {
  if (statesCache) return statesCache;
  const d = await api<{ states: Record<string, StateRow[]> }>("/places/states");
  statesCache = d.states ?? {};
  return statesCache;
}

export type LocatedAddress = { location: { address: string; city: string; region: string; country: string; lat: number | null; lng: number | null; timezone: string; position_source: string; matched: string }; position: string; timezone_name: string; place?: Place | null };
/** Where an address lands on the map, before it is saved. With a pin, the API says what is under it. */
export const locateAddress = (body: { address: string; city: string; region: string; country: string; lat?: number; lng?: number }) => api<LocatedAddress>("/places/locate", { body });

/** What a save or a check says about the pin, in the words the screens use. */
export function pinWords(position: string | undefined): string {
  switch (position) {
    case "found": case "found from the address": return "Found on the map from the address.";
    case "approximate": return "Only the city was found, so the pin is the city centre. Check the street, or set the pin by hand.";
    case "set by hand": return "The pin is where you put it.";
    case "not found": return "We could not find that address on the map. Check the street and city, or set the pin by hand.";
  }
  return "";
}
