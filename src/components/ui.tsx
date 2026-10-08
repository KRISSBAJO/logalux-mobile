// The building blocks every screen is made from. They carry the design's sizes and colours,
// so a screen never repeats them: use these before writing new styles.
import { router } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { c, f, pad, radius } from "@/lib/theme";
import { initials } from "@/lib/format";

// ---------- text ----------

type TProps = { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; size?: number; weight?: "body" | "medium" | "semi" | "bold"; color?: string; center?: boolean; numberOfLines?: number; selectable?: boolean };

/** Body text in DM Sans. */
export function T({ children, style, muted, size = 15, weight = "body", color, center, numberOfLines, selectable }: TProps) {
  return <Text selectable={selectable} numberOfLines={numberOfLines} style={[{ fontFamily: f[weight], fontSize: size, lineHeight: Math.round(size * 1.4), color: color ?? (muted ? c.muted : c.ink), textAlign: center ? "center" : undefined }, style]}>{children}</Text>;
}

/** A heading in the display serif. `size` 34 is a screen title, 22 a section title. */
export function Serif({ children, style, size = 34, color, center, numberOfLines }: TProps) {
  return <Text accessibilityRole="header" numberOfLines={numberOfLines} style={[{ fontFamily: size >= 26 ? f.serif : f.serifBold, fontSize: size, lineHeight: Math.round(size * 1.12), color: color ?? c.ink, textAlign: center ? "center" : undefined }, style]}>{children}</Text>;
}

/** A small capital label above a field or a group. */
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.muted }, style]}>{children}</Text>;
}

// ---------- layout ----------

/**
 * A whole screen: cream background, safe areas, and a scrolling body with the side gutter.
 * `footer` stays pinned to the bottom (a pay bar, a primary button). `onRefresh` adds pull to refresh.
 */
export function Screen({ children, footer, scroll = true, padded = true, onRefresh, refreshing = false, top = true, style }: { children: ReactNode; footer?: ReactNode; scroll?: boolean; padded?: boolean; onRefresh?: () => void; refreshing?: boolean; top?: boolean; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const inner: ViewStyle = { paddingHorizontal: padded ? pad : 0, paddingTop: top ? insets.top + 12 : 0, paddingBottom: 28 };
  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, style]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.wine} /> : undefined}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner, style]}>{children}</View>
      )}
      {footer ? <View style={{ paddingHorizontal: pad, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.cream }}>{footer}</View> : null}
    </View>
  );
}

export function Row({ children, gap = 12, between, style, wrap }: { children: ReactNode; gap?: number; between?: boolean; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap, justifyContent: between ? "space-between" : undefined, flexWrap: wrap ? "wrap" : undefined }, style]}>{children}</View>;
}

export function Card({ children, style, onPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  const s = [styles.card, style];
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>{children}</Pressable> : <View style={s}>{children}</View>;
}

/** The bar at the top of a screen that is not a tab: a round back button, a title, and room for one action. */
export function TopBar({ title, right, onBack }: { title?: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <Row between style={{ minHeight: 44, marginBottom: 14 }}>
      <IconButton icon="back" label="Back" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))} />
      {title ? <T weight="semi" size={16} numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>{title}</T> : <View style={{ flex: 1 }} />}
      <View style={{ minWidth: 44, alignItems: "flex-end" }}>{right}</View>
    </Row>
  );
}

// ---------- controls ----------

type BtnProps = { children: ReactNode; onPress?: () => void; kind?: "ink" | "gold" | "soft" | "out" | "danger"; small?: boolean; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: IconName; label?: string };

export function Btn({ children, onPress, kind = "ink", small, busy, disabled, style, icon, label }: BtnProps) {
  const bg = { ink: c.ink, gold: c.gold, soft: c.cream2, out: c.white, danger: c.white }[kind];
  const fg = { ink: c.cream, gold: c.ink, soft: c.ink, out: c.ink, danger: c.bad }[kind];
  const off = disabled || busy;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!off, busy: !!busy }} disabled={off} onPress={onPress}
      style={({ pressed }) => [{ minHeight: small ? 40 : 50, paddingHorizontal: small ? 16 : 20, borderRadius: radius.pill, backgroundColor: bg, borderWidth: 1, borderColor: kind === "out" ? c.line2 : kind === "danger" ? "#E9C7C3" : "transparent", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: off ? 0.5 : pressed ? 0.85 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={{ fontFamily: f.semi, fontSize: small ? 14 : 15, color: fg }}>{children}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, dark, badge }: { icon: IconName; label: string; onPress?: () => void; dark?: boolean; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: dark ? c.ink : c.white, borderWidth: 1, borderColor: dark ? c.ink : c.line, opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={20} color={dark ? c.cream : c.ink} />
      {badge ? <View style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.wine, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}><Text style={{ fontFamily: f.bold, fontSize: 10, color: c.white }}>{badge}</Text></View> : null}
    </Pressable>
  );
}

/** A rounded filter or choice. `on` is the chosen one. */
export function Chip({ children, on, onPress, icon }: { children: ReactNode; on?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.85 : 1 })}>
      {icon ? <Icon name={icon} size={15} color={on ? c.cream : c.ink} /> : null}
      <Text style={{ fontFamily: f.semi, fontSize: 13, color: on ? c.cream : c.ink }}>{children}</Text>
    </Pressable>
  );
}

/** A small status tag. */
export function Pill({ children, kind = "grey" }: { children: ReactNode; kind?: "ok" | "gold" | "dark" | "wine" | "grey" | "bad" }) {
  const [bg, fg] = { ok: [c.okBg, c.ok], gold: [c.goldBg, c.goldInk], dark: [c.ink, "#F4ECE3"], wine: [c.wineBg, c.wine], grey: [c.cream2, c.muted], bad: [c.badBg, c.bad] }[kind];
  return <View style={{ alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: bg }}><Text style={{ fontFamily: f.semi, fontSize: 12, color: fg }}>{children}</Text></View>;
}

/** A labelled text field. Pass `error` to show a sentence under it. */
export function Field({ label, error, hint, style, ...props }: { label: string; error?: string; hint?: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput accessibilityLabel={label} placeholderTextColor={c.muted2} {...props}
        style={[{ minHeight: props.multiline ? 96 : 52, borderRadius: radius.field, borderWidth: 1, borderColor: error ? c.bad : c.line2, backgroundColor: c.white, paddingHorizontal: 14, paddingVertical: props.multiline ? 12 : 0, fontFamily: f.body, fontSize: 16, color: c.ink, textAlignVertical: props.multiline ? "top" : "center" }, style]} />
      {error ? <T size={13} color={c.bad}>{error}</T> : hint ? <T size={13} muted>{hint}</T> : null}
    </View>
  );
}

/** A round picture of a person or business: their photo if there is one, else their initials on their colour. */
export function Avatar({ name, tone, uri, size = 40 }: { name: string; tone?: string | null; uri?: string; size?: number }) {
  if (uri) return <Image source={{ uri }} accessibilityLabel={name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.photo }} />;
  return <View accessibilityLabel={name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone || c.wine, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: f.bold, fontSize: Math.round(size * 0.35), color: "#F4ECE3" }}>{initials(name)}</Text></View>;
}

/** A picture block: the photo when there is one, else the business's own dark colour with a caption. */
export function Photo({ uri, tone, caption, height = 120, style }: { uri?: string; tone?: string | null; caption?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ height, backgroundColor: tone || c.photo, justifyContent: "flex-end", overflow: "hidden" }, style]}>
      {uri ? <Image source={{ uri }} accessibilityLabel={caption} resizeMode="cover" style={StyleSheet.absoluteFill} /> : caption ? <Text style={{ fontFamily: f.medium, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: "rgba(255,255,255,.6)", padding: 12 }}>{caption}</Text> : null}
    </View>
  );
}

// ---------- states ----------

export function Loading({ label = "Loading" }: { label?: string }) {
  return <View accessibilityLabel={label} style={{ paddingVertical: 60, alignItems: "center" }}><ActivityIndicator color={c.wine} /></View>;
}

/** What to show when a screen's data could not be loaded: the reason and a way to try again. */
export function Failed({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Card style={{ padding: 18, gap: 12, borderColor: "#E9C7C3", backgroundColor: c.badBg }}>
      <T color={c.bad} weight="medium">{error}</T>
      {onRetry ? <Btn kind="out" small onPress={onRetry} style={{ alignSelf: "flex-start" }}>Try again</Btn> : null}
    </Card>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card style={{ padding: 22, gap: 10, alignItems: "flex-start" }}>
      <T weight="semi" size={16}>{title}</T>
      {children ? <T muted>{children}</T> : null}
      {action}
    </Card>
  );
}

/** A message at the top of a screen after something was done, or went wrong. */
export function Note({ children, kind = "ok" }: { children: ReactNode; kind?: "ok" | "bad" | "gold" }) {
  const [bg, fg] = { ok: [c.okBg, c.ok], bad: [c.badBg, c.bad], gold: [c.goldBg, c.goldInk] }[kind];
  return <View accessibilityRole="alert" style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: bg }}><T size={14} weight="medium" color={fg}>{children}</T></View>;
}

export function Stars({ rating, count, size = 13 }: { rating: number | string; count?: number; size?: number }) {
  return (
    <Row gap={4}>
      <Icon name="star" size={size + 1} color={c.gold} fill={c.gold} />
      <Text style={{ fontFamily: f.bold, fontSize: size, color: c.ink }}>{Number(rating).toFixed(1)}</Text>
      {count !== undefined ? <Text style={{ fontFamily: f.body, fontSize: size, color: c.muted }}>({count})</Text> : null}
    </Row>
  );
}

// ---------- icons ----------
// The line icons the designs use, drawn at 24 by 24. Add a path here when a screen needs a new one.

const ICONS = {
  back: ["m15 18-6-6 6-6"],
  next: ["m9 18 6-6-6-6"],
  down: ["m6 9 6 6 6-6"],
  close: ["M18 6 6 18", "m6 6 12 12"],
  plus: ["M12 5v14", "M5 12h14"],
  check: ["M20 6 9 17l-5-5"],
  search: ["m20 20-3.5-3.5"],
  home: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5"],
  calendar: ["M3 9h18", "M8 3v4", "M16 3v4", "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"],
  chat: ["M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"],
  user: ["M20 21a8 8 0 0 0-16 0"],
  users: ["M16 21a6 6 0 0 0-12 0", "M22 21a5 5 0 0 0-5-5", "M17 4.5a3.5 3.5 0 0 1 0 7"],
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10 21a2 2 0 0 0 4 0"],
  star: ["m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8L12 3Z"],
  heart: ["M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"],
  pin: ["M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"],
  clock: ["M12 7v5l3 2"],
  phone: ["M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"],
  card: ["M3 10h18", "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"],
  wallet: ["M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12", "M16 13.5h2"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  send: ["m22 2-9 20-3-9-9-3 21-8Z"],
  camera: ["M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"],
  repeat: ["M17 2l4 4-4 4", "M3 11V9a3 3 0 0 1 3-3h15", "M7 22l-4-4 4-4", "M21 13v2a3 3 0 0 1-3 3H3"],
  scissors: ["M20 4 8.5 15.5", "M14.5 14.5 20 20", "M8.5 8.5 12 12"],
  shop: ["M4 9 5.5 4h13L20 9", "M5 9v11h14V9", "M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"],
  settings: ["M12 2v3", "M12 19v3", "m4.9 4.9 2.1 2.1", "m17 17 2.1 2.1", "M2 12h3", "M19 12h3", "m4.9 19.1 2.1-2.1", "m17 7 2.1-2.1"],
  info: ["M12 11v5", "M12 8h.01"],
  filter: ["M4 6h16", "M7 12h10", "M10 18h4"],
  share: ["M12 15V3", "m8 7 4-4 4 4", "M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"],
  out: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],
} as const;
const CIRCLES: Partial<Record<keyof typeof ICONS, [number, number, number][]>> = {
  search: [[11, 11, 7]], user: [[12, 8, 4]], users: [[10, 8, 4]], clock: [[12, 12, 9]], pin: [[12, 9.5, 2.5]], camera: [[12, 13.5, 3.5]], scissors: [[6, 6, 3], [6, 18, 3]], settings: [[12, 12, 4]], info: [[12, 12, 9]],
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color = c.ink, fill = "none", stroke = 2 }: { name: IconName; size?: number; color?: string; fill?: string; stroke?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {(CIRCLES[name] ?? []).map(([x, y, r], i) => <Circle key={"c" + i} cx={x} cy={y} r={r} fill="none" />)}
      {ICONS[name].map((d, i) => <Path key={i} d={d} />)}
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: radius.card },
});
