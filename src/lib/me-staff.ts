// The team: helpers shared by the Staff & chairs screens (the roster, time off, pay, chair rental, sign-ins).
// They follow the web's Staff & rosters tool, so both say the same thing about the same person.
import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { Platform } from "react-native";
import { API_URL, ApiError, type Row } from "./api";
import { DAYS, DAY_SHORT, clock12, dateOnly, shareText, signedIn, type Day } from "./mc-util";
import { addDays, mins, mondayOf } from "./mb-util";
import { ymd } from "./format";
import { useSession } from "./session";
import { useLoad } from "./use-load";

export { DAYS, DAY_SHORT, type Day };

export const ROLE: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Team member" };
export const LEVELS: [string, string][] = [["junior", "Junior"], ["senior", "Senior"], ["master", "Master"]];
export const PAY: Record<string, string> = { commission: "Commission only", hourly: "Hourly + commission", salary: "Salary + commission", owner: "Owner", renter: "Chair renter" };
export const PAY_SUB: Record<string, string> = {
  commission: "A share of what they sell, and their tips",
  hourly: "A rate for rostered hours, plus commission",
  salary: "A monthly amount counted by the day, plus commission",
  owner: "Takes what is left, so no commission is counted",
  renter: "Rents a chair and runs their own book",
};
export const PERMS: [string, string, string][] = [
  ["see_all_calendars", "See other staff's calendars", "Off shows them only their own bookings"],
  ["take_payments", "Take payments and refunds", "Checkout at the end of a visit"],
  ["see_reports", "See reports and payroll", "Sales and the team's numbers"],
];
export const METHOD: Record<string, string> = { cash: "Cash", transfer: "Bank transfer", card: "Card", other: "Other" };
export const ROLE_CAN: [string, string, string][] = [
  ["owner", "Owner", "Everything, including money, payouts, the plan and who can sign in"],
  ["manager", "Manager", "Everything except money, payouts, the plan and inviting people"],
  ["staff", "Team member", "Calendar, clients, checkout, inbox, the menu and the roster. No marketing, reports, stock or settings"],
];
/** Colours a person can have on the calendar. Their own is added when it is not one of these. */
export const TONES = ["#7A1F2B", "#2E2538", "#1F2A33", "#4A3426", "#5A4A3A", "#2A3A33", "#3A3A2E", "#4A2A2A", "#1F4B7A", "#1F6B3A", "#7A5A12", "#9A8E85"];

export type WeekHours = Partial<Record<Day, string[] | null>>;
export type Team = { staff: Row[]; location_hours: WeekHours | null; time_off: Row[]; services: Row[]; week: string; rent: Row[]; permission_defaults: Record<string, boolean> };

const rank: Record<string, number> = { staff: 1, manager: 2, owner: 3 };
export const atLeast = (merchant: Row | null | undefined, role: "manager" | "owner") => !!merchant && (rank[merchant.role] ?? 0) >= rank[role];

export const day10 = (v: unknown) => String(v ?? "").slice(0, 10);
export const isRenter = (p: Row) => p.pay_type === "renter";
/** The week a person works: their own, or the location's when they have none. */
export const hoursOf = (p: Row, loc: WeekHours | null | undefined): WeekHours => ((p.hours ?? loc ?? {}) as WeekHours);
export const shiftOf = (p: Row, loc: WeekHours | null | undefined, day: Day): [string, string] | null => {
  const h = hoursOf(p, loc)[day];
  return Array.isArray(h) && h.length === 2 ? [h[0], h[1]] : null;
};
export const breaksOf = (p: Row, day: Day): [string, string][] => ((((p.breaks ?? {}) as Record<string, string[][]>)[day] ?? []).filter((b) => b.length === 2) as [string, string][]);
/** The time off that covers a day, in a given state. */
export const offOn = (timeOff: Row[], p: Row, day: string, status: string) => timeOff.find((o) => o.staff_id === p.id && o.status === status && day10(o.starts_on) <= day && day <= day10(o.ends_on));
/** "mon"… for a YYYY-MM-DD day. */
export const dayKey = (day: string): Day => DAYS[(new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7];
export const weekDays = (monday: string) => DAYS.map((_, i) => addDays(monday, i));

/** Minutes a person is rostered in a week, without breaks or approved time off. */
export function rostered(p: Row, team: Pick<Team, "location_hours" | "time_off">, monday: string): number {
  return DAYS.reduce((a, d, i) => {
    const h = shiftOf(p, team.location_hours, d);
    if (!h || offOn(team.time_off, p, addDays(monday, i), "approved")) return a;
    const brk = breaksOf(p, d).reduce((x, b) => x + Math.max(0, mins(b[1]) - mins(b[0])), 0);
    return a + Math.max(0, mins(h[1]) - mins(h[0]) - brk);
  }, 0);
}

const joinDays = (idx: number[]) => {
  if (!idx.length) return "";
  if (idx.length === 7) return "Every day";
  const run = idx[idx.length - 1] - idx[0] === idx.length - 1;
  if (idx.length === 1) return DAY_SHORT[DAYS[idx[0]]];
  return run && idx.length > 2 ? `${DAY_SHORT[DAYS[idx[0]]]} to ${DAY_SHORT[DAYS[idx[idx.length - 1]]]}` : idx.map((i) => DAY_SHORT[DAYS[i]]).join(", ");
};
/** "Tue to Sat", "Mon, Wed, Fri", or "No working days". */
export const pattern = (p: Row, loc: WeekHours | null | undefined) => joinDays(DAYS.map((d, i) => (shiftOf(p, loc, d) ? i : -1)).filter((i) => i >= 0)) || "No working days";
/** The days a renter has the chair: "Tue to Thu", or "no days set". */
export const rentDays = (p: Row) => joinDays(DAYS.map((d, i) => (((p.rent_days ?? []) as string[]).includes(d) ? i : -1)).filter((i) => i >= 0)) || "no days set";
export const owed = (rent: Row[], p: Row) => rent.filter((x) => x.staff_id === p.id && x.status === "due").reduce((a, x) => a + Number(x.amount_cents ?? 0), 0);

export type TagKind = "ok" | "gold" | "grey" | "wine";
/** Where a person stands today, as the web's roster cards say it. */
export function stateOf(p: Row, team: Pick<Team, "time_off" | "location_hours">, today: string): [string, TagKind] {
  if (p.archived) return ["Left the team", "grey"];
  if (isRenter(p)) return ["Renter", "grey"];
  if (offOn(team.time_off, p, today, "approved")) return ["Off today", "wine"];
  if (team.time_off.some((o) => o.staff_id === p.id && o.status === "requested")) return ["Time off requested", "gold"];
  if (!p.bookable) return ["Not bookable", "grey"];
  return shiftOf(p, team.location_hours, dayKey(today)) ? ["Working today", "ok"] : ["Day off", "grey"];
}
/** True when a person is at work on a day: rostered, on the team, and not on approved time off. */
export const worksOn = (p: Row, team: Pick<Team, "time_off" | "location_hours">, day: string) =>
  !p.archived && !isRenter(p) && !!shiftOf(p, team.location_hours, dayKey(day)) && !offOn(team.time_off, p, day, "approved");

export const span12 = (h: [string, string] | string[]) => `${clock12(h[0])} to ${clock12(h[1])}`;
/** "Fri 9 Oct", or "Fri 9 Oct to Sun 11 Oct". */
export const offSpan = (o: Row) => dateOnly(o.starts_on) + (day10(o.ends_on) !== day10(o.starts_on) ? ` to ${dateOnly(o.ends_on)}` : "");
export const offDays = (o: Row) => Math.round((Date.parse(day10(o.ends_on)) - Date.parse(day10(o.starts_on))) / 864e5) + 1;
export const OFF_STATUS: Record<string, [string, TagKind]> = { approved: ["Approved", "ok"], requested: ["Requested", "gold"], declined: ["Declined", "grey"] };
export const RENT_STATUS: Record<string, [string, TagKind]> = { due: ["Owing", "wine"], paid: ["Paid", "ok"], waived: ["Waived", "grey"] };

/** "1 h 30 min", or "0 h" for nothing: hours on a roster. */
export const dur = (m: number) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h && r ? `${h} h ${r} min` : h ? `${h} h` : r ? `${r} min` : "0 h"; };
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** A quarter of an hour earlier or later, kept inside the day. */
export const shift15 = (hhmm: string, up: boolean) => {
  const m = Math.max(0, Math.min(23 * 60 + 45, (Math.round(mins(hhmm) / 15) + (up ? 1 : -1)) * 15));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * A person in the shape PUT /staff/{id} takes. The API rewrites the name, role, level, contact details and
 * commission on every save, so they are always sent back; pay, breaks, rent and permissions are only
 * changed when given, and hours are kept unless `hours` or `use_location_hours` is sent.
 */
export function staffBody(p: Row, change: Record<string, unknown> = {}) {
  return {
    name: p.name, role: p.role, level: p.level, tone: p.tone, bookable: !!p.bookable, email: p.email ?? "", phone: p.phone ?? "",
    commission_pct: Number(p.commission_pct ?? 0), retail_commission_pct: Number(p.retail_commission_pct ?? 0),
    ...change,
  };
}

/** A saved service in the shape PUT /services/{id} takes, with one person's own price changed. */
export function serviceBodyWithPrice(sv: Row, staffId: string, price: number | null) {
  const staff = (sv.staff ?? []) as Row[];
  const prices: Record<string, number | null> = Object.fromEntries(staff.map((x) => [String(x.staff_id), (x.price_cents ?? null) as number | null]));
  prices[staffId] = price;
  return {
    name: sv.name, category: sv.category, description: sv.description,
    duration_min: sv.duration_min, processing_min: sv.processing_min, buffer_min: sv.buffer_min,
    price_cents: sv.price_cents, deposit_cents: sv.deposit_cents, online: sv.online,
    staff_ids: Object.keys(prices), staff_prices: prices,
  };
}

/** The team as GET /staff answers it, read again whenever the screen comes back into view. */
export function useTeam(week?: string) {
  const s = useSession();
  const load = useLoad<Team>(signedIn(s, () => s.mapi<Team>("/staff" + (week ? `?week=${week}` : ""))), [s.businessToken, week, s.merchant?.business_id]);
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!s.businessToken) return;
    if (seen.current) void load.refresh();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));
  const tz = s.merchant?.timezone as string | undefined;
  const today = ymd(new Date(), tz);
  return { ...load, s, tz, today, monday: mondayOf(today), cur: (s.merchant?.currency as string) ?? "USD", manager: atLeast(s.merchant, "manager"), owner: atLeast(s.merchant, "owner"), mine: String(s.merchant?.staff_id ?? "") };
}

/** What happened to a time-off request that was approved with its bookings moved. */
export function reassignedText(out: Row): string {
  const moved = Number(out.moved ?? 0), left = Number(out.left ?? 0);
  if (!moved && !left) return "Time off approved. There were no bookings to move.";
  const a = moved ? `${moved} ${moved === 1 ? "booking was" : "bookings were"} moved to other team members` : "No booking could be moved";
  const b = left ? `${left} still ${left === 1 ? "needs" : "need"} you: open the calendar to move or cancel ${left === 1 ? "it" : "them"}` : "none are left over";
  return `Time off approved. ${a}, ${b}.`;
}

/** What to say after an invite, worded as the web words it. */
export function invitedText(out: Row, email: string, manager: boolean, change: boolean): string {
  if (change) return `Sign-in updated. ${email} now signs in as a ${manager ? "manager" : "team member"}.`;
  if (!out.new_account) return `${email} already has a LogaLuxe account. It can open this business now with its own password. No email was sent.`;
  return out.mail_mode && out.mail_mode !== "log"
    ? `Sign-in created. We emailed ${email} a link to choose a password. It works for 7 days.`
    : `Sign-in created for ${email}. Email is not set up on this server, so the link was written to the log and not sent.`;
}

/**
 * The payroll as a spreadsheet file (GET /payroll?format=csv). In a browser it is downloaded; on a phone the
 * rows are handed to the share sheet as text, because the app has no file storage to attach a file from.
 */
export async function exportPayroll(token: string | null, from: string, to: string): Promise<"downloaded" | "shared" | "copied" | "failed"> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/m/payroll?format=csv&from=${from}&to=${to}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, "We could not reach LogaLuxe. Check your connection and try again.");
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = "The export failed.";
    try { msg = String(JSON.parse(text).error ?? msg); } catch { /* not JSON */ }
    throw new ApiError(res.status, msg[0].toUpperCase() + msg.slice(1) + (/[.!?]$/.test(msg) ? "" : "."));
  }
  if (Platform.OS === "web") {
    const g = globalThis as unknown as { document?: Document; URL: typeof URL; Blob: typeof Blob };
    if (!g.document) return "failed";
    const url = g.URL.createObjectURL(new g.Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = g.document.createElement("a");
    a.href = url; a.download = `payroll-${from}-to-${to}.csv`;
    g.document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => g.URL.revokeObjectURL(url), 2000);
    return "downloaded";
  }
  const out = await shareText(text.replace(/^﻿/, ""));
  return out === "shared" ? "shared" : out === "copied" ? "copied" : "failed";
}

// ---------- periods for pay ----------

const monthStart = (day: string) => day.slice(0, 8) + "01";
export type Period = { key: string; name: string; from: string; to: string };
/** The periods offered on the pay screen, ending today at the latest. */
export function periods(today: string): Period[] {
  const thisMonth = monthStart(today);
  const lastMonthEnd = addDays(thisMonth, -1), lastMonth = monthStart(lastMonthEnd);
  const monday = mondayOf(today);
  return [
    { key: "month", name: "This month", from: thisMonth, to: today },
    { key: "last-month", name: "Last month", from: lastMonth, to: lastMonthEnd },
    { key: "week", name: "This week", from: monday, to: today },
    { key: "last-week", name: "Last week", from: addDays(monday, -7), to: addDays(monday, -1) },
  ];
}
