import { useFormReset } from "../../lib/form-reset";
// Your own account on the business side: name, phone, password, and how two-step sign-in stands.
// Every team member can open this, whatever their role.
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { Grp, Header, Tag, Wait } from "@/components/mc-kit";
import { Btn, Card, Failed, Field, Note, Row, Screen, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { plural, when } from "@/lib/format";
import { ROLE, signedIn, soft } from "@/lib/mc-util";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";
import { c, f } from "@/lib/theme";

export default function Account() {
  const s = useSession();
  const m = s.merchant;
  // The phone number on file comes with the business's settings, which only a manager or the owner may read.
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, async () => {
    const [security, settings] = await Promise.all([s.mapi<Data>("/security"), soft(() => s.mapi<Data>("/settings"))]);
    return { security, account: (settings.data?.account ?? null) as Data | null };
  }), [s.businessToken]);

  const [name, setName] = useState(String(m?.name ?? "")), [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [current, setCurrent] = useState(""), [next, setNext] = useState(""), [again, setAgain] = useState("");
  const [pwBusy, setPwBusy] = useState(false), [pwNote, setPwNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  useFormReset([data?.account], () => {
    if (data?.account) { setName(String(data.account.name ?? "")); setPhone(String(data.account.phone ?? "")); }
  });

  const saveDetails = async () => {
    setSaving(true); setSaved(null);
    try {
      await s.mapi("/account", { method: "PUT", body: { name: name.trim(), phone: phone.trim() } });
      await s.refresh();
      setSaved({ kind: "ok", text: "Your details are saved." });
    } catch (e) {
      setSaved({ kind: "bad", text: (e as Error).message });
    }
    setSaving(false);
  };

  const changePassword = async () => {
    setPwNote(null);
    if (next !== again) { setPwNote({ kind: "bad", text: "The two new passwords do not match." }); return; }
    setPwBusy(true);
    try {
      // Passwords are sent as typed: a space at either end may be part of one.
      await s.mapi("/password", { body: { current, new: next } });
      setCurrent(""); setNext(""); setAgain("");
      setPwNote({ kind: "ok", text: "Password changed. Your other devices have been signed out." });
    } catch (e) {
      setPwNote({ kind: "bad", text: (e as Error).message });
    }
    setPwBusy(false);
  };

  const signOut = async () => {
    await s.signOut("business");
    router.replace("/sign-in?side=business" as never);
  };

  const sec = data?.security;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen onRefresh={refresh} refreshing={refreshing}>
        <Header title="Your account" />
        <T muted size={14} style={{ marginTop: 10 }}>{m ? `${ROLE[m.role] ?? m.role} at ${m.business}. You sign in with ${m.email}.` : ""}</T>

        <Grp>Your details</Grp>
        <View style={{ gap: 14 }}>
          {saved ? <Note kind={saved.kind}>{saved.text}</Note> : null}
          <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={80} />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="+1 615 555 0100" hint={data && !data.account ? "With the country code. Leave it empty to keep the number already on file." : "With the country code."} />
          <Btn onPress={saveDetails} busy={saving}>Save details</Btn>
        </View>

        <Grp style={{ marginTop: 24 }}>Password</Grp>
        <View style={{ gap: 14 }}>
          {pwNote ? <Note kind={pwNote.kind}>{pwNote.text}</Note> : null}
          <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" />
          <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" hint="At least 10 characters." />
          <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
          <Btn kind="out" onPress={changePassword} busy={pwBusy} disabled={!current || !next}>Change password</Btn>
        </View>

        <Grp style={{ marginTop: 24 }}>Two-step sign-in</Grp>
        {error ? <Failed error={error} onRetry={reload} /> : !sec ? <Wait /> : (
          <Card style={{ padding: 16, gap: 8 }}>
            <Row between>
              <T weight="semi" size={14}>{sec.two_step ? "A code from your authenticator app is asked for at sign-in" : "Your password alone signs you in"}</T>
              <Tag kind={sec.two_step ? "ok" : "grey"}>{sec.two_step ? "On" : "Off"}</Tag>
            </Row>
            <T size={13} muted>
              {sec.two_step ? `${plural(Number(sec.recovery_left ?? 0), "recovery code")} left. ` : "Turning it on means a stolen password is not enough to get in. "}
              {`You are signed in in ${plural(Number(sec.sessions ?? 0), "place")} now.`}
              {sec.last_login_at ? ` Last sign-in ${when(sec.last_login_at, m?.timezone)}.` : ""}
            </T>
            <Pressable accessibilityRole="button" onPress={() => router.push("/m/security" as never)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ fontFamily: f.semi, fontSize: 14, color: c.wine }}>{sec.two_step ? "Manage or turn off" : "Turn it on with an authenticator app"}</Text></Pressable>
          </Card>
        )}

        <Btn kind="danger" icon="out" onPress={signOut} style={{ marginTop: 24 }}>Sign out</Btn>
      </Screen>
    </KeyboardAvoidingView>
  );
}
