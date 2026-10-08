import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { wasWelcomed } from "@/lib/first-run";
import { useSession } from "@/lib/session";
import { c } from "@/lib/theme";

// Where the app opens. A signed-in business person who was last on that side goes to their day.
// Someone new is welcomed once. Everyone else lands on the client side, which a guest can browse.
export default function Start() {
  const s = useSession();
  const [welcomed, setWelcomed] = useState<boolean | null>(null);
  useEffect(() => { void wasWelcomed().then(setWelcomed); }, []);
  if (!s.ready || welcomed === null) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
  if (s.mode === "business" && s.businessToken) return <Redirect href="/business/today" />;
  if (!welcomed && !s.clientToken && !s.businessToken) return <Redirect href="/welcome" />;
  return <Redirect href="/client/home" />;
}
