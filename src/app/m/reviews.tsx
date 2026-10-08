// Reviews: what clients wrote after a finished visit, the public reply under each one, and the one
// review pinned to the top of the page. The reviews part of the web's Storefront tool
// (GET /v1/m/storefront, POST /v1/m/reviews/{id}).
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { AskManager, Header, SetRow, Sheet, Sw, Tag, Wait } from "@/components/mc-kit";
import { Bar, MdIcon, StarRow, said, useSaid } from "@/components/md-kit";
import { Avatar, Btn, Card, Chip, Empty, Failed, Field, Note, Row, Screen, T } from "@/components/ui";
import { api, type Row as Data } from "@/lib/api";
import { dayShort, plural } from "@/lib/format";
import { DENIED, orDenied, signedIn, soft } from "@/lib/mc-util";
import { pageBody } from "@/lib/md-profile";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Filter = "all" | "todo" | "done" | "flagged";

export default function Reviews() {
  const s = useSession();
  const tz = s.merchant?.timezone as string | undefined;
  const { data, error, refreshing, refresh, reload, setData } = useLoad(signedIn(s, () => orDenied(async () => {
    const page = await s.mapi<Data>("/storefront");
    // The count of each star rating is public. It is empty while reviews are switched off on the page.
    const pub = await soft(() => api<Data>(`/businesses/${page.business.slug}/reviews`));
    return { page, breakdown: (pub.data?.breakdown ?? null) as Data | null };
  })), [s.businessToken]);
  const [note, setNote] = useSaid();
  const [filter, setFilter] = useState<Filter>("all");
  const [reply, setReply] = useState<{ id: string; text: string } | null>(null);
  const [replyError, setReplyError] = useState("");
  const [busy, setBusy] = useState("");

  const loaded = !!data && data !== DENIED;
  const reviews = useMemo(() => (loaded ? ((data.page.reviews ?? []) as Data[]) : []), [loaded, data]);
  const published = useMemo(() => reviews.filter((r) => r.status === "published"), [reviews]);
  const todo = published.filter((r) => !r.reply).length, flagged = reviews.filter((r) => r.status === "flagged").length;
  const shown = useMemo(() => reviews.filter((r) => (filter === "todo" ? r.status === "published" && !r.reply : filter === "done" ? !!r.reply : filter === "flagged" ? r.status === "flagged" : true)), [reviews, filter]);

  if (!loaded) {
    return (
      <Screen>
        <Header title="Reviews" />
        {data === DENIED ? <AskManager what="Reviews are answered by a manager or the owner." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const b = data.page.business as Data, disp = (data.page.display ?? {}) as Data;
  const total = Number(b.review_count ?? 0), rating = Number(b.rating ?? 0);
  // Stars by count: the public figures when the page shows reviews, else counted here when every review is in hand.
  const pub = data.breakdown && Number(data.breakdown.all) > 0 ? data.breakdown : null;
  const counts = pub ? [5, 4, 3, 2, 1].map((n) => Number(pub[`s${n}`] ?? 0)) : published.length === total && total > 0 ? [5, 4, 3, 2, 1].map((n) => published.filter((r) => Number(r.rating) === n).length) : null;
  const most = counts ? Math.max(1, ...counts) : 1;
  const current = reply ? reviews.find((r) => String(r.id) === reply.id) : undefined;

  const patch = (id: string, change: Data, others?: Data) => setData((x) => (x && x !== DENIED ? { ...x, page: { ...x.page, reviews: (x.page.reviews as Data[]).map((r) => (String(r.id) === id ? { ...r, ...change } : others ? { ...r, ...others } : r)) } } : x));

  const saveReply = async (text: string) => {
    if (!reply) return;
    const body = text.trim();
    if (body.length > 1000) { setReplyError("Keep the reply under 1,000 characters."); return; }
    setBusy(body ? "reply" : "unreply"); setReplyError("");
    try {
      await s.mapi(`/reviews/${reply.id}`, { body: { reply: body } });
      patch(reply.id, { reply: body, replied_at: body ? new Date().toISOString() : null });
      setNote({ kind: "ok", text: body ? "Reply saved. It shows under the review on your page." : "Reply removed." });
      setReply(null);
    } catch (e) {
      setReplyError((e as Error).message);
    }
    setBusy("");
  };

  const pin = async (r: Data) => {
    const pinned = !r.pinned, id = String(r.id);
    setBusy("pin" + id); setNote(null);
    try {
      await s.mapi(`/reviews/${id}`, { body: { pinned } });
      patch(id, { pinned }, pinned ? { pinned: false } : undefined); // one pinned review at a time
      setNote({ kind: "ok", text: pinned ? "Pinned. It now shows first on your page." : "Unpinned." });
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  const toggleShow = async () => {
    const next = !disp.show_reviews;
    setBusy("show"); setNote(null);
    try {
      await s.mapi("/storefront", { method: "PUT", body: pageBody(b, {}, { show_reviews: next }) });
      setData((x) => (x && x !== DENIED ? { ...x, page: { ...x.page, display: { ...x.page.display, show_reviews: next } } } : x));
      setNote({ kind: "ok", text: next ? "Reviews now show on your page." : "Reviews are hidden on your page. Clients can still leave them." });
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  const head = (
    <View style={{ marginBottom: 6 }}>
      <Header title="Reviews" />
      <Card style={{ padding: 18, marginTop: 14 }}>
        {total > 0 ? (
          <Row gap={18} style={{ alignItems: "center" }}>
            <View style={{ alignItems: "flex-start", gap: 6 }}>
              <Text accessibilityLabel={`${rating.toFixed(1)} out of 5`} style={{ fontFamily: f.serif, fontSize: 52, lineHeight: 54, color: c.ink }}>{rating.toFixed(1)}</Text>
              <StarRow rating={rating} size={15} />
              <T size={12} muted>{plural(total, "review")}</T>
            </View>
            {counts ? (
              <View style={{ flex: 1, gap: 6 }}>
                {counts.map((n, i) => (
                  <Row key={i} gap={8} style={{ minHeight: 14 }}>
                    <Text accessibilityLabel={`${5 - i} stars: ${n}`} style={{ width: 10, fontFamily: f.semi, fontSize: 12, color: c.muted }}>{5 - i}</Text>
                    <View style={{ flex: 1 }}><Bar share={n / most} color={c.gold} /></View>
                    <Text style={{ width: 22, textAlign: "right", fontFamily: f.medium, fontSize: 12, color: c.muted }}>{n}</Text>
                  </Row>
                ))}
              </View>
            ) : <T size={13} muted style={{ flex: 1 }}>Published reviews, from completed visits only.</T>}
          </Row>
        ) : (
          <View style={{ gap: 4 }}>
            <T weight="semi" size={16}>No published reviews yet</T>
            <T muted size={13}>Only clients who finished a visit can leave one. A rating shows here once the first is in.</T>
          </View>
        )}
      </Card>
      <Card style={{ marginTop: 10 }}>
        <SetRow last title="Show reviews on your page" sub={disp.show_reviews ? "Your rating and reviews are public" : "Hidden. Clients can still leave reviews"} right={<Sw on={!!disp.show_reviews} disabled={busy === "show"} label="Show reviews on your page" onPress={toggleShow} />} />
      </Card>
      {reviews.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -pad, marginTop: 14 }} contentContainerStyle={{ gap: 8, paddingHorizontal: pad }}>
          <Chip on={filter === "all"} onPress={() => setFilter("all")}>{`All · ${reviews.length}`}</Chip>
          <Chip on={filter === "todo"} onPress={() => setFilter("todo")}>{`To answer · ${todo}`}</Chip>
          <Chip on={filter === "done"} onPress={() => setFilter("done")}>{`Answered · ${reviews.filter((r) => !!r.reply).length}`}</Chip>
          {flagged ? <Chip on={filter === "flagged"} onPress={() => setFilter("flagged")}>{`Flagged · ${flagged}`}</Chip> : null}
        </ScrollView>
      ) : null}
      {reviews.length >= 40 ? <T size={12} muted style={{ marginTop: 10 }}>Up to 40 reviews are listed: the pinned one, then those without a reply, then the newest.</T> : null}
    </View>
  );

  return (
    <Screen scroll={false} padded={false} footer={said(note)} style={{ paddingBottom: 0 }}>
      <FlatList
        data={shown}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 28, gap: 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={head}
        ListEmptyComponent={reviews.length ? (
          <Empty title={filter === "todo" ? "Every review has a reply" : filter === "done" ? "No replies yet" : "Nothing here"}>{filter === "todo" ? "New reviews show here until you answer them." : filter === "done" ? "Reviews you have answered show here." : "No review matches this filter."}</Empty>
        ) : <Empty title="No reviews yet">Clients can review a visit once it is finished. Their reviews appear here for you to answer.</Empty>}
        renderItem={({ item: r }) => (
          <Card style={{ padding: 16, gap: 10 }}>
            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <Avatar name={String(r.author_name ?? "")} tone="#5A4A3A" size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 19, color: c.ink }}>{r.author_name}</Text>
                <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{[r.service_name, dayShort(String(r.created_at), tz)].filter(Boolean).join(" · ")}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <StarRow rating={Number(r.rating)} />
                {r.pinned || r.status === "flagged" ? <Row gap={4}>{r.pinned ? <Tag kind="gold">Pinned</Tag> : null}{r.status === "flagged" ? <Tag kind="wine">Flagged</Tag> : null}</Row> : null}
              </View>
            </Row>
            <T size={14} style={{ lineHeight: 21 }}>{r.body}</T>
            {r.status === "flagged" ? <Note kind="gold">This review has been flagged and LogaLuxe is checking it. It is not on your page while that happens.</Note> : null}
            {r.reply ? (
              <View style={{ backgroundColor: "#F4ECE2", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, gap: 3 }}>
                <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: c.muted }}>{`Your reply${r.replied_at ? ` · ${dayShort(String(r.replied_at), tz)}` : ""}`}</Text>
                <T size={13} style={{ lineHeight: 19 }}>{r.reply}</T>
              </View>
            ) : null}
            <Row gap={8} wrap>
              <Btn small kind={r.reply ? "out" : "ink"} onPress={() => { setReplyError(""); setNote(null); setReply({ id: String(r.id), text: String(r.reply ?? "") }); }}>{r.reply ? "Edit reply" : "Reply publicly"}</Btn>
              {r.status === "published" ? (
                <Pressable accessibilityRole="button" accessibilityState={{ busy: busy === "pin" + r.id }} disabled={busy === "pin" + r.id} onPress={() => pin(r)} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, opacity: busy === "pin" + r.id ? 0.4 : pressed ? 0.6 : 1 })}>
                  <MdIcon name="pin" size={15} color={c.wine} />
                  <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>{r.pinned ? "Unpin" : "Pin to the top"}</Text>
                </Pressable>
              ) : null}
            </Row>
          </Card>
        )}
      />

      <Sheet open={!!reply && !!current} onClose={() => setReply(null)} title={current?.reply ? "Your reply" : "Reply publicly"} sub="It shows under the review on your page." tall
        footer={reply ? (
          <View style={{ gap: 8 }}>
            <Btn busy={busy === "reply"} disabled={busy === "unreply" || (!reply.text.trim() && !current?.reply)} onPress={() => saveReply(reply.text)}>{current?.reply ? "Save reply" : "Post reply"}</Btn>
            {current?.reply ? <Btn kind="danger" busy={busy === "unreply"} disabled={busy === "reply"} onPress={() => saveReply("")}>Remove my reply</Btn> : null}
          </View>
        ) : undefined}>
        {reply && current ? (
          <>
            {replyError ? <Note kind="bad">{replyError}</Note> : null}
            <View style={{ backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 14, gap: 6 }}>
              <Row between><T size={13} weight="semi">{current.author_name}</T><StarRow rating={Number(current.rating)} size={13} /></Row>
              <T size={13} muted style={{ lineHeight: 19 }}>{current.body}</T>
            </View>
            <Field label="Your reply" value={reply.text} onChangeText={(text) => setReply({ ...reply, text })} multiline maxLength={1000} autoFocus placeholder="Thank them, or say what you have put right." style={{ minHeight: 140 }} hint={`${reply.text.length} of 1,000`} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
