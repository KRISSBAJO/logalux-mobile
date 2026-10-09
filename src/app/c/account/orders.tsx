import { useState } from "react";
import { View } from "react-native";
import { BackTitle, Grp, SignInGate } from "@/components/cc-ui";
import { Btn, Card, Empty, Failed, Loading, Note, Row, Screen, T } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";
import { openPay, useReturn } from "@/lib/cc-data";
import { money } from "@/lib/format";
import type { Row as Data } from "@/lib/api";

export default function Orders() {
  const s = useSession();
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(false);
  const [payError, setPayError] = useState("");
  const [paying, setPaying] = useState("");
  const q = useLoad(async () => s.clientToken ? s.capi<{ orders: Data[]; order_page: Data }>(`/auth/me?paged=1&order_page=${page}${pending ? "&status=pending" : ""}`) : null, [s.clientToken, page, pending]);
  useReturn(() => { if (s.clientToken) void q.refresh(); });
  if (!s.clientToken) return <SignInGate title="Shop orders" next="/c/account/orders">Sign in to see your purchases.</SignInGate>;
  return <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
    <BackTitle title="Shop orders" />
    <Btn kind="out" onPress={() => { setPending(!pending); setPage(1); }}>{pending ? "Show all orders" : "Show awaiting payment"}</Btn>
    {payError ? <Note kind="bad">{payError}</Note> : null}
    {q.error ? <Failed error={q.error} onRetry={q.reload} /> : null}
    {q.loading ? <Loading label="Loading your orders" /> : null}
    {!q.loading && !q.error && !q.data?.orders.length ? <Empty title="No orders here">Your purchases made while signed in appear here.</Empty> : null}
    <View style={{ gap: 14 }}>{q.data?.orders.map(order => <Card key={order.id} style={{ padding: 18, gap: 10 }}>
      <T weight="semi">{order.items || "Shop order"}</T>
      <T>{money(order.total_cents, order.currency)} · {String(order.status).replaceAll("_", " ")}</T>
      <T size={13}>{new Date(order.created_at).toLocaleDateString()}</T>
      {(order.shipments ?? []).map((shipment: Data, index: number) => <View key={index} style={{ gap: 4 }}>
        <T weight="semi" size={14}>{shipment.seller}</T>
        <T size={13}>{String(shipment.status).replaceAll("_", " ")} · {shipment.fulfilment === "pickup" ? "Collection" : "Delivery"}</T>
        {shipment.tracking ? <T size={13}>Tracking: {shipment.tracking}</T> : null}
      </View>)}
      {order.pay_url ? <><T size={13}>Payment opens securely in your browser. Return here and refresh to check the result.</T><Btn busy={paying === order.id} disabled={!!paying} onPress={() => { setPaying(order.id); setPayError(""); void openPay(order.pay_url).then(() => q.refresh()).catch((error: Error) => setPayError(error.message || "Payment could not be opened. Try again.")).finally(() => setPaying("")); }}>Pay {money(order.total_cents, order.currency)}</Btn></> : null}
    </Card>)}</View>
    {q.data && Number(q.data.order_page.pages) > 1 ? <><Grp>History</Grp><Row gap={10}><Btn small disabled={page <= 1} onPress={() => setPage(page - 1)}>Previous</Btn><T>{q.data.order_page.page} / {q.data.order_page.pages}</T><Btn small disabled={page >= q.data.order_page.pages} onPress={() => setPage(page + 1)}>Next</Btn></Row></> : null}
  </Screen>;
}
