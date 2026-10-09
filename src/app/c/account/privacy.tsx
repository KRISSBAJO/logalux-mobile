import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { BackTitle, Grp, SignInGate } from "@/components/cc-ui";
import { Btn, Card, Failed, Field, Loading, Note, Screen, T } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";
import { shareFile } from "@/lib/mj-files";
import type { Row } from "@/lib/api";

export default function Privacy() {
  const s = useSession();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const q = useLoad(async () => s.clientToken ? s.capi<{ sessions: Row[] }>("/auth/sessions") : null, [s.clientToken]);
  if (!s.clientToken) return <SignInGate title="Privacy and devices" next="/c/account/privacy">Sign in to manage your account.</SignInGate>;
  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key); setError(""); setMessage("");
    try { await action(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };
  const revoke = (id: string) => run(id, async () => {
    await s.capi(`/auth/sessions/${id}`, { method: "DELETE" });
    await q.refresh(); setMessage("Signed out. That device must sign in again.");
  });
  return <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
    <BackTitle title="Privacy and devices" />
    {error ? <Note kind="bad">{error}</Note> : null}
    {message ? <Note kind="ok">{message}</Note> : null}
    <Grp>Your data</Grp>
    <Card style={{ padding: 18, gap: 12 }}>
      <T>Download your profile, bookings, orders, messages and account history as a JSON file. It contains personal information; share it only with people you trust.</T>
      <Btn disabled={!!busy} busy={busy === "export"} onPress={() => void run("export", async () => {
        const data = await s.capi("/auth/export");
        const result = await shareFile({ name: "logaluxe-account.json", mime: "application/json", text: JSON.stringify(data, null, 2) });
        if (result === "failed" || result === "unavailable") throw new Error("This device could not save the export. Try the website, or try again.");
        setMessage(result === "saved" ? "Your export was downloaded." : "The share sheet has closed. Save the file somewhere private.");
      })}>Export my data</Btn>
    </Card>
    <Grp>Signed-in devices</Grp>
    {q.error ? <Failed error={q.error} onRetry={q.reload} /> : null}
    {q.loading ? <Loading label="Loading devices" /> : null}
    <View style={{ gap: 12 }}>{q.data?.sessions?.map(device => <Card key={device.id} style={{ padding: 18, gap: 8 }}>
      <T weight="semi">{device.device_name || "Signed-in device"}{device.current ? " · This device" : ""}</T>
      <T size={13}>Last active: {new Date(device.last_seen_at).toLocaleString()}</T>
      {!device.current ? <Btn small kind="out" disabled={!!busy} onPress={() => void revoke(device.id)}>Sign out this device</Btn> : null}
    </Card>)}</View>
    <Btn kind="out" disabled={!!busy} onPress={() => void revoke("others")}>Sign out all other devices</Btn>
    <Grp>Delete account</Grp>
    <Card style={{ padding: 18, gap: 12 }}>
      <T>This permanently removes your profile and sign-in access. Resolve upcoming bookings, open orders and outstanding credit first. Financial records required by law are retained.</T>
      <T size={13}>For phone-only accounts, sign in again with a code within ten minutes before continuing.</T>
      <Field label="Current password, if you have one" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      <Field label="Type DELETE to confirm" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
      <Btn kind="out" disabled={confirm !== "DELETE" || !!busy} busy={busy === "delete"} onPress={() => void run("delete", async () => {
        await s.capi("/auth/delete", { body: { password, confirm } });
        await s.signOut("client"); router.replace("/client/home");
      })}>Permanently delete my account</Btn>
    </Card>
  </Screen>;
}
