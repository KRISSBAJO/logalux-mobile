// Promo codes: the business's own codes, how often each was used and what it gave away and brought in.
// GET /v1/m/promos lists them; POST adds one; PUT switches one on or off or changes it; DELETE removes an unused one.
// The code itself never changes, and the API lets the discount change only while nobody has used the code.
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Grp, Header, Sheet, SmallBtn, Sw, Tag } from "@/components/mc-kit";
import { DayField, KV, NotReady, RowCard, Tip, Toast, type Said } from "@/components/mg-kit";
import { Btn, Card, Chip, Empty, Field, Label, Note, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money, plural, ymd } from "@/lib/format";
import { dateMed } from "@/lib/mb-util";
import { ask, copyText, major, symbol, toCents, toInt } from "@/lib/mc-util";
import { useGrow } from "@/lib/mg-load";
import { PROMO_TONE, promoState, promoWhat, type PromoState } from "@/lib/mg-util";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

type Form = { id: string; used: number; code: string; description: string; kind: "percent" | "fixed"; value: string; min: string; maxUses: string; startsAt: string; endsAt: string };
const BLANK: Form = { id: "", used: 0, code: "", description: "", kind: "percent", value: "", min: "", maxUses: "", startsAt: "", endsAt: "" };

const usesOf = (p: Data) => (p.max_uses !== null && p.max_uses !== undefined ? `${p.used} of ${p.max_uses}` : `${p.used}`);
const datesOf = (p: Data, tz?: string) => (p.starts_at || p.ends_at ? `${p.starts_at ? dateMed(p.starts_at, tz) : "Now"} to ${p.ends_at ? dateMed(p.ends_at, tz) : "no end"}` : "Always");

export default function Promos() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const cur = (s.merchant?.currency as string) ?? "USD", tz = s.merchant?.timezone as string | undefined;
  const today = ymd(new Date(), tz);

  const { d, denied, error, reload, refresh, refreshing, setData } = useGrow(s, () => s.mapi<Data>("/promos"));
  const [note, setNote] = useState<Said>(null);
  const [show, setShow] = useState<"all" | PromoState>("all");
  const [busyId, setBusyId] = useState("");
  const [openId, setOpenId] = useState("");
  const [form, setForm] = useState<Form | null>(null), [formError, setFormError] = useState(""), [saving, setSaving] = useState(false);

  const promos = useMemo(() => ((d?.promos ?? []) as Data[]), [d]);
  const states = useMemo(() => [...new Set(promos.map((p) => promoState(p)))], [promos]);
  const shown = show !== "all" && states.includes(show) ? show : "all";
  const list = useMemo(() => promos.filter((p) => shown === "all" || promoState(p) === shown), [promos, shown]);

  if (!d) return <NotReady title="Promo codes" denied={denied} error={error} reload={reload} what="Promo codes are made by a manager or the owner." />;

  const link = String(d.booking_link ?? "");
  const business = String(s.merchant?.business ?? "your business");
  const sel = promos.find((p) => p.id === openId);
  const patch = (id: string, change: Data) => setData((x) => (x && typeof x === "object" ? { ...x, promos: ((x as Data).promos as Data[]).map((p) => (p.id === id ? { ...p, ...change } : p)) } : x));

  const toggle = async (p: Data) => {
    const now = !p.active;
    setBusyId(p.id); setNote(null); patch(p.id, { active: now });
    try {
      await s.mapi(`/promos/${p.id}`, { method: "PUT", body: { active: now } });
      setNote({ kind: "ok", text: now ? `${p.code} switched on.` : `${p.code} switched off. It no longer works.` });
    } catch (e) {
      patch(p.id, { active: p.active }); setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusyId("");
  };

  const remove = async (p: Data) => {
    if (!(await ask(`Delete the code ${p.code}?`, "Nobody has used it. Deleting it cannot be undone.", "Delete", true))) return;
    setBusyId(p.id);
    try {
      await s.mapi(`/promos/${p.id}`, { method: "DELETE" });
      setOpenId(""); setNote({ kind: "ok", text: "Code deleted." });
      await refresh();
    } catch (e) { setNote({ kind: "bad", text: (e as Error).message }); setOpenId(""); }
    setBusyId("");
  };

  const copy = async (p: Data) => {
    const out = await copyText(`Use code ${p.code} at ${link}`);
    setOpenId("");
    setNote(out === "failed" ? { kind: "bad", text: "The share line could not be copied." } : { kind: "ok", text: `Copied: "Use code ${p.code} at ${link}"` });
  };

  const dayOf = (v: unknown) => (v ? ymd(new Date(String(v)), tz) : "");
  const set = (change: Partial<Form>) => { setForm((x) => (x ? { ...x, ...change } : x)); setFormError(""); };
  const save = async () => {
    if (!form) return;
    const code = form.code.trim().toUpperCase();
    const locked = !!form.id && usedNow > 0;
    if (!form.id && !/^[A-Z0-9]{4,20}$/.test(code)) { setFormError("A code is 4 to 20 letters and numbers, with no spaces."); return; }
    const value = form.kind === "fixed" ? toCents(form.value) : toInt(form.value);
    if (!locked && (value === null || value <= 0 || (form.kind === "percent" && value > 100))) { setFormError(form.kind === "percent" ? "Enter the percent off as a whole number from 1 to 100." : "Enter the amount off, like 5 or 7.50."); return; }
    const min = toCents(form.min);
    if (min === null) { setFormError("Enter the minimum spend as an amount, or leave it empty for none."); return; }
    const uses = form.maxUses.trim() ? toInt(form.maxUses) : null;
    if (form.maxUses.trim() && (uses === null || uses < 1)) { setFormError("The most times it can be used is a whole number, or empty for no limit."); return; }
    if (form.startsAt && form.endsAt && form.endsAt < form.startsAt) { setFormError("The last day is before the first day."); return; }
    setSaving(true); setFormError("");
    try {
      if (form.id) {
        // Only what can change is sent: a date goes only when it moved, and the discount only while the code is unused.
        const was = promos.find((p) => p.id === form.id);
        const body: Data = { description: form.description.trim(), min_cents: min };
        if (uses !== null) body.max_uses = uses;
        else if (was?.max_uses !== null && was?.max_uses !== undefined) body.no_limit = true;
        if (form.startsAt !== dayOf(was?.starts_at)) body.starts_at = form.startsAt;
        if (form.endsAt !== dayOf(was?.ends_at)) body.ends_at = form.endsAt;
        if (!locked) { body.kind = form.kind; body.value = value; }
        await s.mapi(`/promos/${form.id}`, { method: "PUT", body });
        setForm(null);
        setNote({ kind: "ok", text: `${code} saved. The changes apply from now on.` });
        await refresh();
        setOpenId(form.id);
        setSaving(false);
        return;
      }
      await s.mapi("/promos", { body: { code, description: form.description.trim(), kind: form.kind, value, min_cents: min, max_uses: uses, starts_at: form.startsAt, ends_at: form.endsAt } });
      setForm(null); setShow("all");
      setNote({ kind: "ok", text: `Code ${code} is ready. It works on your booking page and at Checkout.` });
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
      if (form.id) void refresh(); // a refusal may mean the code was used meanwhile: the form then locks its discount
    }
    setSaving(false);
  };

  const add = () => { setFormError(""); setForm({ ...BLANK }); };
  const edit = (p: Data) => {
    setFormError(""); setOpenId("");
    setForm({
      id: String(p.id), used: Number(p.used ?? 0), code: String(p.code), description: String(p.description ?? ""), kind: p.kind === "fixed" ? "fixed" : "percent",
      value: p.kind === "fixed" ? major(Number(p.value)) : String(p.value), min: Number(p.min_cents) > 0 ? major(Number(p.min_cents)) : "",
      maxUses: p.max_uses !== null && p.max_uses !== undefined ? String(p.max_uses) : "", startsAt: dayOf(p.starts_at), endsAt: dayOf(p.ends_at),
    });
  };
  const editing = !!form?.id, live = editing ? promos.find((p) => p.id === form?.id) : undefined;
  const usedNow = Number(live?.used ?? form?.used ?? 0), locked = editing && usedNow > 0;
  const fixedField = { backgroundColor: c.cream2, color: c.muted };

  const header = (
    <View>
      <Header title="Promo codes" right={<SmallBtn kind="ink" icon="plus" onPress={add}>New</SmallBtn>} />
      <T size={14} muted style={{ marginTop: 12 }}>A code gives a client money off. It works on your booking page and at Checkout, for {business} only. The discount comes off what the client pays you.</T>
      {promos.length ? <Grp>Your codes · {promos.length}</Grp> : null}
      {states.length > 1 ? (
        <Row gap={8} wrap style={{ marginBottom: 10 }}>
          <Chip on={shown === "all"} onPress={() => setShow("all")}>All</Chip>
          {states.map((st) => <Chip key={st} on={shown === st} onPress={() => setShow(st)}>{`${st} · ${promos.filter((p) => promoState(p) === st).length}`}</Chip>)}
        </Row>
      ) : null}
      {!promos.length ? (
        <View style={{ marginTop: 16 }}>
          <Empty title="No promo codes yet" action={<SmallBtn kind="ink" onPress={add} style={{ marginTop: 4 }}>Make your first code</SmallBtn>}>Make one, then share it with your booking link.</Empty>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={list}
        keyExtractor={(p) => String(p.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: pad, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ListFooterComponent={promos.length ? <T size={12} muted style={{ marginTop: 4 }}>Open a code to change it. The code itself never changes, and its discount can change only until someone has used it. A code that has been used cannot be deleted, so its record stays.</T> : null}
        renderItem={({ item: p }) => {
          const st = promoState(p);
          return (
            <RowCard style={{ opacity: st === "On" || st === "Not started" ? 1 : 0.8 }}>
              <Row gap={12} style={{ alignItems: "flex-start" }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${p.code}, ${promoWhat(p, cur)}, ${st}, used ${usesOf(p)} times. Open`} onPress={() => setOpenId(p.id)} style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.7 : 1 })}>
                  <Row gap={8} wrap>
                    <Text style={{ fontFamily: f.bold, fontSize: 16, letterSpacing: 0.8, color: c.ink }}>{p.code}</Text>
                    <Tag kind={PROMO_TONE[st]}>{st}</Tag>
                  </Row>
                  <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink, marginTop: 4 }}>{promoWhat(p, cur)}{Number(p.min_cents) > 0 ? ` · over ${money(p.min_cents, cur)}` : ""}</Text>
                  {p.description ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{p.description}</Text> : null}
                  <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 4 }}>Used {usesOf(p)} · {datesOf(p, tz)}</Text>
                  {Number(p.used) > 0 ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>Gave away {money(p.given_cents, cur)} · brought {money(p.booked_cents, cur)} in bookings</Text> : null}
                </Pressable>
                <Sw on={!!p.active} disabled={busyId === p.id} label={`${p.code}: ${p.active ? "on, switch off" : "off, switch on"}`} onPress={() => toggle(p)} />
              </Row>
            </RowCard>
          );
        }}
      />

      <Toast note={note} onDone={() => setNote(null)} />

      <Sheet open={!!sel} onClose={() => setOpenId("")} title={sel?.code ?? ""} sub={sel ? `${promoWhat(sel, cur)} · ${promoState(sel)}` : undefined}>
        {sel ? (
          <>
            <Card style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
              <KV k="What it does" v={promoWhat(sel, cur)} />
              {sel.description ? <KV k="Note" v={String(sel.description)} /> : null}
              <KV k="Minimum spend" v={Number(sel.min_cents) > 0 ? money(sel.min_cents, cur) : "None"} />
              <KV k="Uses" v={sel.max_uses !== null && sel.max_uses !== undefined ? `${sel.used} of ${sel.max_uses}` : `${plural(Number(sel.used), "use")} · no limit`} />
              <KV k="Dates" v={datesOf(sel, tz)} />
              <KV k="Given away" v={money(sel.given_cents, cur)} />
              <KV k="Bookings it brought" v={money(sel.booked_cents, cur)} />
              <KV k="Made on" v={dateMed(String(sel.created_at), tz)} last={!sel.created_by} />
              {sel.created_by ? <KV k="Made by" v={String(sel.created_by)} last /> : null}
            </Card>
            <Card style={{ paddingHorizontal: 16 }}>
              <Row style={{ paddingVertical: 13, minHeight: 56 }}>
                <View style={{ flex: 1 }}>
                  <T size={14} weight="semi">Code is on</T>
                  <T size={12} muted>{sel.active ? "Clients can use it." : "It does not work while it is off."}</T>
                </View>
                <Sw on={!!sel.active} disabled={busyId === sel.id} label={`${sel.code}: ${sel.active ? "on, switch off" : "off, switch on"}`} onPress={() => toggle(sel)} />
              </Row>
            </Card>
            <Btn kind="out" onPress={() => edit(sel)}>Edit</Btn>
            <Btn kind="out" onPress={() => copy(sel)}>Copy share line</Btn>
            <T size={12} muted>The share line reads &quot;Use code {sel.code} at {link}&quot;.</T>
            {Number(sel.used) === 0
              ? <Btn kind="danger" busy={busyId === sel.id} onPress={() => remove(sel)}>Delete this code</Btn>
              : <T size={12} muted>This code has been used, so it cannot be deleted. Switch it off instead.</T>}
          </>
        ) : null}
      </Sheet>

      <Sheet tall open={!!form} onClose={() => setForm(null)} title={editing ? `Edit ${form?.code ?? ""}` : "New promo code"} sub={editing ? "Changes apply to bookings and sales made from now on." : `Works on your booking page and at Checkout, for ${business} only.`}
        footer={<View style={{ gap: 10 }}>{formError ? <Note kind="bad">{formError}</Note> : null}<Btn busy={saving} onPress={save}>{editing ? "Save changes" : "Create code"}</Btn></View>}>
        {form ? (
          <>
            {editing
              ? <Field label="Code" value={form.code} editable={false} style={fixedField} hint="The code itself never changes." />
              : <Field label="Code · 4 to 20 letters and numbers" value={form.code} onChangeText={(t) => set({ code: t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })} autoCapitalize="characters" autoCorrect={false} spellCheck={false} placeholder="WELCOME10" />}
            <Field label="Note · only you see it" value={form.description} onChangeText={(description) => set({ description })} maxLength={120} placeholder="For first-time clients from Instagram" />
            {locked ? (
              <Field label="Discount" value={live ? promoWhat(live, cur) : ""} editable={false} style={fixedField}
                hint={`Used ${plural(usedNow, "time")}, so the discount stays as it is. For a different discount, switch this code off and make a new one.`} />
            ) : (
              <View style={{ gap: 8 }}>
                <Label>Kind of discount</Label>
                <Row gap={8} wrap>
                  <Chip on={form.kind === "percent"} onPress={() => { if (form.kind !== "percent") set({ kind: "percent", value: "" }); }}>A percentage off</Chip>
                  <Chip on={form.kind === "fixed"} onPress={() => { if (form.kind !== "fixed") set({ kind: "fixed", value: "" }); }}>A fixed amount off</Chip>
                </Row>
                {editing ? <T size={13} muted>Nobody has used this code yet, so its discount can still change.</T> : null}
              </View>
            )}
            <Row gap={10} style={{ alignItems: "flex-start" }}>
              {locked ? null : (
                <View style={{ flex: 1 }}>
                  {form.kind === "percent"
                    ? <Field label="Percent off" value={form.value} onChangeText={(value) => set({ value })} keyboardType="number-pad" placeholder="10" />
                    : <Field label={`Amount off (${symbol(cur)})`} value={form.value} onChangeText={(value) => set({ value })} keyboardType="decimal-pad" placeholder="5" />}
                </View>
              )}
              <View style={{ flex: 1 }}><Field label={`Minimum spend (${symbol(cur)})`} value={form.min} onChangeText={(min) => set({ min })} keyboardType="decimal-pad" placeholder="None" /></View>
            </Row>
            <Field label="Most times it can be used" value={form.maxUses} onChangeText={(maxUses) => set({ maxUses })} keyboardType="number-pad" placeholder="No limit"
              hint={editing ? `Used ${plural(usedNow, "time")} so far. Leave it empty for no limit.` : undefined} />
            <DayField label="First day" value={form.startsAt} onChange={(startsAt) => set({ startsAt })} empty="Starts now" today={today} />
            <DayField label="Last day" value={form.endsAt} onChange={(endsAt) => set({ endsAt })} empty="Never ends" today={today} min={form.startsAt || undefined} />
            {editing ? null : <Tip>You can change a code later, apart from the code itself. Its discount can change only until someone uses it.</Tip>}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
