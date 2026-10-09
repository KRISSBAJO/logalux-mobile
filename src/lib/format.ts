// Money and time, written the way the web app writes them.
// Every time is shown in the business's own time zone, never the phone's.

export function money(cents: number | null | undefined, currency = "USD"): string {
  const n = Number(cents ?? 0) / 100;
  const whole = Math.abs(n % 1) < 0.005;
  const digits = whole ? 0 : 2;
  const body = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = n < 0 ? "-" : "";
  return currency === "NGN" ? `${sign}₦${body}` : currency === "USD" ? `${sign}$${body}` : `${sign}${body} ${currency}`;
}

const fmt = (iso: string | Date, timeZone: string | undefined, o: Intl.DateTimeFormatOptions) => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString("en-US", { timeZone, ...o });
  } catch {
    return d.toLocaleString("en-US", o); // a zone this phone does not know
  }
};

/** "9:30 AM" */
export const clock = (iso: string | Date, tz?: string) => fmt(iso, tz, { hour: "numeric", minute: "2-digit" });
/** "Thu 8 Oct" */
export const dayShort = (iso: string | Date, tz?: string) => {
  const p = fmt(iso, tz, { weekday: "short", day: "numeric", month: "short" }); // "Thu, Oct 8"
  const m = p.match(/^(\w+), (\w+) (\d+)$/);
  return m ? `${m[1]} ${m[3]} ${m[2]}` : p;
};
/** "Thursday 8 October" */
export const dayLong = (iso: string | Date, tz?: string) => {
  const p = fmt(iso, tz, { weekday: "long", day: "numeric", month: "long" });
  const m = p.match(/^(\w+), (\w+) (\d+)$/);
  return m ? `${m[1]} ${m[3]} ${m[2]}` : p;
};
/** "Thu 8 Oct · 9:30 AM" */
export const when = (iso: string | Date, tz?: string) => `${dayShort(iso, tz)} · ${clock(iso, tz)}`;
/** The calendar date in a zone, as YYYY-MM-DD. */
export const ymd = (d: Date, tz?: string) => fmt(d, tz, { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/^(\d+)\/(\d+)\/(\d+)$/, "$3-$1-$2");

/** "45 min", "1 h", "3 h 30 min" */
export function duration(mins: number): string {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
export const firstName = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] ?? "";
