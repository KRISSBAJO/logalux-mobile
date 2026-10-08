// The client's own details and password (opened from Account: "Edit" and the settings button).
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, View } from "react-native";
import { BackTitle, Grp } from "@/components/cc-ui";
import { Btn, Card, Field, Note, Row, Screen, T } from "@/components/ui";
import { WEB_URL } from "@/lib/api";
import { useSession } from "@/lib/session";
import { c } from "@/lib/theme";

type Said = { kind: "ok" | "bad"; text: string } | null;

export default function Details() {
  const s = useSession();
  const u = s.customer;
  const [first, setFirst] = useState(""), [last, setLast] = useState(""), [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false), [said, setSaid] = useState<Said>(null);
  const [current, setCurrent] = useState(""), [next, setNext] = useState(""), [again, setAgain] = useState("");
  const [changing, setChanging] = useState(false), [pwSaid, setPwSaid] = useState<Said>(null);

  // Fill the form once the account is known.
  const known = u?.id;
  useEffect(() => {
    if (!u) return;
    setFirst(String(u.first_name ?? "")); setLast(String(u.last_name ?? "")); setPhone(String(u.phone ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known]);

  if (!s.ready) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
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
      await s.capi("/auth/me", { method: "PUT", body: { first_name: first.trim(), last_name: last.trim(), phone: phone.trim() } });
      await s.refresh();
      setSaid({ kind: "ok", text: "Your details are saved." });
    } catch (e) {
      setSaid({ kind: "bad", text: (e as Error).message });
    }
    setSaving(false);
  };

  const change = async () => {
    setPwSaid(null);
    if (!current) { setPwSaid({ kind: "bad", text: "Enter your current password." }); return; }
    if (next.length < 8) { setPwSaid({ kind: "bad", text: "Choose a new password of at least 8 characters." }); return; }
    if (next !== again) { setPwSaid({ kind: "bad", text: "The two new passwords do not match." }); return; }
    setChanging(true);
    try {
      await s.capi("/auth/password", { method: "POST", body: { current, new: next } });
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
          <Field label="Email" value={String(u.email ?? "")} editable={false} style={{ backgroundColor: c.cream2, color: c.muted }} hint="To change your email, write to us from the help page." />
          <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="+1 615 555 0100" hint="With the country code. A business uses it to reach you about a booking." />
          {said ? <Note kind={said.kind}>{said.text}</Note> : null}
          <Btn onPress={save} busy={saving}>Save details</Btn>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`${WEB_URL}/help`)} style={{ minHeight: 44, justifyContent: "center" }}>
            <T center weight="semi" color={c.wine} size={14}>Open the help page</T>
          </Pressable>
        </View>

        <Grp>Password</Grp>
        <View style={{ gap: 14 }}>
          <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" />
          <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" hint="At least 8 characters." />
          <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
          {pwSaid ? <Note kind={pwSaid.kind}>{pwSaid.text}</Note> : null}
          <Btn kind="out" onPress={change} busy={changing}>Change password</Btn>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
