// The business's public page ("Profile & portfolio"): the words, switches and checks the web's
// Storefront tool uses, written once for the phone screens that edit them.
import { type Row } from "./api";
import { plural } from "./format";
import { DAYS, DAY_SHORT, clock12, type Hours } from "./mc-util";

export const CATEGORIES: [string, string][] = [["braids", "Braids & locs"], ["hair", "Hair"], ["barber", "Barber"], ["nails", "Nails"], ["lashes", "Lashes & brows"], ["skin", "Skin"], ["makeup", "Makeup"], ["spa", "Spa"]];
export const categoryName = (k: unknown) => CATEGORIES.find(([key]) => key === k)?.[1] ?? "";
export const HIGHLIGHT_IDEAS = ["Hair included", "Gentle on edges", "Walk-ins for take-downs", "Free parking", "Kids welcome", "LGBTQ+ friendly", "Women-owned", "English and Yoruba", "Card and Apple Pay", "Wi-Fi"];
/** Page colours to choose from on a phone, where there is no colour wheel. Any other #RRGGBB can be typed. */
export const TONES = ["#3B1D22", "#7A1F2B", "#4A2A2A", "#2E2538", "#1F3A3D", "#2F3B2A", "#5A4A3A", "#1A1513"];
export const TONE_RE = /^#[0-9a-f]{6}$/i;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,59}$/;
export const MAX_PHOTOS_HELD = 40;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type Display = { show_from: boolean; show_durations: boolean; show_staff: boolean; show_reviews: boolean; show_address: boolean; show_phone: boolean; open_badge: boolean; notice: string };

/**
 * The API replaces every text field of the page in one go (PUT /v1/m/storefront), so each small
 * save sends them all: the saved values with one change laid over them.
 */
export function pageBody(b: Row, change: Record<string, unknown> = {}, display?: Partial<Display>) {
  const tone = TONE_RE.test(String(b.tone ?? "")) ? String(b.tone) : "";
  return {
    name: String(b.name ?? ""), slug: String(b.slug ?? ""), tagline: String(b.tagline ?? ""), about: String(b.about ?? ""), category: String(b.category ?? ""),
    highlights: ((b.highlights ?? []) as string[]).slice(0, 6), instagram: String(b.instagram ?? ""), tiktok: String(b.tiktok ?? ""), website: String(b.website ?? ""), tone,
    ...change,
    ...(display ? { display } : {}),
  };
}

/** "Tue to Fri 9:00 AM to 6:00 PM · Sat 8:00 AM to 6:00 PM": days in a row with the same hours are grouped. */
export function hoursLine(hours: Hours | null | undefined): string {
  const out: string[] = [];
  let start = -1, cur = "";
  const flush = (end: number) => {
    if (start >= 0 && cur) out.push(`${DAY_SHORT[DAYS[start]]}${end > start + 1 ? ` to ${DAY_SHORT[DAYS[end]]}` : end > start ? ` and ${DAY_SHORT[DAYS[end]]}` : ""} ${cur}`);
  };
  DAYS.forEach((key, i) => {
    const h = hours?.[key];
    const text = Array.isArray(h) && h.length === 2 ? `${clock12(h[0])} to ${clock12(h[1])}` : "";
    if (text !== cur) { flush(i - 1); start = i; cur = text; }
  });
  flush(DAYS.length - 1);
  return out.join(" · ");
}

/** Is the business open at this moment, by its own hours and clock? null when it has no hours. */
export function openNow(hours: Hours | null | undefined, tz?: string): boolean | null {
  if (!hours) return null;
  let day = "", now = "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    day = get("weekday").toLowerCase();
    now = `${get("hour")}:${get("minute")}`;
  } catch {
    return null;
  }
  const today = (hours as Record<string, unknown>)[day];
  return Array.isArray(today) && today.length === 2 && now >= String(today[0]) && now < String(today[1]);
}

export type Check = { ok: boolean; title: string; fix?: string; go?: "words" | "highlights" | "photos" | "services" | "hours" | "reviews" | "social" };

/** "Being found": things that are true or not, counted. No score is made up. */
export function checks(d: Row, onlineServices: number | null): Check[] {
  const b = (d.business ?? {}) as Row, loc = (d.location ?? null) as Row | null;
  const shown = ((d.photos ?? []) as Row[]).filter((p) => p.active).length;
  const highlights = ((b.highlights ?? []) as string[]).length;
  const unreplied = ((d.reviews ?? []) as Row[]).filter((r) => r.status === "published" && !r.reply).length;
  const words = !!b.tagline && !!b.about, hours = !!hoursLine(loc?.hours), verified = b.verification_status === "verified", social = !!(b.instagram || b.tiktok || b.website);
  const out: Check[] = [
    { ok: shown > 0, title: shown ? `${plural(shown, "photo")}, with a cover` : "No photos yet", fix: "Add your best work", go: "photos" },
    { ok: words, title: words ? "Tagline and about text are filled in" : "Tagline or about text is missing", fix: "Write them", go: "words" },
    { ok: highlights >= 3, title: highlights >= 3 ? `${highlights} highlights` : `${plural(highlights, "highlight")}. Three or more reads better`, fix: "Pick some", go: "highlights" },
  ];
  if (onlineServices !== null) out.push({ ok: onlineServices > 0, title: onlineServices ? "Services can be booked online" : "No services can be booked online", fix: "Open Services", go: "services" });
  out.push(
    { ok: hours, title: hours ? "Opening hours are set" : "No opening hours", fix: "Set them", go: "hours" },
    { ok: verified, title: verified ? `Verified${Number(b.review_count) ? `, with ${plural(Number(b.review_count), "review")}` : ""}` : "Not verified yet. Our team is checking your listing" },
    { ok: unreplied === 0, title: unreplied ? `${plural(unreplied, "review")} without a reply` : "Every review has a reply", fix: "Reply now", go: "reviews" },
    { ok: social, title: social ? "Social or website link added" : "No social or website link", fix: "Add one", go: "social" },
  );
  return out;
}

export const statusWords = (status: unknown): { tag: string; kind: "ok" | "gold" | "grey" | "wine"; title: string; sub: string } =>
  status === "live" ? { tag: "Live", kind: "ok", title: "Your listing is live", sub: "Clients can find and book you." }
    : status === "paused" ? { tag: "Paused", kind: "grey", title: "Online booking is paused", sub: "Clients cannot find or book you. Your data and existing bookings are kept." }
      : status === "suspended" ? { tag: "Suspended", kind: "wine", title: "Your listing is suspended", sub: "Contact LogaLuxe support." }
        : { tag: "In review", kind: "gold", title: "Your listing is being checked", sub: "You can set everything up now. It goes live once our team approves it." };

// ---------- the booking link and the snippets for the business's own website ----------

const attr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The same link, QR target and snippets the web's "Share your booking page" card makes. */
export function shareKit(origin: string, slug: string, name: string) {
  const link = `${origin}/b/${slug}`, embed = `${origin}/embed/${slug}`;
  return {
    link, embed,
    script: `<script src="${origin}/embed.js" data-business="${slug}" async></script>`,
    frame: `<iframe src="${embed}" title="Book with ${attr(name || "us")}" style="width:100%;max-width:480px;height:760px;border:0" loading="lazy"></iframe>`,
  };
}
