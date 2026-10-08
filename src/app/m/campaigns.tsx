// Campaigns: who the business can reach, and every one-off message it has written or sent.
// Read from GET /v1/m/marketing (the newest 30 campaigns, which is all the API returns).
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Grp, Header, SmallBtn } from "@/components/mc-kit";
import { CampaignRow, NotReady } from "@/components/mg-kit";
import { Card, Chip, Empty, Icon, Note, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { plural } from "@/lib/format";
import { useGrow } from "@/lib/mg-load";
import { AUDIENCES, NO_SIZE, n, type Size } from "@/lib/mg-util";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

type Show = "all" | "draft" | "sent";

export default function Campaigns() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const cur = (s.merchant?.currency as string) ?? "USD", tz = s.merchant?.timezone as string | undefined;
  const [show, setShow] = useState<Show>("all");

  const { d, denied, error, reload, refresh, refreshing } = useGrow(s, () => s.mapi<Data>("/marketing"));
  const campaigns = useMemo(() => ((d?.campaigns ?? []) as Data[]), [d]);
  const drafts = campaigns.filter((x) => x.status === "draft").length;
  const list = useMemo(() => campaigns.filter((x) => show === "all" || (show === "draft" ? x.status === "draft" : x.status !== "draft")), [campaigns, show]);

  if (!d) return <NotReady title="Campaigns" denied={denied} error={error} reload={reload} what="Campaigns are written and sent by a manager or the owner." />;

  const k = (d.kpis ?? {}) as Data, modes = (d.modes ?? {}) as Record<string, string>;
  const audiences = (d.audiences ?? {}) as Record<string, Size>;
  const emailLive = modes.email !== "log";
  const start = (audience?: string) => router.push(`/m/campaign-new${audience ? `?audience=${audience}` : ""}` as never);

  const header = (
    <View>
      <Header title="Campaigns" right={<SmallBtn kind="ink" icon="plus" onPress={() => start()}>New</SmallBtn>} />
      <View style={{ marginTop: 14 }}>
        <Note kind="gold">{emailLive ? "Email is delivered. WhatsApp and SMS are not connected yet: those messages are logged, not delivered." : "WhatsApp, SMS and email are not connected yet. Messages are logged, not delivered."}</Note>
      </View>

      <Grp>Who you can reach</Grp>
      <Card>
        {AUDIENCES.map(([key, label], i) => {
          const a = audiences[key] ?? NO_SIZE;
          return (
            <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${label}: ${plural(a.total, "client")}, ${a.email} with an email address, ${a.phone} with a phone number. Write to them`} onPress={() => start(key)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 60, borderBottomWidth: i === AUDIENCES.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{label}</Text>
                <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{n(a.email)} with an email · {n(a.phone)} with a phone number</Text>
              </View>
              <Text style={{ fontFamily: f.serifBold, fontSize: 24, color: c.ink }}>{n(a.total)}</Text>
              <Icon name="next" size={18} color={c.muted2} />
            </Pressable>
          );
        })}
      </Card>
      <T size={12} muted style={{ marginTop: 8 }}>Only clients who agreed to marketing are counted. {Number(k.opted_out) > 0 ? `${plural(Number(k.opted_out), "client")} opted out and ${Number(k.opted_out) === 1 ? "is" : "are"} left out.` : "Nobody has opted out."} Press a group to write to it.</T>

      <Grp>Campaigns · {campaigns.length}</Grp>
      {drafts > 0 && drafts < campaigns.length ? (
        <Row gap={8} style={{ marginBottom: 10 }}>
          <Chip on={show === "all"} onPress={() => setShow("all")}>All</Chip>
          <Chip on={show === "draft"} onPress={() => setShow("draft")}>Drafts · {drafts}</Chip>
          <Chip on={show === "sent"} onPress={() => setShow("sent")}>Sent · {campaigns.length - drafts}</Chip>
        </Row>
      ) : null}
      {!campaigns.length ? <Empty title="No campaigns yet" action={<SmallBtn kind="ink" onPress={() => start()} style={{ marginTop: 4 }}>Write your first campaign</SmallBtn>}>It is saved as a draft first, so you can send yourself a test before anything goes to clients.</Empty> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={list}
        keyExtractor={(x) => String(x.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: pad, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ListFooterComponent={campaigns.length >= 30 ? <T size={12} muted style={{ marginTop: 4 }}>These are your 30 newest campaigns. Older ones are kept but not listed.</T> : null}
        renderItem={({ item }) => <CampaignRow camp={item} currency={cur} tz={tz} onPress={() => router.push(`/m/campaign/${item.id}` as never)} />}
      />
    </View>
  );
}
