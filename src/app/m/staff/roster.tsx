// The roster: who works when in a week. On a phone it is read a day at a time (pick the day on the strip),
// with the whole week as a small grid underneath. A manager taps a person to change their week.
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { WeekStrip } from "@/components/ma-kit";
import { Grp, Header, Tag, Wait } from "@/components/mc-kit";
import { Face } from "@/components/me-kit";
import { Card, Empty, Failed, Icon, Row, Screen, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { plural } from "@/lib/format";
import { DAY_LONG, clock12 } from "@/lib/mc-util";
import { addDays, dayFull, mondayOf, weekTitle } from "@/lib/mb-util";
import { DAYS, breaksOf, dayKey, dur, isRenter, offOn, pattern, rentDays, rostered, shiftOf, span12, useTeam, weekDays, worksOn, type Team } from "@/lib/me-staff";
import { c, f } from "@/lib/theme";

type Cell = { kind: "work" | "leave" | "asked" | "off" | "rent" | "free"; title: string; sub: string; mark: string };

/** What one person is doing on one day of the week. */
function cellOf(p: Data, team: Team, day: string): Cell {
  const d = dayKey(day), h = shiftOf(p, team.location_hours, d);
  if (isRenter(p)) {
    const rented = ((p.rent_days ?? []) as string[]).includes(d);
    return rented ? { kind: "rent", title: "Rented", sub: String(p.trading_name || "chair rental"), mark: "R" } : { kind: "free", title: h ? "Chair free" : "Off", sub: h ? "not rented that day" : "", mark: "" };
  }
  const away = offOn(team.time_off, p, day, "approved"), ask = offOn(team.time_off, p, day, "requested");
  if (away) return { kind: "leave", title: "Off", sub: String(away.reason || "time off"), mark: "×" };
  if (!h) return { kind: "off", title: "Off", sub: ask ? "time off requested" : "", mark: "" };
  const brk = breaksOf(p, d);
  return { kind: ask ? "asked" : "work", title: span12(h), sub: ask ? "time off requested" : brk.length ? `break ${brk.map((b) => clock12(b[0])).join(", ")}` : p.hours ? "own hours" : "", mark: String(Number(h[0].slice(0, 2)) % 12 || 12) };
}
const CELL: Record<Cell["kind"], [string, string, string]> = {
  work: [c.ink, c.cream, c.ink], asked: [c.goldBg, c.goldInk, c.gold], leave: [c.wineBg, c.wine, c.wineBg], rent: [c.goldBg, c.goldInk, c.goldBg], off: ["transparent", c.muted2, c.line2], free: ["transparent", c.muted2, c.line2],
};

export default function Roster() {
  const [week, setWeek] = useState<string | undefined>(undefined);
  const { data, error, loading, refreshing, refresh, reload, today, monday: thisMonday, manager } = useTeam(week);
  const [day, setDay] = useState(today);

  if (!data) {
    return (
      <Screen>
        <Header title="Roster" />
        {error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const monday = String(data.week), days = weekDays(monday);
  const picked = days.includes(day) ? day : days[0];
  const team = data.staff.filter((p) => !p.archived);
  const workers = team.filter((p) => !isRenter(p));
  const closed = new Set(days.filter((d) => !Array.isArray(data.location_hours?.[dayKey(d)])));
  const working = workers.filter((p) => worksOn(p, data, picked));
  const move = (n: number) => { const next = addDays(monday, n * 7); setWeek(next); setDay(next === thisMonday ? today : addDays(next, days.indexOf(picked))); };
  const open = (p: Data) => router.push(`/m/staff/${p.id}${manager && !isRenter(p) ? "?open=hours" : ""}` as never);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Roster" />

      <View style={{ backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, paddingTop: 6, paddingBottom: 4, paddingHorizontal: 6, marginTop: 14, opacity: loading ? 0.6 : 1 }}>
        <Row between style={{ paddingHorizontal: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Week before" onPress={() => move(-1)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="back" size={18} /></Pressable>
          <T weight="semi" size={14}>{monday === thisMonday ? "This week · " : ""}{weekTitle(monday)}</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Week after" onPress={() => move(1)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="next" size={18} /></Pressable>
        </Row>
        <WeekStrip days={days} value={picked} onPick={setDay} off={closed} dots={new Set(days.filter((d) => workers.some((p) => offOn(data.time_off, p, d, "approved"))))} />
      </View>
      {monday !== thisMonday ? (
        <Pressable accessibilityRole="button" onPress={() => { setWeek(undefined); setDay(today); }} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>Back to this week</Text>
        </Pressable>
      ) : null}

      {!team.length ? <View style={{ marginTop: 16 }}><Empty title="Nobody on the roster yet">{manager ? "Add the team under Staff & chairs and their weeks show here." : "A manager or the owner can add the team."}</Empty></View> : (
        <>
          <Grp right={<Text style={{ fontFamily: f.semi, fontSize: 12, color: c.ink }}>{working.length} of {workers.length} working</Text>}>{dayFull(picked)}{picked === today ? " · today" : ""}</Grp>
          {closed.has(picked) ? <T size={12} muted style={{ marginBottom: 8 }}>The location is closed on {DAY_LONG[dayKey(picked)]}s. People with a week of their own may still work.</T> : null}
          <Card>
            {team.map((p, i) => {
              const cell = cellOf(p, data, picked);
              const on = cell.kind === "work" || cell.kind === "asked";
              return (
                <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.name}, ${DAY_LONG[dayKey(picked)]}: ${cell.title}${cell.sub ? `, ${cell.sub}` : ""}. ${manager ? (isRenter(p) ? "Open the rental" : "Change their hours") : "Open"}`} onPress={() => open(p)}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 14, minHeight: 60, borderBottomWidth: i === team.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ opacity: on || cell.kind === "rent" ? 1 : 0.45 }}><Face p={p} size={36} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{String(p.name)}</Text>
                    <Text numberOfLines={1} style={{ fontFamily: on ? f.medium : f.body, fontSize: 13, lineHeight: 18, color: on ? c.ink : c.muted }}>{cell.title}{cell.sub ? ` · ${cell.sub}` : ""}</Text>
                  </View>
                  {cell.kind === "leave" ? <Tag kind="wine">Time off</Tag> : cell.kind === "asked" ? <Tag kind="gold">Asked off</Tag> : cell.kind === "rent" ? <Tag kind="gold">Rented</Tag> : on ? <Tag kind="ok">Working</Tag> : <Tag>Off</Tag>}
                </Pressable>
              );
            })}
          </Card>

          <Grp>The whole week</Grp>
          <Card style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 6 }}>
              <View style={{ flex: 1 }} />
              {days.map((d) => (
                <Pressable key={d} accessibilityRole="button" accessibilityLabel={`Show ${dayFull(d)}`} onPress={() => setDay(d)} hitSlop={{ top: 8, bottom: 8 }} style={{ width: 30, alignItems: "center" }}>
                  <Text style={{ fontFamily: d === picked ? f.bold : f.medium, fontSize: 11, color: d === picked ? c.ink : c.muted2 }}>{DAY_LONG[dayKey(d)].slice(0, 2)}</Text>
                  <Text style={{ fontFamily: d === picked ? f.bold : f.medium, fontSize: 11, color: d === today ? c.wine : d === picked ? c.ink : c.muted2 }}>{Number(d.slice(8))}</Text>
                </Pressable>
              ))}
            </View>
            {team.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.name}: ${isRenter(p) ? `rents ${rentDays(p)}` : `${dur(rostered(p, data, monday))}, ${pattern(p, data.location_hours)}`}`} onPress={() => open(p)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 3, minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 13, lineHeight: 17, color: c.ink }}>{String(p.name)}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 11, lineHeight: 15, color: c.muted }}>{isRenter(p) ? "Rental" : dur(rostered(p, data, monday))}</Text>
                </View>
                {days.map((d) => {
                  const cell = cellOf(p, data, d), [bg, fg, line] = CELL[cell.kind];
                  return (
                    <View key={d} style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: bg, borderWidth: 1, borderColor: d === picked && (cell.kind === "off" || cell.kind === "free") ? c.muted2 : line, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: f.semi, fontSize: 11, color: fg }}>{cell.mark}</Text>
                    </View>
                  );
                })}
              </Pressable>
            ))}
            <Row gap={12} wrap style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line }}>
              {([["work", "Working, from that hour"], ["leave", "Time off"], ["asked", "Asked off"], ["rent", "Chair rented"], ["off", "Off"]] as [Cell["kind"], string][])
                .filter(([k]) => k === "work" || k === "off" || team.some((p) => days.some((d) => cellOf(p, data, d).kind === k)))
                .map(([k, name]) => (
                  <Row key={k} gap={6}>
                    <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: CELL[k][0], borderWidth: 1, borderColor: CELL[k][2] }} />
                    <Text style={{ fontFamily: f.body, fontSize: 11, color: c.muted }}>{name}</Text>
                  </Row>
                ))}
            </Row>
          </Card>

          <T size={12} muted style={{ marginTop: 10 }}>
            {manager ? "Tap a person to change their week. " : ""}Hours and breaks repeat every week until they are changed. People without their own hours follow the location hours. Approved time off shows as off. A rented chair shows the renter&apos;s days: they run their own bookings.
          </T>
          <T size={12} muted style={{ marginTop: 6 }}>{plural(workers.length, "person", "people")} on the roster{team.length > workers.length ? ` and ${plural(team.length - workers.length, "chair renter")}` : ""} · week of {weekTitle(mondayOf(monday))}.</T>
        </>
      )}
    </Screen>
  );
}
