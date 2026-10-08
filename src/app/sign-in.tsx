// The one sign-in screen both sides share (design: A1-SignIn).
// A client signs in with an email and password, and, while an admin has "Sign in with a texted code"
// switched on, with a 6-digit code sent to their phone: the three steps of the design (number, code,
// name). A business always signs in with its password and, if it has one, its two-step code.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, Text, TextInput, View } from "react-native";
import { CodeBoxes, CodeLink, mmss, notSent, useWait } from "@/components/mp-code";
import { Btn, Chip, Field, Icon, Loading, Note, Pill, Row, Screen, Serif, T } from "@/components/ui";
import { api, ApiError, WEB_URL, type Row as Data } from "@/lib/api";
import { refreshFeatures, useFeatures } from "@/lib/mp-features";
import { useSession } from "@/lib/session";
import { c, f, radius } from "@/lib/theme";

type Side = "client" | "business";
type Step = "phone" | "code" | "name";
type Via = "sms" | "whatsapp";
const CODES = ["+1", "+234"] as const;

export default function SignIn() {
  const p = useLocalSearchParams<{ side?: string; next?: string; ref?: string }>();
  const s = useSession();
  const ft = useFeatures();
  const [side, setSide] = useState<Side>(p.side === "business" ? "business" : "client");
  useEffect(() => { setSide(p.side === "business" ? "business" : "client"); }, [p.side]);
  const [creating, setCreating] = useState(!!p.ref);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [code, setCode] = useState("");
  const [first, setFirst] = useState(""), [last, setLast] = useState(""), [phone, setPhone] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");

  // ----- a texted code (clients only, and only while it is switched on) -----
  const [way, setWay] = useState<"code" | "email" | null>(null);
  const [step, setStep] = useState<Step>("phone");
  const [cc, setCc] = useState<(typeof CODES)[number]>("+1");
  const [number, setNumber] = useState("");
  const [via, setVia] = useState<Via>("sms");
  const [sentTo, setSentTo] = useState(""), [sentHow, setSentHow] = useState("");
  const [otp, setOtp] = useState("");
  const [needPassword, setNeedPassword] = useState("");
  const wait = useWait(30);
  const codeOn = side === "client" && ft.sms_login;
  const byCode = codeOn && !creating && (way ?? "code") === "code";
  const channel: Via = ft.whatsapp ? via : "sms";
  const ref = typeof p.ref === "string" ? p.ref : undefined;

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
        await s.signUpClient({ first_name: first.trim(), last_name: last.trim(), email: email.trim(), phone: phone.trim(), password, ref });
      } else {
        await s.signInClient(email.trim(), password);
      }
      done();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  /** The number with its country code. One pasted whole ("+1 615 555 0144") is taken as it is. */
  const fullNumber = () => {
    const raw = number.trim();
    if (raw.startsWith("+")) return "+" + raw.replace(/\D/g, "");
    const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
    return digits ? cc + digits : "";
  };

  const sendCode = async (by: Via, to = fullNumber()) => {
    setError(""); setNeedPassword("");
    if (to.replace(/\D/g, "").length < 8) { setError("Enter your mobile number."); return; }
    setBusy(true);
    try {
      const out = await api<Data>("/auth/code/send", { body: { phone: to, channel: by } });
      setSentTo(to); setVia(by); setSentHow(String(out.sent ?? "")); setOtp(""); setStep("code"); wait.start();
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.status === 404) void refreshFeatures(); // switched off a moment ago: the email form takes over
    }
    setBusy(false);
  };

  const verify = async (value: string, named = false) => {
    if (busy) return;
    setError("");
    if (value.length !== 6) { setError("Enter the 6-digit code."); return; }
    if (named && !first.trim()) { setError("Tell us your first name."); return; }
    setBusy(true);
    try {
      const out = await api<Data>("/auth/code/verify", { body: { phone: sentTo, code: value, ...(named ? { first_name: first.trim(), last_name: last.trim(), email: email.trim(), ref } : {}) } });
      await s.signInClientToken(String(out.token));
      done();
      return;
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && err.body?.need === "name") setStep("name"); // the code is right and is not used up: it is sent again with the name
      else if (err.status === 409 && err.body?.need === "password") setNeedPassword(err.message);
      else {
        setError(err.message);
        if (err.status === 401) { setOtp(""); setStep("code"); } // wrong, or it ran out while the name was being typed
        if (err.status === 404) void refreshFeatures();
      }
    }
    setBusy(false);
  };

  const useEmail = () => { setWay("email"); setStep("phone"); setOtp(""); setError(""); setNeedPassword(""); };
  const title = side === "business" ? "Run your day"
    : byCode ? (step === "phone" ? "Book beauty you can trust." : step === "code" ? "Enter the code" : "What should we call you?")
    : creating ? "Create your account" : "Welcome back";
  const sub = side === "business" ? "Sign in to your calendar, clients and payouts."
    : byCode ? (step === "phone" ? (ft.whatsapp ? "Enter your mobile number. We send a 6-digit code by text, or on WhatsApp if you prefer." : "Enter your mobile number and we will text you a 6-digit code.") : step === "name" ? "Your professional sees this name on their calendar." : "")
    : creating ? "Book in a few taps and keep every visit in one place." : "Sign in to see your bookings and rebook in a tap.";
  const masked = sentTo.length > 8 ? `${sentTo.slice(0, -7)} ··· ${sentTo.slice(-4)}` : sentTo;
  const inFlow = byCode && step !== "phone";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <View style={{ paddingTop: 28, gap: 8 }}>
          <T size={13} weight="semi" color={c.wine} style={{ letterSpacing: 1.2, textTransform: "uppercase" }}>LogaLuxe</T>
          {byCode ? (
            <View accessibilityLabel={`Step ${step === "phone" ? 1 : step === "code" ? 2 : 3} of 3`} style={{ flexDirection: "row", gap: 6, marginTop: 6, marginBottom: 6 }}>
              {[true, step !== "phone", step === "name"].map((on, i) => <View key={i} style={{ flex: 1, height: 3, borderRadius: 3, backgroundColor: on ? c.ink : c.line2 }} />)}
            </View>
          ) : null}
          {byCode && step === "name" ? <Pill kind="ok">Number verified</Pill> : null}
          <Serif>{title}</Serif>
          {byCode && step === "code" ? (
            <Row gap={6} wrap>
              <T muted>{sentHow === "logged" ? "For" : channel === "whatsapp" ? "Sent on WhatsApp to" : "Sent by text to"} <T weight="semi">{masked}</T>.</T>
              <CodeLink disabled={busy} onPress={() => { setStep("phone"); setOtp(""); setError(""); setNeedPassword(""); }}>Change</CodeLink>
            </Row>
          ) : <T muted>{sub}</T>}
        </View>

        <View style={{ height: 22 }} />

        {side === "client" && !ft.loaded ? <Loading label="Loading the ways to sign in" /> : byCode ? (
          <View style={{ marginTop: 22, gap: 16 }}>
            {error ? <Note kind="bad">{error}</Note> : null}

            {step === "phone" ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", minHeight: 56, borderRadius: radius.field, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, overflow: "hidden" }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Country code ${cc}. Change to ${cc === "+1" ? "+234" : "+1"}`} onPress={() => setCc(cc === "+1" ? "+234" : "+1")}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, minHeight: 56, borderRightWidth: 1, borderRightColor: c.line2, opacity: pressed ? 0.7 : 1 })}>
                    <Text style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{cc}</Text>
                    <Icon name="down" size={14} stroke={2.2} />
                  </Pressable>
                  <TextInput accessibilityLabel="Mobile number" value={number} onChangeText={setNumber} keyboardType="phone-pad" inputMode="tel" autoComplete="tel" textContentType="telephoneNumber" autoFocus={way === "code"}
                    placeholder={cc === "+1" ? "(615) 555 0144" : "803 555 0144"} placeholderTextColor={c.muted2} returnKeyType="go" onSubmitEditing={() => void sendCode(channel)}
                    style={{ flex: 1, minHeight: 56, paddingHorizontal: 14, fontFamily: f.body, fontSize: 17, letterSpacing: 0.3, color: c.ink }} />
                </View>
                {ft.whatsapp ? (
                  <Row gap={8} wrap>
                    <T size={13} muted>Send the code</T>
                    <Chip on={channel === "sms"} onPress={() => setVia("sms")}>By text</Chip>
                    <Chip on={channel === "whatsapp"} onPress={() => setVia("whatsapp")}>On WhatsApp</Chip>
                  </Row>
                ) : null}
                <Btn onPress={() => void sendCode(channel)} busy={busy}>Continue</Btn>
                <Row gap={12}>
                  <View style={{ flex: 1, height: 1, backgroundColor: c.line2 }} />
                  <T size={12} color={c.muted2}>or</T>
                  <View style={{ flex: 1, height: 1, backgroundColor: c.line2 }} />
                </Row>
                <Btn kind="out" onPress={useEmail}>Use email and password</Btn>
                <Btn kind="soft" onPress={() => router.replace("/client/home")}>Look around first</Btn>
              </>
            ) : step === "code" ? (
              <>
                {sentHow === "logged" && !needPassword ? <Note kind="gold">{notSent(channel)} Use your email and password instead.</Note> : null}
                {needPassword ? (
                  <View style={{ gap: 10 }}>
                    <Note kind="gold">{needPassword}</Note>
                    <Btn onPress={useEmail}>Sign in with email and password</Btn>
                  </View>
                ) : (
                  <>
                    <CodeBoxes value={otp} onChange={(v) => { setOtp(v); setError(""); }} onFull={(v) => void verify(v)} bad={!!error} disabled={busy} autoFocus />
                    <Row between wrap gap={8}>
                      {wait.left > 0
                        ? <View style={{ minHeight: 44, justifyContent: "center" }}><T size={13} muted>Send a new code in {mmss(wait.left)}</T></View>
                        : <CodeLink disabled={busy} onPress={() => void sendCode(channel, sentTo)}>Send a new code</CodeLink>}
                      {ft.whatsapp ? <CodeLink disabled={busy} onPress={() => void sendCode(channel === "whatsapp" ? "sms" : "whatsapp", sentTo)}>{channel === "whatsapp" ? "Send by text instead" : "Send on WhatsApp instead"}</CodeLink> : null}
                    </Row>
                    <Btn onPress={() => void verify(otp)} busy={busy} disabled={otp.length !== 6}>Verify</Btn>
                    <Pressable accessibilityRole="button" onPress={useEmail} style={{ minHeight: 44, justifyContent: "center" }}>
                      <T center weight="semi" color={c.wine} size={14}>Use email and password instead</T>
                    </Pressable>
                  </>
                )}
                <T muted size={12} center>Codes work for 10 minutes. A new code replaces the one before it.</T>
              </>
            ) : (
              <>
                <Field label="First name" value={first} onChangeText={setFirst} maxLength={60} autoComplete="given-name" textContentType="givenName" autoFocus />
                <Field label="Last name (optional)" value={last} onChangeText={setLast} maxLength={60} autoComplete="family-name" textContentType="familyName" />
                <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" hint="Booking confirmations and receipts go to it. We send a link to confirm it." returnKeyType="go" onSubmitEditing={() => void verify(otp, true)} />
                <Btn onPress={() => void verify(otp, true)} busy={busy}>Start booking</Btn>
              </>
            )}
          </View>
        ) : (
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
            {codeOn ? <Btn kind="out" onPress={() => { setWay("code"); setCreating(false); setStep("phone"); setError(""); }}>Text me a code instead</Btn> : null}

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
        )}

        {inFlow ? null : (
          <Pressable accessibilityRole="link" hitSlop={8} style={{ minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 6 }}
            onPress={() => { setNeedCode(false); setCreating(false); setError(""); router.setParams({ side: side === "business" ? "client" : "business" }); }}>
            <T muted size={13}>{side === "business" ? "Here to book an appointment? " : "Run a beauty business? "}<T size={13} weight="semi" color={c.wine}>{side === "business" ? "Client sign-in" : "Business sign-in"}</T></T>
          </Pressable>
        )}
        <T muted size={12} center style={{ marginTop: 10 }}>By continuing you agree to the LogaLuxe terms and privacy policy.</T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
