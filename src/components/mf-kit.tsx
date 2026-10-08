// Pieces the stock, online order and return screens share. They sit on the business kit (mc-kit)
// and keep its sizes: white cards with a hairline border, 14px rows, 12px lines under them.
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, type ReactNode } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { AskManager, Header, Wait, mc } from "@/components/mc-kit";
import { Failed, Icon, Note } from "@/components/ui";
import { media } from "@/lib/api";
import { c, f, pad, radius } from "@/lib/theme";

// ---------- icons the kits do not have ----------

const PATHS = {
  truck: ["M2 6h11v10H2z", "M13 9h4l4 4v3h-8z"],
  bag: ["M5 8h14l-1 12H6z", "M9 8V6a3 3 0 0 1 6 0v2"],
  count: ["M9 4h6v3H9z", "M7 5H5v16h14V5h-2", "m9 14 2 2 4-4"],
  swap: ["M4 8h14", "m15 5 3 3-3 3", "M20 16H6", "m9 13-3 3 3 3"],
  history: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5", "M12 8v4l3 2"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
  pencil: ["M4 20h4L19 9l-4-4L4 16z", "m13.5 6.5 4 4"],
} as const;
const DOTS: Partial<Record<keyof typeof PATHS, [number, number, number][]>> = { truck: [[6.5, 18, 2], [17, 18, 2]] };
export type MfIconName = keyof typeof PATHS;

export function MfIcon({ name, size = 18, color = c.ink }: { name: MfIconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name].map((d, i) => <Path key={i} d={d} />)}
      {(DOTS[name] ?? []).map(([x, y, r], i) => <Circle key={"c" + i} cx={x} cy={y} r={r} fill={c.white} />)}
    </Svg>
  );
}

// ---------- a screen that has nothing to show yet ----------

/** The whole screen while it loads, when it failed, or when this role may not open it. */
export function Blank({ title, error, onRetry, denied, what }: { title: string; error?: string; onRetry?: () => void; denied?: boolean; what?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.cream, paddingTop: insets.top + 12, paddingHorizontal: pad }}>
      <Header title={title} />
      {denied ? <AskManager what={what ?? "Only a manager or the owner can open this."} /> : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={onRetry} /></View> : <Wait />}
    </View>
  );
}

/** Loads a screen's data again each time it comes back into view, but not on the first showing. */
export function useRefocus(again: () => void, ready: boolean) {
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!ready) return;
    if (seen.current) again();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]));
}

// ---------- small things ----------

/** A product's picture: its photo when it has one, else its own dark colour. */
export function Thumb({ photoId, tone, size = 44, label }: { photoId?: string | null; tone?: string | null; size?: number; label?: string }) {
  const uri = media(photoId);
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.27), backgroundColor: tone || c.photo } as const;
  return uri ? <Image source={{ uri }} accessibilityLabel={label} resizeMode="cover" style={style} /> : <View style={style} />;
}

/** How full the shelf is: a thin bar, wine when the product is low. */
export function Meter({ value, low, night, style }: { value: number; low?: boolean; night?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityLabel={`${Math.round(value)} percent of a full shelf`} style={[{ height: 5, borderRadius: 3, backgroundColor: night ? "rgba(255,255,255,.14)" : c.cream2, overflow: "hidden" }, style]}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: 5, borderRadius: 3, backgroundColor: low ? (night ? "#E08A8A" : c.wine) : c.gold }} />
    </View>
  );
}

/** One fact in a card: what it is on the left, its value on the right. */
export function Kv({ k, v, sub, last, strong }: { k: string; v: ReactNode; sub?: string; last?: boolean; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.muted }}>{k}</Text>
        {sub ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted2 }}>{sub}</Text> : null}
      </View>
      {typeof v === "string" || typeof v === "number" ? <Text style={{ flexShrink: 1, maxWidth: "62%", textAlign: "right", fontFamily: strong ? f.bold : f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{v}</Text> : v}
    </View>
  );
}

/** A filter with how many it holds. */
export function CountChip({ children, n, on, onPress }: { children: string; n?: number; on?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={n === undefined ? children : `${children}, ${n}`} accessibilityState={{ selected: !!on }} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.85 : 1 })}>
      <Text style={{ fontFamily: f.semi, fontSize: 13, color: on ? c.cream : c.ink }}>{children}</Text>
      {n === undefined ? null : <Text style={{ fontFamily: f.semi, fontSize: 12, color: on ? mc.nightMuted : c.muted2 }}>{n}</Text>}
    </Pressable>
  );
}

/** A row of chips that scrolls sideways, out to the screen's edges. */
export function ChipRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={[{ marginHorizontal: -pad, flexGrow: 0 }, style]} contentContainerStyle={{ gap: 8, paddingHorizontal: pad }}>
      {children}
    </ScrollView>
  );
}

/** The search field above a list. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (t: string) => void; placeholder: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingLeft: 14, paddingRight: 4 }}>
      <Icon name="search" size={18} color={c.muted} />
      <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted2} autoCorrect={false} autoCapitalize="none" returnKeyType="search"
        style={{ flex: 1, minHeight: 44, fontFamily: f.body, fontSize: 15, color: c.ink }} />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChange("")} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <Icon name="close" size={16} color={c.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A short number typed straight into a row of a list. */
export function NumBox({ label, changed, style, ...props }: { label: string; changed?: boolean } & TextInputProps) {
  return (
    <TextInput accessibilityLabel={label} keyboardType="number-pad" selectTextOnFocus placeholderTextColor={c.muted2} maxLength={6} {...props}
      style={[{ width: 72, minHeight: 44, borderRadius: 12, borderWidth: changed ? 2 : 1, borderColor: changed ? c.ink : c.line2, backgroundColor: c.white, textAlign: "center", fontFamily: f.bold, fontSize: 16, color: c.ink, paddingVertical: 0 }, style]} />
  );
}

/** The dark card that holds the one most important thing on a screen. */
export function Night({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: mc.night, borderRadius: 20, padding: 18 }, style]}>{children}</View>;
}

/** What an action just did, or why it failed: pressed to put it away. Screens pin it at the bottom, where it stays in view. */
export function Said({ note, onClose }: { note: { kind: "ok" | "bad"; text: string } | null; onClose: () => void }) {
  if (!note) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${note.text} Dismiss`} onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <Note kind={note.kind}>{note.text}</Note>
    </Pressable>
  );
}

/** Small print under a card or a list. */
export function Fine({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={style}><Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{children}</Text></View>;
}

/** A switch row inside a card or a sheet: what it is, a line about it, and the control. */
export function Line({ title, sub, right, last }: { title: string; sub?: string; right?: ReactNode; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}
