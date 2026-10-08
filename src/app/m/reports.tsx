// Reports: how the business did over a period, against the period before.
// Every number is read from GET /v1/m/reports (and GET /v1/m/payroll for what each person earned),
// worked out the same way the web's Reports page works it out. Nothing is estimated.
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { AskManager, Grp, Header, Wait } from "@/components/mc-kit";
import { Bullet, CsvButton, Donut, HBar, Head, Heat, Kpi, Legend, Line, Night, PREV, RevenueBars, TONES, nightBig, nightBody, nightLabel, small, type Bar, type Flash, type Move } from "@/components/mh-kit";
import { Avatar, Card, Chip, Empty, Failed, Note, Row, Screen } from "@/components/ui";
import { qs, type Row as Data } from "@/lib/api";
import { firstName, money, plural } from "@/lib/format";
import { DENIED, orDenied, signedIn, soft } from "@/lib/mc-util";
import { SOURCE, cap, dateShort, dayMonth, hourName, pct, rate } from "@/lib/mh-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const RANGES = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["month", "This month"]] as const;
type Range = (typeof RANGES)[number][0];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The line under a figure: how it moved, coloured by whether the move is good news. */
function move(diff: number | null, text: (abs: string, sign: string) => string, fmt: (n: number) => string, goodWhenUp = true): Move {
  if (diff === null) return { text: "Nothing to compare with yet", tone: "flat" };
  if (diff === 0) return { text: "Same as the period before", tone: "flat" };
  const up = diff > 0;
  return { text: text(fmt(Math.abs(diff)), up ? "+" : "−"), tone: up === goodWhenUp ? "up" : "down" };
}
const none = () => move(null, () => "", String);

export default function Reports() {
  const s = useSession();
  const cur = (s.merchant?.currency as string) ?? "USD";
  const [range, setRange] = useState<Range>("30d");
  const [note, setNote] = useState<Flash>(null);

  const { data, error, loading, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(async () => {
    const d = await s.mapi<Data>("/reports" + qs({ range }));
    // What each person earned is for managers and the owner; a team member who may see reports gets the rest.
    const pay = await soft(() => s.mapi<Data>("/payroll" + qs({ from: d.from, to: d.to })));
    return { d, pay, range };
  })), [s.businessToken, range]);

  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 14, flexGrow: 0 }}>
      {RANGES.map(([id, name]) => <Chip key={id} on={range === id} onPress={() => { setNote(null); setRange(id); }}>{name}</Chip>)}
    </ScrollView>
  );

  if (!data || data === DENIED) {
    return (
      <Screen>
        <Header title="Reports" />
        {data === DENIED ? <AskManager what="Reports are for managers and the owner, unless the owner has given your sign-in the reports." />
          : error ? <>{chips}<View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View></> : <Wait />}
      </Screen>
    );
  }

  const { d, pay } = data;
  const stale = loading && data.range !== range; // another period is on its way
  const now = (d.now ?? {}) as Data, was = (d.before ?? {}) as Data, mix = (d.mix ?? {}) as Data;
  const byDay = (d.by_day ?? []) as Data[], sources = (d.sources ?? []) as Data[], staff = (d.staff ?? []) as Data[], heat = (d.heat ?? []) as Data[], top = (d.top_services ?? []) as Data[];
  const openMin = Number(d.open_min ?? 0);
  const payroll = ((pay.data?.payroll ?? []) as Data[]);
  const $ = (n: number) => money(n, cur);

  // The figures, each against the period before.
  const avgNow = now.sales > 0 ? Math.round(now.revenue_cents / now.sales) : null, avgWas = was.sales > 0 ? Math.round(was.revenue_cents / was.sales) : null;
  const rbNow = rate(now.rebooked, now.visitors), rbWas = rate(was.rebooked, was.visitors);
  const nsNow = rate(now.no_shows, now.bookings), nsWas = rate(was.no_shows, was.bookings);
  const pts = (n: number) => `${Math.round(n * 10) / 10} pts`;
  const revenueMove = was.revenue_cents > 0 ? move(Math.round(((now.revenue_cents - was.revenue_cents) / was.revenue_cents) * 100), (a, sg) => `${sg}${a} vs the period before`, (n) => `${n}%`) : none();
  const kpis: { name: string; value: string; move: Move }[] = [
    { name: "Bookings", value: String(now.bookings ?? 0), move: was.bookings > 0 || now.bookings > 0 ? move(now.bookings - was.bookings, (a, sg) => `${sg}${a} vs the period before`, String) : none() },
    { name: "Average ticket", value: avgNow === null ? "—" : $(avgNow), move: move(avgNow !== null && avgWas !== null ? avgNow - avgWas : null, (a, sg) => `${sg}${a} per sale`, $) },
    { name: "Rebook rate", value: rbNow === null ? "—" : `${Math.round(rbNow)}%`, move: move(rbNow !== null && rbWas !== null ? Math.round((rbNow - rbWas) * 10) / 10 : null, (a, sg) => `${sg}${a}`, pts) },
    { name: "No-show rate", value: nsNow === null ? "—" : `${nsNow}%`, move: move(nsNow !== null && nsWas !== null ? Math.round((nsNow - nsWas) * 10) / 10 : null, (a, sg) => `${sg}${a}`, pts, false) },
    { name: "New clients", value: String(now.new_clients ?? 0), move: was.new_clients > 0 || now.new_clients > 0 ? move(now.new_clients - was.new_clients, (a, sg) => `${sg}${a} vs the period before`, String) : none() },
    { name: "Tips", value: $(now.tips_cents), move: { text: `${$(was.tips_cents)} in the period before`, tone: "flat" } },
  ];

  // Revenue bars. Up to a month is drawn day by day; 90 days is added up by week.
  const weekly = byDay.length > 45;
  const bars: Bar[] = [];
  if (weekly) {
    const lead = byDay.length % 7; // a short first group, so the last one ends today
    for (let i = 0; i < byDay.length; i += i === 0 && lead ? lead : 7) {
      const chunk = byDay.slice(i, i + (i === 0 && lead ? lead : 7));
      const sum = (k: string) => chunk.reduce((a, x) => a + Number(x[k] ?? 0), 0);
      const first = String(chunk[0].day), last = String(chunk[chunk.length - 1].day);
      bars.push({ key: first, label: bars.length % 3 === 0 ? dayMonth(first) : "", title: `${dateShort(first)} to ${dateShort(last)}`, rev: sum("revenue_cents"), tips: sum("tips_cents"), prev: sum("previous_cents") });
    }
  } else {
    byDay.forEach((x, i) => {
      const day = String(x.day), every = byDay.length <= 10 ? 1 : 7;
      const label = byDay.length <= 10 ? dateShort(day).split(" ")[0] : (byDay.length - 1 - i) % every === 0 ? dayMonth(day) : "";
      bars.push({ key: day, label, title: dateShort(day), rev: Number(x.revenue_cents), tips: Number(x.tips_cents), prev: Number(x.previous_cents) });
    });
  }
  const anyRevenue = bars.some((b) => b.rev + b.tips + b.prev > 0);

  const srcTotal = sources.reduce((a, x) => a + Number(x.n), 0);

  // Busy hours: bookings that start in each two-hour band of each weekday.
  const hours = heat.map((x) => Number(x.hour));
  const bands: number[] = [];
  if (hours.length) for (let hr = Math.min(...hours); hr <= Math.max(...hours); hr += 2) bands.push(hr);
  const heatMax = Math.max(1, ...heat.map((x) => Number(x.n)));
  const cell = (dow: number, hour: number) => Number(heat.find((x) => Number(x.dow) === dow && Number(x.hour) === hour)?.n ?? 0);
  const perDay = DAYS.map((_, i) => heat.filter((x) => Number(x.dow) === i + 1).reduce((a, x) => a + Number(x.n), 0));
  const heatTotal = perDay.reduce((a, n) => a + n, 0);

  const topPeak = Math.max(1, ...top.map((x) => Number(x.revenue_cents)));
  const staffPeak = Math.max(1, ...staff.map((p) => Number(p.revenue_cents)));

  // A few plain sentences, each worked out from the numbers on this screen.
  const notes: ReactNode[] = [];
  if (heatTotal > 0) {
    const busiest = perDay.indexOf(Math.max(...perDay));
    notes.push(`${DAYS[busiest]} is your busiest day: ${perDay[busiest]} of ${plural(heatTotal, "booking")}, ${pct(perDay[busiest], heatTotal)}% of the total.`);
    const worked = perDay.map((n, i) => ({ n, i })).filter((x) => x.n > 0);
    const quiet = worked.reduce((a, x) => (x.n < a.n ? x : a), worked[0]);
    if (heatTotal >= 10 && quiet.i !== busiest && quiet.n * 2 <= perDay[busiest]) notes.push(`${DAYS[quiet.i]} is the quietest day you work, with ${plural(quiet.n, "booking")}. An offer in Marketing could fill it.`);
  }
  if (nsNow !== null && nsWas !== null && nsNow !== nsWas) notes.push(`No-shows ${nsNow < nsWas ? "fell" : "rose"} to ${nsNow}% of bookings, from ${nsWas}% in the period before.`);
  else if (nsNow !== null && now.no_shows === 0 && now.bookings > 0) notes.push("No one missed a booking in this period.");
  const rated = staff.filter((p) => p.visitors >= 5).map((p) => ({ name: firstName(p.name), r: Math.round((p.rebooked / p.visitors) * 100) })).sort((a, b) => b.r - a.r);
  if (rated.length >= 2 && rated[0].r - rated[rated.length - 1].r >= 10) {
    const low = rated[rated.length - 1];
    notes.push(`${low.name} has a rebook rate of ${low.r}%, ${rated[0].r - low.r} points below ${rated[0].name} at ${rated[0].r}%. A rebook prompt at checkout helps.`);
  }
  if (top[0]) notes.push(`${top[0].name} is your top earner: ${$(top[0].revenue_cents)} from ${top[0].sold} sold.`);
  if (openMin > 0 && staff.length && now.bookings > 0) {
    const booked = staff.reduce((a, p) => a + Number(p.booked_min), 0);
    notes.push(`Your team was booked for ${pct(booked, openMin * staff.length)}% of the hours you were open.`);
  }

  const owed = (p: Data) => Number(p.service_commission_cents) + Number(p.retail_commission_cents) + Number(p.tips_cents);
  const owedAll = payroll.reduce((a, p) => a + owed(p), 0);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Reports" />
      {chips}
      <Text style={[small, { marginTop: 10 }]}>{stale ? "Loading that period…" : `${d.range} · ${dateShort(d.from)} to ${dateShort(d.to)} · compared with the period before`}</Text>
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {error ? <View style={{ marginTop: 12 }}><Failed error={error} onRetry={reload} /></View> : null}

      <View style={{ opacity: stale ? 0.45 : 1 }}>
        <Night style={{ marginTop: 14 }}>
          <Text style={nightLabel}>Revenue</Text>
          <Text accessibilityLabel={`Revenue ${$(now.revenue_cents)}`} numberOfLines={1} adjustsFontSizeToFit style={[nightBig, { fontSize: 44, lineHeight: 50, marginTop: 4 }]}>{$(now.revenue_cents)}</Text>
          <Text style={[nightBody, { color: revenueMove.tone === "up" ? "#8FD3A5" : revenueMove.tone === "down" ? "#F0A8A1" : "#C9BCB0", fontFamily: f.medium }]}>{revenueMove.text}</Text>
          <Text style={[nightBody, { marginTop: 10 }]}>From {plural(Number(now.sales ?? 0), "sale")}, after discounts and refunds, before tips. The period before: {$(was.revenue_cents)} from {plural(Number(was.sales ?? 0), "sale")}.</Text>
        </Night>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
          {kpis.map((k) => <Kpi key={k.name} name={k.name} value={k.value} move={k.move} />)}
        </View>

        <Card style={{ marginTop: 12, padding: 16, gap: 10, backgroundColor: c.goldBg, borderColor: "#EBD9AE" }}>
          <Head title={`${d.range} in plain words`} />
          {notes.length ? notes.map((n, i) => <Bullet key={i}>{n}</Bullet>) : <Bullet>Nothing to report yet. This fills in with your first bookings and sales.</Bullet>}
        </Card>

        <Card style={{ marginTop: 12, padding: 16, gap: 12 }}>
          <Head title={`Revenue by ${weekly ? "week" : "day"}`} />
          {anyRevenue ? (
            <>
              <Legend items={[["Sales", c.ink], ["Tips", c.gold], ["The period before", PREV]]} />
              <RevenueBars key={data.range} bars={bars} say={(b) => `${b.title} · ${$(b.rev)} sales · ${$(b.tips)} tips · ${$(b.prev)} before`}
                label={`Revenue by ${weekly ? "week" : "day"}: ${$(now.revenue_cents)} in sales and ${$(now.tips_cents)} in tips, against ${$(was.revenue_cents)} in the period before.`} />
              <Text style={small}>{$(now.revenue_cents)} in sales and {$(now.tips_cents)} in tips. The period before: {$(was.revenue_cents)} and {$(was.tips_cents)}.</Text>
            </>
          ) : <Text style={small}>No sales in this period or the one before. Bars appear here once a sale is checked out.</Text>}
        </Card>

        <Card style={{ marginTop: 12, padding: 16, gap: 12 }}>
          <Head title="Where bookings come from" />
          {srcTotal > 0 ? (
            <Row gap={16} style={{ alignItems: "center" }}>
              <Donut parts={sources.map((x, i) => ({ n: Number(x.n), color: TONES[i % TONES.length] }))} total={srcTotal} noun={srcTotal === 1 ? "booking" : "bookings"} />
              <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                {sources.map((x, i) => (
                  <View key={String(x.source)} accessible accessibilityLabel={`${SOURCE[x.source] ?? cap(String(x.source || "Other"))}: ${pct(x.n, srcTotal)}%, ${plural(Number(x.n), "booking")}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: TONES[i % TONES.length] }} />
                    <Text numberOfLines={2} style={{ flex: 1, fontFamily: f.medium, fontSize: 13, lineHeight: 17, color: c.ink }}>{SOURCE[x.source] ?? cap(String(x.source || "Other"))}</Text>
                    <Text style={{ fontFamily: f.bold, fontSize: 13, color: c.ink }}>{pct(x.n, srcTotal)}%</Text>
                  </View>
                ))}
              </View>
            </Row>
          ) : <Text style={small}>No bookings in this period. Each booking is counted by how it was made.</Text>}
          <Text style={small}>Counted from every booking in the period that was not cancelled or moved.</Text>
        </Card>

        <Card style={{ marginTop: 12, padding: 16, gap: 14 }}>
          <Head title="Top services" />
          {top.length ? top.map((x) => <HBar key={String(x.name)} name={String(x.name)} note={`${x.sold} sold`} value={$(x.revenue_cents)} share={pct(x.revenue_cents, topPeak)} />)
            : <Text style={small}>No services sold in this period.</Text>}
        </Card>

        <Card style={{ marginTop: 12, padding: 16, gap: 14 }}>
          <Head title="Clients" />
          {mix.visits > 0 ? (
            <>
              <HBar name="Returning" value={`${pct(mix.returning_visits, mix.visits)}%`} share={pct(mix.returning_visits, mix.visits)} color={c.ink} />
              <HBar name="New" value={`${pct(mix.new_visits, mix.visits)}%`} share={pct(mix.new_visits, mix.visits)} color={c.gold} />
              <HBar name="Paid deposit" value={`${pct(mix.with_deposit, mix.visits)}%`} share={pct(mix.with_deposit, mix.visits)} />
              <HBar name="Left a review" value={`${Math.min(100, pct(mix.reviews, mix.visits))}%`} share={Math.min(100, pct(mix.reviews, mix.visits))} />
            </>
          ) : <Text style={small}>No finished visits in this period.</Text>}
          {mix.visits > 0 || mix.sales > 0 ? (
            <Text style={small}>
              {mix.visits > 0 ? `Out of ${plural(Number(mix.visits), "finished visit")}. ` : ""}
              {mix.sales > 0 ? `Retail in ${pct(mix.sales_with_retail, mix.sales)}% of sales · average tip ${mix.sold_cents > 0 ? `${pct(mix.tips_cents, mix.sold_cents)}%` : "—"}` : ""}
            </Text>
          ) : null}
        </Card>

        <Card style={{ marginTop: 12, padding: 16, gap: 12 }}>
          <Head title="Busy hours" sub="Bookings by the time they start. Darker is busier." />
          {bands.length ? (
            <Heat days={DAYS} bands={bands} count={cell} max={heatMax} bandName={hourName}
              say={(day, hr, n) => `${day}, ${hourName(hr)} to ${hourName(hr + 2)} · ${plural(n, "booking")}`} />
          ) : <Text style={small}>No bookings in this period.</Text>}
        </Card>

        <Grp>Team</Grp>
        {staff.length ? (
          <Card style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
            {staff.map((p, i) => (
              <View key={String(p.id)} accessible accessibilityLabel={`${p.name}: ${$(p.revenue_cents)} revenue, ${plural(Number(p.bookings), "booking")}`} style={{ paddingVertical: 14, borderBottomWidth: i === staff.length - 1 ? 0 : 1, borderBottomColor: c.line, gap: 10 }}>
                <Row gap={10}>
                  <Avatar name={String(p.name)} tone={p.tone} size={36} />
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.semi, fontSize: 15, color: c.ink }}>{p.name}</Text>
                  <Text style={{ fontFamily: f.bold, fontSize: 16, color: c.ink }}>{$(p.revenue_cents)}</Text>
                </Row>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: c.cream2, overflow: "hidden" }}>
                  <View style={{ width: `${pct(p.revenue_cents, staffPeak)}%`, height: 6, borderRadius: 3, backgroundColor: c.ink }} />
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
                  {([
                    ["Bookings", String(p.bookings)],
                    ["Booked", openMin > 0 ? `${pct(p.booked_min, openMin)}%` : "—"],
                    ["Per booking", p.bookings > 0 ? $(Math.round(p.revenue_cents / p.bookings)) : "—"],
                    ["Tips", $(p.tips_cents)],
                    ["Rebook", p.visitors > 0 ? `${pct(p.rebooked, p.visitors)}%` : "—"],
                    ["Rating", p.rating > 0 ? Number(p.rating).toFixed(1) : "—"],
                  ] as [string, string][]).map(([k, v]) => (
                    <View key={k} style={{ width: "33.33%" }}>
                      <Text style={{ fontFamily: f.body, fontSize: 11.5, color: c.muted }}>{k}</Text>
                      <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{v}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </Card>
        ) : <Empty title="No team members yet">Add your team in Staff to compare them here.</Empty>}
        <Text style={[small, { marginTop: 8 }]}>Revenue is what each person sold, most first. Booked is time in the chair against the hours the business was open. Rebook is the share of clients seen who have a later booking.</Text>

        {pay.data ? (
          <>
            <Grp>Payroll and commission</Grp>
            <Card style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
              <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
                <Text style={small}>What each person earned from {dateShort(pay.data.from ?? d.from)} to {dateShort(d.to)}. Refunded sales are left out.</Text>
              </View>
              {payroll.length ? payroll.map((p) => (
                <View key={String(p.id)} style={{ borderBottomWidth: 1, borderBottomColor: c.line, paddingBottom: 10 }}>
                  <Line last strong name={String(p.name)} note={plural(Number(p.sales), "sale")} value={$(owed(p))} />
                  <View style={{ gap: 4 }}>
                    {([
                      ["Services", $(p.service_cents), `${$(p.service_commission_cents)} at ${p.commission_pct}%`],
                      ["Retail", $(p.retail_cents), `${$(p.retail_commission_cents)} at ${p.retail_commission_pct}%`],
                      ["Tips", "", $(p.tips_cents)],
                    ] as [string, string, string][]).map(([k, sold, earned]) => (
                      <View key={k} style={{ flexDirection: "row", gap: 8 }}>
                        <Text style={{ width: 64, fontFamily: f.body, fontSize: 12.5, color: c.muted }}>{k}</Text>
                        <Text style={{ flex: 1, fontFamily: f.body, fontSize: 12.5, color: c.muted }}>{sold ? `${sold} sold` : ""}</Text>
                        <Text style={{ fontFamily: f.medium, fontSize: 12.5, color: c.ink }}>{earned}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )) : <View style={{ paddingVertical: 14 }}><Text style={small}>No team members yet.</Text></View>}
              {payroll.length > 1 ? <Line strong name="Total owed" note={`${plural(payroll.reduce((a, p) => a + Number(p.sales ?? 0), 0), "sale")} · ${$(payroll.reduce((a, p) => a + Number(p.tips_cents ?? 0), 0))} of it tips`} value={$(owedAll)} /> : null}
              <View style={{ paddingVertical: 12, gap: 10 }}>
                <Text style={small}>Owed is commission on services and retail plus tips. Rates are set for each person in Staff.</Text>
                <CsvButton path={"/payroll" + qs({ from: d.from, to: d.to, format: "csv" })} token={s.businessToken} name={`payroll-${d.from}-to-${d.to}.csv`} onNote={setNote} style={{ alignSelf: "flex-start" }}>Payroll CSV</CsvButton>
              </View>
            </Card>
          </>
        ) : null}

        <Grp>Take the numbers with you</Grp>
        <Card style={{ padding: 16, gap: 10 }}>
          <Head title="Sales in this period" sub="One row per sale: the client, who served them, what was sold, tax, tip, how it was paid." />
          <CsvButton kind="ink" path={"/reports/export" + qs({ range })} token={s.businessToken} name={`sales-${d.from}-to-${d.to}.csv`} onNote={setNote} style={{ alignSelf: "flex-start" }}>Sales CSV</CsvButton>
          {note ? <Note kind={note.kind}>{note.text}</Note> : null}
        </Card>
        {s.merchant?.role === "owner" ? (
          <Card style={{ marginTop: 12, paddingHorizontal: 16 }}>
            <Line last name="Monthly statements" note="What came in, fees, payouts and what is owed, month by month" value="" onPress={() => router.push("/m/statements" as never)} />
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
