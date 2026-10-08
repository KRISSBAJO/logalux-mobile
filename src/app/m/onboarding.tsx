// Getting a business ready to take bookings (design: M12-Onboarding).
// The checklist is GET /v1/m/onboarding, worked out by the API from what is really there. Steps the phone
// can do open their screen; the rest open the web. "Confirm who you are" uploads the papers and sends them.
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AskManager, Grp, McIcon, SmallBtn, Tag, Wait } from "@/components/mc-kit";
import { Btn, Card, Chip, Failed, Field, Icon, IconButton, Label, Note, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { dayShort, firstName } from "@/lib/format";
import { DENIED, ask, bookingLink, copyText, fileSize, openWeb, orDenied, shareText, signedIn } from "@/lib/mc-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

/** The kinds of ID the API accepts, spelled exactly as it expects them. */
const ID_TYPES = ["Driver's licence", "Passport", "National ID card", "Voter's card", "State ID"];
const KIND_ORDER = ["id", "licence", "address"];
const MAX_DOCUMENTS = 10;

/** Steps the phone has a screen for. Every other step opens the page the API names, on the web. */
const PHONE: Record<string, string> = { services: "/m/services", address: "/m/hours" };
const SHORT: Record<string, string> = { profile: "your profile", address: "address and hours", services: "services", staff: "who does what", photos: "photos", payout: "payouts", verify: "your ID" };

type Papers = "verified" | "waiting" | "needs_info" | "rejected" | "open";
const PAPERS: Record<Papers, ["ok" | "gold" | "wine" | "grey", string]> = { verified: ["ok", "Confirmed"], waiting: ["gold", "Being checked"], needs_info: ["wine", "More needed"], rejected: ["wine", "Not approved"], open: ["grey", "Not sent yet"] };

function papersState(ob: Data): Papers {
  const v = (ob.verification ?? {}) as Data;
  if (v.status === "verified") return "verified";
  if (v.request_status === "needs_info") return "needs_info";
  if (v.request_status === "rejected" || v.status === "rejected") return "rejected";
  if (v.submitted_at && v.request_status === "pending") return "waiting";
  return "open";
}

const lower = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** One plain sentence on where things stand, in the web app's words. */
function standing(ob: Data, steps: Data[]): string {
  const note = String(ob.verification?.decision_note ?? "").trim();
  const left = steps.filter((x) => !x.done);
  switch (papersState(ob)) {
    case "needs_info": return note ? `LogaLuxe asked for more: ${note}` : "LogaLuxe asked for more before your page can go live.";
    case "rejected": return note ? `Not approved: ${note}` : "Not approved. You can upload new papers and send them again.";
    case "waiting": return "Your papers are with LogaLuxe. We will email you when they are checked." + (left.length ? " You can finish the other steps while you wait." : "");
    case "verified": return "Your identity is confirmed. Your page is not live yet.";
    default: return left.length ? `Your page is not live yet. Still to do: ${left.map((x) => lower(String(x.title))).join("; ")}.` : "Your page is not live yet.";
  }
}

export default function Onboarding() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ welcome?: string }>();
  const m = s.merchant;
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/onboarding"))), [s.businessToken]);

  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [kind, setKind] = useState("id");
  const [idType, setIdType] = useState(""), [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const scroller = useRef<ScrollView>(null);
  const verifyY = useRef(0);

  // Back from Services, Hours or the web: the steps may have changed. Going live also changes who the session says we are.
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!s.businessToken) return;
    if (seen.current) { void refresh(); void s.refresh(); }
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));

  const back = () => (router.canGoBack() ? router.back() : router.replace("/business/more" as never));
  const top = (
    <Row between style={{ minHeight: 44 }}>
      <IconButton icon="back" label="Back" onPress={back} />
      {data && data !== DENIED ? <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.muted }}>{data.done} of {data.total} done</Text> : <View />}
      <Pressable accessibilityRole="button" onPress={() => router.replace("/business/today" as never)} hitSlop={8} style={{ minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" }}>
        <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.muted }}>{data && data !== DENIED && data.live ? "Close" : "Later"}</Text>
      </Pressable>
    </Row>
  );

  if (!data || data === DENIED) {
    return (
      <View style={{ flex: 1, backgroundColor: c.cream, paddingHorizontal: 24, paddingTop: insets.top + 12 }}>
        {top}
        {data === DENIED ? <AskManager what="Setting the business up, and confirming who runs it, is for a manager or the owner." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </View>
    );
  }

  const ob = data;
  const steps = (Array.isArray(ob.steps) ? ob.steps : []) as Data[];
  const next = steps.find((x) => !x.done);
  const v = (ob.verification ?? {}) as Data;
  const docs = (v.documents ?? []) as Data[];
  const kinds = (v.kinds ?? {}) as Record<string, string>;
  const kindKeys = [...KIND_ORDER.filter((k) => kinds[k]), ...Object.keys(kinds).filter((k) => !KIND_ORDER.includes(k))];
  const papers = papersState(ob);
  const live = !!ob.live;
  const canUpload = papers !== "verified" && docs.length < MAX_DOCUMENTS;
  const canRemove = papers === "open" || papers === "needs_info" || papers === "rejected";
  const canSend = canRemove;
  const hasId = docs.some((d) => d.kind === "id");
  const [tone, label] = PAPERS[papers];
  const link = m ? bookingLink(m.slug) : "";
  const warn = papers === "needs_info" || papers === "rejected";

  const toVerify = () => scroller.current?.scrollTo({ y: Math.max(0, verifyY.current - 12), animated: true });
  const openStep = (st: Data) => {
    if (st.key === "verify") { toVerify(); return; }
    const phone = PHONE[String(st.key)];
    if (phone) router.push(phone as never);
    else void openWeb(String(st.href || "/business/setup"));
  };

  const run = async (tag: string, call: () => Promise<unknown>, done: string) => {
    setBusy(tag); setNote(null);
    try {
      await call();
      setNote({ kind: "ok", text: done });
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  const upload = async (from: "camera" | "library") => {
    setNote(null);
    try {
      if (from === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { setNote({ kind: "bad", text: "LogaLuxe is not allowed to use the camera. Allow it in your phone's settings, or choose a photo from your library." }); return; }
      }
      const picked = from === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (picked.canceled || !picked.assets?.length) return;
      const a = picked.assets[0];
      const name = a.fileName || `${kind}-${Date.now()}.${(a.mimeType ?? "image/jpeg").split("/")[1] ?? "jpg"}`;
      const form = new FormData();
      form.append("kind", kind);
      // A browser hands over the file itself; a phone hands over where the photo is kept.
      if (a.file) form.append("file", a.file, name);
      else form.append("file", { uri: a.uri, name, type: a.mimeType ?? "image/jpeg" } as unknown as Blob);
      await run("upload", () => s.mapi("/verification/documents", { form }), "Document uploaded.");
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message || "The photo could not be opened." });
    }
  };

  const remove = async (d: Data) => {
    if (!(await ask("Remove this document?", `${d.file_name} is deleted for good.`, "Remove", true))) return;
    await run("rm" + d.id, () => s.mapi(`/verification/documents/${d.id}`, { method: "DELETE" }), "Document removed.");
  };

  const send = () => run("send", async () => {
    await s.mapi("/verification/submit", { body: { id_type: idType, note: msg.trim() } });
    setMsg("");
  }, "Sent. Your papers are with LogaLuxe now.");

  const copy = async () => {
    const out = await copyText(link);
    setNote(out === "copied" ? { kind: "ok", text: "Link copied." } : out === "failed" ? { kind: "bad", text: "The link could not be copied." } : null);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.cream }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 12, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}>
        {top}
        <View accessibilityRole="progressbar" accessibilityLabel={`${ob.done} of ${ob.total} steps done`} style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
          {steps.map((st) => <View key={st.key} style={{ flex: 1, height: 3, borderRadius: 3, backgroundColor: st.done ? c.ink : c.line2 }} />)}
        </View>

        <Text accessibilityRole="header" style={{ fontFamily: f.serif, fontSize: 30, lineHeight: 32, letterSpacing: -0.3, color: c.ink, marginTop: 14 }}>{live ? `You are live, ${firstName(String(m?.name ?? ""))}.` : "Get ready to take bookings"}</Text>
        <T style={{ marginTop: 8, lineHeight: 22 }} color={warn && !live ? c.bad : c.muted}>
          {live ? "Put this link in your Instagram bio and on your cards. Clients book straight into your calendar." + (next ? " A few steps are still open below." : "") : standing(ob, steps)}
        </T>

        {p.welcome && !live ? <View style={{ marginTop: 14 }}><Note>Welcome to LogaLuxe. Add your services and your hours, and you are ready to take bookings.</Note></View> : null}
        {note ? <View style={{ marginTop: 14 }}><Note kind={note.kind}>{note.text}</Note></View> : null}

        {live && link ? (
          <>
            <Row gap={8} style={{ backgroundColor: "#F4ECE2", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginTop: 16 }}>
              <McIcon name="link" size={18} color={c.wine} />
              <Text selectable numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: f.semi, fontSize: 15, color: c.ink }}>{link.replace(/^https?:\/\//, "")}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Copy your booking link" onPress={copy} hitSlop={6} style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.ink, justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
                <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.cream }}>Copy</Text>
              </Pressable>
            </Row>
            <Row gap={8} style={{ marginTop: 10 }}>
              <SmallBtn kind="out" icon="share" style={{ flex: 1 }} onPress={() => shareText(`Book with ${m?.business} on LogaLuxe:`, link)}>Share</SmallBtn>
              <SmallBtn kind="out" style={{ flex: 1 }} onPress={() => openWeb("/business/storefront#share")}>QR code, on the web</SmallBtn>
            </Row>
          </>
        ) : null}

        <Grp style={{ marginTop: 22 }}>Steps</Grp>
        <View style={{ gap: 8 }}>
          {steps.map((st) => {
            const isNext = st === next, onPhone = !!PHONE[String(st.key)] || st.key === "verify";
            return (
              <Pressable key={st.key} accessibilityRole={onPhone ? "button" : "link"} accessibilityLabel={`${st.title}. ${st.done ? "Done" : "Not done yet"}. ${st.hint}${onPhone ? "" : " Opens on the web"}`} onPress={() => openStep(st)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, minHeight: 64, borderRadius: 16, backgroundColor: c.white, borderWidth: isNext ? 2 : 1, borderColor: isNext ? c.ink : c.line2, opacity: pressed ? 0.8 : 1 })}>
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: st.done ? c.ink : c.white, borderWidth: st.done ? 0 : 1.5, borderColor: c.line2 }}>
                  {st.done ? <Icon name="check" size={14} color={c.cream} stroke={3} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Row gap={8} wrap>
                    <Text style={{ flexShrink: 1, fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{st.title}</Text>
                    {isNext ? <Tag kind="gold">Next</Tag> : null}
                  </Row>
                  <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{st.hint}{onPhone ? "" : " Opens on the web."}</Text>
                </View>
                {st.key === "verify" ? <Icon name="down" size={18} color={c.muted2} /> : onPhone ? <Icon name="next" size={18} color={c.muted2} /> : <McIcon name="external" size={16} color={c.muted2} />}
              </Pressable>
            );
          })}
        </View>

        {/* Confirm who you are */}
        <View onLayout={(e) => { verifyY.current = e.nativeEvent.layout.y; }}>
          <Grp style={{ marginTop: 14 }} right={<Tag kind={tone}>{label}</Tag>}>Confirm who you are</Grp>
          <Card style={{ padding: 16, gap: 14, borderRadius: 18 }}>
            <T size={13} color={warn ? c.bad : c.muted} weight={warn ? "medium" : "body"}>
              {papers === "verified" ? (live ? "Your identity is confirmed and your page is live." : "Your identity is confirmed. Your page is not live yet.")
                : papers === "waiting" ? `Your papers are with LogaLuxe${v.submitted_at ? `, sent ${dayShort(v.submitted_at, m?.timezone)}` : ""}. We will email you when they are checked.`
                : papers === "needs_info" ? (v.decision_note ? `LogaLuxe asked for more: ${v.decision_note}` : "LogaLuxe asked for more before your page can go live.")
                : papers === "rejected" ? (v.decision_note ? `Not approved: ${v.decision_note}` : "Not approved. You can upload new papers and send them again.")
                : "Upload a photo of a government ID so LogaLuxe can check who runs this business. Your page goes live once it is approved. Only LogaLuxe staff can see these papers."}
            </T>

            {docs.length ? (
              <View>
                {docs.map((d, i) => (
                  <Row key={d.id} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F4ECE2", alignItems: "center", justifyContent: "center" }}><McIcon name="doc" /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{kinds[d.kind] ?? d.kind}</Text>
                      <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{d.file_name} · {fileSize(d.size_bytes)} · {dayShort(d.created_at, m?.timezone)}</Text>
                    </View>
                    {canRemove ? <SmallBtn kind="danger" busy={busy === "rm" + d.id} onPress={() => remove(d)}>Remove</SmallBtn> : null}
                  </Row>
                ))}
              </View>
            ) : papers !== "verified" ? <T size={13} muted>No documents uploaded yet.</T> : null}

            {canUpload ? (
              <View style={{ gap: 10 }}>
                <Label>Add a document</Label>
                <Row gap={8} wrap>{kindKeys.map((k) => <Chip key={k} on={kind === k} onPress={() => setKind(k)}>{kinds[k]}</Chip>)}</Row>
                <Row gap={8} wrap>
                  <SmallBtn kind="ink" icon="camera" busy={busy === "upload"} onPress={() => upload("camera")}>Take a photo</SmallBtn>
                  <SmallBtn kind="out" disabled={busy === "upload"} onPress={() => upload("library")}>Choose a photo</SmallBtn>
                </Row>
                <T size={12} muted>A clear photo, up to 10 MB. A PDF can be uploaded on the web.</T>
              </View>
            ) : papers !== "verified" ? <T size={12} muted>You have uploaded {MAX_DOCUMENTS} documents, which is the most we keep. Remove one to add another.</T> : null}

            {canSend ? (
              <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 14 }}>
                <Label>Which ID did you upload?</Label>
                <Row gap={8} wrap>{ID_TYPES.map((k) => <Chip key={k} on={idType === k} onPress={() => setIdType(k)}>{k}</Chip>)}</Row>
                <Field label="Anything we should know (optional)" value={msg} onChangeText={setMsg} multiline maxLength={1000} />
                <Btn busy={busy === "send"} disabled={!hasId || !idType} onPress={send}>{papers === "open" ? "Send for checking" : "Send again for checking"}</Btn>
                {!hasId ? <T size={12} muted>Upload a photo of your ID first.</T> : !idType ? <T size={12} muted>Say which kind of ID it is, then send.</T> : null}
              </View>
            ) : null}
          </Card>
        </View>

        {live && !ob.dismissed ? (
          <Pressable accessibilityRole="button" onPress={() => run("dismiss", () => s.mapi("/onboarding/dismiss", { body: {} }), "The setup list is hidden from Home.")} style={{ minHeight: 44, justifyContent: "center", marginTop: 8 }}>
            <T size={13} weight="semi" color={c.wine}>Hide the setup list from Home</T>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 28), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.cream }}>
        {next ? (
          <>
            <Btn kind="out" style={{ flex: 1, minHeight: 52 }} onPress={() => router.replace("/business/today" as never)}>Calendar</Btn>
            <Btn style={{ flex: 2, minHeight: 52 }} onPress={() => openStep(next)}>Next: {SHORT[String(next.key)] ?? lower(String(next.title))}</Btn>
          </>
        ) : <Btn style={{ flex: 1, minHeight: 52 }} onPress={() => router.replace("/business/today" as never)}>Go to my calendar</Btn>}
      </View>
    </KeyboardAvoidingView>
  );
}
