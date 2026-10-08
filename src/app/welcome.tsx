// The first thing a new person sees: what LogaLuxe is, and the two ways in.
// Someone here to book goes straight to browsing; someone who runs a business goes to its sign-in.
import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { Icon } from "@/components/ui";
import { api, media } from "@/lib/api";
import { markWelcomed } from "@/lib/first-run";
import { c, f, pad } from "@/lib/theme";

type Photo = { id: string; alt?: string };

/** The LogaLuxe mark: an arch with a four-point star inside. */
function Mark({ size = 30, color = "#FBF7F2" }: { size?: number; color?: string }) {
  return (
    <Svg width={(size * 32) / 40} height={size} viewBox="0 0 32 40" fill="none">
      <Path d="M3 38.6V16a13 13 0 0 1 26 0v22.6Z" stroke={color} strokeWidth={1.7} />
      <Path d="M16 15.2c.55 5.3 2.5 7.25 7.8 7.8-5.3.55-7.25 2.5-7.8 7.8-.55-5.3-2.5-7.25-7.8-7.8 5.3-.55 7.25-2.5 7.8-7.8Z" fill={color} />
    </Svg>
  );
}

/** One way in: a large row with a gold-ringed emblem, a title in the serif and one plain line. */
function Way({ emblem, title, line, onPress, dark }: { emblem: ReactNode; title: string; line: string; onPress: () => void; dark?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${line}`} onPress={onPress}
      style={({ pressed }) => [styles.way, dark ? { backgroundColor: c.ink, borderColor: c.ink } : null, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}>
      <View style={[styles.emblem, dark ? { borderColor: "rgba(212,175,90,.6)", backgroundColor: "rgba(212,175,90,.12)" } : null]}>{emblem}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: f.serifBold, fontSize: 20, lineHeight: 24, color: dark ? "#FBF7F2" : c.ink }}>{title}</Text>
        <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: dark ? "#C9BCB0" : c.muted, marginTop: 3 }}>{line}</Text>
      </View>
      <Icon name="next" size={18} color={dark ? c.gold : c.ink} stroke={2.2} />
    </Pressable>
  );
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [photo, setPhoto] = useState<Photo | null>(null);

  // One of the site's own photographs. Without one the screen stands on its colour alone.
  useEffect(() => {
    let on = true;
    api<{ media: Photo[] }>("/site/media?slot=hero").then((r) => { if (on && r.media?.length) setPhoto(r.media[0]); }).catch(() => undefined);
    return () => { on = false; };
  }, []);

  const go = (path: string) => { void markWelcomed(); router.replace(path as never); };
  const uri = media(photo?.id);

  return (
    <View style={{ flex: 1, backgroundColor: c.photo }}>
      {uri ? <Image source={{ uri }} accessibilityLabel={photo?.alt} resizeMode="cover" style={StyleSheet.absoluteFill} /> : null}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="lxWelcome" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1A1513" stopOpacity={0.55} />
            <Stop offset="0.28" stopColor="#1A1513" stopOpacity={0.1} />
            <Stop offset="0.5" stopColor="#1A1513" stopOpacity={0.55} />
            <Stop offset="0.72" stopColor="#1A1513" stopOpacity={0.94} />
            <Stop offset="1" stopColor="#1A1513" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lxWelcome)" />
      </Svg>

      <View style={{ flex: 1, paddingTop: insets.top + 18, paddingBottom: Math.max(insets.bottom, 18) + 6, paddingHorizontal: pad, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Mark />
          <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 22, letterSpacing: 0.4, color: "#FBF7F2" }}>LogaLuxe</Text>
        </View>

        <View>
          <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 1.6, color: c.gold }}>HAIR · BARBER · NAILS · SKIN · SPA</Text>
          <Text style={{ fontFamily: f.serifBold, fontSize: 38, lineHeight: 42, color: "#FBF7F2", marginTop: 10 }}>Beauty, booked{"\n"}in a minute.</Text>
          <Text style={{ fontFamily: f.body, fontSize: 15, lineHeight: 22, color: "#E0D5CA", marginTop: 10, maxWidth: 320 }}>
            See real prices and free times, choose who you want, and book. No calls, no waiting for a reply.
          </Text>

          <View style={{ gap: 10, marginTop: 24 }}>
            <Way title="Book an appointment" line="Find a professional near you and pick a time." onPress={() => go("/client/home")}
              emblem={<Icon name="calendar" size={20} color={c.goldInk} />} />
            <Way dark title="I run a beauty business" line="Your calendar, clients and payments in one place." onPress={() => go("/sign-in?side=business")}
              emblem={<Icon name="scissors" size={20} color={c.gold} />} />
          </View>

          <Pressable accessibilityRole="link" onPress={() => go("/sign-in")} hitSlop={8} style={{ minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 8 }}>
            <Text style={{ fontFamily: f.body, fontSize: 14, color: "#C9BCB0" }}>Already have an account? <Text style={{ fontFamily: f.semi, color: "#FBF7F2" }}>Sign in</Text></Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  way: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 22, backgroundColor: "#FBF7F2", borderWidth: 1, borderColor: "#FBF7F2" },
  emblem: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.gold, backgroundColor: c.goldBg },
});
