// Leave a review of a finished visit (design: C8-Review): stars, a few words, photos of the result and a tip.
// The API publishes the review first and takes photos for it afterwards, so photos chosen here are sent
// straight after it is posted. Once published, this screen is where its photos are added and removed.
// The design's "What stood out?" tags are left out: a review has no field for them.
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
import { TipBox } from "@/components/cc-booking-sheets";
import { BackTitle, Grp } from "@/components/cc-ui";
import { Avatar, Btn, Card, Failed, Icon, Loading, Note, Screen, T } from "@/components/ui";
import { ApiError, media, type Row as Data } from "@/lib/api";
import { PayWith, WalletLine, walletsFor } from "@/components/mp-pay";
import { openPay, provider, tipChoices, useReturn } from "@/lib/cc-data";
import { cardName, usePayChoice } from "@/lib/mp-cards";
import { useFeatures } from "@/lib/mp-features";
import { dayShort, firstName, money } from "@/lib/format";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

const WORDS = ["Tap a star", "Not good", "Could be better", "Good", "Great", "Loved it"];
const MAX = 3, LIMIT = 8 * 1024 * 1024;
type Asset = ImagePicker.ImagePickerAsset;

export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession();
  const [stars, setStars] = useState(5);
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<Asset[]>([]);
  const [tip, setTip] = useState(0);
  const [busy, setBusy] = useState(false), [working, setWorking] = useState(""); // `working`: the photo being sent or removed
  const [error, setError] = useState(""), [needVerify, setNeedVerify] = useState(false), [sent, setSent] = useState("");
  const { width } = useWindowDimensions();
  const [notes, setNotes] = useState<{ kind: "ok" | "bad" | "gold"; text: string }[]>([]);

  const q = useLoad(async () => {
    if (!s.clientToken) return null;
    const me = await s.capi<{ bookings: Data[] }>("/auth/me");
    const b = (me.bookings ?? []).find((x) => x.id === id);
    if (!b) throw new Error("We could not find that visit in your account.");
    return b;
  }, [id, s.clientToken]);
  useReturn(() => { if (s.clientToken && q.data) q.refresh(); }); // back from paying a tip

  const b = q.data;
  const ft = useFeatures();
  const pay = usePayChoice(String(b?.currency || "USD"));
  const head = <BackTitle title={b?.review_id ? "Your review" : "How was it?"} />;

  if (!s.ready) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
  if (!s.clientToken) {
    return (
      <Screen>{head}
        <Card style={{ marginTop: 18, padding: 22, gap: 12 }}>
          <T weight="semi" size={16}>Sign in to leave a review</T>
          <T muted>Only the client who made a booking can review it.</T>
          <Btn onPress={() => router.push(`/sign-in?next=${encodeURIComponent(`/c/review/${id}`)}` as never)}>Sign in</Btn>
        </Card>
      </Screen>
    );
  }
  if (!b) return <Screen>{head}<View style={{ marginTop: 18 }}>{q.error ? <Failed error={q.error} onRetry={q.reload} /> : <Loading label="Loading the visit" />}</View></Screen>;

  const currency = String(b.currency || "USD");
  const tips = b.can_tip ? tipChoices(Number(b.total_cents) || 0, currency).choices : [];
  const photos: string[] = Array.isArray(b.review_photos) ? b.review_photos : [];

  /** Sends one chosen photo to a published review. On a phone a file is {uri, name, type}; in a browser it is a File. */
  const upload = async (reviewId: string, a: Asset) => {
    if ((a.fileSize ?? a.file?.size ?? 0) > LIMIT) throw new Error("The photo is too large. The limit is 8 MB.");
    const type = a.mimeType ?? a.file?.type ?? "image/jpeg";
    const name = a.fileName || a.file?.name || `photo.${type.split("/")[1] === "png" ? "png" : type.split("/")[1] === "webp" ? "webp" : "jpg"}`;
    const form = new FormData();
    if (Platform.OS === "web") form.append("file", a.file ?? (await (await fetch(a.uri)).blob()), name);
    else form.append("file", { uri: a.uri, name, type } as unknown as Blob);
    await s.capi(`/auth/reviews/${reviewId}/photos`, { form });
  };

  const choose = async (room: number): Promise<Asset[]> => {
    const out = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsMultipleSelection: room > 1, selectionLimit: room });
    return out.canceled ? [] : out.assets.slice(0, room);
  };

  // Before the review is posted: photos wait here.
  const pickBefore = async () => {
    setError("");
    try { const got = await choose(MAX - picked.length); setPicked((x) => [...x, ...got].slice(0, MAX)); } catch (e) { setError((e as Error).message || "The photo could not be opened."); }
  };
  // After it is posted: a photo goes straight up.
  const pickAfter = async () => {
    if (!b.review_id) return;
    setError("");
    try {
      const got = await choose(MAX - photos.length);
      for (const a of got) { setWorking("new"); await upload(b.review_id, a); }
    } catch (e) {
      setError((e as Error).message || "The photo could not be sent.");
    }
    setWorking(""); q.refresh();
  };
  const remove = async (photoId: string) => {
    setWorking(photoId); setError("");
    try { await s.capi(`/auth/review-photos/${photoId}`, { method: "DELETE" }); } catch (e) { setError((e as Error).message); }
    setWorking(""); q.refresh();
  };

  const post = async () => {
    const text = body.trim();
    setError(""); setNeedVerify(false);
    if (stars < 1) { setError("Choose one to five stars."); return; }
    if (text.length < 10) { setError("Write at least a sentence about how it went."); return; }
    setBusy(true);
    try {
      await s.capi(`/auth/bookings/${id}/review`, { method: "POST", body: { rating: stars, body: text } });
    } catch (e) {
      if (e instanceof ApiError && e.body?.need_verify) setNeedVerify(true);
      else setError((e as Error).message);
      setBusy(false);
      return;
    }
    const out: typeof notes = [{ kind: "ok", text: `Thank you. Your review of ${b.business} is published.` }];
    // The review's id comes with the account; the photos chosen earlier go to it now.
    let payUrl = "";
    try {
      const me = await s.capi<{ bookings: Data[] }>("/auth/me");
      const reviewId = (me.bookings ?? []).find((x) => x.id === id)?.review_id as string | undefined;
      let failed = 0, why = "";
      for (const a of picked) {
        if (!reviewId) { failed++; continue; }
        try { await upload(reviewId, a); } catch (e) { failed++; why = (e as Error).message; }
      }
      if (failed) out.push({ kind: "bad", text: `${failed === 1 ? "One photo was" : `${failed} photos were`} not added. ${why} You can add photos below.`.replace("  ", " ") });
    } catch {
      if (picked.length) out.push({ kind: "bad", text: "Your photos were not added. You can add them below." });
    }
    if (tip > 0) {
      try {
        const t = await s.capi<Data>(`/auth/bookings/${id}/tip`, { method: "POST", body: { amount_cents: tip, ...pay.fields() } });
        const amount = money(Number(t.amount_cents) || tip, t.currency || currency);
        if (t.paid === true) out.push({ kind: "ok", text: `Your ${amount} tip to ${b.business} was paid${pay.card ? ` with ${cardName(pay.card)}` : ""}.` });
        else if (t.payment?.url) { payUrl = t.payment.url; out.push({ kind: "gold", text: `Finish your ${amount} tip on the payment page. You will be charged ${amount} on ${provider(t.currency || currency)}, in ${(t.currency || currency) === "NGN" ? "naira" : "US dollars"}. It is added once it is paid.` }); }
        else out.push({ kind: "ok", text: `Your ${amount} tip is on its way to ${b.business}.` });
      } catch (e) {
        out.push({ kind: "bad", text: `The tip was not added. ${(e as Error).message}` });
      }
    }
    setNotes(out); setPicked([]); setBusy(false);
    await q.refresh();
    if (payUrl) { await openPay(payUrl); q.refresh(); }
  };

  const resend = async () => {
    setSent("");
    try {
      const out = await s.capi<Data>("/auth/verify/send", { method: "POST", body: {} });
      if (out.already) { await s.refresh(); setNeedVerify(false); setSent("Your email is already confirmed. Post your review again."); }
      else setSent(`We sent a new link to ${out.email}. It works for 48 hours. Open it, then post your review.`);
    } catch (e) {
      setSent((e as Error).message);
    }
  };

  const summary = (
    <Card style={{ marginTop: 18, padding: 16, alignItems: "center", gap: 10 }}>
      <Avatar name={b.business} tone={b.tone} size={48} />
      <View style={{ alignItems: "center" }}>
        <T weight="semi" size={16} center>{b.services || "Your visit"} with {firstName(String(b.staff))}</T>
        <T size={13} muted center>{b.business} · {dayShort(b.starts_at, b.timezone)}</T>
      </View>
      {b.review_id ? <T size={14} color={c.ok} weight="semi">Published</T> : (
        <>
          <View accessibilityRole="radiogroup" accessibilityLabel="Rating" style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${n} ${n === 1 ? "star" : "stars"}`} accessibilityState={{ selected: n === stars }} onPress={() => setStars(n)} style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center" }}>
                <Icon name="star" size={36} color={n <= stars ? c.gold : "#D9CFC4"} fill={n <= stars ? c.gold : "#D9CFC4"} stroke={1} />
              </Pressable>
            ))}
          </View>
          <Text style={{ fontFamily: f.serifBold, fontSize: 20, color: c.wine }}>{WORDS[stars]}</Text>
        </>
      )}
    </Card>
  );

  const size = Math.floor((Math.min(width, 520) - pad * 2 - 8 * 3) / 4); // four to a row, as drawn
  const tileStyle = { width: size, height: size, borderRadius: 12 } as const;
  const addTile = (onPress: () => void, off?: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" disabled={off} onPress={onPress} style={[tileStyle, { borderWidth: 1, borderStyle: "dashed", borderColor: "#B5A99E", alignItems: "center", justifyContent: "center", gap: 4, opacity: off ? 0.5 : 1 }]}>
      {working === "new" ? <ActivityIndicator color={c.wine} /> : <Icon name="plus" size={18} color={c.muted} />}
      <Text style={{ fontFamily: f.semi, fontSize: 11, color: c.muted }}>{working === "new" ? "Sending" : "Add"}</Text>
    </Pressable>
  );
  const photoTile = (key: string, uri: string | undefined, label: string, onRemove: () => void, spinning?: boolean) => (
    <View key={key} style={tileStyle}>
      <Image source={{ uri }} accessibilityLabel={label} style={[tileStyle, { backgroundColor: c.photo }]} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label.toLowerCase()}`} disabled={spinning} onPress={onRemove} hitSlop={10}
        style={{ position: "absolute", top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(26,21,19,.75)", alignItems: "center", justifyContent: "center" }}>
        {spinning ? <ActivityIndicator size="small" color={c.white} /> : <Icon name="close" size={14} color={c.white} />}
      </Pressable>
    </View>
  );

  // ----- published: photos are added and removed here -----
  if (b.review_id) {
    return (
      <Screen onRefresh={q.refresh} refreshing={q.refreshing} footer={<Btn onPress={() => (router.canGoBack() ? router.back() : router.replace("/client/bookings"))}>Done</Btn>}>
        {head}
        {notes.length ? <View style={{ marginTop: 18, gap: 8 }}>{notes.map((n) => <Note key={n.text} kind={n.kind}>{n.text}</Note>)}</View> : null}
        {summary}
        <Grp>Photos of the result</Grp>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {photos.map((pid, i) => photoTile(pid, media(pid), `Photo ${i + 1}`, () => void remove(pid), working === pid))}
          {photos.length < MAX ? addTile(() => void pickAfter(), !!working) : null}
        </View>
        <T size={12} muted style={{ marginTop: 8 }}>{photos.length < MAX ? `${photos.length} of ${MAX} added. JPEG, PNG or WebP, up to 8 MB each. They are shown with your review on the page of ${b.business}.` : "A review can have three photos. Remove one to add another."}</T>
        {error ? <View style={{ marginTop: 12 }}><Note kind="bad">{error}</Note></View> : null}
      </Screen>
    );
  }

  // ----- not open for a review -----
  if (!b.can_review) {
    return (
      <Screen>{head}
        <Card style={{ marginTop: 18, padding: 22, gap: 10 }}>
          <T weight="semi" size={16}>This visit cannot be reviewed yet</T>
          <T muted>You can review a visit once it is finished.</T>
          <Btn kind="soft" small onPress={() => router.replace(`/c/booking/${id}` as never)} style={{ alignSelf: "flex-start" }}>Open the booking</Btn>
        </Card>
      </Screen>
    );
  }

  // ----- the form -----
  const cta = tip > 0 ? `Post review and tip ${money(tip, currency)}` : "Post review";
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen footer={<View style={{ gap: 8 }}>
        <Btn onPress={post} busy={busy} style={{ minHeight: 52 }}>{cta}</Btn>
        <T size={11} muted center>Only clients with a finished booking can review.</T>
      </View>}>
        {head}
        {summary}

        <Grp>Tell others more</Grp>
        <TextInput accessibilityLabel="Review" value={body} onChangeText={setBody} multiline maxLength={1500} placeholder="What you had done, and how it went" placeholderTextColor={c.muted2}
          style={{ minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingHorizontal: 14, paddingVertical: 12, fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.ink, textAlignVertical: "top" }} />
        <T size={12} muted style={{ marginTop: 6 }}>At least a sentence. It is published with your first name.</T>

        <Grp>Add photos of the result</Grp>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {picked.map((a, i) => photoTile(a.uri, a.uri, `Photo ${i + 1}`, () => setPicked((x) => x.filter((y) => y !== a))))}
          {picked.length < MAX ? addTile(() => void pickBefore(), busy) : null}
        </View>
        <T size={12} muted style={{ marginTop: 8 }}>Up to three. They are added when you post the review.</T>

        {tips.length > 0 ? (
          <>
            <Grp>Add a tip for {b.business}</Grp>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TipBox on={tip === 0} top="No tip" onPress={() => setTip(0)} />
              {tips.map((x) => <TipBox key={x.pct} on={tip === x.cents} top={money(x.cents, currency)} bottom={`${x.pct}%`} onPress={() => setTip(x.cents)} />)}
            </View>
            <T size={12} muted style={{ marginTop: 8 }}>The tip goes to {b.business}.{pay.on && tip > 0 ? "" : " If a payment page opens, you pay there. LogaLuxe never sees your card."}</T>
            {tip > 0 && pay.on ? (
              <>
                <Grp>Pay the tip with</Grp>
                <PayWith choice={pay} provider={provider(currency)} wallets={walletsFor(ft.wallets, provider(currency))} when="when you post the review" />
              </>
            ) : walletsFor(ft.wallets, provider(currency)) ? <View style={{ marginTop: 8 }}><WalletLine /></View> : null}
          </>
        ) : null}

        <View style={{ marginTop: 14, gap: 8 }}>
          {error ? <Note kind="bad">{error}</Note> : null}
          {needVerify ? (
            <View accessibilityRole="alert" style={{ backgroundColor: c.goldBg, borderRadius: 14, padding: 14, gap: 10 }}>
              <T size={14} weight="medium" color={c.goldInk}>Confirm your email first. We sent a link to {s.customer?.email}. Open it, then post your review.</T>
              <Btn small kind="out" onPress={resend} style={{ alignSelf: "flex-start" }}>Send the link again</Btn>
            </View>
          ) : null}
          {sent ? <Note kind="gold">{sent}</Note> : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
