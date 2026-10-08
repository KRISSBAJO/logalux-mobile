// The end of booking: what was booked, with whom, when and where, and what can be done next.
// The designs show this as the dark "You're booked" card at the top of C6; the rest follows C5's summary card.
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { AppState, Linking, Pressable, Text, View } from "react-native";
import { BizMark, Cta, Head, Icon, Line, LinkText, MinusIcon, Round, Shell, Strip, Tile } from "@/components/cb-ui";
import { WalletLine, walletsFor } from "@/components/mp-pay";
import { Btn, Card, Failed, Loading, Note, Row, T } from "@/components/ui";
import { api, API_URL, ApiError } from "@/lib/api";
import { addDays, nice, bookHref, span, dayLabel, inZone, providerOf, sentence, WEEKDAYS, weekdayOf, whenLabel, type Biz, type Booking } from "@/lib/cb-lib";
import { duration, firstName, money } from "@/lib/format";
import { bookingPhone, phoneWord, useFeatures } from "@/lib/mp-features";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";
import { c, f } from "@/lib/theme";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function CbBooked({ biz, id, ids, src }: { biz: Biz; id: string; ids: string; src: string }) {
  const s = useSession();
  const ft = useFeatures();
  // The public copy of the booking is all a guest can read. A signed-in client's own copy proves it is theirs.
  const q = useLoad(async () => {
    if (!UUID.test(id)) throw new ApiError(404, "We could not find that booking.");
    const bk = (await api<{ booking: Booking }>(`/bookings/${id}`)).booking;
    if (bk.business_slug !== biz.slug) throw new ApiError(404, "We could not find that booking.");
    let mine = false;
    if (s.clientToken) {
      try { mine = !!(await s.capi<{ booking?: { id: string } }>(`/auth/bookings/${id}`)).booking; } catch { /* booked as a guest, or by someone else */ }
    }
    return { bk, mine };
  }, [id, biz.slug, s.clientToken]);

  const bk = q.data?.bk;
  const cur = bk?.currency || biz.currency;
  const unpaid = !!bk && !!bk.payment?.url && !bk.deposit_paid;
  // Back from the provider's page: see whether the deposit arrived.
  useEffect(() => {
    if (!unpaid) return;
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") q.refresh(); });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unpaid]);
  const [paying, setPaying] = useState(false);
  async function pay(url: string) {
    setPaying(true);
    try { await WebBrowser.openBrowserAsync(url); } catch { /* could not open: the button stays */ }
    setPaying(false);
    q.refresh();
  }

  const home = () => router.replace("/client/home");
  if (!bk) {
    return (
      <Shell>
        <Head title="Your booking" onBack={home} />
        <View style={{ marginTop: 18 }}>{q.loading ? <Loading /> : <Failed error={q.error || "We could not find that booking."} onRetry={q.reload} />}</View>
      </Shell>
    );
  }

  const tz = bk.timezone || biz.tz;
  const start = inZone(bk.starts_at, tz), end = inZone(bk.ends_at, tz);
  const mins = bk.items.reduce((a, i) => a + i.duration_min, 0);
  const cancelled = bk.status.startsWith("cancelled");
  const requested = bk.status === "requested";
  const atVisit = bk.total_cents - (bk.deposit_paid ? bk.deposit_cents : 0);
  const first = firstName(bk.client_name);
  const guest = String(bk.guest_name ?? "").trim();
  const where = [bk.address, bk.city].filter(Boolean).join(", ");
  const hours = biz.policy.cancel_hours ?? 24;
  const freeUntil = new Date(new Date(bk.starts_at).getTime() - hours * 3600_000);
  const provider = providerOf(biz.market);
  const due = bk.payment?.amount_cents ?? bk.deposit_cents;
  // A word on the phone as well: said only when that channel is live and this booking was made here with a number it can reach.
  const told = cancelled || unpaid ? "" : phoneWord(ft, String(s.customer?.preferred_channel ?? ""), bookingPhone(bk.id));

  const title = cancelled ? "This booking was cancelled" : unpaid ? "Your time is held" : requested ? `Request sent${first ? `, ${first}` : ""}.` : `You're booked${first ? `, ${first}` : ""}.`;
  const line = cancelled ? "Nothing more will happen with it."
    : unpaid ? `The ${money(due, bk.payment?.currency || cur)} deposit is not paid yet${bk.payment?.expires_at ? `. The time is held until ${whenLabel(bk.payment.expires_at, tz)}` : ""}.`
    : requested ? `${bk.business} confirms each booking itself. The time is held until you hear back.`
    : bk.deposit_cents > 0 && bk.deposit_paid ? `Deposit ${money(bk.deposit_cents, cur)} paid · ${money(atVisit, cur)} at the visit`
    : `Nothing paid now · ${money(atVisit, cur)} at the visit`;

  const footer = cancelled
    ? <Cta onPress={() => router.replace(bookHref(biz.slug, { services: ids, src }) as never)}>Book again</Cta>
    : unpaid
      ? <View style={{ gap: 8 }}><Cta busy={paying} onPress={() => pay(bk.payment!.url)}>Pay {money(due, bk.payment?.currency || cur)} deposit</Cta><T muted size={12} center>You will be charged {money(due, bk.payment?.currency || cur)} on {provider}, in {(bk.payment?.currency || cur) === "NGN" ? "naira" : "US dollars"}.</T><T muted size={11} center>You pay on {provider}&apos;s secure page. LogaLuxe never sees your card.</T>{walletsFor(ft.wallets, provider) ? <WalletLine align="center" /> : null}</View>
      : <Cta onPress={() => router.replace("/client/bookings")}>See my bookings</Cta>;

  return (
    <Shell footer={footer} onRefresh={q.refresh} refreshing={q.refreshing}>
      <Head title={cancelled ? "Cancelled" : unpaid ? "Pay your deposit" : requested ? "Request sent" : "Booked"} onBack={home} />

      <View accessibilityRole="alert" style={{ marginTop: 18, backgroundColor: c.ink, borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: cancelled ? c.cream2 : c.gold, alignItems: "center", justifyContent: "center" }}>
          <Icon name={cancelled ? "close" : unpaid || requested ? "clock" : "check"} size={22} color={c.ink} stroke={2.6} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: f.semi, fontSize: 16, lineHeight: 22, color: "#F4ECE3" }}>{title}</Text>
          <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: "#C9BCB0", marginTop: 2 }}>{line}</Text>
        </View>
      </View>

      {told ? <T muted size={13} style={{ marginTop: 10 }}>{requested ? "Your request" : "A confirmation"} was also sent {told} to {bookingPhone(bk.id)}.</T> : null}

      <Card style={{ marginTop: 12, padding: 16, gap: 14 }}>
        <Row>
          <BizMark name={bk.business} tone={biz.tone} logoId={biz.logoId} />
          <View style={{ flex: 1 }}>
            <T weight="semi" size={16} numberOfLines={1}>{bk.business}</T>
            <T muted size={13} numberOfLines={2}>{[`with ${bk.staff}`, biz.place.name].filter(Boolean).join(" · ")}</T>
          </View>
        </Row>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Tile label="When" value={`${dayLabel(start.date)} · ${nice(start.time)}`} />
          <Tile label="Duration" value={mins > 0 ? span(mins) : `ends ${nice(end.time)}`} />
        </View>
        {guest ? <T size={14}>For <T weight="semi" size={14}>{guest}</T></T> : null}
        {where ? <Row gap={8} style={{ alignItems: "flex-start" }}><Icon name="pin" size={16} color={c.muted} /><T muted size={13} style={{ flex: 1 }}>{where}</T></Row> : null}
        <View>
          {bk.items.map((i, n) => <Line key={n} left={i.name} right={money(i.price_cents, cur)} />)}
          {bk.discount_cents > 0 ? <Line muted left={`Promo ${bk.promo_code}`} right={`-${money(bk.discount_cents, cur)}`} /> : null}
          {!cancelled && bk.deposit_cents > 0 ? <Line muted left={bk.deposit_paid ? "Deposit paid" : "Deposit, not paid yet"} right={money(bk.deposit_cents, cur)} /> : null}
          {cancelled ? null : <Line muted left="Pay at the visit" right={money(atVisit, cur)} />}
          <Line total left="Total" right={money(bk.total_cents, cur)} />
        </View>
        {!cancelled && !unpaid ? (
          <View style={{ gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.line }}>
            <Btn kind="out" small icon="calendar" style={{ minHeight: 44 }} onPress={() => Linking.openURL(`${API_URL}/v1/bookings/${bk.id}/calendar.ics`)}>Add to calendar</Btn>
            <Btn kind="soft" small icon="chat" style={{ minHeight: 44 }} onPress={() => router.push(`/c/chat/${biz.slug}` as never)}>Message {bk.business}</Btn>
          </View>
        ) : null}
      </Card>

      {!cancelled && !unpaid && hours > 0 && freeUntil.getTime() > Date.now() ? <T muted size={13} style={{ marginTop: 12 }}>Free to cancel until {whenLabel(freeUntil, tz)}.</T> : null}
      {unpaid ? <View style={{ marginTop: 12 }}><Strip kind="gold" icon={<Icon name="info" size={18} color={c.goldInk} />}>If you have just paid, pull down to check again. A payment can take a moment to arrive.</Strip></View> : null}

      {cancelled || unpaid ? null : q.data?.mine ? (
        <Card style={{ marginTop: 16, padding: 16, gap: 12 }}>
          <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 22, lineHeight: 26, color: c.ink }}>Make this a regular visit</Text>
          <CbRepeat id={bk.id} startsAt={bk.starts_at} tz={tz} currency={cur} business={bk.business} />
        </Card>
      ) : !s.customer ? (
        <Pressable accessibilityRole="link" accessibilityLabel="Sign in" onPress={() => router.push(`/sign-in?next=${encodeURIComponent(bookHref(biz.slug, { booking: bk.id, services: ids, src }))}` as never)} style={{ marginTop: 6, minHeight: 44, justifyContent: "center" }}>
          <T muted size={13}>With an account you can repeat a visit and manage your bookings. <T size={13} weight="semi" color={c.wine}>Sign in</T></T>
        </Pressable>
      ) : null}

      <T muted size={12} style={{ marginTop: 14 }}>Booking reference {bk.id.slice(0, 8).toUpperCase()}</T>
    </Shell>
  );
}

// ---------- repeat ----------

type Made = { id: string; starts_at: string; deposit_cents?: number | null; payment?: { url?: string; amount_cents?: number; currency?: string } | null };
type Skipped = { starts_at: string; why: string };
const EVERY = [1, 2, 3, 4, 6, 8];

/**
 * Makes a booking repeat: every so many weeks, for the next few visits, on the same weekday and at the same
 * clock time at the business. The API books each date on its own, so some may not be free: what was booked
 * and what was not are both listed, with the API's reason.
 */
export function CbRepeat({ id, startsAt, tz, currency, business }: { id: string; startsAt: string; tz: string; currency: string; business: string }) {
  const s = useSession();
  const [every, setEvery] = useState(2);
  const [times, setTimes] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ made: Made[]; skipped: Skipped[] } | null>(null);
  const first = inZone(startsAt, tz);
  const dates = Array.from({ length: times }, (_, i) => addDays(first.date, 7 * every * (i + 1)));

  async function submit() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const j = await s.capi<{ made?: Made[]; skipped?: Skipped[] }>(`/auth/bookings/${id}/repeat`, { body: { every_weeks: every, times } });
      setDone({ made: Array.isArray(j.made) ? j.made : [], skipped: Array.isArray(j.skipped) ? j.skipped : [] });
    } catch (e) {
      const err = e as ApiError;
      setError(err.status === 401 ? "You are signed out. Sign in and try again." : err.status === 0 ? "We could not reach LogaLuxe. Nothing was booked. Try again in a moment." : err.message);
    }
    setBusy(false);
  }

  if (done) {
    const owing = done.made.filter((m) => m.payment?.url);
    return (
      <View accessibilityRole="alert" style={{ gap: 12 }}>
        {done.made.length > 0 ? (
          <View style={{ gap: 4 }}>
            <T weight="semi" size={14}>{done.made.length === 1 ? "1 visit booked" : `${done.made.length} visits booked`}</T>
            {done.made.map((m) => {
              const amount = Number(m.payment?.amount_cents ?? m.deposit_cents ?? 0);
              return (
                <Row key={m.id} between gap={10} style={{ minHeight: 28 }}>
                  <T size={14}>{whenLabel(m.starts_at, tz, " · ")}</T>
                  {m.payment?.url ? <LinkText onPress={() => { void WebBrowser.openBrowserAsync(m.payment!.url!).catch(() => undefined); }}>Pay {amount > 0 ? `${money(amount, m.payment.currency || currency)} ` : ""}deposit</LinkText> : null}
                </Row>
              );
            })}
          </View>
        ) : <Note kind="bad">None of those dates could be booked.</Note>}
        {owing.length > 0 ? <T muted size={13}>Each visit with a deposit is held for a while. If its deposit is not paid, that visit is released. You pay on the payment provider&apos;s secure page. LogaLuxe never sees your card.</T> : null}
        {done.skipped.length > 0 ? (
          <View style={{ backgroundColor: c.wineBg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 4 }}>
            <T weight="semi" size={14} color={c.wine}>{done.skipped.length === 1 ? "1 date could not be booked" : `${done.skipped.length} dates could not be booked`}</T>
            {done.skipped.map((x) => <T key={x.starts_at} size={13} color={c.wine}>{whenLabel(x.starts_at, tz, " · ")}: {sentence(x.why)}</T>)}
            <T size={13} color={c.wine}>Nothing else was tried in their place.</T>
          </View>
        ) : null}
        {done.made.length > 0 ? <T muted size={13}>The visits are in your bookings, where each can be moved or cancelled.</T> : null}
        <LinkText onPress={() => setDone(null)}>Repeat again</LinkText>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <T muted size={13}>The same services with the same person, on {WEEKDAYS[weekdayOf(first.date)]}s at {nice(first.time)} at {business}. Each date is booked only if it is free.</T>
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.muted }}>How often</Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {EVERY.map((n) => {
            const on = every === n;
            return (
              <Pressable key={n} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={n === 1 ? "Every week" : `Every ${n} weeks`} onPress={() => setEvery(n)}
                style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
                <Text style={{ fontFamily: f.semi, fontSize: 13, color: on ? c.cream : c.ink }}>{n === 1 ? "Every week" : `${n} weeks`}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.muted }}>For</Text>
        <Row gap={12}>
          <Round size={44} label="One visit fewer" disabled={times <= 1} onPress={() => setTimes(times - 1)}><MinusIcon /></Round>
          <T weight="semi" size={15} center style={{ minWidth: 150 }}>{times === 1 ? "The next visit" : `The next ${times} visits`}</T>
          <Round size={44} label="One visit more" disabled={times >= 12} onPress={() => setTimes(times + 1)}><Icon name="plus" size={18} /></Round>
        </Row>
      </View>
      <View accessibilityLiveRegion="polite">
        <T size={13}><T muted size={13}>It will try: </T>{dates.map((x) => `${dayLabel(x)} · ${nice(first.time)}`).join(", ")}.</T>
      </View>
      {error ? <Note kind="bad">{error}</Note> : null}
      <Btn small busy={busy} onPress={submit} style={{ alignSelf: "flex-start", minHeight: 44 }}>{times === 1 ? "Book this visit" : `Book these ${times} visits`}</Btn>
    </View>
  );
}
