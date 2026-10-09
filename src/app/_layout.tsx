import { BodoniModa_500Medium, BodoniModa_500Medium_Italic, BodoniModa_600SemiBold } from "@expo-google-fonts/bodoni-moda";
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "@/lib/session";
import { c } from "@/lib/theme";

export default function RootLayout() {
  const [loaded, fontError] = useFonts({ BodoniModa_500Medium, BodoniModa_500Medium_Italic, BodoniModa_600SemiBold, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold });
  if (!loaded && !fontError) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.cream } }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
