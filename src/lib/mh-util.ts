// Helpers for the numbers and money-account screens (Reports, Statements, Payouts, Plan).
// The wording and the sums follow the web's Reports, Money and Settings pages, so both say the same thing.
import { Platform, Share } from "react-native";
import { API_URL, type Row } from "./api";
import { dayShort } from "./format";

// ---------- money and numbers ----------

const SYMBOL: Record<string, string> = { USD: "$", NGN: "₦" };

/** Money to the cent, always: "$1,234.50", "−₦500.00". `sign` puts a plus on money coming in. */
export function exact(cents: number | null | undefined, currency = "USD", sign = false): string {
  const n = Math.round(Number(cents ?? 0));
  const text = (Math.abs(n) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "−" : sign && n > 0 ? "+" : "") + (SYMBOL[currency] ?? currency + " ") + text;
}

/** A whole-number share: 3 of 12 is 25. Nothing to divide by is 0. */
export const pct = (some: number, whole: number) => (whole > 0 ? Math.round((some / whole) * 100) : 0);
/** A rate in percent with one decimal, or null when there is nothing to divide by. */
export const rate = (some: number, whole: number) => (whole > 0 ? Math.round((some / whole) * 1000) / 10 : null);

// ---------- dates ----------

const noon = (v: string) => new Date(String(v).slice(0, 10) + "T12:00:00Z");
/** A plain date as "Fri 9 Oct". */
export const dateShort = (v: string | null | undefined) => (v ? dayShort(noon(v), "UTC") : "");
/** A plain date as "9 Oct 2026". */
export const dateMed = (v: string | null | undefined) => {
  if (!v) return "";
  const d = noon(v);
  return `${d.getUTCDate()} ${d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" })} ${d.getUTCFullYear()}`;
};
/** A plain date as "9 Oct". */
export const dayMonth = (v: string) => { const d = noon(v); return `${d.getUTCDate()} ${d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" })}`; };
/** A moment as "9 Oct 2026" in a zone. */
export const momentMed = (iso: string | null | undefined, tz?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  let p: string;
  try { p = d.toLocaleDateString("en-US", { timeZone: tz, day: "numeric", month: "short", year: "numeric" }); } catch { p = d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }); }
  const m = p.match(/^(\w+) (\d+), (\d+)$/); // "Oct 9, 2026"
  return m ? `${m[2]} ${m[1]} ${m[3]}` : p;
};
/** "2026-10" as "October 2026". */
export const monthName = (ym: string) => new Date(ym + "-15T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
/** Moves a YYYY-MM month by a number of months. */
export const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 15));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
/** The hour a two-hour band starts, as "8 AM". */
export const hourName = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h % 24 < 12 ? "AM" : "PM"}`;

// ---------- the ledger's words ----------

export const KIND: Record<string, string> = { charge: "Sale", deposit: "Deposit", tip: "Tip", fee: "LogaLuxe fee", lead_fee: "Lead fee", plan_fee: "Plan fee", refund: "Refund", payout: "Payout", payout_fee: "Instant payout fee", adjustment: "Adjustment" };
export const METHOD: Record<string, string> = { card: "Card", tap: "Tap to pay", cash: "Cash", transfer: "Bank transfer", wallet: "Wallet", link: "Pay link", gift: "Gift card", credit: "Store credit", stripe: "Stripe", paystack: "Paystack", flutterwave: "Flutterwave", logaluxe: "LogaLuxe" };
export const PROVIDER: Record<string, string> = { stripe: "Stripe", paystack: "Paystack", flutterwave: "Flutterwave" };
export const SOURCE: Record<string, string> = {
  web: "Your booking page", link: "Your booking link", rebook: "Rebook and reminders", search: "LogaLuxe search",
  walk_in: "Walk-in", phone: "Phone", whatsapp: "WhatsApp", instagram: "Instagram", staff: "Added by the team", app: "The app",
};
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, " ") : s);

/** "Chase ···· 4242", or the provider when the bank is not known yet. */
export const bankOf = (p: Row | null | undefined, fallback = "Bank") => (!p ? "" : p.bank_name ? `${p.bank_name}${p.account_last4 ? ` ···· ${p.account_last4}` : ""}` : PROVIDER[p.provider] ?? fallback);

export type PayoutWord = { word: string; kind: "ok" | "gold" | "grey" | "wine" };
/** How a payout stands, in the words the web uses. */
export function payoutState(p: Row): PayoutWord {
  if (p.status === "paid") return { word: String(p.reference ?? "").startsWith("sim_") ? "Recorded as paid, simulated" : "Paid", kind: "ok" };
  if (p.status === "failed") return { word: "Failed, money returned to your balance", kind: "wine" };
  if (p.status === "sending") return { word: "Being sent to your bank", kind: "gold" };
  if (p.status === "scheduled") return { word: "Scheduled, not sent yet", kind: "grey" };
  return { word: cap(String(p.status ?? "")), kind: "grey" };
}
export const payoutKind = (k: string) => (k === "instant" ? "Instant" : k === "manual" ? "On request" : "Automatic");

/** Is this address one of Stripe's own pages? Only those are opened for payout set-up. */
export function isStripe(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "stripe.com" || u.hostname.endsWith(".stripe.com"));
  } catch {
    return false;
  }
}

// ---------- spreadsheet files ----------

export type Csv = { name: string; text: string };

/**
 * Asks the API for a CSV file as the signed-in business. The web does this through its own server because
 * a browser link cannot carry the token; the app holds the token, so it can ask the API itself.
 */
export async function getCsv(path: string, token: string | null, fallbackName: string): Promise<Csv> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/m${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error("We could not reach LogaLuxe. Check your connection and try again.");
  }
  const text = await res.text();
  if (!res.ok) {
    let message = "";
    try { message = String(JSON.parse(text).error ?? ""); } catch { /* not JSON */ }
    if (res.status === 403) throw new Error("Your sign-in does not include this file. Ask the owner.");
    throw new Error(message ? message[0].toUpperCase() + message.slice(1) + "." : "The file could not be made. Try again.");
  }
  const named = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
  return { name: named || fallbackName, text };
}

/** How many data rows a CSV has (its first line is the column names). */
export const csvRows = (text: string) => Math.max(0, text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "").length - 1);

// The share sheet is handed the rows as text. Past this size a phone can refuse it, so the app says so instead.
const SHARE_LIMIT = 250_000;

/**
 * Hands a CSV to the person. In a browser it is saved as a file. On a phone the app has no file-sharing
 * module, so the rows go to the system share sheet as text (Mail, Notes, Files and Sheets all take it).
 */
export async function handCsv(csv: Csv): Promise<"saved" | "shared" | "closed" | "too-big" | "failed"> {
  if (Platform.OS === "web") {
    try {
      const g = globalThis as unknown as { document: Row; URL: { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void } };
      const url = g.URL.createObjectURL(new Blob([csv.text], { type: "text/csv;charset=utf-8" }));
      const a = g.document.createElement("a");
      a.href = url; a.download = csv.name; a.style.display = "none";
      g.document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => g.URL.revokeObjectURL(url), 2000);
      return "saved";
    } catch {
      return "failed";
    }
  }
  const body = csv.text.replace(/^﻿/, "");
  if (body.length > SHARE_LIMIT) return "too-big";
  try {
    const out = await Share.share({ title: csv.name, message: body }, { subject: csv.name, dialogTitle: csv.name });
    return out.action === Share.dismissedAction ? "closed" : "shared";
  } catch {
    return "failed";
  }
}
