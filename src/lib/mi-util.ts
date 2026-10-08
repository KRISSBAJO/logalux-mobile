// Helpers for the settings and pricing-tool screens (Settings, Security, Packages, Memberships,
// Pricing rules, Questions, Rooms, Waitlist). The wording follows the web's Settings and Services pages.
import type { Row } from "./api";
import { DAYS, DAY_SHORT, clock12, dateOnly, type Day, type Hours } from "./mc-util";

export type Flash = { kind: "ok" | "bad"; text: string } | null;

export const CATEGORIES: [string, string][] = [["braids", "Braids & locs"], ["hair", "Hair"], ["barber", "Barber"], ["nails", "Nails"], ["lashes", "Lashes & brows"], ["skin", "Skin"], ["makeup", "Makeup"], ["spa", "Spa"]];
export const LEVELS: [string, string][] = [["", "Any level"], ["junior", "Junior"], ["senior", "Senior"], ["master", "Master"]];
export const STATUS: Record<string, string> = { live: "Live", paused: "Paused", pending: "In review", suspended: "Suspended" };

export const isOpen = (v: unknown): v is string[] => Array.isArray(v) && v.length === 2;

/** Days in a row with the same hours are grouped: "Tue and Wed 9:00 AM to 6:00 PM · Sat 8:00 AM to 6:00 PM". */
export function hoursLine(hours: Hours | null | undefined): string {
  const out: string[] = [];
  let start = -1, cur = "";
  const flush = (end: number) => {
    if (start === 0 && end === 6 && cur) out.push(`Every day ${cur}`);
    else if (start >= 0 && cur) out.push(`${DAY_SHORT[DAYS[start]]}${end > start + 1 ? ` to ${DAY_SHORT[DAYS[end]]}` : end > start ? ` and ${DAY_SHORT[DAYS[end]]}` : ""} ${cur}`);
  };
  DAYS.forEach((d, i) => {
    const h = hours?.[d];
    const text = isOpen(h) ? `${clock12(h[0])} to ${clock12(h[1])}` : "";
    if (text !== cur) { flush(i - 1); start = i; cur = text; }
  });
  flush(DAYS.length - 1);
  return out.join(" · ");
}

/** The open days of a location in the shape the API takes: closed days are left out. */
export function openHours(hours: Hours | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const d of DAYS) { const v = hours?.[d]; if (isOpen(v)) out[d] = [v[0], v[1]]; }
  return out;
}

/** A location in the shape PUT /locations/{id} takes, with some of it changed. */
export const locationBody = (l: Row, change: Row = {}) => ({ name: l.name, address: l.address ?? "", city: l.city ?? "", region: l.region ?? "", arrival_notes: l.arrival_notes ?? "", hours: openHours(l.hours as Hours), ...change });

/** The business profile in the shape PUT /settings/profile takes, with some of it changed. */
export const profileBody = (b: Row, change: Row = {}) => ({ name: b.name, category: b.category, phone: b.phone ?? "", email: b.email ?? "", about: b.about ?? "", timezone: b.timezone, sales_tax_pct: Number(b.sales_tax_bp ?? 0) / 100, ...change });

/**
 * Which field an API sentence is about. `rules` pairs a pattern with a field name; the first that
 * matches wins. Answers "" when the sentence is about the whole form.
 */
export function fieldOf(message: string, rules: [RegExp, string][]): string {
  for (const [re, key] of rules) if (re.test(message)) return key;
  return "";
}

// ---------- time zones ----------

const COMMON = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Africa/Lagos"];
/** Every time zone the phone knows, or the ones LogaLuxe's two markets use when it cannot say. The current one is always there. */
export function timeZones(current: string): string[] {
  let all: string[] = [];
  try { all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { all = []; }
  if (!all.length) all = COMMON;
  // The current one first, then the zones of the two markets, then the rest: the likely ones need no searching.
  const first = [current, ...COMMON].filter((z, i, a) => !!z && a.indexOf(z) === i);
  return [...first, ...all.filter((z) => !first.includes(z))];
}
export const zoneName = (z: string) => z.replace(/_/g, " ");
/** "2:14 PM" right now in a zone, to help choose the right one. */
export function nowIn(zone: string): string {
  try { return new Date().toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }); } catch { return ""; }
}

// ---------- pricing rules ----------

export const daysText = (days: string[] | null | undefined) => (!days?.length || days.length === 7 ? "Every day" : DAYS.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d as Day]).join(", "));
export const timeText = (r: Row) => (r.from_time && r.to_time ? `${clock12(r.from_time)} to ${clock12(r.to_time)}` : r.from_time ? `from ${clock12(r.from_time)}` : r.to_time ? `until ${clock12(r.to_time)}` : "All day");
export const datesText = (r: Row) => (r.starts_on && r.ends_on ? `${dateOnly(r.starts_on)} to ${dateOnly(r.ends_on)}` : r.starts_on ? `from ${dateOnly(r.starts_on)}` : r.ends_on ? `until ${dateOnly(r.ends_on)}` : "Always");
export const day10 = (v: unknown) => (v ? String(v).slice(0, 10) : "");

/** A saved rule in the shape the API takes, with some of it changed. */
export const ruleBody = (r: Row, change: Row = {}) => ({
  name: r.name, service_id: r.service_id ?? "", days: r.days ?? [], from_time: r.from_time ?? "", to_time: r.to_time ?? "", level: r.level ?? "",
  starts_on: day10(r.starts_on), ends_on: day10(r.ends_on), adjust_kind: r.adjust_kind, adjust_value: r.adjust_value, active: !!r.active, ...change,
});

// ---------- packages and memberships ----------

/** A saved package or membership in the shape the API takes, with some of it changed. */
export function planBody(p: Row, pkg: boolean, change: Row = {}) {
  const base = { name: p.name, description: p.description ?? "", price_cents: p.price_cents, items: ((p.items ?? []) as Row[]).map((i) => ({ service_id: i.service_id, qty: i.qty })), active: !!p.active };
  return pkg ? { ...base, valid_days: p.valid_days, ...change } : { ...base, service_discount_pct: p.service_discount_pct, retail_discount_pct: p.retail_discount_pct, ...change };
}
export const HOLD: Record<string, [string, "ok" | "wine" | "grey"]> = { active: ["Active", "ok"], past_due: ["Owing", "wine"], cancelled: ["Cancelled", "grey"], expired: ["Expired", "grey"] };

// ---------- questions at booking ----------

export const KINDS: [string, string, string][] = [
  ["text", "Short answer", "The client types a few words."],
  ["yesno", "Yes or no", "The client picks yes or no."],
  ["choice", "Choose one", "The client picks one of your options."],
  ["consent", "Must tick", "A box the client has to tick to book."],
];
export const KIND_NAME: Record<string, string> = Object.fromEntries(KINDS.map(([k, n]) => [k, n]));
export const MOST_QUESTIONS = 20;
/** A saved question in the shape the API takes, with some of it changed. */
export const questionBody = (q: Row, change: Row = {}) => ({ service_id: q.service_id ?? "", label: q.label, kind: q.kind, options: q.options ?? [], required: !!q.required, sort: Number(q.sort) || 0, active: !!q.active, ...change });

export const cut = (text: string, n = 60) => (text.length > n ? text.slice(0, n - 1).trimEnd() + "…" : text);

// ---------- calendar days ----------

/** The weeks of a month as YYYY-MM-DD strings, Monday first; days outside the month are "". */
export function monthGrid(month: string): string[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: string[] = Array.from({ length: lead }, () => "");
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push("");
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
/** "October 2026" */
export const monthName = (month: string) => new Date(month + "-01T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });

/** "HH:MM" for a time of day in a zone, rounded down to the half hour. */
export function halfHourNow(tz?: string): string {
  let h = new Date().getHours(), min = new Date().getMinutes();
  try {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
    h = p[0] % 24; min = p[1];
  } catch { /* a zone this phone does not know */ }
  return `${String(h).padStart(2, "0")}:${min < 30 ? "00" : "30"}`;
}
