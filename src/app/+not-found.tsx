// An address the app does not know: a stale link, or a screen that moved. Shown in the app's own
// style instead of the router's default page.
import { Link, Stack, router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Icon, Serif, T } from "@/components/ui";
import { useSession } from "@/lib/session";
import { c, pad } from "@/lib/theme";

export default function NotFound() {
  const insets = useSafeAreaInsets();
  const s = useSession();
  const home = s.mode === "business" && s.businessToken ? "/business/today" : "/client/home";
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={{ flex: 1, backgroundColor: c.cream, paddingHorizontal: pad, paddingTop: insets.top + 80, paddingBottom: insets.bottom + 24, alignItems: "center" }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.goldBg, alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
          <Icon name="search" size={28} color={c.goldInk} />
        </View>
        <Serif size={26} center>There is nothing here</Serif>
        <T muted center size={15} style={{ marginTop: 10, maxWidth: 300 }}>That link does not go anywhere in LogaLuxe. It may be old, or the screen may have moved.</T>
        <View style={{ gap: 10, marginTop: 28, alignSelf: "stretch" }}>
          <Btn onPress={() => (router.canGoBack() ? router.back() : router.replace(home as never))}>Go back</Btn>
          <Link href={home as never} replace asChild><Btn kind="soft">Start again</Btn></Link>
        </View>
      </View>
    </>
  );
}
