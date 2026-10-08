// Pieces of the client's Home that are not a business tile: the picture banner a newcomer sees,
// the list of who is free soonest, and the closing note for people who run a business.
import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { profileHref } from "@/components/ca-business-card";
import { Avatar, Btn, Icon } from "@/components/ui";
import { media } from "@/lib/api";
import { bookAt, categoryLabel, slotLabel, type Biz, type Opening } from "@/lib/ca-data";
import { c, f, radius } from "@/lib/theme";

export type HeroPhoto = { id: string; alt?: string };

/** A dark wash over a picture so words on it can be read: clear at the top, deep at the bottom. */
function Wash() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="lxWash" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1A1513" stopOpacity={0.05} />
          <Stop offset="0.45" stopColor="#1A1513" stopOpacity={0.35} />
          <Stop offset="1" stopColor="#1A1513" stopOpacity={0.9} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#lxWash)" />
    </Svg>
  );
}

/** The banner at the top of Home for someone with no visit to rebook: a real photo, how many are taking bookings, and one way in. */
export function HeroCard({ photo, city, count, onPress }: { photo?: HeroPhoto; city: string; count: number; onPress: () => void }) {
  const uri = media(photo?.id);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`See who is free in ${city}`} onPress={onPress} style={({ pressed }) => [styles.hero, pressed && { opacity: 0.94 }]}>
      {uri ? <Image source={{ uri }} accessibilityLabel={photo?.alt} resizeMode="cover" style={StyleSheet.absoluteFill} /> : null}
      <Wash />
      <View style={{ padding: 18, gap: 6 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 1.2, color: c.gold }}>{city.toUpperCase()}</Text>
        <Text style={{ fontFamily: f.serifBold, fontSize: 27, lineHeight: 31, color: "#FBF7F2" }}>Find your next appointment</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
          <Text style={{ flex: 1, fontFamily: f.body, fontSize: 13, lineHeight: 18, color: "#E9DED3" }}>
            {count === 1 ? "1 professional is" : `${count} professionals are`} taking bookings. Pick a time and it is yours.
          </Text>
          <View style={styles.heroGo}>
            <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.ink }}>See who is free</Text>
            <Icon name="next" size={14} stroke={2.4} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** Who can take a client soonest, one business to a row, each free time a button that books it. */
export function SoonestList({ items, openings, tag }: { items: Biz[]; openings: Record<string, Opening>; /** A small line over a business from a further tier of a filled row. */ tag?: (b: Biz) => string }) {
  return (
    <View style={styles.list}>
      {items.map((b, i) => {
        const o = openings[b.slug];
        const rated = Number(b.review_count) > 0;
        const over = tag?.(b) ?? "";
        return (
          <View key={b.slug} style={{ paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, gap: 10 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${b.name}`} onPress={() => router.push(profileHref(b.slug, "app") as never)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.8 : 1 })}>
              <Avatar name={b.name} tone={b.tone || c.wine} size={44} />
              <View style={{ flex: 1 }}>
                {over ? <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", color: c.goldInk, marginBottom: 2 }}>{over}</Text> : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: f.bold, fontSize: 15, color: c.ink }}>{b.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Icon name="star" size={11} color={c.gold} fill={c.gold} />
                    <Text style={{ fontFamily: f.semi, fontSize: 12, color: c.ink }}>{rated ? Number(b.rating).toFixed(1) : "New"}</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12.5, color: c.muted, marginTop: 2 }}>{[o.service, b.distance_text || "", b.area || categoryLabel(b.category)].filter(Boolean).join(" · ")}</Text>
              </View>
              <Icon name="next" size={16} color={c.muted2} />
            </Pressable>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingLeft: 56 }}>
              {o.slots.slice(0, 2).map((s) => {
                const label = slotLabel(s.starts_at, b.timezone);
                return (
                  <Pressable key={s.starts_at + s.staff_id} accessibilityRole="button" accessibilityLabel={`Book ${o.service} at ${b.name}, ${label}`} hitSlop={{ top: 6, bottom: 6 }}
                    onPress={() => router.push(bookAt(b.slug, [o.service_id], s, b.timezone, "app") as never)} style={({ pressed }) => [styles.slot, pressed && { opacity: 0.8 }]}>
                    <Text style={{ fontFamily: f.semi, fontSize: 12, color: c.goldInk }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The last thing on Home: the way in for someone who runs a business. */
export function ListYours({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.yours}>
      <Text style={{ fontFamily: f.serifBold, fontSize: 20, lineHeight: 24, color: c.ink }}>Run a salon, a chair or a barbershop?</Text>
      <Text style={{ fontFamily: f.body, fontSize: 13.5, lineHeight: 19, color: c.muted }}>Take bookings here, with your calendar, clients and payments in one place. Listing is free.</Text>
      <Btn kind="ink" small onPress={onPress} style={{ alignSelf: "flex-start", marginTop: 6 }}>List your business</Btn>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 232, borderRadius: 22, overflow: "hidden", backgroundColor: c.photo, justifyContent: "flex-end" },
  heroGo: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.gold },
  list: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingHorizontal: 14 },
  slot: { minHeight: 32, borderRadius: radius.pill, paddingHorizontal: 12, justifyContent: "center", backgroundColor: c.goldBg },
  yours: { backgroundColor: c.cream2, borderRadius: radius.card, padding: 20, gap: 6 },
});
