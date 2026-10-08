// Questions at booking: what a client is asked when they book online, in the four kinds the API has
// (short answer, yes or no, choose one, must tick). GET, POST, PUT and DELETE /v1/m/intake, which are a
// manager's or the owner's. The order is the `sort` number each question carries; moving one rewrites it.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AskManager, Choice, Grp, Header, McIcon, Sheet, SmallBtn, Sw, Tabs2, Wait } from "@/components/mc-kit";
import { ArrowBtn, HeadLink, ListPage, Pick, SwitchCard } from "@/components/mi-kit";
import { Btn, Card, Empty, Failed, Field, Label, Note, Row, Screen, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { plural } from "@/lib/format";
import { DENIED, ask, orDenied, signedIn } from "@/lib/mc-util";
import { KINDS, KIND_NAME, MOST_QUESTIONS, cut, fieldOf, questionBody, type Flash } from "@/lib/mi-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Form = { id: string; label: string; kind: string; options: string; service_id: string; required: boolean; sort: number; active: boolean; answers: number };
const WHERE: [RegExp, string][] = [[/write the question/i, "label"], [/kind of answer/i, "kind"], [/2 and 12 options/i, "options"], [/service was not found/i, "service"]];

export default function Questions() {
  const s = useSession();
  const { data, error, refreshing, refresh, reload, setData } = useLoad(signedIn(s, () => orDenied(async () => {
    const [intake, sv] = await Promise.all([s.mapi<Data>("/intake"), s.mapi<Data>("/services")]);
    return { questions: (intake.questions ?? []) as Data[], services: ((sv.services ?? []) as Data[]).filter((x) => !x.archived) };
  })), [s.businessToken]);

  const [tab, setTab] = useState<"list" | "preview">("list");
  const [sorting, setSorting] = useState(false);
  const [note, setNote] = useState<Flash>(null);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState<Form | null>(null), [pick, setPick] = useState(false), [formNote, setFormNote] = useState(""), [bad, setBad] = useState<{ key: string; text: string } | null>(null);

  if (!data || data === DENIED) {
    return (
      <Screen>
        <Header title="Questions" />
        {data === DENIED ? <AskManager what="A manager or the owner chooses what clients are asked when they book online." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const { questions, services } = data;
  const live = questions.filter((q) => q.active), off = questions.filter((q) => !q.active);
  const full = live.length >= MOST_QUESTIONS;
  const nextSort = questions.reduce((n, q) => Math.max(n, Number(q.sort) || 0), 0) + 1;
  const svName = (id: string) => String(services.find((x) => x.id === id)?.name ?? "");
  const set = (change: Partial<Form>) => { setForm((x) => (x ? { ...x, ...change } : x)); setBad(null); };
  const err = (key: string) => (bad?.key === key ? bad.text : undefined);
  const patchAll = (list: Data[]) => setData((d) => (d && d !== DENIED ? { ...d, questions: list } : d));

  const open = (q?: Data) => {
    setFormNote(""); setBad(null); setPick(false);
    setForm(q
      ? { id: String(q.id), label: String(q.label ?? ""), kind: String(q.kind ?? "text"), options: ((q.options ?? []) as string[]).join("\n"), service_id: q.service_id ? String(q.service_id) : "", required: !!q.required, sort: Number(q.sort) || 0, active: !!q.active, answers: Number(q.answers ?? 0) }
      : { id: "", label: "", kind: "text", options: "", service_id: "", required: false, sort: nextSort, active: !full, answers: 0 });
  };

  const save = async () => {
    if (!form) return;
    const send = {
      service_id: form.service_id, label: form.label.trim(), kind: form.kind,
      options: form.kind === "choice" ? form.options.split(/\r?\n/).map((o) => o.trim()).filter(Boolean) : [],
      required: form.kind === "consent" || form.required, sort: Math.max(0, form.sort), active: form.active,
    };
    if (form.kind === "choice" && send.options.some((o) => o.length > 80)) { setBad({ key: "options", text: "Keep each option to 80 characters or fewer." }); return; }
    setBusy("form"); setFormNote(""); setBad(null); setNote(null);
    try {
      if (form.id) await s.mapi(`/intake/${form.id}`, { method: "PUT", body: send });
      else await s.mapi("/intake", { body: send });
      setForm(null);
      await refresh();
      setNote({ kind: "ok", text: form.id ? "Saved. Past bookings keep what was asked at the time." : send.active ? "Added. Clients are asked it the next time they book online." : "Added, switched off. Switch it on when you want it asked." });
    } catch (e) {
      const text = (e as Error).message, key = fieldOf(text, WHERE);
      if (key) setBad({ key, text }); else setFormNote(text);
    }
    setBusy("");
  };

  const toggle = async (q: Data) => {
    const now = !q.active;
    if (now && full) { setNote({ kind: "bad", text: `${MOST_QUESTIONS} questions are on, which is the most a booking can ask. Switch one off first.` }); return; }
    setBusy("sw" + q.id); setNote(null);
    try {
      await s.mapi(`/intake/${q.id}`, { method: "PUT", body: questionBody(q, { active: now }) });
      await refresh();
      setNote({ kind: "ok", text: now ? "Switched on. Clients are asked it when they book online." : "Switched off. Clients are no longer asked it." });
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  /** Moves a question one place among those that are on, and saves the new place of each one that moved. */
  const move = async (q: Data, up: boolean) => {
    const list = [...live];
    const i = list.findIndex((x) => x.id === q.id), j = up ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const before = questions;
    const renumbered: Data[] = list.map((x, n) => ({ ...x, sort: n + 1 }));
    const changed = renumbered.filter((x) => (Number(before.find((o) => o.id === x.id)?.sort) || 0) !== x.sort);
    setBusy("mv" + q.id); setNote(null);
    patchAll([...renumbered, ...off]);
    try {
      for (const x of changed) await s.mapi(`/intake/${x.id}`, { method: "PUT", body: questionBody(x) });
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
      await refresh();
    }
    setBusy("");
  };

  const remove = async (q: Form) => {
    if (!(await ask(`Remove "${cut(q.label)}"?`, q.answers > 0 ? `${plural(q.answers, "booking")} answered it, so it will be switched off instead of removed.` : "Clients will no longer be asked it.", "Remove", true))) return;
    setBusy("del"); setFormNote(""); setNote(null);
    try {
      const out = await s.mapi<Data>(`/intake/${q.id}`, { method: "DELETE" });
      setForm(null);
      await refresh();
      setNote({ kind: "ok", text: out.switched_off ? "This question has answers, so it was switched off instead of removed. Past bookings keep what was asked." : "Removed." });
    } catch (e) {
      setFormNote((e as Error).message);
    }
    setBusy("");
  };

  const rows = tab === "list" ? [...live, ...off] : [];
  const consent = form?.kind === "consent";

  const header = (
    <View>
      <Header title="Questions" right={tab === "list" ? <SmallBtn kind="ink" icon="plus" onPress={() => open()}>Add</SmallBtn> : undefined} />
      <View style={{ marginTop: 14 }}>
        <Tabs2 tabs={[["list", `Questions · ${live.length} on`], ["preview", "What a client sees"]]} value={tab} onChange={(k) => { setTab(k); setNote(null); setSorting(false); }} />
      </View>
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {tab === "list" ? (
        <>
          <T size={13} muted style={{ marginTop: 12 }}>Clients answer these when they book online, and you see the answers on the booking. A &quot;Must tick&quot; question is for things they have to agree to, such as arriving with clean, dry hair. Up to {MOST_QUESTIONS} can be on at once.</T>
          {full ? <View style={{ marginTop: 12 }}><Note kind="gold">{MOST_QUESTIONS} questions are on, which is the most a booking can ask. Switch one off before you add or switch on another.</Note></View> : null}
          {live.length ? <Grp right={live.length > 1 ? <HeadLink onPress={() => setSorting(!sorting)}>{sorting ? "Done" : "Reorder"}</HeadLink> : undefined}>{`Asked, in this order · ${live.length}`}</Grp> : <View style={{ height: 12 }} />}
        </>
      ) : (
        <View style={{ marginTop: 12, gap: 12 }}>
          <T size={13} muted>The questions that are on, in the order they are asked. Nothing here can be filled in.</T>
          {!live.length ? <Empty title="Nothing is asked yet">Add a question, or switch one on, and it shows here the way a client sees it.</Empty> : (
            <Card style={{ padding: 16, gap: 18 }}>
              {live.map((q) => {
                const options = (q.options ?? []) as string[];
                const only = q.service_id ? <T size={12} muted>Only when booking {String(q.service ?? "one service")}</T> : null;
                if (q.kind === "consent") {
                  return (
                    <View key={q.id} style={{ gap: 6 }}>
                      <Row gap={10} style={{ alignItems: "flex-start" }}>
                        <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: c.muted2, backgroundColor: c.white, marginTop: 1 }} />
                        <T size={14} style={{ flex: 1 }}>{q.label}</T>
                      </Row>
                      {only}
                    </View>
                  );
                }
                return (
                  <View key={q.id} style={{ gap: 8 }}>
                    <T size={14} weight="semi">{q.label}{q.required ? "" : " (optional)"}</T>
                    {q.kind === "text" ? (
                      <View style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: c.line2, backgroundColor: c.cream, justifyContent: "center", paddingHorizontal: 14 }}><T size={14} color={c.muted2}>Their answer</T></View>
                    ) : (
                      <Row gap={8} wrap>{(q.kind === "yesno" ? ["Yes", "No"] : options).map((o) => <View key={o} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.line2, justifyContent: "center", backgroundColor: c.white }}><Text style={{ fontFamily: f.semi, fontSize: 13, color: c.ink }}>{o}</Text></View>)}</Row>
                    )}
                    {only}
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      )}
    </View>
  );

  return (
    <>
      <ListPage<Data> data={rows} keyOf={(q) => String(q.id)} header={header} onRefresh={refresh} refreshing={refreshing}
        empty={tab === "list" ? <Empty title="No questions yet" action={<Btn small onPress={() => open()} style={{ marginTop: 4 }}>Add your first question</Btn>}>Add one and clients are asked it when they book online.</Empty> : undefined}
        render={(q, index) => {
          const isLive = !!q.active, n = isLive ? index : index - live.length;
          const group = isLive ? live : off;
          const first = n === 0, last = n === group.length - 1;
          const options = (q.options ?? []) as string[];
          const meta = [KIND_NAME[String(q.kind)] ?? String(q.kind), q.service_id ? String(q.service ?? "A service that was removed") : "Every booking", q.required ? "Required" : "Optional"].join(" · ");
          return (
            <View>
              {!isLive && first ? <Grp>{`Switched off · ${off.length}`}</Grp> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 64, backgroundColor: c.white, borderColor: c.line, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopWidth: first ? 1 : 0, borderTopLeftRadius: first ? 20 : 0, borderTopRightRadius: first ? 20 : 0, borderBottomLeftRadius: last ? 20 : 0, borderBottomRightRadius: last ? 20 : 0, opacity: isLive ? 1 : 0.8 }}>
                {sorting && isLive ? <McIcon name="grab" size={16} color="#C9BCB0" /> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`${String(q.label).replace(/[.?!]+$/, "")}. ${meta}. Edit`} onPress={() => open(q)} style={{ flex: 1, minWidth: 0, minHeight: 40, justifyContent: "center" }}>
                  <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{q.label}</Text>
                  {q.kind === "choice" && options.length ? <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.ink }}>{options.join(" · ")}</Text> : null}
                  <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{meta}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted2 }}>{Number(q.answers) > 0 ? `${plural(Number(q.answers), "booking")} answered it` : "Not answered yet"}</Text>
                </Pressable>
                {sorting && isLive ? (
                  <Row gap={4}>
                    <ArrowBtn up disabled={first || !!busy} label={`Move "${cut(String(q.label), 40)}" up`} onPress={() => move(q, true)} />
                    <ArrowBtn disabled={last || !!busy} label={`Move "${cut(String(q.label), 40)}" down`} onPress={() => move(q, false)} />
                  </Row>
                ) : <Sw on={isLive} disabled={busy === "sw" + q.id} label={`${cut(String(q.label))}: switched on`} onPress={() => toggle(q)} />}
              </View>
            </View>
          );
        }} />

      <Sheet tall open={!!form} onClose={() => setForm(null)} title={form?.id ? "Question" : "New question"}
        sub={form?.id ? (form.answers > 0 ? `${plural(form.answers, "booking")} answered it. They keep the wording they were asked.` : undefined) : "Clients answer it when they book online."}
        footer={<Btn busy={busy === "form"} onPress={save}>{form?.id ? "Save question" : "Add question"}</Btn>}>
        {form ? (
          <>
            {formNote ? <Note kind="bad">{formNote}</Note> : null}
            <Field label="Question" value={form.label} onChangeText={(label) => set({ label })} multiline maxLength={300} style={{ minHeight: 72 }}
              placeholder={consent ? "I agree to arrive with clean, dry hair." : "How long is your hair now?"} hint={consent ? "Write it as the thing the client agrees to. 3 to 300 characters." : "3 to 300 characters."} error={err("label")} />
            <View style={{ gap: 8 }}>
              <Label>Kind of answer</Label>
              {KINDS.map(([k, name, what]) => <Choice key={k} title={name} sub={what} on={form.kind === k} onPress={() => set({ kind: k })} />)}
              {err("kind") ? <T size={13} color={c.bad}>{err("kind")}</T> : null}
            </View>
            {form.kind === "choice" ? (
              <Field label="Options" value={form.options} onChangeText={(options) => set({ options })} multiline autoCapitalize="sentences" placeholder={"Short\nShoulder length\nLong"} hint="One on each line. Between 2 and 12 options, each up to 80 characters." error={err("options")} />
            ) : null}
            <Pick label="Ask it for" value={form.service_id ? svName(form.service_id) || "A service that was removed" : "Every booking"} open={pick} onToggle={() => setPick(!pick)} hint="Pick a service to ask it only when that service is being booked." error={err("service")}>
              <Choice title="Every booking" on={!form.service_id} onPress={() => { set({ service_id: "" }); setPick(false); }} />
              {services.map((sv) => <Choice key={sv.id} title={String(sv.name)} on={form.service_id === sv.id} onPress={() => { set({ service_id: String(sv.id) }); setPick(false); }} />)}
            </Pick>
            <SwitchCard title="The client must answer it to book" sub={consent ? "Always required: a box the client must tick cannot be skipped." : "Off makes it optional."} on={consent || form.required} disabled={consent} onPress={() => set({ required: !form.required })} />
            <SwitchCard title="Switched on" sub={!form.active && full && !form.id ? `${MOST_QUESTIONS} are on already, so this one starts switched off.` : "Off keeps the question but stops it being asked."} on={form.active} disabled={!form.active && full} onPress={() => set({ active: !form.active })} />
            {form.id ? <Btn kind="danger" busy={busy === "del"} onPress={() => remove(form)}>Remove this question</Btn> : null}
          </>
        ) : null}
      </Sheet>
    </>
  );
}
