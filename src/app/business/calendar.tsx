// The business calendar (design: M8-Week). One call loads a week (it starts on its Monday);
// the three views, Day, Week and Staff, are three ways of looking at that week.
// A team member who may not see everyone's calendar is sent only their own column by the API,
// and then the person filter is not shown.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import { Chip, Empty, Failed, Field, Icon, Label, Loading, Note, Row as Line, Serif, T, Btn } from "@/components/ui";
import { ChipRow, Choice, Fab, Face, RoundBtn, Seg, Sheet, Tag, TimeStep } from "@/components/mb-ui";
import type { Row } from "@/lib/api";
import { clock, duration, firstName, money, plural, ymd } from "@/lib/format";
import { useFlash, useMapi, useRefocus } from "@/lib/mb-hooks";
import { addDays, clockOf, dayFull, dayLabel, dayMonth, dayOf, dowOf, dowShort, guestOf, hhmm, hourMark, isImported, lengthOf, mins, minutesOfDay, mondayOf, STATUS_LABEL, statusTone, weekTitle, whoOf } from "@/lib/mb-util";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

type ViewId = "day" | "week" | "staff";
const HOUR = 56; // pixels per hour, as the design draws it
const GUTTER = 16; // this screen's side gutter is the design's 16, not the usual 20
const AXIS = 34;

type Item = { id: string; kind: "booking" | "block"; row: Row; start: number; end: number; lane: number; of: number };

/** Things at the same time for one column share its width, side by side. */
function lanes(list: Omit<Item, "lane" | "of">[]): Item[] {
  const out: Item[] = [];
  let cluster: Item[] = [], ends: number[] = [], clusterEnd = 0;
  const close = () => { for (const x of cluster) x.of = ends.length; cluster = []; ends = []; };
  for (const x of [...list].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (cluster.length && x.start >= clusterEnd) close();
    let lane = ends.findIndex((e) => e <= x.start);
    if (lane < 0) { lane = ends.length; ends.push(x.end); } else ends[lane] = x.end;
    const it = { ...x, lane, of: 1 };
    out.push(it); cluster.push(it); clusterEnd = Math.max(clusterEnd, x.end);
  }
  close();
  return out;
}

/** The striped fill of a day nobody is working. */
function Hatch() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <Pattern id="mbHatch" width={12} height={12} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Rect width={6} height={12} fill={c.cream2} /><Rect x={6} width={6} height={12} fill="#F7F0E7" />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#mbHatch)" />
    </Svg>
  );
}

const subOf = (b: Row, cur: string) => [b.services ?? "Visit", b.status === "paid" ? "paid" : b.status === "completed" ? "to check out" : b.status === "in_progress" ? "in progress" : b.status === "checked_in" ? "arrived" : b.status === "requested" ? "request" : b.status === "no_show" ? "no-show" : b.deposit_paid ? `deposit ${money(b.deposit_cents, cur)}` : ""].filter(Boolean).join(" · ");
const edgeOf = (b: Row) => (b.status === "no_show" ? c.bad : b.status === "paid" || b.status === "completed" ? c.muted2 : b.deposit_paid ? c.gold : c.wine);

/** One column of the grid: a day in the Week view, a person in the Staff view. */
function Column({ items, startH, endH, off, shut, breaks, now, compact, tz, cur, onBooking, onBlock }: {
  items: Item[]; startH: number; endH: number; off: boolean; shut: [number, number][]; breaks: [number, number][]; now: number; compact: boolean; tz?: string; cur: string;
  onBooking: (b: Row) => void; onBlock: (b: Row) => void;
}) {
  const height = (endH - startH) * HOUR;
  const y = (m: number) => ((m - startH * 60) / 60) * HOUR;
  return (
    <View style={{ flex: 1, height, borderRadius: 8, backgroundColor: "#F4ECE2", overflow: "hidden" }}>
      {off ? <Hatch /> : null}
      {!off && shut.map(([a, b], i) => <View key={"s" + i} style={{ position: "absolute", left: 0, right: 0, top: y(a), height: y(b) - y(a), backgroundColor: c.cream2, opacity: 0.75 }} />)}
      {!off && breaks.map(([a, b], i) => (
        <View key={"b" + i} accessibilityLabel={`Break ${clockOf(a)} to ${clockOf(b)}`} style={{ position: "absolute", left: 2, right: 2, top: y(a) + 1, height: Math.max(10, y(b) - y(a) - 2), borderRadius: 6, borderWidth: 1, borderStyle: "dashed", borderColor: "#C9BCB0", backgroundColor: "#EFE5DA", justifyContent: "center", paddingHorizontal: 4 }}>
          {!compact && y(b) - y(a) >= 20 ? <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 11, color: c.muted }}>Break</Text> : null}
        </View>
      ))}
      {items.map((it) => {
        const top = y(it.start) + 1, h = Math.max(20, y(it.end) - y(it.start) - 2);
        const box = it.of === 1 ? { left: 2, right: 2 } : { left: `${(it.lane / it.of) * 100}%` as const, width: `${100 / it.of}%` as const, paddingHorizontal: 1 };
        const words = !compact || it.of === 1;
        if (it.kind === "block") {
          const b = it.row;
          return (
            <View key={it.id} style={[{ position: "absolute", top, height: h }, box]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Blocked, ${b.reason || "no reason given"}, ${clock(b.starts_at, tz)} to ${clock(b.ends_at, tz)}`} onPress={() => onBlock(b)}
                style={{ flex: 1, borderRadius: 6, backgroundColor: c.line2, borderLeftWidth: 3, borderLeftColor: "#B5A99E", paddingLeft: compact ? 3 : 5, paddingRight: 1, paddingTop: 2, overflow: "hidden" }}>
                {words ? <Text numberOfLines={1} ellipsizeMode="clip" style={{ fontFamily: f.semi, fontSize: 11, lineHeight: 13, color: c.muted }}>{compact ? "Block" : b.reason || "Blocked"}</Text> : null}
                {words && !compact && h >= 34 ? <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 11, lineHeight: 13, color: c.muted }}>{isImported(b) ? "Own calendar" : "Blocked"}</Text> : null}
              </Pressable>
            </View>
          );
        }
        const b = it.row, live = b.status === "in_progress" || b.status === "checked_in", gone = b.status === "no_show", done = b.status === "paid" || b.status === "completed";
        const name = guestOf(b) || String(b.client_name ?? "");
        return (
          <View key={it.id} style={[{ position: "absolute", top, height: h }, box]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${clock(b.starts_at, tz)} to ${clock(b.ends_at, tz)}, ${whoOf(b)}, ${subOf(b, cur)}, with ${b.staff}`} onPress={() => onBooking(b)}
              style={({ pressed }) => ({ flex: 1, borderRadius: 6, backgroundColor: live ? c.wineBg : c.white, borderWidth: 1, borderColor: c.line, borderStyle: b.status === "requested" ? "dashed" : "solid", borderLeftWidth: 3, borderLeftColor: edgeOf(b), paddingLeft: compact ? 2 : 4, paddingRight: 1, paddingTop: 2, overflow: "hidden", opacity: pressed ? 0.8 : done || gone ? 0.72 : 1 })}>
              {words ? <Text numberOfLines={compact ? undefined : 1} style={{ fontFamily: f.semi, fontSize: 11, lineHeight: 13, height: 13, overflow: "hidden", color: c.ink, textDecorationLine: gone ? "line-through" : "none" }}>{compact ? firstName(name) : name}</Text> : null}
              {words && h >= 34 ? <Text numberOfLines={compact ? Math.min(3, Math.max(1, Math.floor((h - 18) / 13))) : 1} style={{ fontFamily: f.body, fontSize: 11, lineHeight: 13, color: c.muted }}>{compact ? b.services ?? "Visit" : subOf(b, cur)}</Text> : null}
            </Pressable>
          </View>
        );
      })}
      {now >= startH * 60 && now <= endH * 60 ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: y(now), height: 1.5, backgroundColor: "#9B2335" }}>
          <View style={{ position: "absolute", left: -3, top: -3, width: 7, height: 7, borderRadius: 4, backgroundColor: "#9B2335" }} />
        </View>
      ) : null}
    </View>
  );
}

function Axis({ startH, endH, top = 0 }: { startH: number; endH: number; top?: number }) {
  return (
    <View style={{ width: AXIS, height: (endH - startH) * HOUR + top }}>
      {Array.from({ length: endH - startH }, (_, i) => <Text key={i} style={{ position: "absolute", left: 0, top: top + i * HOUR - 6, fontFamily: f.semi, fontSize: 11, lineHeight: 13, color: c.muted2 }}>{hourMark(startH + i)}</Text>)}
    </View>
  );
}

export default function Calendar() {
  const s = useSession();
  const mapi = useMapi();
  const insets = useSafeAreaInsets();
  const me = s.merchant, tz = me?.timezone as string | undefined, cur = (me?.currency as string) ?? "USD";
  const today = ymd(new Date(), tz);

  const [date, setDate] = useState(today);
  const [view, setView] = useState<ViewId>("week");
  const [whoPick, setWho] = useState<string | null>(null); // a person's id, "" for everyone, or not chosen yet
  const [picked, setPicked] = useState<Row | null>(null); // the blocked time that is open
  const [removing, setRemoving] = useState(false), [confirmRemove, setConfirmRemove] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [form, setForm] = useState({ staff: "", day: today, from: 13 * 60, to: 14 * 60, reason: "" });
  const [saving, setSaving] = useState(false), [formError, setFormError] = useState("");
  const { flash, show } = useFlash();

  const monday = mondayOf(date);
  const cal = useLoad<Row>(() => mapi(`/calendar?date=${monday}&days=7`), [monday, s.businessToken]);
  useRefocus(() => { void cal.reload(); });
  const d = cal.data && cal.data.date === monday ? cal.data : null;
  // With a team, a week of everyone's bookings in seven narrow columns is unreadable, so the Day and Week views open on the
  // signed-in person's own calendar when they take bookings. "Everyone" is one press away. The Staff view always shows the team side by side.
  const team0 = ((d?.staff ?? []) as Row[]);
  const own = team0.length > 1 && team0.some((p) => p.id === me?.staff_id && p.bookable) ? String(me?.staff_id) : "";
  const picked0 = whoPick ?? own;
  const who = view === "staff" ? "" : picked0;

  const shaped = useMemo(() => {
    if (!d) return null;
    const staffAll = (d.staff ?? []) as Row[], timeOff = (d.time_off ?? []) as Row[];
    const locHours = (d.location_hours ?? {}) as Record<string, string[] | null>;
    const person = who ? staffAll.find((p) => p.id === who) ?? null : null;
    const mine = (x: Row) => !person || x.staff_id === person.id;
    const bookings = ((d.bookings ?? []) as Row[]).filter(mine), blocks = ((d.blocks ?? []) as Row[]).filter(mine);
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const hoursFor = (p: Row, day: string): string[] | null => (p.hours ? p.hours[dowOf(day)] : locHours[dowOf(day)]) ?? null;
    const isOff = (p: Row, day: string) => timeOff.some((o) => o.staff_id === p.id && String(o.starts_on).slice(0, 10) <= day && String(o.ends_on).slice(0, 10) >= day);
    const working = (p: Row, day: string) => !!hoursFor(p, day) && !isOff(p, day);
    const breaksOf = (p: Row, day: string): [number, number][] => (working(p, day) ? ((((p.breaks ?? {}) as Record<string, string[][]>)[dowOf(day)] ?? []).map((b) => [mins(b[0]), mins(b[1])] as [number, number])) : []);
    const team = (person ? [person] : staffAll).filter((p) => p.bookable);

    // The hours the grid covers: the earliest opening to the latest closing this week, stretched to fit anything booked outside them.
    let lo = 9 * 60, hi = 17 * 60;
    const openMin: Record<string, number> = {};
    for (const day of days) {
      openMin[day] = 0;
      for (const p of team) {
        const h = hoursFor(p, day);
        if (h && !isOff(p, day)) { lo = Math.min(lo, mins(h[0])); hi = Math.max(hi, mins(h[1])); openMin[day] += Math.max(0, mins(h[1]) - mins(h[0])); }
      }
    }
    const place = (x: Row, kind: "booking" | "block") => {
      const start = minutesOfDay(x.starts_at, tz);
      return { id: String(x.id), kind, row: x, start, end: Math.min(24 * 60, start + Math.max(15, lengthOf(x))), day: dayOf(x.starts_at, tz) };
    };
    const placed = [...blocks.map((b) => place(b, "block")), ...bookings.map((b) => place(b, "booking"))].filter((x) => days.includes(x.day));
    for (const x of placed) { lo = Math.min(lo, x.start); hi = Math.max(hi, x.end); }
    const startH = Math.floor(lo / 60), endH = Math.min(24, Math.ceil(hi / 60));
    const count: Record<string, number> = {};
    for (const x of placed) if (x.kind === "booking" && x.row.status !== "no_show") count[x.day] = (count[x.day] ?? 0) + 1;
    return { staffAll, locHours, person, bookings, blocks, days, hoursFor, isOff, working, breaksOf, team, openMin, placed, startH, endH, count, waitlist: Number(d.stats?.waitlist ?? 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, who, monday, tz]);

  // ----- moving about -----
  const go = (day: string) => setDate(day);
  const step = view === "week" ? 7 : 1;
  const title = view === "week" ? weekTitle(monday) : dayLabel(date);
  const unit = view === "week" ? "week" : "day";

  const openBooking = (b: Row) => router.push(`/m/booking/${b.id}` as never);
  const newBooking = () => router.push(`/m/new-booking?date=${date < today ? today : date}` as never);
  const openBlockForm = () => {
    const staffAll = shaped?.staffAll ?? [];
    const mineId = staffAll.some((p) => p.id === me?.staff_id) ? String(me?.staff_id) : String(staffAll[0]?.id ?? "");
    setForm({ staff: who || mineId, day: date < today && view === "week" ? today : date, from: 13 * 60, to: 14 * 60, reason: "" });
    setFormError("");
    setBlockOpen(true);
  };
  const saveBlock = async () => {
    if (!form.staff) { setFormError("Choose who the time is for."); return; }
    if (form.to <= form.from) { setFormError("The end must be later than the start."); return; }
    setSaving(true); setFormError("");
    try {
      await mapi("/blocks", { method: "POST", body: { staff_id: form.staff, starts_at: `${form.day}T${hhmm(form.from)}`, ends_at: `${form.day}T${hhmm(form.to)}`, reason: form.reason.trim() } });
      setBlockOpen(false);
      if (mondayOf(form.day) !== monday || view !== "week") setDate(form.day);
      show("Time blocked. Clients cannot book it.");
      void cal.reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const removeBlock = async () => {
    if (!picked) return;
    setRemoving(true);
    try {
      await mapi(`/blocks/${encodeURIComponent(picked.id)}`, { method: "DELETE" });
      setPicked(null); setConfirmRemove(false);
      show("Block removed. The time is open again.");
      void cal.reload();
    } catch (e) {
      setPicked(null); setConfirmRemove(false);
      show((e as Error).message, "bad");
      void cal.reload();
    } finally {
      setRemoving(false);
    }
  };

  // ----- the numbers under the title, for what is on screen: the week, or the chosen day -----
  const scope = shaped ? (view === "week" ? shaped.days : [date]) : [];
  const counted = shaped ? shaped.placed.filter((x) => x.kind === "booking" && x.row.status !== "no_show" && scope.includes(x.day)) : [];
  const expected = counted.reduce((a, x) => a + Number(x.row.total_cents ?? 0), 0);
  const bookedMin = counted.reduce((a, x) => a + lengthOf(x.row), 0);
  const open = shaped ? scope.reduce((a, day) => a + (shaped.openMin[day] ?? 0), 0) : 0;

  const refresh = <RefreshControl refreshing={cal.refreshing} onRefresh={() => { void cal.refresh(); }} tintColor={c.wine} />;
  const nowMin = minutesOfDay(new Date(), tz);

  // The strip of seven days. In the Week view it heads the grid's columns; in the other two it also picks the day.
  const strip = shaped ? (
    <View style={{ flexDirection: "row", gap: 3, marginTop: 12 }}>
      <View style={{ width: AXIS }} />
      {shaped.days.map((day) => {
        const n = shaped.count[day] ?? 0, isToday = day === today, chosen = view !== "week" && day === date;
        const dark = view === "week" ? isToday : chosen;
        return (
          <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected: chosen }} accessibilityLabel={`${dayFull(day)}${isToday ? ", today" : ""}, ${plural(n, "booking")}`}
            onPress={() => { go(day); if (view === "week") setView("day"); }} style={{ flex: 1, alignItems: "center", paddingTop: 4, paddingBottom: 6, minHeight: 44 }}>
            <Text style={{ fontFamily: f.semi, fontSize: 11, lineHeight: 13, color: c.muted }}>{dowShort(day)}</Text>
            <View style={{ width: 24, height: 24, borderRadius: 8, marginTop: 1, alignItems: "center", justifyContent: "center", backgroundColor: dark ? c.ink : "transparent", borderWidth: !dark && isToday ? 1.5 : 0, borderColor: c.ink }}>
              <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 18, color: dark ? c.cream : c.ink }}>{Number(day.slice(8))}</Text>
            </View>
            {view !== "week" ? (
              <View style={{ flexDirection: "row", gap: 2, height: 6, marginTop: 3, alignItems: "center" }}>
                {Array.from({ length: Math.min(3, n) }, (_, i) => <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.wine }} />)}
                {n > 3 ? <View style={{ width: 6, height: 2, borderRadius: 1, backgroundColor: c.wine }} /> : null}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  ) : null;

  let body = null;
  if (!s.ready || (cal.loading && !d)) body = <View style={{ paddingHorizontal: GUTTER }}><Loading label="Loading the calendar" /></View>;
  else if (!d || !shaped) body = <View style={{ paddingHorizontal: GUTTER, paddingTop: 16 }}><Failed error={cal.error || "The calendar could not be loaded."} onRetry={() => { void cal.reload(); }} /></View>;
  else if (view === "week") {
    const nothing = shaped.placed.length === 0;
    body = (
      <ScrollView refreshControl={refresh} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 96 }}>
        {nothing ? <View style={{ marginBottom: 12 }}><Empty title="Nothing booked this week">{shaped.person ? `Nothing is on ${firstName(shaped.person.name)}'s calendar from ${weekTitle(monday)}.` : "Bookings made online show here by themselves."} Use the plus button to add one.</Empty></View> : null}
        <View style={{ flexDirection: "row", gap: 3 }}>
          <Axis startH={shaped.startH} endH={shaped.endH} />
          {shaped.days.map((day) => {
            const p = shaped.person ?? (shaped.staffAll.length === 1 ? shaped.staffAll[0] : null);
            const hours = p ? (shaped.working(p, day) ? shaped.hoursFor(p, day) : null) : shaped.locHours[dowOf(day)] ?? null;
            const has = shaped.placed.some((x) => x.day === day);
            const off = !hours && !has;
            const shut: [number, number][] = hours ? [[shaped.startH * 60, mins(hours[0])], [mins(hours[1]), shaped.endH * 60]].filter(([a, b]) => b > a) as [number, number][] : [];
            return (
              <Column key={day} compact tz={tz} cur={cur} startH={shaped.startH} endH={shaped.endH} off={off} shut={shut} breaks={p ? shaped.breaksOf(p, day) : []}
                now={day === today ? nowMin : -1} items={lanes(shaped.placed.filter((x) => x.day === day))} onBooking={openBooking} onBlock={setPicked} />
            );
          })}
        </View>
      </ScrollView>
    );
  } else if (view === "day") {
    type Entry = { key: string; kind: "booking" | "block" | "break"; start: number; end: number; row?: Row; who?: string };
    const entries: Entry[] = [
      ...shaped.placed.filter((x) => x.day === date).map((x) => ({ key: x.id, kind: x.kind, start: x.start, end: x.end, row: x.row })),
      ...(shaped.person ? [shaped.person] : shaped.staffAll.filter((p) => p.bookable)).flatMap((p) => shaped.breaksOf(p, date).map(([a, b], i) => ({ key: `brk-${p.id}-${i}`, kind: "break" as const, start: a, end: b, who: String(p.name) }))),
    ].sort((a, b) => a.start - b.start || a.end - b.end);
    const closed = shaped.team.every((p) => !shaped.working(p, date));
    const hasWork = entries.some((e) => e.kind !== "break");
    body = (
      <FlatList data={hasWork ? entries : []} keyExtractor={(e) => e.key} refreshControl={refresh} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 10, paddingBottom: 96, gap: 8 }}
        ListEmptyComponent={<Empty title={closed ? "Closed this day" : "Nothing booked this day"}>{closed ? (shaped.person ? `${firstName(shaped.person.name)} is not working on ${dayLabel(date)}.` : `Nobody is working on ${dayLabel(date)}.`) : "Bookings made online show here by themselves."} Use the plus button to add a booking.</Empty>}
        renderItem={({ item: e }) => {
          const time = (
            <View style={{ width: 62, paddingTop: 12 }}>
              <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.ink }}>{clockOf(e.start)}</Text>
              <Text style={{ fontFamily: f.body, fontSize: 11, color: c.muted2 }}>{duration(e.end - e.start)}</Text>
            </View>
          );
          if (e.kind === "break") {
            return (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {time}
                <View style={{ flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "#C9BCB0", backgroundColor: "#EFE5DA", paddingHorizontal: 12, justifyContent: "center" }}>
                  <T size={13} weight="semi" muted>Break{shaped.staffAll.length > 1 ? ` · ${firstName(e.who ?? "")}` : ""}</T>
                </View>
              </View>
            );
          }
          const b = e.row!;
          if (e.kind === "block") {
            const p = shaped.staffAll.find((x) => x.id === b.staff_id);
            return (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {time}
                <Pressable accessibilityRole="button" onPress={() => setPicked(b)} style={({ pressed }) => ({ flex: 1, minHeight: 56, borderRadius: 14, backgroundColor: c.line2, borderLeftWidth: 3, borderLeftColor: "#B5A99E", paddingHorizontal: 12, paddingVertical: 9, justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
                  <T size={14} weight="semi" color={c.muted} numberOfLines={1}>{b.reason || "Blocked"}</T>
                  <T size={12} muted numberOfLines={1}>{isImported(b) ? "From their own calendar" : "Blocked"}{p && shaped.staffAll.length > 1 ? ` · ${firstName(p.name)}` : ""} · until {clock(b.ends_at, tz)}</T>
                </Pressable>
              </View>
            );
          }
          const live = b.status === "in_progress" || b.status === "checked_in";
          return (
            <View style={{ flexDirection: "row", gap: 8 }}>
              {time}
              <Pressable accessibilityRole="button" onPress={() => openBooking(b)}
                style={({ pressed }) => ({ flex: 1, minHeight: 56, borderRadius: 14, backgroundColor: live ? c.wineBg : c.white, borderWidth: 1, borderColor: c.line, borderStyle: b.status === "requested" ? "dashed" : "solid", borderLeftWidth: 3, borderLeftColor: edgeOf(b), paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8, opacity: pressed ? 0.85 : 1 })}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T size={15} weight="semi" numberOfLines={1}>{guestOf(b) || b.client_name}</T>
                  <T size={12} muted numberOfLines={2}>{[guestOf(b) ? `booked by ${b.client_name}` : "", b.services ?? "Visit", shaped.staffAll.length > 1 ? `with ${firstName(b.staff ?? "")}` : "", money(b.total_cents, cur)].filter(Boolean).join(" · ")}</T>
                </View>
                <Tag tone={b.status === "confirmed" && b.deposit_paid ? "gold" : statusTone(b.status)}>{b.status === "confirmed" && b.deposit_paid ? "Deposit paid" : STATUS_LABEL[b.status] ?? b.status}</Tag>
              </Pressable>
            </View>
          );
        }} />
    );
  } else {
    // Staff: one column for each person who takes bookings, or has one this day.
    const cols = (shaped.person ? [shaped.person] : shaped.staffAll).filter((p) => p.bookable || shaped.placed.some((x) => x.day === date && x.row.staff_id === p.id));
    const wide = cols.length > 3;
    const HEAD = 48;
    const columns = (
      <View style={{ flexDirection: "row", gap: 3, flex: wide ? undefined : 1 }}>
        {cols.map((p) => {
          const hours = shaped.working(p, date) ? shaped.hoursFor(p, date) : null;
          const mine = shaped.placed.filter((x) => x.day === date && x.row.staff_id === p.id);
          const booked = mine.filter((x) => x.kind === "booking" && x.row.status !== "no_show");
          const shut: [number, number][] = hours ? [[shaped.startH * 60, mins(hours[0])], [mins(hours[1]), shaped.endH * 60]].filter(([a, b]) => b > a) as [number, number][] : [];
          return (
            <View key={p.id} style={wide ? { width: 112 } : { flex: 1, minWidth: 0 }}>
              <View style={{ height: HEAD, flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 6 }}>
                <Face name={p.name} tone={p.tone || c.wine} size={28} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 13, color: c.ink }}>{firstName(p.name)}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 11, color: c.muted }}>{shaped.isOff(p, date) ? "Time off" : !hours ? "Not working" : `${booked.length} booked`}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row" }}>
                <Column compact={false} tz={tz} cur={cur} startH={shaped.startH} endH={shaped.endH} off={!hours && mine.length === 0} shut={shut} breaks={shaped.breaksOf(p, date)}
                  now={date === today ? nowMin : -1} items={lanes(mine)} onBooking={openBooking} onBlock={setPicked} />
              </View>
            </View>
          );
        })}
      </View>
    );
    body = cols.length === 0 ? (
      <ScrollView refreshControl={refresh} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 12 }}>
        <Empty title="Nobody takes bookings yet">Add your team and switch on who takes bookings, on the web under Staff. Their columns show here.</Empty>
      </ScrollView>
    ) : (
      <ScrollView refreshControl={refresh} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 96 }}>
        <View style={{ flexDirection: "row", gap: 3 }}>
          <Axis startH={shaped.startH} endH={shaped.endH} top={HEAD} />
          {wide ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>{columns}</ScrollView> : columns}
        </View>
      </ScrollView>
    );
  }

  const blockStaff = picked ? shaped?.staffAll.find((p) => p.id === picked.staff_id) : null;
  const formDays = shaped ? (shaped.days.includes(form.day) ? shaped.days : [form.day, ...shaped.days]) : [form.day];

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: GUTTER }}>
        <Line between gap={6}>
          <Line gap={4} style={{ flex: 1, minWidth: 0 }}>
            <RoundBtn size={40} label={`Previous ${unit}`} onPress={() => go(addDays(date, -step))}><Icon name="back" size={16} /></RoundBtn>
            <Serif size={title.length > 11 ? 15 : 19} numberOfLines={1} style={{ flexShrink: 1 }}>{title}</Serif>
            <RoundBtn size={40} label={`Next ${unit}`} onPress={() => go(addDays(date, step))}><Icon name="next" size={16} /></RoundBtn>
          </Line>
          <Seg options={[["day", "Day"], ["week", "Week"], ["staff", "Staff"]]} value={view} onChange={setView} />
        </Line>

        {shaped ? (
          <Line between gap={8} style={{ marginTop: 10, minHeight: 22 }}>
            <Text style={{ flex: 1, fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>
              <Text style={{ fontFamily: f.bold, color: c.ink }}>{plural(counted.length, "booking")}</Text> · {money(expected, cur)} expected · {open > 0 ? `${Math.min(100, Math.round((bookedMin / open) * 100))}% booked` : "closed"}
            </Text>
            {shaped.waitlist > 0 && shaped.staffAll.length > 1 ? <Tag tone="gold">Waitlist {shaped.waitlist}</Tag> : null}
          </Line>
        ) : null}

        <ChipRow gutter={GUTTER} style={{ marginTop: 10 }}>
          <Chip on={false} onPress={() => go(today)}>Today</Chip>
          <Chip icon="clock" onPress={openBlockForm}>Block time</Chip>
          {shaped && shaped.staffAll.length > 1 && view !== "staff" ? (
            <>
              <View style={{ width: 1, height: 22, backgroundColor: c.line2 }} />
              <Chip on={!who} onPress={() => setWho("")}>Everyone</Chip>
              {shaped.staffAll.filter((p) => p.bookable || shaped.bookings.some((b) => b.staff_id === p.id) || p.id === who).map((p) => <Chip key={p.id} on={who === p.id} onPress={() => setWho(String(p.id))}>{firstName(p.name)}</Chip>)}
            </>
          ) : null}
        </ChipRow>

        {flash ? <View style={{ marginTop: 10 }}><Note kind={flash.kind}>{flash.text}</Note></View> : null}
        {d && cal.error ? <View style={{ marginTop: 10 }}><Note kind="bad">{cal.error} Showing what was loaded before.</Note></View> : null}
        {strip}
      </View>

      <View style={{ flex: 1 }}>{body}</View>
      {d ? <Fab label="New booking" onPress={newBooking} /> : null}

      {/* Block time: for lunch, training or a break. */}
      <Sheet open={blockOpen} onClose={() => setBlockOpen(false)} title="Block time" sub="For lunch, training or a break. Clients cannot book a blocked time."
        footer={<Btn busy={saving} onPress={saveBlock}>Block it</Btn>}>
        {formError ? <Note kind="bad">{formError}</Note> : null}
        {shaped && shaped.staffAll.length > 1 ? (
          <View style={{ gap: 6 }}>
            <Label>Who</Label>
            <ChipRow>{shaped.staffAll.map((p) => <Chip key={p.id} on={form.staff === p.id} onPress={() => setForm({ ...form, staff: String(p.id) })}>{firstName(p.name)}</Chip>)}</ChipRow>
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          <Label>Day</Label>
          <ChipRow>{formDays.map((day) => <Chip key={day} on={form.day === day} onPress={() => setForm({ ...form, day })}>{day === today ? "Today" : `${dowShort(day)} ${dayMonth(day)}`}</Chip>)}</ChipRow>
        </View>
        <Line gap={10} style={{ alignItems: "flex-start" }}>
          <TimeStep label="From" value={form.from} max={23 * 60 + 30} onChange={(from) => setForm((x) => ({ ...x, from, to: x.to <= from ? Math.min(23 * 60 + 45, from + 60) : x.to }))} />
          <TimeStep label="To" value={form.to} min={15} max={23 * 60 + 45} onChange={(to) => setForm((x) => ({ ...x, to }))} />
        </Line>
        <Field label="Reason" value={form.reason} onChangeText={(reason) => setForm({ ...form, reason })} maxLength={80} placeholder="Lunch" returnKeyType="done" />
      </Sheet>

      {/* A blocked time that was pressed. One made by hand can be removed; one read from a person's own calendar cannot. */}
      <Sheet open={!!picked} onClose={() => { setPicked(null); setConfirmRemove(false); }} title={picked ? picked.reason || "Blocked time" : ""} sub={blockStaff ? String(blockStaff.name) : undefined}
        footer={picked && !isImported(picked) ? (
          confirmRemove
            ? <><Btn kind="danger" busy={removing} onPress={removeBlock}>Yes, remove it</Btn><Btn kind="soft" onPress={() => setConfirmRemove(false)}>Keep it</Btn></>
            : <Btn kind="out" onPress={() => setConfirmRemove(true)}>Remove block</Btn>
        ) : undefined}>
        {picked ? (
          <>
            <Choice title={dayFull(dayOf(picked.starts_at, tz))} sub={`${clock(picked.starts_at, tz)} to ${clock(picked.ends_at, tz)} · ${duration(lengthOf(picked))}`} right={<Tag tone="wine">Block</Tag>} />
            {isImported(picked)
              ? <T size={14} muted>This busy time was read from {blockStaff ? `${firstName(blockStaff.name)}'s` : "their"} own calendar. Change it there and it updates here by itself, so it cannot be removed by hand.</T>
              : confirmRemove ? <T size={14} muted>Remove this block? Clients will be able to book the time again.</T>
              : <T size={14} muted>Clients cannot book this time.</T>}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
