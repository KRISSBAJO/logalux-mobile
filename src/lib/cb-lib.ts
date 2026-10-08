// What the booking flow shares between its steps: the shapes the API answers with, plain date
// arithmetic, and the wording of the rules. A calendar date ("2026-10-10") has no timezone, so the
// helpers that take one never touch the phone's clock.
import type { Row } from "@/lib/api";
import { money } from "@/lib/format";

export type Service = { id: string; name: string; duration_min: number; processing_min: number; price_cents: number; deposit_cents: number };
export type Staff = { id: string; name: string; initials?: string; role?: string; level?: string; tone?: string; rating?: number | string; service_ids?: string[] | null };
export type Policy = { instant?: boolean; waitlist?: boolean; cancel_hours?: number; late_cancel_fee?: string; max_days?: number; anyone?: boolean; multi_service?: boolean; payments_live?: boolean; new_client_deposit_pct?: number; prepay_after_no_show?: boolean };
export type Question = { id: string; service_id: string | null; label: string; kind: "text" | "yesno" | "choice" | "consent"; options?: string[] | null; required: boolean; sort: number };
export type Slot = { time: string; starts_at: string; staff_id: string; staff: string; price_cents: number };
export type DayCell = { date: string; open: number; from_cents: number; past: boolean; too_far: boolean };
export type Pro = { id: string; name: string; initials: string; tone: string; sub: string };
export type Place = { name?: string; address?: string | null; city?: string | null; hours?: Record<string, string[] | null> | null };
/** What every step needs to know about the business being booked. */
export type Biz = { slug: string; name: string; tone: string; logoId: string | null; currency: string; tz: string; market: string; place: Place; showAddress: boolean; policy: Policy };
export type Booking = {
  id: string; status: string; starts_at: string; ends_at: string; client_name: string; total_cents: number; discount_cents: number; promo_code: string;
  deposit_cents: number; deposit_paid: boolean; business: string; business_slug: string; currency: string; timezone: string; staff: string;
  address?: string | null; city?: string | null; guest_name?: string | null; items: { name: string; price_cents: number; duration_min: number }[];
  payment?: { url: string; amount_cents: number; currency: string; expires_at?: string | null } | null;
};

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** The keys the API uses for opening hours, Sunday first. */
export const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const utc = (date: string) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isTime = (v: string) => /^\d{2}:\d{2}$/.test(v);
export const addDays = (date: string, n: number) => { const d = utc(date); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const shiftMonth = (month: string, n: number) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
/** 0 for Sunday to 6 for Saturday. */
export const weekdayOf = (date: string) => utc(date).getUTCDay();
/** The Monday of the week a date falls in. */
export const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));
/** "2026-10-10" → "Sat". */
export const dowShort = (date: string) => WD[weekdayOf(date)];
/** "2026-10-10" → "Sat 10 Oct". */
export function dayLabel(date: string) {
  if (!isDate(date)) return "";
  return `${WD[weekdayOf(date)]} ${Number(date.slice(8))} ${MON[Number(date.slice(5, 7)) - 1]}`;
}
/** "October 2026", or "Oct to Nov 2026" for a week that crosses two months. */
export function monthLabel(from: string, to: string) {
  const a = Number(from.slice(5, 7)) - 1, b = Number(to.slice(5, 7)) - 1;
  if (a === b) return `${MONTHS[a]} ${from.slice(0, 4)}`;
  return `${MON[a]}${from.slice(0, 4) === to.slice(0, 4) ? "" : ` ${from.slice(0, 4)}`} to ${MON[b]} ${to.slice(0, 4)}`;
}

/** A moment as the business's clock shows it: its calendar date and its time, "10:00". */
export function inZone(at: string | Date, tz: string) {
  const d = typeof at === "string" ? new Date(at) : at;
  const o: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  let p: Intl.DateTimeFormatPart[];
  try {
    p = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).formatToParts(d);
  } catch {
    p = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o }).formatToParts(d); // a zone this phone does not know
  }
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}` };
}
/** "13:30" as people read it, "1:30 PM": the way the rest of the app writes a time. The 24-hour form stays the key. */
export const nice = (t: string) => { const [h, m] = t.split(":").map(Number); return Number.isNaN(h) || Number.isNaN(m) ? t : `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
/** A moment → "Sat 10 Oct, 10:00" on the business's clock. */
export function whenLabel(at: string | Date, tz: string, sep = ", ") {
  const z = inZone(at, tz);
  return `${dayLabel(z.date)}${sep}${nice(z.time)}`;
}

/** A length of time as the design writes it in a tight space: "3 h 30", "2 h", "45 min". */
export const span = (mins: number) => { const h = Math.floor(mins / 60), m = Math.round(mins % 60); return h && m ? `${h} h ${String(m).padStart(2, "0")}` : h ? `${h} h` : `${m} min`; };

export const sentence = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".") : t);
export const providerOf = (market: string) => (market === "NG" ? "Paystack" : "Stripe");

/** What the business keeps when a client cancels late, in plain words. "" when it keeps nothing. */
export function lateRule(fee: string | undefined, deposit: number, currency: string) {
  if (fee === "50") return "half the price is charged";
  if (fee === "100") return "the full price is charged";
  if (fee === "deposit") return deposit > 0 ? `the ${money(deposit, currency)} deposit is kept` : "";
  return "";
}

/** The cancellation rule for a visit starting at `startsAt`, with its real date and time. */
export function cancelRule(startsAt: string, policy: Policy, deposit: number, currency: string, tz: string) {
  const hours = policy.cancel_hours ?? 24;
  const late = lateRule(policy.late_cancel_fee, deposit, currency);
  const until = new Date(new Date(startsAt).getTime() - hours * 3600_000);
  if (hours <= 0) return "Free to cancel at any time before your appointment.";
  if (until.getTime() > Date.now()) return `Free cancellation until ${whenLabel(until, tz)}.${late ? ` After that ${late}.` : ""}`;
  return `This time is less than ${hours} h away, so the free cancellation window has passed.${late ? ` If you cancel, ${late}.` : ""}`;
}

/** What the API says when an answer to one of the business's questions is missing or wrong. Each is followed by the question's own wording. */
export const REFUSALS = ["please answer:", "please tick:", "choose one of the options:"];

/** The address of the booking flow, carrying what has been chosen so far. */
export function bookHref(slug: string, o: { services: string; staff?: string; date?: string; time?: string; step?: string; src?: string; booking?: string }) {
  const q: string[] = [];
  for (const k of ["booking", "services", "staff", "date", "time", "step", "src"] as const) if (o[k]) q.push(`${k}=${encodeURIComponent(o[k]!).replace(/%2C/g, ",").replace(/%3A/g, ":")}`);
  return `/c/book/${encodeURIComponent(slug)}${q.length ? `?${q.join("&")}` : ""}`;
}

/** A search parameter as one string, whatever the router handed over. */
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

// What the client has typed so far, kept while the app is open so that signing in half way
// (which leaves this screen and comes back) does not lose it. Answers belong to one business.
export type Details = { first: string; last: string; phone: string; email: string; note: string; who: "me" | "other"; guest: string; answers: Record<string, string> };
const drafts: Record<string, Details> = {};
export const draftOf = (slug: string): Details | undefined => drafts[slug];
export const keepDraft = (slug: string, d: Details | null) => { if (d) drafts[slug] = d; else delete drafts[slug]; };

export type { Row };
