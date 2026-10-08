// The jobs that can be done to one booking, each in its own sheet: move it, cancel it, cancel the rest
// of a series, repeat it, tip, and report a problem. Every rule and sentence follows the web account.
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Choice, Grp, Sheet } from "@/components/cc-ui";
import { PayWith, WalletLine, walletsFor } from "@/components/mp-pay";
import { Btn, Chip, Field, Icon, Note, Row, T } from "@/components/ui";
import { api, qs, type Row as Data } from "@/lib/api";
import { PROBLEMS, addDays, cancelAfter, cancelBefore, dateShort, dow, monthName, openPay, payLine, provider, tipChoices, today, weekdayName } from "@/lib/cc-data";
import { cardName, usePayChoice } from "@/lib/mp-cards";
import { useFeatures } from "@/lib/mp-features";
import { clock, dayLong, firstName, money, plural, when, ymd } from "@/lib/format";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

type Slot = { time: string; starts_at: string; staff_id: string; staff: string };
type Day = { date: string; open: number; past: boolean; too_far: boolean };
type Common = { open: boolean; onClose: () => void; b: Data };

// ---------- move ----------

/** A new day and a free time for a booking (laid out like C4-Time), then POST …/reschedule. */
export function MoveSheet({ open, onClose, b, more, onMoved }: Common & { more: Data; onMoved: (message: string) => void }) {
  const s = useSession();
  const tz = b.timezone as string;
  const first = today(tz);
  const booked = ymd(new Date(b.starts_at), tz);
  const services = ((more.service_ids ?? []) as string[]).join(",");
  const [date, setDate] = useState(booked >= first ? booked : first);
  const [page, setPage] = useState(0); // weeks from today
  const [who, setWho] = useState<"same" | "any">("same");
  const [days, setDays] = useState<Record<string, Day>>({});
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [note, setNote] = useState(""), [error, setError] = useState("");
  const [pick, setPick] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState("");
  const staff = who === "same" ? String(more.staff_id) : "any";

  // Open on the week of the booked day.
  useEffect(() => {
    if (!open) return;
    const start = booked >= first ? booked : first;
    setDate(start); setWho("same"); setPick(null); setFailed("");
    setPage(Math.max(0, Math.floor((Date.parse(start) - Date.parse(first)) / (7 * 864e5))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, b.id]);

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(first, page * 7 + i)), [first, page]);

  // Which days of the weeks on show have a free time.
  useEffect(() => {
    if (!open || !services) return;
    let live = true;
    const months = [...new Set(week.map((d) => d.slice(0, 7)))];
    Promise.all(months.map((month) => api<{ days: Day[] }>(`/businesses/${b.slug}/days${qs({ month, services, staff })}`).catch(() => null))).then((out) => {
      if (!live) return;
      const next: Record<string, Day> = {};
      for (const m of out) for (const d of m?.days ?? []) next[`${staff}:${d.date}`] = d;
      setDays((x) => ({ ...x, ...next }));
    });
    return () => { live = false; };
  }, [open, week, staff, services, b.slug]);

  // The free times of the chosen day.
  useEffect(() => {
    if (!open || !services) return;
    let live = true;
    setSlots(null); setPick(null); setError(""); setNote("");
    api<{ slots: Slot[]; note?: string }>(`/businesses/${b.slug}/availability${qs({ date, services, staff })}`)
      .then((out) => {
        if (!live) return;
        // The time the booking already has is not a move.
        setSlots((out.slots ?? []).filter((x) => new Date(x.starts_at).getTime() !== new Date(b.starts_at).getTime()));
        setNote(out.note ?? "");
      })
      .catch((e) => { if (live) { setSlots([]); setError((e as Error).message); } });
    return () => { live = false; };
  }, [open, date, staff, services, b.slug, b.starts_at]);

  const move = async () => {
    if (!pick) return;
    setBusy(true); setFailed("");
    try {
      const out = await s.capi<Data>(`/auth/bookings/${b.id}/reschedule`, { method: "POST", body: { starts_at: pick.starts_at, staff_id: pick.staff_id } });
      const at = out.starts_at ?? pick.starts_at;
      onMoved(`Booking moved to ${dayLong(at, tz)} at ${clock(at, tz)}${out.staff ? ` with ${out.staff}` : ""}. The price stays the same.`);
    } catch (e) {
      setFailed((e as Error).message);
    }
    setBusy(false);
  };

  const groups: [string, Slot[]][] = slots ? ([
    ["Morning", slots.filter((x) => x.time < "12:00")], ["Afternoon", slots.filter((x) => x.time >= "12:00" && x.time < "17:00")], ["Evening", slots.filter((x) => x.time >= "17:00")],
  ] as [string, Slot[]][]).filter(([, list]) => list.length > 0) : [];

  return (
    <Sheet open={open} onClose={onClose} title="Move this booking"
      footer={<>
        {failed ? <Note kind="bad">{failed}</Note> : null}
        <Btn onPress={move} busy={busy} disabled={!pick}>{pick ? `Move to ${dateShort(date)}, ${clock(pick.starts_at, tz)}` : "Choose a time"}</Btn>
        {pick ? <T size={12} muted center>With {pick.staff}. The price you agreed stays the same.</T> : null}
      </>}>
      <T size={13} muted>Free to move until {when(more.free_until, tz)}. Times are shown as they are at {b.business}.</T>
      {!services ? <Note kind="gold">This booking cannot be moved here. Message {b.business} instead.</Note> : (
        <>
          <View>
            <Grp style={{ marginTop: 0 }}>With</Grp>
            <Row gap={8} wrap>
              <Chip on={who === "same"} onPress={() => setWho("same")}>{String(b.staff)}</Chip>
              <Chip on={who === "any"} onPress={() => setWho("any")}>Anyone free</Chip>
            </Row>
          </View>

          <View>
            <Row between>
              <Grp style={{ marginTop: 0, marginBottom: 0 }}>{monthName(week[0])}</Grp>
              <Row gap={4}>
                <Round icon="back" label="Previous week" off={page === 0} onPress={() => setPage(page - 1)} />
                <Round icon="next" label="Next week" onPress={() => setPage(page + 1)} />
              </Row>
            </Row>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
              {week.map((d) => {
                const info = days[`${staff}:${d}`];
                const off = info ? info.past || info.too_far || info.open === 0 : false;
                const on = d === date;
                return (
                  <Pressable key={d} accessibilityRole="button" accessibilityLabel={`${dateShort(d)}${info ? (off ? ", nothing free" : `, ${plural(info.open, "free time")}`) : ""}`} accessibilityState={{ selected: on, disabled: off }} disabled={off} onPress={() => setDate(d)}
                    style={{ flex: 1, minHeight: 60, borderRadius: 14, paddingVertical: 10, alignItems: "center", gap: 4, backgroundColor: on ? c.ink : "transparent", opacity: off ? 0.35 : 1 }}>
                    <Text style={{ fontFamily: f.body, fontSize: 11, color: on ? "#C9BCB0" : c.muted }}>{dow(d)}</Text>
                    <Text style={{ fontFamily: f.semi, fontSize: 17, color: on ? c.cream : c.ink }}>{Number(d.slice(8))}</Text>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.gold, opacity: info && !off ? 1 : 0 }} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View accessibilityLiveRegion="polite">
            {slots === null ? <View style={{ paddingVertical: 24 }}><ActivityIndicator color={c.wine} /></View> : null}
            {error ? <Note kind="bad">{error}</Note> : null}
            {slots !== null && !error && slots.length === 0 ? (
              <T size={14} muted>{note || (who === "same" ? `${firstName(String(b.staff))} has no free time on ${dateShort(date)}. Try another day, or choose Anyone free.` : `Nothing is free on ${dateShort(date)}. Try another day.`)}</T>
            ) : null}
            {groups.map(([name, list], gi) => (
              <View key={name}>
                <Grp style={gi === 0 ? { marginTop: 0 } : undefined}>{name}</Grp>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {list.map((x) => {
                    const on = pick?.starts_at === x.starts_at && pick?.staff_id === x.staff_id;
                    return (
                      <Pressable key={x.starts_at + x.staff_id} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${clock(x.starts_at, tz)} with ${x.staff}`} onPress={() => setPick(x)}
                        style={{ width: "23%", flexGrow: 1, maxWidth: "25%", minHeight: 44, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: f.semi, fontSize: 14, color: on ? c.cream : c.ink }}>{clock(x.starts_at, tz)}</Text>
                        {who === "any" ? <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 11, color: on ? "#C9BCB0" : c.muted }}>{firstName(x.staff)}</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </Sheet>
  );
}

function Round({ icon, label, onPress, off }: { icon: "back" | "next"; label: string; onPress: () => void; off?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!off }} disabled={off} onPress={onPress} hitSlop={4}
      style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.white, borderWidth: 1, borderColor: c.line, opacity: off ? 0.4 : 1 }}>
      <Icon name={icon} size={16} />
    </Pressable>
  );
}

// ---------- cancel ----------

export function CancelSheet({ open, onClose, b, more, onCancelled }: Common & { more?: Data | null; onCancelled: (message: string) => void }) {
  const s = useSession();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (open) setError(""); }, [open]);
  const cancel = async () => {
    setBusy(true); setError("");
    try {
      const out = await s.capi<Data>(`/auth/bookings/${b.id}/cancel`, { method: "POST", body: {} });
      onCancelled(`Booking cancelled. ${cancelAfter(out, !!b.deposit_paid)}`);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Cancel this booking"
      footer={<>
        <Btn kind="danger" onPress={cancel} busy={busy}>Cancel this booking</Btn>
        <Btn kind="soft" onPress={onClose}>Keep it</Btn>
      </>}>
      <T weight="semi">{b.services} at {b.business}</T>
      <T muted size={14}>{dayLong(b.starts_at, b.timezone)} at {clock(b.starts_at, b.timezone)}</T>
      <T>{cancelBefore(b, more)}</T>
      <T size={13} muted>The business is told by email and the time opens again for someone else.</T>
      {error ? <Note kind="bad">{error}</Note> : null}
    </Sheet>
  );
}

// ---------- cancel the rest of a series ----------

type Line = { at: string; ok: boolean; text: string };

/** There is no single call for this: each upcoming visit is cancelled on its own and each answer is shown. */
export function SeriesSheet({ open, onClose, b, series, onDone }: Common & { /** Upcoming visits of the series, soonest first, each with `more`. */ series: Data[]; onDone: () => void }) {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[] | null>(null);
  useEffect(() => { if (open) setLines(null); }, [open]);
  const tz = b.timezone as string;

  const run = async () => {
    setBusy(true);
    const out: Line[] = [];
    for (const x of series) {
      const at = when(x.starts_at, tz);
      try {
        const r = await s.capi<Data>(`/auth/bookings/${x.id}/cancel`, { method: "POST", body: {} });
        out.push({ at, ok: true, text: `Cancelled. ${cancelAfter(r, !!x.deposit_paid)}` });
      } catch (e) {
        out.push({ at, ok: false, text: `Not cancelled. ${(e as Error).message}` });
      }
    }
    setLines(out); setBusy(false); onDone();
  };

  const done = lines?.filter((l) => l.ok).length ?? 0;
  return (
    <Sheet open={open} onClose={onClose} title="Cancel the series"
      footer={lines ? <Btn kind="soft" onPress={onClose}>Done</Btn> : <>
        <Btn kind="danger" onPress={run} busy={busy}>{`Cancel all ${series.length} upcoming visits`}</Btn>
        <Btn kind="soft" onPress={onClose}>Keep them</Btn>
      </>}>
      {lines ? (
        <>
          <Note kind={done === lines.length ? "ok" : "bad"}>{done === lines.length ? `${done === 1 ? "The 1 upcoming visit was" : `All ${done} upcoming visits were`} cancelled.` : `${done} of ${lines.length} upcoming visits were cancelled.`}</Note>
          {lines.map((l) => (
            <View key={l.at} style={{ gap: 2 }}>
              <T weight="semi" size={14}>{l.at}</T>
              <T size={14} color={l.ok ? c.muted : c.bad}>{l.text}</T>
            </View>
          ))}
        </>
      ) : (
        <>
          <T>This cancels the {plural(series.length, "upcoming visit")} in this series, one by one. Each follows the cancellation rule for its own date:</T>
          {series.map((x) => {
            const m = x.more as Data | undefined;
            return (
              <View key={x.id} style={{ gap: 2 }}>
                <T weight="semi" size={14}>{when(x.starts_at, tz)}</T>
                <T size={14} muted>{!m ? "Follows the rule for its date." : m.can_reschedule ? "Free to cancel." : `Free cancellation has ended.${x.deposit_paid ? (m.late_cancel_fee === "none" ? " The deposit is still returned." : " The business keeps the deposit.") : ""}`}</T>
              </View>
            );
          })}
          <T size={13} muted>You will see what happened to each visit.</T>
        </>
      )}
    </Sheet>
  );
}

// ---------- repeat ----------

const EVERY = [1, 2, 3, 4, 6, 8];
type Made = { id: string; starts_at: string; deposit_cents?: number | null; payment?: { url?: string; amount_cents?: number; currency?: string } | null };
type Repeated = { made: Made[]; skipped: { starts_at: string; why: string }[] };
const sentence = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".") : t);

/** Books the same visit again every so many weeks. Each date is booked on its own, so some may not be free. */
export function RepeatSheet({ open, onClose, b, onDone }: Common & { onDone: () => void }) {
  const s = useSession();
  const tz = b.timezone as string;
  const [every, setEvery] = useState(2), [times, setTimes] = useState(3);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [done, setDone] = useState<Repeated | null>(null);
  useEffect(() => { if (open) { setDone(null); setError(""); } }, [open]);

  const firstDay = ymd(new Date(b.starts_at), tz);
  const dates = Array.from({ length: times }, (_, i) => addDays(firstDay, 7 * every * (i + 1)));
  const at = clock(b.starts_at, tz);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const out = await s.capi<Data>(`/auth/bookings/${b.id}/repeat`, { method: "POST", body: { every_weeks: every, times } });
      setDone({ made: Array.isArray(out.made) ? out.made : [], skipped: Array.isArray(out.skipped) ? out.skipped : [] });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  if (done) {
    const owing = done.made.filter((m) => m.payment?.url);
    return (
      <Sheet open={open} onClose={onClose} title="Repeat this visit" footer={<Btn kind="soft" onPress={onClose}>Done</Btn>}>
        {done.made.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Note>{plural(done.made.length, "visit")} booked</Note>
            {done.made.map((m) => (
              <Row key={m.id} between>
                <T size={14}>{when(m.starts_at, tz)}</T>
                {m.payment?.url ? <Btn small kind="out" onPress={() => void openPay(m.payment!.url!)}>{`Pay ${Number(m.payment.amount_cents ?? m.deposit_cents) > 0 ? money(Number(m.payment.amount_cents ?? m.deposit_cents), m.payment.currency || b.currency) + " " : ""}deposit`}</Btn> : null}
              </Row>
            ))}
          </View>
        ) : <Note kind="bad">None of those dates could be booked.</Note>}
        {owing.length > 0 ? <T size={13} muted>Each visit with a deposit is held for a while. If its deposit is not paid, that visit is released. {payLine(b.currency)}</T> : null}
        {done.skipped.length > 0 ? (
          <View style={{ gap: 6, backgroundColor: c.badBg, borderRadius: 14, padding: 14 }}>
            <T size={14} weight="semi" color={c.bad}>{plural(done.skipped.length, "date")} could not be booked</T>
            {done.skipped.map((k) => <T key={k.starts_at} size={14} color={c.bad}>{when(k.starts_at, tz)}: {sentence(k.why)}</T>)}
            <T size={13} color={c.bad}>Nothing else was tried in their place.</T>
          </View>
        ) : null}
        {done.made.length > 0 ? <T size={13} muted>The visits are in your bookings, where each can be moved or cancelled.</T> : null}
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Repeat this visit"
      footer={<Btn onPress={submit} busy={busy}>{times === 1 ? "Book this visit" : `Book these ${times} visits`}</Btn>}>
      <T size={14} muted>The same services with the same person, on {weekdayName(firstDay)}s at {at} at {b.business}. Each date is booked only if it is free.</T>
      <View>
        <Grp style={{ marginTop: 0 }}>How often</Grp>
        <Row gap={8} wrap>
          {EVERY.map((n) => <Chip key={n} on={every === n} onPress={() => setEvery(n)}>{n === 1 ? "Every week" : `Every ${n} weeks`}</Chip>)}
        </Row>
      </View>
      <View>
        <Grp style={{ marginTop: 0 }}>For</Grp>
        <Row gap={12}>
          <Step label="Fewer visits" sign="−" off={times <= 1} onPress={() => setTimes(times - 1)} />
          <T weight="semi" style={{ minWidth: 130, textAlign: "center" }}>{times === 1 ? "The next visit" : `The next ${times} visits`}</T>
          <Step label="More visits" sign="+" off={times >= 12} onPress={() => setTimes(times + 1)} />
        </Row>
      </View>
      <T size={14}><T size={14} muted>It will try: </T>{dates.map((d) => `${dateShort(d)} · ${at}`).join(", ")}.</T>
      {error ? <Note kind="bad">{error}</Note> : null}
    </Sheet>
  );
}

function Step({ label, sign, onPress, off }: { label: string; sign: string; onPress: () => void; off?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!off }} disabled={off} onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.white, borderWidth: 1, borderColor: c.line2, opacity: off ? 0.4 : 1 }}>
      <Text style={{ fontFamily: f.semi, fontSize: 20, lineHeight: 22, color: c.ink }}>{sign}</Text>
    </Pressable>
  );
}

// ---------- tip ----------

/**
 * 15, 20 or 25 percent of the visit, or an amount of the client's own. With payments live the answer is a
 * payment page, or, when a kept card was chosen and the money was taken at once, `paid: true` and no page.
 */
export function TipSheet({ open, onClose, b, onTipped }: Common & { onTipped: (message: string, payUrl?: string) => void }) {
  const s = useSession();
  const total = Number(b.total_cents) || 0, currency = String(b.currency || "USD"), ngn = currency === "NGN";
  const { floor, choices } = useMemo(() => tipChoices(total, currency), [total, currency]);
  const ft = useFeatures();
  const pay = usePayChoice(currency);
  const wallets = walletsFor(ft.wallets, provider(currency));
  const [pick, setPick] = useState<number | "own">("own");
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (open) { setPick(choices[1]?.cents ?? choices[0]?.cents ?? "own"); setOwn(""); setError(""); } }, [open, choices]);
  const cents = pick === "own" ? Math.round((Number(own.replace(/,/g, "")) || 0) * 100) : pick;

  const send = async () => {
    if (cents <= 0) { setError("Choose an amount for the tip."); return; }
    setBusy(true); setError("");
    try {
      const out = await s.capi<Data>(`/auth/bookings/${b.id}/tip`, { method: "POST", body: { amount_cents: cents, ...pay.fields() } });
      const amount = money(Number(out.amount_cents) || cents, out.currency || currency);
      if (out.paid === true) onTipped(`Thank you. Your ${amount} tip to ${b.business} was paid${pay.card ? ` with ${cardName(pay.card)}` : ""}.`);
      else if (out.payment?.url) onTipped(`Finish your ${amount} tip on the payment page. You will be charged ${amount} on ${provider(out.currency || currency)}, in ${(out.currency || currency) === "NGN" ? "naira" : "US dollars"}. It is added here once it is paid.`, out.payment.url);
      else onTipped(`Thank you. Your ${amount} tip is on its way to ${b.business}.`);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title={Number(b.tip_cents) > 0 ? "Add another tip" : "Add a tip"}
      footer={<Btn onPress={send} busy={busy} disabled={cents <= 0}>{cents > 0 ? `Tip ${money(cents, currency)}` : "Choose an amount"}</Btn>}>
      <T size={14} muted>A tip for {b.business}, in {ngn ? "naira" : "US dollars"}. The visit was {money(total, currency)}.</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {choices.map((x) => <TipBox key={x.pct} on={pick === x.cents} top={`${x.pct}%`} bottom={money(x.cents, currency)} onPress={() => setPick(x.cents)} />)}
        <TipBox on={pick === "own"} top="Other" bottom="amount" onPress={() => setPick("own")} />
      </View>
      {pick === "own" ? <Field label={`Amount in ${ngn ? "naira (₦)" : "dollars ($)"}`} value={own} onChangeText={setOwn} keyboardType="decimal-pad" inputMode="decimal" placeholder={String(floor / 100)} /> : null}
      <T size={13} muted>From {money(floor, currency)}{total > 0 ? ` up to ${money(total, currency)}, the price of the visit` : ""}.{pay.on ? "" : " If a payment page opens, you pay there. LogaLuxe never sees your card."}</T>
      {pay.on ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.96, textTransform: "uppercase", color: c.muted }}>Pay with</Text>
          <PayWith choice={pay} provider={provider(currency)} wallets={wallets} when="when you send the tip" />
        </View>
      ) : wallets ? <WalletLine /> : null}
      {error ? <Note kind="bad">{error}</Note> : null}
    </Sheet>
  );
}

/** A tip choice, as C8 draws them. */
export function TipBox({ on, top, bottom, onPress }: { on: boolean; top: string; bottom?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={bottom ? `${top} ${bottom}` : top} onPress={onPress}
      style={{ flex: 1, minWidth: 70, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center", paddingVertical: 6 }}>
      <Text style={{ fontFamily: f.semi, fontSize: 14, color: on ? c.cream : c.ink }}>{top}</Text>
      {bottom ? <Text style={{ fontFamily: f.body, fontSize: 11, color: on ? "#C9BCB0" : c.muted }}>{bottom}</Text> : null}
    </Pressable>
  );
}

// ---------- report a problem ----------

export function ProblemSheet({ open, onClose, b, onReported }: Common & { onReported: (message: string) => void }) {
  const s = useSession();
  const [reason, setReason] = useState(""), [text, setText] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (open) { setReason(""); setText(""); setError(""); } }, [open]);

  const send = async () => {
    const statement = text.trim();
    if (!reason) { setError("Choose what went wrong."); return; }
    if (statement.length < 20) { setError("Describe what happened in a few sentences, 20 characters or more."); return; }
    if (statement.length > 2000) { setError("Keep it under 2,000 characters."); return; }
    setBusy(true); setError("");
    try {
      const out = await s.capi<Data>(`/auth/bookings/${b.id}/problem`, { method: "POST", body: { reason, statement } });
      onReported(`Your report is in${out.ref ? `, reference ${out.ref}` : ""}. ${b.business} has 48 hours to give its side. Then LogaLuxe decides and emails you.`);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Report a problem" footer={<Btn onPress={send} busy={busy}>Send the report</Btn>}>
      <T size={14} muted>Your report goes to {b.business} and to LogaLuxe. {b.business} has 48 hours to give its side. Then LogaLuxe decides and emails you. You can report a visit once.</T>
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        <Grp style={{ marginTop: 0, marginBottom: 2 }}>What went wrong?</Grp>
        {PROBLEMS.map(([k, label]) => <Choice key={k} on={reason === k} onPress={() => setReason(k)}>{label}</Choice>)}
      </View>
      <Field label="What happened? 20 characters or more" value={text} onChangeText={setText} multiline maxLength={2000} placeholder="What was agreed, what happened, and what you would like done" />
      {error ? <Note kind="bad">{error}</Note> : null}
    </Sheet>
  );
}
