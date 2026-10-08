// Pricing rules: prices that go up or down by service, day, time, level and date, and a check of what
// one booking would cost (the web: Services, Pricing rules). Rules come from GET /v1/m/menu; the check
// asks GET /v1/m/price-check. Everyone on the team can read them; a manager or the owner changes them.
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Choice, Header, Sheet, SmallBtn, Sw, Tabs2, Tag, Wait, mc } from "@/components/mc-kit";
import { ClearLink, DayGrid, ListPage, Night, NightLabel, Pick, ReadOnly, Seg, SwitchCard, TimeGrid } from "@/components/mi-kit";
import { Btn, Card, Chip, Empty, Failed, Field, Label, Note, Row, Screen, T } from "@/components/ui";
import { qs, type Row as Data } from "@/lib/api";
import { firstName, money } from "@/lib/format";
import { todayIn } from "@/lib/ma-format";
import { DAYS, DAY_SHORT, ask, clock12, dateOnly, signedIn, symbol, toCents, toInt } from "@/lib/mc-util";
import { LEVELS, datesText, day10, daysText, fieldOf, halfHourNow, ruleBody, timeText, type Flash } from "@/lib/mi-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Form = { id: string; name: string; service_id: string; more: boolean; amount: string; percent: boolean; days: string[]; from_time: string; to_time: string; level: string; starts_on: string; ends_on: string; active: boolean };
const BLANK: Form = { id: "", name: "", service_id: "", more: true, amount: "", percent: true, days: [], from_time: "", to_time: "", level: "", starts_on: "", ends_on: "", active: true };
const WHERE: [RegExp, string][] = [[/give the rule a name/i, "name"], [/cannot be zero|percentage change|amount or a percentage/i, "amount"], [/end time|times look/i, "time"], [/last day|dates look/i, "dates"], [/level/i, "level"]];
// Starting points for the rules people make most. Each only fills the form in; nothing is saved until it is.
const STARTS: [string, Partial<Form>][] = [
  ["Weekend peak", { name: "Weekend peak", more: true, percent: true, amount: "15", days: ["sat", "sun"] }],
  ["Quiet mornings", { name: "Quiet mornings", more: false, percent: true, amount: "10", days: ["tue", "wed", "thu"], from_time: "09:00", to_time: "12:00" }],
  ["Evenings", { name: "Evenings", more: true, percent: true, amount: "10", from_time: "17:00", to_time: "21:00" }],
  ["Master level", { name: "Master level", more: true, percent: true, amount: "20", level: "master" }],
];

const changeText = (r: Data, cur: string) => (r.adjust_kind === "percent" ? `${r.adjust_value > 0 ? "+" : "−"}${Math.abs(r.adjust_value)}%` : `${r.adjust_value > 0 ? "+" : "−"}${money(Math.abs(r.adjust_value), cur)}`);

export default function PricingRules() {
  const s = useSession();
  const cur = (s.merchant?.currency as string) ?? "USD", tz = s.merchant?.timezone as string | undefined;
  const canEdit = s.merchant?.role !== "staff";

  const { data, error, refreshing, refresh, reload, setData } = useLoad(signedIn(s, async () => {
    const [menu, sv] = await Promise.all([s.mapi<Data>("/menu"), s.mapi<Data>("/services")]);
    return { rules: (menu.price_rules ?? []) as Data[], services: ((sv.services ?? []) as Data[]).filter((x) => !x.archived), staff: (sv.staff ?? []) as Data[] };
  }), [s.businessToken]);

  const [tab, setTab] = useState<"rules" | "check">("rules");
  const [note, setNote] = useState<Flash>(null);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState<Form | null>(null), [pick, setPick] = useState(""), [formNote, setFormNote] = useState(""), [bad, setBad] = useState<{ key: string; text: string } | null>(null);

  // The price check
  const [ckService, setCkService] = useState(""), [ckStaff, setCkStaff] = useState(""), [ckDay, setCkDay] = useState(todayIn(tz)), [ckTime, setCkTime] = useState(halfHourNow(tz));
  const [ckPick, setCkPick] = useState("");
  const [answer, setAnswer] = useState<{ menu_cents: number; price_cents: number; rules: string[] } | null>(null), [ckError, setCkError] = useState(""), [ckBusy, setCkBusy] = useState(false);

  const services = data?.services ?? [], staff = useMemo(() => (data?.staff ?? []).filter((p) => p.bookable !== false), [data]);
  const service = ckService || String(services[0]?.id ?? ""), person = ckStaff || String(staff[0]?.id ?? "");
  const rulesKey = JSON.stringify((data?.rules ?? []).map((r) => [r.id, r.active, r.adjust_value, r.adjust_kind, r.days, r.from_time, r.to_time, r.level, r.service_id, r.starts_on, r.ends_on]));

  useEffect(() => {
    if (tab !== "check" || !service || !person || !s.businessToken) return;
    let open = true;
    setCkBusy(true); setCkError("");
    s.mapi<{ menu_cents: number; price_cents: number; rules: string[] }>("/price-check" + qs({ service, staff: person, at: `${ckDay}T${ckTime}` }))
      .then((out) => { if (open) { setAnswer(out); setCkBusy(false); } })
      .catch((e: Error) => { if (open) { setAnswer(null); setCkError(e.message || "Could not work that out."); setCkBusy(false); } });
    return () => { open = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, service, person, ckDay, ckTime, rulesKey, s.businessToken]);

  if (!data) {
    return (
      <Screen>
        <Header title="Pricing rules" />
        {error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const rules = data.rules;
  const onCount = rules.filter((r) => r.active).length;
  const set = (change: Partial<Form>) => { setForm((x) => (x ? { ...x, ...change } : x)); setBad(null); };
  const err = (key: string) => (bad?.key === key ? bad.text : undefined);
  const toggleP = (k: string) => setPick((x) => (x === k ? "" : k));

  const open = (r?: Data) => {
    setFormNote(""); setBad(null); setPick("");
    setForm(r ? {
      id: String(r.id), name: String(r.name ?? ""), service_id: String(r.service_id ?? ""), more: Number(r.adjust_value) >= 0, percent: r.adjust_kind === "percent",
      amount: r.adjust_kind === "percent" ? String(Math.abs(Number(r.adjust_value))) : String(Math.abs(Number(r.adjust_value)) / 100),
      days: ((r.days ?? []) as string[]).slice(), from_time: String(r.from_time ?? ""), to_time: String(r.to_time ?? ""), level: String(r.level ?? ""), starts_on: day10(r.starts_on), ends_on: day10(r.ends_on), active: !!r.active,
    } : { ...BLANK });
  };

  const save = async () => {
    if (!form) return;
    const size = form.percent ? toInt(form.amount) : toCents(form.amount);
    if (size === null) { setBad({ key: "amount", text: form.percent ? "Enter the percentage as a whole number, like 15." : "Enter the amount like 10 or 10.50." }); return; }
    const send = {
      name: form.name.trim(), service_id: form.service_id, days: DAYS.filter((d) => form.days.includes(d)), from_time: form.from_time, to_time: form.to_time, level: form.level,
      starts_on: form.starts_on, ends_on: form.ends_on, adjust_kind: form.percent ? "percent" : "amount", adjust_value: form.more ? size : -size, active: form.active,
    };
    setBusy("form"); setFormNote(""); setBad(null); setNote(null);
    try {
      if (form.id) await s.mapi(`/price-rules/${form.id}`, { method: "PUT", body: send });
      else await s.mapi("/price-rules", { body: send });
      setForm(null);
      await refresh();
      setNote({ kind: "ok", text: form.id ? "Rule saved." : "Rule added. It applies to bookings and sales made from now on." });
    } catch (e) {
      const text = (e as Error).message, key = fieldOf(text, WHERE);
      if (key) { setBad({ key, text }); setPick(""); } else setFormNote(text);
    }
    setBusy("");
  };

  const toggle = async (r: Data) => {
    const now = !r.active;
    const patch = (active: boolean) => setData((d) => (d ? { ...d, rules: d.rules.map((x) => (x.id === r.id ? { ...x, active } : x)) } : d));
    setBusy("sw" + r.id); setNote(null); patch(now);
    try {
      await s.mapi(`/price-rules/${r.id}`, { method: "PUT", body: ruleBody(r, { active: now }) });
      setNote({ kind: "ok", text: now ? `${r.name} is switched on.` : `${r.name} is switched off. Prices go back to what they were without it.` });
    } catch (e) {
      patch(!!r.active); setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  const remove = async (r: Data) => {
    if (!(await ask(`Delete the rule ${r.name}?`, "Prices go back to what they were without it.", "Delete", true))) return;
    setBusy("del"); setFormNote(""); setNote(null);
    try {
      await s.mapi(`/price-rules/${r.id}`, { method: "DELETE" });
      setForm(null);
      await refresh();
      setNote({ kind: "ok", text: "Rule deleted." });
    } catch (e) {
      setFormNote((e as Error).message);
    }
    setBusy("");
  };

  const svName = (id: string) => String(services.find((x) => x.id === id)?.name ?? "");
  const header = (
    <View>
      <Header title="Pricing rules" right={canEdit && tab === "rules" ? <SmallBtn kind="ink" icon="plus" onPress={() => open()}>Add</SmallBtn> : undefined} />
      <View style={{ marginTop: 14 }}>
        <Tabs2 tabs={[["rules", `Rules · ${onCount} on`], ["check", "Price check"]]} value={tab} onChange={(k) => { setTab(k); setNote(null); }} />
      </View>
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {!canEdit && tab === "rules" ? <ReadOnly>You can see the rules here. A manager or the owner adds and changes them.</ReadOnly> : null}
      {tab === "rules" ? (
        <T size={13} muted style={{ marginTop: 12, marginBottom: 12 }}>A rule raises or lowers a price when it matches the service, the day, the time, the level of the person doing it and the date. A person&apos;s own price replaces the menu price first, then every rule that matches adjusts it, oldest rule first. Clients see the final price when they book.</T>
      ) : (
        <View style={{ marginTop: 16, gap: 14 }}>
          {!services.length || !staff.length ? <Empty title="Nothing to check yet">Add a service and a team member first.</Empty> : (
            <>
              <Night>
                <NightLabel>A client would pay</NightLabel>
                <Row gap={10} style={{ marginTop: 4, minHeight: 50 }}>
                  <Text style={{ fontFamily: f.serif, fontSize: 44, lineHeight: 50, color: mc.onNight }}>{answer ? money(answer.price_cents, cur) : ckError ? "–" : " "}</Text>
                  {ckBusy ? <ActivityIndicator color={c.gold} /> : null}
                </Row>
                <Text accessibilityRole="alert" style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: ckError ? "#F2B8B2" : mc.nightMuted, marginTop: 6 }}>
                  {ckError ? ckError : answer ? (
                    `${answer.price_cents !== answer.menu_cents ? `Instead of the menu price of ${money(answer.menu_cents, cur)}.` : "The same as the menu price."} ${answer.rules.length ? `Rules that applied: ${answer.rules.join(", ")}.` : "No rule applied."}${answer.price_cents !== answer.menu_cents && !answer.rules.length ? " This person has their own price for it." : ""}`
                  ) : "Working it out."}
                </Text>
                <Text style={{ fontFamily: f.medium, fontSize: 12, lineHeight: 17, color: mc.nightMuted, marginTop: 8 }}>{`${svName(service)} with ${firstName(String(staff.find((p) => p.id === person)?.name ?? ""))} · ${dateOnly(ckDay)} at ${clock12(ckTime)}`}</Text>
              </Night>
              <Pick label="Service" value={svName(service)} open={ckPick === "service"} onToggle={() => setCkPick(ckPick === "service" ? "" : "service")}>
                {services.map((sv) => <Choice key={sv.id} title={String(sv.name)} sub={money(sv.price_cents, cur)} on={sv.id === service} onPress={() => { setCkService(String(sv.id)); setCkPick(""); }} />)}
              </Pick>
              <View style={{ gap: 6 }}>
                <Label>With</Label>
                <Row gap={8} wrap>{staff.map((p) => <Chip key={p.id} on={p.id === person} onPress={() => setCkStaff(String(p.id))}>{`${firstName(String(p.name))} · ${p.level}`}</Chip>)}</Row>
              </View>
              <Pick label="Day" value={dateOnly(ckDay)} open={ckPick === "day"} onToggle={() => setCkPick(ckPick === "day" ? "" : "day")}>
                <DayGrid value={ckDay} tz={tz} onPick={(d) => { setCkDay(d); setCkPick(""); }} />
              </Pick>
              <Pick label="Time" value={clock12(ckTime)} open={ckPick === "time"} onToggle={() => setCkPick(ckPick === "time" ? "" : "time")}>
                <TimeGrid value={ckTime} onPick={(t) => { setCkTime(t); setCkPick(""); }} />
              </Pick>
            </>
          )}
        </View>
      )}
    </View>
  );

  return (
    <>
      <ListPage<Data> data={tab === "rules" ? rules : []} keyOf={(r) => String(r.id)} gap={10} header={header} onRefresh={refresh} refreshing={refreshing}
        empty={tab === "rules" ? <Empty title="No pricing rules" action={canEdit ? <Btn small onPress={() => open()} style={{ marginTop: 4 }}>Add your first rule</Btn> : undefined}>{canEdit ? "Add one to charge more at busy times or less at quiet ones." : "A manager or the owner can add them."}</Empty> : undefined}
        render={(r) => (
          <Card style={{ padding: 14, gap: 6, borderRadius: 18, opacity: r.active ? 1 : 0.75 }}>
            <Pressable accessibilityRole={canEdit ? "button" : undefined} accessibilityLabel={`${r.name}, ${changeText(r, cur)}${canEdit ? ". Edit" : ""}`} disabled={!canEdit} onPress={() => open(r)} style={{ gap: 4 }}>
              <Row between style={{ alignItems: "flex-start" }}>
                <Text style={{ flex: 1, fontFamily: f.semi, fontSize: 15, lineHeight: 21, color: c.ink }}>{r.name}</Text>
                <Text style={{ fontFamily: f.serifBold, fontSize: 22, lineHeight: 26, color: Number(r.adjust_value) < 0 ? c.ok : c.wine }}>{changeText(r, cur)}</Text>
              </Row>
              <T size={13} muted>{[r.service_id ? (r.service ?? "A service that was removed") : "Every service", daysText(r.days as string[]), timeText(r)].join(" · ")}</T>
              <T size={12} muted>{[LEVELS.find(([k]) => k === (r.level ?? ""))?.[1] ?? "Any level", datesText(r)].join(" · ")}</T>
            </Pressable>
            <Row between style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8, marginTop: 2 }}>
              {canEdit ? <SmallBtn onPress={() => open(r)}>Edit</SmallBtn> : <View />}
              {canEdit ? (
                <Row gap={10}>
                  <T size={13} weight="medium" muted>{r.active ? "On" : "Off"}</T>
                  <Sw on={!!r.active} disabled={busy === "sw" + r.id} label={`${r.name}: switched on`} onPress={() => toggle(r)} />
                </Row>
              ) : <Tag kind={r.active ? "ok" : "grey"}>{r.active ? "On" : "Off"}</Tag>}
            </Row>
          </Card>
        )} />

      <Sheet tall open={!!form} onClose={() => setForm(null)} title={form?.id ? "Pricing rule" : "New pricing rule"} sub={form?.id ? undefined : "It applies to bookings and sales made after you add it."}
        footer={<Btn busy={busy === "form"} onPress={save}>{form?.id ? "Save rule" : "Add rule"}</Btn>}>
        {form ? (
          <>
            {formNote ? <Note kind="bad">{formNote}</Note> : null}
            {!form.id ? (
              <View style={{ gap: 6 }}>
                <Label>Start from</Label>
                <Row gap={8} wrap>{STARTS.map(([name, fill]) => <Chip key={name} on={form.name === fill.name} onPress={() => { setForm({ ...BLANK, ...fill }); setBad(null); }}>{name}</Chip>)}</Row>
              </View>
            ) : null}
            <Field label="Name" value={form.name} onChangeText={(name) => set({ name })} maxLength={80} placeholder="Saturday peak" hint="Staff see this name next to the price it changed." error={err("name")} />
            <Pick label="Applies to" value={form.service_id ? svName(form.service_id) || "A service that was removed" : "Every service"} open={pick === "service"} onToggle={() => toggleP("service")}>
              <Choice title="Every service" on={!form.service_id} onPress={() => { set({ service_id: "" }); setPick(""); }} />
              {services.map((sv) => <Choice key={sv.id} title={String(sv.name)} sub={money(sv.price_cents, cur)} on={form.service_id === sv.id} onPress={() => { set({ service_id: String(sv.id) }); setPick(""); }} />)}
            </Pick>

            <Seg label="The price is" options={[["more", "Higher by"], ["less", "Lower by"]]} value={form.more ? "more" : "less"} onChange={(k) => set({ more: k === "more" })} />
            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}><Field label="How much" value={form.amount} onChangeText={(amount) => set({ amount })} keyboardType={form.percent ? "number-pad" : "decimal-pad"} placeholder="0" /></View>
              <View style={{ flex: 1.3 }}><Seg label="As" options={[["percent", "Percent"], ["amount", symbol(cur)]]} value={form.percent ? "percent" : "amount"} onChange={(k) => set({ percent: k === "percent" })} /></View>
            </Row>
            {err("amount") ? <T size={13} color={c.bad}>{err("amount")}</T> : null}

            <View style={{ gap: 6 }}>
              <Label>On these days</Label>
              <View style={{ flexDirection: "row", gap: 4 }}>
                {DAYS.map((d) => {
                  const on = form.days.includes(d);
                  return (
                    <Pressable key={d} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={DAY_SHORT[d]} onPress={() => set({ days: on ? form.days.filter((x) => x !== d) : [...form.days, d] })}
                      style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: f.semi, fontSize: 12, color: on ? c.cream : c.ink }}>{DAY_SHORT[d]}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <T size={13} muted>{form.days.length ? daysText(form.days) + "." : "Choose none and it applies every day."}</T>
            </View>

            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}><Pick label="From this time" value={form.from_time ? clock12(form.from_time) : ""} placeholder="Any" open={pick === "from"} onToggle={() => toggleP("from")} /></View>
              <View style={{ flex: 1 }}><Pick label="Until this time" value={form.to_time ? clock12(form.to_time) : ""} placeholder="Any" open={pick === "to"} onToggle={() => toggleP("to")} /></View>
            </Row>
            {pick === "from" || pick === "to" ? (
              <View style={{ gap: 4 }}>
                <TimeGrid value={pick === "from" ? form.from_time : form.to_time} onPick={(t) => { set(pick === "from" ? { from_time: t } : { to_time: t }); setPick(""); }} />
                <ClearLink onPress={() => { set(pick === "from" ? { from_time: "" } : { to_time: "" }); setPick(""); }}>{pick === "from" ? "No start time" : "No end time"}</ClearLink>
              </View>
            ) : null}
            {err("time") ? <T size={13} color={c.bad}>{err("time")}</T> : <T size={13} muted>Leave both empty for all day.</T>}

            <Seg label="Only for this staff level" options={LEVELS as [string, string][]} value={form.level} onChange={(level) => set({ level })} />
            {err("level") ? <T size={13} color={c.bad}>{err("level")}</T> : null}

            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}><Pick label="First day" value={form.starts_on ? dateOnly(form.starts_on) : ""} placeholder="None" open={pick === "starts"} onToggle={() => toggleP("starts")} /></View>
              <View style={{ flex: 1 }}><Pick label="Last day" value={form.ends_on ? dateOnly(form.ends_on) : ""} placeholder="None" open={pick === "ends"} onToggle={() => toggleP("ends")} /></View>
            </Row>
            {pick === "starts" || pick === "ends" ? (
              <View style={{ gap: 4 }}>
                <DayGrid key={pick} value={pick === "starts" ? form.starts_on : form.ends_on} tz={tz} onPick={(d) => { set(pick === "starts" ? { starts_on: d } : { ends_on: d }); setPick(""); }} />
                <ClearLink onPress={() => { set(pick === "starts" ? { starts_on: "" } : { ends_on: "" }); setPick(""); }}>{pick === "starts" ? "No first day" : "No last day"}</ClearLink>
              </View>
            ) : null}
            {err("dates") ? <T size={13} color={c.bad}>{err("dates")}</T> : <T size={13} muted>Leave both empty to keep it running.</T>}

            <SwitchCard title="Switched on" sub="Off keeps the rule but stops it changing prices." on={form.active} onPress={() => set({ active: !form.active })} />
            {form.id ? <Btn kind="danger" busy={busy === "del"} onPress={() => { const r = rules.find((x) => x.id === form.id); if (r) void remove(r); }}>Delete this rule</Btn> : null}
          </>
        ) : null}
      </Sheet>
    </>
  );
}
