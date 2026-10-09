import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useSession } from "@/lib/session";

export function PushListener() {
  const s = useSession();
  useEffect(() => {
    if (Platform.OS === "web" || Constants.executionEnvironment === "storeClient") return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("expo-notifications").then(async n => {
      if (disposed) return;
      n.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
      const open = (r: import("expo-notifications").NotificationResponse) => {
        const path = r.notification.request.content.data?.path;
        // Only known local routes; never open arbitrary URLs from a notification payload.
        if (path === "/client/bookings" && s.clientToken) { s.setMode("client"); router.push("/client/bookings"); }
        if (path === "/client/inbox" && s.clientToken) { s.setMode("client"); router.push("/client/inbox"); }
        if (path === "/business/calendar" && s.businessToken) { s.setMode("business"); router.push("/business/calendar"); }
        if (path === "/m/inbox" && s.businessToken) { s.setMode("business"); router.push("/m/inbox"); }
      };
      const listener = n.addNotificationResponseReceivedListener(open);
      cleanup = () => listener.remove();
      const last = await n.getLastNotificationResponseAsync();
      if (!disposed && last) { open(last); await n.clearLastNotificationResponseAsync(); }
    }).catch(() => undefined);
    return () => { disposed = true; cleanup?.(); };
  }, [s]);
  return null;
}
