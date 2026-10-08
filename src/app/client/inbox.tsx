// Inbox: the client's conversations with businesses, newest first, with what is unread.
// The design has no separate list screen (C7 is one conversation), so this follows the look of the other tabs.
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SignInGate, TabTitle } from "@/components/cc-ui";
import { Avatar, Btn, Card, Empty, Failed, Loading } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { ago, useRefocus } from "@/lib/cc-data";
import { plural } from "@/lib/format";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

export default function Inbox() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const q = useLoad(async () => (s.clientToken ? (await s.capi<{ threads: Data[] }>("/auth/threads")).threads ?? [] : null), [s.clientToken]);
  useRefocus(() => { if (s.clientToken) q.refresh(); });

  if (!s.ready) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
  if (!s.clientToken) return <SignInGate title="Inbox" next="/client/inbox">Messages with a business are kept with your account. Sign in to ask a question and read the reply.</SignInGate>;

  const threads = q.data ?? [];
  const unread = threads.reduce((n, t) => n + (Number(t.unread_client) || 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: pad, paddingTop: insets.top + 12, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={c.wine} />}
        ListHeaderComponent={
          <View style={{ paddingBottom: 18 }}>
            <TabTitle title="Inbox" />
            {q.data && threads.length > 0 ? <Text style={{ fontFamily: f.body, fontSize: 13, color: c.muted, marginTop: 4 }}>{unread > 0 ? `${plural(unread, "unread message")}` : "You are up to date"}</Text> : null}
            {q.error && !q.data ? <View style={{ marginTop: 14 }}><Failed error={q.error} onRetry={q.reload} /></View> : null}
            {q.loading && !q.data ? <Loading label="Loading your messages" /> : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item: t }) => {
          const n = Number(t.unread_client) || 0;
          return (
            <Card style={{ padding: 14 }} onPress={() => router.push(`/c/chat/${t.slug}` as never)} label={`${t.business}. ${n ? plural(n, "unread message") + ". " : ""}${t.last_preview ?? ""}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar name={t.business} tone={t.tone} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontFamily: n ? f.bold : f.semi, fontSize: 15, color: c.ink }}>{t.business}</Text>
                    <Text style={{ fontFamily: f.body, fontSize: 12, color: n ? c.wine : c.muted }}>{ago(t.last_message_at)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontFamily: n ? f.medium : f.body, fontSize: 13, color: n ? c.ink : c.muted }}>{t.last_preview || "No messages yet"}</Text>
                    {n ? <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.wine, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}><Text style={{ fontFamily: f.bold, fontSize: 11, color: c.white }}>{n > 99 ? "99+" : n}</Text></View> : null}
                  </View>
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={q.data ? (
          <Empty title="No messages yet" action={<Btn small onPress={() => router.push("/client/search" as never)}>Find a professional</Btn>}>
            Use Message on a business or on one of your bookings to ask a question. The reply appears here.
          </Empty>
        ) : null}
      />
    </View>
  );
}
