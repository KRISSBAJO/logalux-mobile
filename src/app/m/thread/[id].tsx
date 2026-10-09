// One conversation with a client. The Inbox design (M4) draws the list only; this screen follows the
// product's chat design (C7), seen from the business's side. `/m/thread/new?client=<id>` writes the
// first message to a client; the API then opens a conversation (or adds to the one already there).
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, Failed, Field, Icon, IconButton, Label, Loading, Note, T } from "@/components/ui";
import { ChannelBadge, Choice, Face, MbIcon, RoundBtn, Sheet } from "@/components/mb-ui";
import { WEB_URL, type Row } from "@/lib/api";
import { clock, firstName, money, plural } from "@/lib/format";
import { useBadgeRefresh, useFlash, useMapi, usePoll, useRefocus } from "@/lib/mb-hooks";
import { channelLabel, dayOf, deliveryLabel, relDay, sand, STATUS_LABEL, toneOf } from "@/lib/mb-util";
import { sentResult, useModes } from "@/lib/mp-features";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/lib/session";
import { c, f, radius } from "@/lib/theme";

export default function Thread() {
  const p = useLocalSearchParams<{ id: string; client?: string; sent?: string; ch?: string }>();
  if (p.id === "new") return <NewThread clientId={typeof p.client === "string" ? p.client : ""} />;
  return <Conversation key={String(p.id)} id={String(p.id)} sent={typeof p.sent === "string" ? p.sent : ""} sentOn={typeof p.ch === "string" ? p.ch : ""} />;
}

const backToInbox = () => (router.canGoBack() ? router.back() : router.replace("/business/inbox"));

// ---------- the bar across the top ----------

function Head({ name, sub, channel, right }: { name: string; sub: string; channel?: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: c.cream, paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <IconButton icon="back" label="Back" onPress={backToInbox} />
      {name ? <Face name={name} tone={toneOf(name)} size={40} badge={channel ? <ChannelBadge channel={channel} /> : undefined} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 15, lineHeight: 20, color: c.ink }}>{name || "Conversation"}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 16, color: c.muted }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// ---------- the box a message is written in ----------

function Composer({ value, onChange, onSend, busy, placeholder, sendLabel }: { value: string; onChange: (v: string) => void; onSend: () => void; busy: boolean; placeholder: string; sendLabel: string }) {
  const insets = useSafeAreaInsets();
  const off = busy || !value.trim();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingTop: 10, paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: c.cream, borderTopWidth: 1, borderTopColor: c.line }}>
      <View style={{ flex: 1, minHeight: 46, maxHeight: 140, backgroundColor: c.white, borderWidth: 1, borderColor: c.line2, borderRadius: 23, paddingHorizontal: 16, justifyContent: "center" }}>
        <TextInput accessibilityLabel="Message" value={value} onChangeText={onChange} multiline numberOfLines={1} maxLength={4000} placeholder={placeholder} placeholderTextColor={c.muted2}
          style={[{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.ink, paddingVertical: 12, maxHeight: 138 }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={sendLabel} accessibilityState={{ disabled: off, busy }} disabled={off} onPress={onSend}
        style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: c.ink, alignItems: "center", justifyContent: "center", opacity: off ? 0.45 : pressed ? 0.85 : 1 })}>
        <Icon name="send" size={18} color={c.cream} />
      </Pressable>
    </View>
  );
}

// ---------- a conversation that exists ----------

type Flow = { key: string; kind: "day" | "msg" | "sys"; text: string; msg?: Row };

function Conversation({ id, sent, sentOn }: { id: string; sent: string; sentOn: string }) {
  const s = useSession();
  const mapi = useMapi();
  const refreshBadge = useBadgeRefresh();
  const me = s.merchant, tz = me?.timezone as string | undefined, cur = (me?.currency as string) ?? "USD";

  const [text, setText] = useState(""), [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false), [assign, setAssign] = useState(false), [working, setWorking] = useState("");
  const [draftOpen, setDraftOpen] = useState(false), [hint, setHint] = useState(""), [drafting, setDrafting] = useState(false), [draftError, setDraftError] = useState("");
  const { flash, show } = useFlash(8000);
  const listRef = useRef<FlatList<Flow>>(null);

  const one = useLoad<Row>(() => mapi(`/inbox/${encodeURIComponent(id)}`), [id, s.businessToken]);
  // Whether a WhatsApp message or a text really goes out follows the switches an admin holds.
  const modes = useModes(one.data?.mail_mode as string | undefined);
  // Drafting with AI is offered only when the API says it is switched on for this business.
  const ai = useLoad<Row>(() => mapi("/ai"), [s.businessToken]);
  useRefocus(() => { void one.reload(); });
  usePoll(() => { if (!sending) void one.reload(); }, 15000); // new messages arrive without leaving the screen

  const t = one.data?.thread as Row | undefined;
  const messages = (one.data?.messages ?? []) as Row[], client = (one.data?.client ?? null) as Row | null, booking = (one.data?.booking ?? null) as Row | null;
  const saved = (one.data?.saved_replies ?? []) as Row[], staff = (one.data?.staff ?? []) as Row[];
  const assignee = t?.assigned_staff_id ? String(staff.find((x) => x.id === t.assigned_staff_id)?.name ?? "") : "";

  // Opening a conversation marks it read, so the tab's badge is reloaded once it has opened.
  const opened = !!t;
  useEffect(() => { if (opened) refreshBadge(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [opened, refreshBadge]);
  useEffect(() => { if (sent) { const r = sentResult(sent, sentOn, modes); show(r.message, r.kind); }   }, []);

  // What this install can really do on this conversation's channel.
  let notice = "";
  if (t) {
    if (t.channel === "whatsapp" || t.channel === "sms") notice = modes[t.channel as "whatsapp" | "sms"] === "live" ? "" : `${channelLabel(t.channel)} is not connected yet. Replies are logged here, not sent to the client.`;
    else if (t.channel === "email" && !["live", "resend", "smtp"].includes(String(one.data?.mail_mode))) notice = "No mail provider is set up. Email replies are logged here, not sent.";
    else if (t.channel === "in_app" && !t.has_account) notice = "This client has no LogaLuxe account, so in-app replies are logged here and not delivered.";
  }

  const flow = useMemo(() => {
    const out: Flow[] = [];
    let last = "";
    for (const m of messages) {
      const day = dayOf(m.created_at, tz);
      if (day !== last) { out.push({ key: "d" + day, kind: "day", text: relDay(m.created_at, tz) }); last = day; }
      out.push({ key: String(m.id), kind: "msg", text: String(m.body ?? ""), msg: m });
    }
    if (notice) out.push({ key: "notice", kind: "sys", text: notice });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [one.data, notice, tz]);

  const count = messages.length;
  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 60);
    return () => clearTimeout(timer);
  }, [count]);

  const send = async () => {
    const body = text.trim();
    if (!body || !t) return;
    setSending(true);
    try {
      const out = await mapi<Row>(`/inbox/${encodeURIComponent(id)}/reply`, { method: "POST", body: { body } });
      setText("");
      const r = sentResult(String(out.delivery ?? ""), String(t.channel), modes);
      show(r.message, r.kind);
      await one.reload();
      refreshBadge();
    } catch (e) {
      show((e as Error).message, "bad");
    } finally {
      setSending(false);
    }
  };

  const update = async (body: Row, done: string, key: string) => {
    setWorking(key);
    try {
      await mapi(`/inbox/${encodeURIComponent(id)}`, { method: "PUT", body });
      setMenu(false); setAssign(false);
      show(done);
      await one.reload();
      refreshBadge();
    } catch (e) {
      setMenu(false); setAssign(false);
      show((e as Error).message, "bad");
    } finally {
      setWorking("");
    }
  };
  const closed = t?.status === "closed";
  const toggleDone = () => update({ status: closed ? "open" : "closed" }, closed ? "Conversation reopened." : "Marked done. Find it under Done.", "status");

  const insert = (piece: string, gap = "\n") => setText((now) => (now.trimEnd() ? `${now.trimEnd()}${gap}${piece}` : piece));

  const writeDraft = async () => {
    setDrafting(true); setDraftError("");
    try {
      const out = await mapi<Row>("/ai/reply", { method: "POST", body: { thread_id: id, hint: hint.trim().slice(0, 300) } });
      const draft = String(out.draft ?? "").trim();
      if (!draft) { setDraftError("Nothing came back. Try again."); return; }
      insert(draft, "\n\n"); // what was already typed is kept: the draft goes underneath it
      setDraftOpen(false); setHint("");
      show("The draft is in the reply box. Nothing has been sent.");
      void ai.reload();
    } catch (e) {
      setDraftError((e as Error).message || "The draft could not be written. Try again.");
    } finally {
      setDrafting(false);
    }
  };

  if (!t) {
    return (
      <View style={{ flex: 1, backgroundColor: sand }}>
        <Head name="" sub="" />
        <View style={{ padding: 16 }}>
          {one.loading || !s.ready ? <Loading label="Loading the conversation" /> : <Failed error={one.error || "Conversation not found."} onRetry={() => { void one.reload(); }} />}
        </View>
      </View>
    );
  }

  const name = String(t.client_name ?? "");
  const sub = [channelLabel(String(t.channel)), assignee ? `with ${firstName(assignee)}` : "unassigned", closed ? "done" : ""].filter(Boolean).join(" · ");
  const today = dayOf(new Date().toISOString(), tz);
  const bookingDay = booking ? (dayOf(booking.starts_at, tz) === today ? "today" : relDay(booking.starts_at, tz)) : "";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: sand }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Head name={name} sub={sub} channel={String(t.channel)} right={<RoundBtn icon="dots" label="More" onPress={() => setMenu(true)} />} />

      {/* Who this is and what they have booked: each line opens the fuller screen. */}
      <View style={{ backgroundColor: c.cream, paddingHorizontal: 16, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {client ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}'s profile`} onPress={() => router.push(`/m/client/${client.id}` as never)}
              style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.white, paddingHorizontal: 12, paddingVertical: 6, justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
              <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 13, color: c.ink }}>Client profile</Text>
              <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>{Number(client.visits) > 0 ? `${plural(Number(client.visits), "visit")} · ${money(client.spent_cents, cur)}` : "No visits yet"}{Number(client.no_show_count) > 0 ? ` · ${plural(Number(client.no_show_count), "no-show")}` : ""}</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.white, paddingHorizontal: 12, paddingVertical: 6, justifyContent: "center" }}>
              <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 16, color: c.muted }}>This person is not in your client list yet.</Text>
            </View>
          )}
          <Pressable accessibilityRole="button" accessibilityState={{ busy: working === "status" }} disabled={!!working} onPress={toggleDone}
            style={({ pressed }) => ({ minHeight: 44, borderRadius: 14, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: closed ? c.white : c.ink, borderWidth: 1, borderColor: closed ? c.line2 : c.ink, opacity: working ? 0.5 : pressed ? 0.85 : 1 })}>
            {closed ? null : <Icon name="check" size={15} color={c.cream} />}
            <Text style={{ fontFamily: f.semi, fontSize: 13, color: closed ? c.ink : c.cream }}>{closed ? "Reopen" : "Mark done"}</Text>
          </Pressable>
        </View>
        {booking ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open the booking: ${booking.services ?? "visit"} ${bookingDay} at ${clock(booking.starts_at, tz)}`} onPress={() => router.push(`/m/booking/${booking.id}` as never)}
            style={({ pressed }) => ({ minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.white, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.8 : 1 })}>
            <Icon name="calendar" size={18} color={c.wine} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 13, color: c.ink }}>{booking.services ?? "Visit"} · {bookingDay} {clock(booking.starts_at, tz)}</Text>
              <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>with {booking.staff} · {(STATUS_LABEL[booking.status] ?? String(booking.status)).toLowerCase()}</Text>
            </View>
            <Icon name="next" size={16} color={c.muted2} />
          </Pressable>
        ) : null}
      </View>

      <FlatList ref={listRef} data={flow} keyExtractor={(x) => x.key} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" accessibilityLabel="Messages"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><T size={13} muted center>No messages in this conversation yet.</T></View>}
        renderItem={({ item: x }) => {
          if (x.kind === "day") return <Text style={{ textAlign: "center", fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.muted, marginVertical: 4 }}>{x.text}</Text>;
          if (x.kind === "sys") return <View style={{ alignSelf: "center", maxWidth: "90%", backgroundColor: c.goldBg, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}><Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.goldInk, textAlign: "center" }}>{x.text}</Text></View>;
          const m = x.msg!, mine = !!m.from_business, state = mine ? deliveryLabel(String(m.delivery ?? "")) : "";
          const failed = mine && !["delivered", "sent", "logged"].includes(String(m.delivery));
          return (
            <View style={[{ maxWidth: "78%", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 },
              mine ? { alignSelf: "flex-end", backgroundColor: failed ? c.bad : c.ink, borderBottomRightRadius: 6 } : { alignSelf: "flex-start", backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderBottomLeftRadius: 6 }]}>
              <Text selectable style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: mine ? c.cream : c.ink }}>{x.text}</Text>
              <Text style={{ fontFamily: f.body, fontSize: 11, lineHeight: 14, marginTop: 4, color: mine ? "rgba(251,247,242,.72)" : c.muted }}>{[mine ? firstName(String(m.author ?? "")) : "", clock(m.created_at, tz), state].filter(Boolean).join(" · ")}</Text>
            </View>
          );
        }} />

      {flash ? <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}><Note kind={flash.kind}>{flash.text}</Note></View> : null}
      {one.error ? <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}><Note kind="bad">{one.error} New messages may be missing.</Note></View> : null}

      {/* Shortcuts that put text in the reply box. Nothing is sent until the person sends it. */}
      <View style={{ backgroundColor: sand }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
          {ai.data?.enabled ? (
            <Pressable accessibilityRole="button" onPress={() => { setDraftError(""); setDraftOpen(true); }}
              style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.goldBg, borderWidth: 1, borderColor: "#EBD9AE", flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.85 : 1 })}>
              <MbIcon name="spark" size={14} color={c.goldInk} stroke={2.2} />
              <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.goldInk }}>Draft a reply</Text>
            </Pressable>
          ) : null}
          {me?.slug ? <Chip onPress={() => insert(`Book here: ${WEB_URL}/b/${me.slug}`)}>Add booking link</Chip> : null}
          {saved.map((r) => <Chip key={r.id} onPress={() => insert(String(r.body))}>{r.title}</Chip>)}
        </ScrollView>
      </View>

      <Composer value={text} onChange={setText} onSend={send} busy={sending} placeholder={notice ? "Write a reply to log" : `Reply on ${channelLabel(String(t.channel))}`} sendLabel={notice ? "Log reply" : "Send"} />

      <Sheet open={menu} onClose={() => setMenu(false)} title={name} sub={sub}>
        <Choice title={closed ? "Reopen" : "Mark done"} sub={closed ? "Moves it back to Open" : "Moves it to Done. A new message from the client reopens it."} onPress={toggleDone} right={<View />} />
        <Choice title="Assign" sub={assignee ? `With ${assignee} now` : "Nobody has it yet"} onPress={() => { setMenu(false); setAssign(true); }} right={<Icon name="next" size={16} color={c.muted2} />} />
        {t.client_id ? <Choice title="Client profile" sub="Their history, notes and what they hold" onPress={() => { setMenu(false); router.push(`/m/client/${t.client_id}` as never); }} right={<Icon name="next" size={16} color={c.muted2} />} /> : null}
        {t.client_id ? <Choice title="Book them in" sub="Opens a new booking for this client" onPress={() => { setMenu(false); router.push(`/m/new-booking?client=${t.client_id}` as never); }} right={<Icon name="next" size={16} color={c.muted2} />} /> : null}
      </Sheet>

      <Sheet open={assign} onClose={() => setAssign(false)} title="Assign conversation" sub="It shows under Assigned to me for that person. The first person to reply to an unassigned conversation takes it.">
        <Choice title="Nobody" on={!t.assigned_staff_id} onPress={() => update({ assigned_staff_id: "" }, "Conversation is now unassigned.", "assign")} />
        {staff.map((x) => <Choice key={x.id} title={String(x.name)} on={t.assigned_staff_id === x.id} onPress={() => update({ assigned_staff_id: x.id }, "Conversation assigned.", "assign")} />)}
      </Sheet>

      <Sheet open={draftOpen} onClose={() => setDraftOpen(false)} title="Draft a reply" sub="The draft goes into the reply box for you to read and change. Nothing is sent until you send it."
        footer={<Btn busy={drafting} onPress={writeDraft}>{drafting ? "Writing a draft" : "Draft a reply"}</Btn>}>
        {draftError ? <Note kind="bad">{draftError}</Note> : null}
        <Field label="Anything it should say (optional)" value={hint} onChangeText={setHint} maxLength={300} placeholder="Say we can do 5pm" editable={!drafting} />
        <T size={12} muted>Written by AI from your menu, hours and this conversation. Read it before you send. The conversation is sent to OpenAI to write it.{Number(ai.data?.limit ?? 0) > 0 ? ` ${Number(ai.data?.used_today ?? 0)} of ${ai.data?.limit} drafts used today.` : ""}</T>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

// ---------- the first message to a client ----------

const WAYS: [string, string, "phone" | "email" | ""][] = [["", "Best way to reach them", ""], ["in_app", "In-app", ""], ["email", "Email", "email"], ["whatsapp", "WhatsApp", "phone"], ["sms", "SMS", "phone"]];

function NewThread({ clientId }: { clientId: string }) {
  const s = useSession();
  const mapi = useMapi();
  const refreshBadge = useBadgeRefresh();
  const [text, setText] = useState(""), [channel, setChannel] = useState(""), [sending, setSending] = useState(false), [error, setError] = useState("");
  const one = useLoad<Row>(() => (clientId ? mapi(`/clients/${encodeURIComponent(clientId)}`) : Promise.reject(new Error("Choose a client to write to, from the Clients tab or with New message in the Inbox."))), [clientId, s.businessToken]);
  const cl = one.data?.client as Row | undefined;
  const modes = useModes();
  const logOnly = (id: string) => (id === "whatsapp" || id === "sms") && modes[id] === "log";
  const off = (["whatsapp", "sms"] as const).filter((k) => modes[k] === "log").map((k) => (k === "sms" ? "SMS" : "WhatsApp"));

  const send = async () => {
    const body = text.trim();
    if (!body || !cl) return;
    setSending(true); setError("");
    try {
      const out = await mapi<Row>("/inbox", { method: "POST", body: { client_id: cl.id, channel, body } });
      refreshBadge();
      // The API picks the channel when none is chosen, so the next screen says only what is known.
      router.replace(`/m/thread/${out.id}?sent=${encodeURIComponent(String(out.delivery ?? ""))}&ch=${encodeURIComponent(channel)}` as never);
    } catch (e) {
      setError((e as Error).message);
      setSending(false);
    }
  };

  if (!cl) {
    return (
      <View style={{ flex: 1, backgroundColor: sand }}>
        <Head name="" sub="" />
        <View style={{ padding: 16 }}>
          {clientId && (one.loading || !s.ready) ? <Loading label="Loading the client" /> : <Failed error={one.error || "Client not found."} onRetry={clientId ? () => { void one.reload(); } : undefined} />}
        </View>
      </View>
    );
  }

  const name = String(cl.name);
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: sand }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Head name={name} sub="New message" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        {error ? <Note kind="bad">{error}</Note> : null}
        <T size={14} muted>This starts a conversation with {firstName(name)} in your Inbox, or adds to the one already there.</T>
        <View style={{ gap: 8 }}>
          <Label>Send by</Label>
          {WAYS.map(([id, label, needs]) => {
            const missing = needs === "email" ? !cl.email : needs === "phone" ? !cl.phone : false;
            return (
              <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected: channel === id, disabled: missing }} disabled={missing} onPress={() => setChannel(id)}
                style={{ minHeight: 48, borderRadius: radius.field, borderWidth: 1, borderColor: channel === id ? c.ink : c.line2, backgroundColor: c.white, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, opacity: missing ? 0.5 : 1 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: channel === id ? c.ink : c.line2, alignItems: "center", justifyContent: "center" }}>
                  {channel === id ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink }} /> : null}
                </View>
                <T size={14} weight="medium" style={{ flex: 1 }}>{label}{logOnly(id) ? ", logged only" : ""}{missing ? (needs === "email" ? " (no address on file)" : " (no number on file)") : ""}</T>
              </Pressable>
            );
          })}
          <T size={12} muted>In-app reaches clients who have a LogaLuxe account. Email goes out when a mail provider is set up.{off.length ? ` ${off.join(" and ")} ${off.length === 1 ? "is" : "are"} not connected yet, so those messages are logged, not sent.` : ""}</T>
        </View>
      </ScrollView>
      <Composer value={text} onChange={setText} onSend={send} busy={sending} placeholder={`Message ${firstName(name)}`} sendLabel="Send" />
    </KeyboardAvoidingView>
  );
}
