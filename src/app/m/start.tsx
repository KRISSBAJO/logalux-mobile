// List your business: sign-up for a professional (design: M12-Onboarding, step 1).
// It sends what the web form sends to POST /v1/m/signup, then signs in and opens the setup checklist.
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LocationFields, emptyLocation, locationFieldsBody, locationProblem, type LocationValue } from "@/components/ca-location-fields";
import { Btn, Chip, Field, IconButton, Label, Note, Row, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

const CATEGORIES: [string, string][] = [["hair", "Hair"], ["braids", "Braids"], ["barber", "Barber"], ["nails", "Nails"], ["lashes", "Lashes & brows"], ["skin", "Skin"], ["makeup", "Makeup"], ["spa", "Spa & massage"]];

export default function Start() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const [v, setV] = useState({ business: "", category: "", name: "", email: "", phone: "", password: "", again: "" });
  const [loc, setLoc] = useState<LocationValue>(emptyLocation("US"));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [made, setMade] = useState(false); // the account exists but the sign-in after it failed
  const set = (change: Partial<typeof v>) => setV((x) => ({ ...x, ...change }));

  // Someone already signed in to a business has nothing to do here.
  if (s.ready && s.businessToken && !busy) return <Redirect href={"/m/onboarding" as never} />;

  const signIn = async () => {
    const out = await s.signInBusiness(v.email.trim(), v.password);
    if (out.needCode) { router.replace("/sign-in?side=business" as never); return; }
    router.replace("/m/onboarding?welcome=1" as never);
  };

  const submit = async () => {
    setError("");
    if (!v.category) { setError("Choose what you do."); return; }
    if (locationProblem(loc)) { setError(locationProblem(loc)); return; }
    if (v.password !== v.again) { setError("The two passwords do not match."); return; }
    setBusy(true);
    try {
      if (!made) {
        await api("/m/signup", { body: { name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim(), password: v.password, business: v.business.trim(), category: v.category, ...locationFieldsBody(loc) } });
        setMade(true);
      }
      await signIn();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const ng = loc.country === "NG";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.cream }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 12, paddingBottom: 28 }}>
        <Row between style={{ minHeight: 44 }}>
          <IconButton icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/sign-in?side=business" as never))} />
          <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.muted }}>Free to start</Text>
          <View style={{ width: 44 }} />
        </Row>

        <Text accessibilityRole="header" style={{ fontFamily: f.serif, fontSize: 30, lineHeight: 32, letterSpacing: -0.3, color: c.ink, marginTop: 14 }}>Tell us about your business</Text>
        <T muted style={{ marginTop: 8, lineHeight: 22 }}>This becomes your public profile. You can change everything later.</T>

        <View style={{ gap: 14, marginTop: 14 }}>
          {made ? <Note kind="gold">Your business is made. Signing in did not go through, so try again.</Note> : null}

          <Field label="Business name" value={v.business} onChangeText={(business) => set({ business })} maxLength={80} placeholder="Ada's Braid Studio" editable={!made} />
          <View style={{ gap: 6 }}>
            <Label>What do you do?</Label>
            <Row gap={8} wrap>
              {CATEGORIES.map(([k, name]) => <Chip key={k} on={v.category === k} onPress={() => set({ category: k })}>{name}</Chip>)}
            </Row>
          </View>
          <LocationFields value={loc} onChange={(change) => { if (!made) { setLoc((x) => ({ ...x, ...change })); setError(""); } }} error={error && /address|street|city|state|region/i.test(error) ? error : undefined} />

          <View style={{ height: 1, backgroundColor: c.line2, marginVertical: 4 }} />

          <Field label="Your name" value={v.name} onChangeText={(name) => set({ name })} maxLength={80} autoComplete="name" textContentType="name" />
          <Field label="Email" value={v.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!made} />
          <Field label="Phone" value={v.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" autoComplete="tel" placeholder={ng ? "+234 803 555 0100" : "+1 615 555 0100"} hint="With the country code." />
          <Field label="Password" value={v.password} onChangeText={(password) => set({ password })} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" hint="At least 10 characters." />
          <Field label="Password again" value={v.again} onChangeText={(again) => set({ again })} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
          <T size={13} muted style={{ lineHeight: 19 }}>Your listing goes live after a quick check by our team. You can set everything up while you wait.</T>
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.replace("/sign-in?side=business" as never)} style={{ minHeight: 44, justifyContent: "center", marginTop: 8 }}>
          <T center muted>Already listed? <T weight="semi" color={c.wine}>Sign in</T></T>
        </Pressable>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 28), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.cream }}>
        {error ? <View style={{ marginBottom: 10 }}><Note kind="bad">{error}</Note></View> : null}
        <Btn busy={busy} onPress={submit} style={{ minHeight: 52 }}>{made ? "Sign in" : "Create my business"}</Btn>
      </View>
    </KeyboardAvoidingView>
  );
}
