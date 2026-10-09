import { usePathname } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useEffect, useMemo, useState } from "react";
import { makeTabBar } from "@/components/tab-bar";
import { useSession } from "@/lib/session";

export default function ClientTabs() {
  const s = useSession();
  const path = usePathname();
  const [unread, setUnread] = useState(0);

  // Messages waiting from businesses, for the Inbox tab. Counted when the person moves between
  // tabs and once a minute; a guest has none.
  useEffect(() => {
    if (!s.clientToken) return;
    let live = true;
    const count = () => s.capi<{ threads?: { unread_client?: number }[] }>("/auth/threads")
      .then((r) => { if (live) setUnread((r.threads ?? []).reduce((n, t) => n + Number(t.unread_client ?? 0), 0)); })
      .catch(() => undefined);
    void count();
    const timer = setInterval(count, 60000);
    return () => { live = false; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.clientToken, path]);

  const TabBar = useMemo(() => makeTabBar([
    { name: "home", label: "Home", icon: "home" },
    { name: "search", label: "Search", icon: "search" },
    { name: "bookings", label: "Bookings", icon: "calendar" },
    { name: "inbox", label: "Inbox", icon: "chat", badge: s.clientToken ? unread : 0 },
    { name: "profile", label: "Profile", icon: "user" },
  ]), [unread, s.clientToken]);

   
  return <Tabs screenOptions={{ headerShown: false }} tabBar={(p: any) => <TabBar {...p} />} />;
}
