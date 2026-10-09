// An article as a card: the tall featured one (cover or motif under a dark wash, the way the Home banner
// is drawn), the narrow tile in a sideways row, and the full-width row in the list.
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { T } from "@/components/ui";
import { media } from "@/lib/api";
import { articleHref, categoryTone, journalCategoryLabel, readingLabel, type Article } from "@/lib/cj-data";
import { c, f, radius } from "@/lib/theme";

// ---------- the motif an article without a cover shows, drawn like the kit's icons ----------

const MOTIFS: Record<string, { paths: string[]; circles?: [number, number, number][] }> = {
  hair: { paths: ["M3 7c3 0 3 4 6 4s3-4 6-4 3 4 6 4", "M3 13c3 0 3 4 6 4s3-4 6-4 3 4 6 4", "M3 19c3 0 3 4 6 4s3-4 6-4 3 4 6 4"] },
  braids: { paths: ["M8 2c5 4 5 16 0 20", "M16 2c-5 4-5 16 0 20", "M8 2h8", "M8 22h8"] },
  barber: { paths: ["M20 4 8.5 15.5", "M14.5 14.5 20 20", "M8.5 8.5 12 12"], circles: [[6, 6, 3], [6, 18, 3]] },
  nails: { paths: ["M7 22V9a5 5 0 0 1 10 0v13", "M7 14h10", "M9.5 9.5c0-1.5 1-2.5 2.5-2.5s2.5 1 2.5 2.5"] },
  lashes: { paths: ["M2 13s4-7 10-7 10 7 10 7-4 6-10 6S2 13 2 13Z", "M12 6V2.5", "M7 7 5.5 4", "M17 7l1.5-3"], circles: [[12, 13, 3]] },
  skin: { paths: ["M12 2.5s6.5 7 6.5 12a6.5 6.5 0 0 1-13 0c0-5 6.5-12 6.5-12Z", "M9 15a3 3 0 0 0 3 3"] },
  makeup: { paths: ["M8 22h8v-9H8Z", "M10 13V7.5l4-3V13", "M8 17h8"] },
  spa: { paths: ["M4 20C4 10 10 4 20 4c0 10-6 16-16 16Z", "M4 20 14 10", "M9 15c2-1 4-1 6 0"] },
  business: { paths: ["M3 21h18", "M6 17v-5", "M11 17V8", "M16 17v-7", "M21 17V5"] },
  guide: { paths: ["M3 4h6a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H3Z", "M21 4h-6a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h7Z"] },
};

/** The category's line drawing, faint and large, on the article's dark ground. */
export function Motif({ category, size = 120, color = "rgba(255,255,255,.16)", stroke = 1.4 }: { category: string; size?: number; color?: string; stroke?: number }) {
  const m = MOTIFS[category] ?? MOTIFS.guide;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {(m.circles ?? []).map(([x, y, r], i) => <Circle key={"c" + i} cx={x} cy={y} r={r} />)}
      {m.paths.map((d, i) => <Path key={i} d={d} />)}
    </Svg>
  );
}

/** A dark wash so words on a picture can be read: clear at the top, deep at the bottom. */
function Wash({ id, deep = 0.9 }: { id: string; deep?: number }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.ink} stopOpacity={0.05} />
          <Stop offset="0.45" stopColor={c.ink} stopOpacity={0.32} />
          <Stop offset="1" stopColor={c.ink} stopOpacity={deep} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** The ground of a card: the cover picture, or the category's colour with its motif drawn large in one corner. */
export function Cover({ a, height, style, motif = 150, children }: { a: Article; height?: number; style?: StyleProp<ViewStyle>; motif?: number; children?: ReactNode }) {
  const uri = media(a.cover_media_id);
  return (
    <View style={[{ height, backgroundColor: categoryTone(a.category), overflow: "hidden" }, style]}>
      {uri ? <Image source={{ uri }} accessibilityLabel={a.cover_alt || ""} resizeMode="cover" style={StyleSheet.absoluteFill} /> : (
        <>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="cjGround" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.16} />
                <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="1" stopColor="#000000" stopOpacity={0.25} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#cjGround)" />
          </Svg>
          <View pointerEvents="none" style={{ position: "absolute", right: -motif * 0.12, top: -motif * 0.08 }}><Motif category={a.category} size={motif} /></View>
        </>
      )}
      {children}
    </View>
  );
}

const open = (a: Article) => router.push(articleHref(a.slug) as never);
const kicker = (a: Article) => [journalCategoryLabel(a), readingLabel(a)].filter(Boolean).join(" · ");

/** The featured piece: tall, the title over a dark wash, the way the hero on Home is drawn. */
export function FeaturedCard({ a, height = 320, style }: { a: Article; height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${a.title}. ${kicker(a)}`} onPress={() => open(a)} style={({ pressed }) => [styles.featured, { height }, pressed && { opacity: 0.94 }, style]}>
      <Cover a={a} style={StyleSheet.absoluteFill} motif={220} />
      <Wash id="cjFeatured" />
      <View style={{ padding: 18, gap: 8 }}>
        <Text style={styles.kicker}>{journalCategoryLabel(a).toUpperCase()}</Text>
        <Text numberOfLines={4} style={{ fontFamily: f.serifBold, fontSize: 26, lineHeight: 31, color: "#FBF7F2" }}>{a.title}</Text>
        {a.dek ? <Text numberOfLines={2} style={{ fontFamily: f.body, fontSize: 13.5, lineHeight: 19, color: "#E9DED3" }}>{a.dek}</Text> : null}
        <Text style={{ fontFamily: f.semi, fontSize: 12, color: "#E9DED3", marginTop: 2 }}>{readingLabel(a)}</Text>
      </View>
    </Pressable>
  );
}

/** A narrow card in a sideways row: cover or motif on top, category, title, reading time. */
export function ArticleTile({ a, width = 220 }: { a: Article; width?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${a.title}. ${kicker(a)}`} onPress={() => open(a)} style={({ pressed }) => [styles.tile, { width }, pressed && { opacity: 0.9 }]}>
      <Cover a={a} height={120} motif={120}>
        <Text style={styles.caption}>{journalCategoryLabel(a)}</Text>
      </Cover>
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 4 }}>
        <Text numberOfLines={2} style={{ fontFamily: f.serifBold, fontSize: 16, lineHeight: 21, color: c.ink }}>{a.title}</Text>
        <T muted size={12} numberOfLines={1}>{readingLabel(a)}</T>
      </View>
    </Pressable>
  );
}

/** A full-width row in the list: a square cover or motif beside the category, title, dek and reading time. */
export function ArticleRow({ a, style }: { a: Article; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${a.title}. ${kicker(a)}`} onPress={() => open(a)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }, style]}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.goldInk }}>{journalCategoryLabel(a)}</Text>
        <Text numberOfLines={2} style={{ fontFamily: f.serifBold, fontSize: 18, lineHeight: 23, color: c.ink }}>{a.title}</Text>
        {a.dek ? <T muted size={13} numberOfLines={2}>{a.dek}</T> : null}
        <T muted size={12} style={{ marginTop: 2 }}>{readingLabel(a)}</T>
      </View>
      <Cover a={a} height={96} style={{ width: 96, borderRadius: 14 }} motif={84} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  featured: { borderRadius: 22, overflow: "hidden", backgroundColor: c.photo, justifyContent: "flex-end" },
  kicker: { fontFamily: f.semi, fontSize: 11, letterSpacing: 1.2, color: c.gold },
  tile: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, overflow: "hidden" },
  caption: { position: "absolute", left: 10, bottom: 10, fontFamily: f.medium, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: "rgba(255,255,255,.85)", backgroundColor: "rgba(26,21,19,.55)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, padding: 14 },
});
