import { useFormReset } from "../lib/form-reset";
// The small jobs done on one product, each in a sheet from the bottom: adjust stock, move it between
// locations, reorder it, its ingredients and directions, and how much of it each service uses.
// Every one calls the same API route the web's Inventory tool calls, with the same fields.
import { useState } from "react";
import { Text, View } from "react-native";
import { Choice, Sheet } from "@/components/mc-kit";
import { Fine, NumBox } from "@/components/mf-kit";
import { Btn, Card, Chip, Field, Label, Note, Row } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { money } from "@/lib/format";
import { dateOnly } from "@/lib/mc-util";
import { dayFromNow, shelf, trim, whole } from "@/lib/mf-stock";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

type Common = { open: boolean; onClose: () => void; p: Data; onDone: (message: string) => void };

// ---------- adjust stock ----------

const MODES = {
  restock: { chip: "Delivery", title: "A delivery arrived", say: "Adds to stock.", reason: "restock", sign: 1, done: "Delivery added." },
  backbar: { chip: "Used in services", title: "Used in services", say: "Takes from stock, as back-bar use.", reason: "backbar", sign: -1, done: "Use recorded." },
  count: { chip: "Count", title: "I counted the shelf", say: "Sets stock to the number you counted.", reason: "count", sign: 0, done: "Count saved." },
  off: { chip: "Write off", title: "Write off", say: "Takes from stock: broken, lost, expired or given away.", reason: "adjust", sign: -1, done: "Stock corrected." },
  add: { chip: "Add back", title: "Add back", say: "Adds to stock without a delivery: found, or put back.", reason: "adjust", sign: 1, done: "Stock corrected." },
} as const;
type Mode = keyof typeof MODES;
const WHY = ["Broken", "Expired", "Lost", "Given away"];

export function AdjustSheet({ open, onClose, p, onDone, locations, startAt }: Common & { locations: Data[]; startAt?: string }) {
  const s = useSession();
  const multi = locations.length > 1;
  const main = locations.find((l) => l.is_primary) ?? locations[0];
  const [mode, setMode] = useState<Mode>("restock");
  const [at, setAt] = useState(""), [qty, setQty] = useState(""), [note, setNote] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useFormReset([open], () => { if (open) { setMode("restock"); setAt(startAt || String(main?.id ?? "")); setQty(""); setNote(""); setError(""); }   });

  const m = MODES[mode];
  const here = multi ? shelf(p, at) : Number(p.stock);
  const n = whole(qty);
  const after = n === null ? null : m.sign === 0 ? n : here + m.sign * n;
  const where = multi ? ` at ${locations.find((l) => l.id === at)?.name ?? "this location"}` : "";

  const save = async () => {
    if (n === null) { setError("Enter a number."); return; }
    if (mode !== "count" && n <= 0) { setError("Enter how many, above zero."); return; }
    setBusy(true); setError("");
    try {
      const out = await s.mapi<Data>(`/products/${p.id}/stock`, { body: { delta: mode === "off" ? -n : n, reason: m.reason, note: note.trim(), ...(multi && at ? { location_id: at } : {}) } });
      onDone(`${m.done} ${multi ? `There are ${out.here} at that location and ${out.stock} in all.` : `There are ${out.stock} in stock now.`}`);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Sheet tall open={open} onClose={onClose} title="Adjust stock" sub={`${p.name} · ${p.stock} in stock`} footer={<Btn busy={busy} onPress={save}>{m.sign === 0 ? "Save count" : "Save"}</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      <View style={{ gap: 8 }}>
        <Label>What happened</Label>
        <Row gap={8} wrap>{(Object.keys(MODES) as Mode[]).map((k) => <Chip key={k} on={mode === k} onPress={() => { setMode(k); setError(""); }}>{MODES[k].chip}</Chip>)}</Row>
        <Fine>{m.say}</Fine>
      </View>
      {multi ? (
        <View style={{ gap: 8 }}>
          <Label>At which location</Label>
          {locations.map((l) => <Choice key={l.id} title={`${l.name}${l.is_primary ? " (main)" : ""}`} sub={`${shelf(p, String(l.id))} there now`} on={at === l.id} onPress={() => setAt(String(l.id))} />)}
          <Fine>A delivery, a use, a correction or a count applies to this shelf only.</Fine>
        </View>
      ) : null}
      <Field label={m.sign === 0 ? "How many are on the shelf" : "How many"} value={qty} onChangeText={setQty} keyboardType="number-pad" placeholder="0" autoFocus
        hint={after === null ? `${here} in stock${where} now.` : after < 0 ? `That is more than the ${here} in stock${where}.` : `${here} in stock${where} now, ${after} after.`} />
      <View style={{ gap: 8 }}>
        <Field label={mode === "off" ? "Reason" : "Note"} value={note} onChangeText={setNote} maxLength={120} placeholder={mode === "off" ? "What happened to it" : "Optional"} />
        {mode === "off" ? <Row gap={8} wrap>{WHY.map((w) => <Chip key={w} on={note === w} onPress={() => setNote(w)}>{w}</Chip>)}</Row> : null}
      </View>
      <Fine>Every change is kept in this product&apos;s stock history with who made it, the time and the note.</Fine>
    </Sheet>
  );
}

// ---------- move between locations ----------

export function MoveSheet({ open, onClose, p, onDone, locations, startAt }: Common & { locations: Data[]; startAt?: string }) {
  const s = useSession();
  const main = locations.find((l) => l.is_primary) ?? locations[0];
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [qty, setQty] = useState(""), [note, setNote] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useFormReset([open], () => {
    if (!open) return;
    const first = (startAt && shelf(p, startAt) > 0 ? locations.find((l) => l.id === startAt) : undefined) ?? locations.find((l) => shelf(p, String(l.id)) > 0) ?? main;
    setFrom(String(first?.id ?? "")); setTo(String((locations.find((l) => l.id !== first?.id) ?? main)?.id ?? "")); setQty(""); setNote(""); setError("");
     
  });

  const have = shelf(p, from), n = whole(qty);
  const save = async () => {
    if (from === to) { setError("Choose two different locations."); return; }
    if (n === null || n <= 0) { setError("Enter how many to move, above zero."); return; }
    setBusy(true); setError("");
    try {
      await s.mapi(`/products/${p.id}/transfer`, { body: { from_location_id: from, to_location_id: to, qty: n, note: note.trim() } });
      onDone(`${n} moved. The total in stock is the same.`);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Sheet tall open={open} onClose={onClose} title="Move stock" sub={`${p.name} · ${p.stock} in all`} footer={<Btn busy={busy} onPress={save}>Move</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      <View style={{ gap: 8 }}>
        <Label>From</Label>
        {locations.map((l) => <Choice key={l.id} title={String(l.name)} sub={`${shelf(p, String(l.id))} there`} on={from === l.id} onPress={() => { setFrom(String(l.id)); if (to === l.id) setTo(String(locations.find((x) => x.id !== l.id)?.id ?? "")); }} />)}
      </View>
      <View style={{ gap: 8 }}>
        <Label>To</Label>
        {locations.filter((l) => l.id !== from).map((l) => <Choice key={l.id} title={String(l.name)} sub={`${shelf(p, String(l.id))} there`} on={to === l.id} onPress={() => setTo(String(l.id))} />)}
      </View>
      <Field label="How many" value={qty} onChangeText={setQty} keyboardType="number-pad" placeholder="0" hint={n !== null && n > have ? `Only ${have} there to move.` : `${have} at ${locations.find((l) => l.id === from)?.name ?? "that location"} to move.`} />
      <Field label="Note" value={note} onChangeText={setNote} maxLength={120} placeholder="Optional" />
      <Fine>Moving stock changes where it sits, not how much you have. It is refused when the first location does not hold that many.</Fine>
    </Sheet>
  );
}

// ---------- reorder ----------

const EXPECT: [number, string][] = [[0, "Not known"], [3, "In 3 days"], [7, "In a week"], [14, "In 2 weeks"]];

export function ReorderSheet({ open, onClose, p, onDone, cur, tz }: Common & { cur: string; tz?: string }) {
  const s = useSession();
  const [qty, setQty] = useState(""), [days, setDays] = useState(0);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useFormReset([open], () => { if (open) { setQty(String(Math.max(1, Number(p.reorder_at) * 2 - Number(p.stock)))); setDays(0); setError(""); }   });

  const n = whole(qty);
  const save = async () => {
    if (n === null || n <= 0) { setError("Enter how many to order, above zero."); return; }
    setBusy(true); setError("");
    try {
      const out = await s.mapi<Data>("/purchase-orders", { body: { supplier_id: p.supplier_id ?? "", expected_on: days ? dayFromNow(days, tz) : "", items: [{ product_id: p.id, qty: n }] } });
      onDone(`Draft ${out.ref} saved. Mark it as ordered once you have placed it with the supplier.`);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Reorder" sub={`${p.name} · ${p.stock} in stock, reorder at ${p.reorder_at}`} footer={<Btn busy={busy} onPress={save}>Save draft order</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      <Field label="How many" value={qty} onChangeText={setQty} keyboardType="number-pad" selectTextOnFocus
        hint={`Costs ${money(p.cost_cents, cur)} each at the last price${n ? `, ${money(n * Number(p.cost_cents), cur)} in all` : ""}.`} />
      <View style={{ gap: 8 }}>
        <Label>Expected</Label>
        <Row gap={8} wrap>{EXPECT.map(([d, name]) => <Chip key={d} on={days === d} onPress={() => setDays(d)}>{name}</Chip>)}</Row>
        {days ? <Fine>{dateOnly(dayFromNow(days, tz))}</Fine> : null}
      </View>
      <Fine>This saves a draft order{p.supplier ? ` to ${p.supplier}` : " without a supplier"}. LogaLuxe does not send it: place it with the supplier yourself, then mark it as ordered.</Fine>
    </Sheet>
  );
}

// ---------- ingredients and directions ----------

export function DetailsSheet({ open, onClose, p, onDone, details }: Common & { details: Data | null }) {
  const s = useSession();
  const [ingredients, setIngredients] = useState(""), [how, setHow] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useFormReset([open], () => { if (open) { setIngredients(String(details?.extras?.ingredients ?? "")); setHow(String(details?.product?.how_to_use ?? "")); setError(""); }   });

  const save = async () => {
    setBusy(true); setError("");
    try {
      await s.mapi(`/products/${p.id}/details`, { method: "PUT", body: { ingredients: ingredients.trim(), how_to_use: how.trim() } });
      onDone("Saved. The product page in the shop shows this now.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Sheet tall open={open} onClose={onClose} title="Ingredients and directions" sub={String(p.name)} footer={<Btn busy={busy} onPress={save}>Save</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      <Field label="Ingredients" value={ingredients} onChangeText={setIngredients} multiline maxLength={3000} placeholder="As listed on the label" style={{ minHeight: 120 }} />
      <Field label="How to use" value={how} onChangeText={setHow} multiline maxLength={3000} placeholder="How much, how often, and what to avoid" style={{ minHeight: 120 }} />
      <Fine>Shown on this product&apos;s page in the shop. Up to 3,000 characters each. Leave a box empty to show nothing.</Fine>
    </Sheet>
  );
}

// ---------- how much each service uses ----------

export function UsesSheet({ open, onClose, p, onDone, services }: Common & { services: Data[] }) {
  const s = useSession();
  const [use, setUse] = useState<Record<string, string>>({});
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useFormReset([open], () => {
    if (open) { setUse(Object.fromEntries(((p.used_in ?? []) as Data[]).map((u) => [String(u.service_id), trim(Number(u.qty))]))); setError(""); }
     
  });

  const save = async () => {
    const items: { service_id: string; qty: number }[] = [];
    for (const [id, text] of Object.entries(use)) {
      const t = text.trim().replace(",", ".");
      if (t === "") continue;
      const qty = Number(t);
      if (!Number.isFinite(qty) || qty < 0 || qty > 100) { setError("The amount used must be a number above zero, at most 100."); return; }
      if (qty > 0) items.push({ service_id: id, qty });
    }
    setBusy(true); setError("");
    try {
      await s.mapi(`/products/${p.id}/services`, { method: "PUT", body: { items } });
      onDone("Saved. Checkout takes this off the shelf as each service is paid for.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const used = Object.values(use).filter((x) => Number(x.replace(",", ".")) > 0).length;
  return (
    <Sheet open={open} onClose={onClose} title="Used in services" sub={String(p.name)} footer={<Btn busy={busy} onPress={save}>Save what it is used in</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      <Fine>Say how much of one unit each service uses, for example 0.1 for a tenth of a bottle. Checkout takes it off the shelf as each service is paid for. Part-used units are remembered, so the count drops by one when a whole unit is gone.</Fine>
      <Card>
        {services.map((sv, i) => (
          <View key={sv.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 16, minHeight: 60, borderBottomWidth: i === services.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{sv.name}</Text>
              <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{sv.category}</Text>
            </View>
            <NumBox label={`Units of ${p.name} used by ${sv.name}`} keyboardType="decimal-pad" placeholder="0" value={use[String(sv.id)] ?? ""} changed={!!(use[String(sv.id)] ?? "").trim() && Number(use[String(sv.id)]) > 0}
              onChangeText={(t) => setUse((x) => ({ ...x, [String(sv.id)]: t }))} />
          </View>
        ))}
      </Card>
      <Fine>{used === 1 ? "1 service uses this product." : `${used} services use this product.`}</Fine>
    </Sheet>
  );
}
