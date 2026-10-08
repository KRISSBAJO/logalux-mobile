// Staff & chairs: the team as a list, who is working today, requests waiting, and the way into the
// roster, time off, pay, chair rental, rooms and sign-ins. The phone's version of the web's Staff & rosters.
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Grp, Header, Item, McIcon, SmallBtn, Tag, Wait, mc, piece } from "@/components/mc-kit";
import { Face, MeIcon, OffCard, roleLine } from "@/components/me-kit";
import { AddPersonSheet, TimeOffSheet, useOffActions } from "@/components/me-sheets";
import { Btn, Card, Chip, Empty, Failed, Icon, Note, Row } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { dayLabel } from "@/lib/mb-util";
import { breaksOf, dayKey, isRenter, offOn, owed, rentDays, shiftOf, span12, stateOf, useTeam, worksOn } from "@/lib/me-staff";
import { c, f, pad } from "@/lib/theme";

type Filter = "all" | "in" | "off" | "left";
const go = (path: string) => () => router.push(path as never);

export default function Staff() {
  const q = useLocalSearchParams<{ new?: string }>();
  const insets = useSafeAreaInsets();
  const { data, error, refreshing, refresh, reload, s, today, cur, manager, owner, mine } = useTeam();
  const [filter, setFilter] = useState<Filter>("all");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [add, setAdd] = useState<"" | "person" | "renter">(q.new === "renter" ? "renter" : q.new ? "person" : "");
  const [offOpen, setOffOpen] = useState(false);
  const off = useOffActions((text, kind = "ok") => { setNote({ kind, text }); void refresh(); void s.refresh(); });

  const everyone = useMemo(() => (data?.staff ?? []) as Data[], [data]);
  const team = useMemo(() => everyone.filter((p) => !p.archived), [everyone]);
  const left = everyone.length - team.length;
  const workers = team.filter((p) => !isRenter(p));
  const working = data ? workers.filter((p) => worksOn(p, data, today)) : [];
  const asked = (data?.time_off ?? []).filter((o) => o.status === "requested" && (manager || o.staff_id === mine));
  const rentDue = (data?.rent ?? []).filter((x) => x.status === "due");

  const shown = useMemo(() => {
    if (!data) return [];
    if (filter === "in") return working;
    if (filter === "off") return workers.filter((p) => !worksOn(p, data, today));
    if (filter === "left") return everyone.filter((p) => p.archived);
    return everyone;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter, today]);

  const top = { paddingTop: insets.top + 12, paddingHorizontal: pad } as const;
  if (!data) {
    return (
      <View style={[{ flex: 1, backgroundColor: c.cream }, top]}>
        <Header title="Staff & chairs" />
        {error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </View>
    );
  }

  const me = everyone.find((p) => p.id === mine);
  /** What a person is doing today, in a line. */
  const todayLine = (p: Data) => {
    if (p.archived) return "No longer on the roster";
    if (isRenter(p)) return `${rentDays(p)} · ${money(p.rent_cents, cur)} ${p.rent_period === "monthly" ? "a month" : "a week"}`;
    const away = offOn(data.time_off, p, today, "approved");
    if (away) return `Off today${away.reason ? ` · ${away.reason}` : ""}`;
    const h = shiftOf(p, data.location_hours, dayKey(today));
    if (!h) return "Not rostered today";
    const brk = breaksOf(p, dayKey(today)).length;
    return `${span12(h)}${brk ? ` · ${plural(brk, "break")}` : ""}`;
  };

  const header = (
    <View>
      <Header title="Staff & chairs" right={manager ? <SmallBtn kind="ink" icon="plus" onPress={() => setAdd("person")}>Add</SmallBtn> : undefined} />

      {/* Today, the one thing to know at a glance */}
      <View style={{ backgroundColor: mc.night, borderRadius: 22, padding: 18, marginTop: 14 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: mc.nightMuted }}>{dayLabel(today)}</Text>
        <Row gap={10} style={{ alignItems: "flex-end", marginTop: 6 }}>
          <Text style={{ fontFamily: f.serif, fontSize: 44, lineHeight: 48, color: mc.onNight }}>{working.length}</Text>
          <Text style={{ flex: 1, fontFamily: f.body, fontSize: 14, lineHeight: 20, color: mc.nightMuted, paddingBottom: 7 }}>of {plural(workers.length, "person", "people")} working today</Text>
        </Row>
        {working.length ? (
          <Row gap={0} style={{ marginTop: 12 }}>
            {working.slice(0, 7).map((p, i) => <View key={p.id} style={{ borderWidth: 2, borderColor: mc.night, borderRadius: 20, marginLeft: i ? -8 : 0 }}><Face p={p} size={32} /></View>)}
            {working.length > 7 ? <Text style={{ fontFamily: f.semi, fontSize: 12, color: mc.nightMuted, marginLeft: 16 }}>and {working.length - 7} more</Text> : null}
          </Row>
        ) : <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: mc.nightMuted, marginTop: 8 }}>{workers.length ? "Nobody is rostered today." : "Add the people who take bookings."}</Text>}
        <Row gap={8} wrap style={{ marginTop: 14 }}>
          <SmallBtn kind="gold" onPress={go("/m/staff/roster")}>This week&apos;s roster</SmallBtn>
          {manager || mine ? <SmallBtn kind="ghost" onPress={() => setOffOpen(true)}>{manager ? "Add time off" : "Ask for time off"}</SmallBtn> : null}
        </Row>
      </View>

      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {!manager ? <View style={{ marginTop: 12 }}><Note kind="gold">You can see the team and the roster, and ask for time off. A manager or the owner changes the rest.</Note></View> : null}

      {asked.length ? (
        <>
          <Grp>{manager ? "Waiting for you" : "Your requests"} · {asked.length}</Grp>
          <View style={{ gap: 8 }}>{asked.map((o) => <OffCard key={o.id} o={o} manager={manager} mine={o.staff_id === mine} busy={off.busy === o.id} onDo={off.act} />)}</View>
        </>
      ) : null}

      {!manager && me ? (
        <>
          <Grp>You</Grp>
          <Card>
            <Item last icon={<Icon name="user" size={18} />} title="Your details and hours" sub={todayLine(me)} onPress={go(`/m/staff/${me.id}`)} />
          </Card>
        </>
      ) : null}

      <Grp>The team · {team.length}</Grp>
      {everyone.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -pad, marginBottom: 10 }} contentContainerStyle={{ gap: 8, paddingHorizontal: pad }}>
          <Chip on={filter === "all"} onPress={() => setFilter("all")}>Everyone</Chip>
          <Chip on={filter === "in"} onPress={() => setFilter("in")}>Working today · {working.length}</Chip>
          <Chip on={filter === "off"} onPress={() => setFilter("off")}>Off today · {workers.length - working.length}</Chip>
          {left ? <Chip on={filter === "left"} onPress={() => setFilter("left")}>Left · {left}</Chip> : null}
        </ScrollView>
      ) : null}
      {!everyone.length ? <Empty title="Nobody on the team yet" action={manager ? <Btn small onPress={() => setAdd("person")} style={{ marginTop: 4 }}>Add the first person</Btn> : undefined}>{manager ? "Add the people who take bookings. Each gets their own hours, services and pay." : "A manager or the owner can add the team."}</Empty>
        : !shown.length ? <Empty title={filter === "in" ? "Nobody is working today" : filter === "off" ? "Everyone is working today" : "Nobody here"}>{filter === "in" ? "People show here on the days they are rostered and not on time off." : "Choose Everyone to see the whole team."}</Empty> : null}
    </View>
  );

  const footer = (
    <View>
      <Grp>Tools</Grp>
      <Card>
        <Item icon={<MeIcon name="week" />} title="Roster" sub="Who works when this week" onPress={go("/m/staff/roster")} />
        <Item icon={<MeIcon name="sun" />} title="Time off" sub={data.time_off.length ? `${plural(data.time_off.length, "entry", "entries")} from the last two weeks onwards` : "Holidays, training and days away"} onPress={go("/m/staff/time-off")}
          right={data.time_off.some((o) => o.status === "requested") ? <Tag kind="gold">{data.time_off.filter((o) => o.status === "requested").length} waiting</Tag> : undefined} />
        {manager ? <Item icon={<MeIcon name="coins" />} title="Commission & pay" sub="What each person earned in a period" onPress={go("/m/staff/pay")} /> : null}
        {manager ? <Item icon={<MeIcon name="chair" />} title="Chair rental" sub={team.some(isRenter) ? `${plural(team.filter(isRenter).length, "renter")} · ${money(rentDue.reduce((a, x) => a + Number(x.amount_cents), 0), cur)} owed` : "Rent from people who work for themselves"} onPress={go("/m/staff/rent")}
          right={rentDue.length ? <Tag kind="wine">{rentDue.length} owing</Tag> : undefined} /> : null}
        <Item icon={<MeIcon name="door" />} title="Rooms & chairs" sub="What a service needs besides a person" onPress={go("/m/staff/rooms")} last={!manager} />
        {manager ? <Item last icon={<McIcon name="key" />} title="Sign-ins & roles" sub={`${plural(team.filter((p) => p.login_email).length, "person", "people")} can sign in`} onPress={go("/m/staff/logins")} /> : null}
      </Card>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={shown}
        keyExtractor={(p) => String(p.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ ...top, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderItem={({ item: p, index }) => {
          const [label, kind] = stateOf(p, data, today);
          const rating = Number(p.rating);
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${p.name}, ${roleLine(p)}, ${label}. ${todayLine(p)}`} onPress={go(`/m/staff/${p.id}`)}
              style={({ pressed }) => [piece(index === 0, index === shown.length - 1), { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 68, opacity: pressed ? 0.75 : p.archived ? 0.7 : 1 }]}>
              <Face p={p} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Row gap={6}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: f.semi, fontSize: 15, lineHeight: 20, color: c.ink }}>{String(p.name)}{p.id === mine ? " · you" : ""}</Text>
                  {rating > 0 ? <Row gap={2}><Icon name="star" size={12} color={c.gold} fill={c.gold} /><Text style={{ fontFamily: f.bold, fontSize: 12, color: c.ink }}>{rating.toFixed(1)}</Text></Row> : null}
                </Row>
                <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{roleLine(p)}</Text>
                <Text numberOfLines={1} style={{ fontFamily: f.medium, fontSize: 12, lineHeight: 17, color: c.ink }}>{todayLine(p)}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Tag kind={kind}>{label}</Tag>
                {!isRenter(p) && !p.archived && Number(p.week_bookings) > 0 ? <Text style={{ fontFamily: f.medium, fontSize: 11, color: c.muted }}>{plural(Number(p.week_bookings), "booking")} this week</Text> : null}
                {manager && isRenter(p) && !p.archived && owed(data.rent, p) > 0 ? <Text style={{ fontFamily: f.semi, fontSize: 11, color: c.wine }}>{money(owed(data.rent, p), cur)} owed</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />

      <AddPersonSheet open={!!add} renter={add === "renter"} onClose={() => setAdd("")} owner={owner} cur={cur}
        onAdded={(id, text) => { setAdd(""); setNote({ kind: "ok", text }); void refresh(); if (id) router.push(`/m/staff/${id}?added=1` as never); }} />
      <TimeOffSheet open={offOpen} onClose={() => setOffOpen(false)} people={workers} staffId={manager ? String(workers[0]?.id ?? "") : mine} manager={manager} today={today}
        onSaved={(text) => { setOffOpen(false); setNote({ kind: "ok", text }); void refresh(); void s.refresh(); }} />
    </View>
  );
}
