// My bookings (design: C6-Bookings). Upcoming and past visits from GET /auth/me. A card's buttons do the
// common things; tapping the card opens the booking, where everything else is.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Acts, ActBtn, DateTile, Seg, SignInGate, TabTitle } from "@/components/cc-ui";
import { Avatar, Btn, Card, Empty, Failed, Icon, Loading, Pill, Row, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { bookingState, dayMonth, isUpcoming, moneyFacts, openCalendar, span, tile, useRefocus } from "@/lib/cc-data";
import { money, when } from "@/lib/format";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

type Tab = "up" | "past";

export default function Bookings() {
  const s = useSession();
  const p = useLocalSearchParams<{ booked?: string }>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("up");

  const q = useLoad(async () => {
    if (!s.clientToken) return null;
    const me = await s.capi<{ user: Data; bookings: Data[] }>("/auth/me");
    const all = me.bookings ?? [];
    const upcoming = all.filter(isUpcoming).reverse(); // the API lists newest first: soonest first here
    // What may still be done to each upcoming booking: whether it can be moved, and until when cancelling is free.
    await Promise.all(upcoming.slice(0, 20).map(async (b) => {
      b.more = (await s.capi<{ booking: Data }>(`/auth/bookings/${b.id}`).catch(() => null))?.booking;
    }));
    return { user: me.user, upcoming, past: all.filter((b) => !isUpcoming(b)) };
  }, [s.clientToken]);
  useRefocus(() => { if (s.clientToken) q.refresh(); });

  if (!s.ready) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
  if (!s.clientToken) return <SignInGate title="Your bookings" next="/client/bookings">Your upcoming and past visits are kept with your account. Sign in to move, cancel or rebook them.</SignInGate>;

  const list = q.data ? (tab === "up" ? q.data.upcoming : q.data.past) : [];
  const booked = q.data && typeof p.booked === "string" ? [...q.data.upcoming, ...q.data.past].find((b) => b.id === p.booked) : undefined;

  const header = (
    <View style={{ paddingBottom: 14 }}>
      <TabTitle title="Your bookings" right={<Btn small icon="plus" onPress={() => router.push("/client/search" as never)}>Book</Btn>} />
      {booked ? (
        <View accessibilityRole="alert" style={{ marginTop: 18, backgroundColor: c.ink, borderRadius: 20, padding: 16, flexDirection: "row", gap: 14, alignItems: "center" }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.gold, alignItems: "center", justifyContent: "center" }}><Icon name="check" size={22} color={c.ink} stroke={2.6} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: f.semi, fontSize: 16, color: "#F4ECE3" }}>You are booked, {q.data?.user?.first_name}.</Text>
            <Text style={{ fontFamily: f.body, fontSize: 13, color: "#C9BCB0", marginTop: 2 }}>
              {[booked.deposit_cents > 0 ? `Deposit ${money(booked.deposit_cents, booked.currency)} ${booked.deposit_paid ? "paid" : "not paid yet"}` : "", "Confirmation sent by email"].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={{ marginTop: 18 }}><Seg<Tab> options={[["up", "Upcoming"], ["past", "Past"]]} value={tab} onChange={setTab} /></View>
      {q.error && !q.data ? <View style={{ marginTop: 14 }}><Failed error={q.error} onRetry={q.reload} /></View> : null}
      {q.loading && !q.data ? <Loading label="Loading your bookings" /> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={list}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ paddingHorizontal: pad, paddingTop: insets.top + 12, paddingBottom: 28, gap: 12 }}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: -12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={c.wine} />}
        renderItem={({ item, index }) => (tab === "up" ? <Upcoming b={item} next={index === 0} /> : <Past b={item} />)}
        ListEmptyComponent={q.data ? (
          tab === "up"
            ? <Empty title="Nothing booked yet" action={<Btn small onPress={() => router.push("/client/search" as never)}>Find a professional</Btn>}>Bookings you make while signed in appear here.</Empty>
            : <Empty title="No past visits yet">A visit moves here once it is finished or cancelled, with rebooking, tipping and reviews.</Empty>
        ) : null}
      />
    </View>
  );
}

const open = (b: Data) => router.push(`/c/booking/${b.id}` as never);

function Head({ b, left, sub, pill }: { b: Data; left: React.ReactNode; sub: string; pill: React.ReactNode }) {
  const guest = String(b.guest_name ?? "").trim();
  return (
    <Row gap={14} style={{ alignItems: "flex-start" }}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{b.services || "Appointment"}</Text>
        <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.muted, marginTop: 2 }}>{sub}</Text>
        {guest ? <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 13, color: c.ink, marginTop: 2 }}>For <Text style={{ fontFamily: f.semi }}>{guest}</Text></Text> : null}
      </View>
      {pill}
    </Row>
  );
}

function Upcoming({ b, next }: { b: Data; next: boolean }) {
  const [label, kind] = bookingState(b.status);
  const t = tile(b.starts_at, b.timezone);
  const more = b.more as Data | undefined;
  const facts = [...moneyFacts(b), more?.can_reschedule ? `Free cancel until ${when(more.free_until, b.timezone)}` : ""].filter(Boolean);
  return (
    <Card style={{ padding: 14 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${b.services} at ${b.business}, ${when(b.starts_at, b.timezone)}. Open booking`} onPress={() => open(b)}>
        <Head b={b} left={<DateTile top={t.top} day={t.day} next={next} />} sub={`${b.business} · ${span(b)}`} pill={<Pill kind={kind}>{label}</Pill>} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 4, marginTop: 12, alignItems: "center" }}>
          {b.series_id ? <Pill kind="gold">Repeats</Pill> : null}
          {facts.map((x) => <Text key={x} style={{ fontFamily: f.body, fontSize: 13, color: c.muted }}>{x}</Text>)}
        </View>
      </Pressable>
      <Acts>
        <ActBtn onPress={() => void openCalendar(b.id)}>Add to calendar</ActBtn>
        {more?.can_reschedule ? <ActBtn onPress={() => router.push(`/c/booking/${b.id}?do=move` as never)}>Reschedule</ActBtn> : null}
        <ActBtn kind="soft" onPress={() => router.push(`/c/chat/${b.slug}` as never)}>Message</ActBtn>
      </Acts>
    </Card>
  );
}

function Past({ b }: { b: Data }) {
  const [label, kind] = bookingState(b.status);
  const done = b.status === "completed" || b.status === "paid";
  const tip = Number(b.tip_cents) || 0;
  const sub = [b.business, dayMonth(b.starts_at, b.timezone), done ? `${money(b.total_cents, b.currency)}${tip > 0 ? ` + ${money(tip, b.currency)} tip` : ""}` : ""].filter(Boolean).join(" · ");
  const rebook = () => router.push(`/c/b/${b.slug}` as never);
  return (
    <Card style={{ padding: 14 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${b.services} at ${b.business}, ${dayMonth(b.starts_at, b.timezone)}. Open booking`} onPress={() => open(b)}>
        <Head b={b} left={<Avatar name={b.business} tone={b.tone} />} sub={sub} pill={b.can_review ? <Pill kind="gold">Review</Pill> : <Pill kind={kind}>{label}</Pill>} />
      </Pressable>
      <Acts>
        {b.can_review ? (
          <>
            <ActBtn kind="soft" onPress={() => router.push(`/c/review/${b.id}` as never)}>Leave a review</ActBtn>
            <ActBtn onPress={rebook}>Rebook</ActBtn>
          </>
        ) : (
          <>
            <ActBtn kind="ink" onPress={rebook}>Rebook</ActBtn>
            <ActBtn onPress={() => open(b)}>Details</ActBtn>
          </>
        )}
      </Acts>
    </Card>
  );
}
