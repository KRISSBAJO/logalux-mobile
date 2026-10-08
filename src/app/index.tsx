import { Redirect } from "expo-router";
import { View } from "react-native";
import { useSession } from "@/lib/session";
import { c } from "@/lib/theme";

// Where the app opens: the business side for someone signed in to a business and last looking at it,
// otherwise the client side, which a guest can browse too.
export default function Start() {
  const s = useSession();
  if (!s.ready) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
  return <Redirect href={s.mode === "business" && s.businessToken ? "/business/today" : "/client/home"} />;
}
