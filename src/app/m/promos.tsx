// Promo codes: the business's own codes, how often each was used and what it gave away and brought in.
// GET /v1/m/promos lists them; POST adds one; PUT switches one on or off (the only change the API allows); DELETE removes an unused one.
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Grp, Header, Sheet, SmallBtn, Sw, Tag } from "@/components/mc-kit";
import { DayField, KV, NotReady, RowCard, Tip, Toast, type Said } from "@/components/mg-kit";
import { Btn, Card, Chip, Empty, Field, Label, Note, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money, plural, ymd } from "@/lib/format";
import { dateMed } from "@/lib/mb-util";
import { ask, copyText, symbol, toCents, toInt } from "@/lib/mc-util";
import { useGrow } from "@/lib/mg-load";
import { PROMO_TONE, promoState, promoWhat, type PromoState } from "@/lib/mg-util";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

type Form = { code: string; description: string; kind: "percent" | "fixed"; value: string; min: string; maxUses: string; startsAt: string; endsAt: string };
const BLANK: Form = { code: "", description: "", kind: "percent", value: "", min: "", maxUses: "", startsAt: "", endsAt: "" };

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

  const set = (change: Partial<Form>) => setForm((x) => (x ? { ...x, ...change } : x));
  const save = async () => {
    if (!form) return;
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) { setFormError("A code is 4 to 20 letters and numbers, with no spaces."); return; }
    const value = form.kind === "fixed" ? toCents(form.value) : toInt(form.value);
    if (value === null || value <= 0 || (form.kind === "percent" && value > 100)) { setFormError(form.kind === "percent" ? "Enter the percent off as a whole number from 1 to 100." : "Enter the amount off, like 5 or 7.50."); return; }
    const min = toCents(form.min);
    if (min === null) { setFormError("Enter the minimum spend as an amount, or leave it empty for none."); return; }
    const uses = form.maxUses.trim() ? toInt(form.maxUses) : null;
    if (form.maxUses.trim() && (uses === null || uses < 1)) { setFormError("The most times it can be used is a whole number, or empty for no limit."); return; }
    if (form.startsAt && form.endsAt && form.endsAt < form.startsAt) { setFormError("The last day is before the first day."); return; }
    setSaving(true); setFormError("");
    try {
      await s.mapi("/promos", { body: { code, description: form.description.trim(), kind: form.kind, value, min_cents: min, max_uses: uses, starts_at: form.startsAt, ends_at: form.endsAt } });
      setForm(null); setShow("all");
      setNote({ kind: "ok", text: `Code ${code} is ready. It works on your booking page and at Checkout.` });
      await refresh();
    } catch (e) { setFormError((e as Error).message); }
    setSaving(false);
  };

  const add = () => { setFormError(""); setForm({ ...BLANK }); };

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
        ListFooterComponent={promos.length ? <T size={12} muted style={{ marginTop: 4 }}>A code cannot be changed once it is made: switch it off and make a new one. A code that has been used cannot be deleted, so its record stays.</T> : null}
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
            <Btn kind="out" onPress={() => copy(sel)}>Copy share line</Btn>
            <T size={12} muted>The share line reads &quot;Use code {sel.code} at {link}&quot;.</T>
            {Number(sel.used) === 0
              ? <Btn kind="danger" busy={busyId === sel.id} onPress={() => remove(sel)}>Delete this code</Btn>
              : <T size={12} muted>This code has been used, so it cannot be deleted. Switch it off instead.</T>}
          </>
        ) : null}
      </Sheet>

      <Sheet tall open={!!form} onClose={() => setForm(null)} title="New promo code" sub={`Works on your booking page and at Checkout, for ${business} only.`}
        footer={<Btn busy={saving} onPress={save}>Create code</Btn>}>
        {form ? (
          <>
            {formError ? <Note kind="bad">{formError}</Note> : null}
            <Field label="Code · 4 to 20 letters and numbers" value={form.code} onChangeText={(t) => set({ code: t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })} autoCapitalize="characters" autoCorrect={false} spellCheck={false} placeholder="WELCOME10" />
            <Field label="Note · only you see it" value={form.description} onChangeText={(description) => set({ description })} maxLength={120} placeholder="For first-time clients from Instagram" />
            <View style={{ gap: 8 }}>
              <Label>Kind of discount</Label>
              <Row gap={8} wrap>
                <Chip on={form.kind === "percent"} onPress={() => set({ kind: "percent", value: "" })}>A percentage off</Chip>
                <Chip on={form.kind === "fixed"} onPress={() => set({ kind: "fixed", value: "" })}>A fixed amount off</Chip>
              </Row>
            </View>
            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                {form.kind === "percent"
                  ? <Field label="Percent off" value={form.value} onChangeText={(value) => set({ value })} keyboardType="number-pad" placeholder="10" />
                  : <Field label={`Amount off (${symbol(cur)})`} value={form.value} onChangeText={(value) => set({ value })} keyboardType="decimal-pad" placeholder="5" />}
              </View>
              <View style={{ flex: 1 }}><Field label={`Minimum spend (${symbol(cur)})`} value={form.min} onChangeText={(min) => set({ min })} keyboardType="decimal-pad" placeholder="None" /></View>
            </Row>
            <Field label="Most times it can be used" value={form.maxUses} onChangeText={(maxUses) => set({ maxUses })} keyboardType="number-pad" placeholder="No limit" />
            <DayField label="First day" value={form.startsAt} onChange={(startsAt) => set({ startsAt })} empty="Starts now" today={today} />
            <DayField label="Last day" value={form.endsAt} onChange={(endsAt) => set({ endsAt })} empty="Never ends" today={today} min={form.startsAt || undefined} />
            <Tip>A code cannot be changed once it is made. If something is wrong, switch it off and make a new one.</Tip>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
