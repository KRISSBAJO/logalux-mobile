// One of the client's own bookings, with everything that can still be done to it. The list (C6) shows the
// common buttons; this screen holds them all: calendar, message, move, cancel, pay the deposit, book again,
// repeat, cancel the rest of a series, and after the visit a tip, a problem report and a review.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { CancelSheet, MoveSheet, ProblemSheet, RepeatSheet, SeriesSheet, TipSheet } from "@/components/cc-booking-sheets";
import { ActBtn, DateTile, Grp, Item, Rows } from "@/components/cc-ui";
import { Avatar, Btn, Card, Failed, Loading, Note, Pill, Row, Screen, T, TopBar } from "@/components/ui";
import { api, media, type Row as Data } from "@/lib/api";
import { bookingState, isUpcoming, openCalendar, openMap, openPay, payLine, problemState, span, tile, useRefocus, useReturn } from "@/lib/cc-data";
import { dayLong, money, plural, when } from "@/lib/format";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

type Doing = "" | "move" | "cancel" | "series" | "repeat" | "tip" | "problem";

export default function Booking() {
  const { id, do: start } = useLocalSearchParams<{ id: string; do?: string }>();
  const s = useSession();
  const [doing, setDoing] = useState<Doing>("");
  const [note, setNote] = useState<{ kind: "ok" | "bad" | "gold"; text: string } | null>(null);
  const started = useRef(false);

  const q = useLoad(async () => {
    if (!s.clientToken) return null;
    const me = await s.capi<{ bookings: Data[] }>("/auth/me");
    const all = me.bookings ?? [];
    const b = all.find((x) => x.id === id);
    if (!b) throw new Error("We could not find that booking in your account.");
    const upcoming = isUpcoming(b);
    // The other upcoming visits of the same series, soonest first, each with its own cancellation rule.
    const series = b.series_id ? all.filter((x) => x.series_id === b.series_id && x.can_cancel).sort((x, y) => String(x.starts_at).localeCompare(String(y.starts_at))) : [];
    const [more, pub] = await Promise.all([
      s.capi<{ booking: Data }>(`/auth/bookings/${id}`).catch(() => null),
      // A deposit that is still owed has a payment page while payments are live.
      upcoming && b.deposit_cents > 0 && !b.deposit_paid ? api<{ booking: Data }>(`/bookings/${id}`).catch(() => null) : null,
      ...series.filter((x) => x.id !== id).map(async (x) => { x.more = (await s.capi<{ booking: Data }>(`/auth/bookings/${x.id}`).catch(() => null))?.booking; }),
    ]);
    const self = series.find((x) => x.id === id);
    if (self) self.more = more?.booking;
    return { b, upcoming, more: more?.booking as Data | undefined, payment: pub?.booking?.payment as Data | undefined, series };
  }, [id, s.clientToken]);
  const again = () => { if (s.clientToken) q.refresh(); };
  useRefocus(again);
  useReturn(again); // back from a payment page

  // "Reschedule" on the list opens this screen with the mover already up.
  useEffect(() => {
    if (started.current || !q.data) return;
    started.current = true;
    if (start === "move" && q.data.more?.can_reschedule) setDoing("move");
  }, [q.data, start]);

  if (!s.ready) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
  if (!s.clientToken) {
    return (
      <Screen>
        <TopBar title="Booking" />
        <Card style={{ padding: 22, gap: 12 }}>
          <T weight="semi" size={16}>Sign in to see this booking</T>
          <T muted>Bookings are kept with your account.</T>
          <Btn onPress={() => router.push(`/sign-in?next=${encodeURIComponent(`/c/booking/${id}`)}` as never)}>Sign in</Btn>
        </Card>
      </Screen>
    );
  }
  if (!q.data) {
    return <Screen><TopBar title="Booking" />{q.error ? <Failed error={q.error} onRetry={q.reload} /> : <Loading label="Loading the booking" />}</Screen>;
  }

  const { b, upcoming, more, payment, series } = q.data;
  const tz = b.timezone as string;
  const [label, kind] = bookingState(b.status);
  const t = tile(b.starts_at, tz);
  const guest = String(b.guest_name ?? "").trim();
  const place = [b.address, b.city].filter(Boolean).join(", ");
  const dep = Number(b.deposit_cents) || 0, tip = Number(b.tip_cents) || 0;
  const finished = b.status === "completed" || b.status === "paid";
  const tooLate = upcoming && !!more && !more.can_reschedule && !!b.can_cancel;
  const canRepeat = ["requested", "confirmed", "completed", "paid"].includes(b.status);
  const photos: string[] = Array.isArray(b.review_photos) ? b.review_photos : [];
  const close = () => setDoing("");
  const finish = (text: string, k: "ok" | "gold" = "ok") => { close(); setNote({ kind: k, text }); q.refresh(); };
  const message = () => router.push(`/c/chat/${b.slug}` as never);

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <TopBar title="Booking" />
      <View style={{ gap: 12 }}>
        {note ? <Note kind={note.kind}>{note.text}</Note> : null}
        {q.error ? <Note kind="bad">{q.error}</Note> : null}

        <Card style={{ padding: 14 }}>
          <Row gap={14} style={{ alignItems: "flex-start" }}>
            {upcoming ? <DateTile top={t.top} day={t.day} next /> : <Avatar name={b.business} tone={b.tone} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{b.services || "Appointment"}</Text>
              <Pressable accessibilityRole="link" accessibilityLabel={`Open ${b.business}`} onPress={() => router.push(`/c/b/${b.slug}` as never)} hitSlop={8}>
                <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine, marginTop: 2 }}>{b.business}</Text>
              </Pressable>
            </View>
            <Pill kind={kind}>{label}</Pill>
          </Row>
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line, gap: 8 }}>
            <Fact k="When" v={`${dayLong(b.starts_at, tz)} · ${span(b)}`} />
            <Fact k="With" v={String(b.staff)} />
            {guest ? <Fact k="For" v={guest} /> : null}
            {place ? <Fact k="Where" v={place} /> : null}
            <Fact k="Total" v={money(b.total_cents, b.currency)} />
            {dep > 0 && (b.deposit_paid || upcoming) ? <Fact k="Deposit" v={`${money(dep, b.currency)} ${b.deposit_paid ? "paid" : "not paid yet"}`} /> : null}
            {tip > 0 ? <Fact k="Tip" v={`You tipped ${money(tip, b.currency)}`} /> : null}
            {b.series_id ? <Row gap={8}><Pill kind="gold">Repeats</Pill>{series.length > 0 ? <T size={13} muted>{plural(series.length, "upcoming visit")} in this series</T> : null}</Row> : null}
          </View>
          {upcoming ? <T size={12} muted style={{ marginTop: 10 }}>Times are shown as they are at {b.business}.</T> : null}
        </Card>

        {upcoming && dep > 0 && !b.deposit_paid && payment?.url ? (
          <View style={{ backgroundColor: c.goldBg, borderRadius: 16, padding: 14, gap: 10 }}>
            <T size={14} color={c.goldInk}>Pay the {money(payment.amount_cents ?? dep, payment.currency ?? b.currency)} deposit to keep this time{payment.expires_at ? `. It is held until ${when(payment.expires_at, tz)}` : ""}. {payLine(b.currency)}</T>
            <Btn small onPress={async () => { await openPay(payment.url); q.refresh(); }} style={{ alignSelf: "flex-start" }}>Pay deposit</Btn>
          </View>
        ) : null}

        {upcoming ? (
          <>
            <Row gap={8}>
              <ActBtn onPress={() => void openCalendar(b.id)}>Add to calendar</ActBtn>
              {more?.can_reschedule ? <ActBtn onPress={() => setDoing("move")}>Reschedule</ActBtn> : null}
              <ActBtn kind="soft" onPress={message}>Message</ActBtn>
            </Row>
            {tooLate ? (
              <T size={13} muted>It is too late to move this booking here. Changes were free until {when(more!.free_until, tz)} ({plural(Number(more!.cancel_hours), "hour")} before). Message {b.business} to ask for another time.</T>
            ) : more?.can_reschedule ? (
              <T size={13} muted>Free to move or cancel until {when(more.free_until, tz)}.</T>
            ) : null}
          </>
        ) : (
          <Row gap={8}>
            <ActBtn kind="ink" onPress={() => router.push(`/c/b/${b.slug}` as never)}>Book again</ActBtn>
            <ActBtn kind="soft" onPress={message}>Message</ActBtn>
          </Row>
        )}

        {finished ? (
          <View>
            <Grp style={{ marginTop: 6 }}>After your visit</Grp>
            <Rows>
              {b.can_review ? <Item icon="star" title="Leave a review" sub={`Tell others how it went at ${b.business}`} onPress={() => router.push(`/c/review/${b.id}` as never)} /> : null}
              {b.review_id ? <Item icon="star" title="Your review" sub={photos.length ? `Published · ${plural(photos.length, "photo")}. Add or remove photos` : "Published. Add up to three photos of the result"} onPress={() => router.push(`/c/review/${b.id}` as never)} /> : null}
              {b.can_tip ? <Item icon="heart" title={tip > 0 ? "Add another tip" : "Add a tip"} sub={tip > 0 ? `You tipped ${money(tip, b.currency)}` : "15, 20 or 25 percent, or your own amount"} onPress={() => setDoing("tip")} /> : null}
              {b.can_report && !b.problem ? <Item icon="info" title="Report a problem" sub="The business has 48 hours to answer, then LogaLuxe decides" onPress={() => setDoing("problem")} /> : null}
              {!b.can_review && !b.review_id && !b.can_tip && !(b.can_report && !b.problem) ? <View style={{ padding: 16 }}><T size={14} muted>Tips can be added for 30 days after a visit and problems reported for 14 days. Both have passed for this visit.</T></View> : null}
            </Rows>
            {photos.length > 0 ? (
              <Row gap={8} style={{ marginTop: 10 }}>
                {photos.map((pid, i) => <Image key={pid} source={{ uri: media(pid) }} accessibilityLabel={`Photo ${i + 1} on your review`} style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: c.photo }} />)}
              </Row>
            ) : null}
          </View>
        ) : b.can_report && !b.problem ? (
          <Rows><Item icon="info" title="Report a problem" sub="The business has 48 hours to answer, then LogaLuxe decides" onPress={() => setDoing("problem")} /></Rows>
        ) : null}

        {b.problem ? (
          <Card style={{ padding: 16, gap: 6 }}>
            <T weight="semi" size={14}>Problem reported{b.problem.ref ? ` · reference ${b.problem.ref}` : ""}</T>
            <T size={14} muted selectable>{problemState(b.problem, b.business, b.currency)}</T>
          </Card>
        ) : null}

        {place || canRepeat || b.can_cancel ? (
          <View>
            <Grp style={{ marginTop: 6 }}>More</Grp>
            <Rows>
              {place ? <Item icon="pin" title="Directions" sub={place} onPress={() => void openMap(`${b.business}, ${place}`)} /> : null}
              {canRepeat ? <Item icon="repeat" title="Repeat this visit" sub="The same services, person and time, every few weeks" onPress={() => setDoing("repeat")} /> : null}
              {b.can_cancel ? <Item icon="close" tone="bad" title="Cancel this booking" sub={more ? (more.can_reschedule ? `Free until ${when(more.free_until, tz)}` : "Free cancellation has ended") : undefined} onPress={() => setDoing("cancel")} /> : null}
              {upcoming && series.length > 1 ? <Item icon="close" tone="bad" title="Cancel the rest of the series" sub={`${plural(series.length, "upcoming visit")}, each by its own rule`} onPress={() => setDoing("series")} /> : null}
            </Rows>
          </View>
        ) : null}
      </View>

      {more ? <MoveSheet open={doing === "move"} onClose={close} b={b} more={more} onMoved={finish} /> : null}
      <CancelSheet open={doing === "cancel"} onClose={close} b={b} more={more} onCancelled={finish} />
      <SeriesSheet open={doing === "series"} onClose={close} b={b} series={series} onDone={q.refresh} />
      <RepeatSheet open={doing === "repeat"} onClose={close} b={b} onDone={q.refresh} />
      <TipSheet open={doing === "tip"} onClose={close} b={b} onTipped={async (text, url) => {
        if (url) { finish(text, "gold"); await openPay(url); q.refresh(); } else finish(text);
      }} />
      <ProblemSheet open={doing === "problem"} onClose={close} b={b} onReported={finish} />
    </Screen>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <Row gap={12} style={{ alignItems: "flex-start" }}>
      <Text style={{ width: 64, fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.muted, marginTop: 3 }}>{k}</Text>
      <Text selectable style={{ flex: 1, fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.ink }}>{v}</Text>
    </Row>
  );
}
