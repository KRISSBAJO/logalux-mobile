// The pieces the booking screens share, drawn to the sizes in the designs (C4, C5, C10).
// They sit on top of the kit in ui.tsx and add only what it does not have.
import type { ReactNode, RefObject } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import { Avatar, Icon, IconButton, Row, T } from "@/components/ui";
import { media } from "@/lib/api";
import { c, f, pad, radius } from "@/lib/theme";

/**
 * A booking screen: the kit's Screen with two things it does not give, a handle on the scroll
 * position (to bring a missed question into view) and room for the keyboard.
 */
export function Shell({ children, footer, scrollRef, onRefresh, refreshing = false, side = pad }: { children: ReactNode; footer?: ReactNode; scrollRef?: RefObject<ScrollView | null>; onRefresh?: () => void; refreshing?: boolean; side?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.cream }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: side, paddingTop: insets.top + 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.wine} /> : undefined}>
        {children}
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: side, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.cream }}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

/** The top of a booking screen: the round back button with the title beside it. */
export function Head({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  return (
    <Row gap={12}>
      <IconButton icon="back" label="Back" onPress={onBack} />
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 26, lineHeight: 30, color: c.ink }}>{title}</Text>
        {sub ? <T muted size={13} numberOfLines={2} style={{ marginTop: 2 }}>{sub}</T> : null}
      </View>
    </Row>
  );
}

/** The small capital heading above a group. */
export function Grp({ children, note, style }: { children: ReactNode; note?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: 18, marginBottom: 10 }, style]}>
      <Text style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.96, textTransform: "uppercase", color: c.muted }}>
        {children}{note ? <Text style={{ fontFamily: f.body, letterSpacing: 0, textTransform: "none" }}> {note}</Text> : null}
      </Text>
    </View>
  );
}

/** The wide button at the bottom of a step, with room for a mark before or after its words. */
export function Cta({ children, onPress, busy, disabled, lead, trail, height = 52, kind = "ink", style, label }: { children: ReactNode; onPress?: () => void; busy?: boolean; disabled?: boolean; lead?: ReactNode; trail?: ReactNode; height?: number; kind?: "ink" | "out"; style?: StyleProp<ViewStyle>; label?: string }) {
  const off = disabled || busy;
  const fg = kind === "ink" ? c.cream : c.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!off, busy: !!busy }} disabled={off} onPress={onPress}
      style={({ pressed }) => [{ minHeight: height, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: kind === "ink" ? c.ink : c.white, borderWidth: 1, borderColor: kind === "ink" ? c.ink : c.line2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: off ? 0.5 : pressed ? 0.85 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : lead}
      <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 15, color: fg, flexShrink: 1 }}>{children}</Text>
      {busy ? null : trail}
    </Pressable>
  );
}

/** A choice drawn as a box: outlined when chosen. With `radio` it shows the round mark the design gives a way to pay. */
export function Opt({ title, sub, on, onPress, radio, center, style, label }: { title: string; sub?: ReactNode; on?: boolean; onPress?: () => void; radio?: boolean; center?: boolean; style?: StyleProp<ViewStyle>; label?: string }) {
  const body = (
    <>
      {radio ? <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.ink, alignItems: "center", justifyContent: "center" }}>{on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink }} /> : null}</View> : null}
      <View style={center ? undefined : { flex: 1 }}>
        <Text style={{ fontFamily: f.semi, fontSize: center ? 13 : 14, color: c.ink, textAlign: center ? "center" : undefined }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 1 }}>{sub}</Text> : null}
      </View>
    </>
  );
  // The chosen box has a 2px edge; the padding gives the pixel back so nothing moves.
  const box: ViewStyle = { flexDirection: "row", alignItems: "center", justifyContent: center ? "center" : undefined, gap: 12, minHeight: 52, borderRadius: 14, backgroundColor: c.white, borderWidth: on ? 2 : 1, borderColor: on ? c.ink : c.line2, paddingVertical: on ? 11 : 12, paddingHorizontal: (center ? 8 : 14) - (on ? 1 : 0) };
  if (!onPress) return <View style={[box, style]}>{body}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ selected: !!on }} onPress={onPress} style={({ pressed }) => [box, style, pressed && { opacity: 0.85 }]}>{body}</Pressable>;
}

/** One line of the price list. */
export function Line({ left, right, muted, total }: { left: string; right: string; muted?: boolean; total?: boolean }) {
  const t = { fontFamily: total ? f.bold : f.body, fontSize: total ? 16 : 14, lineHeight: total ? 22 : 20, color: c.ink } as const;
  return (
    <View style={[{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 }, total && { borderTopWidth: 1, borderTopColor: c.line, marginTop: 6, paddingTop: 12 }]}>
      <Text style={[t, { flex: 1 }, muted && { color: c.muted }]}>{left}</Text>
      <Text style={t}>{right}</Text>
    </View>
  );
}

/** One of the two tiles under the business's name: "When", "Duration". */
export function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#F4ECE2", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 11 }}>
      <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.66, textTransform: "uppercase", color: c.muted }}>{label}</Text>
      <Text style={{ fontFamily: f.semi, fontSize: 13.5, lineHeight: 20, letterSpacing: -0.1, color: c.ink, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

/** A tinted strip with a mark, a sentence and, sometimes, one link. */
export function Strip({ kind, icon, children, action, onAction }: { kind: "ok" | "gold" | "bad"; icon?: ReactNode; children: ReactNode; action?: string; onAction?: () => void }) {
  const [bg, fg] = { ok: [c.okBg, c.ok], gold: [c.goldBg, c.goldInk], bad: [c.badBg, c.bad] }[kind];
  return (
    <View accessibilityRole={kind === "bad" ? "alert" : undefined} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: bg, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
      {icon}
      <Text style={{ flex: 1, fontFamily: f.body, fontSize: 13, lineHeight: 19, color: fg }}>{children}</Text>
      {action ? <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ fontFamily: f.semi, fontSize: 13, color: fg }}>{action}</Text></Pressable> : null}
    </View>
  );
}

/** Words that act as a link, with a touch target of the right height. */
export function LinkText({ children, onPress, size = 13, color = c.wine, label }: { children: ReactNode; onPress: () => void; size?: number; color?: string; label?: string }) {
  return <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}><Text style={{ fontFamily: f.semi, fontSize: size, color }}>{children}</Text></Pressable>;
}

/** The business's logo, or its initials on its own colour. */
export function BizMark({ name, tone, logoId, size = 44 }: { name: string; tone?: string; logoId?: string | null; size?: number }) {
  return <Avatar name={name} tone={tone} uri={media(logoId)} size={size} />;
}

// ---------- marks the kit's Icon does not have ----------

const line = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
export function ShieldIcon({ size = 18, color = c.ok }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} strokeWidth={2} {...line}><Path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" /><Path d="m9 12 2 2 4-4" /></Svg>;
}
export function LockIcon({ size = 16, color = c.cream }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} strokeWidth={2.2} {...line}><Rect x={4} y={10} width={16} height={11} rx={2} /><Path d="M8 10V7a4 4 0 0 1 8 0v3" /></Svg>;
}
export function MinusIcon({ size = 18, color = c.ink }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} strokeWidth={2} {...line}><Path d="M5 12h14" /></Svg>;
}
/** A small round button holding one of the kit's icons, or a mark of our own. */
export function Round({ label, onPress, disabled, size = 36, children }: { label: string; onPress: () => void; disabled?: boolean; size?: number; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={(44 - size) / 2}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: c.white, borderWidth: 1, borderColor: c.line, opacity: disabled ? 0.35 : pressed ? 0.8 : 1 })}>
      {children}
    </Pressable>
  );
}
export { Icon };
