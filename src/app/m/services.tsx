// Services and pricing: the menu, grouped the way clients see it (design: M9-Services).
// Everyone on the team can read the menu; a manager or the owner changes it.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Grp, Header, Item, McIcon, Sheet, SmallBtn, Sw, Tag, Wait, piece } from "@/components/mc-kit";
import { Avatar, Btn, Card, Chip, Empty, Failed, Field, Label, Note, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { duration, firstName, money, plural } from "@/lib/format";
import { ask, major, signedIn, symbol, toCents, toInt } from "@/lib/mc-util";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Form = { id: string; name: string; category: string; description: string; duration: string; processing: string; buffer: string; price: string; deposit: string; online: boolean; staff: string[] };

/** A saved service in the shape the API takes, with one thing changed. */
function body(sv: Data, change: Record<string, unknown> = {}) {
  const staff = (sv.staff ?? []) as Data[];
  return {
    name: sv.name, category: sv.category, description: sv.description,
    duration_min: sv.duration_min, processing_min: sv.processing_min, buffer_min: sv.buffer_min,
    price_cents: sv.price_cents, deposit_cents: sv.deposit_cents, online: sv.online,
    staff_ids: staff.map((x) => x.staff_id), staff_prices: Object.fromEntries(staff.map((x) => [x.staff_id, x.price_cents])),
    ...change,
  };
}

const metaOf = (sv: Data) => [duration(Number(sv.duration_min)), Number(sv.processing_min) > 0 ? `${sv.processing_min} min processing` : "", Number(sv.buffer_min) > 0 ? `${sv.buffer_min} min cleanup` : ""].filter(Boolean).join(" · ");

export default function Services() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const cur = (s.merchant?.currency as string) ?? "USD";
  const canEdit = s.merchant?.role !== "staff";

  const { data, error, refreshing, refresh, reload, setData } = useLoad(signedIn(s, () => s.mapi<Data>("/services")), [s.businessToken]);
  const [cat, setCat] = useState("");
  const [sorting, setSorting] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busyId, setBusyId] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState(""), [saving, setSaving] = useState(false);

  const all = useMemo(() => ((data?.services ?? []) as Data[]), [data]);
  const staff = useMemo(() => ((data?.staff ?? []) as Data[]), [data]);
  const active = useMemo(() => all.filter((x) => !x.archived), [all]);
  const archived = useMemo(() => all.filter((x) => x.archived), [all]);
  const cats = useMemo(() => [...new Set(active.map((x) => String(x.category)))], [active]);
  const shown = cat && cats.includes(cat) ? cat : "";

  const sections = useMemo(() => {
    const out = cats.filter((k) => !shown || k === shown).map((k) => ({ key: k, title: k, archived: false, data: active.filter((x) => x.category === k) }));
    if (!shown && archived.length) out.push({ key: "__archived", title: "Archived", archived: true, data: archived });
    return out;
  }, [cats, shown, active, archived]);

  const fail = (e: unknown) => setNote({ kind: "bad", text: (e as Error).message });
  const patch = (id: string, change: Data) => setData((d) => (d ? { ...d, services: (d.services as Data[]).map((x) => (x.id === id ? { ...x, ...change } : x)) } : d));

  const toggle = async (sv: Data) => {
    const now = !sv.online;
    setBusyId(sv.id); setNote(null); patch(sv.id, { online: now });
    try {
      await s.mapi(`/services/${sv.id}`, { method: "PUT", body: body(sv, { online: now }) });
      setNote({ kind: "ok", text: now ? `Clients can book ${sv.name} online now.` : `${sv.name} is hidden from online booking. You can still book it from the calendar.` });
    } catch (e) {
      patch(sv.id, { online: sv.online }); fail(e);
    }
    setBusyId("");
  };

  const move = async (sv: Data, up: boolean) => {
    const list = [...active];
    const i = list.findIndex((x) => x.id === sv.id);
    let j = -1;
    if (up) { for (let k = i - 1; k >= 0; k--) if (list[k].category === sv.category) { j = k; break; } }
    else { for (let k = i + 1; k < list.length; k++) if (list[k].category === sv.category) { j = k; break; } }
    if (i < 0 || j < 0) return;
    [list[i], list[j]] = [list[j], list[i]];
    const before = data;
    setBusyId(sv.id); setNote(null);
    setData((d) => (d ? { ...d, services: [...list, ...archived] } : d));
    try {
      await s.mapi("/services/order", { method: "PUT", body: { ids: list.map((x) => x.id) } });
    } catch (e) {
      setData(before); fail(e);
    }
    setBusyId("");
  };

  const act = async (sv: Data, action: "archive" | "restore") => {
    if (action === "archive" && !(await ask(`Archive ${sv.name}?`, "It can no longer be booked. Bookings already made are kept, and you can restore it later.", "Archive", true))) return;
    setBusyId(sv.id); setNote(null);
    try {
      await s.mapi(`/services/${sv.id}/action`, { body: { action } });
      setForm(null);
      setNote({ kind: "ok", text: action === "archive" ? "Service archived. It can no longer be booked." : "Service restored. Clients can book it online again." });
      await refresh();
    } catch (e) {
      if (form) setFormError((e as Error).message); else fail(e);
    }
    setBusyId("");
  };

  const open = (sv?: Data) => {
    setFormError("");
    setForm(sv
      ? { id: sv.id, name: sv.name, category: sv.category, description: sv.description ?? "", duration: String(sv.duration_min), processing: String(sv.processing_min ?? 0), buffer: String(sv.buffer_min ?? 0), price: major(sv.price_cents), deposit: major(sv.deposit_cents ?? 0), online: !!sv.online, staff: ((sv.staff ?? []) as Data[]).map((x) => String(x.staff_id)) }
      : { id: "", name: "", category: shown || cats[0] || "", description: "", duration: "60", processing: "0", buffer: "0", price: "", deposit: "0", online: true, staff: staff.filter((x) => x.bookable).map((x) => String(x.id)) });
  };

  const save = async () => {
    if (!form) return;
    const price = toCents(form.price), deposit = toCents(form.deposit);
    const mins = [toInt(form.duration), toInt(form.processing), toInt(form.buffer)];
    if (price === null || deposit === null) { setFormError("Enter the price and the deposit as amounts, like 45 or 45.50."); return; }
    if (mins.some((n) => n === null)) { setFormError("Enter the times in whole minutes."); return; }
    const old = all.find((x) => x.id === form.id);
    const own = new Map<string, number | null>(((old?.staff ?? []) as Data[]).map((x) => [String(x.staff_id), x.price_cents as number | null]));
    const send = {
      name: form.name.trim(), category: form.category.trim(), description: form.description.trim(),
      duration_min: mins[0], processing_min: mins[1], buffer_min: mins[2], price_cents: price, deposit_cents: deposit, online: form.online,
      staff_ids: form.staff, staff_prices: Object.fromEntries(form.staff.map((id) => [id, own.get(id) ?? null])),
    };
    setSaving(true); setFormError("");
    try {
      if (form.id) await s.mapi(`/services/${form.id}`, { method: "PUT", body: send });
      else await s.mapi("/services", { body: send });
      setNote({ kind: "ok", text: form.id ? "Service saved." : "Service added." });
      setForm(null);
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
    }
    setSaving(false);
  };

  const set = (change: Partial<Form>) => setForm((x) => (x ? { ...x, ...change } : x));
  const top = { paddingTop: insets.top + 12, paddingHorizontal: pad } as const;
  const add = canEdit ? <SmallBtn kind="ink" icon="plus" onPress={() => open()}>Add</SmallBtn> : undefined;

  if (!data) {
    return (
      <View style={[{ flex: 1, backgroundColor: c.cream }, top]}>
        <Header title="Services" />
        {error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </View>
    );
  }

  const header = (
    <View>
      <Header title="Services" right={add} />
      {cats.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, marginHorizontal: -pad }} contentContainerStyle={{ gap: 8, paddingHorizontal: pad }}>
          <Chip on={!shown} onPress={() => setCat("")}>All</Chip>
          {cats.map((k) => <Chip key={k} on={shown === k} onPress={() => setCat(k)}>{k}</Chip>)}
        </ScrollView>
      ) : null}
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {!canEdit ? <View style={{ marginTop: 12 }}><Note kind="gold">You can read the menu here. Only a manager or the owner can change it, so ask one of them if something is wrong.</Note></View> : null}
      {!all.length ? (
        <View style={{ marginTop: 16 }}>
          <Empty title="No services yet" action={canEdit ? <Btn small onPress={() => open()} style={{ marginTop: 4 }}>Add your first service</Btn> : undefined}>Add a service with its price and length, and clients can book it online.</Empty>
        </View>
      ) : null}
    </View>
  );

  const footer = !canEdit ? null : (
    <View style={{ marginTop: 16 }}>
      <Card>
        <Item icon={<McIcon name="gift" />} title="Packages" sub="Sets of visits paid for up front" onPress={() => router.push("/m/packages" as never)} />
        <Item icon={<McIcon name="list" />} title="Memberships" sub="Monthly plans with discounts and included services" onPress={() => router.push("/m/memberships" as never)} />
        <Item icon={<McIcon name="percent" />} title="Pricing rules" sub="Peak and quiet prices" onPress={() => router.push("/m/pricing-rules" as never)} />
        <Item icon={<McIcon name="box" />} title="Rooms & chairs" sub="What a service needs besides a person" onPress={() => router.push("/m/staff/rooms" as never)} />
        <Item last icon={<McIcon name="doc" />} title="Questions at booking" sub="What clients are asked when they book" onPress={() => router.push("/m/questions" as never)} />
      </Card>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <SectionList
        sections={sections}
        keyExtractor={(x) => String(x.id)}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ ...top, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderSectionHeader={({ section }) => (
          <Grp right={canEdit && !section.archived && section.data.length > 1 ? (
            <Pressable accessibilityRole="button" onPress={() => setSorting(!sorting)} hitSlop={14}><Text style={{ fontFamily: f.semi, fontSize: 12, color: c.wine }}>{sorting ? "Done" : "Reorder"}</Text></Pressable>
          ) : undefined}>{section.title} · {section.data.length}</Grp>
        )}
        renderItem={({ item: sv, index, section }) => {
          const first = index === 0, last = index === section.data.length - 1;
          const busy = busyId === sv.id;
          return (
            <View style={[piece(first, last), { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 60, opacity: section.archived ? 0.75 : 1 }]}>
              {sorting && !section.archived ? <McIcon name="grab" size={16} color="#C9BCB0" /> : null}
              <Pressable accessibilityRole={canEdit ? "button" : undefined} accessibilityLabel={`${sv.name}, ${metaOf(sv)}, ${money(sv.price_cents, cur)}${canEdit ? ". Edit" : ""}`} disabled={!canEdit} onPress={() => open(sv)} style={{ flex: 1, minWidth: 0, minHeight: 36, justifyContent: "center" }}>
                <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{sv.name}</Text>
                <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{metaOf(sv)}</Text>
              </Pressable>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: f.bold, fontSize: 14, color: c.ink }}>{money(sv.price_cents, cur)}</Text>
                <Text style={{ fontFamily: f.medium, fontSize: 11, lineHeight: 15, color: c.muted }}>{Number(sv.deposit_cents) > 0 ? `${money(sv.deposit_cents, cur)} deposit` : "no deposit"}</Text>
              </View>
              {section.archived ? (canEdit ? <SmallBtn kind="out" busy={busy} onPress={() => act(sv, "restore")}>Restore</SmallBtn> : <Tag>Archived</Tag>)
                : sorting ? (
                  <Row gap={4}>
                    <ArrowBtn up disabled={first || busy} label={`Move ${sv.name} up`} onPress={() => move(sv, true)} />
                    <ArrowBtn disabled={last || busy} label={`Move ${sv.name} down`} onPress={() => move(sv, false)} />
                  </Row>
                ) : canEdit ? <Sw on={!!sv.online} disabled={busy} label={`${sv.name}: bookable online`} onPress={() => toggle(sv)} />
                : <Tag kind={sv.online ? "ok" : "grey"}>{sv.online ? "Online" : "Hidden"}</Tag>}
            </View>
          );
        }}
      />

      <Sheet tall open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit service" : "Add a service"}
        footer={<Btn busy={saving} onPress={save}>{form?.id ? "Save service" : "Add service"}</Btn>}>
        {form ? (
          <>
            {formError ? <Note kind="bad">{formError}</Note> : null}
            <Field label="Name" value={form.name} onChangeText={(name) => set({ name })} maxLength={80} placeholder="Knotless braids · medium" />
            <View style={{ gap: 8 }}>
              <Field label="Menu group" value={form.category} onChangeText={(category) => set({ category })} maxLength={40} placeholder="Braids, Nails, Add-ons" hint="Pick one you have, or type a new name to start a new group." />
              {cats.length ? <Row gap={8} wrap>{cats.map((k) => <Chip key={k} on={form.category.trim() === k} onPress={() => set({ category: k })}>{k}</Chip>)}</Row> : null}
            </View>
            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}><Field label="Length (min)" value={form.duration} onChangeText={(duration) => set({ duration })} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Field label="Processing (min)" value={form.processing} onChangeText={(processing) => set({ processing })} keyboardType="number-pad" /></View>
            </Row>
            <Field label="Clean-up time after (min)" value={form.buffer} onChangeText={(buffer) => set({ buffer })} keyboardType="number-pad" hint="Processing time is when the client waits and you are free. Clean-up time keeps the next booking from starting too soon." />
            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}><Field label={`Price (${symbol(cur)})`} value={form.price} onChangeText={(price) => set({ price })} keyboardType="decimal-pad" placeholder="0" /></View>
              <View style={{ flex: 1 }}><Field label={`Deposit (${symbol(cur)})`} value={form.deposit} onChangeText={(deposit) => set({ deposit })} keyboardType="decimal-pad" placeholder="0" /></View>
            </Row>
            <Field label="Description" value={form.description} onChangeText={(description) => set({ description })} multiline placeholder="What is included, in a sentence or two." />
            <Card>
              <Row style={{ paddingVertical: 13, paddingHorizontal: 16, minHeight: 56 }}>
                <View style={{ flex: 1 }}>
                  <T size={14} weight="semi">Bookable online</T>
                  <T size={12} muted>Off hides it from clients. You can still book it from the calendar.</T>
                </View>
                <Sw on={form.online} label="Bookable online" onPress={() => set({ online: !form.online })} />
              </Row>
            </Card>
            <View style={{ gap: 8 }}>
              <Label>Who performs it</Label>
              {staff.length ? (
                <Row gap={8} wrap>
                  {staff.map((p) => {
                    const on = form.staff.includes(String(p.id));
                    return (
                      <Pressable key={p.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${p.name}, ${p.level}`} onPress={() => set({ staff: on ? form.staff.filter((x) => x !== String(p.id)) : [...form.staff, String(p.id)] })}
                        style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingLeft: 8, paddingRight: 14, borderRadius: 999, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white }}>
                        <Avatar name={p.name} tone={p.tone} size={28} />
                        <Text style={{ fontFamily: f.semi, fontSize: 13, color: on ? c.cream : c.ink }}>{firstName(p.name)} · {p.level}</Text>
                      </Pressable>
                    );
                  })}
                </Row>
              ) : <T size={13} muted>There is nobody on the team yet.</T>}
              <T size={12} muted>{form.staff.length ? `${plural(form.staff.length, "person", "people")} chosen.` : "Nobody chosen means everyone who takes bookings."} A person&apos;s own price for a service is set on the web.</T>
            </View>
            {form.id ? <Btn kind="danger" busy={busyId === form.id} onPress={() => { const sv = all.find((x) => x.id === form.id); if (sv) void act(sv, "archive"); }}>Archive this service</Btn> : null}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

function ArrowBtn({ up, disabled, label, onPress }: { up?: boolean; disabled?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={4}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}>
      <McIcon name={up ? "up" : "down"} size={18} />
    </Pressable>
  );
}
