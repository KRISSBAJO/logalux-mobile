// The sums of a ticket, worked out the same way the API does in mCheckoutPay
// (logaluxe-be/internal/httpapi/m_checkout.go), copied from the web till (checkout/math.ts) so the two
// screens always agree. Everything is whole minor units. The API has no way to price a sale without
// taking it (its dry run is only reachable through a pay link), so the till shows these figures while a
// ticket is being built. If the two ever disagree, the API wins: the receipt shows its figures.

export type Line = {
  key: string;
  kind: "service" | "product" | "custom" | "package" | "membership";
  service_id?: string;
  product_id?: string;
  package_id?: string;
  membership_id?: string;
  name: string;
  sub: string;
  /** The price of one, in minor units. For a service added at the desk this is the menu price until the price check answers. */
  unit: number;
  qty: number;
  /** Send the price with the line: prices agreed at booking and custom amounts. Otherwise the API prices it. */
  fixed?: boolean;
  /** Paid for with a credit from the client's package or membership: nothing is charged for it. */
  redeem?: boolean;
  /** How many are in stock, for products. */
  stock?: number;
};

export type MemberRates = { service: number; retail: number };

/** The loyalty rules of the business, and what this client has and wants to spend. */
export type Points = { enabled: boolean; earnPoints: number; perCents: number; pointValue: number; minRedeem: number; balance: number; redeem: number };

export type Totals = {
  subtotal: number; serviceTotal: number; productTotal: number;
  /** What the membership takes off by itself. */
  memberDiscount: number;
  /** Points really taken (never more than the bill can use) and what they are worth. */
  pointsUsed: number; pointsDiscount: number;
  /** Points this sale gives the client. */
  pointsEarned: number;
  /** Everything taken off: typed discount, promo code, member discount and points, never more than the subtotal. */
  discount: number;
  tax: number; deposit: number; tip: number; due: number;
};

/** What one line adds to the ticket. A line paid by a credit adds nothing, and is always a single visit. */
export const lineTotal = (l: Line) => (l.redeem ? 0 : l.unit * (l.qty <= 0 ? 1 : l.qty));

/** Why the points typed cannot be spent, or "" when they can. The API refuses the sale for the same reasons. */
export function pointsProblem(p: Points | null | undefined): string {
  if (!p || p.redeem <= 0) return "";
  if (!p.enabled) return "Loyalty points are switched off.";
  if (p.redeem < p.minRedeem) return `The fewest points that can be spent at once is ${p.minRedeem}.`;
  if (p.balance < p.redeem) return `This client has ${p.balance} points.`;
  return "";
}

/**
 * Discounts are added in the order the API adds them: the typed discount, the promo code (only the API
 * knows its worth, so `promo` is 0 until a sale is priced), the member discount, then points.
 */
export function ticketTotals(lines: Line[], opts: { discount: number; promo?: number; tip: number; taxBp: number; depositPaid: number; member?: MemberRates | null; points?: Points | null }): Totals {
  let subtotal = 0, productTotal = 0, memberDiscount = 0;
  for (const l of lines) {
    const amount = lineTotal(l);
    subtotal += amount;
    if (l.kind === "product") productTotal += amount;
    // A member's rates come off each line on its own, rounded down: services that are not paid by a credit, and retail.
    if (opts.member) {
      if (l.kind === "service" && !l.redeem) memberDiscount += Math.trunc((amount * opts.member.service) / 100);
      else if (l.kind === "product") memberDiscount += Math.trunc((amount * opts.member.retail) / 100);
    }
  }
  let discount = Math.max(0, opts.discount) + Math.max(0, opts.promo ?? 0) + memberDiscount;
  // Points: never more than the bill can still use after the other discounts.
  let pointsUsed = 0, pointsDiscount = 0;
  const p = opts.points;
  if (p && p.redeem > 0 && !pointsProblem(p) && p.pointValue > 0) {
    pointsUsed = p.redeem;
    const room = subtotal - discount;
    if (pointsUsed * p.pointValue > room) pointsUsed = Math.trunc(room / p.pointValue);
    if (pointsUsed < 0) pointsUsed = 0;
    pointsDiscount = pointsUsed * p.pointValue;
    discount += pointsDiscount;
  }
  // All of it together can never be more than the ticket.
  if (discount > subtotal) discount = subtotal;
  // Sales tax applies to retail products only, after their share of the whole discount.
  let tax = 0;
  if (subtotal > 0 && productTotal > 0 && opts.taxBp > 0) {
    const taxable = productTotal - Math.trunc((discount * productTotal) / subtotal);
    tax = Math.trunc((taxable * opts.taxBp + 5000) / 10000);
  }
  // A paid deposit comes off, but never more than the visit costs before the tip.
  const deposit = Math.min(Math.max(0, opts.depositPaid), subtotal - discount + tax);
  const tip = Math.max(0, opts.tip);
  // Points are earned on what is paid for goods and services, not on tips or tax.
  const paid = subtotal - discount;
  const pointsEarned = p && p.enabled && paid > 0 && p.perCents > 0 ? Math.trunc(paid / p.perCents) * p.earnPoints : 0;
  return { subtotal, serviceTotal: subtotal - productTotal, productTotal, memberDiscount, pointsUsed, pointsDiscount, pointsEarned, discount, tax, deposit, tip, due: subtotal - discount + tax + tip - deposit };
}

