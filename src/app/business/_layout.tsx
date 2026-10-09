import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { makeTabBar } from "@/components/tab-bar";
import { useSession } from "@/lib/session";

export default function BusinessTabs() {
  const s = useSession();
  if (s.ready && !s.businessToken) return <Redirect href="/sign-in?side=business" />;
  const inbox = Number(s.merchant?.badges?.inbox ?? 0);
  const TabBar = makeTabBar([
    { name: "today", label: "Today", icon: "home" },
    { name: "calendar", label: "Calendar", icon: "calendar" },
    { name: "clients", label: "Clients", icon: "users" },
    { name: "inbox", label: "Inbox", icon: "chat", badge: inbox },
    { name: "more", label: "More", icon: "menu" },
  ]);
   
  return <Tabs screenOptions={{ headerShown: false }} tabBar={(p: any) => <TabBar {...p} />} />;
}
