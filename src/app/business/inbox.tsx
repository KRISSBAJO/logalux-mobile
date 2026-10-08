// The business inbox (design: M4-Inbox): conversations with clients, and, for a manager or the owner,
// the problems clients reported about a visit. The design's WhatsApp, SMS and In-app chips are not
// filters the API has, so the chips here are the ones it does have: open, unread, assigned to me, done.
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Empty, Failed, Loading, Note, Row as Line, Serif, T } from "@/components/ui";
import { ChannelBadge, ChipRow, Choice, CountChip, Face, RoundBtn, SearchBox, Sheet, Tag } from "@/components/mb-ui";
import type { Row } from "@/lib/api";
import { money } from "@/lib/format";
import { aboutOf, isLate, stateOf, timeLeft } from "@/lib/mb-care";
import { useBadgeRefresh, useDebounced, useMapi, usePoll, useRefocus } from "@/lib/mb-hooks";
import { can, channelLabel, dateMed, stamp, stampShort, toneOf } from "@/lib/mb-util";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

type Filter = "open" | "unread" | "mine" | "closed" | "problems";

const EMPTY: Record<Exclude<Filter, "problems">, [string, string]> = {
  open: ["No open conversations", "When a client writes to you, or you write to them, it shows here."],
  unread: ["Nothing unread", "You are up to date."],
  mine: ["Nothing assigned to you", "Conversations you reply to, or are given, show here."],
  closed: ["Nothing marked done", "Mark a conversation done when it is dealt with. It moves here."],
};

export default function Inbox() {
  const s = useSession();
  const mapi = useMapi();
  const refreshBadge = useBadgeRefresh();
  const insets = useSafeAreaInsets();
  const me = s.merchant, tz = me?.timezone as string | undefined, cur = (me?.currency as string) ?? "USD";
  const manager = can(me, "manager");

  const [filter, setFilter] = useState<Filter>("open");
  const [newOpen, setNewOpen] = useState(false), [cq, setCq] = useState(""), dcq = useDebounced(cq.trim(), 300);

  const listFilter = filter === "problems" ? "open" : filter;
  // The answer is marked with the filter it was asked for, so a list for one chip is never shown under another.
  const list = useLoad<Row>(async () => ({ ...(await mapi<Row>(`/inbox?filter=${listFilter}`)), asked: listFilter }), [listFilter, s.businessToken]);
  // Only a manager or the owner may see and answer problems.
  const care = useLoad<Row>(() => (manager ? mapi("/problems") : Promise.resolve({ problems: [] })), [manager, s.businessToken]);
  const people = useLoad<Row>(() => (newOpen ? mapi(`/clients?sort=name&q=${encodeURIComponent(dcq)}`) : Promise.resolve({ clients: [] })), [newOpen, dcq]);

  const again = () => { void list.reload(); if (manager) void care.reload(); };
  useRefocus(() => { again(); refreshBadge(); });
  usePoll(again, 15000);

  const fresh = list.data?.asked === listFilter;
  const threads = (list.data?.threads ?? []) as Row[], counts = (list.data?.counts ?? {}) as Row;
  const problems = (care.data?.problems ?? []) as Row[];
  const waiting = problems.filter((p) => p.status === "with_business").length;

  // The tab's badge is the number of unread messages in open conversations. When this screen sees a different number, the badge is reloaded.
  const unreadNow = listFilter === "open" && list.data ? threads.reduce((a, t) => a + Number(t.unread_business ?? 0), 0) : -1;
  const badge = Number(me?.badges?.inbox ?? 0);
  useEffect(() => { if (unreadNow >= 0 && unreadNow !== badge) refreshBadge(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [unreadNow]);

  const chips = (
    <ChipRow style={{ marginTop: 14 }}>
      <CountChip on={filter === "open"} count={Number(counts.open ?? 0) || undefined} onPress={() => setFilter("open")}>Open</CountChip>
      <CountChip on={filter === "unread"} count={Number(counts.unread ?? 0) || undefined} onPress={() => setFilter("unread")}>Unread</CountChip>
      {me?.staff_id ? <CountChip on={filter === "mine"} count={Number(counts.mine ?? 0) || undefined} onPress={() => setFilter("mine")}>Assigned to me</CountChip> : null}
      <CountChip on={filter === "closed"} count={Number(counts.closed ?? 0) || undefined} onPress={() => setFilter("closed")}>Done</CountChip>
      {manager ? <CountChip on={filter === "problems"} count={waiting || undefined} onPress={() => setFilter("problems")}>Problems</CountChip> : null}
    </ChipRow>
  );

  const header = (
    <View style={{ paddingTop: insets.top + 14, paddingBottom: 6 }}>
      <Line between>
        <Serif size={30}>Inbox</Serif>
        <RoundBtn icon="pencil" label="New message" onPress={() => { setCq(""); setNewOpen(true); }} />
      </Line>
      {chips}
      {filter === "problems" ? (
        <View style={{ marginTop: 12 }}>
          <Note kind="gold">When a client reports a problem with a visit, you have 48 hours to give your side. LogaLuxe then decides and emails you both. Times are in your time zone.</Note>
        </View>
      ) : null}
    </View>
  );

  const refresh = <RefreshControl refreshing={list.refreshing || care.refreshing} onRefresh={() => { if (filter === "problems") void care.refresh(); else void list.refresh(); refreshBadge(); }} tintColor={c.wine} />;

  const newSheet = (
    <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="New message" sub="Choose the client to write to. It opens a conversation here.">
      <SearchBox label="Find a client" placeholder="Name, phone or email" value={cq} onChangeText={setCq} autoFocus />
      {people.loading && !(people.data?.clients ?? []).length ? <Loading label="Finding clients" />
        : people.error ? <Failed error={people.error} onRetry={() => { void people.reload(); }} />
        : ((people.data?.clients ?? []) as Row[]).length ? (
          <>
            {((people.data?.clients ?? []) as Row[]).map((p) => (
              <Choice key={p.id} title={String(p.name)} sub={[p.phone, p.email].filter(Boolean).join(" · ") || "No contact details"} right={<View />} onPress={() => { setNewOpen(false); router.push(`/m/thread/new?client=${p.id}` as never); }} />
            ))}
            {Number(people.data?.total ?? 0) > ((people.data?.clients ?? []) as Row[]).length ? <T size={13} muted>Showing the first {((people.data?.clients ?? []) as Row[]).length} of {people.data?.total}. Search to narrow it down.</T> : null}
          </>
        ) : <Empty title={dcq ? "No client matches" : "No clients yet"}>{dcq ? "Try another name or number." : "Add one on the Clients tab first."}</Empty>}
    </Sheet>
  );

  if (filter === "problems") {
    return (
      <View style={{ flex: 1, backgroundColor: c.cream }}>
        <FlatList data={care.data ? problems : []} keyExtractor={(p) => String(p.id)} refreshControl={refresh} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 28, gap: 10 }}
          ListHeaderComponent={<>{header}{care.error && care.data ? <Note kind="bad">{care.error} Showing what was loaded before.</Note> : null}</>}
          ListEmptyComponent={(care.loading || !s.ready) && !care.data ? <Loading label="Loading problems" /> : care.error && !care.data ? <Failed error={care.error} onRetry={() => { void care.reload(); }} />
            : <Empty title="No problems reported">If a client reports a problem with a visit, it shows here with the time you have to answer.</Empty>}
          renderItem={({ item: p }) => {
            const [label, tone] = stateOf(p), late = isLate(p), left = p.status === "with_business" && p.business_deadline ? timeLeft(p.business_deadline) : "";
            return (
              <Pressable accessibilityRole="button" onPress={() => router.push(`/m/problem/${p.id}` as never)}
                style={({ pressed }) => ({ backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 20, padding: 16, gap: 6, opacity: pressed ? 0.85 : 1 })}>
                <Line between gap={8} style={{ alignItems: "flex-start" }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T size={15} weight="semi" numberOfLines={1}>{p.client_name}</T>
                    <T size={12} muted>{p.ref} · reported {dateMed(p.created_at, tz)}</T>
                  </View>
                  <Tag tone={late ? "bad" : tone}>{late ? "Overdue" : label}</Tag>
                </Line>
                <T size={13}>{aboutOf(p)}</T>
                <T size={12} muted numberOfLines={2}>{[p.starts_at ? `Visit ${dateMed(p.starts_at, tz)}` : "Visit not on record", p.services, Number(p.amount_cents) > 0 ? money(p.amount_cents, p.currency || cur) : ""].filter(Boolean).join(" · ")}</T>
                {p.status === "with_business" ? (
                  <T size={13} weight="semi" color={late ? c.bad : c.goldInk}>{p.business_deadline ? (late ? `The time to answer ran out ${stamp(p.business_deadline, tz)}. You can still answer until LogaLuxe decides.` : `Answer by ${stamp(p.business_deadline, tz)} (${left} left)`) : "Answer as soon as you can."}</T>
                ) : null}
              </Pressable>
            );
          }} />
        {newSheet}
      </View>
    );
  }

  const [emptyTitle, emptyText] = EMPTY[filter];
  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList data={fresh ? threads : []} keyExtractor={(t) => String(t.id)} refreshControl={refresh} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 28 }}
        ListHeaderComponent={<>{header}{list.error && fresh ? <View style={{ marginBottom: 6 }}><Note kind="bad">{list.error} Showing what was loaded before.</Note></View> : null}</>}
        ListEmptyComponent={(list.loading || !s.ready) && !fresh ? <Loading label="Loading conversations" /> : list.error && !fresh ? <Failed error={list.error} onRetry={() => { void list.reload(); }} />
          : <View style={{ marginTop: 6 }}><Empty title={emptyTitle}>{emptyText}</Empty></View>}
        renderItem={({ item: t }) => {
          const unread = Number(t.unread_business ?? 0) > 0, name = String(t.client_name ?? "");
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${channelLabel(String(t.channel))}${unread ? ", unread" : ""}. ${t.last_preview || "No messages yet"}`} onPress={() => router.push(`/m/thread/${t.id}` as never)}
              style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line, alignItems: "flex-start", opacity: pressed ? 0.7 : 1 })}>
              <Face name={name} tone={toneOf(name)} size={46} badge={<ChannelBadge channel={String(t.channel)} />} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Line between gap={8}>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.semi, fontSize: 15, lineHeight: 20, color: c.ink }}>{name}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>{stampShort(t.last_message_at, tz)}</Text>
                </Line>
                <Text numberOfLines={2} style={{ marginTop: 3, fontFamily: unread ? f.medium : f.body, fontSize: 13, lineHeight: 18, color: unread ? c.ink : c.muted }}>{t.last_preview || "No messages yet"}</Text>
                {t.assignee && filter !== "mine" ? <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: f.body, fontSize: 12, color: c.muted2 }}>With {String(t.assignee).split(/\s+/)[0]}</Text> : null}
              </View>
              {unread ? <View accessibilityLabel="Unread" style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.wine, marginTop: 6 }} /> : null}
            </Pressable>
          );
        }} />
      {newSheet}
    </View>
  );
}
