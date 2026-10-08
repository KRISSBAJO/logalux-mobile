// One online order: its items, the customer, how it reaches them, what the business receives, and the
// button for the next step. The API has no route for a single order, so it is found in GET /v1/m/orders.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, Text, View } from "react-native";
import { Grp, Header, mc } from "@/components/mc-kit";
import { Blank, Fine, Kv, MfIcon, Night } from "@/components/mf-kit";
import { Btn, Card, Empty, Field, Icon, Note, Row, Screen, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money } from "@/lib/format";
import { tel } from "@/lib/ma-format";
import { DENIED, ask, orDenied, signedIn } from "@/lib/mc-util";
import { ORDER_DONE, ORDER_STATE, addressLine, nextSteps, orderPath, stamp } from "@/lib/mf-stock";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function Order() {
  const s = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tz = s.merchant?.timezone as string | undefined, cur = (s.merchant?.currency as string) ?? "USD";
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/orders"))), [s.businessToken]);
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  const d = data && data !== DENIED ? data : null;
  if (!d) return <Blank title="Order" error={error} onRetry={reload} denied={data === DENIED} what="Online orders belong to a manager or the owner." />;
  const o = ((d.orders ?? []) as Data[]).find((x) => x.id === id || x.order_id === id);
  if (!o) {
    return (
      <Screen onRefresh={refresh} refreshing={refreshing}>
        <Header title="Order" />
        <View style={{ marginTop: 16 }}>
          <Empty title="Order not found" action={<Btn small kind="out" onPress={() => router.replace("/m/orders" as never)} style={{ marginTop: 4 }}>Open online orders</Btn>}>It is not one of the last 300 orders of this business.</Empty>
        </View>
      </Screen>
    );
  }

  const st = ORDER_STATE[o.status] ?? { label: String(o.status), kind: "grey" as const };
  const items = (o.items ?? []) as Data[], ship = o.fulfilment === "ship", where = addressLine(o.address);
  const steps = nextSteps(o), path = orderPath(o), cancelled = o.status === "cancelled";
  const fee = Number(d.marketplace_pct ?? 0);
  const mailed = !!String(o.customer_email ?? "").trim(); // the API emails each step only when the order has an address

  const run = async (step: (typeof steps)[number]) => {
    if (step.finishes && !(await ask(step.label + "?", `Mark the order for ${o.customer_name} as ${step.action}? This finishes it.`, step.label))) return;
    setBusy(step.action); setNote(null);
    try {
      await s.mapi(`/orders/${o.id}`, { body: { action: step.action, tracking: step.action === "shipped" ? tracking.trim() : "" } });
      setTracking("");
      setNote({ kind: "ok", text: ORDER_DONE[step.action] ?? "Saved." });
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  const main = steps[0], second = steps[1];
  const footer = main ? (
    <View style={{ gap: 10 }}>
      {note ? <Note kind={note.kind}>{note.text}</Note> : null}
      {main.tracking ? <Field label="Tracking, optional" value={tracking} onChangeText={setTracking} maxLength={80} autoCapitalize="characters" autoCorrect={false} placeholder="The courier's reference" /> : null}
      <Row gap={10}>
        {second ? <Btn kind="out" busy={busy === second.action} disabled={!!busy} onPress={() => run(second)} style={{ flex: 1 }}>{second.label}</Btn> : null}
        <Btn busy={busy === main.action} disabled={!!busy} onPress={() => run(main)} style={{ flex: second ? 1.4 : 1 }}>{main.label}</Btn>
      </Row>
    </View>
  ) : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.cream }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen onRefresh={refresh} refreshing={refreshing} footer={footer}>
        <Header title="Order" />
        {note && !footer ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}

        <Night style={{ marginTop: 14 }}>
          <Row between style={{ alignItems: "flex-start" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: mc.nightMuted }}>{ship ? "Shipment" : "Pick-up"}</Text>
              <Text accessibilityRole="header" style={{ fontFamily: f.serif, fontSize: 30, lineHeight: 36, color: mc.onNight, marginTop: 2 }}>{st.label}</Text>
            </View>
            {ship ? <MfIcon name="truck" size={22} color={c.gold} /> : <MfIcon name="bag" size={22} color={c.gold} />}
          </Row>
          <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: mc.nightMuted, marginTop: 2 }}>Paid {stamp(o.created_at, tz)}{o.updated_at && o.status !== "new" ? `\n${st.label} ${stamp(o.updated_at, tz)}` : ""}</Text>
          {!cancelled ? (
            <View accessibilityLabel={`Step ${path.filter((x) => x.done).length} of ${path.length}`} style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
              {path.map((x) => (
                <View key={x.label} style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: x.done ? c.gold : "rgba(255,255,255,.16)" }} />
                  <Text style={{ fontFamily: x.now ? f.semi : f.body, fontSize: 11, lineHeight: 14, color: x.done ? mc.onNight : mc.nightMuted }}>{x.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Night>

        <Grp>Customer</Grp>
        <Card style={{ padding: 16, gap: 10 }}>
          <T weight="semi" size={16}>{o.customer_name}</T>
          {o.customer_phone ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`Call ${o.customer_name} on ${o.customer_phone}`} onPress={() => Linking.openURL(tel(String(o.customer_phone))).catch(() => undefined)} style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.7 : 1 })}>
              <Icon name="phone" size={18} color={c.wine} />
              <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.wine }}>{o.customer_phone}</Text>
            </Pressable>
          ) : null}
          {o.customer_email ? <T selectable muted size={14}>{o.customer_email}</T> : null}
        </Card>

        <Grp>{ship ? "Ship to" : "Collect"}</Grp>
        <Card>
          <Kv k={ship ? "Address" : "How"} v={ship ? (where || "No address given") : "Picked up from you"} last={!o.tracking && !o.note && !(ship && Number(o.shipping_cents) > 0)} />
          {ship && Number(o.shipping_cents) > 0 ? <Kv k="Shipping charged" v={money(o.shipping_cents, cur)} last={!o.tracking && !o.note} /> : null}
          {o.tracking ? <Kv k="Tracking" v={String(o.tracking)} last={!o.note} /> : null}
          {o.note ? <Kv last k="Note" v={String(o.note)} /> : null}
        </Card>

        <Grp>Items</Grp>
        <Card>
          {items.map((i, k) => <Kv key={k} k={`${i.qty} × ${i.name}`} sub={[i.size, Number(i.qty) > 1 ? `${money(i.unit_cents, cur)} each` : ""].filter(Boolean).join(" · ") || undefined} v={money(Number(i.qty) * Number(i.unit_cents), cur)} />)}
          <Kv k="Items total" v={money(o.items_cents, cur)} />
          <Kv last k="You receive" sub={fee > 0 ? `After LogaLuxe's ${fee}% of the items. Shipping you charge is yours.` : "Shipping you charge is yours."} v={cancelled && !o.net_cents ? "Nothing" : money(o.net_cents, cur)} strong />
        </Card>
        <Fine style={{ marginTop: 10 }}>
          {main
            ? ({ shipped: `Add the courier's tracking reference if you have one, then mark it shipped.${mailed ? " The customer is emailed that it is on its way." : ""}`, delivered: "Mark it delivered once it has arrived.", ready: `Mark it ready when the items are packed and waiting.${mailed ? " The customer is emailed that it is ready to collect." : ""}`, collected: "Mark it collected when the customer has picked it up." }[main.action])
            : "Nothing to do. This order is finished."} The customer sees each step in their account.
        </Fine>
      </Screen>
    </KeyboardAvoidingView>
  );
}
