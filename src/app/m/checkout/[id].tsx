import { useFormReset } from "@/lib/form-reset";
// The till (design: M6-Checkout). `/m/checkout/<booking id>` takes payment for a visit;
// `/m/checkout/new` is a quick sale with no booking. The rules are the web till's and the API's
// (logaluxe-be/internal/httpapi/m_checkout.go): booked services keep the price agreed at booking,
// anything added at the desk is priced by the API for now, discounts are taken in the API's order,
// tax is on retail only, and a paid deposit comes off. The sums shown while the ticket is built come
// from lib/ma-ticket (the web till's own sums); once the sale is taken the receipt shows the API's figures.
import * as WebBrowser from "expo-web-browser";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Share, Text, TextInput, View } from "react-native";
import { Group, LinkText, MaIcon, Sheet, type MaIconName } from "@/components/ma-kit";
import { Avatar, Btn, Card, Chip, Failed, Field, Icon, IconButton, Loading, Note, Pill, Row, Screen, Serif, T, type IconName } from "@/components/ui";
import { qs, type Row as Data } from "@/lib/api";
import { clock, dayShort, duration, firstName, money, ymd } from "@/lib/format";
import { allowed, waitForSignIn, dueOf, paper, shortName, toCents, todayIn, whoOf } from "@/lib/ma-format";
import { lineTotal, pointsProblem, ticketTotals, type Line, type MemberRates, type Points } from "@/lib/ma-ticket";
import { checkoutRequest, completeCheckout, pendingCheckouts, type CheckoutRequest } from "@/lib/checkout-request";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Credit = { id: string; service_id: string; service: string; total: number; used: number; left: number; usable: boolean };
type Plan = { id: string; kind: "package" | "membership"; name: string; status: string; service_discount_pct: number | null; retail_discount_pct: number | null; credits: Credit[] };
type Price = { price_cents: number; menu_cents: number; rules: string[] } | "failed";
type Method = { id: string; name: string; sub: string; icon: MaIconName | IconName; kit?: boolean };
type OpenLink = { reference: string; url: string; amount_cents: number; expires_in: number; totals: Data; status: string; problem: string; saleId: string };
type Receipt = { out: Data; method: string; who: string };

const rates = (service: number, retail: number) => [service > 0 ? `${service}% off services` : "", retail > 0 ? `${retail}% off retail` : ""].filter(Boolean).join(", ");
const TIPS = [15, 20, 25] as const;

export default function Checkout() {
  const p = useLocalSearchParams<{ id: string; client?: string }>();
  const id = String(p.id ?? "");
  const quick = id === "new";
  const s = useSession();
  const m = s.merchant;
  const tz: string | undefined = m?.timezone, cur: string = m?.currency ?? "USD";
  const cash = (n: number) => money(n, cur);
  const provider = m?.market === "NG" ? "Paystack" : "Stripe";

  const { data, error, loading, reload } = useLoad(async () => {
    if (!s.businessToken) return waitForSignIn();
    const [till, one, pre] = await Promise.all([
      s.mapi("/checkout"),
      quick ? Promise.resolve(null) : s.mapi(`/bookings/${encodeURIComponent(id)}`),
      quick && p.client ? s.mapi(`/clients/${encodeURIComponent(p.client)}`).catch(() => null) : Promise.resolve(null),
    ]);
    return { till, one, pre };
  }, [id, s.businessToken]);

  const back = () => (router.canGoBack() ? router.back() : router.replace((quick ? "/business/today" : `/m/booking/${id}`) as never));

  // ---------- the ticket ----------
  const [lines, setLines] = useState<Line[]>([]);
  const [tipPct, setTipPct] = useState<number | null>(null);
  const [discountText, setDiscountText] = useState(""), [showDiscount, setShowDiscount] = useState(false);
  const [promoText, setPromoText] = useState(""), [showPromo, setShowPromo] = useState(false);
  const [pointsText, setPointsText] = useState("");
  const [method, setMethod] = useState("");
  const [locationId, setLocationId] = useState("");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false), [tab, setTab] = useState<"services" | "products">("services");
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState("");
  const [link, setLink] = useState<OpenLink | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // a quick sale: who it is for and who sold it
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [lookup, setLookup] = useState(""), [found, setFound] = useState<Data[] | null>(null), [lookupError, setLookupError] = useState("");
  const [walkName, setWalkName] = useState("");
  const [staffId, setStaffId] = useState("");

  const till = data?.till as Data | undefined;
  const booking = (data?.one?.booking ?? null) as Data | null;
  const live = till?.payments_mode === "live";

  // Fill the ticket once, from the booking or the client the screen was opened with.
  const filled = useRef(false);
  const bookedLines = useRef<Line[]>([]);
  useEffect(() => {
    if (!data || filled.current) return;
    filled.current = true;
    const t = data.till as Data;
    if (data.one) {
      const b = data.one.booking as Data;
      bookedLines.current = ((data.one.items ?? []) as Data[]).map((it, i) => ({ key: `b-${i}`, kind: "service" as const, service_id: it.service_id ?? undefined, name: it.name, sub: `Booked · ${duration(Number(it.duration_min))}`, unit: Number(it.price_cents), qty: 1, fixed: true }));
      setLines(bookedLines.current);
      if (Number(b.discount_cents) > 0) { setDiscountText((Number(b.discount_cents) / 100).toString()); setShowDiscount(true); }
    } else {
      const locs = (t.locations ?? []) as Data[];
      setLocationId(String(locs.find((l) => l.is_primary)?.id ?? locs[0]?.id ?? ""));
      if (((t.staff ?? []) as Data[]).some((x) => x.id === m?.staff_id)) setStaffId(String(m?.staff_id));
      if (data.pre?.client) setChosen({ id: data.pre.client.id, name: data.pre.client.name });
    }
    const isLive = t.payments_mode === "live";
    setMethod(isLive ? (m?.market === "NG" ? "transfer" : "card") : m?.market === "NG" ? "transfer" : "tap");
    if (!((t.services ?? []) as Data[]).length && ((t.products ?? []) as Data[]).length) setTab("products");
  }, [data, m]);

  const clientId: string | null = booking ? booking.client_id ?? null : chosen?.id ?? null;
  const sellerId: string = booking ? String(booking.staff_id ?? "") : staffId;
  const paying = useRef(false);
  const [pendingSales, setPendingSales] = useState<CheckoutRequest[]>([]);
  const customerScope = quick ? clientId ?? "walk-in" : `booking:${id}`;
  const businessScope = String(m?.business_id ?? ""), merchantScope = String(m?.id ?? "");
  useFormReset([businessScope, merchantScope, customerScope], () => setPendingSales([]));
  useEffect(() => {
    let open = true;
    if (!businessScope || !merchantScope) return;
    pendingCheckouts(businessScope, merchantScope, customerScope)
      .then((value) => { if (open) setPendingSales(value); })
      .catch(() => { if (open) setProblem("Device storage is unavailable. Checkout cannot safely submit."); });
    return () => { open = false; };
  }, [businessScope, merchantScope, customerScope]);

  const staff = ((till?.staff ?? []) as Data[]);
  const sellerName = booking ? String(booking.staff ?? "") : String(staff.find((x) => x.id === staffId)?.name ?? "");

  useFormReset([lookup], () => { setFound(null); setLookupError(""); });

  // A quick sale can be put on a client's record: find them by name, phone or email.
  useEffect(() => {
    const q = lookup.trim();
    if (q.length < 2) return;
    let open = true;
    const timer = setTimeout(() => {
      s.mapi<{ clients?: Data[] }>("/clients" + qs({ q, sort: "name" }))
        .then((out) => { if (open) { setFound((out.clients ?? []).slice(0, 6)); setLookupError(""); } })
        .catch((e: Error) => { if (open) { setFound([]); setLookupError(e.message); } });
    }, 250);
    return () => { open = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup, s.businessToken]);

  // What the client holds: packages with visits left, a membership with its discounts, and loyalty points.
  const [plans, setPlans] = useState<{ forClient: string; plans: Plan[]; points: number; error: string } | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let open = true;
    s.mapi<{ plans?: Plan[]; points?: number }>(`/clients/${encodeURIComponent(clientId)}/plans`)
      .then((out) => { if (open) setPlans({ forClient: clientId, plans: out.plans ?? [], points: Number(out.points ?? 0), error: "" }); })
      .catch((e: Error) => { if (open) setPlans({ forClient: clientId, plans: [], points: 0, error: e.message }); });
    return () => { open = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, s.businessToken]);
  const held = plans && plans.forClient === clientId ? plans.plans : [];
  const plansLoading = !!clientId && (!plans || plans.forClient !== clientId);
  const activeHeld = held.filter((x) => x.status === "active" || x.status === "past_due");
  // The API takes the best rate of each kind across the memberships that are active.
  const memberships = held.filter((x) => x.kind === "membership" && x.status === "active");
  const member: (MemberRates & { name: string }) | null = memberships.length
    ? { name: memberships.map((x) => x.name).join(", "), service: Math.max(...memberships.map((x) => x.service_discount_pct ?? 0)), retail: Math.max(...memberships.map((x) => x.retail_discount_pct ?? 0)) }
    : null;
  const credits = held.filter((x) => x.status === "active").flatMap((x) => (x.credits ?? []).filter((k) => k.usable).map((k) => ({ ...k, plan: x.name })));
  const creditsLeft = (serviceId: string) => credits.filter((k) => k.service_id === serviceId).reduce((a, k) => a + k.left, 0) - lines.filter((l) => l.redeem && l.service_id === serviceId).length;
  const creditPlan = (serviceId: string) => credits.find((k) => k.service_id === serviceId)?.plan ?? "a credit";

  // A service added at the desk costs what the pricing rules say for this person, now. Ask the API for each one.
  const [prices, setPrices] = useState<Record<string, Price>>({});
  const priceKey = (serviceId: string) => `${serviceId}|${sellerId}`;
  const wanted = [...new Set(lines.filter((l) => l.kind === "service" && l.service_id && !l.fixed).map((l) => priceKey(l.service_id!)))].filter((k) => !(k in prices)).join(",");
  useEffect(() => {
    if (!wanted) return;
    for (const key of wanted.split(",")) {
      const [service, who] = key.split("|");
      s.mapi<{ price_cents: number; menu_cents: number; rules: string[] }>("/price-check" + qs({ service, staff: who }))
        .then((out) => setPrices((x) => ({ ...x, [key]: out })))
        .catch(() => setPrices((x) => ({ ...x, [key]: "failed" })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  // The lines as they will be charged.
  const priced = useMemo(() => lines.map((l) => {
    if (l.kind !== "service" || !l.service_id || l.fixed) return { ...l, why: "", checking: false };
    const x = prices[`${l.service_id}|${sellerId}`];
    if (!x) return { ...l, why: "", checking: true };
    if (x === "failed") return { ...l, why: "Price could not be checked. The menu price is shown.", checking: false };
    return { ...l, unit: x.price_cents, why: x.price_cents !== x.menu_cents ? `${x.rules.length ? x.rules.join(", ") : "Their own price"} · menu price ${money(x.menu_cents, cur)}` : "", checking: false };
  }), [lines, prices, sellerId, cur]);
  const checking = priced.some((l) => l.checking);

  const taxBp = Number(till?.tax_bp ?? 0);
  const loyalty = (till?.loyalty ?? null) as Data | null;
  const base = ticketTotals(priced, { discount: 0, tip: 0, taxBp, depositPaid: 0 });
  // Tips are worked out on services, or on the whole ticket when it has none.
  const tipBase = base.serviceTotal > 0 ? base.serviceTotal : base.subtotal;
  const tip = tipPct !== null ? Math.round((tipBase * tipPct) / 100) : 0;
  const typed = showDiscount ? toCents(discountText) : 0;
  const balance = plans && plans.forClient === clientId ? plans.points : 0;
  const points: Points | null = loyalty?.enabled && clientId
    ? { enabled: true, earnPoints: Number(loyalty.earn_points), perCents: Number(loyalty.per_cents), pointValue: Number(loyalty.point_value_cents), minRedeem: Number(loyalty.min_redeem), balance, redeem: Math.max(0, Math.round(Number(pointsText) || 0)) }
    : null;
  const pointsWhy = pointsProblem(points);
  const promo = showPromo ? promoText.trim().toUpperCase() : "";
  const depositPaid = booking?.deposit_paid ? Number(booking.deposit_cents ?? 0) : 0;
  const t = ticketTotals(priced, { discount: typed, tip, taxBp, depositPaid, member, points });
  // Shown in the order they are taken: typed, member, points. All of it is capped at the subtotal.
  const typedShown = Math.min(typed, t.discount), memberShown = Math.min(t.memberDiscount, t.discount - typedShown), pointsShown = Math.min(t.pointsDiscount, t.discount - typedShown - memberShown);

  // ---------- changing the ticket ----------
  const services = ((till?.services ?? []) as Data[]), products = ((till?.products ?? []) as Data[]);
  const inCart = (productId: string) => lines.find((l) => l.product_id === productId)?.qty ?? 0;
  const addService = (x: Data) => setLines((ls) => {
    // A service that is part of the booked visit keeps the price agreed at booking.
    const booked = bookedLines.current.find((l) => l.service_id === x.id);
    const at = ls.findIndex((l) => l.kind === "service" && l.service_id === x.id && !l.redeem && !!l.fixed === !!booked);
    if (at >= 0) return ls.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l));
    return [...ls, { key: `s-${x.id}-${Date.now()}`, kind: "service", service_id: x.id, name: x.name, sub: `Service · ${duration(Number(x.duration_min))}`, unit: booked ? booked.unit : Number(x.price_cents), qty: 1, fixed: booked ? true : undefined }];
  });
  const addProduct = (x: Data) => setLines((ls) => {
    const at = ls.findIndex((l) => l.product_id === x.id);
    if (at >= 0) return ls.map((l, i) => (i === at ? { ...l, qty: Math.min(Number(x.stock), l.qty + 1) } : l));
    return [...ls, { key: `p-${x.id}`, kind: "product", product_id: x.id, name: x.name, sub: "Retail", unit: Number(x.price_cents), qty: 1, stock: Number(x.stock) }];
  });
  const setQty = (key: string, by: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(l.stock ?? 99, l.qty + by)) } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  // One credit pays for one visit, so a line with several is split: one is paid by the credit, the rest stay.
  const redeem = (key: string, on: boolean) => setLines((ls) => ls.flatMap((l) => {
    if (l.key !== key) return [l];
    if (!on) return [{ ...l, redeem: false }];
    return l.qty > 1 ? [{ ...l, key: `${l.key}-r${Date.now()}`, qty: 1, redeem: true }, { ...l, qty: l.qty - 1 }] : [{ ...l, redeem: true }];
  }));
  const pick = (x: { id: string; name: string } | null) => {
    setChosen(x); setLookup(""); setFound(null); setPointsText("");
    // Credits belong to one client, so none carry over to the next.
    setLines((ls) => ls.map((l) => (l.redeem ? { ...l, redeem: false } : l)));
  };

  // ---------- taking the money ----------
  const who = booking ? String(booking.client_name ?? "Client") : chosen ? chosen.name : walkName.trim() || "Walk-in";
  /** The sale as the API wants it. The same body takes a payment at the desk and makes a pay link. */
  const ticket = () => ({
    booking_id: booking ? String(booking.id) : "",
    client_id: booking ? "" : chosen?.id ?? "",
    client_name: booking || chosen ? "" : walkName.trim(),
    staff_id: booking ? "" : staffId,
    items: priced.map((l) => ({
      kind: l.kind, service_id: l.service_id, product_id: l.product_id,
      qty: l.redeem ? 1 : l.qty,
      ...(l.redeem ? { redeem: true } : l.kind === "service" && (l.fixed || !l.service_id) ? { name: l.name, unit_cents: l.unit } : {}),
    })),
    tip_cents: t.tip,
    discount_cents: Math.min(typed, t.subtotal),
    method,
    note: "",
    promo_code: promo,
    redeem_points: points && !pointsWhy ? points.redeem : 0,
    location_id: booking ? "" : locationId,
  });
  const blocked = !lines.length || checking || plansLoading || !!pointsWhy;

  // The API prices the ticket as it is built (nothing is kept). Its figures are the ones charged, and
  // only it knows what a promo code is worth, so they replace the till's own sums as soon as they arrive.
  const quoteBody = lines.length && !checking && !pointsWhy ? JSON.stringify(ticket()) : "";
  const [quote, setQuote] = useState<{ body: string; out?: Data; why?: string } | null>(null);
  useEffect(() => {
    if (!quoteBody) return;
    let on = true;
    const timer = setTimeout(() => {
      s.mapi("/checkout/quote", { method: "POST", body: JSON.parse(quoteBody) })
        .then((r: Data) => { if (on) setQuote({ body: quoteBody, out: (r.quote ?? {}) as Data }); })
        .catch((e: unknown) => { if (on) setQuote({ body: quoteBody, why: (e as Error).message }); });
    }, 400);
    return () => { on = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteBody]);
  const q = quote && quote.body === quoteBody ? quote : null;
  const promoOff = Number(q?.out?.promo_discount_cents ?? 0);
  const due = q?.out ? Number(q.out.total_cents ?? t.due) : t.due;

  const pay = async (saved?: CheckoutRequest) => {
    if (paying.current) return;
    setProblem("");
    if (!saved && !lines.length) { setProblem("Add at least one service or product."); return; }
    paying.current = true;
    setBusy(true);
    try {
      const body = ticket();
      const request = saved ?? await checkoutRequest(body, businessScope, merchantScope, customerScope);
      setPendingSales((current) => current.some((x) => x.id === request.id) ? current : [...current, request]);
      const out = await s.mapi("/checkout", { method: "POST", body: saved ? { request_id: request.id, replay_only: true } : { ...body, request_id: request.id } });
      if (!out.sale_id) throw new Error("The receipt response was interrupted. Retry the same ticket.");
      await completeCheckout(request);
      setPendingSales((current) => current.filter((x) => x.id !== request.id));
      setReceipt({ out, method: String(out.method ?? method), who: String(out.client_name ?? who) });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      paying.current = false;
      setBusy(false);
    }
  };

  // A pay link: the API prices the sale (its dry run) and opens a payment page. Then ask every few seconds whether it was paid.
  const sendLink = async () => {
    setProblem(""); setBusy(true);
    try {
      const out = await s.mapi("/checkout/link", { method: "POST", body: { ...ticket(), email: email.trim() } });
      setLink({ reference: String(out.reference), url: String(out.url ?? ""), amount_cents: Number(out.amount_cents ?? 0), expires_in: Number(out.expires_in ?? 1800), totals: (out.totals ?? {}) as Data, status: "pending", problem: "", saleId: "" });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const linkRef = link?.reference ?? "", linkStatus = link?.status ?? "";
  useEffect(() => {
    if (!linkRef || linkStatus !== "pending") return;
    let open = true;
    const check = () => s.mapi<{ payment: Data | null }>(`/payments/${encodeURIComponent(linkRef)}`)
      .then((out) => { if (open && out.payment) setLink((l) => (l && l.reference === linkRef ? { ...l, status: String(out.payment!.status), problem: String(out.payment!.problem ?? ""), saleId: String(out.payment!.sale_id ?? "") } : l)); })
      .catch(() => undefined);
    const timer = setInterval(check, 4000);
    return () => { open = false; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkRef, linkStatus]);
  // Paid: the API has recorded the sale. Show its receipt.
  useFormReset([link?.status, link?.saleId], () => {
    if (link && link.status === "paid" && link.saleId) setReceipt({ out: { ...link.totals, sale_id: link.saleId }, method: "link", who });
     
  });

  // ---------- the screen ----------
  const head = (right?: ReactNode) => (
    <Row gap={12} style={{ minHeight: 44 }}>
      <IconButton icon="back" label="Back" onPress={back} />
      <View style={{ flex: 1 }}><Serif size={26}>Checkout</Serif></View>
      {right}
    </Row>
  );
  const shell = (body: ReactNode, footer?: ReactNode, right?: ReactNode) => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen footer={footer} style={{ backgroundColor: paper, flexGrow: 1 }}>
        {head(right)}
        {body}
      </Screen>
    </KeyboardAvoidingView>
  );

  if (s.ready && !s.businessToken) return <Redirect href={`/sign-in?side=business&next=${encodeURIComponent(`/m/checkout/${id}`)}` as never} />;
  if (!data || !till) return shell(<View style={{ marginTop: 16 }}>{error && !loading ? <Failed error={error} onRetry={reload} /> : <Loading label="Opening the till" />}</View>);

  const toBooking = () => router.dismissTo(`/m/booking/${id}` as never);
  const whoChip = <Row gap={8} style={{ flexShrink: 1 }}><Avatar name={who} tone={booking?.staff_tone} size={40} /><Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, color: c.ink, flexShrink: 1 }}>{shortName(who)}</Text></Row>;

  // ----- after paying: the receipt, with the API's own figures -----
  if (receipt) {
    const o = receipt.out, n = (k: string) => Math.max(0, Number(o[k] ?? 0));
    const typedOff = Math.max(0, n("discount_cents") - Math.min(n("discount_cents"), n("member_discount_cents") + n("promo_discount_cents") + n("points_discount_cents")));
    const rows: [string, string][] = [["Subtotal", cash(n("subtotal_cents"))]];
    if (typedOff > 0) rows.push(["Discount", cash(-typedOff)]);
    if (n("promo_discount_cents") > 0) rows.push(["Promo code", cash(-n("promo_discount_cents"))]);
    if (n("member_discount_cents") > 0) rows.push(["Member discount", cash(-n("member_discount_cents"))]);
    if (n("points_discount_cents") > 0) rows.push([`${n("points_used").toLocaleString("en-US")} loyalty points`, cash(-n("points_discount_cents"))]);
    if (n("tax_cents") > 0) rows.push(["Sales tax", cash(n("tax_cents"))]);
    if (n("deposit_cents") > 0) rows.push(["Deposit paid before", cash(-n("deposit_cents"))]);
    rows.push(["Tip", cash(n("tip_cents"))]);
    const mth = receipt.method;
    return shell(
      <>
        <Card style={{ marginTop: 16, padding: 18, gap: 10 }}>
          <Pill kind="ok">{mth === "link" ? "Paid online" : mth === "cash" ? "Cash recorded" : live ? "Recorded" : "Sale recorded"}</Pill>
          <Serif size={26}>{`${receipt.who} · ${cash(n("total_cents"))}`}</Serif>
          <T muted size={13.5}>
            {mth === "link" ? `The client paid on ${provider}'s page. The money is on its way to your payout balance.`
              : mth === "cash" ? "Cash is recorded here and kept out of your payout balance."
              : live ? "You took this money yourself. It is recorded here, with no LogaLuxe fee, and is not part of your payouts."
              : "The payment was simulated. No card was charged and no money moved."}
          </T>
          {n("points_earned") > 0 || n("points_used") > 0 ? <T muted size={13.5}>{[n("points_used") > 0 ? `${n("points_used").toLocaleString("en-US")} loyalty points spent` : "", n("points_earned") > 0 ? `${n("points_earned").toLocaleString("en-US")} ${n("points_earned") === 1 ? "point" : "points"} earned` : ""].filter(Boolean).join(" · ") + "."}</T> : null}
        </Card>
        <Card style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 16 }}>
          {rows.map(([k, v]) => <TotLine key={k} left={k} right={v} muted={k !== "Subtotal"} />)}
          <TotLine total left={mth === "cash" ? "Cash taken" : mth === "link" ? "Paid online" : live ? "Taken" : "Charged"} right={cash(n("total_cents"))} />
        </Card>
      </>,
      <View style={{ gap: 8 }}>
        {quick ? <Btn onPress={() => router.replace("/m/checkout/new" as never)}>New sale</Btn> : <Btn onPress={toBooking}>Back to the booking</Btn>}
        <Btn kind="out" onPress={() => router.dismissTo("/business/today" as never)}>Done</Btn>
      </View>,
    );
  }

  // ----- a sign-in that may not take payments -----
  if (till.can_take_payments === false || !allowed(m, "take_payments")) {
    return shell(
      <Card style={{ marginTop: 16, padding: 18, gap: 10 }}>
        <T weight="semi" size={16}>The desk takes payment</T>
        <T muted>{booking ? `${whoOf(booking)} · ${booking.services ?? "Visit"}: ${cash(dueOf(booking))} to pay. ` : ""}Your sign-in cannot take payments. Ask the owner to switch that on for you.</T>
        {booking ? <Btn kind="out" small onPress={back} style={{ alignSelf: "flex-start" }}>Back to the booking</Btn> : null}
      </Card>,
    );
  }

  // ----- a visit that cannot be checked out -----
  if (booking && (booking.status === "paid" || booking.paid_at || ["cancelled_client", "cancelled_business", "no_show", "rescheduled"].includes(booking.status))) {
    const paid = booking.status === "paid" || !!booking.paid_at;
    return shell(
      <Card style={{ marginTop: 16, padding: 18, gap: 10 }}>
        {paid ? <Pill kind="ok">Paid</Pill> : null}
        <T weight="semi" size={16}>{paid ? "This visit has already been paid" : booking.status === "no_show" ? "This visit was a no-show" : booking.status === "rescheduled" ? "This booking was moved" : "This booking was cancelled"}</T>
        <T muted>{paid ? `${whoOf(booking)} · ${booking.services ?? "Visit"}${booking.paid_at ? ` · paid ${dayShort(booking.paid_at, tz)}` : ""}.` : "So there is nothing to check out."}</T>
        <Btn kind="out" small onPress={back} style={{ alignSelf: "flex-start" }}>Back to the booking</Btn>
      </Card>,
    );
  }

  const SIM: Method[] = [
    { id: "tap", name: "Tap to pay", sub: "Simulated", icon: "tap" }, { id: "card", name: "Card", sub: "Simulated", icon: "paycard" },
    { id: "cash", name: "Cash", sub: "Recorded, kept out of payouts", icon: "cash" }, { id: "transfer", name: "Bank transfer", sub: "Simulated", icon: "transfer" },
    { id: "wallet", name: "Wallet", sub: "Simulated", icon: "wallet", kit: true },
  ];
  const LIVE: Method[] = [
    { id: "link", name: "Send pay link", sub: `Client pays on ${provider}`, icon: "link" }, { id: "card", name: "Card machine", sub: "Recorded, not paid out", icon: "paycard" },
    { id: "cash", name: "Cash", sub: "Recorded, not paid out", icon: "cash" }, { id: "transfer", name: "Bank transfer", sub: "Recorded, not paid out", icon: "transfer" },
    { id: "wallet", name: "Mobile wallet", sub: "Recorded, not paid out", icon: "wallet", kit: true },
  ];
  const methods = live ? LIVE : SIM;
  const locations = (till.locations ?? []) as Data[];

  const cta = !lines.length ? "Add something to charge" : checking ? "Checking prices" : method === "link" ? (due <= 0 ? "Nothing left to pay by link" : `Send pay link for ${cash(due)}`)
    : due === 0 ? "Complete sale" : method === "cash" ? `Record cash payment ${cash(due)}` : live ? `Record ${cash(due)} taken` : `Charge ${cash(due)}`;

  const footer = link ? undefined : (
    <View>
      {problem ? <View style={{ marginBottom: 10 }}><Note kind="bad">{problem}</Note></View> : null}
      {pendingSales.length > 0 ? <Card>
        <T>A previous checkout response was not confirmed. Recover its receipt, or rebuild the same ticket to retry safely.</T>
        {pendingSales.map((request, i) => <Btn key={request.id} disabled={busy} onPress={() => pay(request)}>Recover receipt{pendingSales.length > 1 ? ` ${i + 1}` : ""}</Btn>)}
      </Card> : null}

      <Btn busy={busy} disabled={blocked || (method === "link" && due <= 0)} onPress={method === "link" ? sendLink : () => pay()} style={{ minHeight: 52 }}>{cta}</Btn>
      <T muted size={11} center style={{ marginTop: 8 }}>
        {!live ? "Payments are simulated on this install. The sale is recorded, but no card is charged and no money moves."
          : method === "link" ? `The client pays on ${provider}'s secure page. LogaLuxe never sees their card.`
          : "You take this money yourself. It is recorded here, with no LogaLuxe fee, and is not part of your payouts."}
      </T>
    </View>
  );

  // ----- a pay link is open: wait for the client -----
  if (link) {
    return shell(
      <Card style={{ marginTop: 16, padding: 18, gap: 12 }}>
        <T muted size={12} weight="semi" style={{ letterSpacing: 0.8, textTransform: "uppercase" }}>{`Pay by link · ${who}`}</T>
        <Serif size={34}>{cash(link.amount_cents)}</Serif>
        {link.status === "pending" ? (
          <>
            <Note kind="gold">Waiting for the client to pay. This checks by itself every few seconds.</Note>
            <T muted size={13}>{`Send the client this link. It works for about ${Math.round(link.expires_in / 60)} minutes. They pay on ${provider}'s secure page. LogaLuxe never sees their card.`}</T>
            <T selectable size={13} style={{ backgroundColor: paper, borderRadius: 12, padding: 12 }}>{link.url}</T>
            <Btn icon="share" onPress={() => { void Share.share({ message: link.url }).catch(() => undefined); }}>Share the link</Btn>
            <Btn kind="out" onPress={() => { void WebBrowser.openBrowserAsync(link.url).catch(() => undefined); }}>Open on this phone</Btn>
            <Btn kind="out" onPress={() => setLink(null)}>Change the ticket</Btn>
            <T muted size={12}>Nothing is recorded until they pay. If you change the ticket, make a new link and do not use this one.</T>
          </>
        ) : link.status === "paid" ? (
          <Note kind="ok">{link.saleId ? "Paid. Opening the receipt." : "Paid. The sale is being recorded."}</Note>
        ) : (
          <>
            <Note kind="bad">{link.status === "expired" ? "The link ran out before the client paid. Nothing was charged." : link.status === "failed" ? "The payment did not go through. Nothing was recorded." : `The payment is ${link.status}.`}</Note>
            <Btn onPress={() => setLink(null)}>Back to the ticket</Btn>
          </>
        )}
        {link.problem ? <T size={13} color={c.bad}>{link.problem}</T> : null}
      </Card>,
      undefined, whoChip,
    );
  }

  const today = todayIn(tz);
  return shell(
    <>
      {booking ? (
        <T muted size={13} style={{ marginTop: 10 }}>{`${whoOf(booking)} · ${ymd(new Date(booking.starts_at), tz) === today ? "" : dayShort(booking.starts_at, tz) + " "}${clock(booking.starts_at, tz)} · with ${firstName(String(booking.staff ?? ""))}`}</T>
      ) : (
        <View style={{ marginTop: 14, gap: 12 }}>
          {chosen ? (
            <Card style={{ padding: 14 }}>
              <Row between>
                <T size={14} style={{ flex: 1 }}>{"On "}<T size={14} weight="semi">{chosen.name}</T>{"'s record"}</T>
                <LinkText onPress={() => pick(null)}>Change client</LinkText>
              </Row>
            </Card>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.white, borderWidth: 1, borderColor: c.line2, borderRadius: 14, paddingHorizontal: 14, minHeight: 50 }}>
                <Icon name="search" size={18} />
                <TextInput accessibilityLabel="Find a client" value={lookup} onChangeText={setLookup} placeholder="Find a client: name, phone or email" placeholderTextColor={c.muted2} autoCorrect={false}
                  style={{ flex: 1, minWidth: 0, minHeight: 48, fontFamily: f.body, fontSize: 15, color: c.ink }} />
              </View>
              {lookupError ? <T size={13} color={c.bad}>{lookupError}</T> : null}
              {found ? (
                found.length ? (
                  <Card style={{ overflow: "hidden" }}>
                    {found.map((x, i) => (
                      <Pressable key={x.id} accessibilityRole="button" onPress={() => pick({ id: x.id, name: x.name })} style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 14, paddingVertical: 8, justifyContent: "center", borderTopWidth: i ? 1 : 0, borderTopColor: c.line, opacity: pressed ? 0.7 : 1 })}>
                        <T weight="semi" size={14}>{x.name}</T>
                        <T muted size={12}>{[x.phone, x.email].filter(Boolean).join(" · ") || "No contact details"}</T>
                      </Pressable>
                    ))}
                  </Card>
                ) : !lookupError ? <T muted size={13}>Nobody matches. Carry on as a walk-in, or add them on the Clients tab first.</T> : null
              ) : null}
              <Field label="Walk-in name" value={walkName} onChangeText={setWalkName} maxLength={80} placeholder="Walk-in" hint="Leave the client empty for a walk-in. Credits, member discounts and points need a client." />
            </>
          )}
          {staff.length ? (
            <View style={{ gap: 6 }}>
              <T muted size={12} weight="semi">Sold by</T>
              <Row gap={8} wrap>
                <Chip on={!staffId} onPress={() => setStaffId("")}>Nobody in particular</Chip>
                {staff.map((x) => <Chip key={x.id} on={staffId === x.id} onPress={() => setStaffId(String(x.id))}>{firstName(String(x.name))}</Chip>)}
              </Row>
            </View>
          ) : null}
          {locations.length > 1 ? (
            <View style={{ gap: 6 }}>
              <T muted size={12} weight="semi">Selling at</T>
              <Row gap={8} wrap>{locations.map((l) => <Chip key={l.id} on={locationId === l.id} onPress={() => setLocationId(String(l.id))}>{String(l.name)}</Chip>)}</Row>
            </View>
          ) : null}
        </View>
      )}

      {clientId && (plansLoading || plans?.error || activeHeld.length) ? (
        <View style={{ marginTop: 12 }}>
          {plansLoading ? <T muted size={13}>Looking up their packages and membership.</T>
            : plans?.error ? <T size={13} color={c.bad}>{plans.error}</T>
            : <Note kind="gold">{activeHeld.map((x) => [x.kind === "membership" ? `${x.name} member${rates(x.service_discount_pct ?? 0, x.retail_discount_pct ?? 0) ? `: ${rates(x.service_discount_pct ?? 0, x.retail_discount_pct ?? 0)}` : ""}` : x.name, ...(x.credits ?? []).map((k) => `${k.service} ${k.left} of ${k.total} left`), x.status === "past_due" ? "payment owing" : ""].filter(Boolean).join(" · ")).join("\n")}</Note>}
        </View>
      ) : null}

      {/* ----- the ticket ----- */}
      <Card style={{ marginTop: 16, paddingVertical: 8, paddingHorizontal: 16 }}>
        {priced.length === 0 ? <T muted size={13.5} style={{ paddingVertical: 10 }}>The ticket is empty. Add a service or a product.</T> : null}
        {priced.map((l) => {
          const canRedeem = l.kind === "service" && !!l.service_id && !l.redeem && creditsLeft(l.service_id) > 0;
          return (
            <View key={l.key} style={{ paddingVertical: 7 }}>
              <Row gap={8} between>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: f.body, fontSize: 14, color: c.ink }}>{l.name}{l.kind !== "product" && l.qty > 1 && !l.redeem ? ` × ${l.qty}` : ""}</Text>
                  {l.redeem ? <T muted size={12}>{`Paid by ${creditPlan(l.service_id!)} · one credit used`}</T> : l.kind === "product" ? <T muted size={12}>{`Retail · ${cash(l.unit)} each`}</T> : l.checking ? <T muted size={12}>Checking the price</T> : l.why ? <T muted size={12}>{l.why}</T> : null}
                </View>
                {l.kind === "product" ? (
                  <Row gap={0} style={{ borderWidth: 1, borderColor: c.line2, borderRadius: 999 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`One less ${l.name}`} disabled={l.qty <= 1} onPress={() => setQty(l.key, -1)} hitSlop={6} style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", opacity: l.qty <= 1 ? 0.3 : 1 }}><MaIcon name="minus" size={14} /></Pressable>
                    <Text accessibilityLabel={`Quantity ${l.qty}`} style={{ fontFamily: f.semi, fontSize: 14, color: c.ink, minWidth: 18, textAlign: "center" }}>{l.qty}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`One more ${l.name}`} disabled={l.qty >= (l.stock ?? 99)} onPress={() => setQty(l.key, 1)} hitSlop={6} style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", opacity: l.qty >= (l.stock ?? 99) ? 0.3 : 1 }}><Icon name="plus" size={14} /></Pressable>
                  </Row>
                ) : null}
                <Text style={{ fontFamily: f.body, fontSize: 14, color: c.ink }}>{cash(lineTotal(l))}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${l.name}`} onPress={() => remove(l.key)} hitSlop={8} style={{ minHeight: 32, justifyContent: "center", paddingHorizontal: 6 }}>
                  <Text style={{ fontFamily: f.semi, fontSize: 12, color: "#9B2335" }}>Remove</Text>
                </Pressable>
              </Row>
              {canRedeem ? <LinkText size={12.5} onPress={() => redeem(l.key, true)} style={{ minHeight: 32 }}>{`Use credit · ${creditsLeft(l.service_id!)} left on ${creditPlan(l.service_id!)}`}</LinkText> : null}
              {l.redeem ? <LinkText size={12.5} onPress={() => redeem(l.key, false)} style={{ minHeight: 32 }}>Charge it instead</LinkText> : null}
            </View>
          );
        })}
        <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
          <Icon name="plus" size={14} color={c.wine} stroke={2.4} />
          <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>Add service or product</Text>
        </Pressable>
        {typedShown > 0 ? <TotLine muted left="Discount" right={cash(-typedShown)} /> : null}
        {promo ? <TotLine muted left={`Promo code ${promo}`} right={q?.out ? cash(-promoOff) : q?.why ? "not applied" : "checking"} /> : null}
        {member && memberShown > 0 ? <TotLine muted left={`${member.name} member · ${rates(member.service, member.retail)}`} right={cash(-memberShown)} /> : null}
        {pointsShown > 0 ? <TotLine muted left={`${t.pointsUsed.toLocaleString("en-US")} loyalty points`} right={cash(-pointsShown)} /> : null}
        {t.productTotal > 0 && taxBp > 0 ? <TotLine muted left={`Sales tax ${taxBp / 100}% · retail only`} right={cash(t.tax)} /> : null}
        {depositPaid > 0 ? <TotLine muted left="Deposit paid" right={cash(-t.deposit)} /> : null}
        <TotLine muted left="Tip" right={t.tip ? cash(t.tip) : "none"} />
        <TotLine total left={q?.why ? "Due as it stands" : "Due now"} right={cash(due)} />
        {q?.why ? <Text accessibilityRole="alert" style={{ fontFamily: f.medium, fontSize: 12.5, color: c.wine, marginTop: 6 }}>{q.why}</Text> : null}
      </Card>

      {/* ----- tip ----- */}
      <Group>{sellerName ? `Tip for ${firstName(sellerName)}` : "Tip"}</Group>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {TIPS.map((pct) => <TipTile key={pct} on={tipPct === pct} label={`${pct}%`} sub={cash(Math.round((tipBase * pct) / 100))} onPress={() => setTipPct(pct)} />)}
        <TipTile on={tipPct === null} label="No tip" sub="" onPress={() => setTipPct(null)} />
      </View>
      <T muted size={12} style={{ marginTop: 8 }}>{base.serviceTotal > 0 ? "Worked out on the services, before any discount." : "Worked out on the ticket, before any discount."}</T>

      {/* ----- how they pay ----- */}
      <Group>Pay with</Group>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {methods.map((x) => {
          const on = method === x.id;
          return (
            <Pressable key={x.id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${x.name}. ${x.sub}`} onPress={() => setMethod(x.id)}
              style={({ pressed }) => ({ width: "48.8%", minHeight: 60, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? c.ink : c.line2, backgroundColor: c.white, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: on ? 13 : 14, opacity: pressed ? 0.85 : 1 })}>
              {x.kit ? <Icon name={x.icon as IconName} size={20} /> : <MaIcon name={x.icon as MaIconName} size={20} />}
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{x.name}</Text>
                <Text numberOfLines={2} style={{ fontFamily: f.body, fontSize: 11, color: c.muted }}>{x.sub}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {method === "link" ? <View style={{ marginTop: 12 }}><Field label="Client's email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="Filled in for them on the payment page" /></View> : null}

      {/* ----- money off ----- */}
      {showDiscount || showPromo || points ? (
        <View style={{ marginTop: 14, gap: 12 }}>
          {showDiscount ? <Field label={`Discount (${cur})${booking?.promo_code ? ` · code ${booking.promo_code}` : ""}`} value={discountText} onChangeText={setDiscountText} keyboardType="decimal-pad" placeholder="0" hint={typed + t.memberDiscount > t.subtotal && t.subtotal > 0 ? `Discounts cannot be more than the ticket, so ${cash(t.subtotal)} is taken off in all.` : undefined} /> : null}
          {showPromo ? <Field label="Promo code" value={promoText} onChangeText={setPromoText} maxLength={20} autoCapitalize="characters" autoCorrect={false} placeholder="CODE" hint={live && method === "link" ? "Checked when you make the link: the link shows the price with the code applied." : "Checked and applied when you charge. If it is not valid, nothing is charged and you are told why."} /> : null}
          {points ? (
            <Field label={`Loyalty · ${plansLoading ? "…" : `${balance.toLocaleString("en-US")} points`}`} value={pointsText} onChangeText={(v) => setPointsText(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" editable={!plansLoading && balance >= points.minRedeem}
              placeholder={balance >= points.minRedeem ? `Points to spend, ${points.minRedeem} or more` : `Needs ${points.minRedeem} points to spend`}
              error={pointsWhy || undefined}
              hint={[`Each point is worth ${cash(points.pointValue)}.`, t.pointsUsed > 0 ? `${t.pointsUsed.toLocaleString("en-US")} points take ${cash(t.pointsDiscount)} off${t.pointsUsed < points.redeem ? ": that is all this bill can use" : ""}.` : "", `This sale earns ${promo ? "about " : ""}${t.pointsEarned.toLocaleString("en-US")} ${t.pointsEarned === 1 ? "point" : "points"}.`].filter(Boolean).join(" ")} />
          ) : null}
        </View>
      ) : null}
      <Row gap={8} style={{ marginTop: 14 }}>
        <Btn kind="out" small onPress={() => { if (showDiscount) setDiscountText(""); setShowDiscount(!showDiscount); }} style={{ flex: 1, minHeight: 44 }}>{showDiscount ? "Remove discount" : "Apply discount"}</Btn>
        <Btn kind="out" small onPress={() => { if (showPromo) setPromoText(""); setShowPromo(!showPromo); }} style={{ flex: 1, minHeight: 44 }}>{showPromo ? "Remove code" : "Promo code"}</Btn>
      </Row>

      {/* ----- add to the ticket ----- */}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add to the ticket" sub="Tap to add. Tap again for one more." footer={<Btn onPress={() => setAdding(false)}>Done</Btn>}>
        <Row gap={8} style={{ marginBottom: 12 }}>
          <Chip on={tab === "services"} onPress={() => setTab("services")}>Services</Chip>
          <Chip on={tab === "products"} onPress={() => setTab("products")}>Products</Chip>
        </Row>
        {tab === "services" ? (
          services.length ? (
            <Card style={{ overflow: "hidden" }}>
              {services.map((x, i) => {
                const n = lines.filter((l) => l.service_id === x.id).reduce((a, l) => a + l.qty, 0);
                return <AddRow key={x.id} first={i === 0} title={String(x.name)} sub={[x.category, duration(Number(x.duration_min)), n ? `${n} in the ticket` : ""].filter(Boolean).join(" · ")} price={cash(Number(x.price_cents))} onPress={() => addService(x)} />;
              })}
            </Card>
          ) : <T muted size={14}>No services on your menu yet.</T>
        ) : products.length ? (
          <Card style={{ overflow: "hidden" }}>
            {products.map((x, i) => {
              const left = Number(x.stock) - inCart(String(x.id));
              return <AddRow key={x.id} first={i === 0} disabled={left <= 0} title={String(x.name)} sub={`Retail · ${left <= 0 ? "all in the ticket" : `${left} in stock`}${inCart(String(x.id)) ? ` · ${inCart(String(x.id))} in the ticket` : ""}`} price={cash(Number(x.price_cents))} onPress={() => addProduct(x)} />;
            })}
          </Card>
        ) : <T muted size={14}>No retail products in stock.</T>}
      </Sheet>
    </>,
    footer, whoChip,
  );
}

function TotLine({ left, right, muted, total }: { left: string; right: string; muted?: boolean; total?: boolean }) {
  const style = { fontFamily: total ? f.bold : f.body, fontSize: total ? 18 : 14, color: muted ? c.muted : c.ink };
  return (
    <View style={[{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 7 }, total && { borderTopWidth: 1, borderTopColor: c.line, marginTop: 6, paddingTop: 12 }]}>
      <Text style={[style, { flex: 1 }]}>{left}</Text>
      <Text style={style}>{right}</Text>
    </View>
  );
}

function TipTile({ on, label, sub, onPress }: { on: boolean; label: string; sub: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={sub ? `${label}, ${sub}` : label} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center", gap: 2, opacity: pressed ? 0.85 : 1 })}>
      <Text style={{ fontFamily: f.bold, fontSize: 15, color: on ? c.cream : c.ink }}>{label}</Text>
      {sub ? <Text style={{ fontFamily: f.body, fontSize: 11, color: on ? "#C9BCB0" : c.muted }}>{sub}</Text> : null}
    </Pressable>
  );
}

function AddRow({ title, sub, price, onPress, first, disabled }: { title: string; sub: string; price: string; onPress: () => void; first?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Add ${title}, ${price}`} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 54, paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: first ? 0 : 1, borderTopColor: c.line, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>{sub}</Text>
      </View>
      <Text style={{ fontFamily: f.bold, fontSize: 14, color: c.ink }}>{price}</Text>
      <Icon name="plus" size={16} color={c.muted} />
    </Pressable>
  );
}
