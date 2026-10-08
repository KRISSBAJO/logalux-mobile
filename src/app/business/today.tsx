// Today (design: M1-Today). The day's numbers, what is happening now and next, and the day's visits.
// People who may see every calendar get the whole business's day; a team member limited to their own
// calendar gets only their own visits (the API filters GET /m/calendar for them) and numbers worked out
// from those visits, as the web's "My day" does.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sheet, WeekStrip, weekFrom } from "@/components/ma-kit";
import { Avatar, Btn, Card, Empty, Failed, Icon, Loading, Note, Pill, Row, Screen, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { clock, duration, firstName, money, plural, ymd } from "@/lib/format";
import { addDays, allowed, away, clockParts, comingOf, plainName, dayLabel, dowOf, dueOf, greetingFor, guestOf, hourIn, isManager, minutesOf, mondayOf, monthDay, shortName, todayIn, weekdayLong } from "@/lib/ma-format";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const GUTTER = 24; // this design's side gutter

type Loaded = { cal: Data; home: Data; setup: Data | null };
type Item = { key: string; at: number; visit?: Data; block?: Data };
type Todo = { key: string; title: string; sub: string; tag: string; kind: "gold" | "wine" | "grey"; go: () => void };

const go = (path: string) => router.push(path as never);

export default function Today() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const m = s.merchant;
  const tz: string | undefined = m?.timezone, cur: string = m?.currency ?? "USD";
  const today = todayIn(tz);
  const [day, setDay] = useState(today);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [busyId, setBusyId] = useState("");
  const monday = mondayOf(day);
  const manager = isManager(m), seeAll = allowed(m, "see_all_calendars"), canPay = allowed(m, "take_payments");
  const businessId: string = m?.business_id ?? "";

  const fetchAll = useCallback(async (): Promise<Loaded> => {
    const [cal, home, setup] = await Promise.all([
      s.mapi(`/calendar?date=${monday}&days=7`),
      s.mapi("/home"),
      // The setup list is for managers and the owner. If it cannot be loaded, Today goes without the card.
      manager ? s.mapi("/onboarding").catch(() => null) : Promise.resolve(null),
    ]);
    return { cal, home, setup };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday, businessId, s.businessToken, manager]);
  const { data, error, loading, refreshing, reload, refresh, setData } = useLoad(fetchAll, [fetchAll]);

  // Fresh when the screen comes back into view, and once a minute while it is open.
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    const quiet = () => { fetchAll().then(setData).catch(() => undefined); void s.refresh().catch(() => undefined); };
    if (first.current) first.current = false; else quiet();
    const timer = setInterval(() => fetchAll().then(setData).catch(() => undefined), 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAll]));

  const businesses = ((m?.businesses ?? []) as Data[]);
  const switchTo = async (id: string) => {
    if (id === businessId) { setSwitching(false); return; }
    setBusyId(id); setSwitchError("");
    try {
      await s.mapi("/switch", { method: "POST", body: { business_id: id } });
      await s.refresh();
      setDay(todayIn(tz));
      setSwitching(false);
    } catch (e) {
      setSwitchError((e as Error).message);
    } finally {
      setBusyId("");
    }
  };

  // ----- the head of the screen, which shows even while the day is loading -----
  const unread = Number(m?.badges?.inbox ?? 0);
  const head = (
    <View style={{ paddingHorizontal: GUTTER, paddingTop: insets.top + 12 }}>
      <Row between>
        <Pressable accessibilityRole={businesses.length > 1 ? "button" : undefined} accessibilityLabel={businesses.length > 1 ? `${m?.business}. Switch business` : undefined} disabled={businesses.length < 2} onPress={() => { setSwitchError(""); setSwitching(true); }}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minHeight: 44 }}>
          <Avatar name={m?.name ?? ""} tone={c.ink} size={40} />
          <View style={{ flex: 1 }}>
            <T size={13} weight="medium" muted numberOfLines={1}>{`${greetingFor(hourIn(tz))}, ${firstName(m?.name ?? "")}`}</T>
            <Row gap={4}>
              <T size={14} weight="semi" numberOfLines={1} style={{ flexShrink: 1 }}>{m?.business ?? ""}</T>
              {businesses.length > 1 ? <Icon name="down" size={14} /> : null}
            </Row>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Inbox, ${unread} unread` : "Inbox"} onPress={() => go("/business/inbox")} hitSlop={6} style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
          <Icon name="chat" size={22} stroke={1.8} />
          {unread ? <View style={{ position: "absolute", top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: c.wine }} /> : null}
        </Pressable>
      </Row>
      <View style={{ marginTop: 22 }}>
        <T size={13} weight="medium" muted>{day === today ? weekdayLong(day) : `${weekdayLong(day)} · not today`}</T>
        <Text accessibilityRole="header" style={{ fontFamily: f.serif, fontSize: 44, lineHeight: 48, letterSpacing: -0.4, color: c.ink, marginTop: 2 }}>{monthDay(day)}</Text>
      </View>
    </View>
  );

  const switcher = (
    <Sheet open={switching} onClose={() => setSwitching(false)} title="Your businesses" sub="Choose the one you want to look at.">
      {switchError ? <View style={{ marginBottom: 10 }}><Note kind="bad">{switchError}</Note></View> : null}
      <Card>
        {businesses.map((b, i) => (
          <Pressable key={b.id} accessibilityRole="button" accessibilityState={{ selected: b.id === businessId }} disabled={!!busyId} onPress={() => switchTo(b.id)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, opacity: pressed || (busyId && busyId !== b.id) ? 0.6 : 1 })}>
            <Avatar name={b.name} size={36} />
            <View style={{ flex: 1 }}>
              <T weight="semi" size={14}>{b.name}</T>
              <T muted size={12}>{[b.area, b.role === "owner" ? "Owner" : b.role === "manager" ? "Manager" : "Team member"].filter(Boolean).join(" · ")}</T>
            </View>
            {busyId === b.id ? <T muted size={12}>Opening</T> : b.id === businessId ? <Icon name="check" size={18} /> : null}
          </Pressable>
        ))}
      </Card>
    </Sheet>
  );

  if (!data) {
    return (
      <Screen scroll={false} padded={false} top={false}>
        {head}
        <View style={{ paddingHorizontal: GUTTER, paddingTop: 20 }}>
          {error && !loading ? <Failed error={error} onRetry={reload} /> : <Loading label="Loading the day" />}
        </View>
        {switcher}
      </Screen>
    );
  }

  const { cal, home, setup } = data;
  const now = Date.now();
  const isToday = day === today;
  const week = weekFrom(monday);
  const all = (cal.bookings ?? []) as Data[];
  const visits = all.filter((b) => ymd(new Date(b.starts_at), tz) === day);
  const blocks = ((cal.blocks ?? []) as Data[]).filter((k) => ymd(new Date(k.starts_at), tz) <= day && ymd(new Date(k.ends_at), tz) >= day);
  const people = (cal.staff ?? []) as Data[];
  const hours = (cal.location_hours ?? {}) as Record<string, string[] | null>;
  const dots = new Set(all.filter((b) => b.status !== "no_show").map((b) => ymd(new Date(b.starts_at), tz)));
  const off = new Set(week.filter((d) => !hours[dowOf(d)]));

  // ----- the three numbers -----
  const kept = visits.filter((b) => b.status !== "no_show");
  const t = (home.today ?? {}) as Data;
  const useHome = isToday && seeAll;
  const nBookings = useHome ? Number(t.bookings ?? 0) : kept.length;
  const expected = useHome ? Number(t.expected_cents ?? 0) : kept.reduce((a, b) => a + Number(b.total_cents ?? 0) - (b.status === "paid" ? 0 : Number(b.discount_cents ?? 0)), 0);
  const toPay = visits.filter((b) => b.status === "completed");
  const toConfirm = visits.filter((b) => b.status === "requested");
  const future = day > today;
  const third = future ? { n: toConfirm.length, label: "to confirm", first: toConfirm[0] } : { n: useHome ? Number(t.to_check_out ?? toPay.length) : toPay.length, label: "to check out", first: toPay[0] };

  // ----- now and next, for today only -----
  const inChair = isToday ? visits.filter((b) => b.status === "in_progress") : [];
  const arrived = isToday ? visits.filter((b) => b.status === "checked_in") : [];
  const next = isToday ? visits.find((b) => (b.status === "confirmed" || b.status === "requested") && Date.parse(b.ends_at) > now) : undefined;
  const untilNext = next ? Date.parse(next.starts_at) - now : 0;
  const nowText = inChair.length === 1 ? `${firstName(comingOf(inChair[0]))} is in the chair` : inChair.length > 1 ? `${inChair.length} in the chair` : arrived.length === 1 ? `${firstName(comingOf(arrived[0]))} has arrived` : arrived.length > 1 ? `${arrived.length} have arrived` : "Nobody in the chair";
  const nextText = next ? (untilNext > 30000 ? `Next in ${away(untilNext)}` : untilNext > -60000 ? `${firstName(comingOf(next))} is due now` : `${firstName(comingOf(next))} was due ${away(untilNext)} ago`) : "";
  const late = !!next && untilNext <= -60000;

  // ----- the day in order: visits, with blocked time in its place -----
  const items: Item[] = visits.map((b) => ({ key: b.id, at: Date.parse(b.starts_at), visit: b }));
  for (const k of blocks) items.push({ key: "k" + k.id, at: Date.parse(k.starts_at), block: k });
  items.sort((a, b) => a.at - b.at);

  // ----- what needs the person: only real things, most urgent first (as the web's Home lists them) -----
  const todos: Todo[] = [];
  if (isToday) {
    const counts = (home.counts ?? {}) as Data;
    const inbox = (home.inbox ?? []) as Data[];
    for (const b of ((home.up_next ?? []) as Data[]).filter((x) => x.status === "completed").slice(0, 2)) {
      todos.push({ key: "pay" + b.id, title: `${shortName(b.client_name)} has finished · ${money(dueOf(b), cur)} due`, sub: `${b.services ?? "Visit"} with ${firstName(b.staff ?? "")}`, tag: "Check out", kind: "gold", go: () => go(canPay ? `/m/checkout/${b.id}` : `/m/booking/${b.id}`) });
    }
    if (Number(counts.to_confirm) > 0) todos.push({ key: "confirm", title: `${plural(counts.to_confirm, "booking request")} waiting for you`, sub: "Clients are waiting to hear back", tag: "Confirm", kind: "wine", go: () => go("/business/calendar") });
    if (manager) for (const o of ((home.time_off ?? []) as Data[]).slice(0, 2)) {
      const from = String(o.starts_on).slice(0, 10), to = String(o.ends_on).slice(0, 10);
      todos.push({ key: "off" + o.id, title: `${firstName(o.staff ?? "")} asked for ${dayLabel(from)}${to !== from ? ` to ${dayLabel(to)}` : ""} off`, sub: o.bookings_affected > 0 ? `${plural(o.bookings_affected, "booking")} would need moving` : "No bookings are affected", tag: "Approve", kind: "grey", go: () => go("/business/more") });
    }
    if (Number(counts.unread) > 0) todos.push({ key: "unread", title: `${plural(counts.unread, "message")} not answered yet`, sub: inbox[0] ? `${inbox[0].client_name}: ${inbox[0].last_preview}` : "Open the inbox to reply", tag: "Reply", kind: "wine", go: () => go("/business/inbox") });
    if (manager) for (const p of ((home.low_stock ?? []) as Data[]).slice(0, 2)) todos.push({ key: "low" + p.id, title: `${p.name} is down to ${p.stock}`, sub: `Reorder level is ${p.reorder_at}`, tag: "Low stock", kind: "wine", go: () => go("/business/more") });
  }

  // ----- the setup card, while the business is not live or has steps left -----
  const steps = (Array.isArray(setup?.steps) ? setup.steps : []) as Data[];
  const showSetup = !!setup && !setup.dismissed && (!setup.live || steps.some((x) => !x.done));
  const nextStep = steps.find((x) => !x.done);

  const stat = (value: string, label: string, opts: { gold?: boolean; onPress?: () => void; first?: boolean } = {}) => {
    const inner = (
      <>
        <Text style={{ fontFamily: f.semi, fontSize: 24, lineHeight: 26, letterSpacing: -0.2, color: opts.gold ? "#9A7A1E" : c.ink }}>{value}</Text>
        <Text style={{ fontFamily: f.medium, fontSize: 12, color: c.muted }}>{label}</Text>
      </>
    );
    const box = { flex: 1, minHeight: 44, justifyContent: "center" as const, gap: 2, paddingVertical: 2, paddingLeft: opts.first ? 0 : 16, borderLeftWidth: opts.first ? 0 : 1, borderLeftColor: c.line2 };
    return opts.onPress
      ? <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label}`} onPress={opts.onPress} style={({ pressed }) => [box, pressed && { opacity: 0.7 }]}>{inner}</Pressable>
      : <View accessible accessibilityLabel={`${value} ${label}`} style={box}>{inner}</View>;
  };

  const header = (
    <View>
      {head}
      <View style={{ paddingHorizontal: GUTTER }}>
        {showSetup && setup ? (
          <Card style={{ padding: 16, gap: 10, marginTop: 18 }} onPress={() => go("/m/onboarding")} label="Get ready to take bookings. Open setup">
            <Row between>
              <T weight="semi" size={15}>Get ready to take bookings</T>
              <T muted size={12}>{`${setup.done} of ${setup.total} done`}</T>
            </Row>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: Number(setup.total), now: Number(setup.done) }} style={{ height: 6, borderRadius: 3, backgroundColor: c.cream2, overflow: "hidden" }}>
              <View style={{ width: `${Number(setup.total) > 0 ? Math.round((Number(setup.done) / Number(setup.total)) * 100) : 0}%`, height: 6, backgroundColor: c.gold }} />
            </View>
            <Row between style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="semi" size={14}>{nextStep ? `Next: ${nextStep.title}` : setup.live ? "Every step is done" : "Your page is not live yet"}</T>
                <T muted size={12.5}>{nextStep ? nextStep.hint : setup.live ? "Your page is live." : "LogaLuxe is checking your details. We will email you when they are approved."}</T>
              </View>
              <Icon name="next" size={18} color={c.muted} />
            </Row>
          </Card>
        ) : null}

        <View style={{ flexDirection: "row", marginTop: 20 }}>
          {stat(String(nBookings), nBookings === 1 ? "booking" : "bookings", { first: true })}
          {stat(money(expected, cur), "expected")}
          {stat(String(third.n), third.label, { gold: third.n > 0, onPress: third.first ? () => go(!future && canPay ? `/m/checkout/${third.first.id}` : `/m/booking/${third.first.id}`) : undefined })}
        </View>

        <View style={{ marginTop: 22 }}>
          <WeekStrip days={week} value={day} onPick={setDay} dots={dots} off={off} />
        </View>
        <View style={{ height: 1, backgroundColor: c.line, marginTop: 20 }} />

        {isToday ? (
          <Row between style={{ marginTop: 18, marginBottom: 2 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.body, fontSize: 13, color: c.muted }}><Text style={{ fontFamily: f.semi, color: c.ink }}>{`Now ${clock(new Date(), tz)}`}</Text>{` · ${nowText}`}</Text>
            {nextText ? <Text style={{ fontFamily: f.semi, fontSize: 12, color: late ? "#9B2335" : c.muted }}>{nextText}</Text> : null}
          </Row>
        ) : (
          <Row between style={{ marginTop: 18, marginBottom: 2 }}>
            <T muted size={13}>{hours[dowOf(day)] ? `Open ${hours[dowOf(day)]![0]} to ${hours[dowOf(day)]![1]}` : "Closed this day"}</T>
            <Pressable accessibilityRole="button" onPress={() => setDay(today)} hitSlop={10}><Text style={{ fontFamily: f.semi, fontSize: 12, color: c.wine }}>Back to today</Text></Pressable>
          </Row>
        )}
        {error ? <View style={{ marginTop: 10 }}><Note kind="bad">{error}</Note></View> : null}
      </View>
    </View>
  );

  const footer = (
    <View style={{ paddingHorizontal: GUTTER }}>
      {items.length === 0 ? (
        <View style={{ marginTop: 10 }}>
          <Empty title={day < today ? "Nothing was booked" : isToday ? "Nothing booked today" : "Nothing booked yet"}
            action={day >= today ? <Btn small kind="out" icon="plus" onPress={() => go(`/m/new-booking?date=${day}`)}>New booking</Btn> : undefined}>
            {day < today ? "No visits were on the calendar this day." : seeAll ? "Bookings from your page show here by themselves. For a call or a walk-in, add one." : "Visits booked with you show here. For a call or a walk-in, add one."}
          </Empty>
        </View>
      ) : null}
      {todos.length ? (
        <View style={{ marginTop: 22 }}>
          <Text accessibilityRole="header" style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>Needs you</Text>
          <Card>
            {todos.map((x, i) => (
              <Pressable key={x.key} accessibilityRole="button" onPress={x.go} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ flex: 1 }}>
                  <T weight="semi" size={14} numberOfLines={2}>{x.title}</T>
                  <T muted size={12.5} numberOfLines={1}>{x.sub}</T>
                </View>
                <Pill kind={x.kind}>{x.tag}</Pill>
              </Pressable>
            ))}
          </Card>
        </View>
      ) : null}
    </View>
  );

  const staffName = (id: string) => firstName(String(people.find((p) => p.id === id)?.name ?? ""));

  const renderItem = ({ item }: { item: Item }) => {
    const [hm, ap] = clockParts(new Date(item.at), tz);
    const time = (
      <View style={{ width: 42 }}>
        <Text style={{ fontFamily: f.medium, fontSize: 13, color: c.muted }}>{hm}</Text>
        {ap ? <Text style={{ fontFamily: f.medium, fontSize: 11, color: c.muted2 }}>{ap}</Text> : null}
      </View>
    );
    if (item.block) {
      const k = item.block;
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: GUTTER, marginTop: 10 }}>
          {time}
          <View style={{ flex: 1, borderWidth: 1, borderStyle: "dashed", borderColor: "#C9BCB4", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.body, fontSize: 13.5, color: c.muted }}>{`${k.reason || "Blocked"}${seeAll && staffName(k.staff_id) ? ` · ${staffName(k.staff_id)}` : ""}`}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 13.5, color: c.muted }}>{`until ${clock(k.ends_at, tz)}`}</Text>
          </View>
        </View>
      );
    }
    const b = item.visit!;
    const live = b.status === "in_progress" || b.status === "checked_in";
    const due = dueOf(b);
    const state = b.status === "paid" ? money(Number(b.total_cents ?? 0), cur) : b.status === "completed" ? `Finished · ${money(due, cur)} to pay` : b.status === "in_progress" ? "In progress" : b.status === "checked_in" ? "Arrived" : b.status === "no_show" ? "No-show"
      : b.status === "requested" ? "Waiting for you to confirm" : b.deposit_paid ? `${money(due, cur)} due at checkout` : `${money(due, cur)} due`;
    const sub = [duration(minutesOf(b)), seeAll && people.length > 1 ? `with ${firstName(b.staff ?? "")}` : "", state].filter(Boolean).join(" · ");
    const tag = b.status === "paid" ? <Tag kind="ok">Paid</Tag> : b.status === "completed" ? <Tag>Check out</Tag> : b.status === "requested" ? <Tag kind="new">Request</Tag> : b.status === "no_show" ? <Tag kind="bad">No-show</Tag> : b.deposit_paid ? <Tag>Deposit</Tag> : null;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${clock(b.starts_at, tz)}, ${comingOf(b)}, ${b.services ?? "Visit"}, ${sub}`} onPress={() => go(`/m/booking/${b.id}`)}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: GUTTER, marginTop: 10, opacity: pressed ? 0.8 : b.status === "no_show" ? 0.6 : 1 })}>
        {time}
        <View style={{ flex: 1, backgroundColor: c.white, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: live ? c.ink : c.line }}>
          <Avatar name={plainName(comingOf(b))} tone={b.staff_tone} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 15, lineHeight: 19, color: c.ink }}>{`${guestOf(b) || shortName(b.client_name)} · ${b.services ?? "Visit"}`}</Text>
            <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12.5, color: c.muted, marginTop: 3 }}>{sub}</Text>
          </View>
          {tag}
        </View>
      </Pressable>
    );
  };

  return (
    <Screen scroll={false} padded={false} top={false}>
      <FlatList data={items} keyExtractor={(x) => x.key} renderItem={renderItem} ListHeaderComponent={header} ListFooterComponent={footer}
        showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { refresh(); void s.refresh().catch(() => undefined); }} tintColor={c.wine} />} />
      <Pressable accessibilityRole="button" accessibilityLabel="New booking" onPress={() => go(`/m/new-booking?date=${day < today ? today : day}`)}
        style={({ pressed }) => ({ position: "absolute", right: 24, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: c.ink, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1, shadowColor: c.ink, shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 12 }, elevation: 8 })}>
        <Icon name="plus" size={24} color={c.cream} stroke={2.2} />
      </Pressable>
      {switcher}
    </Screen>
  );
}

/** The small tag on a visit, as the design draws it. */
function Tag({ children, kind = "gold" }: { children: string; kind?: "gold" | "ok" | "new" | "bad" }) {
  const [bg, fg] = { gold: [c.goldBg, c.goldInk], ok: [c.okBg, c.ok], new: ["#E4ECF7", "#1F4B7A"], bad: [c.badBg, c.bad] }[kind];
  return <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: bg }}><Text style={{ fontFamily: f.semi, fontSize: 11, color: fg }}>{children}</Text></View>;
}
