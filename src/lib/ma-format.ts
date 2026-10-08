// Small helpers for the business day-to-day screens (Today, a booking, a new booking, checkout).
// They follow the web's merchant-format so both say the same thing about the same booking.
import type { Row } from "./api";
import { clock, ymd } from "./format";

/** The darker cream the booking and checkout designs sit on. */
export const paper = "#F4ECE2";

export const STATUS_LABEL: Record<string, string> = {
  requested: "Requested", confirmed: "Confirmed", checked_in: "Arrived", in_progress: "In progress", completed: "Finished", paid: "Paid",
  cancelled_client: "Cancelled by client", cancelled_business: "Cancelled", no_show: "No-show", rescheduled: "Moved",
};
export type PillKind = "ok" | "gold" | "dark" | "wine" | "grey" | "bad";
export const statusKind = (status: string): PillKind =>
  status === "paid" ? "ok" : status === "completed" || status === "in_progress" ? "gold" : status === "requested" ? "wine" : status === "no_show" || status.startsWith("cancelled") ? "bad" : "grey";

export const SOURCE: Record<string, string> = { web: "Booking page", search: "Search", rebook: "Rebook", phone: "Phone", walk_in: "Walk-in", whatsapp: "WhatsApp", instagram: "Instagram link", link: "Booking link", app: "App" };

/** "Kemi Adeyemi" → "Kemi A." */
export const shortName = (name: string) => { const [a, ...rest] = String(name ?? "").trim().split(/\s+/); return rest.length ? `${a} ${rest[rest.length - 1][0]}.` : a; };

/** Who is coming, when it is not the person who booked. */
export const guestOf = (b: Row) => String(b.guest_name ?? "").trim();
/** The person in the chair: the guest when there is one, else the client. */
export const comingOf = (b: Row) => guestOf(b) || String(b.client_name ?? "Client");
/** A name without anything in brackets, for initials: "Tola (my daughter)" → "Tola". */
export const plainName = (name: string) => String(name ?? "").replace(/\([^)]*\)/g, " ").trim() || String(name ?? "");
/** "Tola (booked by Dami Parent)", or just the client when they booked for themselves. */
export const whoOf = (b: Row) => (guestOf(b) ? `${guestOf(b)} (booked by ${b.client_name})` : String(b.client_name ?? ""));

/** What the client still has to pay for a visit. */
export const dueOf = (b: Row) => (b.status === "paid" ? 0 : Math.max(0, Number(b.total_cents ?? 0) - Number(b.discount_cents ?? 0) - (b.deposit_paid ? Number(b.deposit_cents ?? 0) : 0)));
export const minutesOf = (b: Row) => Math.round((Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60000);

export const answerText = (a: Row) => {
  const v = String(a.answer ?? "").trim();
  if (a.kind === "consent") return v.toLowerCase() === "yes" ? "Agreed" : v || "Not ticked";
  if (a.kind === "yesno") return v.toLowerCase() === "yes" ? "Yes" : v.toLowerCase() === "no" ? "No" : v;
  return v || "No answer";
};

// ----- days, as YYYY-MM-DD in the business's zone -----

export const addDays = (day: string, n: number) => new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const todayIn = (tz?: string) => ymd(new Date(), tz);
const noon = (day: string) => new Date(day + "T12:00:00Z");
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
/** "mon", "tue"…: the key the API uses for opening hours. */
export const dowOf = (day: string) => DOW[noon(day).getUTCDay()];
/** The Monday of the week a day is in. */
export const mondayOf = (day: string) => addDays(day, -((noon(day).getUTCDay() + 6) % 7));
const part = (day: string, o: Intl.DateTimeFormatOptions) => noon(day).toLocaleDateString("en-US", { timeZone: "UTC", ...o });
/** "Saturday" */
export const weekdayLong = (day: string) => part(day, { weekday: "long" });
/** "S" */
export const weekdayLetter = (day: string) => part(day, { weekday: "narrow" });
/** "Sat" */
export const weekdayShort = (day: string) => part(day, { weekday: "short" });
/** "October 10" */
export const monthDay = (day: string) => part(day, { month: "long", day: "numeric" });
/** "Sat 10 Oct" */
export const dayLabel = (day: string) => `${part(day, { weekday: "short" })} ${noon(day).getUTCDate()} ${part(day, { month: "short" })}`;
export const dayNum = (day: string) => noon(day).getUTCDate();

/** The hour of the day, 0 to 23, in a zone. */
export function hourIn(tz?: string, at = new Date()): number {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(at)) % 24;
  } catch {
    return at.getHours();
  }
}
export const greetingFor = (hour: number) => (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");

/** "9:30" and "AM", for a narrow time column. */
export const clockParts = (iso: string | Date, tz?: string): [string, string] => {
  const [a, b] = clock(iso, tz).split(/\s+/);
  return [a ?? "", b ?? ""];
};
/** "10:00 AM to 1:30 PM" */
export const span = (b: Row, tz?: string) => `${clock(b.starts_at, tz)} to ${clock(b.ends_at, tz)}`;

/** "25 min", "2 h 5 min": how far away a moment is, never less than a minute. */
export function away(ms: number): string {
  const mins = Math.max(1, Math.round(Math.abs(ms) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}

/** A phone number as a link the dialler opens. */
export const tel = (phone: string) => `tel:${String(phone).replace(/[^\d+]/g, "")}`;

/** Money typed in major units ("12.50") as minor units. Anything unreadable is zero. */
export const toCents = (text: string) => Math.max(0, Math.round((parseFloat(String(text).replace(/,/g, "")) || 0) * 100));

/** May this sign-in do something the owner can switch on or off? Managers and the owner always may (as the API decides it). */
export function allowed(merchant: Row | null, key: "see_all_calendars" | "take_payments" | "see_reports"): boolean {
  if (!merchant) return false;
  if (merchant.role === "owner" || merchant.role === "manager") return true;
  const v = merchant.permissions?.[key];
  return typeof v === "boolean" ? v : key !== "see_reports";
}
export const isManager = (merchant: Row | null) => merchant?.role === "owner" || merchant?.role === "manager";

/** A load that stays "loading" until the session has read its token; the screen loads again once it has. */
export const waitForSignIn = () => new Promise<never>(() => undefined);
