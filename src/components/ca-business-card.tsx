// A business as a card. `BusinessCard` is the full-width search result (design: C2-Results);
// `BusinessTile` is the narrow one in a sideways row on Home (design: Main).
import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Icon, Row, T } from "@/components/ui";
import { media } from "@/lib/api";
import { bookAt, categoryLabel, slotLabel, type Biz, type Opening } from "@/lib/ca-data";
import { inCountry } from "@/lib/ca-place";
import { money } from "@/lib/format";
import { c, f, radius } from "@/lib/theme";

/** Where a business's own page lives, carrying how the visitor found it. */
export const profileHref = (slug: string, src = "") => `/c/b/${slug}${src ? `?src=${src}` : ""}`;

/** The small line over a card from a further tier of a filled row: "Elsewhere in the United States", "Elsewhere on LogaLuxe". "" for one near the place. */
export const tierLabel = (tier: string | undefined, scope: string) => (tier === "country" ? `Elsewhere in ${inCountry(scope)}` : tier === "anywhere" ? "Elsewhere on LogaLuxe" : "");

const ratingText = (b: Pick<Biz, "rating" | "review_count">) => (Number(b.review_count) > 0 ? Number(b.rating).toFixed(1) : "New");

/** The picture at the top of a card: the business's first photo, else its own colour with its category written on it. */
function Cover({ b, cover, height }: { b: Biz; cover?: string; height: number }) {
  const uri = media(cover);
  const label = categoryLabel(b.category);
  return (
    <View style={{ height, backgroundColor: b.tone || c.photo, justifyContent: "flex-end", overflow: "hidden" }}>
      {uri ? <Image source={{ uri }} accessibilityLabel={`${b.name}, photo`} resizeMode="cover" style={StyleSheet.absoluteFill} /> : (
        <>
          {/* No photo yet: the business's own colour, lit from one corner, with its initial set large behind the caption. */}
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="lxCover" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.2} />
                <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="1" stopColor="#000000" stopOpacity={0.28} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#lxCover)" />
          </Svg>
          <Text style={[styles.monogram, { fontSize: height * 1.05, lineHeight: height * 1.1, bottom: -height * 0.2 }]}>{b.name.replace(/^the\s+/i, "").charAt(0).toUpperCase()}</Text>
          {label ? <Text style={styles.caption}>{label}</Text> : null}
        </>
      )}
    </View>
  );
}

type CardProps = {
  b: Biz;
  /** Media id of the business's first photo, when it has one. */
  cover?: string;
  /** Its next free times. `undefined` while they are being fetched, `null` when it has none. */
  opening?: Opening | null;
  saved?: boolean;
  onSave?: () => void;
  /** How the visitor found this business ("search", "app"): it travels to the page and into the booking. */
  src?: string;
};

export function BusinessCard({ b, cover, opening, saved, onSave, src = "" }: CardProps) {
  const reviews = Number(b.review_count) || 0;
  // How far it is comes first when the list was asked from a point. A business that travels to clients is marked so.
  const facts = [b.distance_text || "", b.travels ? "Comes to you" : "", b.area || b.city, b.verification_status === "verified" ? "Verified" : ""].filter(Boolean).join(" · ");
  const slots = (opening?.slots ?? []).slice(0, 3);
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${b.name}${facts ? `, ${facts}` : ""}`} onPress={() => router.push(profileHref(b.slug, src) as never)} style={({ pressed }) => pressed && { opacity: 0.9 }}>
        <Cover b={b} cover={cover} height={150} />
        <View style={styles.rating}>
          <Icon name="star" size={12} color={c.gold} fill={c.gold} />
          <Text style={{ fontFamily: f.bold, fontSize: 13, color: c.ink }}>{ratingText(b)}</Text>
          {reviews > 0 ? <Text style={{ fontFamily: f.medium, fontSize: 11, color: c.muted }}>({reviews})</Text> : null}
        </View>
        {b.promoted ? <View style={styles.promoted}><Text style={{ fontFamily: f.semi, fontSize: 12, color: "#F4ECE3" }}>Promoted</Text></View> : null}
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: slots.length || opening === null ? 8 : 14, gap: 8 }}>
          <Row between>
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.bold, fontSize: 16, color: c.ink }}>{b.name}</Text>
            {b.from_cents != null ? <Text style={{ fontFamily: f.body, fontSize: 14, color: c.muted }}>from <Text style={{ fontFamily: f.bold, fontSize: 16, color: c.ink }}>{money(b.from_cents, b.currency)}</Text></Text> : null}
          </Row>
          {facts ? <T muted size={13} numberOfLines={1}>{facts}</T> : null}
        </View>
      </Pressable>
      {onSave ? (
        <Pressable accessibilityRole="button" accessibilityLabel={saved ? `Remove ${b.name} from saved` : `Save ${b.name}`} accessibilityState={{ selected: !!saved }} onPress={onSave} hitSlop={4} style={styles.save}>
          <Icon name="heart" size={16} color={saved ? c.wine : c.ink} fill={saved ? c.wine : "none"} />
        </Pressable>
      ) : null}
      {slots.length ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 6 }}>
          <T muted size={12} numberOfLines={1}>Next for {opening!.service}</T>
          <Row gap={8} wrap>
            {slots.map((s) => {
              const label = slotLabel(s.starts_at, b.timezone);
              return (
                <Pressable key={s.starts_at + s.staff_id} accessibilityRole="button" accessibilityLabel={`Book ${opening!.service}, ${label}, with ${s.staff}`} hitSlop={{ top: 6, bottom: 6 }}
                  onPress={() => router.push(bookAt(b.slug, [opening!.service_id], s, b.timezone, src) as never)}
                  style={({ pressed }) => [styles.slot, pressed && { opacity: 0.8 }]}>
                  <Text style={{ fontFamily: f.semi, fontSize: 12, color: c.goldInk }}>{label}</Text>
                </Pressable>
              );
            })}
          </Row>
        </View>
      ) : opening === null ? (
        <T muted size={12} style={{ paddingHorizontal: 14, paddingBottom: 14 }}>No free times in the next few weeks.</T>
      ) : null}
    </View>
  );
}

export function BusinessTile({ b, cover, src = "", note, tag }: { b: Biz; cover?: string; src?: string; /** A line in place of the usual facts, for example its next free time. */ note?: string; /** A small line over the name, for a card from a further tier of a filled row. */ tag?: string }) {
  const facts = note ?? [b.distance_text || "", categoryLabel(b.category), b.area || b.city, b.from_cents != null ? `from ${money(b.from_cents, b.currency)}` : ""].filter(Boolean).join(" · ");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${b.name}${facts ? `, ${facts}` : ""}`} onPress={() => router.push(profileHref(b.slug, src) as never)} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.9 }]}>
      <Cover b={b} cover={cover} height={120} />
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
        {tag ? <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", color: c.goldInk, marginBottom: 4 }}>{tag}</Text> : null}
        <Row between gap={8}>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.bold, fontSize: 15, color: c.ink }}>{b.name}</Text>
          <Row gap={4}>
            <Icon name="star" size={12} color={c.gold} fill={c.gold} />
            <Text style={{ fontFamily: f.bold, fontSize: 13, color: c.ink }}>{ratingText(b)}</Text>
          </Row>
        </Row>
        {facts ? <T muted size={12} numberOfLines={1} style={{ marginTop: 4 }}>{facts}</T> : null}
      </View>
    </Pressable>
  );
}

/** A tile in the row where a professional is missing: there are fewer on LogaLuxe than the row holds, so the space invites one. */
export function FirstHereTile({ place, onPress }: { place: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Be the first professional in ${place}. List your business`} onPress={onPress} style={({ pressed }) => [styles.tile, styles.first, pressed && { opacity: 0.9 }]}>
      <View style={{ height: 120, alignItems: "center", justifyContent: "center", backgroundColor: c.cream2 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.white, alignItems: "center", justifyContent: "center" }}><Icon name="plus" size={20} color={c.goldInk} /></View>
      </View>
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
        <Text numberOfLines={2} style={{ fontFamily: f.bold, fontSize: 15, lineHeight: 20, color: c.ink }}>Be the first professional in {place}</Text>
        <T size={12} weight="semi" color={c.wine} style={{ marginTop: 4 }}>List your business</T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, overflow: "hidden" },
  tile: { width: 220, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, overflow: "hidden" },
  first: { borderStyle: "dashed", borderColor: c.line2 },
  monogram: { position: "absolute", right: 10, fontFamily: f.serifBold, color: "rgba(255,255,255,.13)" },
  caption: { fontFamily: f.medium, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: "rgba(255,255,255,.6)", padding: 12 },
  rating: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.cream, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  promoted: { position: "absolute", top: 112, right: 10, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(26,21,19,.82)" },
  save: { position: "absolute", top: 10, right: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(251,247,242,.92)", alignItems: "center", justifyContent: "center" },
  slot: { minHeight: 32, borderRadius: radius.pill, paddingHorizontal: 10, justifyContent: "center", backgroundColor: c.goldBg },
});
