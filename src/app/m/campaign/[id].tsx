// One campaign. A draft is tested (an email to the person signed in) and then sent by a person pressing send;
// a sent one shows what came of it. Read from GET /v1/m/marketing; the API has no call for a single campaign.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Tag } from "@/components/mc-kit";
import { LinkText } from "@/components/ma-kit";
import { B, KV, Night, NightBig, NightLabel, NightStat, NightText, NotReady, Page, Preview, Steps, Tip } from "@/components/mg-kit";
import { Btn, Card, Empty, Note, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { dateMed } from "@/lib/mb-util";
import { ask } from "@/lib/mc-util";
import { useGrow } from "@/lib/mg-load";
import { AUDIENCE_LABEL, CHANNEL_LABEL, NO_SIZE, campaignTag, fill, n, sampleFor, type Size } from "@/lib/mg-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

export default function Campaign() {
  const s = useSession();
  const m = s.merchant;
  const cur = (m?.currency as string) ?? "USD", tz = m?.timezone as string | undefined;
  const params = useLocalSearchParams<{ id: string; saved?: string; old?: string }>();
  const id = String(params.id);

  const savedNote = typeof params.saved === "string"
    ? `Draft saved. ${Number(params.saved)} ${Number(params.saved) === 1 ? "client is" : "clients are"} in this audience. Nothing has been sent yet.${params.old ? " The earlier draft could not be removed: delete it from the list." : ""}`
    : "";
  const [note, setNote] = useState<{ kind: "ok" | "bad" | "gold"; text: string } | null>(savedNote ? { kind: "ok", text: savedNote } : null);
  const [busy, setBusy] = useState(""), [started, setStarted] = useState(false);

  const { d, denied, error, reload, refresh, refreshing } = useGrow(s, () => s.mapi<Data>("/marketing"));
  const camp = d ? ((d.campaigns ?? []) as Data[]).find((x) => x.id === id) : undefined;

  // While it is going out, look again every few seconds so the numbers fill in by themselves.
  const sending = camp?.status === "sending";
  useEffect(() => {
    if (!sending) return;
    const t = setInterval(() => { void refresh(); }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending]);

  if (!d) return <NotReady title="Campaign" denied={denied} error={error} reload={reload} what="Campaigns are written and sent by a manager or the owner." />;
  if (!camp) {
    return (
      <Page title="Campaign" onRefresh={refresh} refreshing={refreshing}>
        <View style={{ marginTop: 16 }}>
          <Empty title="This campaign is not here" action={<Btn small kind="out" onPress={() => router.replace("/m/campaigns" as never)} style={{ marginTop: 4 }}>All campaigns</Btn>}>It may have been deleted, or it is older than the 30 newest campaigns that are listed.</Empty>
        </View>
      </Page>
    );
  }

  const modes = (d.modes ?? {}) as Record<string, string>, capN = Number(d.cap ?? 0);
  const audiences = (d.audiences ?? {}) as Record<string, Size>;
  const size = audiences[camp.audience] ?? NO_SIZE;
  const reach = camp.channel === "email" ? size.email : size.phone;
  const chName = CHANNEL_LABEL[camp.channel] ?? String(camp.channel);
  const logged = modes[camp.channel] === "log", emailLive = modes.email !== "log";
  const tag = campaignTag(String(camp.status));
  const draft = camp.status === "draft";
  const text = fill(String(camp.message ?? ""), sampleFor(m, String(d.booking_link ?? ""), false));

  const test = async () => {
    setBusy("test"); setNote(null);
    try {
      const out = await s.mapi<Data>(`/campaigns/${id}/test`, { method: "POST" });
      setNote(out.status === "sent" ? { kind: "ok", text: `Test sent to ${out.to}.` } : { kind: "gold", text: `Test recorded for ${out.to}, but not delivered: email is not connected, so it was only logged.` });
    } catch (e) { setNote({ kind: "bad", text: (e as Error).message }); }
    setBusy("");
  };

  const send = async () => {
    if (!(await ask(`Send "${camp.name}"?`, `It goes to the ${plural(reach, "client")} who can be reached. ${logged ? "The messages will be logged, not delivered. " : ""}This cannot be undone.`, logged ? "Log it" : "Send"))) return;
    setBusy("send"); setNote(null);
    try {
      await s.mapi(`/campaigns/${id}/send`, { method: "POST" });
      setStarted(true);
      await refresh();
    } catch (e) { setNote({ kind: "bad", text: (e as Error).message }); }
    setBusy("");
  };

  const remove = async () => {
    if (!(await ask("Delete this draft?", `"${camp.name}" has not been sent. Deleting it cannot be undone.`, "Delete", true))) return;
    setBusy("delete"); setNote(null);
    try {
      await s.mapi(`/campaigns/${id}`, { method: "DELETE" });
      router.replace("/m/campaigns" as never);
    } catch (e) { setNote({ kind: "bad", text: (e as Error).message }); setBusy(""); }
  };

  const footer = draft ? (
    <View style={{ gap: 8 }}>
      <Row gap={8}>
        <Btn kind="out" busy={busy === "test"} disabled={!!busy} onPress={test} style={{ flex: 1 }}>Send test to me</Btn>
        <Btn kind="gold" busy={busy === "send"} disabled={!!busy || reach === 0} onPress={send} style={{ flex: 1.2 }}>{logged ? `Log for ${plural(reach, "client")}` : `Send to ${plural(reach, "client")}`}</Btn>
      </Row>
      <T size={12} muted center>{reach === 0 ? `Nobody in this audience can be reached on ${chName}, so there is nothing to send.` : `The test goes by email to ${m?.email}, whatever the channel.${emailLive ? "" : " Email is not connected yet, so the test is logged, not delivered."}`}</T>
    </View>
  ) : undefined;

  const delivered = Number(camp.delivered ?? 0), loggedN = Number(camp.logged ?? 0), booked = Number(camp.booked ?? 0);

  return (
    <Page title="Campaign" onRefresh={refresh} refreshing={refreshing} footer={footer} onBack={() => (router.canGoBack() ? router.back() : router.replace("/m/campaigns" as never))}>
      {draft ? <Steps steps={["Who", "Message", "Test and send"]} at={2} /> : null}
      {note ? <View style={{ marginTop: 14 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {started && camp.status === "sent" ? <View style={{ marginTop: 14 }}><Note>Sending has finished. The numbers are below.</Note></View> : null}

      <Row between gap={10} style={{ marginTop: 16, alignItems: "flex-start" }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: f.serifBold, fontSize: 24, lineHeight: 28, color: c.ink }}>{camp.name}</Text>
        <Tag kind={tag.kind}>{tag.text}</Tag>
      </Row>

      {camp.status === "sent" ? (
        <Night style={{ marginTop: 14 }}>
          <NightLabel>{loggedN > 0 && delivered === 0 ? "Logged, not delivered" : "Delivered"}</NightLabel>
          <NightBig>{n(loggedN > 0 && delivered === 0 ? loggedN : delivered)}<Text style={{ fontSize: 18, color: "#C9BCB0" }}> of {n(camp.recipients)} in the audience</Text></NightBig>
          <Row gap={10} style={{ marginTop: 14, alignItems: "flex-start" }}>
            <NightStat label="Booked within 14 days" value={n(booked)} sub={booked ? "clients who got it and then booked" : "none so far"} />
            <NightStat label="Value of those bookings" value={money(camp.booked_cents, cur)} />
          </Row>
          {loggedN > 0 ? <NightText style={{ marginTop: 12 }}>Logged messages were recorded but did not reach anyone, because {chName} is not connected.</NightText> : null}
        </Night>
      ) : null}

      {sending ? (
        <View style={{ marginTop: 14 }}><Note kind="gold">Sending has started. It carries on in the background, and this page looks again every few seconds. The numbers appear when it has finished.</Note></View>
      ) : null}

      <Card style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 2 }}>
        <KV k="Goes to" v={AUDIENCE_LABEL[camp.audience] ?? String(camp.audience)} />
        <KV k="Channel" v={`${chName}${logged ? " · logged only" : ""}`} />
        {camp.subject ? <KV k="Subject" v={String(camp.subject)} /> : null}
        <KV k="Written by" v={String(camp.created_by ?? "")} />
        <KV k="Created" v={dateMed(String(camp.created_at), tz)} last={!camp.sent_at} />
        {camp.sent_at ? <KV k="Sent" v={dateMed(String(camp.sent_at), tz)} last /> : null}
      </Card>

      <View style={{ marginTop: 12 }}>
        <Preview label={`Preview · ${chName} · sample values`} subject={camp.channel === "email" ? String(camp.subject ?? "") : undefined} text={text} />
      </View>

      {draft ? (
        <>
          <Tip style={{ marginTop: 12 }}>
            <B>{plural(size.total, "client")} in this audience right now.</B> {n(reach)} can be reached on {chName}. Anyone who already had {capN} marketing messages in 30 days is skipped.{logged ? <B> {chName} is not connected yet, so these messages will be logged, not delivered.</B> : null}
          </Tip>
          <T size={12} muted style={{ marginTop: 10 }}>A draft cannot be edited. To change the wording, a new draft takes its place.</T>
          <Row gap={16} style={{ marginTop: 2 }}>
            <LinkText onPress={() => router.push(`/m/campaign-new?from=${id}` as never)}>Change the wording</LinkText>
            <LinkText color={c.bad} onPress={remove}>{busy === "delete" ? "Deleting" : "Delete draft"}</LinkText>
          </Row>
        </>
      ) : null}

      {camp.status === "sent" ? (
        <>
          <Card style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 2 }}>
            <KV k="Clients in the audience" v={n(camp.recipients)} />
            <KV k="Delivered" v={n(delivered)} />
            <KV k="Logged, not delivered" v={n(loggedN)} />
            <KV k="Skipped" v={n(camp.skipped)} />
            <KV k="Failed" v={n(camp.failed)} last />
          </Card>
          <T size={12} muted style={{ marginTop: 8 }}>Skipped means the client had no {camp.channel === "email" ? "email address" : "phone number"}, or had already had {capN} marketing messages in 30 days.</T>
        </>
      ) : null}
    </Page>
  );
}
