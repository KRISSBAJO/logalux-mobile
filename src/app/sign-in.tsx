// The one sign-in screen both sides share (design: A1-SignIn).
// The design signs in with a texted code. LogaLuxe accounts use an email and password today
// (texting is switched off), so this screen asks for those. The layout and tone follow the design.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, View } from "react-native";
import { Btn, Chip, Field, Note, Row, Screen, Serif, T } from "@/components/ui";
import { WEB_URL } from "@/lib/api";
import { useSession } from "@/lib/session";
import { c } from "@/lib/theme";

type Side = "client" | "business";

export default function SignIn() {
  const p = useLocalSearchParams<{ side?: string; next?: string; ref?: string }>();
  const s = useSession();
  const [side, setSide] = useState<Side>(p.side === "business" ? "business" : "client");
  const [creating, setCreating] = useState(!!p.ref);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [code, setCode] = useState("");
  const [first, setFirst] = useState(""), [last, setLast] = useState(""), [phone, setPhone] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");

  const done = () => {
    const next = typeof p.next === "string" && p.next.startsWith("/") ? p.next : side === "business" ? "/business/today" : "/client/home";
    router.replace(next as never);
  };

  const submit = async () => {
    setError("");
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    if (creating && side === "client" && !first.trim()) { setError("Tell us your first name."); return; }
    setBusy(true);
    try {
      if (side === "business") {
        const out = await s.signInBusiness(email.trim(), password, needCode ? code.trim() : undefined);
        if (out.needCode) { setNeedCode(true); setBusy(false); return; }
      } else if (creating) {
        await s.signUpClient({ first_name: first.trim(), last_name: last.trim(), email: email.trim(), phone: phone.trim(), password, ref: typeof p.ref === "string" ? p.ref : undefined });
      } else {
        await s.signInClient(email.trim(), password);
      }
      done();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const title = side === "business" ? "Run your day" : creating ? "Create your account" : "Welcome back";
  const sub = side === "business" ? "Sign in to your calendar, clients and payouts." : creating ? "Book in a few taps and keep every visit in one place." : "Sign in to see your bookings and rebook in a tap.";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <View style={{ paddingTop: 28, gap: 8 }}>
          <T size={13} weight="semi" color={c.wine} style={{ letterSpacing: 1.2, textTransform: "uppercase" }}>LogaLuxe</T>
          <Serif>{title}</Serif>
          <T muted>{sub}</T>
        </View>

        <Row gap={8} style={{ marginTop: 22 }}>
          <Chip on={side === "client"} onPress={() => { setSide("client"); setNeedCode(false); setError(""); }}>I am booking</Chip>
          <Chip on={side === "business"} onPress={() => { setSide("business"); setCreating(false); setError(""); }}>I run a business</Chip>
        </Row>

        <View style={{ marginTop: 22, gap: 16 }}>
          {error ? <Note kind="bad">{error}</Note> : null}
          {creating && side === "client" ? (
            <>
              <Row gap={10} style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}><Field label="First name" value={first} onChangeText={setFirst} autoComplete="given-name" textContentType="givenName" /></View>
                <View style={{ flex: 1 }}><Field label="Last name" value={last} onChangeText={setLast} autoComplete="family-name" textContentType="familyName" /></View>
              </Row>
              <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="+1 615 555 0144" hint="With the country code. The business uses it to reach you about a booking." />
            </>
          ) : null}
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={creating ? "new-password" : "current-password"} textContentType={creating ? "newPassword" : "password"} hint={creating ? "At least 8 characters." : undefined} returnKeyType="go" onSubmitEditing={() => { if (!needCode) void submit(); }} />
          {needCode ? <Field label="6-digit code from your authenticator app" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" hint="Lost your phone? Type one of your recovery codes instead." autoFocus returnKeyType="go" onSubmitEditing={() => void submit()} /> : null}
          <Btn onPress={submit} busy={busy}>{side === "business" ? (needCode ? "Sign in with code" : "Sign in") : creating ? "Create account" : "Sign in"}</Btn>

          {side === "client" ? (
            <Pressable accessibilityRole="button" onPress={() => { setCreating(!creating); setError(""); }} style={{ minHeight: 44, justifyContent: "center" }}>
              <T center muted>{creating ? "Already have an account? " : "New to LogaLuxe? "}<T weight="semi" color={c.wine}>{creating ? "Sign in" : "Create an account"}</T></T>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => router.push("/m/start" as never)} style={{ minHeight: 44, justifyContent: "center" }}>
              <T center muted>New here? <T weight="semi" color={c.wine}>List your business free</T></T>
            </Pressable>
          )}
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${WEB_URL}/${side === "business" ? "business/forgot" : "forgot"}`)} style={{ minHeight: 44, justifyContent: "center" }}>
            <T center weight="semi" color={c.wine} size={14}>Forgot your password?</T>
          </Pressable>
          {side === "client" ? <Btn kind="soft" onPress={() => router.replace("/client/home")}>Look around first</Btn> : null}
        </View>

        <T muted size={12} center style={{ marginTop: 24 }}>By continuing you agree to the LogaLuxe terms and privacy policy.</T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
