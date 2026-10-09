// Money: what can be paid out, what is on hold, the payout account, and the ledger (design: M5-Money).
// Everything is read from GET /v1/m/money, which is the owner's. Bank details are never typed into the app.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AskManager, Wait, Grp, Header, McIcon, Sheet, SmallBtn, Tag, WebLink, mc, type McIconName } from "@/components/mc-kit";
import { CsvButton, type Flash } from "@/components/mh-kit";
import { Btn, Card, Empty, Failed, Icon, Note, Row, T } from "@/components/ui";
import { qs, type Row as Data } from "@/lib/api";
import { clock, dayShort, money, plural, ymd } from "@/lib/format";
import { DENIED, cap, dateOnly, orDenied, signedIn } from "@/lib/mc-util";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const KIND: Record<string, string> = { charge: "Sale", deposit: "Deposit", tip: "Tip", fee: "LogaLuxe fee", lead_fee: "Lead fee", plan_fee: "Plan fee", refund: "Refund", payout: "Payout", payout_fee: "Instant payout fee", adjustment: "Adjustment" };
const KIND_ICON: Record<string, McIconName | "card"> = { charge: "card", deposit: "shield", tip: "tip", fee: "percent", lead_fee: "percent", plan_fee: "percent", refund: "refund", payout: "bank", payout_fee: "percent", adjustment: "list" };
const METHOD: Record<string, string> = { card: "Card", tap: "Tap to pay", cash: "Cash", transfer: "Bank transfer", wallet: "Wallet", link: "Pay link", gift: "Gift card", credit: "Store credit", stripe: "Stripe", paystack: "Paystack", flutterwave: "Flutterwave", logaluxe: "LogaLuxe" };
const PROVIDER: Record<string, string> = { stripe: "Stripe", paystack: "Paystack", flutterwave: "Flutterwave" };
const SCHEDULE: Record<string, string> = { daily: "daily", weekly: "weekly", manual: "on request" };
const FIRST_DAYS = 7, MORE_DAYS = 30, API_LIMIT = 300;

/** A calendar date some days before or after another, both as YYYY-MM-DD. */
const addDays = (day: string, n: number) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

/** How a ledger line stands, in the words the web app uses. */
function lineState(t: Data, tz: string): string {
  if (t.status === "held") return "held until visit";
  if (!t.in_balance) return t.kind === "refund" ? "refunded outside LogaLuxe" : "taken outside LogaLuxe";
  if (t.kind === "refund") return "refunded";
  if (t.status === "settled") return "settled";
  if (t.status === "pending") return t.settles_at ? `settles ${dayShort(t.settles_at, tz)}` : "settling";
  return String(t.status ?? "");
}

function payoutState(p: Data): { word: string; bg: string; fg: string; icon: "check" | "clock" } {
  if (p.status === "paid") return { word: String(p.reference ?? "").startsWith("sim_") ? "recorded as paid, simulated" : "paid", bg: c.ok, fg: mc.onNight, icon: "check" };
  if (p.status === "failed") return { word: "failed, money returned to your balance", bg: c.bad, fg: mc.onNight, icon: "clock" };
  if (p.status === "sending") return { word: "being sent to your bank", bg: c.gold, fg: c.ink, icon: "clock" };
  if (p.status === "scheduled") return { word: "scheduled, not sent yet", bg: "#EFE5DA", fg: c.ink, icon: "clock" };
  return { word: cap(String(p.status ?? "")).toLowerCase(), bg: "#EFE5DA", fg: c.ink, icon: "clock" };
}
const bankOf = (p: Data) => (p.bank_name ? `${p.bank_name}${p.account_last4 ? ` ···· ${p.account_last4}` : ""}` : PROVIDER[p.provider] ?? cap(String(p.provider ?? "")));

export default function Money() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const m = s.merchant;
  const tz = m?.timezone as string | undefined, cur = (m?.currency as string) ?? "USD";
  const today = ymd(new Date(), tz);

  const [older, setOlder] = useState<Data[]>([]);
  const [since, setSince] = useState(addDays(today, -(FIRST_DAYS - 1)));
  const [cut, setCut] = useState(false); // a window came back full, so some of its lines are missing
  const [moreBusy, setMoreBusy] = useState(false), [moreError, setMoreError] = useState("");
  const [paying, setPaying] = useState(false), [payBusy, setPayBusy] = useState(false), [payError, setPayError] = useState("");
  const [note, setNote] = useState("");
  const [fileNote, setFileNote] = useState<Flash>(null);

  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, async () => {
    const from = addDays(ymd(new Date(), tz), -(FIRST_DAYS - 1));
    const out = await orDenied(() => s.mapi<Data>("/money" + qs({ from, to: ymd(new Date(), tz) })));
    setOlder([]); setSince(from); setMoreError("");
    setCut(out !== DENIED && ((out.transactions ?? []) as Data[]).length >= API_LIMIT);
    return out;
  }), [s.businessToken, tz]);

  // Back from the web's payout-account page: the account may now exist.
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!s.businessToken) return;
    if (seen.current) void refresh();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));

  const d = data && data !== DENIED ? data : null;
  const week = useMemo(() => ((d?.transactions ?? []) as Data[]), [d]);
  const all = useMemo(() => [...week, ...older], [week, older]);

  const sections = useMemo(() => {
    const yesterday = addDays(today, -1);
    const by = new Map<string, Data[]>();
    for (const t of all) {
      const k = ymd(new Date(t.created_at), tz);
      by.set(k, [...(by.get(k) ?? []), t]);
    }
    return [...by.entries()].map(([k, rows]) => ({ key: k, title: k === today ? "Today" : k === yesterday ? "Yesterday" : dateOnly(k), data: rows }));
  }, [all, today, tz]);

  // Takings for each of the last seven days, from the same lines the list shows.
  const bars = useMemo(() => {
    const oldest = week.length >= API_LIMIT ? ymd(new Date(week[week.length - 1].created_at), tz) : "";
    return Array.from({ length: FIRST_DAYS }, (_, i) => {
      const day = addDays(today, i - (FIRST_DAYS - 1));
      const known = !oldest || day > oldest;
      const cents = week.filter((t) => ["charge", "deposit", "tip"].includes(t.kind) && t.status !== "held" && ymd(new Date(t.created_at), tz) === day).reduce((n, t) => n + Number(t.amount_cents), 0);
      return { day, cents, known, letter: dateOnly(day).slice(0, 1), today: day === today };
    });
  }, [week, today, tz]);

  const showEarlier = async () => {
    setMoreBusy(true); setMoreError("");
    const to = addDays(since, -1), from = addDays(since, -MORE_DAYS);
    try {
      const out = await s.mapi<Data>("/money" + qs({ from, to }));
      const got = (out.transactions ?? []) as Data[];
      setOlder((x) => [...x, ...got]);
      setSince(from);
      if (got.length >= API_LIMIT) setCut(true);
    } catch (e) {
      setMoreError((e as Error).message);
    }
    setMoreBusy(false);
  };

  const payOut = async () => {
    if (payBusy) return;
    setPayBusy(true); setPayError("");
    try {
      const made = await s.mapi<Data>("/payouts", { body: { instant: false } });
      const fresh = await s.mapi<Data>("/money").catch(() => null);
      const p = ((fresh?.payouts ?? []) as Data[]).find((x) => x.id === made.id);
      setNote(p ? (fresh?.account?.mode !== "live" ? `Payout of ${money(p.amount_cents, p.currency)} recorded as paid. Payments are in simulation, so no bank transfer was made.` : `Payout of ${money(p.amount_cents, p.currency)} is on its way to your bank.`) : "Payout created.");
      setPaying(false);
      reload();
    } catch (e) {
      setPayError((e as Error).message);
    }
    setPayBusy(false);
  };

  const top = { paddingTop: insets.top + 12, paddingHorizontal: pad } as const;
  const statements = (
    <Pressable accessibilityRole="button" accessibilityLabel="Statements" onPress={() => router.push("/m/statements" as never)} hitSlop={6}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.white, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.8 : 1 })}>
      <McIcon name="doc" />
    </Pressable>
  );

  if (!d) {
    return (
      <View style={[{ flex: 1, backgroundColor: c.cream }, top]}>
        <Header title="Money" size={30} />
        {data === DENIED ? <AskManager who="the owner" what="Money, payouts and the bank account are for the owner of the business." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </View>
    );
  }

  const bal = (d.balances ?? {}) as Data, mo = (d.month ?? {}) as Data, account = d.account as Data | null;
  const payouts = (d.payouts ?? []) as Data[];
  const available = Number(bal.available_cents ?? 0);
  const whole = Math.trunc(available / 100) * 100, centsPart = String(Math.abs(available % 100)).padStart(2, "0");
  const provider = PROVIDER[String(account?.provider ?? d.provider)] ?? cap(String(account?.provider ?? d.provider ?? ""));
  const bank = account ? `${account.bank_name || "your bank"}${account.account_last4 ? ` ····${account.account_last4}` : ""}` : "";
  const simulated = account ? account.mode !== "live" : d.payments_mode !== "live";
  const canPay = !!account && account.status === "verified" && available >= 100;
  const maxBar = Math.max(1, ...bars.map((b) => b.cents));
  const quiet = !all.length;

  const header = (
    <View>
      <Header title="Money" size={30} right={statements} />
      {note ? <View style={{ marginTop: 12 }}><Note>{note}</Note></View> : null}

      {/* What can be paid out */}
      <View style={{ marginTop: 16, backgroundColor: mc.night, borderRadius: 20, padding: 16 }}>
        <Row between style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.72, textTransform: "uppercase", color: mc.nightMuted }}>Available for payout</Text>
            <Text accessibilityLabel={money(available, cur)} style={{ fontFamily: f.serifBold, fontSize: 44, lineHeight: 48, color: mc.onNight, marginTop: 6 }}>
              {money(whole, cur)}<Text style={{ fontSize: 22, color: mc.nightMuted }}>.{centsPart}</Text>
            </Text>
          </View>
          {account ? <Tag kind="night">{provider} · {SCHEDULE[String(d.schedule)] ?? d.schedule}</Tag> : null}
        </Row>

        <Row gap={10} style={{ marginTop: 14, alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: f.body, fontSize: 12, color: mc.nightMuted }}>Settling</Text>
            <Text style={{ fontFamily: f.bold, fontSize: 15, color: mc.onNight }}>{money(bal.pending_cents, cur)}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 11, lineHeight: 15, color: mc.nightMuted }}>available two days after payment</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: f.body, fontSize: 12, color: mc.nightMuted }}>On hold</Text>
            <Text style={{ fontFamily: f.bold, fontSize: 15, color: mc.onNight }}>{money(bal.held_cents, cur)}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 11, lineHeight: 15, color: mc.nightMuted }}>{Number(mo.deposits_for) > 0 ? `deposits for ${plural(Number(mo.deposits_for), "upcoming booking")}` : "deposits, released at checkout"}</Text>
          </View>
        </Row>

        <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: mc.nightMuted, marginTop: 16 }}>
          {!account ? "There is no payout account yet, so nothing can be sent to you."
            : d.next_payout ? <>Next automatic payout <Text style={{ fontFamily: f.bold, color: mc.onNight }}>{dateOnly(d.next_payout)}</Text> to {bank}</>
            : <>Automatic payouts are off. You pay out by hand, to {bank}.</>}
          {account && account.status !== "verified" ? " The account is still being checked." : ""}
        </Text>

        {account ? (
          <Row gap={8} style={{ marginTop: 14 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canPay }} disabled={!canPay} onPress={() => { if (!canPay) return; setPayError(""); setPaying(true); }}
              style={({ pressed }) => ({ flex: 1, minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: c.gold, alignItems: "center", justifyContent: "center", opacity: !canPay ? 0.45 : pressed ? 0.85 : 1 })}>
              <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>Pay out now</Text>
            </Pressable>
            <SmallBtn kind="ghost" onPress={() => router.push("/m/payouts" as never)}>Account</SmallBtn>
          </Row>
        ) : (
          <View style={{ marginTop: 14, gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => router.push("/m/payouts" as never)} style={({ pressed }) => ({ minHeight: 44, borderRadius: 999, backgroundColor: c.gold, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>Set up payouts</Text>
            </Pressable>
            <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: mc.nightMuted }}>Takes a few minutes. You choose where your money is sent.</Text>
          </View>
        )}
        {account && !canPay ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: mc.nightMuted, marginTop: 8 }}>{account.status !== "verified" ? "You can pay out once the account is verified." : "There is nothing to pay out yet. Money becomes available two days after a client pays."}</Text> : null}
      </View>

      {/* The month, and the last seven days */}
      <Card style={{ marginTop: 12, padding: 16 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.72, textTransform: "uppercase", color: c.muted }}>{d.month_label} so far</Text>
        <Text style={{ fontFamily: f.bold, fontSize: 24, lineHeight: 30, color: c.ink, marginTop: 2 }}>
          {money(mo.processed_cents, cur)} <Text style={{ fontFamily: f.medium, fontSize: 13, color: c.muted }}>{Number(mo.tips_cents) > 0 ? `incl. ${money(mo.tips_cents, cur)} tips` : "no tips yet"}</Text>
        </Text>
        <View accessibilityLabel={`Takings for the last seven days: ${bars.filter((b) => b.known).map((b) => `${dateOnly(b.day)} ${money(b.cents, cur)}`).join(", ")}`} style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", height: 110, marginTop: 14 }}>
          {bars.map((b) => (
            <View key={b.day} style={{ flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
              <View style={{ width: "100%", height: b.known ? Math.max(4, Math.round((b.cents / maxBar) * 84)) : 4, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, backgroundColor: b.today ? c.gold : b.cents > 0 && b.known ? c.ink : c.line2 }} />
              <Text style={{ fontFamily: f.semi, fontSize: 11, color: b.today ? c.ink : c.muted }}>{b.letter}</Text>
            </View>
          ))}
        </View>
        <T size={12} muted style={{ marginTop: 10 }}>
          The bars are what clients paid on each of the last seven days.
          {` Last month in full: ${money(mo.processed_prev_cents, cur)}.`}
          {Number(mo.fees_cents) > 0 ? ` Fees this month: ${money(mo.fees_cents, cur)}.` : ""}
          {Number(mo.refunds) > 0 ? ` ${plural(Number(mo.refunds), "refund")} this month: ${money(mo.refunds_cents, cur)}.` : ""}
        </T>
      </Card>

      {cut ? <View style={{ marginTop: 12 }}><Note kind="gold">One of these periods has more lines than fit here, so its oldest ones are missing. The export below has every line.</Note></View> : null}
      {quiet ? (
        <View style={{ marginTop: 16 }}>
          <Empty title={`No activity since ${dateOnly(since)}`}>Sales, tips, fees, refunds and payouts show here as they happen.</Empty>
        </View>
      ) : null}
    </View>
  );

  const footer = (
    <View>
      {moreError ? <View style={{ marginTop: 12 }}><Note kind="bad">{moreError}</Note></View> : null}
      <Row between style={{ marginTop: 12 }}>
        <T size={12} muted style={{ flex: 1 }}>Showing activity since {dateOnly(since)}.</T>
        <SmallBtn kind="out" busy={moreBusy} onPress={showEarlier}>Show earlier</SmallBtn>
      </Row>

      {/* The same lines as a spreadsheet file: the web's "Export CSV" */}
      {fileNote ? <View style={{ marginTop: 12 }}><Note kind={fileNote.kind}>{fileNote.text}</Note></View> : null}
      <Row between style={{ marginTop: 12 }}>
        <T size={12} muted style={{ flex: 1 }}>Every line from {dateOnly(since)} to today as a spreadsheet file.</T>
        <CsvButton path={"/money/export" + qs({ from: since, to: today })} token={s.businessToken} name={`ledger-${since}-to-${today}.csv`} onNote={setFileNote}>Export CSV</CsvButton>
      </Row>

      <Grp style={{ marginTop: 22 }}>Payouts</Grp>
      {payouts.length ? (
        <Card style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
          {payouts.map((p, i) => {
            const st = payoutState(p);
            const day = p.kind !== "automatic" && p.paid_at ? dayShort(p.paid_at, tz) : dateOnly(p.scheduled_for) || (p.paid_at ? dayShort(p.paid_at, tz) : "");
            return (
              <Row key={p.id} style={{ paddingVertical: 12, borderBottomWidth: i === payouts.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: st.bg, alignItems: "center", justifyContent: "center" }}><Icon name={st.icon} size={16} color={st.fg} stroke={2.4} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{day}{p.kind === "instant" ? " · instant" : p.kind === "manual" ? " · on request" : ""}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{bankOf(p)} · {st.word}{Number(p.fee_cents) > 0 ? ` · ${money(p.fee_cents, cur)} fee` : ""}{p.status === "failed" && p.failure_reason ? ` · ${p.failure_reason}` : ""}</Text>
                </View>
                <Text style={{ fontFamily: f.bold, fontSize: 15, color: c.ink }}>{money(p.amount_cents, p.currency || cur)}</Text>
              </Row>
            );
          })}
        </Card>
      ) : <Empty title="No payouts yet">{account ? "The first one is sent once money has settled, two days after a client pays." : "Set up a payout account and your first payout follows once money has settled."}</Empty>}
      <WebLink to="/m/statements" style={{ marginTop: 8 }}>Statements, month by month</WebLink>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ ...top, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderSectionHeader={({ section }) => <Grp style={{ marginTop: 18 }}>{section.title}</Grp>}
        renderItem={({ item: t, index, section }) => {
          const n = Number(t.amount_cents), first = index === 0, last = index === section.data.length - 1;
          const icon = KIND_ICON[t.kind] ?? "list";
          const wine = t.kind === "refund";
          return (
            <View style={{ backgroundColor: c.white, borderColor: c.line, borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: first ? 1 : 0, borderBottomWidth: last ? 1 : 0, borderTopLeftRadius: first ? 20 : 0, borderTopRightRadius: first ? 20 : 0, borderBottomLeftRadius: last ? 20 : 0, borderBottomRightRadius: last ? 20 : 0, paddingHorizontal: 16, paddingTop: first ? 4 : 0, paddingBottom: last ? 4 : 0 }}>
              <Row style={{ paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: wine ? c.wineBg : mc.tile, alignItems: "center", justifyContent: "center" }}>
                  {icon === "card" ? <Icon name="card" size={18} /> : <McIcon name={icon} color={wine ? c.wine : c.ink} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={2} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{t.description || KIND[t.kind] || "Ledger line"}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{[KIND[t.kind] ?? cap(String(t.kind)), METHOD[t.method] ?? cap(String(t.method ?? "")), clock(t.created_at, tz)].filter(Boolean).join(" · ")}</Text>
                </View>
                <View style={{ alignItems: "flex-end", maxWidth: 124 }}>
                  <Text style={{ fontFamily: f.bold, fontSize: 15, color: n < 0 ? c.muted : c.ink }}>{n > 0 ? "+" : ""}{money(n, cur)}</Text>
                  <Text style={{ fontFamily: f.medium, fontSize: 11, lineHeight: 15, color: c.muted, textAlign: "right" }}>{lineState(t, tz ?? "UTC")}</Text>
                </View>
              </Row>
            </View>
          );
        }}
      />

      <Sheet open={paying} onClose={() => setPaying(false)} title="Pay out now" sub="Sends your whole available balance to your payout account."
        footer={<Btn kind="gold" busy={payBusy} onPress={payOut}>Pay out {money(available, cur)}</Btn>}>
        {payError ? <Note kind="bad">{payError}</Note> : null}
        <Card style={{ paddingHorizontal: 16 }}>
          <Row between style={{ paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.line }}><T size={14} muted>Available now</T><T size={14} weight="semi">{money(available, cur)}</T></Row>
          <Row between style={{ paddingVertical: 13 }}><T size={14} muted>Sent to</T><T size={14} weight="semi">{bank}</T></Row>
        </Card>
        <T size={13} muted>{simulated ? "Payments are in simulation here. The payout is recorded as paid at once, but no bank transfer is made." : `Sent to your bank through ${provider}, with no fee. It shows as scheduled, then being sent, then paid.`}</T>
        <WebLink to="/m/payouts">Instant payouts, which carry a fee</WebLink>
      </Sheet>
    </View>
  );
}
