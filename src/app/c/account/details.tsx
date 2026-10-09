import { usePlace } from "@/lib/ca-place";
// The client's own details and password (opened from Account: "Edit" and the settings button).
// While an admin has them switched on: confirming the mobile number with a code, and choosing how to
// hear about bookings. Each is hidden entirely while it is off.
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, View } from "react-native";
import { BackTitle, Choice, Grp } from "@/components/cc-ui";
import { PhoneConfirm } from "@/components/mp-code";
import { Btn, Card, Field, Note, Row, Screen, T } from "@/components/ui";
import { WEB_URL } from "@/lib/api";
import { useFeatures } from "@/lib/mp-features";
import { useSession } from "@/lib/session";
import { c } from "@/lib/theme";

type Said = { kind: "ok" | "bad"; text: string } | null;

export default function Details() {
  const s = useSession();
  const where = usePlace();
  const u = s.customer;
  const ft = useFeatures();
  const [hearBusy, setHearBusy] = useState(""), [hearSaid, setHearSaid] = useState<Said>(null);
  const [first, setFirst] = useState(""), [last, setLast] = useState(""), [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false), [said, setSaid] = useState<Said>(null);
  const [current, setCurrent] = useState(""), [next, setNext] = useState(""), [again, setAgain] = useState("");
  const [changing, setChanging] = useState(false), [pwSaid, setPwSaid] = useState<Said>(null);

  const [known, setKnown] = useState<string | undefined>();
  if (u && known !== u.id) {
    setKnown(u.id); setFirst(String(u.first_name ?? "")); setLast(String(u.last_name ?? "")); setPhone(String(u.phone ?? ""));
    setEmail(""); setCurrent(""); setNext(""); setAgain(""); setSaid(null); setPwSaid(null);
  }

  if (!s.ready) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
  if (s.clientToken && !u) return <Screen><BackTitle title="Your details" /><Note kind="bad">Your account could not be loaded.</Note><Btn onPress={() => void s.refresh()}>Try again</Btn></Screen>;
  if (!s.clientToken || !u) {
    return (
      <Screen><BackTitle title="Your details" />
        <Card style={{ marginTop: 18, padding: 22, gap: 12 }}>
          <T weight="semi" size={16}>Sign in to change your details</T>
          <Btn onPress={() => router.push("/sign-in?next=%2Fc%2Faccount%2Fdetails" as never)}>Sign in</Btn>
        </Card>
      </Screen>
    );
  }

  const save = async () => {
    setSaid(null);
    if (!first.trim()) { setSaid({ kind: "bad", text: "Tell us your first name." }); return; }
    setSaving(true);
    try {
      await s.capi("/auth/me", { method: "PUT", body: { first_name: first.trim(), last_name: last.trim(), phone: phone.trim(), ...(!u.email ? { email: email.trim() } : {}) } });
      await s.refresh();
      setSaid({ kind: "ok", text: "Your details are saved." });
    } catch (e) {
      setSaid({ kind: "bad", text: (e as Error).message });
    }
    setSaving(false);
  };

  // How they hear about bookings. Email always goes; a phone channel is offered only while it is live.
  // An account made with a texted code may have no email at all: then the phone is the only place a message can go.
  const hasEmail = !!u.email;
  const ways: [string, string][] = [["email", hasEmail ? "Email only" : "Nothing on my phone"], ...(ft.sms_messages ? [["sms", hasEmail ? "Email and a text" : "A text"] as [string, string]] : []), ...(ft.whatsapp ? [["whatsapp", hasEmail ? "Email and WhatsApp" : "WhatsApp"] as [string, string]] : [])];
  const prefers = String(u.preferred_channel ?? "");
  const hears = ways.some(([k]) => k === prefers) ? prefers : "email";
  const hear = async (channel: string) => {
    if (channel === hears && channel === prefers) return;
    setHearBusy(channel); setHearSaid(null);
    try {
      await s.capi("/auth/channel", { method: "PUT", body: { channel } });
      await s.refresh();
      setHearSaid({ kind: "ok", text: channel === "email" ? (hasEmail ? "Saved. Booking confirmations come by email." : "Saved.") : `Saved. Booking confirmations come ${hasEmail ? "by email and " : ""}${channel === "sms" ? "by text" : "on WhatsApp"}.` });
    } catch (e) {
      setHearSaid({ kind: "bad", text: (e as Error).message });
    }
    setHearBusy("");
  };

  const change = async () => {
    setPwSaid(null);
    if (u.has_password && !current) { setPwSaid({ kind: "bad", text: "Enter your current password." }); return; }
    if (next.length < 8) { setPwSaid({ kind: "bad", text: "Choose a new password of at least 8 characters." }); return; }
    if (next !== again) { setPwSaid({ kind: "bad", text: "The two new passwords do not match." }); return; }
    setChanging(true);
    try {
      await s.capi("/auth/password", { method: "POST", body: { current, new: next } });
      await s.refresh();
      setCurrent(""); setNext(""); setAgain("");
      setPwSaid({ kind: "ok", text: "Password changed. Other devices have been signed out." });
    } catch (e) {
      setPwSaid({ kind: "bad", text: (e as Error).message });
    }
    setChanging(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <BackTitle title="Your details" />

        <Grp>Name and contact</Grp>
        <View style={{ gap: 14 }}>
          <Row gap={10} style={{ alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}><Field label="First name" value={first} onChangeText={setFirst} maxLength={60} autoComplete="given-name" textContentType="givenName" /></View>
            <View style={{ flex: 1 }}><Field label="Last name" value={last} onChangeText={setLast} maxLength={60} autoComplete="family-name" textContentType="familyName" /></View>
          </Row>
          <Field label="Email" value={String(u.email || email)} onChangeText={setEmail} editable={!u.email} autoCapitalize="none" keyboardType="email-address" style={{ backgroundColor: c.cream2, color: c.muted }} hint={u.email ? "To change your email, write to us from the help page." : "Add an email and save your details. Then set a password below to sign in either way."} />
          <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder={where.scope === "NG" ? "+234 800 000 0000" : "+1 615 555 0100"} hint="With the country code. A business uses it to reach you about a booking." />
          {ft.sms_login ? <PhoneConfirm saved={String(u.phone ?? "")} typed={phone} confirmed={u.phone_verified === true} whatsapp={ft.whatsapp} /> : null}
          {said ? <Note kind={said.kind}>{said.text}</Note> : null}
          <Btn onPress={save} busy={saving}>Save details</Btn>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`${WEB_URL}/help`)} style={{ minHeight: 44, justifyContent: "center" }}>
            <T center weight="semi" color={c.wine} size={14}>Open the help page</T>
          </Pressable>
        </View>

        {ways.length > 1 ? (
          <>
            <Grp>How to hear about bookings</Grp>
            <View accessibilityRole="radiogroup" style={{ gap: 8, opacity: hearBusy ? 0.6 : 1 }}>
              {ways.map(([k, label]) => <Choice key={k} on={hears === k} onPress={() => { if (!hearBusy) void hear(k); }}>{label}</Choice>)}
              <T size={13} muted>{!hasEmail ? `This account has no email address, so a booking confirmation can only reach you on your phone${u.phone ? `, ${u.phone}` : ""}.` : u.phone ? `A booking confirmation always comes by email. With a phone choice it also goes to ${u.phone}.` : "A booking confirmation always comes by email. Add a mobile number above to get it on your phone as well."}</T>
              {hearSaid ? <Note kind={hearSaid.kind}>{hearSaid.text}</Note> : null}
            </View>
          </>
        ) : null}

        {/* An account with no email has no password: it signs in with a code. */}
        <Grp style={u.email ? undefined : { display: "none" }}>Password</Grp>
        <View style={{ gap: 14, display: u.email ? "flex" : "none" }}>
          <Field label={u.has_password ? "Current password" : "No current password needed"} editable={u.has_password === true} value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" />
          <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" hint="At least 8 characters." />
          <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
          {pwSaid ? <Note kind={pwSaid.kind}>{pwSaid.text}</Note> : null}
          <Btn kind="out" onPress={change} busy={changing}>{u.has_password ? "Change password" : "Set password"}</Btn>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
