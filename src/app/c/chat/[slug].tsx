import { useLayoutEffect , useCallback, useMemo, useRef, useState } from "react";
// A conversation with one business (design: C7-Chat). New messages arrive while the screen is open:
// it asks again every 15 seconds while in view, and straight after sending.
// Left out because the API has nothing behind them: the "usually replies within" line, the reminder
// notices, and the quick actions and photo attachment above the composer.
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Btn, Card, Failed, Icon, IconButton, Loading, Note, Pill, T } from "@/components/ui";
import { api, media, type Row as Data } from "@/lib/api";
import { bookingState, isUpcoming, moneyFacts, today } from "@/lib/cc-data";
import { clock, dayShort, firstName, when, ymd } from "@/lib/format";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

type Line = { key: string; day?: string; m?: Data };

export default function Chat() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const s = useSession();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<Line>>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false), [error, setError] = useState("");

  /** The thread with this business, if there is one. Reading it marks it read. */
  const thread = useCallback(async (known?: string): Promise<{ id: string; messages: Data[] }> => {
    const id = known || (await s.capi<{ threads: Data[] }>("/auth/threads")).threads?.find((t) => t.slug === slug)?.id;
    if (!id) return { id: "", messages: [] };
    return { id, messages: (await s.capi<{ messages: Data[] }>(`/auth/threads/${id}`)).messages ?? [] };
  }, [s, slug]);

  const q = useLoad(async () => {
    const biz = (await api<{ business: Data }>(`/businesses/${slug}`)).business;
    if (!s.clientToken) return { biz, id: "", messages: [] as Data[], booking: undefined as Data | undefined };
    const [t, me] = await Promise.all([thread(), s.capi<{ bookings: Data[] }>("/auth/me").catch(() => null)]);
    // The client's next visit here, shown at the top of the conversation.
    const booking = (me?.bookings ?? []).filter((b) => b.slug === slug && isUpcoming(b)).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))[0];
    return { biz, ...t, booking };
  }, [slug, s.clientToken]);

  // While the screen is in view, look for new messages every 15 seconds.
  const data = useRef(q.data);
  useLayoutEffect(() => { data.current = q.data; }, [q.data]);
  const poll = useCallback(async () => {
    if (!s.clientToken || !data.current) return;
    try {
      const t = await thread(data.current.id);
      q.setData((d) => (d ? { ...d, ...t } : d));
    } catch { /* the next turn tries again */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread, s.clientToken]);
  useFocusEffect(useCallback(() => {
    void poll();
    const timer = setInterval(() => void poll(), 15000);
    return () => clearInterval(timer);
  }, [poll]));

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (body.length > 2000) { setError("Keep a message under 2,000 characters."); return; }
    setSending(true); setError("");
    try {
      const out = await s.capi<{ id: string }>("/auth/threads", { method: "POST", body: { business_slug: slug, body } });
      setText("");
      const t = await thread(out.id);
      q.setData((d) => (d ? { ...d, ...t } : d));
    } catch (e) {
      setError((e as Error).message);
    }
    setSending(false);
  };

  const messages = q.data?.messages;
  const lines = useMemo(() => {
    const out: Line[] = [];
    let last = "";
    for (const m of messages ?? []) {
      const day = ymd(new Date(m.created_at));
      if (day !== last) { last = day; out.push({ key: "d" + day, day: day === today() ? "Today" : dayShort(m.created_at) }); }
      out.push({ key: m.id, m });
    }
    return out;
  }, [messages]);

  const biz = q.data?.biz;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/client/inbox"));
  const header = (
    <View style={{ backgroundColor: c.cream, paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <IconButton icon="back" label="Back" onPress={back} />
      {biz ? <Avatar name={biz.name} tone={biz.tone} uri={media(biz.logo_id)} /> : <View style={{ width: 40 }} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{biz?.name ?? "Messages"}</Text>
        {biz ? <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>Replies appear here and in your inbox</Text> : null}
      </View>
      {biz ? <IconButton icon="info" label={`View ${biz.name}`} onPress={() => router.push(`/c/b/${slug}` as never)} /> : null}
    </View>
  );

  if (!s.ready) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
  if (!q.data) {
    return <View style={{ flex: 1, backgroundColor: c.cream2 }}>{header}<View style={{ padding: 16 }}>{q.error ? <Failed error={q.error} onRetry={q.reload} /> : <Loading label="Loading the conversation" />}</View></View>;
  }
  if (!s.clientToken) {
    return (
      <View style={{ flex: 1, backgroundColor: c.cream2 }}>{header}
        <View style={{ padding: 16 }}>
          <Card style={{ padding: 22, gap: 12 }}>
            <T weight="semi" size={16}>Sign in to message {biz?.name}</T>
            <T muted>Messages are kept with your account, so the reply can reach you.</T>
            <Btn onPress={() => router.push(`/sign-in?next=${encodeURIComponent(`/c/chat/${slug}`)}` as never)}>Sign in</Btn>
          </Card>
        </View>
      </View>
    );
  }

  const bk = q.data.booking;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.cream2 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {header}
      <FlatList
        ref={list}
        style={{ flex: 1 }}
        data={lines}
        keyExtractor={(x) => x.key}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={bk ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Your booking: ${bk.services}, ${when(bk.starts_at, bk.timezone)}. Open booking`} onPress={() => router.push(`/c/booking/${bk.id}` as never)}
            style={{ alignSelf: "flex-start", maxWidth: "85%", backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 6 }}>
            <Pill kind={bookingState(bk.status)[1]}>{`Booking ${bookingState(bk.status)[0].toLowerCase()}`}</Pill>
            <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{bk.services}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{[when(bk.starts_at, bk.timezone), moneyFacts(bk)[0]].join(" · ")}</Text>
          </Pressable>
        ) : null}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 6 }}>
            <T weight="semi" center>No messages yet</T>
            <T muted center size={14}>Ask {biz?.name} about a service, a time, or your booking. The reply appears here.</T>
          </View>
        }
        renderItem={({ item }) => {
          if (item.day) return <Text style={{ textAlign: "center", fontFamily: f.semi, fontSize: 11, letterSpacing: 0.66, textTransform: "uppercase", color: c.muted, marginVertical: 4 }}>{item.day}</Text>;
          const m = item.m!;
          const me = !m.from_business;
          return (
            <View style={{ maxWidth: "78%", alignSelf: me ? "flex-end" : "flex-start", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, borderBottomRightRadius: me ? 6 : 18, borderBottomLeftRadius: me ? 18 : 6, backgroundColor: me ? c.ink : c.white, borderWidth: me ? 0 : 1, borderColor: c.line }}>
              <Text selectable style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: me ? c.cream : c.ink }}>{m.body}</Text>
              <Text style={{ fontFamily: f.body, fontSize: 11, marginTop: 4, opacity: 0.6, color: me ? c.cream : c.ink }}>{me ? "" : m.author ? `${firstName(String(m.author))} · ` : ""}{clock(m.created_at)}</Text>
            </View>
          );
        }}
      />
      {error ? <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><Note kind="bad">{error}</Note></View> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingTop: 10, paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: c.cream, borderTopWidth: 1, borderTopColor: c.line }}>
        <View style={{ flex: 1, minHeight: 46, justifyContent: "center", backgroundColor: c.white, borderWidth: 1, borderColor: c.line2, borderRadius: 23, paddingHorizontal: 16 }}>
          <TextInput accessibilityLabel="Message" value={text} onChangeText={setText} multiline {...(Platform.OS === "web" ? { numberOfLines: 1 } : null)} maxLength={2000} placeholder={biz ? `Message ${biz.name}` : "Message"} placeholderTextColor={c.muted2}
            onKeyPress={(e) => { if (Platform.OS === "web" && e.nativeEvent.key === "Enter" && !(e.nativeEvent as { shiftKey?: boolean }).shiftKey) { e.preventDefault(); void send(); } }}
            style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.ink, maxHeight: 110, paddingVertical: 10, ...(Platform.OS === "web" ? { outlineStyle: "none" } as object : null) }} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Send" accessibilityState={{ disabled: !text.trim() || sending }} disabled={!text.trim() || sending} onPress={send}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.ink, alignItems: "center", justifyContent: "center", opacity: !text.trim() || sending ? 0.5 : 1 }}>
          {sending ? <ActivityIndicator color={c.cream} /> : <Icon name="send" size={18} color={c.cream} stroke={2.2} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
