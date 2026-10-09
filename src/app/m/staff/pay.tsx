// Commission & pay: what each person earned in a period (GET /v1/m/payroll). It is a summary to pay from:
// nothing here is changed, and LogaLuxe does not send wages. Rates are changed on each person's page.
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { AskManager, Grp, Header, Sheet, SmallBtn, Wait, mc } from "@/components/mc-kit";
import { DateField, Fig } from "@/components/me-kit";
import { Btn, Card, Chip, Empty, Failed, Icon, Note, Row, Screen, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { money, plural , ymd } from "@/lib/format";
import { DENIED, dateOnly, orDenied, signedIn } from "@/lib/mc-util";
import { PAY, atLeast, dur, exportPayroll, periods, rentDays } from "@/lib/me-staff";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function Pay() {
  const s = useSession();
  const tz = s.merchant?.timezone as string | undefined, cur = (s.merchant?.currency as string) ?? "USD";
  const today = ymd(new Date(), tz);
  const choices = periods(today);
  const [key, setKey] = useState("month");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: choices[0].from, to: today });
  const [pick, setPick] = useState<{ from: string; to: string } | null>(null);
  const [one, setOne] = useState<Data | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const range = key === "custom" ? custom : choices.find((p) => p.key === key) ?? choices[0];

  const { data, error, loading, refreshing, refresh, reload } = useLoad(signedIn(s, () => (atLeast(s.merchant, "manager") ? orDenied(() => s.mapi<Data>(`/payroll?from=${range.from}&to=${range.to}`)) : Promise.resolve<Data | typeof DENIED>(DENIED))), [s.businessToken, range.from, range.to]);

  if (!data || data === DENIED) {
    return (
      <Screen>
        <Header title="Commission & pay" />
        {data === DENIED || (s.merchant && !atLeast(s.merchant, "manager")) ? <AskManager what="What each person earned is for a manager or the owner to see." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const people = (data.payroll ?? []) as Data[], renters = (data.renters ?? []) as Data[];
  const total = (k: string) => people.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  const most = Math.max(1, ...people.map((x) => Number(x.earned_cents ?? 0)));
  const commission = total("service_commission_cents") + total("retail_commission_cents");

  const exportIt = async () => {
    setExporting(true); setNote(null);
    try {
      const out = await exportPayroll(s.businessToken, String(data.from), String(data.to));
      setNote(out === "saved" ? { kind: "ok", text: `Saved payroll-${data.from}-to-${data.to}.csv.` } : out === "shared" ? null : out === "unavailable" ? { kind: "bad", text: "This device cannot share files. Download the payroll from the web app on a computer." } : { kind: "bad", text: "The payroll file could not be handed over. Try again." });
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setExporting(false);
  };

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Commission & pay" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, marginHorizontal: -pad }} contentContainerStyle={{ gap: 8, paddingHorizontal: pad }}>
        {choices.map((p) => <Chip key={p.key} on={key === p.key} onPress={() => setKey(p.key)}>{p.name}</Chip>)}
        <Chip on={key === "custom"} icon="calendar" onPress={() => setPick({ from: String(data.from), to: String(data.to) })}>{key === "custom" ? `${dateOnly(custom.from)} to ${dateOnly(custom.to)}` : "Other dates"}</Chip>
      </ScrollView>

      {/* The one number that matters: what the team earned */}
      <View style={{ backgroundColor: mc.night, borderRadius: 22, padding: 18, marginTop: 14, opacity: loading ? 0.6 : 1 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: mc.nightMuted }}>Earned · {dateOnly(String(data.from))} to {dateOnly(String(data.to))}</Text>
        <Text style={{ fontFamily: f.serif, fontSize: 40, lineHeight: 46, color: mc.onNight, marginTop: 4 }}>{money(total("earned_cents"), cur)}</Text>
        <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: mc.nightMuted, marginTop: 4 }}>
          {money(total("wage_cents"), cur)} wages and salary · {money(commission, cur)} commission · {money(total("tips_cents"), cur)} tips
        </Text>
        <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: mc.nightMuted }}>
          {plural(total("sales"), "sale")} · {money(total("service_cents"), cur)} services · {money(total("retail_cents"), cur)} retail · {dur(total("rostered_min"))} rostered
        </Text>
        <Row gap={8} style={{ marginTop: 14 }}>
          <SmallBtn kind="gold" busy={exporting} disabled={!people.length} onPress={exportIt}>Export as a spreadsheet</SmallBtn>
        </Row>
      </View>
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}

      <Grp>By person · {people.length}</Grp>
      {people.length ? (
        <Card>
          {people.map((x, i) => (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`${x.name}, ${PAY[String(x.pay_type)] ?? x.pay_type}, earned ${money(x.earned_cents, cur)}. See how it adds up`} onPress={() => setOne(x)}
              style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 16, minHeight: 64, gap: 8, borderBottomWidth: i === people.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
              <Row gap={10}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{String(x.name)}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>
                    {PAY[String(x.pay_type)] ?? String(x.pay_type)}{x.pay_type === "hourly" ? ` · ${money(x.hourly_cents, cur)} an hour` : x.pay_type === "salary" ? ` · ${money(x.salary_cents, cur)} a month` : ""} · {plural(Number(x.sales ?? 0), "sale")}
                  </Text>
                </View>
                <Text style={{ fontFamily: f.serifBold, fontSize: 20, lineHeight: 24, color: c.ink }}>{money(x.earned_cents, cur)}</Text>
                <Icon name="next" size={16} color={c.muted2} />
              </Row>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: mc.tile, overflow: "hidden" }}>
                <View style={{ width: `${Math.round((Number(x.earned_cents ?? 0) / most) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: c.gold }} />
              </View>
            </Pressable>
          ))}
        </Card>
      ) : <Empty title="Nothing to show">Add the team and take a sale to see pay here.</Empty>}

      {renters.length ? (
        <>
          <Grp right={<Pressable accessibilityRole="button" onPress={() => router.push("/m/staff/rent" as never)} hitSlop={14}><Text style={{ fontFamily: f.semi, fontSize: 12, color: c.wine }}>Rent by period</Text></Pressable>}>Chair renters · {renters.length}</Grp>
          <Card>
            {renters.map((x, i) => (
              <Pressable key={x.id} accessibilityRole="button" onPress={() => router.push(`/m/staff/${x.id}` as never)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 60, borderBottomWidth: i === renters.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{String(x.name)}{x.trading_name ? ` · ${x.trading_name}` : ""}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{money(x.rent_cents, cur)} {x.rent_period === "monthly" ? "a month" : "a week"} · {rentDays(x)} · {money(x.paid_cents, cur)} paid in these days</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontFamily: f.bold, fontSize: 14, color: Number(x.owed_cents) > 0 ? c.wine : c.ink }}>{money(x.owed_cents, cur)}</Text>
                  <Text style={{ fontFamily: f.medium, fontSize: 11, lineHeight: 15, color: c.muted }}>owed now</Text>
                </View>
              </Pressable>
            ))}
          </Card>
          <T size={12} muted style={{ marginTop: 8 }}>Renters are not paid by the business, so they are listed apart with the rent they owe you. Their own takings are not in LogaLuxe.</T>
        </>
      ) : null}

      <T size={12} muted style={{ marginTop: 14 }}>
        Hours are rostered hours in these days, without breaks or approved time off. Hourly pay is those hours at the person&apos;s rate; a salary is counted by the day. Commission is worked out on what each person sold, at the rate they have today, and refunded sales are left out. The owner takes what is left, so no commission is counted for them. Earned is wage or salary, plus commission, plus tips. This is a summary to pay from: LogaLuxe does not send wages.
      </T>

      {/* How one person's pay adds up */}
      <Sheet tall open={!!one} onClose={() => setOne(null)} title={String(one?.name ?? "")} sub={one ? `${PAY[String(one.pay_type)] ?? one.pay_type} · ${dateOnly(String(data.from))} to ${dateOnly(String(data.to))}` : undefined}
        footer={one ? <Btn kind="out" onPress={() => { const id = one.id; setOne(null); router.push(`/m/staff/${id}?open=pay` as never); }}>Change how they are paid</Btn> : undefined}>
        {one ? (
          <>
            <Card>
              <Fig name="Rostered hours" value={dur(Number(one.rostered_min ?? 0))} sub="Without breaks or approved time off" />
              <Fig name={one.pay_type === "salary" ? "Salary" : "Wage"} value={Number(one.wage_cents) > 0 ? money(one.wage_cents, cur) : "None"} sub={one.pay_type === "hourly" ? `${money(one.hourly_cents, cur)} an hour` : one.pay_type === "salary" ? `${money(one.salary_cents, cur)} a month, by the day` : undefined} last />
            </Card>
            <Card>
              <Fig name="Sales" value={String(one.sales ?? 0)} />
              <Fig name="Services sold" value={money(one.service_cents, cur)} />
              <Fig name="Service commission" value={money(one.service_commission_cents, cur)} sub={one.pay_type === "owner" ? "None for an owner" : `${Number(one.commission_pct)}% of services`} />
              <Fig name="Retail sold" value={money(one.retail_cents, cur)} />
              <Fig name="Retail commission" value={money(one.retail_commission_cents, cur)} sub={one.pay_type === "owner" ? "None for an owner" : `${Number(one.retail_commission_pct)}% of retail`} last />
            </Card>
            <Card>
              <Fig name="Tips" value={money(one.tips_cents, cur)} />
              <Fig name="Earned" value={money(one.earned_cents, cur)} bold last sub="Wage or salary, plus commission, plus tips" />
            </Card>
          </>
        ) : null}
      </Sheet>

      {/* Other dates */}
      <Sheet tall open={!!pick} onClose={() => setPick(null)} title="Other dates" sub="The first and last day to count."
        footer={<Btn disabled={!pick?.from || !pick?.to} onPress={() => { if (pick) { setCustom(pick); setKey("custom"); setPick(null); } }}>Show these days</Btn>}>
        {pick ? (
          <>
            <DateField label="From" value={pick.from} today={today} onChange={(d) => setPick({ from: d, to: pick.to && pick.to < d ? d : pick.to })} />
            <DateField label="To" value={pick.to} today={today} min={pick.from} onChange={(d) => setPick({ ...pick, to: d })} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
