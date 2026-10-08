// Two-step sign-in for the signed-in person: GET /v1/m/security, then POST /2fa/setup, /2fa/enable
// and /2fa/disable. The set-up key and the recovery codes are held only on this screen while it is
// open; nothing is stored on the phone. Every team member can use this, whatever their role.
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Grp, Item, SmallBtn, Tag, mc } from "@/components/mc-kit";
import { Gate, Night, Page, backTo } from "@/components/mi-kit";
import { Btn, Card, Field, Icon, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { plural, when } from "@/lib/format";
import { ask, copyText, signedIn } from "@/lib/mc-util";
import { type Flash } from "@/lib/mi-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";
import { router } from "expo-router";

const back = backTo("/m/settings");
const MONO = "monospace";

export default function Security() {
  const s = useSession();
  const m = s.merchant;
  const { data, error, reload, refresh, refreshing } = useLoad(signedIn(s, () => s.mapi<Data>("/security")), [s.businessToken]);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [code, setCode] = useState(""), [codeError, setCodeError] = useState("");
  const [password, setPassword] = useState(""), [pwError, setPwError] = useState("");
  const [busy, setBusy] = useState(""), [note, setNote] = useState<Flash>(null), [copied, setCopied] = useState("");

  if (!data) return <Gate title="Two-step sign-in" onBack={back} error={error} onRetry={reload} />;

  const on = !!data.two_step, left = Number(data.recovery_left ?? 0);

  const start = async () => {
    setBusy("start"); setNote(null);
    try {
      setSetup(await s.mapi<{ secret: string; uri: string }>("/2fa/setup", { body: {} }));
      setCode(""); setCodeError(""); setCopied("");
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
      await refresh();
    }
    setBusy("");
  };

  const finish = async () => {
    const digits = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(digits)) { setCodeError("Enter the 6 digits your authenticator app shows."); return; }
    setBusy("finish"); setCodeError(""); setNote(null);
    try {
      const out = await s.mapi<{ recovery_codes: string[] }>("/2fa/enable", { body: { code: digits } });
      setRecovery(out.recovery_codes ?? []); setSetup(null); setCode(""); setCopied("");
      await refresh();
      setNote({ kind: "ok", text: "Two-step sign-in is on. Save your recovery codes now: they are shown only once." });
    } catch (e) {
      setCodeError((e as Error).message);
    }
    setBusy("");
  };

  const stop = async () => {
    if (!password) { setPwError("Enter your password to turn it off."); return; }
    setBusy("stop"); setPwError(""); setNote(null);
    try {
      await s.mapi("/2fa/disable", { body: { password } });
      setPassword(""); setRecovery(null);
      await refresh();
      setNote({ kind: "ok", text: "Two-step sign-in is off. Your password alone signs you in." });
    } catch (e) {
      setPwError((e as Error).message);
    }
    setBusy("");
  };

  const copy = async (text: string, what: string) => setCopied((await copyText(text)) === "copied" ? `${what} copied.` : `${what} could not be copied. Press and hold to select instead.`);
  const doneWithCodes = async () => {
    if (!(await ask("Have you saved them?", "The recovery codes cannot be shown again. If you lose your phone, one of them is the only way in.", "I have saved them"))) return;
    setRecovery(null); setCopied("");
    setNote({ kind: "ok", text: "Two-step sign-in is on." });
  };

  const key = setup ? setup.secret.replace(/(.{4})/g, "$1 ").trim() : "";

  return (
    <Page title="Two-step sign-in" onBack={back} note={note} onRefresh={setup || recovery ? undefined : refresh} refreshing={refreshing}>
      <Night style={{ marginTop: 16 }}>
        <Row between style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: f.medium, fontSize: 12, color: mc.nightMuted }}>{String(data.email ?? m?.email ?? "")}</Text>
            <Text style={{ fontFamily: f.serifBold, fontSize: 24, lineHeight: 28, color: mc.onNight, marginTop: 6 }}>{on ? "Password and a code" : "Password only"}</Text>
          </View>
          <Tag kind={on ? "ok" : "night"}>{on ? "On" : "Off"}</Tag>
        </Row>
        <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: mc.nightMuted, marginTop: 8 }}>
          {on ? `Signing in needs your password and a 6-digit code from your authenticator app. You have ${plural(left, "recovery code")} left${left <= 2 ? "; turn it off and set it up again to get a fresh set" : ""}.`
            : `A 6-digit code from your phone at every sign-in means a stolen password alone cannot get into your calendar, your clients or your payouts.${m?.role === "owner" ? " We recommend it for every owner." : ""}`}
        </Text>
        <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: mc.nightMuted, marginTop: 8 }}>
          {`Signed in in ${plural(Number(data.sessions ?? 0), "place")} now.`}{data.last_login_at ? ` Last sign-in ${when(data.last_login_at, m?.timezone)}.` : ""}
        </Text>
      </Night>

      {/* The recovery codes, shown once */}
      {recovery ? (
        <>
          <Grp>Save your recovery codes</Grp>
          <Card style={{ padding: 16, gap: 12 }}>
            <T size={13} muted>Each code signs you in once if you lose your phone. They are shown only now, so write them down or keep them in a password manager.</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {recovery.map((r) => (
                <View key={r} style={{ width: "48.5%", backgroundColor: mc.tile, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                  <Text selectable style={{ fontFamily: MONO, fontSize: 15, letterSpacing: 1, color: c.ink }}>{r}</Text>
                </View>
              ))}
            </View>
            {copied ? <T size={13} weight="medium" color={c.ok}>{copied}</T> : null}
            <Row gap={8} wrap>
              <SmallBtn kind="ink" onPress={() => copy(recovery.join("\n"), "Recovery codes")}>Copy all</SmallBtn>
              <SmallBtn onPress={doneWithCodes}>I have saved them</SmallBtn>
            </Row>
          </Card>
        </>
      ) : null}

      {/* Off: start, or finish a set-up that was started */}
      {!on && !setup ? (
        <>
          <Grp>How it works</Grp>
          <Card style={{ padding: 16, gap: 8 }}>
            {["Install an authenticator app, such as Google Authenticator, Authy or 1Password.", "Add LogaLuxe to it with the key we give you.", "Type the 6-digit code it shows, and keep the recovery codes we give you."].map((t, i) => (
              <Row key={i} gap={10} style={{ alignItems: "flex-start" }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.goldBg, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: f.bold, fontSize: 12, color: c.goldInk }}>{i + 1}</Text></View>
                <T size={13} style={{ flex: 1 }}>{t}</T>
              </Row>
            ))}
          </Card>
          <Btn busy={busy === "start"} onPress={start} style={{ marginTop: 16 }}>Set up two-step sign-in</Btn>
        </>
      ) : null}

      {!on && setup ? (
        <>
          <Grp>1 · Add the key to your authenticator app</Grp>
          <Card style={{ padding: 16, gap: 14 }}>
            <SmallBtn kind="ink" onPress={() => { void Linking.openURL(setup.uri).catch(() => setCopied("No authenticator app answered. Copy the key and add it by hand.")); }} style={{ alignSelf: "flex-start" }}>Open my authenticator app</SmallBtn>
            <T size={13} muted>If the app is on this phone, that adds LogaLuxe in one step. Otherwise copy the key below, or scan the code from another device.</T>
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.muted }}>Key</Text>
              <Text selectable accessibilityLabel={`Set-up key: ${key}`} style={{ fontFamily: MONO, fontSize: 16, lineHeight: 24, letterSpacing: 1, color: c.ink }}>{key}</Text>
              <Row gap={8} wrap>
                <SmallBtn onPress={() => copy(setup.secret, "Key")}>Copy the key</SmallBtn>
              </Row>
              {copied ? <T size={13} weight="medium" color={/could not|No authenticator/.test(copied) ? c.bad : c.ok}>{copied}</T> : null}
            </View>
            <View style={{ alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 14 }}>
              <View accessible accessibilityRole="image" accessibilityLabel="QR code for your authenticator app" style={{ padding: 10, backgroundColor: c.white, borderRadius: 12, borderWidth: 1, borderColor: c.line2 }}>
                <QRCode value={setup.uri} size={176} color={c.ink} backgroundColor={c.white} />
              </View>
              <T size={12} muted center>Scan this with the authenticator app on another phone.</T>
            </View>
          </Card>

          <Grp>2 · Enter the code it shows</Grp>
          <View style={{ gap: 12 }}>
            <Field label="6-digit code" value={code} onChangeText={(v) => { setCode(v.replace(/[^\d ]/g, "")); setCodeError(""); }} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={7} placeholder="000000" error={codeError || undefined} onSubmitEditing={finish}
              style={{ textAlign: "center", letterSpacing: 6, fontSize: 22, fontFamily: f.semi }} />
            <Btn busy={busy === "finish"} onPress={finish}>Turn on</Btn>
            <Btn kind="out" disabled={busy === "finish"} onPress={() => { setSetup(null); setCode(""); setCodeError(""); setNote({ kind: "ok", text: "Setup cancelled. Nothing changed." }); }}>Cancel setup</Btn>
          </View>
        </>
      ) : null}

      {/* On: turn it off with the password */}
      {on && !recovery ? (
        <>
          <Grp>Turn it off</Grp>
          <View style={{ gap: 12 }}>
            <Field label="Your password, to turn it off" value={password} onChangeText={(v) => { setPassword(v); setPwError(""); }} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" error={pwError || undefined} />
            <Btn kind="danger" busy={busy === "stop"} onPress={stop}>Turn off two-step sign-in</Btn>
            <T size={12} muted>Lost your phone? Sign in with a recovery code in place of the 6-digit code, then turn this off and set it up again.</T>
          </View>
        </>
      ) : null}

      <Grp style={{ marginTop: 24 }}>Also yours</Grp>
      <Card>
        <Item last icon={<Icon name="user" size={18} />} title="Your account" sub="Your name, phone and password" onPress={() => router.push("/m/account" as never)} />
      </Card>
    </Page>
  );
}
