// The waitlist: clients who asked for a day that was full (the web keeps it in a panel on the Calendar).
// GET /v1/m/waitlist lists who is waiting or has been offered a slot; PUT /v1/m/waitlist/{id} moves one on.
// Everyone on the team can use it. Booking one opens the new-booking screen with their name, phone and day.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { MaIcon } from "@/components/ma-kit";
import { Header, Sheet, SmallBtn, Tag, Wait, mc } from "@/components/mc-kit";
import { ListPage, Night, NightLabel } from "@/components/mi-kit";
import { Btn, Card, Chip, Empty, Failed, Note, Row, Screen, T } from "@/components/ui";
import { qs, type Row as Data } from "@/lib/api";
import { plural } from "@/lib/format";
import { tel, todayIn } from "@/lib/ma-format";
import { relDay } from "@/lib/mb-util";
import { ask, dateOnly, signedIn } from "@/lib/mc-util";
import { day10, type Flash } from "@/lib/mi-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const SAID: Record<string, string> = { offered: "Marked as offered.", booked: "Marked as booked, and taken off the list.", removed: "Removed from the waitlist.", waiting: "Back to waiting." };

export default function Waitlist() {
  const s = useSession();
  const tz = s.merchant?.timezone as string | undefined;
  const today = todayIn(tz);
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, async () => ((await s.mapi<Data>("/waitlist")).waitlist ?? []) as Data[]), [s.businessToken]);
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!s.businessToken) return;
    if (seen.current) void refresh();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));

  const [filter, setFilter] = useState<"" | "waiting" | "offered">("");
  const [note, setNote] = useState<Flash>(null);
  const [busy, setBusy] = useState("");
  const [entry, setEntry] = useState<Data | null>(null), [entryError, setEntryError] = useState("");

  if (!data) {
    return (
      <Screen>
        <Header title="Waitlist" />
        {error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const waiting = data.filter((w) => w.status === "waiting").length, offered = data.filter((w) => w.status === "offered").length;
  const shown = filter ? data.filter((w) => w.status === filter) : data;
  const wants = (w: Data) => {
    const day = day10(w.day), time = String(w.time_of_day ?? "").trim();
    const t = !time || /^any/i.test(time) ? "any time" : time.toLowerCase();
    return `${day ? dateOnly(day) : "any day"} · ${t}`;
  };
  const passed = (w: Data) => !!w.day && day10(w.day) < today;

  const update = async (w: Data, status: "offered" | "booked" | "removed" | "waiting") => {
    if (status === "removed" && !(await ask(`Remove ${w.client_name || "this person"}?`, "They come off the waitlist. They are not told.", "Remove", true))) return;
    setBusy(status + w.id); setEntryError(""); setNote(null);
    try {
      await s.mapi(`/waitlist/${w.id}`, { method: "PUT", body: { status } });
      setEntry(null);
      await refresh();
      setNote({ kind: "ok", text: SAID[status] });
    } catch (e) {
      if (entry) setEntryError((e as Error).message); else setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  const book = (w: Data) => {
    setEntry(null);
    const day = day10(w.day);
    router.push(("/m/new-booking" + qs({ date: day && day >= today ? day : undefined, name: w.client_name, phone: w.client_phone })) as never);
  };
  const call = (w: Data) => { void Linking.openURL(tel(String(w.client_phone))).catch(() => setNote({ kind: "bad", text: "This device cannot make a call. Their number is on the card." })); };

  const header = (
    <View>
      <Header title="Waitlist" />
      <Night style={{ marginTop: 16 }}>
        <NightLabel>Hoping for a slot</NightLabel>
        <Text style={{ fontFamily: f.serif, fontSize: 44, lineHeight: 50, color: mc.onNight, marginTop: 2 }}>{waiting}</Text>
        <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: mc.nightMuted, marginTop: 4 }}>
          {data.length ? `${plural(waiting, "person", "people")} waiting${offered ? `, and ${offered} already offered a time` : ""}. When a slot opens, book the first person it suits.` : "Nobody is waiting. Clients who ask for a full day show up here."}
        </Text>
      </Night>
      {data.length ? (
        <Row gap={8} wrap style={{ marginTop: 14 }}>
          <Chip on={!filter} onPress={() => setFilter("")}>{`All · ${data.length}`}</Chip>
          <Chip on={filter === "waiting"} onPress={() => setFilter("waiting")}>{`Waiting · ${waiting}`}</Chip>
          <Chip on={filter === "offered"} onPress={() => setFilter("offered")}>{`Offered · ${offered}`}</Chip>
        </Row>
      ) : null}
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      <View style={{ height: 14 }} />
    </View>
  );

  return (
    <>
      <ListPage<Data> data={shown} keyOf={(w) => String(w.id)} gap={10} header={header} onRefresh={refresh} refreshing={refreshing}
        empty={data.length ? <Empty title={filter === "offered" ? "Nobody has been offered a time" : "Nobody is waiting"}>Choose All to see everyone on the list.</Empty>
          : <Empty title="Nobody is waiting">When a day is full, clients can ask to be told if a slot opens. They show up here, oldest first.</Empty>}
        render={(w) => (
          <Card style={{ padding: 14, gap: 8, borderRadius: 18 }}>
            <Row between style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: f.semi, fontSize: 15, lineHeight: 21, color: c.ink }}>{w.client_name || "No name given"}</Text>
                <Text selectable style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.muted }}>{w.client_phone}</Text>
              </View>
              <Tag kind={w.status === "offered" ? "gold" : "ok"}>{w.status === "offered" ? "Offered" : "Waiting"}</Tag>
            </Row>
            <View style={{ gap: 2 }}>
              <T size={14} weight="medium">{`Wants ${wants(w)}`}</T>
              {w.service ? <T size={13} muted>{String(w.service)}</T> : null}
              <T size={12} muted>{`Asked ${relDay(String(w.created_at), tz).replace(/^Today$/, "today").replace(/^Yesterday$/, "yesterday")}${passed(w) ? " · that day has passed" : ""}`}</T>
            </View>
            <Row gap={8} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10 }}>
              <SmallBtn kind="ink" onPress={() => book(w)}>Book</SmallBtn>
              <SmallBtn onPress={() => call(w)}>Call</SmallBtn>
              {w.status === "waiting" ? <SmallBtn busy={busy === "offered" + w.id} onPress={() => update(w, "offered")}>Mark offered</SmallBtn> : null}
              <View style={{ flex: 1 }} />
              <Pressable accessibilityRole="button" accessibilityLabel={`More for ${w.client_name || "this person"}`} onPress={() => { setEntryError(""); setEntry(w); }} hitSlop={4}
                style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
                <MaIcon name="dots" size={18} />
              </Pressable>
            </Row>
          </Card>
        )} />

      <Sheet open={!!entry} onClose={() => setEntry(null)} title={String(entry?.client_name || "On the waitlist")} sub={entry ? `Wants ${wants(entry)}` : undefined}>
        {entry ? (
          <>
            {entryError ? <Note kind="bad">{entryError}</Note> : null}
            <Btn onPress={() => book(entry)}>Book them in</Btn>
            {entry.status === "waiting"
              ? <Btn kind="out" busy={busy === "offered" + entry.id} onPress={() => update(entry, "offered")}>Mark as offered a time</Btn>
              : <Btn kind="out" busy={busy === "waiting" + entry.id} onPress={() => update(entry, "waiting")}>Put back to waiting</Btn>}
            <Btn kind="out" busy={busy === "booked" + entry.id} onPress={() => update(entry, "booked")}>Mark as booked</Btn>
            <Btn kind="danger" busy={busy === "removed" + entry.id} onPress={() => update(entry, "removed")}>Remove from the waitlist</Btn>
            <T size={12} muted>Marking someone as booked or removing them takes them off this list. Neither sends them a message.</T>
          </>
        ) : null}
      </Sheet>
    </>
  );
}
