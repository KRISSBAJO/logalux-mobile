import { useFormReset } from "../lib/form-reset";
// Step one of booking: who, which day, what time (design: C4-Time).
// The days come a month at a time from the API and are shown a week at a time, as the design draws them.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Cta, Grp, Head, Icon, Round, Shell, Strip } from "@/components/cb-ui";
import { Note, Row, T } from "@/components/ui";
import { api } from "@/lib/api";
import { addDays, nice, dayLabel, dowShort, mondayOf, monthLabel, shiftMonth, type Biz, type DayCell, type Pro, type Slot } from "@/lib/cb-lib";
import { duration, firstName, money } from "@/lib/format";
import { c, f, pad } from "@/lib/theme";

export type Times = { ready: boolean; failed: boolean; slots: Slot[] };
type Props = {
  biz: Biz; ids: string; mins: number; summary: string; pros: Pro[]; anyone: boolean;
  staff: string; date: string; time: string; today: string; lastDay: string;
  times: Times; slot: Slot | null; notice: string; reload: number;
  onRetry: () => void; onPick: (p: { staff?: string; date?: string; time?: string | null }) => void;
  onContinue: () => void; onBack: () => void; onWaitlist: () => void;
};

export function CbTime(p: Props) {
  const { biz, ids, staff, date, time, today, lastDay, times, reload } = p;
  const maxDays = biz.policy.max_days ?? 60;
  const waitlist = biz.policy.waitlist !== false;
  const pro = p.pros.find((x) => x.id === staff);

  // ----- which days have room: a month at a time, kept so that moving between weeks does not ask twice -----
  const scope = `${ids}|${staff}|${reload}`;
  const [months, setMonths] = useState<Record<string, DayCell[] | "failed">>({});
  const asked = useRef(new Map<string, Promise<DayCell[] | null>>());
  const getMonth = useCallback((month: string) => {
    const key = `${scope}|${month}`;
    let job = asked.current.get(key);
    if (!job) {
      job = api<{ days?: DayCell[] }>(`/businesses/${encodeURIComponent(biz.slug)}/days?month=${month}&services=${ids}&staff=${staff}`)
        .then((j) => { const days = j.days ?? []; setMonths((m) => ({ ...m, [key]: days })); return days; })
        .catch(() => { asked.current.delete(key); setMonths((m) => ({ ...m, [key]: "failed" })); return null; });
      asked.current.set(key, job);
    }
    return job;
  }, [scope, biz.slug, ids, staff]);

  // ----- the week on show -----
  const [week, setWeek] = useState(mondayOf(date || today));
  useFormReset([date], () => { if (date) setWeek(mondayOf(date)); });
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  useEffect(() => {
    for (const m of new Set([weekDays[0].slice(0, 7), weekDays[6].slice(0, 7)])) if (m >= today.slice(0, 7) && m <= lastDay.slice(0, 7)) void getMonth(m);
  }, [weekDays, getMonth, today, lastDay]);
  const cellOf = (d: string): DayCell | "failed" | undefined => {
    if (d < today) return { date: d, open: 0, from_cents: 0, past: true, too_far: false };
    if (d > lastDay) return { date: d, open: 0, from_cents: 0, past: false, too_far: true };
    const m = months[`${scope}|${d.slice(0, 7)}`];
    return m === "failed" ? "failed" : m?.find((x) => x.date === d);
  };
  const cells = weekDays.map(cellOf);
  const weekReady = cells.every((x) => x !== undefined);
  const weekFailed = cells.some((x) => x === "failed");
  const isOpen = (x: DayCell | "failed" | undefined) => !!x && x !== "failed" && x.open > 0 && !x.past && !x.too_far;
  const weekHasRoom = cells.some(isOpen);

  // With no day chosen yet, start on the first one that has room, looking as far ahead as the business allows.
  const [nothing, setNothing] = useState(false);
  useFormReset([date], () => { setNothing(false); });
  useEffect(() => {
    if (date) return;
    let live = true;
    (async () => {
      for (let m = today.slice(0, 7); m <= lastDay.slice(0, 7); m = shiftMonth(m, 1)) {
        const days = await getMonth(m);
        if (!live) return;
        if (!days) return; // could not be loaded: the week says so and offers to try again
        const first = days.find((x) => x.open > 0 && !x.past && !x.too_far);
        if (first) { p.onPick({ date: first.date, time: null }); return; }
      }
      setNothing(true);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, getMonth, today, lastDay]);

  // ----- the free times of the chosen day -----
  const list = times.ready ? times.slots : [];
  const varies = new Set(list.map((s) => s.price_cents)).size > 1;
  const am = list.filter((s) => s.time < "12:00"), pm = list.filter((s) => s.time >= "12:00");
  const dayIsFull = !!date && times.ready && !times.failed && list.length === 0;
  const withWhom = pro ? ` with ${firstName(pro.name)}` : "";

  const slotRows = (items: Slot[]) => {
    const rows: Slot[][] = [];
    for (let i = 0; i < items.length; i += 4) rows.push(items.slice(i, i + 4));
    return (
      <View style={{ gap: 8 }}>
        {rows.map((r) => (
          <View key={r[0].time} style={{ flexDirection: "row", gap: 8 }}>
            {r.map((s) => {
              const on = s.time === time;
              return (
                <Pressable key={s.time} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${nice(s.time)}${varies ? `, ${money(s.price_cents, biz.currency)}` : ""}`} onPress={() => p.onPick({ time: s.time })}
                  style={({ pressed }) => ({ flex: 1, minHeight: varies ? 52 : 44, borderRadius: 12, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
                  <Text style={{ fontFamily: f.semi, fontSize: 14, color: on ? c.cream : c.ink }}>{nice(s.time)}</Text>
                  {varies ? <Text style={{ fontFamily: f.body, fontSize: 11, color: on ? "#C9BCB0" : c.muted, marginTop: 1 }}>{money(s.price_cents, biz.currency)}</Text> : null}
                </Pressable>
              );
            })}
            {Array.from({ length: 4 - r.length }, (_, i) => <View key={i} style={{ flex: 1 }} />)}
          </View>
        ))}
      </View>
    );
  };

  const who = (id: string, name: string, sub: string, mark: string, tone: string, wide: boolean) => {
    const on = staff === id;
    return (
      <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${name}${sub ? `, ${sub}` : ""}`} onPress={() => p.onPick({ staff: id, time: null })}
        style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, borderRadius: 16, backgroundColor: c.white, borderWidth: on ? 2 : 1, borderColor: on ? c.ink : c.line2, paddingVertical: on ? 9 : 10, paddingHorizontal: on ? 11 : 12, opacity: pressed ? 0.85 : 1 }, wide ? { width: 190 } : { flex: 1 }]}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tone, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: f.bold, fontSize: 13, color: "#F4ECE3" }}>{mark}</Text></View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{name}</Text>
          {sub ? <Text numberOfLines={2} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 16, color: c.muted }}>{sub}</Text> : null}
        </View>
      </Pressable>
    );
  };
  const people = [...p.pros.map((x) => ({ id: x.id, name: x.name, sub: x.sub, mark: x.initials, tone: x.tone })), ...(p.anyone ? [{ id: "any", name: "Anyone available", sub: "First open slot", mark: "✦", tone: c.ink }] : [])];
  const wide = people.length > 2;

  const footer = (
    <Row between gap={12}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.48, textTransform: "uppercase", color: c.muted }}>{p.slot ? "Selected" : "Pick a slot"}</Text>
        <Text numberOfLines={1} style={{ fontFamily: f.bold, fontSize: 18, lineHeight: 24, color: c.ink }}>{date ? `${dayLabel(date)}${p.slot ? ` · ${nice(p.slot.time)}` : ""}` : "No day yet"}</Text>
      </View>
      <Cta height={48} disabled={!p.slot} onPress={p.onContinue} trail={<Icon name="next" size={16} color={c.cream} stroke={2.2} />}>Continue</Cta>
    </Row>
  );

  return (
    <Shell footer={footer}>
      <Head title="Choose a time" sub={`${p.summary} · ${duration(p.mins)}`} onBack={p.onBack} />
      {p.notice ? <View style={{ marginTop: 14 }}><Note kind="bad">{p.notice}</Note></View> : null}

      {people.length > 0 ? (
        <>
          <Grp>With</Grp>
          {wide ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -pad }} contentContainerStyle={{ paddingHorizontal: pad, gap: 10 }}>
              {people.map((x) => who(x.id, x.name, x.sub, x.mark, x.tone, true))}
            </ScrollView>
          ) : <View style={{ flexDirection: "row", gap: 10 }}>{people.map((x) => who(x.id, x.name, x.sub, x.mark, x.tone, false))}</View>}
        </>
      ) : null}

      <Row between style={{ marginTop: 20 }}>
        <Grp style={{ marginTop: 0, marginBottom: 0 }}>{monthLabel(weekDays[0], weekDays[6])}</Grp>
        <Row gap={4}>
          <Round label="Previous week" disabled={week <= mondayOf(today)} onPress={() => setWeek(addDays(week, -7))}><Icon name="back" size={16} /></Round>
          <Round label="Next week" disabled={addDays(week, 7) > lastDay} onPress={() => setWeek(addDays(week, 7))}><Icon name="next" size={16} /></Round>
        </Row>
      </Row>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
        {weekDays.map((d, i) => {
          const cell = cells[i];
          const free = isOpen(cell);
          const on = d === date;
          const why = cell === undefined ? "checking" : cell === "failed" ? "not loaded" : cell.past ? "past" : cell.too_far ? "too far ahead" : free ? `${cell.open} ${cell.open === 1 ? "time" : "times"} free` : "nothing free";
          return (
            <Pressable key={d} accessibilityRole="button" accessibilityLabel={`${dayLabel(d)}, ${why}`} accessibilityState={{ selected: on, disabled: !free }} disabled={!free} onPress={() => p.onPick({ date: d, time: null })}
              style={({ pressed }) => ({ flex: 1, minHeight: 60, borderRadius: 14, paddingVertical: 10, alignItems: "center", gap: 4, backgroundColor: on ? c.ink : "transparent", opacity: free || on ? (pressed ? 0.85 : 1) : 0.35 })}>
              <Text style={{ fontFamily: f.body, fontSize: 11, color: on ? "#C9BCB0" : c.muted }}>{dowShort(d)}</Text>
              <Text style={{ fontFamily: f.semi, fontSize: 17, lineHeight: 21, color: on ? c.cream : c.ink }}>{Number(d.slice(8))}</Text>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.gold, opacity: free ? 1 : 0 }} />
            </Pressable>
          );
        })}
      </View>

      <View accessibilityLiveRegion="polite">
        {weekFailed ? (
          <View style={{ marginTop: 14 }}><Strip kind="bad" action="Try again" onAction={p.onRetry}>We could not load the calendar.</Strip></View>
        ) : !weekReady ? (
          <T muted size={13} style={{ marginTop: 14 }}>Checking the calendar…</T>
        ) : nothing && !date ? (
          <T muted size={13} style={{ marginTop: 14 }}>Nothing free in the next {maxDays} days{withWhom}.{p.pros.length > 1 && staff !== "any" ? " Choose someone else to see their times." : ""}</T>
        ) : !weekHasRoom && !weekDays.includes(date) ? (
          <T muted size={13} style={{ marginTop: 14 }}>Nothing free this week{withWhom}. {addDays(week, 7) > lastDay ? `This business takes bookings up to ${maxDays} days ahead.` : "Try the next week."}</T>
        ) : null}

        {date && !times.ready ? <T muted size={13} style={{ marginTop: 14 }}>Checking {dayLabel(date)}…</T> : null}
        {date && times.ready && times.failed ? <View style={{ marginTop: 14 }}><Strip kind="bad" action="Try again" onAction={p.onRetry}>We could not load the times.</Strip></View> : null}
        {dayIsFull ? <T size={14} weight="medium" style={{ marginTop: 16 }}>Nothing free on {dayLabel(date)}{withWhom}. Pick another day{waitlist ? ", or join the waitlist and the business can offer you a time if one opens" : ""}.</T> : null}
        {dayIsFull && waitlist ? <Cta kind="out" height={48} onPress={p.onWaitlist} style={{ marginTop: 12, alignSelf: "flex-start" }}>Join the waitlist for {dayLabel(date)}</Cta> : null}

        {am.length > 0 ? <><Grp>Morning</Grp>{slotRows(am)}</> : null}
        {pm.length > 0 ? <><Grp>Afternoon</Grp>{slotRows(pm)}</> : null}
        {varies ? <T muted size={12} style={{ marginTop: 10 }}>The price depends on the time{staff === "any" && p.pros.length > 1 ? " and who is free" : ""}.</T> : null}
      </View>

      <View style={{ marginTop: 18 }}>
        <Strip kind="gold" icon={<Icon name="clock" size={18} color={c.goldInk} />} action={waitlist ? "Join waitlist" : undefined} onAction={p.onWaitlist}>Only slots long enough for {duration(p.mins)} are shown.</Strip>
      </View>
    </Shell>
  );
}
