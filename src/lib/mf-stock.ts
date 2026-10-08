// Words and sums for the stock screens (inventory, a product, suppliers, purchase orders) and for
// the online orders and returns a business answers. They follow the web's Inventory tool, so both
// say the same thing about the same product or order.
import type { Row } from "./api";
import { clock, dayShort, money, ymd } from "./format";

export const KIND: Record<string, string> = { retail: "Retail", backbar: "Back-bar", both: "Retail and back-bar" };
export const KIND_SUB: Record<string, string> = { retail: "Sold to clients", backbar: "Used in services, not sold", both: "Sold to clients and used in services" };
export const CATEGORY: Record<string, string> = { hair: "Hair", styling: "Styling", tools: "Tools", skin: "Skin", nails: "Nails", gift: "Gifts" };
export const REASON: Record<string, string> = { restock: "Delivery", adjust: "Correction", backbar: "Used in services", count: "Count", transfer: "Moved", return: "Returned", sale: "Sold", order: "Online order", refund: "Refund" };

export type TagKind = "ok" | "gold" | "grey" | "wine";

export const isLow = (p: Row) => Number(p.reorder_at) > 0 && Number(p.stock) <= Number(p.reorder_at);
export const isOut = (p: Row) => Number(p.stock) <= 0;
export const sells = (p: Row) => p.kind !== "backbar";
/** How many of a product sit at one location. */
export const shelf = (p: Row, locationId: string | undefined) => Number(((p.by_location ?? []) as Row[]).find((x) => x.location_id === locationId)?.qty ?? 0);
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((Number(part) / Number(whole)) * 100) : 0);

/** The products that are on a purchase order already placed with a supplier. */
export const onOrderIds = (orders: Row[]) => new Set(orders.filter((o) => o.status === "ordered").flatMap((o) => ((o.items ?? []) as Row[]).map((i) => String(i.product_id))));

export function stockState(p: Row, onOrder: Set<string>): { label: string; kind: TagKind } {
  if (isOut(p)) return { label: "Out of stock", kind: "wine" };
  if (isLow(p)) return { label: "Low", kind: "wine" };
  if (onOrder.has(String(p.id))) return { label: "On order", kind: "gold" };
  return { label: "OK", kind: "ok" };
}

/** How full the shelf is, 0 to 100: against a full shelf when one is set, else three times the reorder level, else the fullest product. */
export const meterOf = (p: Row, top: number) => Math.min(100, pct(Number(p.stock), Number(p.par_level) > 0 ? Number(p.par_level) : Number(p.reorder_at) > 0 ? Math.max(Number(p.reorder_at) * 3, 1) : Math.max(top, 1)));
export const marginOf = (p: Row) => (sells(p) && Number(p.price_cents) > 0 ? `${pct(Number(p.price_cents) - Number(p.cost_cents), Number(p.price_cents))}%` : "Not sold");

/** Out of stock first, then low, then by name: what needs doing is at the top. */
export const byUrgency = (a: Row, b: Row) => (Number(isOut(b)) - Number(isOut(a))) || (Number(isLow(b)) - Number(isLow(a))) || String(a.name).localeCompare(String(b.name));

/** "0.05" or "3": an amount of a unit without trailing zeros. */
export const trim = (n: number) => Number(n).toFixed(2).replace(/\.?0+$/, "");

// ---------- purchase orders ----------

export const PO: Record<string, { label: string; kind: TagKind }> = {
  draft: { label: "Draft", kind: "gold" }, ordered: { label: "Ordered", kind: "ok" }, received: { label: "Received", kind: "grey" }, cancelled: { label: "Cancelled", kind: "grey" },
};

// ---------- online orders ----------

export const ORDER_TABS: [string, string][] = [["open", "To do"], ["new", "New"], ["ready", "Ready"], ["shipped", "Shipped"], ["done", "Done"], ["all", "All"]];
export const ORDER_STATE: Record<string, { label: string; kind: TagKind }> = {
  new: { label: "New", kind: "gold" }, ready: { label: "Ready", kind: "ok" }, shipped: { label: "Shipped", kind: "ok" },
  delivered: { label: "Delivered", kind: "grey" }, collected: { label: "Collected", kind: "grey" }, cancelled: { label: "Cancelled", kind: "wine" },
};
export const ORDER_DONE: Record<string, string> = {
  ready: "Marked as ready.",
  collected: "Marked as collected. The order is finished.",
  shipped: "Marked as shipped. The customer can see it in their account.",
  delivered: "Marked as delivered. The order is finished.",
};

/** The steps an order goes through, by how it reaches the customer, and how far this one is. */
export function orderPath(o: Row): { label: string; done: boolean; now: boolean }[] {
  const ship = o.fulfilment === "ship";
  const steps: [string, string][] = ship ? [["new", "Paid"], ["ready", "Packed"], ["shipped", "Shipped"], ["delivered", "Delivered"]] : [["new", "Paid"], ["ready", "Ready to collect"], ["collected", "Collected"]];
  const at = steps.findIndex(([k]) => k === o.status);
  return steps.map(([, label], i) => ({ label, done: at >= 0 && i <= at, now: i === at }));
}

/** What the business does next with an order: the main step, and for a shipment that is not packed yet, packing it. */
export function nextSteps(o: Row): { action: "ready" | "collected" | "shipped" | "delivered"; label: string; finishes?: boolean; tracking?: boolean }[] {
  const ship = o.fulfilment === "ship";
  if (!ship && o.status === "new") return [{ action: "ready", label: "Ready to collect" }];
  if (!ship && o.status === "ready") return [{ action: "collected", label: "Mark collected", finishes: true }];
  if (ship && o.status === "new") return [{ action: "shipped", label: "Mark shipped", tracking: true }, { action: "ready", label: "Packed" }];
  if (ship && o.status === "ready") return [{ action: "shipped", label: "Mark shipped", tracking: true }];
  if (ship && o.status === "shipped") return [{ action: "delivered", label: "Mark delivered", finishes: true }];
  return [];
}

/** The address a customer typed at checkout, on one line. */
export function addressLine(a: unknown): string {
  if (!a) return "";
  if (typeof a === "string") return a;
  const o = a as Record<string, unknown>;
  return ["line1", "line2", "city", "region", "postcode", "postal_code", "zip", "country"].map((k) => (o[k] ? String(o[k]).trim() : "")).filter(Boolean).join(", ");
}

export const itemsLine = (items: Row[]) => items.map((i) => `${i.qty} × ${i.name}${i.size ? ` (${i.size})` : ""}`).join(", ");

// ---------- returns ----------

export const RETURN_STATE: Record<string, { label: string; kind: TagKind }> = {
  requested: { label: "Waiting for you", kind: "gold" }, approved: { label: "Approved", kind: "ok" }, refused: { label: "Refused", kind: "wine" },
};
/** Where a refund went: the card, store credit, or some of each. */
export function refundSplit(refund: number, credit: number, cur: string): string {
  const card = Math.max(0, Number(refund ?? 0) - Number(credit ?? 0));
  if (card > 0 && credit > 0) return `${money(card, cur)} to the card, ${money(credit, cur)} as store credit`;
  return card > 0 ? "All of it to the card" : "All of it as LogaLuxe store credit";
}

export const PROVIDER: Record<string, string> = { NG: "Paystack", US: "Stripe" };
export const currencyName = (cur: string) => (cur === "NGN" ? "naira" : cur === "USD" ? "US dollars" : cur);

// ---------- dates ----------

/** "Thu 8 Oct", with the year when it is not this one. */
export const dateMed = (iso: string, tz?: string) => {
  const y = ymd(new Date(iso), tz).slice(0, 4);
  return y === ymd(new Date(), tz).slice(0, 4) ? dayShort(iso, tz) : `${dayShort(iso, tz)} ${y}`;
};
/** "Thu 8 Oct, 9:30 AM" */
export const stamp = (iso: string, tz?: string) => `${dateMed(iso, tz)}, ${clock(iso, tz)}`;
/** A calendar date some days after today in the business's zone, as YYYY-MM-DD. */
export const dayFromNow = (days: number, tz?: string) => new Date(Date.parse(ymd(new Date(), tz) + "T12:00:00Z") + days * 864e5).toISOString().slice(0, 10);

/** A whole number typed into a field. Empty or not a number answers null. A leading minus is allowed when `signed`. */
export function whole(text: string, signed = false): number | null {
  const t = text.trim();
  if (!(signed ? /^-?\d+$/ : /^\d+$/).test(t)) return null;
  return Number(t);
}
