// Packages and memberships: what is on sale, and which clients hold one. The two screens are the same
// shape, so they share this file. Everything comes from GET /v1/m/menu (and GET /v1/m/services for
// what can go in one). Everyone on the team can read it; a manager or the owner changes it.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Header, Sheet, SmallBtn, Stepper, Sw, Tabs2, Tag, Wait, mc } from "@/components/mc-kit";
import { ListPage, Night, NightLabel, ReadOnly, SwitchCard } from "@/components/mi-kit";
import { Btn, Card, Empty, Failed, Field, Label, Note, Row, Screen, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { dateMed } from "@/lib/mb-util";
import { ask, dateOnly, major, signedIn, symbol, toCents, toInt } from "@/lib/mc-util";
import { HOLD, fieldOf, planBody, type Flash } from "@/lib/mi-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Form = { id: string; name: string; description: string; price: string; valid_days: string; service_pct: string; retail_pct: string; qty: Record<string, number>; active: boolean };
const WHERE: [RegExp, string][] = [[/give it a name/i, "name"], [/description/i, "description"], [/price/i, "price"], [/how many days/i, "valid_days"], [/discount is a percentage/i, "discount"], [/at least one service|needs a benefit|each included service|not on your menu/i, "items"]];

export function PlansScreen({ kind }: { kind: "package" | "membership" }) {
  const pkg = kind === "package";
  const title = pkg ? "Packages" : "Memberships";
  const s = useSession();
  const cur = (s.merchant?.currency as string) ?? "USD", tz = s.merchant?.timezone as string | undefined;
  const canEdit = s.merchant?.role !== "staff";

  const { data, error, refreshing, refresh, reload, setData } = useLoad(signedIn(s, async () => {
    const [menu, services] = await Promise.all([s.mapi<Data>("/menu"), s.mapi<Data>("/services")]);
    return { menu, services: ((services.services ?? []) as Data[]).filter((x) => !x.archived) };
  }), [s.businessToken]);
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!s.businessToken) return;
    if (seen.current) void refresh();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));

  const [tab, setTab] = useState<"plans" | "holders">("plans");
  const [note, setNote] = useState<Flash>(null);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState<Form | null>(null), [formNote, setFormNote] = useState(""), [bad, setBad] = useState<{ key: string; text: string } | null>(null);
  const [holder, setHolder] = useState<Data | null>(null), [holderError, setHolderError] = useState("");

  const plans = useMemo(() => ((pkg ? data?.menu.packages : data?.menu.memberships) ?? []) as Data[], [data, pkg]);
  const holders = useMemo(() => ((data?.menu.holders ?? []) as Data[]).filter((h) => h.kind === kind), [data, kind]);
  const services = data?.services ?? [];

  if (!data) {
    return (
      <Screen>
        <Header title={title} />
        {error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const path = pkg ? "/packages" : "/memberships";
  const open = (p?: Data) => {
    setFormNote(""); setBad(null);
    setForm(p
      ? { id: String(p.id), name: String(p.name ?? ""), description: String(p.description ?? ""), price: major(p.price_cents), valid_days: String(p.valid_days ?? 365), service_pct: String(p.service_discount_pct ?? 0), retail_pct: String(p.retail_discount_pct ?? 0), qty: Object.fromEntries(((p.items ?? []) as Data[]).map((i) => [String(i.service_id), Number(i.qty)])), active: !!p.active }
      : { id: "", name: "", description: "", price: "", valid_days: "365", service_pct: "0", retail_pct: "0", qty: {}, active: true });
  };
  const set = (change: Partial<Form>) => { setForm((x) => (x ? { ...x, ...change } : x)); setBad(null); };
  const err = (key: string) => (bad?.key === key ? bad.text : undefined);

  const save = async () => {
    if (!form) return;
    const price = toCents(form.price), days = toInt(form.valid_days), sp = toInt(form.service_pct), rp = toInt(form.retail_pct);
    if (price === null) { setBad({ key: "price", text: "Enter the price as an amount, like 120 or 120.50." }); return; }
    if (pkg && days === null) { setBad({ key: "valid_days", text: "Enter the days as a whole number." }); return; }
    if (!pkg && (sp === null || rp === null)) { setBad({ key: "discount", text: "Enter each discount as a whole number from 0 to 100." }); return; }
    const items = Object.entries(form.qty).filter(([id, n]) => n > 0 && services.some((x) => x.id === id)).map(([service_id, qty]) => ({ service_id, qty }));
    const base = { name: form.name.trim(), description: form.description.trim(), price_cents: price, items, active: form.active };
    const send = pkg ? { ...base, valid_days: days } : { ...base, service_discount_pct: sp, retail_discount_pct: rp };
    setBusy("form"); setFormNote(""); setBad(null); setNote(null);
    try {
      if (form.id) await s.mapi(`${path}/${form.id}`, { method: "PUT", body: send });
      else await s.mapi(path, { body: send });
      setForm(null);
      await refresh();
      setNote({ kind: "ok", text: form.id ? "Saved. Clients who already hold it keep what they bought." : pkg ? "Package added. Sell it to a client at checkout." : "Membership added. Sell it to a client at checkout." });
    } catch (e) {
      const text = (e as Error).message, key = fieldOf(text, WHERE);
      if (key) setBad({ key, text }); else setFormNote(text);
    }
    setBusy("");
  };

  const toggle = async (p: Data) => {
    const now = !p.active;
    const patch = (active: boolean) => setData((d) => (d ? { ...d, menu: { ...d.menu, [pkg ? "packages" : "memberships"]: plans.map((x) => (x.id === p.id ? { ...x, active } : x)) } } : d));
    setBusy("sw" + p.id); setNote(null); patch(now);
    try {
      await s.mapi(`${path}/${p.id}`, { method: "PUT", body: planBody(p, pkg, { active: now }) });
      setNote({ kind: "ok", text: now ? `${p.name} is back on sale at checkout.` : `${p.name} is off sale. Clients who hold it keep it.` });
    } catch (e) {
      patch(!!p.active); setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  const remove = async (p: Data) => {
    if (!(await ask(`Delete ${p.name}?`, "If a client has ever held it, it is switched off instead and their record is kept.", "Delete", true))) return;
    setBusy("del"); setFormNote(""); setNote(null);
    try {
      const out = await s.mapi<Data>(`${path}/${p.id}`, { method: "DELETE" });
      setForm(null);
      await refresh();
      setNote({ kind: "ok", text: out.archived ? "A client has held this, so it was switched off instead of deleted. Their record stays whole." : "Deleted." });
    } catch (e) {
      setFormNote((e as Error).message);
    }
    setBusy("");
  };

  const holderAct = async (h: Data, action: "cancel" | "reactivate") => {
    if (action === "cancel" && !(await ask(pkg ? `End the package of ${h.client}?` : `Cancel the membership of ${h.client}?`, pkg ? `The ${plural(Number(h.credits_left), "visit")} left on it can no longer be used. No refund is made here.` : "It stops now and will not renew. No refund is made here.", pkg ? "End package" : "Cancel membership", true))) return;
    setBusy(action); setHolderError(""); setNote(null);
    try {
      await s.mapi(`/client-plans/${h.id}`, { body: { action } });
      setHolder(null);
      await refresh();
      setNote({ kind: "ok", text: action === "reactivate" ? "Active again." : pkg ? "Package ended. What was left on it can no longer be used." : "Membership cancelled. It will not renew." });
    } catch (e) {
      setHolderError((e as Error).message);
    }
    setBusy("");
  };

  // The number that matters: what is out there with clients right now.
  const sold = plans.reduce((a, p) => a + Number(p.sold ?? 0), 0), inUse = plans.reduce((a, p) => a + Number(p.active_holders ?? 0), 0);
  const members = plans.reduce((a, p) => a + Number(p.members ?? 0), 0), owing = plans.reduce((a, p) => a + Number(p.past_due ?? 0), 0);
  const monthly = plans.reduce((a, p) => a + Number(p.members ?? 0) * Number(p.price_cents ?? 0), 0);
  const worthOf = (p: Data) => ((p.items ?? []) as Data[]).reduce((a, i) => a + Number(i.qty) * Number(i.price_cents), 0);
  const endOf = (h: Data) => {
    const end = pkg ? h.expires_at : h.renews_on;
    if (!end) return "No end";
    return pkg ? `Use by ${dateMed(String(end), tz)}` : h.status === "active" ? `Renews ${dateOnly(String(end))}` : "Will not renew";
  };

  const header = (
    <View>
      <Header title={title} right={canEdit ? <SmallBtn kind="ink" icon="plus" onPress={() => open()}>Add</SmallBtn> : undefined} />
      {plans.length ? (
        <Night style={{ marginTop: 16 }}>
          <NightLabel>{pkg ? "With clients now" : "Members now"}</NightLabel>
          <Text style={{ fontFamily: f.serif, fontSize: 44, lineHeight: 50, color: mc.onNight, marginTop: 2 }}>{pkg ? inUse : members}</Text>
          <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: mc.nightMuted, marginTop: 4 }}>
            {pkg ? (sold ? `${plural(sold, "package")} sold so far, ${inUse} still in use.` : "None sold yet. Sell one to a client at checkout.") : members ? `${money(monthly, cur)} a month at today's prices${owing ? ` · ${owing} owing` : ""}.` : "Nobody holds a membership yet. Sell one to a client at checkout."}
          </Text>
        </Night>
      ) : null}
      <View style={{ marginTop: 14 }}>
        <Tabs2 tabs={[["plans", pkg ? `Packages · ${plans.length}` : `Memberships · ${plans.length}`], ["holders", pkg ? `Clients · ${holders.length}` : `Members · ${holders.length}`]]} value={tab} onChange={(k) => { setTab(k); setNote(null); }} />
      </View>
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {!canEdit ? <ReadOnly>You can see what is on sale here. A manager or the owner adds and changes it.</ReadOnly> : null}
      {tab === "plans" ? (
        <T size={13} muted style={{ marginTop: 12, marginBottom: 12 }}>
          {pkg ? "A package is a set of visits paid for up front. You sell it to a client at checkout, and each visit is taken off it when that service is checked out, until the last day it can be used."
            : `A membership is paid every month and gives discounts, included services, or both. You sell it to a client at checkout. ${data.menu.auto_renew
              ? "Payments run in simulation here, so on each renewal day the monthly charge is recorded automatically and the included services are topped up. No real money moves."
              : "On each renewal day the membership is marked as owing and the front desk takes the payment at checkout. Nothing is charged automatically."}`}
        </T>
      ) : <View style={{ height: 12 }} />}
    </View>
  );

  const planCard = (p: Data) => {
    const items = (p.items ?? []) as Data[], worth = worthOf(p);
    return (
      <Card style={{ padding: 16, gap: 10, opacity: p.active ? 1 : 0.8 }}>
        <Row between style={{ alignItems: "flex-start" }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontFamily: f.serifBold, fontSize: 20, lineHeight: 24, color: c.ink }}>{p.name}</Text>
          <Tag kind={p.active ? "ok" : "grey"}>{p.active ? "On sale" : "Off sale"}</Tag>
        </Row>
        <Row gap={8} style={{ alignItems: "baseline" }}>
          <Text style={{ fontFamily: f.serif, fontSize: 30, lineHeight: 34, color: c.ink }}>{money(p.price_cents, cur)}</Text>
          <T size={13} muted>{pkg ? `valid ${plural(Number(p.valid_days), "day")}` : "a month"}</T>
        </Row>
        {p.description ? <T size={13} muted>{p.description}</T> : null}
        <View style={{ gap: 4 }}>
          {!pkg && Number(p.service_discount_pct) > 0 ? <T size={13}>• {p.service_discount_pct}% off every service</T> : null}
          {!pkg && Number(p.retail_discount_pct) > 0 ? <T size={13}>• {p.retail_discount_pct}% off products</T> : null}
          {items.map((i) => <T key={i.service_id} size={13}>• {i.qty} × {i.name}{pkg ? "" : " each month"}</T>)}
        </View>
        <T size={12} muted>
          {pkg ? `${p.sold} sold · ${p.active_holders} in use` : `${plural(Number(p.members), "member")}${Number(p.past_due) > 0 ? ` · ${p.past_due} owing` : ""}`}
          {worth > 0 ? ` · ${pkg ? "worth" : "includes"} ${money(worth, cur)} at menu prices` : ""}
        </T>
        {canEdit ? (
          <Row between style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10 }}>
            <SmallBtn onPress={() => open(p)}>Edit</SmallBtn>
            <Row gap={10}>
              <T size={13} weight="medium" muted>On sale</T>
              <Sw on={!!p.active} disabled={busy === "sw" + p.id} label={`${p.name}: on sale at checkout`} onPress={() => toggle(p)} />
            </Row>
          </Row>
        ) : null}
      </Card>
    );
  };

  const holderRow = (h: Data) => {
    const [label, tone] = HOLD[String(h.status)] ?? [String(h.status), "grey"];
    return (
      <Card onPress={() => { setHolderError(""); setHolder(h); }} label={`${h.client}, ${h.name}, ${label}`} style={{ padding: 14, gap: 4, borderRadius: 16 }}>
        <Row between style={{ alignItems: "flex-start" }}>
          <T weight="semi" size={14} style={{ flex: 1 }} numberOfLines={1}>{h.client}</T>
          <Tag kind={tone}>{label}</Tag>
        </Row>
        <T size={13} muted numberOfLines={1}>{h.name}</T>
        <T size={12} muted>{h.status === "active" || h.status === "past_due" ? `${plural(Number(h.credits_left), pkg ? "visit" : "included visit")} left · ${endOf(h)}` : `${plural(Number(h.credits_left), pkg ? "visit" : "included visit")} unused · started ${dateMed(String(h.started_at), tz)}`}</T>
      </Card>
    );
  };

  const holderActive = holder ? holder.status === "active" || holder.status === "past_due" : false;

  return (
    <>
      <ListPage<Data> data={tab === "plans" ? plans : holders} keyOf={(x) => String(x.id)} gap={tab === "plans" ? 12 : 8} header={header} onRefresh={refresh} refreshing={refreshing}
        render={(item) => (tab === "plans" ? planCard(item) : holderRow(item))}
        empty={tab === "plans"
          ? <Empty title={pkg ? "No packages yet" : "No memberships yet"} action={canEdit ? <Btn small onPress={() => open()} style={{ marginTop: 4 }}>{pkg ? "Add your first package" : "Add your first membership"}</Btn> : undefined}>{canEdit ? `Add a ${kind} and it can be sold at checkout.` : "A manager or the owner can add them."}</Empty>
          : <Empty title={pkg ? "No client holds a package yet" : "No members yet"}>Sell one at checkout and it shows here.</Empty>} />

      {/* Add or change one */}
      <Sheet tall open={!!form} onClose={() => setForm(null)} title={form?.id ? (pkg ? "Package" : "Membership") : pkg ? "New package" : "New membership"} sub={form?.id ? "Clients who already hold it keep what they bought." : undefined}
        footer={<Btn busy={busy === "form"} onPress={save}>{form?.id ? "Save" : pkg ? "Add package" : "Add membership"}</Btn>}>
        {form ? (
          <>
            {formNote ? <Note kind="bad">{formNote}</Note> : null}
            <Field label="Name" value={form.name} onChangeText={(name) => set({ name })} maxLength={80} placeholder={pkg ? "Wash day trio" : "Braid club"} error={err("name")} />
            <Field label="Description" value={form.description} onChangeText={(description) => set({ description })} multiline maxLength={600} hint="Shown to staff at checkout." error={err("description")} />
            {pkg ? (
              <Row gap={10} style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}><Field label={`Price (${symbol(cur)})`} value={form.price} onChangeText={(price) => set({ price })} keyboardType="decimal-pad" placeholder="0" error={err("price")} /></View>
                <View style={{ flex: 1 }}><Field label="Can be used for (days)" value={form.valid_days} onChangeText={(valid_days) => set({ valid_days })} keyboardType="number-pad" maxLength={4} error={err("valid_days")} /></View>
              </Row>
            ) : (
              <>
                <Field label={`Price a month (${symbol(cur)})`} value={form.price} onChangeText={(price) => set({ price })} keyboardType="decimal-pad" placeholder="0" error={err("price")} />
                <Row gap={10} style={{ alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}><Field label="Off services (%)" value={form.service_pct} onChangeText={(service_pct) => set({ service_pct })} keyboardType="number-pad" maxLength={3} /></View>
                  <View style={{ flex: 1 }}><Field label="Off products (%)" value={form.retail_pct} onChangeText={(retail_pct) => set({ retail_pct })} keyboardType="number-pad" maxLength={3} /></View>
                </Row>
                {err("discount") ? <T size={13} color={c.bad}>{err("discount")}</T> : null}
              </>
            )}
            <View style={{ gap: 8 }}>
              <Label>{pkg ? "What is in it" : "Included every month"}</Label>
              {services.length ? (
                <Card>
                  {services.map((sv, i) => {
                    const n = form.qty[String(sv.id)] ?? 0;
                    const put = (v: number) => set({ qty: { ...form.qty, [String(sv.id)]: Math.max(0, Math.min(100, v)) } });
                    return (
                      <Row key={sv.id} gap={10} style={{ paddingVertical: 10, paddingHorizontal: 14, minHeight: 60, borderBottomWidth: i === services.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{sv.name}</Text>
                          <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{money(sv.price_cents, cur)}</Text>
                        </View>
                        <Stepper value={String(n)} lessLabel={`Fewer ${sv.name}`} moreLabel={`More ${sv.name}`} onLess={() => put(n - 1)} onMore={() => put(n + 1)} />
                      </Row>
                    );
                  })}
                </Card>
              ) : <T size={13} muted>Add services to your menu first.</T>}
              {err("items") ? <T size={13} color={c.bad}>{err("items")}</T>
                : <T size={13} muted>{pkg ? "Set how many visits of each service the package holds. It needs at least one." : "Set how many of each service a member gets each month. Leave them at 0 for a membership that only gives discounts."}</T>}
              {(() => {
                const worth = services.reduce((a, sv) => a + (form.qty[String(sv.id)] ?? 0) * Number(sv.price_cents), 0);
                return worth > 0 ? <T size={13} weight="medium">{pkg ? "Worth" : "Includes"} {money(worth, cur)} at menu prices.</T> : null;
              })()}
            </View>
            <SwitchCard title="On sale at checkout" sub="Off keeps it for the clients who hold it, but it cannot be sold." on={form.active} onPress={() => set({ active: !form.active })} />
            {form.id ? <Btn kind="danger" busy={busy === "del"} onPress={() => { const p = plans.find((x) => x.id === form.id); if (p) void remove(p); }}>{pkg ? "Delete this package" : "Delete this membership"}</Btn> : null}
          </>
        ) : null}
      </Sheet>

      {/* One client's package or membership */}
      <Sheet open={!!holder} onClose={() => setHolder(null)} title={String(holder?.client ?? "")} sub={String(holder?.name ?? "")}>
        {holder ? (
          <>
            {holderError ? <Note kind="bad">{holderError}</Note> : null}
            <Card>
              {([["Status", (HOLD[String(holder.status)] ?? [String(holder.status)])[0]], [pkg ? "Visits left" : "Included visits left", String(holder.credits_left)], ["Started", dateMed(String(holder.started_at), tz)], [pkg ? "Use by" : "Renews", endOf(holder).replace(/^(Use by|Renews) /, "")]] as [string, string][]).map(([k, v], i) => (
                <Row key={k} between style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: i === 3 ? 0 : 1, borderBottomColor: c.line }}>
                  <T size={13} muted>{k}</T>
                  <T size={14} weight="semi">{v}</T>
                </Row>
              ))}
            </Card>
            <Btn kind="out" onPress={() => { const id = holder.client_id; setHolder(null); router.push(`/m/client/${id}` as never); }}>Open {String(holder.client).split(" ")[0]}&apos;s profile</Btn>
            {canEdit ? (
              <>
                {holder.status === "past_due" ? <Btn busy={busy === "reactivate"} onPress={() => holderAct(holder, "reactivate")}>Mark as paid up</Btn> : null}
                {holderActive ? <Btn kind="danger" busy={busy === "cancel"} onPress={() => holderAct(holder, "cancel")}>{pkg ? "End this package" : "Cancel this membership"}</Btn>
                  : holder.status === "cancelled" ? <Btn busy={busy === "reactivate"} onPress={() => holderAct(holder, "reactivate")}>Reactivate</Btn> : null}
              </>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </>
  );
}
