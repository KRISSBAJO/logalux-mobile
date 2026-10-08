// Purchase orders: the business's own record of what it ordered from suppliers. A draft is marked as
// ordered once it is placed, and received into stock when the delivery arrives. LogaLuxe sends nothing
// to a supplier. The orders come with GET /v1/m/inventory (the last 12), as on the web.
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Choice, Header, Sheet, SmallBtn, Tag } from "@/components/mc-kit";
import { Blank, Fine, NumBox, Said, SearchBox, useRefocus } from "@/components/mf-kit";
import { Btn, Card, Chip, Empty, Label, Note, Row, Screen } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { DENIED, ask, dateOnly, orDenied, signedIn } from "@/lib/mc-util";
import { PO, dateMed, dayFromNow, isLow, whole } from "@/lib/mf-stock";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const DONE: Record<string, string> = { order: "Marked as ordered. Receive it when the delivery arrives.", receive: "Delivery received. Every line was added to stock.", cancel: "Order cancelled." };
const EXPECT: [number, string][] = [[0, "Not known"], [3, "In 3 days"], [7, "In a week"], [14, "In 2 weeks"]];

export default function PurchaseOrders() {
  const s = useSession();
  const cur = (s.merchant?.currency as string) ?? "USD", tz = s.merchant?.timezone as string | undefined;
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/inventory"))), [s.businessToken]);
  useRefocus(refresh, !!s.businessToken);

  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string; at?: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [receiving, setReceiving] = useState<Data | null>(null), [into, setInto] = useState("");
  const [making, setMaking] = useState(false), [supplier, setSupplier] = useState(""), [days, setDays] = useState(0), [qty, setQty] = useState<Record<string, string>>({}), [q, setQ] = useState(""), [formError, setFormError] = useState("");

  const d = data && data !== DENIED ? data : null;
  const all = useMemo(() => ((d?.products ?? []) as Data[]).slice().sort((a, b) => (Number(isLow(b)) - Number(isLow(a))) || String(a.name).localeCompare(String(b.name))), [d]);
  if (!d) return <Blank title="Purchase orders" error={error} onRetry={reload} denied={data === DENIED} what="Orders to suppliers belong to a manager or the owner." />;

  const orders = (d.orders ?? []) as Data[], suppliers = (d.suppliers ?? []) as Data[], locations = (d.locations ?? []) as Data[];
  const multi = locations.length > 1, main = locations.find((l) => l.is_primary) ?? locations[0];
  const low = all.filter(isLow), draft = orders.find((o) => o.status === "draft");

  const act = async (o: Data, action: "order" | "receive" | "cancel", locationId?: string) => {
    setBusy(o.id + action); setNote(null);
    try {
      await s.mapi(`/purchase-orders/${o.id}`, { body: { action, ...(locationId ? { location_id: locationId } : {}) } });
      const where = action === "receive" && multi ? locations.find((l) => l.id === (locationId || main?.id))?.name : "";
      setNote({ kind: "ok", text: where ? `Delivery received. Every line was added to stock at ${where}.` : DONE[action], at: String(o.id) });
      setReceiving(null);
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message, at: String(o.id) });
      setReceiving(null);
    }
    setBusy("");
  };

  const receive = async (o: Data) => {
    if (multi) { setInto(String(main?.id ?? "")); setReceiving(o); return; }
    if (await ask(`Receive ${o.ref}?`, "Every line is added to stock.", "Receive")) await act(o, "receive");
  };
  const cancel = async (o: Data) => { if (await ask(`Cancel ${o.ref}?`, "The order is kept on record as cancelled. Stock does not change.", "Cancel order", true)) await act(o, "cancel"); };

  const suggest = async () => {
    setBusy("suggest"); setNote(null);
    try {
      const out = await s.mapi<Data>("/purchase-orders", { body: { suggest: true, supplier_id: "" } });
      setNote({ kind: "ok", text: `Draft ${out.ref} is ready with ${plural(Number(out.items), "product")}. Check it below, then mark it as ordered.` });
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  const startNew = () => { setSupplier(""); setDays(0); setQty({}); setQ(""); setFormError(""); setMaking(true); };
  const lines = all.map((p) => ({ p, n: whole(qty[String(p.id)] ?? "") })).filter((x) => (qty[String(x.p.id)] ?? "").trim() !== "");
  const total = lines.reduce((sum, x) => sum + (x.n ?? 0) * Number(x.p.cost_cents), 0);
  const create = async () => {
    if (lines.some((x) => x.n === null)) { setFormError("Quantities are whole numbers."); return; }
    const items = lines.filter((x) => (x.n ?? 0) > 0).map((x) => ({ product_id: x.p.id, qty: x.n }));
    if (!items.length) { setFormError("Enter a quantity for at least one product."); return; }
    setBusy("create"); setFormError("");
    try {
      const out = await s.mapi<Data>("/purchase-orders", { body: { supplier_id: supplier, expected_on: days ? dayFromNow(days, tz) : "", items } });
      setMaking(false);
      setNote({ kind: "ok", text: `Draft ${out.ref} saved. Mark it as ordered once you have placed it with the supplier.` });
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
    }
    setBusy("");
  };
  const word = q.trim().toLowerCase();
  const pick = all.filter((p) => !word || String(p.name).toLowerCase().includes(word) || String(p.sku ?? "").toLowerCase().includes(word));

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} footer={note ? <Said note={note} onClose={() => setNote(null)} /> : undefined}>
      <Header title="Purchase orders" size={24} right={all.length ? <SmallBtn kind="ink" icon="plus" onPress={startNew}>New</SmallBtn> : undefined} />

      {low.length && !draft ? (
        <Card style={{ marginTop: 14, padding: 16, gap: 10, backgroundColor: c.goldBg, borderColor: "#E8D9B4" }}>
          <Text style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.ink }}>
            <Text style={{ fontFamily: f.semi }}>{plural(low.length, "product")}</Text> {low.length === 1 ? "is" : "are"} at or below {low.length === 1 ? "its" : "their"} reorder level. A draft order can cover about four weeks at the pace of the last 30 days.
          </Text>
          <SmallBtn kind="ink" busy={busy === "suggest"} onPress={suggest} style={{ alignSelf: "flex-start" }}>Draft order from low stock</SmallBtn>
        </Card>
      ) : null}

      <View style={{ marginTop: 16, gap: 10 }}>
        {orders.length ? orders.map((o) => {
          const items = (o.items ?? []) as Data[], st = PO[o.status] ?? { label: String(o.status), kind: "grey" as const };
          const when = o.status === "received" && o.received_at ? `received ${dateMed(o.received_at, tz)}` : o.status === "ordered" && o.expected_on ? `expected ${dateOnly(o.expected_on)}` : `made ${dateMed(o.created_at, tz)}`;
          const openOrder = o.status === "draft" || o.status === "ordered";
          return (
            <Card key={o.id} style={{ padding: 16, gap: 12, opacity: openOrder ? 1 : 0.85 }}>
              <Row between gap={10} style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text accessibilityRole="header" style={{ fontFamily: f.semi, fontSize: 15, lineHeight: 21, color: c.ink }}>{o.supplier ?? "No supplier"}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.muted }}>{o.ref} · {plural(items.length, "item")} · {when}</Text>
                </View>
                <Tag kind={st.kind}>{st.label}</Tag>
              </Row>
              <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10, gap: 6 }}>
                {items.map((i, n) => (
                  <Row key={n} between gap={10} style={{ alignItems: "flex-start" }}>
                    <Text style={{ flex: 1, fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.ink }}>{i.name}</Text>
                    <Text style={{ fontFamily: f.medium, fontSize: 14, lineHeight: 20, color: c.muted }}>{i.qty} × {money(i.cost_cents, cur)}</Text>
                  </Row>
                ))}
                <Row between style={{ marginTop: 4 }}>
                  <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>Total</Text>
                  <Text style={{ fontFamily: f.bold, fontSize: 16, color: c.ink }}>{money(o.total_cents, cur)}</Text>
                </Row>
              </View>
              {openOrder ? (
                <Row gap={8} wrap>
                  {o.status === "draft" ? <SmallBtn kind="ink" busy={busy === o.id + "order"} onPress={() => act(o, "order")}>Mark as ordered</SmallBtn> : null}
                  <SmallBtn kind={o.status === "ordered" ? "ink" : "out"} busy={busy === o.id + "receive"} onPress={() => receive(o)}>Receive into stock</SmallBtn>
                  <SmallBtn kind="danger" busy={busy === o.id + "cancel"} onPress={() => cancel(o)}>Cancel order</SmallBtn>
                </Row>
              ) : null}
            </Card>
          );
        }) : <Empty title="No orders yet" action={all.length ? <Btn small onPress={startNew} style={{ marginTop: 4 }}>Start an order</Btn> : undefined}>{all.length ? "Draft one from low stock, or start a new order." : "Add products in Inventory first, then order them here."}</Empty>}
        <Fine>Orders are your own record. LogaLuxe does not send them to suppliers or pay for them. The last 12 are shown.</Fine>
      </View>

      <Sheet open={!!receiving} onClose={() => setReceiving(null)} title={`Receive ${receiving?.ref ?? ""}`} sub="Every line is added to stock at the location you choose."
        footer={<Btn busy={!!receiving && busy === receiving.id + "receive"} onPress={() => receiving && act(receiving, "receive", into)}>Receive into stock</Btn>}>
        {locations.map((l) => <Choice key={l.id} title={`${l.name}${l.is_primary ? " (main)" : ""}`} sub={`${plural(Number(l.units), "unit")} there now`} on={into === l.id} onPress={() => setInto(String(l.id))} />)}
        <Fine>Use Move on a product afterwards for anything that belongs elsewhere.</Fine>
      </Sheet>

      <Sheet tall open={making} onClose={() => setMaking(false)} title="New purchase order" sub="Saved as a draft. Nothing is sent to the supplier."
        footer={<Btn busy={busy === "create"} onPress={create}>{total > 0 ? `Save draft order · ${money(total, cur)}` : "Save draft order"}</Btn>}>
        {formError ? <Note kind="bad">{formError}</Note> : null}
        <View style={{ gap: 8 }}>
          <Label>Supplier</Label>
          <Row gap={8} wrap>
            <Chip on={!supplier} onPress={() => setSupplier("")}>No supplier</Chip>
            {suppliers.map((su) => <Chip key={su.id} on={supplier === su.id} onPress={() => setSupplier(String(su.id))}>{String(su.name)}</Chip>)}
          </Row>
        </View>
        <View style={{ gap: 8 }}>
          <Label>Expected</Label>
          <Row gap={8} wrap>{EXPECT.map(([n, name]) => <Chip key={n} on={days === n} onPress={() => setDays(n)}>{name}</Chip>)}</Row>
          {days ? <Fine>{dateOnly(dayFromNow(days, tz))}</Fine> : null}
        </View>
        <View style={{ gap: 8 }}>
          <Label>How many of each</Label>
          {all.length > 8 ? <SearchBox value={q} onChange={setQ} placeholder="Product or SKU" /> : null}
          <Card>
            {pick.map((p, i) => {
              const key = String(p.id), text = qty[key] ?? "";
              return (
                <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 16, minHeight: 64, borderBottomWidth: i === pick.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{p.name}</Text>
                    <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: isLow(p) ? c.wine : c.muted }}>{[`${p.stock} in stock${isLow(p) ? ", low" : ""}`, money(p.cost_cents, cur), supplier && p.supplier_id !== supplier ? (p.supplier ?? "no supplier") : ""].filter(Boolean).join(" · ")}</Text>
                  </View>
                  <NumBox label={`Quantity: ${p.name}`} value={text} placeholder="0" changed={(whole(text) ?? 0) > 0} onChangeText={(t) => setQty((x) => ({ ...x, [key]: t }))} />
                </View>
              );
            })}
            {!pick.length ? <View style={{ padding: 16 }}><Text style={{ fontFamily: f.body, fontSize: 14, color: c.muted }}>No products match.</Text></View> : null}
          </Card>
        </View>
      </Sheet>
    </Screen>
  );
}
