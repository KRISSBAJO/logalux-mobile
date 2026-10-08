// Small helpers shared by the business calendar, clients and inbox screens.
import type { Row } from "./api";
import { clock, dayShort, ymd } from "./format";

/** The warmer background the design uses behind a client's profile and a conversation. */
export const sand = "#F4ECE2";
/** The "new" tag in the designs is the one blue in the palette. */
export const blueBg = "#E4ECF7", blueInk = "#1F4B7A";

const TONES = ["#7A1F2B", "#2E2538", "#1F2A33", "#4A3426", "#5A4A3A", "#2A3A33", "#3A3A2E", "#4A2A2A"];
/** A steady colour for a person's initials, picked from their name as the web app does. */
export const toneOf = (name: string) => TONES[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONES.length];
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ---------- calendar days, written YYYY-MM-DD ----------

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const noon = (day: string) => new Date(day + "T12:00:00Z");
export const addDays = (day: string, n: number) => { const t = noon(day); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
/** "mon", "tue"… the keys opening hours are stored under. */
export const dowOf = (day: string) => DOW[noon(day).getUTCDay()];
export const mondayOf = (day: string) => addDays(day, -((noon(day).getUTCDay() + 6) % 7));
const dayFmt = (day: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o }).format(noon(day));
/** "Mon" */
export const dowShort = (day: string) => dayFmt(day, { weekday: "short" });
/** "5 Oct" */
export const dayMonth = (day: string) => `${Number(day.slice(8))} ${dayFmt(day, { month: "short" })}`;
/** "Mon 5 Oct" */
export const dayLabel = (day: string) => `${dowShort(day)} ${dayMonth(day)}`;
/** "Monday 5 October" */
export const dayFull = (day: string) => `${dayFmt(day, { weekday: "long" })} ${Number(day.slice(8))} ${dayFmt(day, { month: "long" })}`;
/** "5 to 11 Oct", or "28 Sep to 4 Oct" across two months. */
export const weekTitle = (monday: string) => {
  const end = addDays(monday, 6);
  return monday.slice(0, 7) === end.slice(0, 7) ? `${Number(monday.slice(8))} to ${dayMonth(end)}` : `${dayMonth(monday)} to ${dayMonth(end)}`;
};

// ---------- times ----------

export const mins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Minutes after midnight written the way the app writes times: "1:30 PM". */
export const clockOf = (m: number) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
/** "9", "12", "1": the hour marks down the side of the calendar. */
export const hourMark = (h: number) => String(h % 12 || 12);

const hmFmt: Record<string, Intl.DateTimeFormat> = {};
/** How many minutes after midnight a moment is, in the business's time zone. */
export const minutesOfDay = (iso: string | Date, tz?: string) => {
  const key = tz ?? "";
  let f = hmFmt[key];
  if (!f) {
    try { f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
    catch { f = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
    hmFmt[key] = f;
  }
  const [h, m] = f.format(typeof iso === "string" ? new Date(iso) : iso).split(":").map(Number);
  return (h % 24) * 60 + m;
};
/** The calendar day a moment falls on, in the business's time zone. */
export const dayOf = (iso: string, tz?: string) => ymd(new Date(iso), tz);
export const lengthOf = (b: Row) => (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60000;
/** "Mar 2026" */
export const monthYear = (iso: string, tz?: string) => {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", year: "numeric" }).format(new Date(iso)); }
  catch { return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(iso)); }
};
/** "Thu 8 Oct", with the year when it is not this one: "Thu 8 Oct 2025". */
export const dateMed = (iso: string, tz?: string) => {
  const y = dayOf(iso, tz).slice(0, 4);
  return y === ymd(new Date(), tz).slice(0, 4) ? dayShort(iso, tz) : `${dayShort(iso, tz)} ${y}`;
};
/** "Today", "Yesterday" or the date. */
export const relDay = (iso: string, tz?: string) => {
  const day = dayOf(iso, tz);
  return day === ymd(new Date(), tz) ? "Today" : day === ymd(new Date(Date.now() - 864e5), tz) ? "Yesterday" : dateMed(iso, tz);
};
/** The time for a list of conversations: the clock today, otherwise the day. */
export const stampShort = (iso: string, tz?: string) => (dayOf(iso, tz) === ymd(new Date(), tz) ? clock(iso, tz) : relDay(iso, tz));
/** "Thu 8 Oct, 9:30 AM" */
export const stamp = (iso: string, tz?: string) => `${dateMed(iso, tz)}, ${clock(iso, tz)}`;

// ---------- who may do what ----------

const rank: Record<string, number> = { staff: 1, manager: 2, owner: 3 };
/** Whether the signed-in person has at least this role. */
export const can = (merchant: Row | null | undefined, role: "staff" | "manager" | "owner") => !!merchant && (rank[merchant.role] ?? 0) >= rank[role];

// ---------- words ----------

export const STATUS_LABEL: Record<string, string> = {
  requested: "Requested", confirmed: "Confirmed", checked_in: "Arrived", in_progress: "In progress", completed: "Finished", paid: "Paid",
  cancelled_client: "Cancelled by client", cancelled_business: "Cancelled", no_show: "No-show", rescheduled: "Moved",
};
export type Tone = "ok" | "gold" | "wine" | "grey" | "new" | "bad" | "dark";
export const statusTone = (status: string): Tone =>
  status === "paid" || status === "completed" ? "ok" : status === "no_show" || status.startsWith("cancelled") ? "bad" : status === "requested" ? "gold" : status === "in_progress" || status === "checked_in" ? "wine" : "grey";

const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "Email", in_app: "In-app", instagram: "Instagram" };
export const channelLabel = (channel: string) => CHANNEL[channel] ?? cap(channel ?? "");

/** The label under one message the business sent. */
export function deliveryLabel(delivery: string): string {
  if (delivery === "delivered") return "Delivered";
  if (delivery === "sent") return "Sent";
  if (delivery === "logged") return "Logged, not sent";
  if (delivery === "failed") return "Failed to send";
  return delivery ? `Not sent: ${delivery}` : "";
}
/** The sentence shown after sending, and whether it counts as a problem. Worded as the web app words it. */
export function deliveryResult(delivery: string, channel: string): { kind: "ok" | "bad"; message: string } {
  if (delivery === "delivered") return { kind: "ok", message: "Message delivered to the client's LogaLuxe account." };
  if (delivery === "sent") return { kind: "ok", message: "Message sent by email." };
  if (delivery === "logged") {
    if (channel === "whatsapp" || channel === "sms") return { kind: "ok", message: `Message logged, not sent. ${channelLabel(channel)} is not connected yet.` };
    if (channel === "email") return { kind: "ok", message: "Message logged, not sent. No mail provider is set up." };
    if (channel === "in_app") return { kind: "ok", message: "Message logged, not sent. This client has no LogaLuxe account to read it in." };
    return { kind: "ok", message: "Message logged, not sent. The note under the messages says why." };
  }
  if (delivery === "failed") return { kind: "bad", message: "The email could not be sent. The message is saved in the conversation as failed." };
  return { kind: "bad", message: `Message saved but not sent: ${delivery || "unknown reason"}.` };
}

/** Who is coming, when it is not the person who booked. */
export const guestOf = (b: Row) => String(b.guest_name ?? "").trim();
/** "Tola (booked by Dami Parent)", or just the client. */
export const whoOf = (b: Row) => (guestOf(b) ? `${guestOf(b)} (booked by ${b.client_name})` : String(b.client_name ?? ""));

/** Busy times read from a person's own calendar. They come and go with that calendar, so they are never removed by hand. */
export const isImported = (block: Row) => block.external === true || String(block.reason ?? "") === "Busy (own calendar)";

/** The tags beside a client: their own tags first, otherwise what their history says (as the web app decides it). */
export function tagPills(cl: Row): { tone: Tone; text: string }[] {
  const tags = (cl.tags ?? []) as string[];
  const DAY = 864e5;
  if (tags.length) return tags.slice(0, 2).map((t) => ({ tone: t === "vip" ? "gold" : t === "waitlist" ? "ok" : t === "new" ? "new" : "grey", text: t === "vip" ? "VIP" : cap(t) }));
  if (cl.last_visit && !cl.next_visit && Date.now() - Date.parse(cl.last_visit) > 60 * DAY) return [{ tone: "wine", text: "Lapsed" }];
  if (Date.now() - Date.parse(cl.created_at) < 30 * DAY) return [{ tone: "new", text: "New" }];
  if (Number(cl.visits) >= 3) return [{ tone: "grey", text: "Regular" }];
  return [];
}
export const tagTone = (t: string): Tone => (t === "vip" ? "gold" : t === "waitlist" ? "ok" : t === "new" ? "new" : "grey");
export const tagText = (t: string) => (t === "vip" ? "VIP" : cap(t));
