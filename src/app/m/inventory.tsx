// Inventory: what the business sells and uses, how much is left, and what needs ordering.
// One call (GET /v1/m/inventory) gives every product, so searching and filtering happen on the phone.
// The web's Inventory tool is the model; what needs doing (out of stock, low) is listed first.
import { router } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Grp, Header, Item, McIcon, SmallBtn, Tag, mc, piece } from "@/components/mc-kit";
import { Blank, ChipRow, CountChip, Fine, Kv, Meter, MfIcon, Night, SearchBox, Thumb, useRefocus } from "@/components/mf-kit";
import { Btn, Card, Empty, IconButton, Note, Row } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { DENIED, orDenied, signedIn } from "@/lib/mc-util";
import { CATEGORY, byUrgency, isLow, isOut, meterOf, onOrderIds, pct, sells, shelf, stockState } from "@/lib/mf-stock";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const FILTERS: [string, string][] = [["", "All"], ["low", "Low stock"], ["out", "Out of stock"], ["retail", "Retail"], ["backbar", "Back-bar"], ["online", "Sold online"], ["off", "Not sold online"]];
const MATCH: Record<string, (p: Data) => boolean> = {
  "": () => true, low: isLow, out: isOut, retail: (p) => p.kind !== "backbar", backbar: (p) => p.kind !== "retail", online: (p) => !!p.active && p.kind !== "backbar", off: (p) => !p.active,
};

export default function Inventory() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const cur = (s.merchant?.currency as string) ?? "USD";
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/inventory"))), [s.businessToken]);
  useRefocus(refresh, !!s.businessToken);

  const [q, setQ] = useState(""), [filter, setFilter] = useState(""), [at, setAt] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [drafting, setDrafting] = useState(false);

  const d = data && data !== DENIED ? data : null;
  const all = useMemo(() => ((d?.products ?? []) as Data[]), [d]);
  const orders = useMemo(() => ((d?.orders ?? []) as Data[]), [d]);
  const locations = useMemo(() => ((d?.locations ?? []) as Data[]), [d]);
  const multi = locations.length > 1;
  const loc = multi ? locations.find((l) => l.id === at) : undefined;
  const onOrder = useMemo(() => onOrderIds(orders), [orders]);
  const top = useMemo(() => Math.max(1, ...all.map((p) => Number(p.stock))), [all]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([id]) => [id, all.filter(MATCH[id]).length])), [all]);
  const shown = useMemo(() => {
    const word = q.trim().toLowerCase();
    return all.filter(MATCH[filter] ?? MATCH[""]).filter((p) => !word || String(p.name).toLowerCase().includes(word) || String(p.sku ?? "").toLowerCase().includes(word)).sort(byUrgency);
  }, [all, q, filter]);

  if (!d) return <Blank title="Inventory" error={error} onRetry={reload} denied={data === DENIED} what="Stock, suppliers and orders to them belong to a manager or the owner." />;

  const k = d.kpis as Data;
  const low = all.filter(isLow).sort(byUrgency);
  const draft = orders.find((o) => o.status === "draft");
  const open = orders.filter((o) => o.status === "draft" || o.status === "ordered").length;
  const month = String(d.month_label ?? "this month");

  const draftOrder = async () => {
    setDrafting(true); setNote(null);
    try {
      const out = await s.mapi<Data>("/purchase-orders", { body: { suggest: true, supplier_id: "" } });
      setNote({ kind: "ok", text: `Draft ${out.ref} is ready with ${plural(Number(out.items), "product")}. Check it under Purchase orders, then mark it as ordered.` });
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setDrafting(false);
  };

  const header = (
    <View>
      <Header title="Inventory" right={<IconButton dark icon="plus" label="Add a product" onPress={() => router.push("/m/product/new" as never)} />} />
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}

      {all.length ? (
        <Night style={{ marginTop: 14 }}>
          <Row between style={{ alignItems: "flex-start" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: mc.nightMuted }}>Stock value</Text>
              <Text accessibilityRole="header" style={{ fontFamily: f.serif, fontSize: 34, lineHeight: 40, color: mc.onNight, marginTop: 2 }}>{money(k.stock_value_cents, cur)}</Text>
              <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: mc.nightMuted }}>at cost · {plural(Number(k.products), "product")}{multi ? ` · ${plural(locations.length, "location")}` : ""}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontFamily: f.serif, fontSize: 34, lineHeight: 40, color: low.length ? c.gold : mc.onNight }}>{low.length}</Text>
              <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: mc.nightMuted }}>low stock</Text>
            </View>
          </Row>
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,.12)", marginVertical: 14 }} />
          <Text style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: mc.onNight }}>
            {low.length
              ? `${low.slice(0, 3).map((p) => `${p.name} (${p.stock} left)`).join(", ")}${low.length > 3 ? ` and ${low.length - 3} more` : ""} ${low.length === 1 ? "is" : "are"} at or below ${low.length === 1 ? "its" : "their"} reorder level. ${draft ? `Draft ${draft.ref} for ${money(draft.total_cents, cur)} is waiting under Purchase orders.` : "A draft order can cover about four weeks at the pace of the last 30 days."}`
              : "Nothing is at its reorder level. Stock is in hand."}
          </Text>
          {low.length ? (
            <Row gap={8} style={{ marginTop: 14 }}>
              {draft ? <SmallBtn kind="gold" onPress={() => router.push("/m/purchase-orders" as never)}>Review order</SmallBtn> : <SmallBtn kind="gold" busy={drafting} onPress={draftOrder}>Draft order</SmallBtn>}
              <SmallBtn kind="ghost" onPress={() => { setFilter("low"); setQ(""); }}>Show low stock</SmallBtn>
            </Row>
          ) : null}
        </Night>
      ) : null}

      <ChipRow style={{ marginTop: 14 }}>
        {all.length ? <Tool icon={<MfIcon name="count" size={16} />} onPress={() => router.push(("/m/stock-count" + (loc ? `?location=${loc.id}` : "")) as never)}>Stock count</Tool> : null}
        <Tool icon={<McIcon name="doc" size={16} />} onPress={() => router.push("/m/purchase-orders" as never)}>{open ? `Purchase orders · ${open} open` : "Purchase orders"}</Tool>
        <Tool icon={<MfIcon name="truck" size={16} />} onPress={() => router.push("/m/suppliers" as never)}>Suppliers</Tool>
      </ChipRow>

      {all.length ? (
        <>
          <View style={{ marginTop: 16 }}><SearchBox value={q} onChange={setQ} placeholder="Product or SKU" /></View>
          {multi ? (
            <>
              <ChipRow style={{ marginTop: 10 }}>
                <CountChip on={!loc} onPress={() => setAt("")}>All locations</CountChip>
                {locations.map((l) => <CountChip key={l.id} on={loc?.id === l.id} onPress={() => setAt(String(l.id))}>{String(l.name)}</CountChip>)}
              </ChipRow>
              {loc ? <Fine style={{ marginTop: 8 }}>{loc.name}{loc.is_primary ? " (main)" : ""}: {plural(Number(loc.units), "unit")} · {money(loc.value_cents, cur)} at cost. The numbers below are what sits on this shelf.</Fine> : null}
            </>
          ) : null}
          <ChipRow style={{ marginTop: 10 }}>
            {FILTERS.map(([id, name]) => <CountChip key={id} n={counts[id]} on={filter === id} onPress={() => setFilter(id)}>{name}</CountChip>)}
          </ChipRow>
          <Grp>{filter || q.trim() ? `${plural(shown.length, "product")} of ${all.length}` : plural(all.length, "product")}</Grp>
        </>
      ) : (
        <View style={{ marginTop: 16 }}>
          <Empty title="No products yet" action={<Btn small onPress={() => router.push("/m/product/new" as never)} style={{ marginTop: 4 }}>Add your first product</Btn>}>Add what you sell and what you use in services. Stock, low levels and orders follow from there.</Empty>
        </View>
      )}
      {all.length && !shown.length ? (
        <Empty title="No products match" action={<Btn small kind="out" onPress={() => { setQ(""); setFilter(""); }} style={{ marginTop: 4 }}>Show everything</Btn>}>Try another word or another filter.</Empty>
      ) : null}
    </View>
  );

  const footer = (
    <View>
      {all.length ? (
        <>
          <Grp>{month}</Grp>
          <Card>
            <Kv k="Retail revenue" sub={Number(k.sales) > 0 ? `in ${pct(k.sales_with_retail, k.sales)}% of ${plural(Number(k.sales), "sale")}` : "no sales yet this month"} v={money(k.retail_cents, cur)} strong />
            <Kv k="Retail margin" sub={Number(k.retail_cents) > 0 ? `${money(k.profit_cents, cur)} profit` : "nothing sold yet this month"} v={Number(k.retail_cents) > 0 ? `${pct(k.profit_cents, k.retail_cents)}%` : "0%"} strong />
            <Kv last k="Back-bar used" sub={Number(k.sales) > 0 && Number(k.backbar_cents) > 0 ? `${money(Math.round(Number(k.backbar_cents) / Number(k.sales)), cur)} per sale` : "at cost"} v={money(k.backbar_cents, cur)} strong />
          </Card>
        </>
      ) : null}
      <Grp>The online shop</Grp>
      <Card>
        <Item icon={<MfIcon name="bag" />} title="Online orders" sub="Orders to hand over or send" onPress={() => router.push("/m/orders" as never)} />
        <Item icon={<McIcon name="refund" />} title="Returns" sub="Customers asking to send something back" onPress={() => router.push("/m/returns" as never)} />
        <Item last icon={<McIcon name="list" />} title="What shoppers are told" sub="Returns, delivery time and pick-up" onPress={() => router.push("/m/shop-policy" as never)} />
      </Card>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={shown}
        keyExtractor={(p) => String(p.id)}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: pad, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderItem={({ item: p, index }) => {
          const st = stockState(p, onOrder);
          const here = loc ? shelf(p, String(loc.id)) : Number(p.stock);
          const line = [p.sku, CATEGORY[p.category] ?? p.category, sells(p) ? money(p.price_cents, cur) : "Back-bar"].filter(Boolean).join(" · ");
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${p.name}. ${here} in stock${loc ? ` at ${loc.name}, ${p.stock} in all` : ""}. ${st.label}.`} onPress={() => router.push((`/m/product/${p.id}` + (loc ? `?location=${loc.id}` : "")) as never)}
              style={({ pressed }) => [piece(index === 0, index === shown.length - 1), { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 68, opacity: pressed ? 0.75 : 1 }]}>
              <Thumb photoId={p.photo_id} tone={p.tone} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{p.name}</Text>
                <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{line}</Text>
                <Meter value={meterOf(p, top)} low={isLow(p) || isOut(p)} style={{ marginTop: 6, maxWidth: 150 }} />
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Row gap={4} style={{ alignItems: "baseline" }}>
                  <Text style={{ fontFamily: f.bold, fontSize: 18, lineHeight: 22, color: isOut(p) ? c.wine : c.ink }}>{here}</Text>
                  {loc ? <Text style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>of {p.stock}</Text> : null}
                </Row>
                <Row gap={4}>
                  {sells(p) && !p.active ? <Tag>Offline</Tag> : null}
                  {st.label === "OK" ? null : <Tag kind={st.kind}>{st.label}</Tag>}
                </Row>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

/** A shortcut to one of the stock tools, in the row under the summary. */
function Tool({ children, icon, onPress }: { children: string; icon: ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, flexDirection: "row", alignItems: "center", gap: 8, opacity: pressed ? 0.8 : 1 })}>
      {icon}
      <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.ink }}>{children}</Text>
    </Pressable>
  );
}
