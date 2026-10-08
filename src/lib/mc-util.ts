// Helpers for the "run the business" screens (More, Money, Services, Hours, Onboarding).
import * as Clipboard from "expo-clipboard";
import { Alert, Linking, Platform, Share } from "react-native";
import { ApiError, WEB_URL } from "./api";
import { dayShort } from "./format";

/** The result of a call that is allowed to be refused: a team member's role may not open everything. */
export type Soft<T> = { data: T | null; denied: boolean; status: number; error: string };

/** Runs a call and reports a refusal (403) or a failure instead of throwing, so one screen can load several things. */
export async function soft<T>(call: () => Promise<T>): Promise<Soft<T>> {
  try {
    return { data: await call(), denied: false, status: 200, error: "" };
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    return { data: null, denied: status === 403, status, error: (e as Error).message || "Something went wrong." };
  }
}

/** Holds a screen's loader back until the session has its token, so nothing is asked for unsigned. */
export const signedIn = <T,>(s: { businessToken: string | null }, load: () => Promise<T>) => () => (s.businessToken ? load() : new Promise<T>(() => undefined));

/** What a screen's loader answers when the API says this role may not see it. */
export const DENIED = "__denied__";

/** Wraps a screen's loader: a 403 becomes the marker the screen shows its "ask a manager" state for. */
export async function orDenied<T>(call: () => Promise<T>): Promise<T | typeof DENIED> {
  try {
    return await call();
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return DENIED;
    throw e;
  }
}

// ---------- money typed into a field ----------

/** "12.50" → 1250. Answers null when the text is not an amount. */
export function toCents(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  if (t === "") return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
export const major = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : String(cents / 100));

/** A whole number typed into a field, or null. */
export function toInt(text: string): number | null {
  const t = text.trim();
  if (t === "") return 0;
  return /^\d+$/.test(t) ? Number(t) : null;
}

export const symbol = (currency: string) => (currency === "NGN" ? "₦" : currency === "USD" ? "$" : currency);

// ---------- dates and opening hours ----------

/** A plain date from the API ("2026-10-09" or "2026-10-09T00:00:00Z") as "Fri 9 Oct". */
export const dateOnly = (v: string | null | undefined) => (v ? dayShort(new Date(String(v).slice(0, 10) + "T12:00:00Z"), "UTC") : "");

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export const DAY_SHORT: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
export const DAY_LONG: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
export type Hours = Partial<Record<Day, [string, string] | string[] | null>>;

/** "09:00" → "9:00 AM", the way the rest of the app writes a time. */
export function clock12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Every half hour of the day, for choosing an opening or closing time. */
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** "Tue to Sat", "Mon, Wed and Fri", "Every day", "Closed all week". */
export function openDays(hours: Hours | null | undefined): string {
  const open = DAYS.filter((d) => Array.isArray(hours?.[d]) && hours![d]!.length === 2);
  if (!open.length) return "Closed all week";
  if (open.length === 7) return "Every day";
  const idx = open.map((d) => DAYS.indexOf(d));
  const run = idx.every((n, i) => i === 0 || n === idx[i - 1] + 1);
  if (run && open.length > 2) return `${DAY_SHORT[open[0]]} to ${DAY_SHORT[open[open.length - 1]]}`;
  const names = open.map((d) => DAY_SHORT[d]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ---------- leaving the app, copying, sharing, asking ----------

/** Opens a page of the web app, for the desktop tools that are not on the phone. */
export const openWeb = (path: string) => Linking.openURL(WEB_URL + path).catch(() => undefined);

/** The public booking page of a business. */
export const bookingLink = (slug: string) => `${WEB_URL}/b/${slug}`;
/** True when an address only works on this computer or network, so it cannot be shared yet. */
export const isLocalAddress = (url: string) => /^https?:\/\/(localhost|127\.|10\.|192\.168\.|\[::1\]|[^/]*\.(localhost|test|local))/i.test(url);

/** Puts text on the clipboard, on a phone and in a browser alike. */
export async function copyText(text: string): Promise<"copied" | "shared" | "failed"> {
  try {
    return (await Clipboard.setStringAsync(text)) ? "copied" : "failed";
  } catch {
    return "failed";
  }
}

/** Opens the system share sheet. A browser without one copies the text instead. */
export async function shareText(message: string, url?: string): Promise<"shared" | "copied" | "failed"> {
  const text = url ? `${message} ${url}` : message;
  if (Platform.OS === "web") {
    const nav = globalThis.navigator as Navigator & { share?: (d: { text?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share(url ? { text: message, url } : { text: message });
        return "shared";
      } catch {
        return "failed"; // closed without sharing
      }
    }
    return (await copyText(text)) === "copied" ? "copied" : "failed";
  }
  try {
    const out = await Share.share(Platform.OS === "ios" && url ? { message, url } : { message: text });
    return out.action === Share.dismissedAction ? "failed" : "shared";
  } catch {
    return "failed";
  }
}

/** Asks before something that cannot be taken back. Answers true when the person agrees. */
export function ask(title: string, message: string, yes = "Yes", danger = false): Promise<boolean> {
  if (Platform.OS === "web") {
    const w = globalThis as unknown as { confirm?: (m: string) => boolean };
    return Promise.resolve(w.confirm ? w.confirm(`${title}\n\n${message}`) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: yes, style: danger ? "destructive" : "default", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export const fileSize = (bytes: number | null | undefined) => {
  const n = Number(bytes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0 KB";
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, " ") : s);
export const PLAN: Record<string, string> = { free: "Free plan", pro: "Pro plan" };
export const ROLE: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Team member" };
