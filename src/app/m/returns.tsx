// Returns: customers asking to send back what they bought from this business in the shop.
// The business approves (and refunds) or refuses, once. GET /v1/m/returns lists the last 300.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Header, SmallBtn, Tag } from "@/components/mc-kit";
import { Blank, ChipRow, CountChip, Fine, useRefocus } from "@/components/mf-kit";
import { Btn, Card, Empty, Row } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money } from "@/lib/format";
import { DENIED, orDenied, signedIn } from "@/lib/mc-util";
import { RETURN_STATE, refundSplit, stamp } from "@/lib/mf-stock";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const TABS: [string, string][] = [["", "All"], ["requested", "Waiting"], ["approved", "Approved"], ["refused", "Refused"]];

export default function Returns() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const tz = s.merchant?.timezone as string | undefined;
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/returns"))), [s.businessToken]);
  useRefocus(refresh, !!s.businessToken);
  const [tab, setTab] = useState("");

  const d = data && data !== DENIED ? data : null;
  const rows = useMemo(() => ((d?.returns ?? []) as Data[]), [d]);
  const shown = useMemo(() => rows.filter((r) => !tab || r.status === tab), [rows, tab]);
  if (!d) return <Blank title="Returns" error={error} onRetry={reload} denied={data === DENIED} what="Only a manager or the owner can answer returns." />;
  const reasons = (d.reasons ?? {}) as Record<string, string>;

  const header = (
    <View style={{ gap: 12, marginBottom: 14 }}>
      <Header title="Returns" />
      <Fine>A customer can ask to send back what they bought from you while your returns policy allows it. You approve and refund, or refuse and say why. A refund comes out of your balance in Money, and LogaLuxe returns its marketplace fee on the refunded items.</Fine>
      {rows.length ? (
        <ChipRow>
          {TABS.map(([id, name]) => <CountChip key={id} n={id ? rows.filter((r) => r.status === id).length : rows.length} on={tab === id} onPress={() => setTab(id)}>{name}</CountChip>)}
        </ChipRow>
      ) : (
        <Empty title="No return requests" action={<Btn small kind="out" onPress={() => router.push("/m/shop-policy" as never)} style={{ marginTop: 4 }}>What shoppers are told</Btn>}>
          When a customer asks to send back something they bought from you in the shop, it shows here for you to answer. Customers can only ask while your returns policy allows it. You set that under What shoppers are told.
        </Empty>
      )}
      {rows.length && !shown.length ? <Empty title={tab === "requested" ? "Nothing is waiting for you" : "No returns here"}>{tab === "requested" ? "Every return request has been answered." : "No return has this status."}</Empty> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={shown}
        keyExtractor={(r) => String(r.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: pad, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ListFooterComponent={rows.length ? <Fine style={{ marginTop: 12 }}>You answer each request once. The customer is emailed your answer. The last 300 are shown.</Fine> : null}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item: r }) => {
          const st = RETURN_STATE[r.status] ?? { label: String(r.status), kind: "grey" as const };
          const items = (r.items ?? []) as Data[], cur = String(r.currency ?? s.merchant?.currency ?? "USD"); // an order is refunded in its own currency
          const paid = Number(r.items_cents ?? 0) + Number(r.shipping_cents ?? 0);
          const waiting = r.status === "requested";
          return (
            <Card style={{ padding: 16, gap: 10 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Return from ${r.customer_name}, ${st.label}. Open`} onPress={() => router.push(`/m/return/${r.id}` as never)} style={({ pressed }) => ({ gap: 10, opacity: pressed ? 0.7 : 1 })}>
                <Row between gap={10} style={{ alignItems: "flex-start" }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: f.semi, fontSize: 15, lineHeight: 21, color: c.ink }}>{r.customer_name}</Text>
                    <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>Asked {stamp(r.created_at, tz)}</Text>
                  </View>
                  <Tag kind={st.kind}>{st.label}</Tag>
                </Row>
                <View style={{ gap: 2 }}>
                  {items.map((i, k) => <Text key={k} style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.ink }}>{i.qty} × {i.name}{i.size ? <Text style={{ color: c.muted }}> · {i.size}</Text> : null}</Text>)}
                </View>
                <View>
                  <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{reasons[r.reason] ?? r.reason}</Text>
                  <Text numberOfLines={3} style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.muted }}>{r.note ? `“${r.note}”` : "No note from the customer"}</Text>
                </View>
              </Pressable>
              <Row between gap={10} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, alignItems: waiting ? "center" : "flex-start" }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {waiting ? (
                    <>
                      <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 16, color: c.muted }}>Paid to you</Text>
                      <Text style={{ fontFamily: f.bold, fontSize: 16, lineHeight: 22, color: c.ink }}>{money(paid, cur)}</Text>
                    </>
                  ) : r.status === "approved" ? (
                    <>
                      <Text style={{ fontFamily: f.bold, fontSize: 15, lineHeight: 21, color: c.ink }}>Refunded {money(r.refund_cents, cur)}</Text>
                      <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{refundSplit(r.refund_cents, r.credit_cents, cur)} · {r.restocked ? "items put back in stock" : "items not put back in stock"}</Text>
                    </>
                  ) : <Text style={{ fontFamily: f.bold, fontSize: 15, lineHeight: 21, color: c.ink }}>Refused, nothing refunded</Text>}
                </View>
                {waiting ? <SmallBtn kind="ink" onPress={() => router.push(`/m/return/${r.id}` as never)}>Answer</SmallBtn> : null}
              </Row>
            </Card>
          );
        }}
      />
    </View>
  );
}
