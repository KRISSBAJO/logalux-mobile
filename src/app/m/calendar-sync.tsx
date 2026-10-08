// Calendar sync for the signed-in person: their bookings shown in their own calendar, and the times
// they are busy there kept out of their bookings. The same calls as the web's card (GET /v1/m/calendar-sync).
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Grp, Header, SmallBtn, Tag, Wait, WebLink } from "@/components/mc-kit";
import { Card, Failed, Field, Note, Row, Screen, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { clock, dayShort, plural, ymd } from "@/lib/format";
import { ask, copyText, shareText, signedIn } from "@/lib/mc-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function CalendarSync() {
  const s = useSession();
  const tz = s.merchant?.timezone as string | undefined;
  const { data, error, refreshing, refresh, reload, setData } = useLoad(signedIn(s, () => s.mapi<Data>("/calendar-sync")), [s.businessToken]);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [url, setUrl] = useState("");

  const run = async (tag: string, call: () => Promise<Data>, done: string | ((out: Data) => { kind: "ok" | "bad"; text: string })) => {
    setBusy(tag); setNote(null);
    try {
      const out = await call();
      setData(out);
      setNote(typeof done === "string" ? { kind: "ok", text: done } : done(out));
      setBusy("");
      return true;
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
      setBusy("");
      return false;
    }
  };
  // The API reads the calendar at once; its note says how that went, so a read that failed is shown as a problem.
  const readNote = (out: Data) => {
    const text = String(out.cal_import_note ?? "");
    return /^Read /.test(text) ? { kind: "ok" as const, text } : { kind: "bad" as const, text: text || "Nothing was read. Check the address and try again." };
  };

  const feed = String(data?.feed_url ?? "");
  const makeFeed = async (again: boolean) => {
    if (again && !(await ask("Make a new address?", "The old one stops working at once, so you will need to add the new one to your calendar.", "Make a new one"))) return;
    await run("feed", () => s.mapi<Data>("/calendar-sync/feed", { method: "POST", body: {} }), again ? "New address made. The old one has stopped working, so add the new one to your calendar." : "The calendar address is ready. Add it to your calendar to see your bookings there.");
  };
  const feedOff = async () => {
    if (!(await ask("Turn this off?", "The address stops working and your bookings will no longer update in your calendar.", "Turn off", true))) return;
    await run("off", () => s.mapi<Data>("/calendar-sync/feed", { method: "DELETE" }), "Turned off. The address no longer works.");
  };
  const copy = async () => {
    const out = await copyText(feed);
    setNote(out === "copied" ? { kind: "ok", text: "Address copied. Paste it into your calendar." } : out === "failed" ? { kind: "bad", text: "The address could not be copied. Press and hold it to select it instead." } : null);
  };
  const saveImport = async () => {
    if (!url.trim()) { setNote({ kind: "bad", text: "Paste the private address of the calendar first." }); return; }
    // The address is a secret: once it is saved it is cleared from the field and never shown again.
    if (await run("import", () => s.mapi<Data>("/calendar-sync/import", { method: "PUT", body: { url: url.trim() } }), readNote)) setUrl("");
  };
  const stopImport = async () => {
    if (!(await ask("Stop reading this calendar?", "The busy times it added are removed, so those times can be booked again.", "Stop", true))) return;
    await run("stop", () => s.mapi<Data>("/calendar-sync/import", { method: "PUT", body: { url: "" } }), "Stopped. The busy times from that calendar have been removed.");
  };

  const readAt = data?.cal_import_at ? (ymd(new Date(data.cal_import_at), tz) === ymd(new Date(), tz) ? `today at ${clock(data.cal_import_at, tz)}` : `${dayShort(data.cal_import_at, tz)} at ${clock(data.cal_import_at, tz)}`) : "";
  const small = { fontFamily: f.body, fontSize: 12.5, lineHeight: 19, color: c.muted } as const;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen onRefresh={refresh} refreshing={refreshing}>
        <Header title="Calendar sync" />
        <T muted size={14} style={{ marginTop: 10 }}>Your LogaLuxe bookings and your own calendar, kept in step.</T>
        {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}

        {error && !data ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : !data ? <Wait /> : (
          <>
            <Grp right={<Tag kind={feed ? "ok" : "grey"}>{feed ? "On" : "Off"}</Tag>}>Show my bookings in my calendar</Grp>
            <Card style={{ padding: 16, gap: 12 }}>
              {feed ? (
                <>
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.muted }}>Private calendar address</Text>
                    <View style={{ borderWidth: 1, borderColor: c.line2, borderRadius: 14, backgroundColor: c.cream, paddingHorizontal: 12, paddingVertical: 10 }}>
                      <Text selectable accessibilityLabel="Private calendar address" style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: c.ink }}>{feed}</Text>
                    </View>
                  </View>
                  <Row gap={8} wrap>
                    <SmallBtn kind="ink" onPress={copy}>Copy</SmallBtn>
                    <SmallBtn kind="out" icon="share" onPress={() => shareText("My LogaLuxe bookings calendar", feed)}>Share</SmallBtn>
                  </Row>
                  {feed.startsWith("https://") ? null : <Note kind="gold">This address is on this computer only, so Google, Apple and Outlook cannot reach it yet. It will work once LogaLuxe is on the internet.</Note>}
                  <View style={{ gap: 2 }}>
                    <Text style={small}><Text style={{ fontFamily: f.semi, color: c.ink }}>Google Calendar:</Text> Other calendars, +, From URL.</Text>
                    <Text style={small}><Text style={{ fontFamily: f.semi, color: c.ink }}>Apple Calendar:</Text> Calendars, Add Calendar, Add Subscription Calendar.</Text>
                    <Text style={small}><Text style={{ fontFamily: f.semi, color: c.ink }}>Outlook:</Text> Add calendar, Subscribe from web.</Text>
                  </View>
                  <Text style={small}>Anyone who has this address can read the bookings in it, so keep it to yourself. If it gets out, make a new one.</Text>
                  <Text style={small}>Your calendar fetches the bookings on its own schedule. Google Calendar can take several hours to show a change.</Text>
                  <Row gap={8} wrap>
                    <SmallBtn kind="out" busy={busy === "feed"} onPress={() => makeFeed(true)}>Make a new address</SmallBtn>
                    <SmallBtn kind="danger" busy={busy === "off"} onPress={feedOff}>Turn off</SmallBtn>
                  </Row>
                </>
              ) : (
                <>
                  <Text style={small}>Get a private address to add to Google Calendar, Apple Calendar or Outlook. Your bookings then show there next to everything else.</Text>
                  <SmallBtn kind="ink" busy={busy === "feed"} onPress={() => makeFeed(false)} style={{ alignSelf: "flex-start" }}>Get my calendar address</SmallBtn>
                </>
              )}
            </Card>

            <Grp right={<Tag kind={data.cal_import_set ? "ok" : "grey"}>{data.cal_import_set ? "On" : "Off"}</Tag>}>Keep my busy times out of my bookings</Grp>
            <Card style={{ padding: 16, gap: 12 }}>
              {data.cal_import_set ? (
                <View style={{ backgroundColor: c.cream, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 4 }}>
                  <T size={13.5} weight="semi">Connected to {data.cal_import_host || "a calendar"}</T>
                  {data.cal_import_note ? <T size={13.5}>{data.cal_import_note}</T> : null}
                  <T size={13.5} muted>{readAt ? `Last read ${readAt}. ` : "Not read yet. "}{plural(Number(data.imported_blocks ?? 0), "busy time")} held from now on.</T>
                </View>
              ) : <Text style={small}>Paste the private address of your own calendar. The times you are busy there cannot be booked here. It is read at once and then every ten minutes.</Text>}
              <Field label={data.cal_import_set ? "Replace it with another address" : "Private address in iCal format"} value={url} onChangeText={setUrl} keyboardType="url" autoCapitalize="none" autoCorrect={false} spellCheck={false} maxLength={2000} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
              <SmallBtn kind="ink" busy={busy === "import"} onPress={saveImport} style={{ alignSelf: "flex-start" }}>Save</SmallBtn>
              <Text style={small}>In Google Calendar: Settings, choose the calendar, then copy &quot;Secret address in iCal format&quot;.</Text>
              <Text style={small}>Only the times are kept, never what the events are. The saved address is not shown again here.</Text>
              {data.cal_import_set ? (
                <Row gap={8} wrap>
                  <SmallBtn kind="out" busy={busy === "run"} onPress={() => run("run", () => s.mapi<Data>("/calendar-sync/import/run", { method: "POST", body: {} }), readNote)}>Read it again now</SmallBtn>
                  <SmallBtn kind="danger" busy={busy === "stop"} onPress={stopImport}>Stop and remove these busy times</SmallBtn>
                </Row>
              ) : null}
            </Card>
            {s.merchant?.role !== "staff" ? <WebLink path="/business/settings?tab=account#calendar-sync">Setting this up for someone else on the team opens on the web</WebLink> : null}
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
