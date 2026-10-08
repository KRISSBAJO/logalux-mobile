// What the signed-in client's screens share: how a booking is read, the sentences that go with
// cancelling, tipping and reporting, and a few date helpers. The rules match the web account.
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState, Linking } from "react-native";
import { API_URL, type Row } from "./api";
import { clock, dayShort, money, plural, when, ymd } from "./format";

export type PillKind = "ok" | "gold" | "dark" | "wine" | "grey" | "bad";

const ACTIVE = ["requested", "confirmed", "checked_in", "in_progress"];
/** A booking that has not finished and was not cancelled. */
export const isUpcoming = (b: Row) => ACTIVE.includes(b.status) && new Date(b.ends_at).getTime() > Date.now();

const STATES: Record<string, [string, PillKind]> = {
  requested: ["Requested", "gold"], confirmed: ["Confirmed", "ok"], checked_in: ["Checked in", "ok"], in_progress: ["In progress", "ok"],
  completed: ["Completed", "grey"], paid: ["Completed", "grey"], cancelled_client: ["Cancelled by you", "grey"], cancelled_business: ["Cancelled by the business", "wine"],
  no_show: ["Missed", "wine"], rescheduled: ["Moved", "grey"],
};
export const bookingState = (status: string): [string, PillKind] => STATES[status] ?? [status, "grey"];

/** The two lines of a date tile: "SAT" over "10" this week, "OCT" over "24" further away. */
export function tile(iso: string, tz?: string): { top: string; day: string } {
  const [dow, day, mon] = dayShort(iso, tz).split(" ");
  const days = (new Date(iso).getTime() - Date.now()) / 864e5;
  return { top: (days >= 0 && days < 7 ? dow : mon ?? dow ?? "").toUpperCase(), day: day ?? "" };
}

/** "12 Sep" */
export const dayMonth = (iso: string, tz?: string) => dayShort(iso, tz).split(" ").slice(1).join(" ");
/** "10:00 AM to 1:30 PM" */
export const span = (b: Row) => `${clock(b.starts_at, b.timezone)} to ${clock(b.ends_at, b.timezone)}`;

/** What is paid and what is left, as short facts for a booking card. */
export function moneyFacts(b: Row): string[] {
  const dep = Number(b.deposit_cents) || 0, total = Number(b.total_cents) || 0;
  if (dep <= 0) return [`${money(total, b.currency)} at visit`];
  if (b.deposit_paid) return [`${money(dep, b.currency)} paid`, `${money(Math.max(total - dep, 0), b.currency)} at visit`];
  return [`${money(dep, b.currency)} deposit not paid yet`, `${money(total, b.currency)} in all`];
}

/** Stripe takes payments for businesses priced in dollars, Paystack for those priced in naira. */
export const provider = (currency?: string) => (currency === "NGN" ? "Paystack" : "Stripe");
export const payLine = (currency?: string) => `You pay on ${provider(currency)}'s secure page. LogaLuxe never sees your card.`;

/** What cancelling will do, said before it is done. `more` is the booking from GET /auth/bookings/{id}. */
export function cancelBefore(b: Row, more?: Row | null): string {
  if (!more) return "Cancel this booking and release the time?";
  const until = when(more.free_until, b.timezone);
  if (more.can_reschedule) return `Cancelling is free until ${until}.${b.deposit_paid ? " Your deposit is returned." : ""}`;
  return `Free cancellation ended ${until}.${b.deposit_paid ? (more.late_cancel_fee === "none" ? " Your deposit is still returned." : " The business keeps your deposit, as its policy says.") : " Nothing is charged."}`;
}

/** What cancelling did, from the API's answer. */
export function cancelAfter(out: Row, depositPaid: boolean): string {
  if (out.deposit_kept) return "It was past the free cancellation time, so the business keeps the deposit.";
  return depositPaid ? "Your deposit is being returned to the card or account you paid with." : "The time has been released and nothing is owed.";
}

export const PROBLEMS: [string, string][] = [["quality", "The result was not what was agreed"], ["charged", "I was charged the wrong amount"], ["no_show", "The professional did not show up"], ["conduct", "How I was treated"], ["other", "Something else"]];

/** Where a reported problem stands, in plain words. */
export function problemState(p: Row, business: string, currency: string): string {
  const note = String(p.decision_note ?? "").trim();
  const said = note ? ` LogaLuxe wrote: "${note}"` : "";
  const back = Number(p.outcome_cents) || 0;
  if (p.status === "with_business") return `It is with ${business}, which has 48 hours to give its side. Then LogaLuxe decides and emails you.`;
  if (p.status === "needs_decision") return "LogaLuxe is deciding. We will email you the decision.";
  if (p.status === "out_of_scope") return `Decided: this is not something LogaLuxe can rule on.${said}`;
  const what = p.outcome === "decline" ? "no refund" : back > 0 ? `${money(back, currency)} ${p.outcome === "credit" ? "in credit" : "refunded"} to you` : p.outcome === "full" ? "a full refund" : p.outcome === "partial" ? "a part refund" : p.outcome === "credit" ? "credit to you" : "";
  return `Decided${what ? `: ${what}` : ""}.${said}`;
}

/** The tips offered for a visit: 15, 20 and 25 percent, rounded to whole dollars or the nearest 100 naira. */
export function tipChoices(totalCents: number, currency: string) {
  const ngn = currency === "NGN";
  const floor = ngn ? 20000 : 100, step = ngn ? 10000 : 100;
  const choices = [15, 20, 25]
    .map((pct) => ({ pct, cents: Math.round((totalCents * pct) / 100 / step) * step }))
    .filter((c, i, all) => c.cents >= floor && c.cents <= totalCents && all.findIndex((x) => x.cents === c.cents) === i);
  return { floor, choices };
}

// ---------- days, as YYYY-MM-DD in the business's zone ----------

export const today = (tz?: string) => ymd(new Date(), tz);
export const addDays = (date: string, n: number) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const noon = (date: string) => new Date(date + "T12:00:00Z");
export const dow = (date: string) => noon(date).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
export const monthName = (date: string) => noon(date).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
export const weekdayName = (date: string) => noon(date).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
/** "Sat 10 Oct" for a calendar date. */
export const dateShort = (date: string) => dayShort(noon(date), "UTC");
/** How long ago, for a list of conversations: a time today, a weekday this week, else a date. */
export function ago(iso: string, tz?: string): string {
  const d = new Date(iso), days = (Date.now() - d.getTime()) / 864e5;
  if (ymd(d, tz) === today(tz)) return clock(d, tz);
  return days < 6 ? dayShort(d, tz).split(" ")[0] : dayMonth(iso, tz);
}

// ---------- leaving the app for a moment ----------

/** Opens a payment page in the in-app browser. On a phone it answers when the person comes back. */
export const openPay = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
/** The calendar file the API writes for a booking. The phone offers to add it to its calendar. */
export const openCalendar = (id: string) => Linking.openURL(`${API_URL}/v1/bookings/${id}/calendar.ics`);
export const openMap = (address: string) => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);

/** Runs `fn` each time the screen comes back into view, but not the first time it opens. */
export function useRefocus(fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    ref.current();
  }, []));
}

/** Runs `fn` when the app comes back to the front, for example from a payment page. */
export function useReturn(fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") ref.current(); });
    return () => sub.remove();
  }, []);
}

export { plural };
