// The fields of a product: the same for a new one and for one being changed (the web's ProductFields).
// Stock itself is not a field of a saved product: it changes through "Adjust stock", so every change is on record.
// A product sold online can also be sent to the customer (`shipping`, `shipping_cents`); pick-up is always offered.
import { View } from "react-native";
import { Choice, Sw } from "@/components/mc-kit";
import { Fine, Line } from "@/components/mf-kit";
import { Card, Chip, Field, Label, Row } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { major, symbol, toCents } from "@/lib/mc-util";
import { CATEGORY, KIND, KIND_SUB, sells, whole } from "@/lib/mf-stock";

export type ProductDraft = { name: string; sku: string; kind: string; category: string; description: string; price: string; cost: string; stock: string; reorder: string; par: string; supplier: string; online: boolean; ships: boolean; shipCost: string };

export const draftOf = (p?: Data | null): ProductDraft => ({
  name: p?.name ?? "", sku: p?.sku ?? "", kind: p?.kind ?? "retail", category: p?.category ?? "hair", description: p?.description ?? "",
  price: p && sells(p) ? major(p.price_cents) : "", cost: p && Number(p.cost_cents) ? major(p.cost_cents) : "", stock: "0",
  reorder: String(p?.reorder_at ?? 0), par: p && Number(p.par_level) > 0 ? String(p.par_level) : "", supplier: p?.supplier_id ?? "", online: p ? !!p.active && sells(p) : true,
  ships: !!p?.shipping, shipCost: p && Number(p.shipping_cents) > 0 ? major(p.shipping_cents) : "",
});

/** What the API takes for a product, or the sentence that says what is wrong with the form. */
export function bodyOf(v: ProductDraft, isNew: boolean): { body?: Record<string, unknown>; error?: string } {
  const backbar = v.kind === "backbar";
  const name = v.name.trim();
  if (name.length < 2 || name.length > 100) return { error: "The product needs a name of 2 to 100 characters." };
  const price = backbar ? 0 : toCents(v.price), cost = toCents(v.cost);
  if (price === null || cost === null) return { error: "Enter the cost and the price as amounts, like 45 or 45.50." };
  if (!backbar && price <= 0) return { error: "A product you sell needs a price above zero." };
  const reorder = v.reorder.trim() === "" ? 0 : whole(v.reorder), par = v.par.trim() === "" ? undefined : whole(v.par), stock = v.stock.trim() === "" ? 0 : whole(v.stock);
  if (reorder === null || par === null || stock === null) return { error: "Enter stock levels in whole numbers." };
  // Sending is asked about only for a product sold online. Otherwise both are left out, and what is saved stays.
  const online = !backbar && v.online, shipCost = toCents(v.shipCost);
  if (online && v.ships && shipCost === null) return { error: "Enter the delivery price as an amount, like 5 or 5.50, or leave it empty to send it free." };
  return {
    body: {
      ...(!online ? {} : v.ships ? { shipping: true, shipping_cents: shipCost } : { shipping: false }),
      ...(par === undefined ? {} : { par_level: par }), // left empty, the full shelf that is saved stays
      name, sku: v.sku.trim(), kind: v.kind, category: v.category || "hair", description: v.description.trim(),
      price_cents: price, cost_cents: cost, reorder_at: reorder, supplier_id: v.supplier, online: !backbar && v.online,
      ...(isNew ? { stock } : {}),
    },
  };
}

export function ProductFields({ v, set, suppliers, cur, isNew, inStock }: { v: ProductDraft; set: (change: Partial<ProductDraft>) => void; suppliers: Data[]; cur: string; isNew: boolean; inStock?: number }) {
  const backbar = v.kind === "backbar", online = !backbar && v.online;
  return (
    <View style={{ gap: 14 }}>
      <Field label="Name" value={v.name} onChangeText={(name) => set({ name })} maxLength={100} placeholder="Hair growth oil" />

      <View style={{ gap: 8 }}>
        <Label>Type</Label>
        {(["retail", "backbar", "both"] as const).map((k) => <Choice key={k} title={KIND[k]} sub={KIND_SUB[k]} on={v.kind === k} onPress={() => set({ kind: k })} />)}
      </View>

      <Row gap={10} style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}><Field label={`Cost (${symbol(cur)})`} value={v.cost} onChangeText={(cost) => set({ cost })} keyboardType="decimal-pad" placeholder="0" /></View>
        <View style={{ flex: 1 }}>
          {backbar
            ? <Field label={`Retail price (${symbol(cur)})`} value="" editable={false} placeholder="Not sold" />
            : <Field label={`Retail price (${symbol(cur)})`} value={v.price} onChangeText={(price) => set({ price })} keyboardType="decimal-pad" placeholder="0" />}
        </View>
      </Row>

      <Row gap={10} style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          {isNew
            ? <Field label="In stock now" value={v.stock} onChangeText={(stock) => set({ stock })} keyboardType="number-pad" selectTextOnFocus />
            : <Field label="In stock" value={String(inStock ?? 0)} editable={false} />}
        </View>
        <View style={{ flex: 1 }}><Field label="Reorder at" value={v.reorder} onChangeText={(reorder) => set({ reorder })} keyboardType="number-pad" selectTextOnFocus /></View>
      </Row>
      <Row gap={10} style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}><Field label="Full shelf" value={v.par} onChangeText={(par) => set({ par })} keyboardType="number-pad" placeholder="Not set" /></View>
        <View style={{ flex: 1 }}><Field label="SKU" value={v.sku} onChangeText={(sku) => set({ sku })} maxLength={40} autoCapitalize="characters" autoCorrect={false} /></View>
      </Row>
      <Fine>{isNew ? "" : "Stock is changed with Adjust stock, so every change is on record. "}The reorder level is when it shows as low: 0 switches that off. Full shelf is how many you hold when fully stocked, and sets the scale of the stock meter.</Fine>

      <View style={{ gap: 8 }}>
        <Label>Category</Label>
        <Row gap={8} wrap>{Object.entries(CATEGORY).map(([k, name]) => <Chip key={k} on={v.category === k} onPress={() => set({ category: k })}>{name}</Chip>)}</Row>
      </View>

      <View style={{ gap: 8 }}>
        <Label>Supplier</Label>
        <Row gap={8} wrap>
          <Chip on={!v.supplier} onPress={() => set({ supplier: "" })}>No supplier</Chip>
          {suppliers.map((su) => <Chip key={su.id} on={v.supplier === su.id} onPress={() => set({ supplier: String(su.id) })}>{String(su.name)}</Chip>)}
        </Row>
        {!suppliers.length ? <Fine>Add suppliers from Inventory, then a product can name the one you buy it from.</Fine> : null}
      </View>

      <Field label="Description" value={v.description} onChangeText={(description) => set({ description })} multiline maxLength={2000} placeholder="What it is and who it is for, in a sentence or two." />

      <Card>
        <Line last={!online} title="Sell online" sub={backbar ? "A back-bar product has no price and is never sold online." : "In the LogaLuxe shop and on your booking page."}
          right={<Sw on={!backbar && v.online} disabled={backbar} label="Sell online" onPress={() => set({ online: !v.online })} />} />
        {online ? (
          <Line last title="Can be sent to the customer" sub={v.ships ? "The customer chooses pick-up or delivery." : "Off means pick-up only. Pick-up from you is always offered."}
            right={<Sw on={v.ships} label="Can be sent to the customer" onPress={() => set({ ships: !v.ships })} />} />
        ) : null}
      </Card>
      {online && v.ships ? (
        <>
          <Field label={`Delivery price (${symbol(cur)})`} value={v.shipCost} onChangeText={(shipCost) => set({ shipCost })} keyboardType="decimal-pad" placeholder="Free" hint="What sending one order costs the customer. Leave it empty to send it free." />
          <Fine>The delivery price is charged once on an order, however many of your products are in it. When an order holds several of them, the first one in the customer&apos;s cart sets the price. A customer can choose delivery only when every product of yours in their cart can be sent.</Fine>
        </>
      ) : null}
    </View>
  );
}
