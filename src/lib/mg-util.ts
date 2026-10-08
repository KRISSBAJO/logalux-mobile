// Words and sums for the "Grow" screens: marketing, promo codes, loyalty and new clients from LogaLuxe.
// They follow the web's Marketing tool so both say the same thing about the same numbers.
import type { Row } from "./api";
import { firstName, money } from "./format";

export type Size = { total: number; email: number; phone: number };
export const NO_SIZE: Size = { total: 0, email: 0, phone: 0 };

export const AUDIENCES: [string, string][] = [["all", "All clients"], ["new", "New in the last 30 days"], ["regulars", "Regulars, 3 or more visits"], ["lapsed", "Lapsed, no visit in 60 days"], ["birthday", "Birthday this month"]];
export const AUDIENCE_LABEL: Record<string, string> = Object.fromEntries(AUDIENCES);
/** Email first on the phone: it is the only channel that can really deliver. */
export const CHANNELS: [string, string][] = [["email", "Email"], ["whatsapp", "WhatsApp"], ["sms", "SMS"]];
export const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHANNELS);

/** Automations tied to one booking: these know the time of the visit and who is doing it. */
export const BOOKING_KEYS = new Set(["confirmation", "reminder_24h", "reminder_2h", "review_request"]);

/** A whole number with thousands separators. */
export const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-US");
/** A share as a whole percentage, 0 when there is nothing to divide by. */
export const pct = (part: unknown, whole: unknown) => (Number(whole) > 0 ? Math.round((Number(part) / Number(whole)) * 100) : 0);
/** "12.5" for a share with at most one decimal. */
export const pct1 = (part: number, whole: number) => (whole > 0 ? ((part / whole) * 100).toFixed(1).replace(/\.0$/, "") : "0");

/** The same replacement the server makes when it sends: {first name} and friends. */
export const fill = (tpl: string, v: Record<string, string>) => Object.entries(v).reduce((t, [k, val]) => t.split(`{${k}}`).join(val), tpl);

/** The placeholders a message may use, and what each becomes. */
export const tokensFor = (booking: boolean): [string, string][] => [
  ["first name", "The client's first name"],
  ["last service", booking ? "The service they booked" : "The service they had last"],
  ["booking link", "The address of your booking page"],
  ["business", "The name of your business"],
  ...(booking ? ([["staff", "Who is looking after them"], ["time", "The day and time of the visit"]] as [string, string][]) : []),
];

/** What the preview fills in. These are the values the server uses for a test message. */
export function sampleFor(merchant: Row | null, link: string, booking: boolean): Record<string, string> {
  const mine = firstName(String(merchant?.name ?? "")) || "there";
  return { "first name": mine, "last service": "your last service", "booking link": link, staff: booking ? mine : "the team", business: String(merchant?.business ?? ""), time: booking ? "Saturday at 10:00" : "" };
}

/** How many of an automation's messages went out in 30 days, in the web's words. */
export function sentStat(sent: number, delivered: number): string {
  const logged = Math.max(0, sent - delivered);
  if (!sent) return "None in 30 days";
  if (!logged) return `${delivered} delivered`;
  if (!delivered) return `${logged} logged, not delivered`;
  return `${delivered} delivered · ${logged} logged`;
}

export const campaignTag = (status: string): { text: string; kind: "grey" | "gold" | "ok" } =>
  status === "draft" ? { text: "Draft", kind: "grey" } : status === "sending" ? { text: "Sending", kind: "gold" } : { text: "Sent", kind: "ok" };

// ---------- promo codes ----------

export type PromoState = "On" | "Off" | "Ended" | "Not started" | "Used up";
export function promoState(p: Row, now = Date.now()): PromoState {
  if (!p.active) return "Off";
  if (p.ends_at && Date.parse(p.ends_at) < now) return "Ended";
  if (p.starts_at && Date.parse(p.starts_at) > now) return "Not started";
  if (p.max_uses !== null && p.max_uses !== undefined && Number(p.used) >= Number(p.max_uses)) return "Used up";
  return "On";
}
export const PROMO_TONE: Record<PromoState, "ok" | "grey" | "gold"> = { On: "ok", Off: "grey", Ended: "grey", "Not started": "gold", "Used up": "grey" };
export const promoWhat = (p: Row, currency: string) => (p.kind === "percent" ? `${p.value}% off` : `${money(p.value, currency)} off`);

// ---------- new clients from LogaLuxe ----------

export const LEAD_SOURCE: Record<string, string> = { search: "LogaLuxe search", marketplace: "LogaLuxe marketplace", app: "LogaLuxe app", category: "A category page" };

/** The fee on a first visit: a share of its value, held at the cap when there is one. */
export function feeOf(valueCents: number, ratePct: number, capCents: number | null): number {
  const fee = Math.round((valueCents * ratePct) / 100);
  return capCents !== null && fee > capCents ? capCents : fee;
}

export type LeadTone = "ok" | "gold" | "grey";
/** How a lead stands and why, as the web words it. */
export function leadStatus(l: Row): { label: string; tone: LeadTone; note: string } {
  switch (l.status) {
    case "pending": return { label: "Visit to come", tone: "gold", note: "Charged only when the visit is paid for" };
    case "charged": return { label: "Charged", tone: "ok", note: l.resolved_at ? `Dispute looked at, charge stands${l.resolution_note ? `: ${l.resolution_note}` : ""}` : "" };
    case "void": return { label: "No charge", tone: "grey", note: l.void_reason || (l.booking_status === "no_show" ? "The client did not come" : String(l.booking_status ?? "").startsWith("cancelled") ? "The booking was cancelled" : "") };
    case "disputed": return { label: "Disputed", tone: "gold", note: "The LogaLuxe team is checking it" };
    case "refunded": return { label: "Refunded", tone: "ok", note: l.resolution_note ? `Fee returned: ${l.resolution_note}` : "The fee was returned to your balance" };
    default: return { label: String(l.status ?? ""), tone: "grey", note: "" };
  }
}
/** Was a fee really taken for this lead (even if it is now disputed or was returned)? */
export const leadCharged = (l: Row) => l.status === "charged" || l.status === "disputed" || l.status === "refunded";
/** What a visit still to come would cost, from the terms the lead was opened on. */
export const leadEstimate = (l: Row) => feeOf(Number(l.value_cents ?? 0), Number(l.base_pct ?? 0) + Number(l.boost_pct ?? 0), l.cap_cents === null || l.cap_cents === undefined ? null : Number(l.cap_cents));

/** "5×", "2.4×": how many times over the fees were earned back. */
export const multipleOf = (revenueCents: number, feeCents: number) => {
  const x = feeCents > 0 ? revenueCents / feeCents : 0;
  return x > 0 ? `${x >= 10 ? Math.round(x) : x.toFixed(1).replace(/\.0$/, "")}×` : "";
};

// ---------- loyalty ----------

export const POINT_REASON: Record<string, string> = { earn: "Earned at checkout", redeem: "Spent at checkout", adjust: "Changed by hand" };
export type Rules = { enabled: boolean; earn_points: number; per_cents: number; point_value_cents: number; min_redeem: number };

// ---------- days typed or picked, as YYYY-MM-DD ----------

export const monthTitle = (ym: string) => new Date(ym + "-15T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
export const addMonths = (ym: string, by: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 15)); return d.toISOString().slice(0, 7); };
/** The days of a month laid out in weeks that start on Monday; empty cells are "". */
export function monthCells(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array.from({ length: lead }, () => ""), ...Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push("");
  return cells;
}
