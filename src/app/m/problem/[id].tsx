// A problem a client reported about a visit. The business reads what the client said and gives its
// side once; LogaLuxe then decides and emails both. Only a manager or the owner may open this.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Btn, Card, Failed, Field, Label, Loading, Note, Row as Line, Screen, Serif, T, TopBar } from "@/components/ui";
import { Confirm, Tag } from "@/components/mb-ui";
import type { Row } from "@/lib/api";
import { money } from "@/lib/format";
import { aboutOf, isLate, OUTCOME, stateOf, timeLeft } from "@/lib/mb-care";
import { useFlash, useMapi, useRefocus } from "@/lib/mb-hooks";
import { stamp } from "@/lib/mb-util";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/lib/session";
import { c } from "@/lib/theme";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Line between gap={12} style={{ alignItems: "flex-start", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <T size={13} muted style={{ width: 96 }}>{label}</T>
      <T size={13} weight="semi" style={{ flex: 1, textAlign: "right" }}>{children}</T>
    </Line>
  );
}

export default function Problem() {
  const p = useLocalSearchParams<{ id: string }>();
  const id = String(p.id ?? "");
  const s = useSession();
  const mapi = useMapi();
  const me = s.merchant, tz = me?.timezone as string | undefined;
  const [statement, setStatement] = useState(""), [error, setError] = useState(""), [asking, setAsking] = useState(false), [busy, setBusy] = useState(false);
  const { flash, show } = useFlash(12000);

  // The API lists a business's problems; this screen shows the one named in the address.
  const all = useLoad<Row>(() => mapi("/problems"), [s.businessToken]);
  useRefocus(() => { void all.reload(); });
  const one = ((all.data?.problems ?? []) as Row[]).find((x) => String(x.id) === id);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/business/inbox"));

  if (!one) {
    return (
      <Screen>
        <TopBar title="Problem" onBack={back} />
        {all.loading || !s.ready ? <Loading label="Loading the problem" />
          : <Failed error={all.error || "That report was not found. It may belong to another business."} onRetry={() => { void all.reload(); }} />}
      </Screen>
    );
  }

  const [label, tone] = stateOf(one), late = isLate(one), cur = String(one.currency || me?.currency || "USD");
  const waiting = one.status === "with_business";
  const deadline = one.business_deadline ? stamp(one.business_deadline, tz) : "";
  const n = statement.trim().length;

  const ask = () => {
    setError("");
    if (n < 20 || n > 2000) { setError("Write your answer in 20 to 2,000 characters. Nothing was sent."); return; }
    setAsking(true);
  };
  const send = async () => {
    setBusy(true);
    try {
      await mapi(`/problems/${encodeURIComponent(id)}`, { method: "POST", body: { statement: statement.trim() } });
      setAsking(false); setStatement("");
      show("Your answer was sent to LogaLuxe. They decide and email you and the client.");
      await all.reload();
    } catch (e) {
      setAsking(false);
      setError((e as Error).message);
      void all.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen onRefresh={() => { void all.refresh(); }} refreshing={all.refreshing}
        footer={waiting ? <Btn onPress={ask}>Send answer</Btn> : undefined}>
        <TopBar title={`Problem ${one.ref ?? ""}`} onBack={back} />

        <View style={{ gap: 6 }}>
          <Tag tone={late ? "bad" : tone}>{late ? "Overdue" : label}</Tag>
          <Serif size={26}>{one.client_name}</Serif>
          <T muted>{aboutOf(one)}</T>
        </View>

        <View style={{ marginTop: 14, gap: 12 }}>
          {flash ? <Note kind={flash.kind}>{flash.text}</Note> : null}
          {all.error ? <Note kind="bad">{all.error} Showing what was loaded before.</Note> : null}

          {waiting ? (
            <Note kind={late ? "bad" : "gold"}>
              {one.business_deadline
                ? late ? `The time to answer ran out on ${deadline}. LogaLuxe may decide with what they have, so answer now if you want your side read.`
                  : `Answer by ${deadline}. That is ${timeLeft(one.business_deadline)} from now.`
                : "Answer as soon as you can."}
            </Note>
          ) : null}

          <Card style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 }}>
            <Fact label="Reported">{stamp(one.created_at, tz)}</Fact>
            <Fact label="Visit">{one.starts_at ? stamp(one.starts_at, tz) : "Not on record"}</Fact>
            {one.services ? <Fact label="Services">{one.services}</Fact> : null}
            {Number(one.amount_cents) > 0 ? <Fact label="Visit cost">{money(one.amount_cents, cur)}</Fact> : null}
            <View style={{ paddingTop: 8 }}><T size={12} muted>Times are in your time zone.</T></View>
          </Card>

          <Card style={{ padding: 16, gap: 6 }}>
            <Label>What the client said</Label>
            <T selectable>{one.client_statement || "The client gave no statement."}</T>
          </Card>

          {one.business_statement ? (
            <Card style={{ padding: 16, gap: 6, backgroundColor: c.cream2 }}>
              <Label>Your answer</Label>
              <T selectable>{one.business_statement}</T>
            </Card>
          ) : !waiting ? (
            <Card style={{ padding: 16, gap: 6, backgroundColor: c.cream2 }}>
              <Label>Your answer</Label>
              <T muted>No answer was given before the deadline.</T>
            </Card>
          ) : null}

          {waiting ? (
            <View style={{ gap: 10 }}>
              {error ? <Note kind="bad">{error}</Note> : null}
              <Field label="Your answer" value={statement} onChangeText={setStatement} multiline maxLength={2000} style={{ minHeight: 170 }}
                placeholder="What was agreed, what was done, what you offered"
                hint={`${n.toLocaleString("en-US")} of 2,000 characters, at least 20. You can answer once, so say everything that matters.`} />
              <Card style={{ padding: 16, gap: 6 }}>
                <Label>What happens next</Label>
                <T size={14}>Your answer goes to LogaLuxe. They read both sides, decide, and email you and the client.</T>
                <T size={14}>If you do not answer by {deadline || "the deadline"}, they decide with what they have.</T>
                <T size={14}>They can return all or part of what the client paid, give the client LogaLuxe credit, or return nothing.</T>
              </Card>
            </View>
          ) : null}

          {one.status === "needs_decision" ? (
            <Card style={{ padding: 16, gap: 6 }}>
              <Label>What happens next</Label>
              <T size={14}>LogaLuxe are deciding. They email you and the client when they have. There is nothing more for you to do here.</T>
            </Card>
          ) : null}

          {one.status === "resolved" || one.status === "out_of_scope" ? (
            <Card style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: c.okBg, borderColor: "#CBE5D2" }}>
              <Label>The decision</Label>
              <Fact label="Outcome">{OUTCOME[String(one.outcome)] ?? (one.outcome ? String(one.outcome) : "Decided")}</Fact>
              <Fact label="Returned to the client">{Number(one.outcome_cents) > 0 ? money(one.outcome_cents, cur) : "Nothing"}</Fact>
              {one.resolved_at ? <Fact label="Decided">{stamp(one.resolved_at, tz)}</Fact> : null}
              <View style={{ paddingTop: 8 }}>{one.decision_note ? <T size={14} selectable>{one.decision_note}</T> : <T size={14} muted>No note was given with the decision.</T>}</View>
            </Card>
          ) : null}
        </View>
      </Screen>

      <Confirm open={asking} onClose={() => setAsking(false)} title="Send this answer?" message="It goes to LogaLuxe. You can answer once and cannot change it afterwards." action="Send answer" busy={busy} onConfirm={send} />
    </KeyboardAvoidingView>
  );
}
