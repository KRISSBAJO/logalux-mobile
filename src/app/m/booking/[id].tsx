// One booking (design: M2-Booking): who is coming, what for, what is paid and what is left, the notes,
// and the steps the web offers from each status, each through POST /m/bookings/{id}/action.
import { Redirect, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Group, MaIcon, RoundButton, Sheet, SlotPicker, type Person, type Slot } from "@/components/ma-kit";
import { Avatar, Btn, Card, Failed, Field, Icon, IconButton, Loading, Note, Pill, Row, Screen, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { clock, dayShort, duration, firstName, money, plural, ymd } from "@/lib/format";
import { allowed, answerText, waitForSignIn, comingOf, plainName, dayLabel, dueOf, guestOf, paper, SOURCE, span, STATUS_LABEL, statusKind, tel, todayIn, whoOf } from "@/lib/ma-format";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const DONE: Record<string, string> = {
  confirm: "Booking confirmed.", check_in: "Checked in.", start: "Service started.", complete: "Finished. It is ready for checkout.",
  no_show: "Marked as a no-show.", cancel: "Booking cancelled.", reschedule: "Booking moved.",
};

const go = (path: string) => router.push(path as never);

export default function Booking() {
  const { id, done } = useLocalSearchParams<{ id: string; done?: string }>();
  const s = useSession();
  const m = s.merchant;
  const tz: string | undefined = m?.timezone, cur: string = m?.currency ?? "USD";
  const canPay = allowed(m, "take_payments");
  const { data, error, loading, refreshing, reload, refresh, setData } = useLoad(() => (s.businessToken ? s.mapi(`/bookings/${encodeURIComponent(String(id))}`) : waitForSignIn()), [id, s.businessToken]);

  const [flash, setFlash] = useState<{ kind: "ok" | "bad"; text: string } | null>(done === "paid" ? { kind: "ok", text: "Paid. The sale is recorded." } : null);
  const [busy, setBusy] = useState("");
  const [sheet, setSheet] = useState<"" | "move" | "cancel" | "noshow" | "more">("");
  const [reason, setReason] = useState("");
  const [sheetError, setSheetError] = useState("");
  // The reschedule sheet
  const [people, setPeople] = useState<Person[] | null>(null);
  const [day, setDay] = useState(""), [who, setWho] = useState("any"), [slot, setSlot] = useState<Slot | null>(null), [again, setAgain] = useState(0);

  // Fresh when the screen comes back into view (after checkout, for example).
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    setFlash(null); // what was said before leaving is old news now
    s.mapi(`/bookings/${encodeURIComponent(String(id))}`).then(setData).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, s.businessToken]));

  const back = () => (router.canGoBack() ? router.back() : router.replace("/business/today"));
  const bar = (center?: ReactNode, right?: ReactNode) => (
    <Row between style={{ minHeight: 44 }}>
      <IconButton icon="back" label="Back" onPress={back} />
      <View style={{ flex: 1, alignItems: "center" }}><View>{center}</View></View>
      <View style={{ width: 44 }}>{right}</View>
    </Row>
  );

  if (s.ready && !s.businessToken) return <Redirect href={`/sign-in?side=business&next=${encodeURIComponent(`/m/booking/${id}`)}` as never} />;
  if (!data) {
    return (
      <Screen style={{ backgroundColor: paper, flexGrow: 1 }}>
        {bar()}
        <View style={{ marginTop: 16 }}>{error && !loading ? <Failed error={error} onRetry={reload} /> : <Loading label="Loading the booking" />}</View>
      </Screen>
    );
  }

  const b = data.booking as Data;
  const items = (data.items ?? []) as Data[], hist = (data.client ?? null) as Data | null, answers = (data.answers ?? []) as Data[];
  const status = String(b.status);
  const due = dueOf(b);
  const guest = guestOf(b);
  const started = Date.parse(b.starts_at) < Date.now();
  // Once paid, the booking's total is what was charged for goods and services after discounts, which can
  // include things added at the desk. Show the difference so the lines add up.
  const extra = status === "paid" && items.length ? Number(b.total_cents) + Number(b.discount_cents ?? 0) - items.reduce((a, it) => a + Number(it.price_cents), 0) : 0;
  const closed = status === "no_show" || status === "rescheduled" || status.startsWith("cancelled");
  const tags = (Array.isArray(hist?.tags) ? hist.tags : []) as string[];

  const act = async (action: string, body: Record<string, string> = {}): Promise<boolean> => {
    setBusy(action); setSheetError("");
    try {
      await s.mapi(`/bookings/${encodeURIComponent(b.id)}/action`, { method: "POST", body: { action, ...body } });
      setFlash({ kind: "ok", text: DONE[action] ?? "Saved." });
      setSheet("");
      const fresh = await s.mapi(`/bookings/${encodeURIComponent(b.id)}`).catch(() => null);
      if (fresh) setData(fresh);
      return true;
    } catch (e) {
      // The API's own sentence: inside the sheet when one is open, else at the top of the screen.
      const text = (e as Error).message;
      if (sheet && sheet !== "more") setSheetError(text); else setFlash({ kind: "bad", text });
      if (action === "reschedule") setAgain((n) => n + 1); // the time may have just been taken: show fresh times
      return false;
    } finally {
      setBusy("");
    }
  };

  const openMove = () => {
    const today = todayIn(tz), on = ymd(new Date(b.starts_at), tz);
    setDay(on < today ? today : on); setSlot(null); setSheetError(""); setSheet("move");
    if (!people) {
      s.mapi("/calendar").then((cal) => {
        const list = ((cal.staff ?? []) as Data[]).map((p) => ({ id: String(p.id), name: String(p.name), bookable: p.bookable !== false }));
        setPeople(list);
        setWho(list.some((p) => p.id === b.staff_id && p.bookable) ? String(b.staff_id) : "any");
      }).catch((e: Error) => { setPeople([]); setSheetError(e.message); });
    }
  };

  // The thread screen writes to a client by id: it opens their conversation, or starts one.
  const message = () => go(`/m/thread/new?client=${b.client_id}`);
  const profile = () => go(`/m/client/${b.client_id}`);
  const checkout = () => go(`/m/checkout/${b.id}`);
  const rebook = () => go(`/m/new-booking?client=${b.client_id ?? ""}`);
  const call = () => { void Linking.openURL(tel(b.client_phone)); };

  const headline = status === "paid" ? "Paid" : status === "no_show" || status.startsWith("cancelled") || status === "rescheduled" ? STATUS_LABEL[status] ?? status
    : b.deposit_paid ? `Deposit paid · ${money(due, cur)} due` : `${STATUS_LABEL[status] ?? status} · ${money(due, cur)} due`;
  const headKind = status === "paid" ? "ok" : status === "no_show" || status.startsWith("cancelled") ? "bad" : status === "rescheduled" ? "grey" : b.deposit_paid || status === "completed" ? "gold" : statusKind(status);

  // ----- the steps the web offers from each status, and nothing else -----
  const canMove = status === "requested" || status === "confirmed";
  const canCancel = status === "requested" || status === "confirmed" || status === "checked_in";
  const canNoShow = status === "confirmed" && started;
  const step = status === "requested" ? ["confirm", "Confirm"] : status === "confirmed" ? ["check_in", "Check in"] : status === "checked_in" ? ["start", "Start service"] : status === "in_progress" ? ["complete", "Finish"] : null;
  const payable = status === "checked_in" || status === "in_progress" || status === "completed";

  const footer = step || payable || (status === "paid" && b.client_id) ? (
    <View style={{ gap: 8 }}>
      {status === "completed" && !canPay ? <T size={13} muted center>{`Finished. The desk takes payment for this visit: ${money(due, cur)} to pay.`}</T> : null}
      <Row gap={10}>
        {step ? <Btn kind={payable && canPay ? "out" : "ink"} busy={busy === step[0]} disabled={!!busy} onPress={() => act(step[0])} style={{ flex: 1 }}>{step[1]}</Btn> : null}
        {payable && canPay ? <Btn disabled={!!busy} onPress={checkout} style={{ flex: step ? 1.4 : 1 }}>{`Take payment · ${money(due, cur)}`}</Btn> : null}
        {status === "paid" && b.client_id ? <Btn kind="out" onPress={rebook} style={{ flex: 1 }}>Book again</Btn> : null}
      </Row>
    </View>
  ) : undefined;

  const line = (left: ReactNode, right: string, opts: { muted?: boolean; total?: boolean } = {}) => (
    <View style={[{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 }, opts.total && { borderTopWidth: 1, borderTopColor: c.line, marginTop: 6, paddingTop: 12 }]}>
      <Text style={{ flex: 1, fontFamily: opts.total ? f.bold : f.body, fontSize: opts.total ? 16 : 14, color: opts.muted ? c.muted : c.ink }}>{left}</Text>
      <Text style={{ fontFamily: opts.total ? f.bold : f.body, fontSize: opts.total ? 16 : 14, color: opts.muted ? c.muted : c.ink }}>{right}</Text>
    </View>
  );
  const cell = (label: string, value: string) => (
    <View style={{ flex: 1, backgroundColor: paper, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: c.muted }}>{label}</Text>
      <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink, marginTop: 2 }}>{value}</Text>
    </View>
  );

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} footer={footer} style={{ backgroundColor: paper, flexGrow: 1 }}>
      {bar(<Pill kind={headKind}>{headline}</Pill>, <RoundButton label="More" onPress={() => setSheet("more")}><MaIcon name="dots" /></RoundButton>)}

      {flash ? <View style={{ marginTop: 12 }}><Note kind={flash.kind}>{flash.text}</Note></View> : null}
      {error ? <View style={{ marginTop: 12 }}><Note kind="bad">{error}</Note></View> : null}

      <Card style={{ marginTop: 16, padding: 16 }}>
        <Row gap={14}>
          <Avatar name={plainName(comingOf(b))} tone={b.staff_tone} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 26, lineHeight: 28, color: c.ink }}>
              {guest || b.client_name}
              {guest ? <Text style={{ fontFamily: f.body, fontSize: 14, color: c.muted }}>{` (booked by ${b.client_name})`}</Text> : null}
            </Text>
            <T muted size={13} style={{ marginTop: 4 }}>
              {(guest && hist ? `${firstName(b.client_name)}: ` : "") + (hist ? (Number(hist.visits) > 0 || Number(hist.no_shows) > 0 ? `${plural(Number(hist.visits), "visit")} · ${money(hist.spent_cents, cur)} spent · ${plural(Number(hist.no_shows), "no-show")}` : "First visit") : "Walk-in, not in your client list")}
            </T>
          </View>
          {b.client_id ? <RoundButton dark label={`Message ${firstName(b.client_name)}`} onPress={message}><Icon name="chat" size={18} color={c.cream} /></RoundButton> : null}
        </Row>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {cell("When", dayShort(b.starts_at, tz))}
          {cell("Time", span(b, tz))}
          {cell("With", firstName(b.staff ?? ""))}
        </View>
        <Row gap={8} wrap style={{ marginTop: 12 }}>
          <Pill kind={statusKind(status)}>{STATUS_LABEL[status] ?? status}</Pill>
          {b.series_id ? <Pill kind="gold">Repeats</Pill> : null}
          <T muted size={12.5}>{`Booked via ${SOURCE[b.source] ?? b.source}`}</T>
        </Row>
        {b.client_phone ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`Call ${guest ? firstName(b.client_name) : comingOf(b)} on ${b.client_phone}`} onPress={call}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, marginTop: 6, opacity: pressed ? 0.7 : 1 })}>
            <Icon name="phone" size={16} color={c.wine} />
            <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.wine }}>{guest ? `Call ${firstName(b.client_name)} · ${b.client_phone}` : `Call ${b.client_phone}`}</Text>
          </Pressable>
        ) : null}
      </Card>

      <Group>Services</Group>
      <Card style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
        {items.length ? items.map((it, i) => <View key={i}>{line(<>{it.name}<Text style={{ color: c.muted }}>{` · ${duration(Number(it.duration_min))}`}</Text></>, money(it.price_cents, cur))}</View>) : line(b.services ?? "Visit", money(b.total_cents, cur))}
        {extra !== 0 ? line("Added or changed at checkout", money(extra, cur), { muted: true }) : null}
        {Number(b.discount_cents) > 0 ? line(`Discount${b.promo_code ? ` · ${b.promo_code}` : ""}`, money(-b.discount_cents, cur), { muted: true }) : null}
        {Number(b.deposit_cents) > 0 ? line(b.deposit_paid ? "Deposit paid" : "Deposit not paid yet", b.deposit_paid ? money(-b.deposit_cents, cur) : money(b.deposit_cents, cur), { muted: true }) : null}
        {status === "paid" ? line(`Paid${b.paid_at ? ` ${dayShort(b.paid_at, tz)}` : ""}${b.tip_cents ? ` · tip ${money(b.tip_cents, cur)}` : ""}`, money(-(Number(b.total_cents) - (b.deposit_paid ? Number(b.deposit_cents) : 0)), cur), { muted: true }) : null}
        {closed ? line("Total", money(Number(b.total_cents) - Number(b.discount_cents ?? 0), cur), { total: true }) : line(status === "paid" ? "Left to pay" : "Balance at checkout", money(due, cur), { total: true })}
      </Card>

      {answers.length ? (
        <>
          <Group>Answers</Group>
          <Card style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
            {answers.map((a, i) => (
              <View key={i} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, gap: 2 }}>
                <T muted size={12.5}>{a.label}</T>
                <T weight="semi" size={14}>{answerText(a)}</T>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {hist?.notes || tags.length || b.notes || b.cancel_reason ? <Group>Client notes</Group> : null}
      {hist?.notes || tags.length ? (
        <View style={{ backgroundColor: "#FFF9E8", borderWidth: 1, borderColor: "#F0E2B8", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 8 }}>
          {hist?.notes ? <T size={13} style={{ lineHeight: 20 }}><T size={13} weight="bold">Your notes: </T>{hist.notes}</T> : null}
          {tags.length ? <Row gap={6} wrap>{tags.map((x) => <Pill key={x} kind="gold">{x}</Pill>)}</Row> : null}
          <T muted size={12}>Private to your business</T>
        </View>
      ) : null}
      {b.notes ? (
        <Row gap={8} style={{ marginTop: 10, alignItems: "flex-start" }}>
          <View style={{ marginTop: 2 }}><Icon name="check" size={16} color={c.muted} /></View>
          <T muted size={13} style={{ flex: 1 }}>{`Note on the booking: "${b.notes}"`}</T>
        </Row>
      ) : null}
      {b.cancel_reason ? <T muted size={13} style={{ marginTop: 10 }}>{`Reason: ${b.cancel_reason}`}</T> : null}

      {canMove || canCancel || canNoShow || b.client_id ? (
        <>
          <Group>Actions</Group>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {canMove ? <Btn kind="out" onPress={openMove} style={{ width: "48.7%", minHeight: 48 }}>Reschedule</Btn> : null}
            {b.client_id ? <Btn kind="out" onPress={profile} style={{ width: "48.7%", minHeight: 48 }}>Client profile</Btn> : null}
            {b.client_id ? <Btn kind="out" onPress={message} style={{ width: "48.7%", minHeight: 48 }}>Message</Btn> : null}
            {canNoShow ? <Btn kind="danger" onPress={() => { setSheetError(""); setSheet("noshow"); }} style={{ width: "48.7%", minHeight: 48 }}>Mark no-show</Btn> : null}
            {canCancel ? <Btn kind="danger" onPress={() => { setReason(""); setSheetError(""); setSheet("cancel"); }} style={{ width: "48.7%", minHeight: 48 }}>{status === "requested" ? "Decline" : "Cancel booking"}</Btn> : null}
          </View>
        </>
      ) : null}

      {/* ----- move it ----- */}
      <Sheet open={sheet === "move"} onClose={() => setSheet("")} title="Move this booking" sub={`${whoOf(b)} · ${b.services ?? "Visit"} · now ${dayShort(b.starts_at, tz)} at ${clock(b.starts_at, tz)}`}
        footer={<Btn busy={busy === "reschedule"} disabled={!slot} onPress={() => slot && act("reschedule", { starts_at: slot.starts_at, staff_id: slot.staff_id })}>{slot ? `Move to ${dayLabel(day)} · ${clock(slot.starts_at, tz)}` : "Choose a free time"}</Btn>}>
        {sheetError ? <View style={{ marginBottom: 12 }}><Note kind="bad">{sheetError}</Note></View> : null}
        {people === null ? <Loading label="Loading the team" /> : (
          <SlotPicker mapi={s.mapi} tz={tz} currency={cur} staff={people} serviceIds={items.map((it) => it.service_id).filter(Boolean)} exclude={b.id}
            day={day} onDay={setDay} who={who} onWho={setWho} value={slot} onPick={setSlot} again={again} />
        )}
        {people !== null && !items.some((it) => it.service_id) ? <T muted size={13} style={{ marginTop: 8 }}>This booking has no service from your menu on it, so free times cannot be worked out.</T> : null}
      </Sheet>

      {/* ----- cancel it ----- */}
      <Sheet open={sheet === "cancel"} onClose={() => setSheet("")} title={status === "requested" ? "Decline this request" : "Cancel this booking"} sub="The time opens up again for other clients."
        footer={<Btn kind="danger" busy={busy === "cancel"} onPress={() => act("cancel", { reason: reason.trim() })}>{status === "requested" ? "Decline request" : "Cancel booking"}</Btn>}>
        <View style={{ gap: 12 }}>
          {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
          <Field label="Reason" value={reason} onChangeText={setReason} multiline maxLength={200} placeholder="Kept on the booking for your records" />
          {b.deposit_paid ? <T muted size={13}>{`The deposit of ${money(b.deposit_cents, cur)} is released, because the business is cancelling.`}</T> : null}
        </View>
      </Sheet>

      {/* ----- no-show: ask first ----- */}
      <Sheet open={sheet === "noshow"} onClose={() => setSheet("")} title={`Mark ${comingOf(b)} as a no-show?`} sub="This cannot be undone here."
        footer={<Row gap={10}><Btn kind="out" onPress={() => setSheet("")} style={{ flex: 1 }}>Keep the booking</Btn><Btn kind="danger" busy={busy === "no_show"} onPress={() => act("no_show")} style={{ flex: 1 }}>Mark no-show</Btn></Row>}>
        <View style={{ gap: 12 }}>
          {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
          <T muted size={14}>{`${clock(b.starts_at, tz)} on ${dayShort(b.starts_at, tz)} · ${b.services ?? "Visit"}. It is counted on the client's record.`}</T>
        </View>
      </Sheet>

      {/* ----- the rest ----- */}
      <Sheet open={sheet === "more"} onClose={() => setSheet("")} title={comingOf(b)} sub={`${b.services ?? "Visit"} · ${dayShort(b.starts_at, tz)} at ${clock(b.starts_at, tz)}`}>
        <View style={{ gap: 8 }}>
          {b.client_phone ? <Btn kind="out" icon="phone" onPress={() => { setSheet(""); call(); }}>{`Call ${b.client_phone}`}</Btn> : null}
          {b.client_id ? <Btn kind="out" icon="chat" onPress={() => { setSheet(""); message(); }}>Message</Btn> : null}
          {b.client_id ? <Btn kind="out" icon="user" onPress={() => { setSheet(""); profile(); }}>Client profile</Btn> : null}
          {b.client_id ? <Btn kind="out" icon="calendar" onPress={() => { setSheet(""); rebook(); }}>Book another visit</Btn> : null}
          {!b.client_phone && !b.client_id ? <T muted size={14}>This was a walk-in with no details, so there is nobody to call or message.</T> : null}
        </View>
      </Sheet>
    </Screen>
  );
}
