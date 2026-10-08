// A new campaign in two short steps: who it goes to, then the message. It is saved as a draft
// (POST /v1/m/campaigns) and opens on the draft, where the test and the send are.
// The AI button only puts words in the box (POST /v1/m/ai/campaign): nothing is saved or sent by it.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Choice, SmallBtn } from "@/components/mc-kit";
import { B, MessageBox, MgIcon, NotReady, Page, Steps, Tip } from "@/components/mg-kit";
import { Btn, Card, Chip, Field, Label, Note, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { soft } from "@/lib/mc-util";
import { useGrow } from "@/lib/mg-load";
import { AUDIENCES, AUDIENCE_LABEL, CHANNELS, CHANNEL_LABEL, NO_SIZE, n, sampleFor, tokensFor, type Size } from "@/lib/mg-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

const STEPS = ["Who", "Message", "Test and send"];
const MAX = 1200;

export default function CampaignNew() {
  const s = useSession();
  const params = useLocalSearchParams<{ audience?: string; from?: string }>();
  const from = typeof params.from === "string" ? params.from : "";

  const [step, setStep] = useState(0);
  const [audience, setAudience] = useState(AUDIENCE_LABEL[String(params.audience)] ? String(params.audience) : "all");
  const [channel, setChannel] = useState("email");
  const [name, setName] = useState(""), [subject, setSubject] = useState(""), [message, setMessage] = useState("");
  const [goal, setGoal] = useState(""), [writing, setWriting] = useState(false), [drafted, setDrafted] = useState(0), [aiError, setAiError] = useState("");
  const [used, setUsed] = useState<number | null>(null);
  const [error, setError] = useState(""), [saving, setSaving] = useState(false);

  const { d, denied, error: loadError, reload } = useGrow(s, async () => {
    const [main, ai] = await Promise.all([s.mapi<Data>("/marketing"), soft(() => s.mapi<Data>("/ai"))]);
    return { main, ai: ai.data };
  });

  // Changing the wording of a draft: start from what it says. The draft itself cannot be edited, so a new one replaces it.
  const filled = useRef(false);
  useEffect(() => {
    if (!d || filled.current || !from) return;
    const old = ((d.main.campaigns ?? []) as Data[]).find((x) => x.id === from && x.status === "draft");
    filled.current = true;
    if (!old) return;
    setAudience(AUDIENCE_LABEL[old.audience] ? old.audience : "all"); setChannel(CHANNEL_LABEL[old.channel] ? old.channel : "email");
    setName(String(old.name ?? "")); setSubject(String(old.subject ?? "")); setMessage(String(old.message ?? ""));
    setStep(1);
  }, [d, from]);

  if (!d) return <NotReady title="New campaign" denied={denied} error={loadError} reload={reload} what="Campaigns are written and sent by a manager or the owner." />;

  const modes = (d.main.modes ?? {}) as Record<string, string>, capN = Number(d.main.cap ?? 0);
  const audiences = (d.main.audiences ?? {}) as Record<string, Size>;
  const link = String(d.main.booking_link ?? "");
  const a = audiences[audience] ?? NO_SIZE;
  const reach = channel === "email" ? a.email : a.phone;
  const chName = CHANNEL_LABEL[channel] ?? channel;
  const logged = modes[channel] === "log";
  const emailLive = modes.email !== "log";
  const ai = d.ai?.enabled ? { used: used ?? Number(d.ai.used_today ?? 0), limit: Number(d.ai.limit ?? 0) } : null;
  const replacing = !!from && ((d.main.campaigns ?? []) as Data[]).some((x) => x.id === from && x.status === "draft");

  const write = async () => {
    if (goal.trim().length < 5) { setAiError("Say in a sentence what the message is for."); return; }
    setAiError(""); setWriting(true);
    try {
      const out = await s.mapi<Data>("/ai/campaign", { body: { audience, channel, goal: goal.slice(0, 400) } });
      const text = String(out.message ?? "");
      if (!text) setAiError("The draft came back empty. Try again.");
      else {
        setMessage(text.slice(0, MAX));
        // The server fills placeholders in the message only, so the subject gets the real name here.
        if (out.subject) setSubject(String(out.subject).split("{business}").join(String(s.merchant?.business ?? "")).slice(0, 120));
        setDrafted((x) => x + 1);
        setUsed((ai?.used ?? 0) + 1);
      }
    } catch (e) {
      setAiError((e as Error).message || "The draft could not be written. Try again.");
    }
    setWriting(false);
  };

  const save = async () => {
    const nm = name.trim(), sub = subject.trim(), msg = message.trim();
    if (!nm) { setError("Give the campaign a name. Only you see it."); return; }
    if (channel === "email" && !sub) { setError("An email needs a subject."); return; }
    if (channel === "email" && /{[a-z ]+}/.test(sub)) { setError("Placeholders only work in the message, not in the subject. Write the subject out in full."); return; }
    if (msg.length < 10) { setError("The message must be at least 10 characters."); return; }
    setError(""); setSaving(true);
    try {
      const out = await s.mapi<Data>("/campaigns", { body: { name: nm, audience, channel, subject: channel === "email" ? sub : "", message: msg } });
      let swapped = "";
      if (replacing) {
        try { await s.mapi(`/campaigns/${from}`, { method: "DELETE" }); } catch { swapped = "old"; }
      }
      router.replace(`/m/campaign/${out.id}?saved=${Number(out.recipients ?? 0)}${swapped ? "&old=1" : ""}` as never);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const back = () => (step === 1 ? setStep(0) : router.canGoBack() ? router.back() : router.replace("/m/campaigns" as never));

  const footer = step === 0
    ? <Btn onPress={() => setStep(1)}>Next: the message</Btn>
    : (
      <Row gap={8}>
        <Btn kind="out" onPress={() => setStep(0)} style={{ paddingHorizontal: 22 }}>Back</Btn>
        <Btn busy={saving} onPress={save} style={{ flex: 1 }}>{replacing ? "Save the new wording" : "Save draft"}</Btn>
      </Row>
    );

  return (
    <Page title={replacing ? "Change the wording" : "New campaign"} footer={footer} onBack={back}>
      <Steps steps={STEPS} at={step} />

      {step === 0 ? (
        <View style={{ gap: 14, marginTop: 18 }}>
          <View style={{ gap: 8 }}>
            <Label>Who it goes to</Label>
            <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
              {AUDIENCES.map(([key, label]) => {
                const z = audiences[key] ?? NO_SIZE;
                return <Choice key={key} on={audience === key} onPress={() => setAudience(key)} title={`${label} · ${n(z.total)}`} sub={`${n(z.email)} with an email · ${n(z.phone)} with a phone number`} />;
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Label>How it is sent</Label>
            <Row gap={8} wrap>
              {CHANNELS.map(([key, label]) => <Chip key={key} on={channel === key} onPress={() => setChannel(key)}>{`${label}${modes[key] === "log" ? " · logged only" : ""}`}</Chip>)}
            </Row>
          </View>

          <Tip>
            <B>{n(a.total)} {a.total === 1 ? "client" : "clients"} in this audience.</B> {n(reach)} {reach === 1 ? "has" : "have"} {channel === "email" ? "an email address" : "a phone number"} and can be reached on {chName}{a.total - reach > 0 ? `; the other ${n(a.total - reach)} will be skipped` : ""}. Clients who opted out of marketing are never included, and anyone who already had {capN} marketing messages in 30 days is skipped.
          </Tip>
          {logged ? (
            <Note kind="gold">
              {channel === "email"
                ? "Email is not connected yet, so these messages are logged, not delivered."
                : `${chName} is not connected yet, so these messages are logged, not delivered. ${emailLive ? "Email is the only channel that reaches clients today." : "Email is not connected yet either."}`}
            </Note>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 14, marginTop: 18 }}>
          {error ? <Note kind="bad">{error}</Note> : null}
          <T size={13} muted>{AUDIENCE_LABEL[audience]} · {chName}{logged ? " · logged only" : ""} · {n(reach)} can be reached</T>
          <Field label="Name · only you see it" value={name} onChangeText={(t) => { setName(t); setError(""); }} maxLength={80} placeholder="October offer" />

          {ai ? (
            <Card style={{ padding: 14, gap: 10 }}>
              <Row gap={8}>
                <MgIcon name="spark" size={18} color={c.gold} />
                <Text style={{ flex: 1, fontFamily: f.semi, fontSize: 14, color: c.ink }}>Write it for me</Text>
              </Row>
              <Field label="What should this message do?" value={goal} onChangeText={setGoal} maxLength={400} placeholder="Fill quiet Tuesdays with 15% off silk press this month" returnKeyType="go" onSubmitEditing={write} />
              <SmallBtn kind="out" busy={writing} onPress={write} style={{ alignSelf: "flex-start" }}>{writing ? "Writing" : drafted ? "Write again" : "Write it for me"}</SmallBtn>
              {aiError ? <Note kind="bad">{aiError}</Note> : drafted && !writing ? <Note>The draft is in the message box below. Edit it as you like.</Note> : null}
              <T size={12} muted>Written by AI from your menu and what you asked for. It never invents a discount: say the offer in your own words. Read it before you send. Nothing is sent until you press send yourself.{ai.limit > 0 ? ` ${ai.used} of ${ai.limit} drafts used today.` : ""}</T>
            </Card>
          ) : null}

          {channel === "email" ? <Field label="Subject" value={subject} onChangeText={(t) => { setSubject(t); setError(""); }} maxLength={120} placeholder="A little something for you" /> : null}
          <MessageBox value={message} onChange={(t) => { setMessage(t); setError(""); }} max={MAX} tokens={tokensFor(false)} sample={sampleFor(s.merchant, link, false)} previewLabel={`Preview · ${chName} · sample values`} />
          <Tip>It is saved as a draft. Nothing goes out until you press send. A saved draft cannot be edited: to change the wording later, you replace it with a new one.</Tip>
        </View>
      )}
    </Page>
  );
}
