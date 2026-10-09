import Constants from "expo-constants";
import * as Device from "expo-device";
import { useState } from "react";
import { Linking, Platform, View } from "react-native";
import { Btn, Note, T } from "@/components/ui";
import { useSession } from "@/lib/session";

export function PushSettings() {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const enable = async () => {
    setBusy(true); setNote(null);
    try {
      if (Platform.OS === "web" || !Device.isDevice || Constants.executionEnvironment === "storeClient") {
        throw new Error("Push notifications need the installed LogaLuxe phone app.");
      }
      const n = await import("expo-notifications");
      if (Platform.OS === "android") await n.setNotificationChannelAsync("default", { name: "LogaLuxe updates", importance: n.AndroidImportance.DEFAULT });
      let permission = await n.getPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await n.requestPermissionsAsync();
      if (!permission.granted) throw new Error("Notifications are off. You can allow them in your phone settings.");
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) throw new Error("Notifications are not configured in this build.");
      const token = (await n.getExpoPushTokenAsync({ projectId })).data;
      if (s.mode === "business") await s.mapi("/push", { body: { token, platform: Platform.OS } });
      else await s.capi("/auth/push", { body: { token, platform: Platform.OS } });
      setNote({ kind: "ok", text: "Notifications are on for this account on this phone." });
    } catch (e) { setNote({ kind: "bad", text: e instanceof Error ? e.message : "Could not enable notifications. Please try again." }); }
    finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true); setNote(null);
    try {
      if (s.mode === "business") await s.mapi("/push", { method: "DELETE" });
      else await s.capi("/auth/push", { method: "DELETE" });
      setNote({ kind: "ok", text: "Notifications are off for this sign-in." });
    } catch { setNote({ kind: "bad", text: "Could not turn notifications off. Please try again." }); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 10, paddingVertical: 18 }}>
    <T weight="semi">Phone notifications</T>
    <T muted size={13}>Booking updates and new messages. Message contents stay private on your lock screen.</T>
    {note && <Note kind={note.kind}>{note.text}</Note>}
    <Btn onPress={() => void enable()} disabled={busy}>{busy ? "Please wait…" : "Enable notifications"}</Btn>
    <Btn onPress={() => void disable()} disabled={busy}>Turn off for this sign-in</Btn>
    {Platform.OS !== "web" && <Btn onPress={() => void Linking.openSettings()}>Open phone settings</Btn>}
  </View>;
}
