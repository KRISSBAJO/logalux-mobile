// Chair rental: the rent each renter owes, period by period. LogaLuxe records it and never collects it:
// the business takes the money, then marks the period as paid here (or waives it, or reopens it).
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AskManager, Choice, Grp, Header, Sheet, SmallBtn, Tag, Wait, mc, piece } from "@/components/mc-kit";
import { Face } from "@/components/me-kit";
import { Btn, Card, Chip, Empty, Failed, Field, Icon, Label, Note, Row, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { ask, dateOnly } from "@/lib/mc-util";
import { dateMed } from "@/lib/mb-util";
import { METHOD, RENT_STATUS, isRenter, owed, rentDays, useTeam } from "@/lib/me-staff";
import { c, f, pad } from "@/lib/theme";

type Filter = "due" | "paid" | "waived" | "all";
const DONE: Record<string, string> = { paid: "Rent marked as paid.", waive: "Rent waived for that period.", reopen: "Rent is back to owing." };

export default function Rent() {
  const insets = useSafeAreaInsets();
  const { data, error, refreshing, refresh, reload, s, tz, cur, manager } = useTeam();
  const [filter, setFilter] = useState<Filter>("all");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [one, setOne] = useState<Data | null>(null);
  const [method, setMethod] = useState("transfer"), [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(""), [sheetError, setSheetError] = useState("");

  const rent = useMemo(() => data?.rent ?? [], [data]);
  const shown = useMemo(() => rent.filter((x) => filter === "all" || x.status === filter), [rent, filter]);
  const renters = (data?.staff ?? []).filter((p) => !p.archived && isRenter(p));
  const due = rent.filter((x) => x.status === "due");
  const count = (k: string) => rent.filter((x) => x.status === k).length;

  const top = { paddingTop: insets.top + 12, paddingHorizontal: pad } as const;
  if (!data || !manager) {
    return (
      <View style={[{ flex: 1, backgroundColor: c.cream }, top]}>
        <Header title="Chair rental" />
        {data && !manager ? <AskManager what="Chair rental and what renters owe are for a manager or the owner." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </View>
    );
  }

  const open = (x: Data) => { setSheetError(""); setMethod("transfer"); setMemo(""); setOne(x); };
  const act = async (x: Data, action: "paid" | "waive" | "reopen") => {
    if (action === "waive" && !(await ask(`Waive the rent of ${x.staff}?`, "It will no longer show as owed for this period.", "Waive"))) return;
    setBusy(action); setSheetError(""); setNote(null);
    try {
      await s.mapi(`/rent/${x.id}`, { body: { action, method: action === "paid" ? method : "", note: memo.trim() } });
      setOne(null);
      setNote({ kind: "ok", text: DONE[action] });
      await refresh();
    } catch (e) {
      setSheetError((e as Error).message);
    }
    setBusy("");
  };

  const header = (
    <View>
      <Header title="Chair rental" right={<SmallBtn kind="ink" icon="plus" onPress={() => router.push("/m/staff?new=renter" as never)}>Renter</SmallBtn>} />

      <View style={{ backgroundColor: mc.night, borderRadius: 22, padding: 18, marginTop: 14 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: mc.nightMuted }}>Owed to you now</Text>
        <Text style={{ fontFamily: f.serif, fontSize: 40, lineHeight: 46, color: mc.onNight, marginTop: 4 }}>{money(due.reduce((a, x) => a + Number(x.amount_cents), 0), cur)}</Text>
        <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: mc.nightMuted, marginTop: 4 }}>
          {due.length ? `${plural(due.length, "period")} unpaid across ${plural(new Set(due.map((x) => x.staff_id)).size, "renter")}.` : renters.length ? "Every period is settled." : "Nobody rents a chair from you."} LogaLuxe records the rent and does not collect it.
        </Text>
      </View>
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}

      {renters.length ? (
        <>
          <Grp>Renters · {renters.length}</Grp>
          <Card>
            {renters.map((p, i) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.name}. Open their rental terms`} onPress={() => router.push(`/m/staff/${p.id}` as never)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 60, borderBottomWidth: i === renters.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
                <Face p={p} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{String(p.name)}{p.trading_name ? ` · ${p.trading_name}` : ""}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{money(p.rent_cents, cur)} {p.rent_period === "monthly" ? "a month" : "a week"} · {rentDays(p)}</Text>
                </View>
                {owed(rent, p) > 0 ? <Tag kind="wine">{money(owed(rent, p), cur)} owed</Tag> : <Tag kind="ok">Settled</Tag>}
                <Icon name="next" size={16} color={c.muted2} />
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      <Grp>Rent by period</Grp>
      {rent.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -pad, marginBottom: 10 }} contentContainerStyle={{ gap: 8, paddingHorizontal: pad }}>
          <Chip on={filter === "all"} onPress={() => setFilter("all")}>All · {rent.length}</Chip>
          <Chip on={filter === "due"} onPress={() => setFilter("due")}>Owing · {count("due")}</Chip>
          <Chip on={filter === "paid"} onPress={() => setFilter("paid")}>Paid · {count("paid")}</Chip>
          {count("waived") ? <Chip on={filter === "waived"} onPress={() => setFilter("waived")}>Waived · {count("waived")}</Chip> : null}
        </ScrollView>
      ) : null}
      {!rent.length ? <Empty title="No rent charges yet">{renters.length ? "The first charge opens at the start of the next period." : "Nobody rents a chair from you. To add a renter, choose Renter above."}</Empty>
        : !shown.length ? <Empty title="Nothing here">{filter === "due" ? "No period is owing." : "No period matches that choice."}</Empty> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={shown}
        keyExtractor={(x) => String(x.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ ...top, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ListFooterComponent={<T size={12} muted style={{ marginTop: 12 }}>Each week or month a rent charge is opened for every chair renter. Take the money yourself, then mark the period as paid here. The latest 60 periods are listed.</T>}
        renderItem={({ item: x, index }) => {
          const [label, kind] = RENT_STATUS[String(x.status)] ?? [String(x.status), "grey"];
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${x.staff}, ${dateOnly(x.period_start)} to ${dateOnly(x.period_end)}, ${money(x.amount_cents, cur)}, ${label}`} onPress={() => open(x)}
              style={({ pressed }) => [piece(index === 0, index === shown.length - 1), { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 64, opacity: pressed ? 0.75 : 1 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{String(x.staff)}</Text>
                <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{dateOnly(x.period_start)} to {dateOnly(x.period_end)}</Text>
                {x.status === "paid" && x.paid_at ? <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>Paid {dateMed(String(x.paid_at), tz)}{x.method ? ` · ${METHOD[String(x.method)] ?? x.method}` : ""}</Text> : x.note ? <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{String(x.note)}</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={{ fontFamily: f.bold, fontSize: 14, color: c.ink }}>{money(x.amount_cents, cur)}</Text>
                <Tag kind={kind}>{label}</Tag>
              </View>
            </Pressable>
          );
        }}
      />

      <Sheet tall={one?.status === "due"} open={!!one} onClose={() => setOne(null)} title={one ? `${one.staff} · ${money(one.amount_cents, cur)}` : ""} sub={one ? `${dateOnly(one.period_start)} to ${dateOnly(one.period_end)}${one.trading_name ? ` · ${one.trading_name}` : ""}` : undefined}
        footer={one ? (one.status === "due" ? <Btn busy={busy === "paid"} onPress={() => act(one, "paid")}>Mark as paid</Btn> : <Btn kind="out" busy={busy === "reopen"} onPress={() => act(one, "reopen")}>Reopen as owing</Btn>) : undefined}>
        {one ? (
          <>
            {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
            {one.status === "due" ? (
              <>
                <View style={{ gap: 6 }}>
                  <Label>How they paid</Label>
                  <View accessibilityRole="radiogroup" style={{ gap: 8 }}>{Object.entries(METHOD).map(([k, name]) => <Choice key={k} title={name} on={method === k} onPress={() => setMethod(k)} />)}</View>
                </View>
                <Field label="Note" value={memo} onChangeText={setMemo} maxLength={120} placeholder="Optional, for your own records" />
                <Btn kind="danger" busy={busy === "waive"} onPress={() => act(one, "waive")}>Waive this period</Btn>
                <T size={12} muted>Marking it paid only records it. No money moves through LogaLuxe.</T>
              </>
            ) : (
              <Row gap={8} style={{ alignItems: "flex-start" }}>
                <T size={14} style={{ flex: 1 }}>{one.status === "paid" ? `Marked as paid${one.paid_at ? ` on ${dateMed(String(one.paid_at), tz)}` : ""}${one.method ? ` by ${(METHOD[String(one.method)] ?? String(one.method)).toLowerCase()}` : ""}.` : "Waived: it does not show as owed."}{one.note ? ` Note: ${one.note}` : ""} Reopen it if that was a mistake.</T>
              </Row>
            )}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
