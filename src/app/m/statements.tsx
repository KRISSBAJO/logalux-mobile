// Monthly statements: one row for each month that had any money in it (GET /v1/m/statements, the owner's).
// Each opens the month in full. The sums are the API's; nothing is added up here except the year filter.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AskManager, Header, Tag, Wait, piece } from "@/components/mc-kit";
import { small } from "@/components/mh-kit";
import { Chip, Empty, Failed, Icon } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { plural, ymd } from "@/lib/format";
import { DENIED, orDenied, signedIn } from "@/lib/mc-util";
import { exact, monthName } from "@/lib/mh-util";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function Statements() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const tz = s.merchant?.timezone as string | undefined;
  const [year, setYear] = useState("");

  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/statements"))), [s.businessToken]);

  // A sale or a payout made on another screen changes this month's line.
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!s.businessToken) return;
    if (seen.current) void refresh();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));

  const d = data && data !== DENIED ? data : null;
  const all = useMemo(() => ((d?.statements ?? []) as Data[]), [d]);
  const years = useMemo(() => [...new Set(all.map((x) => String(x.month).slice(0, 4)))], [all]);
  const rows = year ? all.filter((x) => String(x.month).startsWith(year)) : all;
  const cur = String(d?.currency ?? s.merchant?.currency ?? "USD");
  const thisMonth = ymd(new Date(), tz).slice(0, 7);
  const top = { paddingTop: insets.top + 12, paddingHorizontal: pad } as const;

  if (!d) {
    return (
      <View style={[{ flex: 1, backgroundColor: c.cream }, top]}>
        <Header title="Statements" />
        {data === DENIED ? <AskManager who="the owner" what="Statements, payouts and the bank account are for the owner of the business." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={rows}
        keyExtractor={(x) => String(x.month)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ ...top, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={
          <View style={{ marginBottom: 14 }}>
            <Header title="Statements" />
            <Text style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.muted, marginTop: 10 }}>One statement for each month: what came in, the fees, what was paid out to your bank, and what LogaLuxe still owed you at the end.</Text>
            {error ? <View style={{ marginTop: 12 }}><Failed error={error} onRetry={reload} /></View> : null}
            {years.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 12, flexGrow: 0 }}>
                <Chip on={!year} onPress={() => setYear("")}>All</Chip>
                {years.map((y) => <Chip key={y} on={year === y} onPress={() => setYear(y)}>{y}</Chip>)}
              </ScrollView>
            ) : null}
          </View>
        }
        ListEmptyComponent={<Empty title="No statements yet">A month appears here once any money has moved in it: a sale, a tip, a deposit, a refund or a payout.</Empty>}
        renderItem={({ item: x, index }) => {
          const first = index === 0, last = index === rows.length - 1;
          const open = x.month === thisMonth;
          const fees = Number(x.fees_cents ?? 0) + Number(x.lead_fees_cents ?? 0) + Number(x.plan_fees_cents ?? 0) + Number(x.payout_fees_cents ?? 0);
          const tookIn = Number(x.charges_cents ?? 0) + Number(x.tips_cents ?? 0) + Number(x.deposits_cents ?? 0);
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${monthName(String(x.month))}. Net toward payouts ${exact(x.net_cents, cur)}. ${plural(Number(x.sales), "sale")}.`} onPress={() => router.push(`/m/statement/${x.month}` as never)}
              style={({ pressed }) => [piece(first, last), { paddingHorizontal: 16, paddingVertical: 14, opacity: pressed ? 0.75 : 1 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={{ fontFamily: f.semi, fontSize: 16, lineHeight: 22, color: c.ink }}>{monthName(String(x.month))}</Text>
                    {open ? <Tag kind="gold">Not over yet</Tag> : null}
                  </View>
                  <Text style={{ fontFamily: f.body, fontSize: 12.5, lineHeight: 18, color: c.muted }}>{plural(Number(x.sales), "sale")} · {exact(tookIn, cur)} in sales, tips and deposits</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontFamily: f.bold, fontSize: 16, color: Number(x.net_cents) < 0 ? c.bad : c.ink }}>{exact(x.net_cents, cur)}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 11.5, color: c.muted }}>net toward payouts</Text>
                </View>
                <Icon name="next" size={18} color={c.muted2} />
              </View>
              <View style={{ flexDirection: "row", marginTop: 10, gap: 8 }}>
                {([["Fees", exact(fees, cur)], ["Refunds", exact(x.refunds_cents, cur)], ["Paid out", exact(x.payouts_cents, cur)]] as [string, string][]).map(([k, v]) => (
                  <View key={k} style={{ flex: 1 }}>
                    <Text style={{ fontFamily: f.body, fontSize: 11.5, color: c.muted }}>{k}</Text>
                    <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.ink }}>{v}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={rows.length ? (
          <Text style={[small, { marginTop: 12 }]}>Fees here are LogaLuxe fees, lead fees, plan fees and instant payout fees together; a month shows each one on its own. Net toward payouts is what the month added to your payout balance. Money taken outside LogaLuxe (cash, a transfer, your own card machine) is recorded but never part of a payout. Up to 36 months are kept here.</Text>
        ) : null}
      />
    </View>
  );
}
