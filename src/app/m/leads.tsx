// New clients from LogaLuxe: who LogaLuxe brought, what each first visit cost, and the offer to be promoted in search.
// GET /v1/m/leads reads it (a manager may). The owner alone changes promotion (PUT /leads/settings) and disputes a fee (POST /leads/{id}/dispute).
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Grp, Header, McIcon, Sheet, SmallBtn, Stepper, Sw, Tag } from "@/components/mc-kit";
import { LinkText } from "@/components/ma-kit";
import { B, KV, Meter, Night, NightBig, NightLabel, NightStat, NightText, NotReady, RowCard, Tip, Toast, type Said } from "@/components/mg-kit";
import { Btn, Card, Chip, Empty, Field, Note, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money, plural, when } from "@/lib/format";
import { dateMed } from "@/lib/mb-util";
import { copyText, major, symbol, toCents } from "@/lib/mc-util";
import { useGrow } from "@/lib/mg-load";
import { LEAD_SOURCE, feeOf, leadCharged, leadEstimate, leadStatus, multipleOf, n, pct, pct1 } from "@/lib/mg-util";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

type Boost = { bid: number; budget: string; paused: boolean };
const FIRST = 5;

export default function Leads() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const m = s.merchant;
  const cur = (m?.currency as string) ?? "USD", tz = m?.timezone as string | undefined;
  const owner = m?.role === "owner";

  const { d, denied, error, reload, refresh, refreshing } = useGrow(s, async () => {
    const leads = await s.mapi<Data>("/leads");
    // The address of the booking page is answered with the promo codes (a light call); the card is left out if it fails.
    const link = await s.mapi<Data>("/promos").then((x) => String(x.booking_link ?? "")).catch(() => "");
    return { ...leads, booking_link: link } as Data;
  });
  const [note, setNote] = useState<Said>(null);
  const [show, setShow] = useState("all"), [all, setAll] = useState(false);
  const [openId, setOpenId] = useState(""), [disputing, setDisputing] = useState(false), [reason, setReason] = useState(""), [sheetError, setSheetError] = useState(""), [busy, setBusy] = useState(false);
  const [boostForm, setBoostForm] = useState<Boost | null>(null), [boostError, setBoostError] = useState(""), [saving, setSaving] = useState(false);

  const leads = useMemo(() => ((d?.leads ?? []) as Data[]), [d]);
  const labels = useMemo(() => [...new Set(leads.map((l) => leadStatus(l).label))], [leads]);
  const shown = show !== "all" && labels.includes(show) ? show : "all";
  const list = useMemo(() => leads.filter((l) => shown === "all" || leadStatus(l).label === shown), [leads, shown]);

  if (!d) return <NotReady title="New clients" denied={denied} error={error} reload={reload} what="What LogaLuxe brought the business and what it cost is for a manager or the owner." />;

  const rate = (d.rate ?? {}) as Data, k = (d.kpis ?? {}) as Data, set = (d.settings ?? {}) as Data, boost = (d.boost ?? {}) as Data, rank = (d.rank ?? {}) as Data;
  const capCents = rate.cap_cents === null || rate.cap_cents === undefined ? null : Number(rate.cap_cents);
  const base = Number(rate.base_pct ?? 0), days = Number(rate.dispute_days ?? 0), maxBoost = Number(rate.max_boost_pct ?? 0);
  const sampleCents = cur === "NGN" ? 5000000 : 10000;
  const budget = Number(set.monthly_budget_cents ?? 0), spent = Number(boost.spent_cents ?? 0), bid = Number(set.boost_pct ?? 0);
  const state = boost.running ? "running" : bid > 0 && set.paused ? "paused" : bid > 0 ? "spent" : "off";
  const others = Math.max(0, Number(rank.promoted_peers ?? 0) - (boost.running ? 1 : 0));
  const peers = Number(rank.peers ?? 0);
  const link = String(d.booking_link ?? "");
  const multiple = multipleOf(Number(k.all_revenue_cents ?? 0), Number(k.all_fee_cents ?? 0));
  const steps: [string, number, string][] = [
    ["Shown in search", Number(k.impressions_30d ?? 0), "times your business appeared in results"],
    ["Opened your page", Number(k.views_30d ?? 0), Number(k.impressions_30d) > 0 ? `${pct1(Number(k.views_30d), Number(k.impressions_30d))}% of the times shown` : "from search"],
    ["First bookings", Number(k.leads_30d ?? 0), Number(k.views_30d) > 0 ? `${pct1(Number(k.leads_30d), Number(k.views_30d))}% of page visits` : "new clients who booked"],
  ];
  const peak = Math.max(1, ...steps.map((x) => x[1]));
  const sel = leads.find((l) => l.id === openId);

  const copy = async () => {
    const out = await copyText(link);
    setNote(out === "failed" ? { kind: "bad", text: "The link could not be copied." } : { kind: "ok", text: "Your booking link is copied. A client who books through it never costs you a fee." });
  };

  const openBoost = () => { setBoostError(""); setBoostForm({ bid, budget: budget > 0 ? major(budget) : "", paused: !!set.paused }); };
  const saveBoost = async () => {
    if (!boostForm) return;
    const cents = toCents(boostForm.budget);
    if (cents === null) { setBoostError("Enter the monthly budget as an amount, or leave it empty for no limit."); return; }
    setSaving(true); setBoostError("");
    try {
      const out = await s.mapi<Data>("/leads/settings", { method: "PUT", body: { boost_pct: boostForm.bid, monthly_budget_cents: cents, paused: boostForm.paused } });
      setNote(out.running ? { kind: "ok", text: "Saved. You are promoted in search now." }
        : boostForm.bid > 0 && boostForm.paused ? { kind: "gold", text: "Saved. Promotion is paused, so you are not promoted." }
        : boostForm.bid > 0 ? { kind: "gold", text: "Saved. Promotion is not running: this month's budget is already spent." }
        : { kind: "ok", text: "Saved. Promotion is off." });
      setBoostForm(null);
      await refresh();
    } catch (e) { setBoostError((e as Error).message); }
    setSaving(false);
  };

  const closeLead = () => { setOpenId(""); setDisputing(false); setReason(""); setSheetError(""); };
  const sendDispute = async () => {
    if (!sel) return;
    if (reason.trim().length < 10) { setSheetError("Say in a sentence or two why this was not a new client from LogaLuxe."); return; }
    setBusy(true); setSheetError("");
    try {
      await s.mapi(`/leads/${sel.id}/dispute`, { body: { reason: reason.trim() } });
      closeLead();
      setNote({ kind: "ok", text: "Dispute sent. The LogaLuxe team will check it and the answer will show on this page." });
      await refresh();
    } catch (e) { setSheetError((e as Error).message); }
    setBusy(false);
  };

  // What a first visit would cost with the numbers in the promotion sheet.
  const liveTotal = boostForm ? base + (boostForm.paused ? 0 : boostForm.bid) : base;
  const liveCost = feeOf(sampleCents, liveTotal, capCents), plainCost = feeOf(sampleCents, base, capCents);

  const header = (
    <View>
      <Header title="New clients" />

      {/* The money, first */}
      <Night style={{ marginTop: 14 }}>
        <NightLabel>Fees this month</NightLabel>
        <NightBig>{money(k.month_fee_cents, cur)}</NightBig>
        <NightText>{Number(k.month_charged) ? `for ${plural(Number(k.month_charged), "new client")} LogaLuxe brought you. It comes out of your payout balance.` : "Nothing charged yet this month."}</NightText>
        <Row gap={10} style={{ marginTop: 14, alignItems: "flex-start" }}>
          <NightStat label="New clients this month" value={n(k.month_leads)} sub={`${n(k.month_charged)} charged · ${n(k.month_pending)} still to come · ${n(k.month_void)} not charged`} />
          <NightStat label="What they have been worth" value={multiple || "No fees yet"} sub={Number(k.all_fee_cents) > 0 ? `${money(k.all_fee_cents, cur)} in fees brought ${money(k.all_revenue_cents, cur)}` : "No fees charged so far"} />
        </Row>
        <Row gap={10} style={{ marginTop: 12, alignItems: "flex-start" }}>
          <NightStat label="Came back" value={Number(k.all_charged) ? `${pct(k.came_back, k.all_charged)}%` : "Not yet known"} sub={Number(k.all_charged) ? `${n(k.came_back)} of ${plural(Number(k.all_charged), "new client")} booked again` : "No new clients charged yet"} />
          <NightStat label="What a new client costs" value={`${base + (boost.running ? bid : 0)}% once`} sub={capCents !== null ? `of the first visit, never more than ${money(capCents, cur)}` : "of the first visit"} />
        </Row>
        <Row gap={8} style={{ marginTop: 14 }}>
          {owner ? <SmallBtn kind="gold" onPress={openBoost} style={{ flex: 1 }}>{state === "off" ? "Get promoted" : "Promotion"}</SmallBtn> : null}
          {link ? <SmallBtn kind="ghost" onPress={copy} style={owner ? undefined : { flex: 1 }}>Copy my free link</SmallBtn> : null}
        </Row>
      </Night>

      <Grp>New clients LogaLuxe brought you · {leads.length}</Grp>
      {labels.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -pad, marginBottom: 10 }} contentContainerStyle={{ gap: 8, paddingHorizontal: pad }}>
          <Chip on={shown === "all"} onPress={() => setShow("all")}>All</Chip>
          {labels.map((x) => <Chip key={x} on={shown === x} onPress={() => setShow(x)}>{`${x} · ${leads.filter((l) => leadStatus(l).label === x).length}`}</Chip>)}
        </ScrollView>
      ) : null}
      {!leads.length ? <Empty title="No new clients from LogaLuxe yet">When someone who has never booked you finds you on LogaLuxe and books, they appear here with what the visit cost you and what they have spent since.</Empty> : null}
    </View>
  );

  const footer = (
    <View>
      {list.length > FIRST && !all ? <LinkText onPress={() => setAll(true)}>{`Show all ${list.length}`}</LinkText> : null}
      <T size={12} muted style={{ marginTop: 4 }}>{owner ? `You can dispute a fee for ${days} days after it is charged.` : `The owner can dispute a fee for ${days} days after it is charged.`} Fees also show line by line under Money.{leads.length >= 500 ? " These are the 500 newest." : ""}</T>

      {/* Promotion */}
      <Grp right={state === "running" ? <Tag kind="ok">{`Running · ${boost.total_pct}% on new clients`}</Tag> : state === "paused" ? <Tag>Paused</Tag> : state === "spent" ? <Tag kind="gold">Stopped · budget spent</Tag> : <Tag>Off</Tag>}>Promotion in search</Grp>
      <Card style={{ padding: 16, gap: 12 }}>
        <T size={13} muted>Offer extra percentage points on new clients and you are listed first in search, marked &quot;Promoted&quot;. You still pay only when a new client&apos;s first visit is paid for. Set a monthly budget and promotion stops by itself when it is spent; the usual {base}% still applies after that.</T>
        <View style={{ borderTopWidth: 1, borderTopColor: c.line }}>
          <KV k="Extra share you offer" v={`+${bid}%`} strong />
          <KV k="A new client then costs" v={`${base + (set.paused ? 0 : bid)}% of the first visit`} />
          <KV k="Monthly budget" v={budget > 0 ? money(budget, cur) : "No limit"} />
          <KV k="Paused" v={set.paused ? "Yes" : "No"} last />
        </View>
        {budget > 0 ? (
          <View style={{ gap: 6 }}>
            <Meter part={spent} whole={budget} label={`${money(spent, cur)} of ${money(budget, cur)} spent this month`} />
            <T size={12} muted>{money(spent, cur)} of {money(budget, cur)} spent this month. The budget counts every new-client fee charged this month.</T>
          </View>
        ) : <T size={12} muted>{money(spent, cur)} in new-client fees this month. No budget is set.</T>}
        <Tip>
          {peers > 1
            ? <>There {peers - 1 === 1 ? "is 1 other business" : `are ${peers - 1} other businesses`} like yours nearby on LogaLuxe. {others > 0 ? `${others} of them ${others === 1 ? "is" : "are"} promoting now` : "None of them is promoting now"}{Number(rank.top_bid_pct) > 0 ? `, and the highest other offer is +${rank.top_bid_pct}%` : ""}. <B>You are listed number {rank.position} of {peers}.</B></>
            : m?.status === "live" ? "No other business like yours is listed nearby on LogaLuxe yet, so you are already first." : "Your place in search shows here once your business is live."}
        </Tip>
        {owner ? <Btn kind="gold" onPress={openBoost}>Change promotion</Btn> : <T size={12} muted>Only the owner can change promotion.</T>}
      </Card>

      {/* From search to first booking */}
      <Grp right={<Text style={{ fontFamily: f.medium, fontSize: 12, color: c.muted }}>Last 30 days</Text>}>From search to first booking</Grp>
      {steps.some((x) => x[1] > 0) ? (
        <Card style={{ padding: 16, gap: 14 }}>
          {steps.map(([name, value, sub], i) => (
            <View key={name} accessible accessibilityLabel={`${name}: ${n(value)}, ${sub}`} style={{ gap: 6 }}>
              <Row between>
                <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{name}</Text>
                <Text style={{ fontFamily: f.serifBold, fontSize: 22, color: c.ink }}>{n(value)}</Text>
              </Row>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: c.cream2, overflow: "hidden" }}>
                <View style={{ width: `${Math.max(value > 0 ? 3 : 0, (value / peak) * 100)}%`, height: 10, borderRadius: 5, backgroundColor: c.ink, opacity: 1 - i * 0.22 }} />
              </View>
              <Text style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>{sub}</Text>
            </View>
          ))}
          {Number(k.promoted_impressions_30d) > 0 ? <T size={12} muted>{n(k.promoted_impressions_30d)} of those times you were shown as Promoted.</T> : null}
        </Card>
      ) : <Empty title="Nothing to show yet">{m?.status === "live" ? "Once clients find you in LogaLuxe search, the numbers appear here." : "Your business is not live in search yet, so nobody has found you there."}</Empty>}

      {/* How it works, plainly */}
      <Grp>How new clients from LogaLuxe work</Grp>
      <Card style={{ padding: 16, gap: 10 }}>
        <Text style={{ fontFamily: f.body, fontSize: 15, lineHeight: 22, color: c.ink }}>
          When LogaLuxe brings you a client who has never booked you before, you pay <B>{base}% of their first visit</B>, once{capCents !== null ? <>, capped at <B>{money(capCents, cur)}</B></> : null}. Clients who use your own booking link are always free. Nothing is charged if they cancel or do not come.
        </Text>
        <T size={13} muted>The share is taken on what the client pays for services on that visit, not on tips, tax or products, and it comes out of your payout balance. Every later visit from that client is yours in full.</T>
        {link ? (
          <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, gap: 8 }}>
            <Text style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.72, textTransform: "uppercase", color: c.muted }}>Your own link · always free</Text>
            <Row gap={8} style={{ backgroundColor: c.cream2, borderRadius: 12, paddingVertical: 8, paddingLeft: 12, paddingRight: 8 }}>
              <McIcon name="link" size={16} color={c.goldInk} />
              <Text numberOfLines={1} selectable style={{ flex: 1, minWidth: 0, fontFamily: f.semi, fontSize: 13, color: c.ink }}>{link.replace(/^https?:\/\//, "")}</Text>
              <SmallBtn kind="ink" onPress={copy}>Copy</SmallBtn>
            </Row>
            <T size={12} muted>Put it in your Instagram bio, on WhatsApp and on your door. A client who books through it never costs you a fee.</T>
          </View>
        ) : null}
      </Card>

    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={all ? list : list.slice(0, FIRST)}
        keyExtractor={(l) => String(l.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: pad, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderItem={({ item: l }) => {
          const st = leadStatus(l), charged = leadCharged(l);
          const feeText = charged ? money(l.fee_cents, cur) : l.status === "pending" ? `about ${money(leadEstimate(l), cur)}` : "No fee";
          return (
            <RowCard onPress={() => setOpenId(l.id)} label={`${l.client_name}, ${st.label}, ${feeText}. ${l.services ?? ""}. Open`}>
              <Row gap={12} style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Row gap={8} wrap>
                    <Text style={{ fontFamily: f.semi, fontSize: 15, lineHeight: 20, color: c.ink }}>{l.client_name}</Text>
                    <Tag kind={st.tone}>{st.label}</Tag>
                    {l.boosted ? <Tag kind="gold">Promoted</Tag> : null}
                  </Row>
                  <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 3 }}>{l.services ?? "No services listed"}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{dateMed(String(l.created_at), tz)} · {LEAD_SOURCE[l.source] ?? l.source}</Text>
                </View>
                <View style={{ alignItems: "flex-end", maxWidth: 120 }}>
                  <Text style={{ fontFamily: charged ? f.bold : f.medium, fontSize: charged ? 16 : 13, color: charged ? c.ink : c.muted }}>{feeText}</Text>
                  <Text style={{ fontFamily: f.medium, fontSize: 11, lineHeight: 15, color: c.muted, textAlign: "right" }}>{l.status === "refunded" ? "returned to you" : charged ? `fee on ${money(l.value_cents, cur)}` : l.status === "pending" ? `on ${money(l.value_cents, cur)}` : ""}</Text>
                </View>
              </Row>
            </RowCard>
          );
        }}
      />

      <Toast note={note} onDone={() => setNote(null)} />

      {/* One new client */}
      <Sheet tall={disputing} open={!!sel} onClose={closeLead} title={disputing ? "Dispute this fee" : sel?.client_name ?? ""}
        sub={sel ? (disputing ? `${sel.client_name} · ${money(sel.fee_cents, cur)} charged ${sel.charged_at ? dateMed(String(sel.charged_at), tz) : ""}` : `${LEAD_SOURCE[sel.source] ?? sel.source} · ${when(String(sel.created_at), tz)}`) : undefined}
        footer={disputing ? <Row gap={8}><Btn kind="out" onPress={() => { setDisputing(false); setSheetError(""); }} style={{ paddingHorizontal: 22 }}>Back</Btn><Btn busy={busy} onPress={sendDispute} style={{ flex: 1 }}>Send dispute</Btn></Row> : undefined}>
        {sel ? (disputing ? (
          <>
            {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
            <Tip>Use this when the client was already yours: they had been to you before, or they came through your own link or a friend, not through LogaLuxe. The LogaLuxe team checks every dispute and the answer shows on this page. If they agree, the fee goes back to your balance. A fee can be disputed for {days} days after it is charged.</Tip>
            <Field label="Why was this not a new client from LogaLuxe?" value={reason} onChangeText={setReason} multiline maxLength={600} placeholder="She has been coming to me since 2024. I have her in my old booking app under the same number." hint={`${reason.trim().length} of 600 characters. At least 10.`} />
          </>
        ) : (() => {
          const st = leadStatus(sel), charged = leadCharged(sel);
          const ratePct = Number(sel.base_pct) + Number(sel.boost_pct);
          const canDispute = owner && sel.status === "charged" && sel.can_dispute && !sel.resolved_at;
          return (
            <>
              <Row gap={8} wrap><Tag kind={st.tone}>{st.label}</Tag>{sel.boosted ? <Tag kind="gold">Promoted</Tag> : null}</Row>
              {st.note ? <T size={13} muted>{st.note}</T> : null}
              <Card style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
                <KV k="Fee" strong v={charged ? `${money(sel.fee_cents, cur)}${sel.status === "refunded" ? " · returned" : ""}` : sel.status === "pending" ? `about ${money(leadEstimate(sel), cur)}, only if the visit is paid for` : "None"} />
                <KV k="First visit" v={money(sel.value_cents, cur)} />
                <KV k="Rate" v={sel.boosted ? `${ratePct}% (${Number(sel.base_pct)}% + ${Number(sel.boost_pct)}% promotion)` : `${ratePct}%`} />
                {sel.cap_cents !== null && sel.cap_cents !== undefined ? <KV k="Never more than" v={money(sel.cap_cents, cur)} /> : null}
                <KV k="Services" v={String(sel.services ?? "Not listed")} />
                {sel.starts_at ? <KV k="Visit" v={dateMed(String(sel.starts_at), tz)} /> : null}
                {sel.charged_at ? <KV k="Charged" v={dateMed(String(sel.charged_at), tz)} /> : null}
                <KV k="Spent with you so far" last v={`${money(sel.lifetime_cents, cur)} · ${plural(Number(sel.visits), "visit")}`} />
              </Card>
              {sel.status === "disputed" && sel.dispute_reason ? <Tip>You said: {sel.dispute_reason}</Tip> : null}
              {canDispute ? <Btn kind="out" onPress={() => { setSheetError(""); setDisputing(true); }}>Dispute this fee</Btn>
                : sel.status === "charged" && !sel.resolved_at ? <T size={12} muted>{owner ? `This fee can no longer be disputed. That is possible for ${days} days after it is charged.` : `Only the owner can dispute a fee, for ${days} days after it is charged.`}</T> : null}
              {sel.client_id ? <LinkText onPress={() => { const id = String(sel.client_id); closeLead(); router.push(`/m/client/${id}` as never); }}>Open this client</LinkText> : null}
            </>
          );
        })()) : null}
      </Sheet>

      {/* The owner's offer to be promoted */}
      <Sheet tall open={!!boostForm} onClose={() => setBoostForm(null)} title="Promotion in search" sub="You pay only when a new client's first visit is paid for."
        footer={<Btn busy={saving} onPress={saveBoost}>Save promotion</Btn>}>
        {boostForm ? (
          <>
            {boostError ? <Note kind="bad">{boostError}</Note> : null}
            <Card style={{ padding: 16, gap: 12 }}>
              <Row between>
                <View style={{ flex: 1 }}>
                  <T size={14} weight="semi">Extra share on new clients</T>
                  <T size={12} muted>0 to {maxBoost}%, in steps of half a percent</T>
                </View>
                <Stepper value={`+${boostForm.bid}%`} lessLabel="Offer half a percent less" moreLabel="Offer half a percent more"
                  onLess={() => setBoostForm({ ...boostForm, bid: Math.max(0, Math.round((boostForm.bid - 0.5) * 2) / 2) })}
                  onMore={() => setBoostForm({ ...boostForm, bid: Math.min(maxBoost, Math.round((boostForm.bid + 0.5) * 2) / 2) })} />
              </Row>
              <Row gap={8} wrap>
                {[0, 2, 5, 10].filter((x) => x <= maxBoost).map((x) => <Chip key={x} on={boostForm.bid === x} onPress={() => setBoostForm({ ...boostForm, bid: x })}>{x === 0 ? "Nothing extra" : `+${x}%`}</Chip>)}
              </Row>
            </Card>
            <Field label={`Monthly budget (${symbol(cur)})`} value={boostForm.budget} onChangeText={(t) => setBoostForm({ ...boostForm, budget: t })} keyboardType="decimal-pad" placeholder="No limit" hint="Empty or 0 means no limit. The budget counts every new-client fee charged in the month." />
            <Card>
              <Row style={{ paddingVertical: 13, paddingHorizontal: 16, minHeight: 56 }}>
                <View style={{ flex: 1 }}>
                  <T size={14} weight="semi">Pause promotion</T>
                  <T size={12} muted>Keeps your numbers, stops the extra share</T>
                </View>
                <Sw on={boostForm.paused} label="Pause promotion" onPress={() => setBoostForm({ ...boostForm, paused: !boostForm.paused })} />
              </Row>
            </Card>
            <Tip>
              <B>A {money(sampleCents, cur)} first visit would cost {money(liveCost, cur)}</B> ({liveTotal}%{boostForm.bid > 0 && !boostForm.paused ? `: ${base}% plus your ${boostForm.bid}%` : ""}{capCents !== null && liveCost === capCents ? `, held at the cap of ${money(capCents, cur)}` : ""}).
              {boostForm.bid > 0 && !boostForm.paused ? ` Without promotion it would cost ${money(plainCost, cur)}.` : boostForm.bid > 0 ? " Promotion is paused, so only the usual share applies." : " You are not offering anything extra, so you are listed in the usual order."}
            </Tip>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
