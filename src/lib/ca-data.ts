// What Home, Search and a professional's page share: the category list, the shapes the API answers
// with, and the small pieces of arithmetic on hours and openings.
import { api, qs, type Row } from "./api";
import { clock, ymd } from "./format";

/** Category id as the API knows it and its name, the same list the web search uses. */
export const CATEGORIES: [string, string][] = [["hair", "Hair"], ["braids", "Braids & locs"], ["barber", "Barber"], ["nails", "Nails"], ["lashes", "Lashes & brows"], ["skin", "Skin"], ["makeup", "Makeup"], ["spa", "Spa"]];
export const categoryLabel = (id?: string | null) => CATEGORIES.find(([c]) => c === id)?.[1] ?? "";

/** How a visitor reached a business. Only these are counted as leads by the API. */
export const SOURCES = ["search", "marketplace", "category", "app"];
export const cleanSrc = (v: unknown) => (typeof v === "string" && SOURCES.includes(v) ? v : "");

export type Hours = Record<string, [string, string] | null>;
/** A business as a search result carries it. */
export type Biz = {
  id: string; slug: string; name: string; tagline?: string; category?: string; market?: string; currency: string; timezone: string;
  rating: number; review_count: number; verification_status?: string; tone?: string | null; area?: string | null; city?: string | null;
  hours?: Hours | null; from_cents?: number | null; promoted?: boolean; highlights?: string[] | null;
};
export type Slot = { time: string; starts_at: string; staff_id: string; staff: string; price_cents: number };
export type Opening = { service_id: string; service: string; slots: Slot[] };
export type Openings = Record<string, Opening>;

/** The next free times of several businesses in one call (24 at most). Never throws: a card without times is still a card. */
export async function loadOpenings(slugs: string[], q = ""): Promise<Openings> {
  if (!slugs.length) return {};
  try {
    return (await api<{ openings: Openings }>(`/openings${qs({ slugs: slugs.slice(0, 24).join(","), q })}`)).openings ?? {};
  } catch {
    return {};
  }
}

/** The first uploaded photo of each business, by slug. Never throws. */
export async function loadCovers(): Promise<Record<string, string>> {
  try {
    const out: Record<string, string> = {};
    for (const m of (await api<{ media: Row[] }>("/site/media?slot=business")).media ?? []) if (m.ref && !out[m.ref]) out[m.ref] = m.id;
    return out;
  } catch {
    return {};
  }
}

/** A free time as a short label on the business's own clock: "Today 12:30 PM", "Tomorrow 9:00 AM", "Sat 10:00 AM". */
export function slotLabel(startsAt: string, tz: string) {
  const d = new Date(startsAt);
  const day = ymd(d, tz), today = ymd(new Date(), tz), tomorrow = ymd(new Date(Date.now() + 86400000), tz);
  let name: string;
  if (day === today) name = "Today";
  else if (day === tomorrow) name = "Tomorrow";
  else {
    const near = d.getTime() - Date.now() < 6 * 86400000;
    try {
      name = d.toLocaleString("en-US", near ? { timeZone: tz, weekday: "short" } : { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
    } catch {
      name = d.toLocaleString("en-US", { weekday: "short" });
    }
    const m = name.match(/^(\w+), (\w+) (\d+)$/); // "Sat, Oct 17" → "Sat 17 Oct"
    if (m) name = `${m[1]} ${m[3]} ${m[2]}`;
  }
  return `${name} ${clock(startsAt, tz)}`;
}

/** The address of the booking flow at one free time. */
export function bookAt(slug: string, serviceIds: string[], slot: Slot, tz: string, src = "") {
  return `/c/book/${slug}?services=${serviceIds.join(",")}&staff=${slot.staff_id}&date=${ymd(new Date(slot.starts_at), tz)}&time=${slot.time}${src ? `&src=${src}` : ""}`;
}

// ---------- hours ----------

const DAYS: [string, string, string][] = [["mon", "Mon", "Monday"], ["tue", "Tue", "Tuesday"], ["wed", "Wed", "Wednesday"], ["thu", "Thu", "Thursday"], ["fri", "Fri", "Friday"], ["sat", "Sat", "Saturday"], ["sun", "Sun", "Sunday"]];

/** A moment as the business's clock shows it. */
function inZone(at: Date, tz: string) {
  let p: Intl.DateTimeFormatPart[];
  const o: Intl.DateTimeFormatOptions = { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  try {
    p = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).formatToParts(at);
  } catch {
    p = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o }).formatToParts(at);
  }
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { time: `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`, weekday: g("weekday").toLowerCase().slice(0, 3) };
}

/** "09:00" → "9:00 AM", "19:30" → "7:30 PM": the way the rest of the app writes a time. */
export function hm(t: string) {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return t;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Open now · until 6:00 PM" or "Closed · opens Tue 9:00 AM", by the business's own clock. Null when it has no hours. */
export function openBadge(hours: Hours | null | undefined, tz: string): { open: boolean; text: string } | null {
  if (!hours) return null;
  const now = inZone(new Date(), tz);
  const at = DAYS.findIndex((d) => d[0] === now.weekday);
  if (at < 0) return null;
  const today = hours[DAYS[at][0]];
  if (today && now.time >= today[0] && now.time < today[1]) return { open: true, text: `Open now · until ${hm(today[1])}` };
  if (today && now.time < today[0]) return { open: false, text: `Closed · opens ${hm(today[0])}` };
  for (let i = 1; i <= 7; i++) {
    const d = DAYS[(at + i) % 7], h = hours[d[0]];
    if (h) return { open: false, text: `Closed · opens ${i === 1 ? "tomorrow" : d[1]} ${hm(h[0])}` };
  }
  return null;
}

/** The week's hours, with days that keep the same hours on one line. */
export function hourRows(hours: Hours | null | undefined): [string, string][] {
  if (!hours) return [];
  const groups: { key: string; days: number[] }[] = [];
  DAYS.forEach(([k], i) => {
    const h = hours[k];
    const key = h ? `${hm(h[0])} to ${hm(h[1])}` : "Closed";
    const g = groups.find((x) => x.key === key);
    if (g) g.days.push(i);
    else groups.push({ key, days: [i] });
  });
  const label = (d: number[]) => {
    if (d.length === 1) return DAYS[d[0]][2];
    const run = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
    return run && d.length > 2 ? `${DAYS[d[0]][1]} to ${DAYS[d[d.length - 1]][1]}` : d.map((x) => DAYS[x][1]).join(", ");
  };
  return [...groups.filter((g) => g.key !== "Closed"), ...groups.filter((g) => g.key === "Closed")].map((g) => [label(g.days), g.key]);
}

/** "Usually replies within 42 min", from the median time the business took to answer. "" when there is nothing to go on. */
export function replyLine(minutes: number | null | undefined) {
  const m = Number(minutes);
  if (minutes === null || minutes === undefined || !Number.isFinite(m) || m < 0) return "";
  if (m < 60) return `Usually replies within ${Math.max(1, Math.round(m))} min`;
  if (m < 1440) return `Usually replies within about ${Math.round(m / 60)} h`;
  const days = Math.round(m / 1440);
  return `Usually replies within about ${days} day${days === 1 ? "" : "s"}`;
}

/** What the business keeps when a client cancels late, in plain words. */
export function lateRule(fee: string | undefined, hasDeposit: boolean) {
  if (fee === "50") return "half the price is charged";
  if (fee === "100") return "the full price is charged";
  if (fee === "deposit") return hasDeposit ? "the deposit is kept" : "";
  return "";
}
