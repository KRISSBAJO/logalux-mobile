// Automatic messages: the seven messages a business sends by itself, each with a switch and its wording.
// Read from GET /v1/m/marketing; a change is PUT /v1/m/automations/{key}.
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Grp, McIcon, Sheet, Sw, Tag, mc } from "@/components/mc-kit";
import { KV, MessageBox, NotReady, Page, Tip, Toast, type Said } from "@/components/mg-kit";
import { Btn, Card, Icon, Note, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { useGrow } from "@/lib/mg-load";
import { BOOKING_KEYS, sampleFor, sentStat, tokensFor } from "@/lib/mg-util";
import { channelsNote, modesOf } from "@/lib/mp-features";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

const ICON: Record<string, ReactNode> = {
  confirmation: <Icon name="send" size={18} />, reminder_24h: <Icon name="clock" size={18} />, reminder_2h: <Icon name="clock" size={18} />,
  review_request: <Icon name="star" size={18} />, rebook: <Icon name="repeat" size={18} />, win_back: <Icon name="heart" size={18} />, birthday: <McIcon name="gift" />,
};
const MAX = 600;

export default function Automations() {
  const s = useSession();
  const m = s.merchant;
  const { d, denied, error, reload, refresh, refreshing, setData } = useGrow(s, () => s.mapi<Data>("/marketing"));
  const [note, setNote] = useState<Said>(null);
  const [busyKey, setBusyKey] = useState("");
  const [open, setOpen] = useState<{ key: string; message: string; enabled: boolean } | null>(null);
  const [saving, setSaving] = useState(false), [formError, setFormError] = useState("");

  if (!d) return <NotReady title="Automatic messages" denied={denied} error={error} reload={reload} what="The messages the business sends by itself are set by a manager or the owner." />;

  const autos = (d.automations ?? []) as Data[];
  const modes = (d.modes ?? {}) as Record<string, string>, capN = Number(d.cap ?? 0);
  const emailLive = modes.email !== "log", waLive = modesOf(modes).whatsapp === "live";
  const link = String(d.booking_link ?? "");
  const patch = (key: string, change: Data) => setData((x) => (x && typeof x === "object" ? { ...x, automations: ((x as Data).automations as Data[]).map((a) => (a.key === key ? { ...a, ...change } : a)) } : x));

  const toggle = async (a: Data) => {
    const now = !a.enabled;
    setBusyKey(a.key); setNote(null); patch(a.key, { enabled: now });
    try {
      await s.mapi(`/automations/${a.key}`, { method: "PUT", body: { enabled: now } });
      setNote({ kind: "ok", text: `${a.name}: ${now ? "turned on." : "turned off."}` });
    } catch (e) {
      patch(a.key, { enabled: a.enabled }); setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusyKey("");
  };

  const sel = open ? autos.find((a) => a.key === open.key) : undefined;
  const save = async () => {
    if (!open || !sel) return;
    const msg = open.message.trim();
    if (msg.length < 10) { setFormError("The message must be at least 10 characters."); return; }
    setSaving(true); setFormError("");
    try {
      await s.mapi(`/automations/${open.key}`, { method: "PUT", body: { enabled: open.enabled, message: msg } });
      patch(open.key, { enabled: open.enabled, message: msg });
      setNote({ kind: "ok", text: `${sel.name}: saved.` });
      setOpen(null);
    } catch (e) { setFormError((e as Error).message); }
    setSaving(false);
  };

  const groups: [string, Data[]][] = [["About a booking", autos.filter((a) => !a.marketing)], ["Marketing · counts toward the cap", autos.filter((a) => a.marketing)]];
  const booking = sel ? BOOKING_KEYS.has(sel.key) : false;

  return (
    <Page title="Automatic messages" onRefresh={refresh} refreshing={refreshing} over={<Toast note={note} onDone={() => setNote(null)} />}>
      <View style={{ marginTop: 14, gap: 10 }}>
        {channelsNote(modesOf(modes)) ? <Note kind="gold">{channelsNote(modesOf(modes))}</Note> : null}
        {m?.status !== "live" ? <Note kind="gold">Automatic messages only run for a live business. Yours is {m?.status === "paused" ? "paused" : "not live yet"}, so nothing goes out for now. You can still set the wording.</Note> : null}
      </View>

      {groups.map(([title, list]) => list.length ? (
        <View key={title}>
          <Grp>{title}</Grp>
          <Card>
            {list.map((a, i) => (
              <View key={a.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingLeft: 16, paddingRight: 16, minHeight: 64, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${a.name}. ${a.when}. ${sentStat(Number(a.sent_30d), Number(a.delivered_30d))}. Change the wording`} onPress={() => { setFormError(""); setOpen({ key: a.key, message: String(a.message ?? ""), enabled: !!a.enabled }); }}
                  style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: mc.tile, alignItems: "center", justifyContent: "center" }}>{ICON[a.key] ?? ICON.confirmation}</View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{a.name}</Text>
                    <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{a.when}</Text>
                    <Text style={{ fontFamily: f.medium, fontSize: 12, lineHeight: 17, color: Number(a.sent_30d) ? c.ink : c.muted2 }}>{sentStat(Number(a.sent_30d), Number(a.delivered_30d))}</Text>
                  </View>
                </Pressable>
                <Sw on={!!a.enabled} disabled={busyKey === a.key} label={`${a.name}: ${a.enabled ? "on, turn off" : "off, turn on"}`} onPress={() => toggle(a)} />
              </View>
            ))}
          </Card>
        </View>
      ) : null)}
      <T size={12} muted style={{ marginTop: 10 }}>Press a message to read or change its wording. A client gets at most {capN} marketing messages in 30 days; confirmations, reminders and review requests do not count, and clients who opted out of marketing never get the marketing ones.</T>

      <Sheet tall open={!!open && !!sel} onClose={() => setOpen(null)} title={sel?.name ?? ""} sub={sel ? String(sel.when) : undefined}
        footer={<Btn busy={saving} onPress={save}>Save</Btn>}>
        {open && sel ? (
          <>
            {formError ? <Note kind="bad">{formError}</Note> : null}
            <Card style={{ paddingHorizontal: 16 }}>
              <Row style={{ paddingVertical: 13, minHeight: 56 }}>
                <View style={{ flex: 1 }}>
                  <T size={14} weight="semi">Send this automatically</T>
                  <T size={12} muted>{open.enabled ? "On" : "Off"}{open.enabled !== !!sel.enabled ? " once you save" : " now"}</T>
                </View>
                <Sw on={open.enabled} label="Send this automatically" onPress={() => setOpen({ ...open, enabled: !open.enabled })} />
              </Row>
            </Card>
            <MessageBox value={open.message} onChange={(message) => setOpen({ ...open, message })} max={MAX} tokens={tokensFor(booking)} sample={sampleFor(m, link, booking)} previewLabel="Preview · sample values" />
            <Card style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
              <KV k="Trigger" v={String(sel.when)} />
              <KV k="Sent on" last v={<Row gap={6} wrap style={{ justifyContent: "flex-end" }}><Tag kind={emailLive ? "ok" : "grey"}>{`Email${emailLive ? "" : " · logged only"}`}</Tag><Tag kind={waLive ? "ok" : "grey"}>{`WhatsApp${waLive ? "" : " · logged only"}`}</Tag></Row>} />
            </Card>
            <T size={12} muted>You do not choose the channel here. A client with an email address gets an email; a client with only a phone number gets WhatsApp{waLive ? "." : ", which is not connected yet."}</T>
            <Tip>
              Last 30 days: {sentStat(Number(sel.sent_30d), Number(sel.delivered_30d)).toLowerCase()}. {sel.marketing
                ? `This is a marketing message. It counts toward the cap of ${capN} per client in 30 days, and clients who opted out do not get it.`
                : `This is not a marketing message, so it does not count toward the cap of ${capN} per client.`}
            </Tip>
          </>
        ) : null}
      </Sheet>
    </Page>
  );
}
