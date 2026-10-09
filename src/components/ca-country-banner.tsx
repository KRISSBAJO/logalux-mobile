// Shown while someone is browsing a country other than the one we think they are in, so they are
// never surprised by a currency: "You are browsing Nigeria. Prices are in naira." One press goes back.
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { T } from "@/components/ui";
import { inCountry, moneyName, usePlace } from "@/lib/ca-place";
import { c } from "@/lib/theme";

export function CountryBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const w = usePlace();
  if (!w.abroad) return null;
  return (
    <View accessibilityRole="alert" style={[{ borderRadius: 14, backgroundColor: c.goldBg, paddingHorizontal: 14, paddingVertical: 10, gap: 4 }, style]}>
      <T size={13.5} color={c.goldInk}>You are browsing <T size={13.5} weight="semi" color={c.goldInk}>{inCountry(w.scope)}</T>. Local listings are priced in {moneyName(w.scope)}. Existing bookings, orders and credit keep their own currency.</T>
      <Pressable accessibilityRole="button" onPress={() => void w.forget()} hitSlop={8} style={{ minHeight: 32, justifyContent: "center", alignSelf: "flex-start" }}>
        <T size={13.5} weight="semi" color={c.wine}>Back to {inCountry(w.home)}</T>
      </Pressable>
    </View>
  );
}
