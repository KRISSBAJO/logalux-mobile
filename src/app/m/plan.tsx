// The plan: Free or Pro, what each costs and includes, switching between them, and what has been paid.
// Read from GET /v1/m/settings (plans and billing), as the web's "Plan & billing" does. Only the owner can
// switch (POST /v1/m/plan). The Pro fee is taken from the payout balance by the API, never from a card.
// The billing history is the plan-fee lines of the ledger: month by month from the statements, with the
// day each was taken for the last 100 days (as far back as GET /v1/m/money looks in one call).
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { AskManager, Grp, Header, SmallBtn, Tag, Wait } from "@/components/mc-kit";
import { Bullet, Line, Night, nightBody, nightLabel, small, type Flash } from "@/components/mh-kit";
import { Card, Empty, Failed, Note, Row, Screen } from "@/components/ui";
import { qs, type Row as Data } from "@/lib/api";
import { money, ymd } from "@/lib/format";
import { DENIED, ask, orDenied, signedIn, soft } from "@/lib/mc-util";
import { dateMed, exact, momentMed, monthName } from "@/lib/mh-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const addDays = (day: string, n: number) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const PLAN_NAME: Record<string, string> = { free: "Free", pro: "Pro" };

export default function Plan() {
  const s = useSession();
  const m = s.merchant;
  const owner = m?.role === "owner";
  const [note, setNote] = useState<Flash>(null);
  const [busy, setBusy] = useState("");

  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(async () => {
    const settings = await s.mapi<Data>("/settings");
    const today = ymd(new Date(), String(settings.business?.timezone ?? m?.timezone ?? "UTC"));
    // The ledger is the owner's. A manager sees the plan and the totals, not the lines.
    const [months, recent] = await Promise.all([
      soft(() => s.mapi<Data>("/statements")),
      soft(() => s.mapi<Data>("/money" + qs({ kind: "plan_fee", from: addDays(today, -99), to: today }))),
    ]);
    return { settings, months, recent };
  })), [s.businessToken]);

  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!s.businessToken) return;
    if (seen.current) void refresh();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));

  if (!data || data === DENIED) {
    return (
      <Screen>
        <Header title="Plan" />
        {data === DENIED ? <AskManager what="The plan and its billing are looked after by managers and the owner." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const { settings, months, recent } = data;
  const b = (settings.business ?? {}) as Data, bill = (settings.billing ?? {}) as Data, plans = (settings.plans ?? []) as Data[];
  const cur = String(b.currency ?? m?.currency ?? "USD"), tz = String(b.timezone ?? m?.timezone ?? "UTC");
  const proCents = Number(bill.pro_price_cents ?? plans.find((p) => p.plan === "pro")?.plan_price_cents ?? 0);
  const proPrice = money(proCents, cur);
  const graceDays = Number(bill.grace_days ?? 0);
  const pro = b.plan === "pro";
  const status = !pro ? "No monthly fee"
    : bill.plan_due_since ? `Fee due since ${dateMed(bill.plan_due_since)}`
    : bill.plan_paid_through ? `Paid through ${dateMed(bill.plan_paid_through)}`
    : "First month not taken yet";

  // Billing history: each month that had a plan fee, and the day it was taken when the ledger still shows it.
  const charged = ((months.data?.statements ?? []) as Data[]).filter((x) => Number(x.plan_fees_cents ?? 0) !== 0);
  const lines = ((recent.data?.transactions ?? []) as Data[]);
  const takenOn = (month: string) => lines.filter((l) => ymd(new Date(l.created_at), tz).startsWith(month)).map((l) => momentMed(l.created_at, tz)).reverse().join(", ");

  const change = async (to: string) => {
    const question = to === "pro" ? "Switch to Pro?" : "Move to Free?";
    const detail = to === "pro"
      ? `${proPrice} a month is taken from your LogaLuxe payout balance, not from a card. The first month is taken as soon as your balance can cover it.`
      : "No further Pro fees are taken. Nothing is refunded for the month already paid.";
    if (!(await ask(question, detail, to === "pro" ? "Switch to Pro" : "Move to Free"))) return;
    setBusy(to); setNote(null);
    try {
      await s.mapi("/plan", { method: "POST", body: { plan: to } });
      setNote({ kind: "ok", text: to === "pro" ? "You are on Pro. The monthly fee is taken from your payout balance, the first as soon as the balance can cover it." : "You are on the Free plan. No further Pro fees are taken, and nothing is refunded for the month already paid." });
      await s.refresh().catch(() => undefined); // the rest of the app reads the plan from the session
      reload();
      // The API takes the first month a moment after the switch: look again so the fee shows without a pull.
      if (to === "pro") setTimeout(() => { void refresh(); }, 2500);
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message || "Something went wrong." });
    }
    setBusy("");
  };

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Plan" />
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {error ? <View style={{ marginTop: 12 }}><Failed error={error} onRetry={reload} /></View> : null}

      <Night style={{ marginTop: 14 }}>
        <Row between style={{ alignItems: "flex-start" }}>
          <Text style={nightLabel}>Your plan</Text>
          <Tag kind="night">{status}</Tag>
        </Row>
        <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 44, lineHeight: 50, color: "#F4ECE3", marginTop: 4 }}>{PLAN_NAME[String(b.plan)] ?? String(b.plan)}</Text>
        <Text style={nightBody}>
          {!pro ? "You pay nothing each month. LogaLuxe takes a fee from each payment, shown below."
            : bill.plan_due_since || !bill.plan_paid_through ? `${proPrice} a month. It will be taken when your balance reaches ${proPrice}.`
            : `${proPrice} a month. The next ${proPrice} is taken from your balance after that date.`}
        </Text>
        <Row gap={10} style={{ marginTop: 14, alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: f.body, fontSize: 12, color: "#C9BCB0" }}>Paid so far</Text>
            <Text style={{ fontFamily: f.bold, fontSize: 18, color: "#F4ECE3" }}>{exact(bill.paid_total_cents ?? 0, cur)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: f.body, fontSize: 12, color: "#C9BCB0" }}>Last taken</Text>
            <Text style={{ fontFamily: f.bold, fontSize: 18, color: "#F4ECE3" }}>{bill.last_charged_at ? momentMed(bill.last_charged_at, tz) : "Never"}</Text>
          </View>
        </Row>
      </Night>

      <Grp>The two plans</Grp>
      <View style={{ gap: 10 }}>
        {plans.map((p) => {
          const current = p.plan === b.plan, isPro = p.plan === "pro";
          return (
            <Card key={String(p.plan)} style={{ padding: 16, gap: 10, borderColor: current ? c.ink : c.line, borderWidth: current ? 2 : 1 }}>
              <Row between style={{ alignItems: "flex-start" }}>
                <Text accessibilityRole="header" style={{ fontFamily: f.semi, fontSize: 16, color: c.ink }}>{isPro ? "Pro" : "Free"}</Text>
                {current ? <Tag kind="ok">Current plan</Tag> : owner ? null : <Tag kind="grey">Not on this plan</Tag>}
              </Row>
              <Text style={{ fontFamily: f.serifBold, fontSize: 34, lineHeight: 40, color: c.ink }}>
                {money(p.plan_price_cents, cur)} <Text style={{ fontFamily: f.medium, fontSize: 13, color: c.muted }}>{Number(p.plan_price_cents) > 0 ? "per month" : "no monthly charge"}</Text>
              </Text>
              <View style={{ gap: 6 }}>
                <Bullet>Payment fee: {Number(p.transaction_pct)}%{Number(p.transaction_fixed_cents) > 0 ? ` + ${money(p.transaction_fixed_cents, cur)}` : ""} of each payment{p.transaction_cap_cents ? `, never more than ${money(p.transaction_cap_cents, cur)}` : ""}</Bullet>
                <Bullet>New-client fee, for bookings that come from LogaLuxe search: {Number(p.new_client_pct)}%</Bullet>
                <Bullet>Marketplace fee: {Number(p.marketplace_pct)}%</Bullet>
                <Bullet>Instant payout: {Number(p.instant_payout_pct) > 0 ? `${Number(p.instant_payout_pct)}% of the payout` : "no fee"}</Bullet>
              </View>
              {!current && owner ? <SmallBtn kind={isPro ? "ink" : "out"} busy={busy === p.plan} disabled={!!busy} onPress={() => change(String(p.plan))} style={{ alignSelf: "flex-start" }}>{isPro ? "Switch to Pro" : "Switch to Free"}</SmallBtn> : null}
            </Card>
          );
        })}
        {!plans.length ? <Empty title="No plans to show">The fee table for your country could not be read. Pull down to try again.</Empty> : null}
      </View>
      {owner ? null : <Text style={[small, { marginTop: 8 }]}>Only the owner can change the plan.</Text>}

      <Grp>How the Pro fee is paid</Grp>
      <Card style={{ padding: 16, gap: 8 }}>
        <Bullet>The Pro fee is {proPrice} a month. It is taken from your LogaLuxe payout balance, not from a card.</Bullet>
        <Bullet>The first month is taken as soon as your balance can cover it.</Bullet>
        <Bullet>If your balance cannot cover a month, it is tried again every day. After {graceDays} days without it, you move back to Free with nothing owed.</Bullet>
        <Bullet>Moving to Free stops further fees. Nothing is refunded for the month already paid.</Bullet>
      </Card>

      <Grp>Billing history</Grp>
      {months.denied ? <Text style={small}>The owner can see each Pro fee that was taken. Paid so far: {exact(bill.paid_total_cents ?? 0, cur)}.</Text>
        : !months.data ? <Failed error={months.error} onRetry={reload} />
        : charged.length ? (
          <Card style={{ paddingHorizontal: 16 }}>
            {charged.map((x, i) => {
              const on = takenOn(String(x.month));
              return <Line key={String(x.month)} last={i === charged.length - 1} name={`LogaLuxe Pro · ${monthName(String(x.month))}`} note={on ? `taken ${on} from your payout balance` : "taken from your payout balance"} value={exact(x.plan_fees_cents, cur)} onPress={() => router.push(`/m/statement/${x.month}` as never)} />;
            })}
          </Card>
        ) : <Empty title="No Pro fee has been taken yet">{pro ? `The first ${proPrice} is taken as soon as your payout balance can cover it, and shows here.` : "On the Free plan there is nothing to bill. A Pro fee would show here each month it is taken."}</Empty>}
      {charged.length ? <Text style={[small, { marginTop: 8 }]}>Each line opens that month&apos;s statement, where the fee sits beside everything else that moved.</Text> : null}

      <Grp>Fees you pay LogaLuxe</Grp>
      <Card style={{ paddingHorizontal: 16 }}>
        <View style={{ paddingVertical: 12, borderBottomWidth: owner ? 1 : 0, borderBottomColor: c.line }}>
          <Text style={small}>Payment and new-client fees are taken from each payment before it is paid out to you. {owner ? "The full breakdown, payment by payment, is under Money." : "The owner can see the full breakdown under Money."}</Text>
        </View>
        {owner ? (
          <>
            <Line name="Money" note="Every payment, fee and payout" value="" onPress={() => router.push("/m/money" as never)} />
            <Line last name="Statements" note="Fees added up month by month" value="" onPress={() => router.push("/m/statements" as never)} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
