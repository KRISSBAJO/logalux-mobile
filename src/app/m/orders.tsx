// Online orders: this business's part of each order placed in the LogaLuxe shop.
// A pickup goes new → ready → collected. A shipment goes new → (packed) → shipped → delivered.
// GET /v1/m/orders?status= gives the list and the counts; POST /v1/m/orders/{id} moves one a step on.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Header, Item, McIcon, SmallBtn, Tag } from "@/components/mc-kit";
import { Blank, ChipRow, CountChip, Fine, MfIcon, Said, useRefocus } from "@/components/mf-kit";
import { Btn, Card, Empty, Icon, Row } from "@/components/ui";
import { qs, type Row as Data } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { DENIED, ask, orDenied, signedIn, soft } from "@/lib/mc-util";
import { ORDER_DONE, ORDER_STATE, ORDER_TABS, addressLine, nextSteps, stamp } from "@/lib/mf-stock";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Loaded = { res: Data; waiting: number };

export default function Orders() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const tz = s.merchant?.timezone as string | undefined, cur = (s.merchant?.currency as string) ?? "USD"; // a business sells in its own currency
  const [status, setStatus] = useState("open");
  const { data, error, loading, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(async (): Promise<Loaded> => {
    const [res, rts] = await Promise.all([s.mapi<Data>("/orders" + qs({ status: status === "all" ? "" : status })), soft(() => s.mapi<Data>("/returns?status=requested"))]);
    return { res, waiting: ((rts.data?.returns ?? []) as Data[]).length };
  })), [s.businessToken, status]);
  useRefocus(refresh, !!s.businessToken);

  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string; at?: string } | null>(null);
  const [busy, setBusy] = useState("");

  const d = data && data !== DENIED ? data : null;
  const orders = useMemo(() => ((d?.res.orders ?? []) as Data[]), [d]);
  if (!d) return <Blank title="Online orders" error={error} onRetry={reload} denied={data === DENIED} what="Online orders belong to a manager or the owner." />;

  const n = (k: string) => Number(d.res.counts?.[k] ?? 0);
  const count: Record<string, number> = { open: n("new") + n("ready") + n("shipped"), new: n("new"), ready: n("ready"), shipped: n("shipped"), done: Math.max(n("done"), n("all") - n("new") - n("ready") - n("shipped")), all: n("all") }; // done includes cancelled, as the list does
  const fee = Number(d.res.marketplace_pct ?? 0);

  const step = async (o: Data, st: ReturnType<typeof nextSteps>[number]) => {
    if (st.tracking) { router.push(`/m/order/${o.id}` as never); return; }
    if (st.finishes && !(await ask(st.label + "?", `Mark the order for ${o.customer_name} as ${st.action}? This finishes it.`, st.label))) return;
    setBusy(o.id + st.action); setNote(null);
    try {
      await s.mapi(`/orders/${o.id}`, { body: { action: st.action, tracking: "" } });
      setNote({ kind: "ok", text: `${o.customer_name}: ${ORDER_DONE[st.action] ?? "Saved."}`, at: String(o.id) });
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message, at: String(o.id) });
    }
    setBusy("");
  };

  const header = (
    <View style={{ gap: 12, marginBottom: 14 }}>
      <Header title="Online orders" />
      {d.waiting > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/m/returns" as never)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, minHeight: 48, backgroundColor: c.goldBg, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ flex: 1, fontFamily: f.medium, fontSize: 14, lineHeight: 20, color: c.goldInk }}>{d.waiting === 1 ? "1 return request is" : `${d.waiting} return requests are`} waiting for your answer.</Text>
          <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.goldInk }}>Answer</Text>
          <Icon name="next" size={16} color={c.goldInk} />
        </Pressable>
      ) : null}
      <ChipRow>
        {ORDER_TABS.map(([id, name]) => <CountChip key={id} n={count[id]} on={status === id} onPress={() => setStatus(id)}>{name}</CountChip>)}
      </ChipRow>
      {!orders.length && !loading ? (
        <Empty title={status === "all" || count.all === 0 ? "No online orders yet" : status === "open" ? "Nothing to do" : "No orders here"}
          action={count.all === 0 ? <Btn small kind="out" onPress={() => router.push("/m/inventory" as never)} style={{ marginTop: 4 }}>Open Inventory</Btn> : status !== "open" && status !== "all" ? <Btn small kind="out" onPress={() => setStatus("all")} style={{ marginTop: 4 }}>Show all orders</Btn> : undefined}>
          {count.all === 0 ? "Orders arrive here when someone buys one of your products in the LogaLuxe shop. Switch on Sell online for a product in Inventory to list it." : status === "open" ? "Every online order is finished." : "Nothing has this status."}
        </Empty>
      ) : null}
    </View>
  );

  const footer = (
    <View style={{ marginTop: 6, gap: 14 }}>
      <Fine>
        {fee > 0 ? `LogaLuxe keeps ${fee}% of items sold through the shop; shipping you charge is yours.` : "LogaLuxe keeps no fee on items sold through the shop on your plan; shipping you charge is yours."} What you receive is added to your balance in Money once the order is paid.
        {"\n"}An order appears here once the customer has paid. The customer sees each step in their account. The last 300 are shown.
      </Fine>
      <Card>
        <Item icon={<McIcon name="refund" />} title="Returns" sub={d.waiting ? `${plural(d.waiting, "request")} waiting for your answer` : "Customers asking to send something back"} onPress={() => router.push("/m/returns" as never)} />
        <Item icon={<McIcon name="list" />} title="What shoppers are told" sub="Returns, delivery time and pick-up" onPress={() => router.push("/m/shop-policy" as never)} />
        <Item last icon={<McIcon name="box" />} title="Products and stock" sub="What you sell online" onPress={() => router.push("/m/inventory" as never)} />
      </Card>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={orders}
        keyExtractor={(o) => String(o.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: pad, paddingBottom: note ? 24 : Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item: o }) => {
          const st = ORDER_STATE[o.status] ?? { label: String(o.status), kind: "grey" as const };
          const items = (o.items ?? []) as Data[], ship = o.fulfilment === "ship", steps = nextSteps(o), main = steps[0];
          return (
            <Card style={{ padding: 16, gap: 12 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Order for ${o.customer_name}, ${st.label}. Open`} onPress={() => router.push(`/m/order/${o.id}` as never)} style={({ pressed }) => ({ gap: 10, opacity: pressed ? 0.7 : 1 })}>
                <Row between gap={10} style={{ alignItems: "flex-start" }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: f.semi, fontSize: 15, lineHeight: 21, color: c.ink }}>{o.customer_name}</Text>
                    <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{stamp(o.created_at, tz)}</Text>
                  </View>
                  <Tag kind={st.kind}>{st.label}</Tag>
                </Row>
                <View style={{ gap: 2 }}>
                  {items.map((i, k) => <Text key={k} style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.ink }}>{i.qty} × {i.name}{i.size ? <Text style={{ color: c.muted }}> · {i.size}</Text> : null}</Text>)}
                </View>
                <Row gap={8} style={{ alignItems: "flex-start" }}>
                  <View style={{ marginTop: 1 }}>{ship ? <MfIcon name="truck" size={16} color={c.muted} /> : <MfIcon name="bag" size={16} color={c.muted} />}</View>
                  <Text style={{ flex: 1, fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.muted }}>{ship ? `Ship to ${addressLine(o.address) || "no address given"}` : "Collect: picked up from you"}{o.tracking ? `\nTracking ${o.tracking}` : ""}</Text>
                </Row>
              </Pressable>
              <Row between gap={10} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12 }}>
                <View>
                  <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 16, color: c.muted }}>You receive</Text>
                  <Text style={{ fontFamily: f.bold, fontSize: 16, lineHeight: 22, color: c.ink }}>{o.status === "cancelled" && !o.net_cents ? "Nothing" : money(o.net_cents, cur)}</Text>
                </View>
                {main ? <SmallBtn kind="ink" busy={busy === o.id + main.action} onPress={() => step(o, main)}>{main.label}</SmallBtn> : <Text style={{ fontFamily: f.body, fontSize: 13, color: c.muted }}>Nothing to do</Text>}
              </Row>
            </Card>
          );
        }}
      />
      {note ? (
        <View style={{ paddingHorizontal: pad, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 14), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.cream }}>
          <Said note={note} onClose={() => setNote(null)} />
        </View>
      ) : null}
    </View>
  );
}
