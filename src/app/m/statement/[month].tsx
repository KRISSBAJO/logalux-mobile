// One month's statement in full (GET /v1/m/statements/{month}, the owner's): the payout balance from
// opening to closing, the payouts created, and every line. The sums and the check are the web's.
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AskManager, Grp, Header, SmallBtn, Tag, Wait, piece } from "@/components/mc-kit";
import { CsvButton, Line, Night, nightBig, nightBody, nightLabel, small, type Flash } from "@/components/mh-kit";
import { Btn, Card, Chip, Empty, Failed, Note, Row } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { clock, dayShort, firstName, plural, ymd } from "@/lib/format";
import { DENIED, orDenied, signedIn } from "@/lib/mc-util";
import { KIND, METHOD, cap, dateMed, dateShort, exact, isMonth, monthName, payoutKind, payoutState, shiftMonth } from "@/lib/mh-util";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const back = () => (router.canGoBack() ? router.back() : router.replace("/m/statements" as never));

export default function Statement() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const { month: raw } = useLocalSearchParams<{ month: string }>();
  const month = Array.isArray(raw) ? raw[0] : raw;
  const ok = isMonth(month);
  const tz = s.merchant?.timezone as string | undefined;
  const [kind, setKind] = useState("");
  const [note, setNote] = useState<Flash>(null);

  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => {
    if (!ok) return Promise.reject(new Error("That is not a month. A statement address ends like 2026-10."));
    return orDenied(() => s.mapi<Data>(`/statements/${month}`));
  }), [s.businessToken, month]);

  const d = data && data !== DENIED ? data : null;
  const lines = useMemo(() => ((d?.lines ?? []) as Data[]), [d]);
  const kinds = useMemo(() => [...new Set(lines.map((l) => String(l.kind)))], [lines]);
  const shown = useMemo(() => (kind ? lines.filter((l) => l.kind === kind) : lines), [lines, kind]);
  const top = { paddingTop: insets.top + 12, paddingHorizontal: pad } as const;

  if (!d || d.month !== month) {
    return (
      <View style={[{ flex: 1, backgroundColor: c.cream }, top]}>
        <Header title={ok ? monthName(month) : "Statement"} onBack={back} />
        {data === DENIED ? <AskManager who="the owner" what="Statements, payouts and the bank account are for the owner of the business." />
          : error ? (
            <View style={{ marginTop: 16, gap: 12 }}>
              <Failed error={error} onRetry={ok ? reload : undefined} />
              <Btn kind="out" small onPress={() => router.replace("/m/statements" as never)} style={{ alignSelf: "flex-start" }}>All statements</Btn>
            </View>
          ) : <Wait />}
      </View>
    );
  }

  const cur = String(d.currency ?? s.merchant?.currency ?? "USD"), sm = (d.sums ?? {}) as Data, biz = (d.business ?? {}) as Data;
  const payouts = (d.payouts ?? []) as Data[];
  const $ = (cents: number) => exact(cents, cur);
  const live = d.payments_mode === "live";
  const thisMonth = ymd(new Date(), tz).slice(0, 7);
  const open = month === thisMonth, future = month > thisMonth;

  // The totals by type count every line. What is left after taking them from the net is money LogaLuxe never held.
  const planFees = Number(sm.plan_fees_cents ?? 0);
  const byType = planFees + sm.charges_cents + sm.deposits_cents + sm.tips_cents + sm.refunds_cents + sm.fees_cents + sm.lead_fees_cents + sm.payout_fees_cents + sm.adjustments_cents;
  const outside = sm.net_cents - byType;
  const outsideLines = lines.filter((l) => !l.in_balance && l.kind !== "payout").reduce((a, l) => a + Number(l.amount_cents), 0);
  const outsideKnown = lines.length < 5000 && -outsideLines === outside;
  // The check a statement has to pass: what you started with, plus the month, less what was paid out.
  const expected = d.opening_cents + sm.net_cents + sm.payouts_cents;
  const adds = expected === d.closing_cents;

  const rows: [string, string, number][] = [
    ["Sales", plural(Number(sm.sales), "sale"), sm.charges_cents],
    ["Deposits released", "deposits that turned into a visit or were kept", sm.deposits_cents],
    ["Tips", "", sm.tips_cents],
    ["Refunds", "", sm.refunds_cents],
    ["LogaLuxe fees", "the fee on each payment", sm.fees_cents],
    ["Lead fees", "new clients LogaLuxe brought you, charged once each", sm.lead_fees_cents],
    ["Plan fee", "the monthly price of LogaLuxe Pro, taken from your payout balance", planFees],
    ["Payout fees", "instant payouts", sm.payout_fees_cents],
    ["Adjustments", "corrections, and payouts that failed and were returned", sm.adjustments_cents],
  ];

  const header = (
    <View>
      <Header title={String(d.label)} onBack={back} />
      <Row gap={8} wrap style={{ marginTop: 12 }}>
        <SmallBtn kind="out" icon="back" onPress={() => { setKind(""); setNote(null); router.replace(`/m/statement/${shiftMonth(month, -1)}` as never); }}>{monthName(shiftMonth(month, -1)).split(" ")[0]}</SmallBtn>
        {month < thisMonth ? <SmallBtn kind="out" onPress={() => { setKind(""); setNote(null); router.replace(`/m/statement/${shiftMonth(month, 1)}` as never); }}>{`${monthName(shiftMonth(month, 1)).split(" ")[0]} ›`}</SmallBtn> : null}
        <View style={{ flex: 1 }} />
        <CsvButton path={`/statements/${month}?format=csv`} token={s.businessToken} name={`statement-${biz.slug ?? "logaluxe"}-${month}.csv`} onNote={setNote} />
      </Row>
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {error ? <View style={{ marginTop: 12 }}><Failed error={error} onRetry={reload} /></View> : null}

      <Night style={{ marginTop: 14 }}>
        <Text style={nightLabel}>{open ? "Balance so far" : future ? "Balance" : "Closing balance"}</Text>
        <Text accessibilityLabel={$(d.closing_cents)} numberOfLines={1} adjustsFontSizeToFit style={[nightBig, { marginTop: 4 }]}>{$(d.closing_cents)}</Text>
        <Text style={nightBody}>What LogaLuxe owed you at the end of {dateShort(d.to)}, including money still settling.</Text>
        <Row gap={10} style={{ marginTop: 14, alignItems: "flex-start" }}>
          {([["Opening", $(d.opening_cents)], ["Net this month", exact(sm.net_cents, cur, true)], ["Paid out", $(sm.payouts_cents)]] as [string, string][]).map(([k, v]) => (
            <View key={k} style={{ flex: 1 }}>
              <Text style={{ fontFamily: f.body, fontSize: 12, color: "#C9BCB0" }}>{k}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: f.bold, fontSize: 15, color: "#F4ECE3" }}>{v}</Text>
            </View>
          ))}
        </Row>
      </Night>
      <Text style={[small, { marginTop: 10 }]}>
        {biz.name ?? s.merchant?.business} · {dateMed(d.from)} to {dateMed(d.to)} · all amounts in {cur}
        {open ? ". This month is not over, so these figures will change." : future ? ". This month has not started." : "."}
      </Text>

      <Grp>Payout balance</Grp>
      <Card style={{ paddingHorizontal: 16 }}>
        <Line strong name="Opening balance" note={`what LogaLuxe owed you at the start of ${dateShort(d.from)}`} value={$(d.opening_cents)} />
        {rows.map(([name, sub, cents]) => <Line key={name} name={name} note={sub || undefined} value={$(cents)} tone={cents < 0 ? "bad" : cents === 0 ? "muted" : undefined} />)}
        {outside !== 0 ? <Line name={outsideKnown ? "Less money taken outside LogaLuxe" : "Less money taken outside LogaLuxe, and other lines"} note="cash, a bank transfer or your own card machine: recorded above, but never held by LogaLuxe, so not part of a payout" value={$(outside)} tone={outside < 0 ? "bad" : undefined} /> : null}
        <Line strong name="Net toward payouts" note="what this month added to your payout balance" value={$(sm.net_cents)} />
        <Line name="Paid out to your bank" note={payouts.length ? `${plural(payouts.length, "payout")} created this month, listed below` : "no payouts were created this month"} value={$(sm.payouts_cents)} tone={sm.payouts_cents < 0 ? "bad" : "muted"} />
        <Line strong last name="Closing balance" note={`at the end of ${dateShort(d.to)}, including money still settling`} value={$(d.closing_cents)} />
      </Card>
      <View style={{ marginTop: 10 }}>
        <Note kind={adds ? "ok" : "bad"}>
          {adds
            ? `Checked: ${$(d.opening_cents)} opening, plus ${$(sm.net_cents)} net, less ${$(Math.abs(sm.payouts_cents))} paid out, comes to the closing balance of ${$(d.closing_cents)}.`
            : `These figures do not add up: opening + net + paid out comes to ${$(expected)}, but the closing balance is ${$(d.closing_cents)}. Contact LogaLuxe support before relying on this statement.`}
        </Note>
      </View>
      {sm.cash_cents !== 0 ? <Text style={[small, { marginTop: 8 }]}>Sales and tips taken outside LogaLuxe this month: {$(sm.cash_cents)}. {live ? "With real payments on, only deposits and pay links are held by LogaLuxe." : ""}</Text> : null}

      <Grp>Payouts created this month</Grp>
      {payouts.length ? (
        <Card style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
          {payouts.map((p, i) => {
            const st = payoutState(p);
            return (
              <View key={i} style={{ paddingVertical: 12, borderBottomWidth: i === payouts.length - 1 ? 0 : 1, borderBottomColor: c.line, gap: 6 }}>
                <Row between style={{ alignItems: "flex-start" }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{dayShort(p.paid_at ?? p.created_at, tz)} · {payoutKind(String(p.kind))}</Text>
                    <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{[p.bank_name ? `${p.bank_name}${p.account_last4 ? ` ···· ${p.account_last4}` : ""}` : "", p.reference ? `ref ${p.reference}` : "", p.fee_cents > 0 ? `${$(p.fee_cents)} fee` : ""].filter(Boolean).join(" · ") || "No bank on record"}</Text>
                  </View>
                  <Text style={{ fontFamily: f.bold, fontSize: 15, color: c.ink }}>{$(p.amount_cents)}</Text>
                </Row>
                <View style={{ flexDirection: "row" }}><Tag kind={st.kind}>{st.word}</Tag></View>
              </View>
            );
          })}
        </Card>
      ) : <Empty title="No payouts this month" />}

      <Grp>{`Every line · ${lines.length >= 5000 ? "the first 5,000" : lines.length}`}</Grp>
      {kinds.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginBottom: 10, flexGrow: 0 }}>
          <Chip on={!kind} onPress={() => setKind("")}>All</Chip>
          {kinds.map((k) => <Chip key={k} on={kind === k} onPress={() => setKind(k)}>{KIND[k] ?? cap(k)}</Chip>)}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={shown}
        keyExtractor={(l, i) => `${l.created_at}-${l.kind}-${i}`}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        contentContainerStyle={{ ...top, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ListEmptyComponent={<Empty title={`Nothing moved in ${d.label}`}>A sale, tip, refund, fee or payout in this month would be listed here.</Empty>}
        renderItem={({ item: l, index }) => {
          const n = Number(l.amount_cents), first = index === 0, last = index === shown.length - 1;
          const state = l.in_balance ? (l.status === "pending" ? "settling" : "") : "taken outside LogaLuxe";
          return (
            <View accessible accessibilityLabel={`${l.description || KIND[l.kind] || "Ledger line"}, ${exact(n, cur, true)}`} style={[piece(first, last), { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", gap: 12, alignItems: "flex-start" }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{l.description || KIND[l.kind] || "Ledger line"}</Text>
                <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{[KIND[l.kind] ?? cap(String(l.kind)), METHOD[l.method] ?? (l.method ? cap(String(l.method)) : ""), l.staff ? firstName(String(l.staff)) : ""].filter(Boolean).join(" · ")}</Text>
                <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{dayShort(l.created_at, tz)} · {clock(l.created_at, tz)}</Text>
              </View>
              <View style={{ alignItems: "flex-end", maxWidth: 140 }}>
                <Text style={{ fontFamily: f.bold, fontSize: 15, color: n < 0 ? c.bad : c.ink }}>{exact(n, cur, true)}</Text>
                {state ? <Text style={{ fontFamily: f.medium, fontSize: 11, lineHeight: 15, color: c.muted, textAlign: "right" }}>{state}</Text> : null}
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          <Text style={[small, { marginTop: 12 }]}>Deposits still held for a visit that has not happened are not on a statement until they are released. To print a statement or save it as a PDF, open it in the web app on a computer.</Text>
        }
      />
    </View>
  );
}
