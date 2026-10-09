// The Journal: the shapes the public journal API answers with, the calls the screens make, and the
// small helpers they share (dates, reading time, category names and colours, where an article lives).
import { api, qs, WEB_URL } from "./api";
import type { Biz } from "./ca-data";
import { c } from "./theme";

/** An article as the list and the home call carry it. The reader adds the body and the booking hints. */
export type Article = {
  id: string; slug: string; title: string; dek: string; category: string; category_label?: string; tags?: string[] | null;
  author_name: string; author_role?: string; author_media_id?: string | null; cover_media_id?: string | null; cover_alt?: string;
  country: string; featured?: boolean; reading_minutes: number; view_count: number; published_at: string;
  body_md?: string; seo_title?: string; seo_description?: string; related_category?: string | null; cta_text?: string;
};
export type Category = { key: string; label: string; count: number };
export type JournalList = { articles: Article[]; total: number; categories?: Category[] | null };
export type JournalHome = { featured: Article | null; latest: Article[]; count: number };
export type JournalRead = { article: Article; related?: Article[] | null; next?: Article | null };

export const PAGE = 10;

/** The categories the journal uses, with the names the chips and captions show when the API gives none. */
export const JOURNAL_CATEGORIES: [string, string][] = [["hair", "Hair"], ["braids", "Braids & locs"], ["barber", "Barber"], ["nails", "Nails"], ["lashes", "Lashes & brows"], ["skin", "Skin"], ["makeup", "Makeup"], ["spa", "Spa"], ["business", "For professionals"], ["guide", "Using LogaLuxe"]];
export const journalCategoryLabel = (a: Pick<Article, "category" | "category_label">) => a.category_label || JOURNAL_CATEGORIES.find(([k]) => k === a.category)?.[1] || a.category || "";

/** The dark ground behind an article with no cover, one colour to a category, from the app's own palette. */
const TONES: Record<string, string> = { hair: "#2E2538", braids: c.wine, barber: "#1F2A33", nails: "#4A2A2A", lashes: "#3A3A2E", skin: "#4A3426", makeup: c.wineDark, spa: "#2E3A33", business: c.ink, guide: c.photo };
export const categoryTone = (category: string) => TONES[category] ?? c.photo;

/** Where an article opens in the app, and on the website (for sharing). */
export const articleHref = (slug: string) => `/c/journal/${slug}`;
export const articleWebUrl = (slug: string) => `${WEB_URL}/journal/${slug}`;
export const journalHref = (p: { category?: string; tag?: string; q?: string } = {}) => `/c/journal${qs(p)}`;

/** "6 min read" */
export const readingLabel = (a: Pick<Article, "reading_minutes">) => `${Math.max(1, Number(a.reading_minutes) || 1)} min read`;

/** "8 October 2026", the way the app writes a long date, with no clock: an article has no time zone of its own. */
export function articleDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${d.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}

/** "120 reads". Nothing for an article nobody has opened yet: a zero is not worth a line. */
export const readsLabel = (a: Pick<Article, "view_count">) => {
  const n = Number(a.view_count) || 0;
  return n > 0 ? `${n.toLocaleString("en-US")} ${n === 1 ? "read" : "reads"}` : "";
};

/** "Date · 6 min read · 120 reads" */
export const metaLine = (a: Article) => [articleDate(a.published_at), readingLabel(a), readsLabel(a)].filter(Boolean).join(" · ");

// ---------- calls ----------

/** The featured piece and the three latest, for the home screens. `country` keeps to that country's pieces and the shared ones. */
export const loadJournalHome = (country: string) => api<JournalHome>(`/journal/home${qs({ country })}`);

export const loadJournal = (p: { category?: string; country?: string; q?: string; tag?: string; limit?: number; offset?: number; featured?: boolean }) =>
  api<JournalList>(`/journal${qs({ ...p, featured: p.featured ? 1 : undefined })}`);

/** One article with its related pieces and the next one. The first open counts as a read; `quiet` does not. */
export const loadArticle = (slug: string, quiet = false) => api<JournalRead>(`/journal/${encodeURIComponent(slug)}${qs({ quiet: quiet ? 1 : undefined })}`);

/** The four professionals to book under an article, nearest the place first. Same shape as a search. */
export const loadProfessionals = (slug: string, query: Record<string, string | number | undefined>) =>
  api<{ businesses: Biz[] }>(`/journal/${encodeURIComponent(slug)}/professionals${qs(query)}`).then((r) => r.businesses ?? []);
