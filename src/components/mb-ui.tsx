// Pieces the business calendar, clients and inbox screens share, drawn to the designs' sizes.
import { useRef, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { c, f, pad, radius } from "@/lib/theme";
import { initials } from "@/lib/format";
import { blueBg, blueInk, clockOf, type Tone } from "@/lib/mb-util";
import { Btn, Icon, T } from "./ui";

// ---------- icons the shared set does not have ----------

const PATHS = {
  dots: [],
  pencil: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M4 21h16"],
  spark: ["m12 3 1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z", "M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9z"],
  mail: ["M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "m3 7 9 6 9-6"],
  sms: ["M4 4h16v12H7l-3 3z"],
  shield: ["M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"],
  bubble: ["M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5A8 8 0 1 1 21 12z"],
  minus: ["M5 12h14"],
  block: ["m5.6 5.6 12.8 12.8"],
} as const;
export type MbIconName = keyof typeof PATHS;

export function MbIcon({ name, size = 20, color = c.ink, stroke = 2 }: { name: MbIconName; size?: number; color?: string; stroke?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {name === "dots" ? [5, 12, 19].map((x) => <Circle key={x} cx={x} cy={12} r={2} fill={color} stroke="none" />) : null}
      {name === "block" ? <Circle cx={12} cy={12} r={9} /> : null}
      {PATHS[name].map((d, i) => <Path key={i} d={d} />)}
    </Svg>
  );
}

/** A round button holding one of the icons above. `size` 40 is the calendar's, 44 everywhere else. */
export function RoundBtn({ icon, label, onPress, dark, size = 44, children, disabled }: { icon?: MbIconName; label: string; onPress?: () => void; dark?: boolean; size?: number; children?: ReactNode; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={size < 44 ? (44 - size) / 2 + 2 : 4}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: dark ? c.ink : c.white, borderWidth: 1, borderColor: dark ? c.ink : c.line, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}>
      {children ?? (icon ? <MbIcon name={icon} size={size < 44 ? 16 : 18} color={dark ? c.cream : c.ink} /> : null)}
    </Pressable>
  );
}

// ---------- small pieces ----------

const TONE: Record<Tone, [string, string]> = {
  ok: [c.okBg, c.ok], gold: [c.goldBg, c.goldInk], wine: [c.wineBg, c.wine], grey: ["#EFE5DA", c.muted], new: [blueBg, blueInk], bad: [c.badBg, c.bad], dark: [c.ink, "#F4ECE3"],
};

/** The designs' small tag: 11 point, tighter than the shared Pill. */
export function Tag({ children, tone = "grey", style }: { children: ReactNode; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  const [bg, fg] = TONE[tone];
  return <View style={[{ alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: bg, flexDirection: "row", alignItems: "center", gap: 5 }, style]}><Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 11, lineHeight: 14, color: fg }}>{children}</Text></View>;
}

/** A filter chip with a small count after its name, as the designs draw them. */
export function CountChip({ children, count, on, onPress }: { children: ReactNode; count?: number | null; on?: boolean; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.85 : 1 })}>
      <Text style={{ fontFamily: f.semi, fontSize: 13, color: on ? c.cream : c.ink }}>{children}</Text>
      {count !== undefined && count !== null ? <Text style={{ fontFamily: f.medium, fontSize: 13, color: on ? "#C9BCB0" : c.muted2 }}>{count.toLocaleString("en-US")}</Text> : null}
    </Pressable>
  );
}

/** A row of chips that scrolls sideways and bleeds to the screen's edges. */
export function ChipRow({ children, gutter = pad, style }: { children: ReactNode; gutter?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={[{ marginHorizontal: -gutter, flexGrow: 0 }, style]} contentContainerStyle={{ paddingHorizontal: gutter, gap: 8, alignItems: "center" }}>
      {children}
    </ScrollView>
  );
}

/** The designs' segmented switch: Day, Week, Staff. */
export function Seg<V extends string>({ options, value, onChange }: { options: [V, string][]; value: V; onChange: (v: V) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: "#EFE5DA", borderRadius: radius.pill, padding: 3, gap: 3 }}>
      {options.map(([id, name]) => {
        const on = id === value;
        return (
          <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(id)} hitSlop={{ top: 5, bottom: 5 }}
            style={{ minHeight: 34, paddingHorizontal: 10, borderRadius: radius.pill, justifyContent: "center", backgroundColor: on ? c.ink : "transparent" }}>
            <Text style={{ fontFamily: f.semi, fontSize: 12, color: on ? c.cream : c.muted }}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The designs' search box. */
export function SearchBox({ label, style, ...props }: { label: string; style?: StyleProp<ViewStyle> } & Omit<TextInputProps, "style">) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.white, borderWidth: 1, borderColor: c.line2, borderRadius: radius.field, paddingHorizontal: 14, minHeight: 50 }, style]}>
      <Icon name="search" size={18} />
      <TextInput accessibilityLabel={label} placeholderTextColor={c.muted2} autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing" {...props}
        style={[{ flex: 1, minWidth: 0, minHeight: 48, fontFamily: f.body, fontSize: 15, color: c.ink }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]} />
    </View>
  );
}

/** A person's initials on their colour, with an optional small badge at the corner (the channel of a conversation). */
export function Face({ name, tone, size = 44, badge }: { name: string; tone: string; size?: number; badge?: ReactNode }) {
  return (
    <View accessibilityLabel={name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: f.bold, fontSize: size >= 60 ? 20 : size >= 44 ? 14 : 12, color: "#F4ECE3" }}>{initials(name) || "?"}</Text>
      {badge}
    </View>
  );
}

/** The small round mark on a conversation's picture that says which channel it is on. */
export function ChannelBadge({ channel }: { channel: string }) {
  const [bg, fg, icon] = ({ whatsapp: ["#25D366", "#006633", "bubble"], sms: [c.ink, c.cream, "sms"], in_app: [c.gold, c.ink, "shield"], email: [c.wine, c.cream, "mail"] } as Record<string, [string, string, MbIconName]>)[channel] ?? [c.ink, c.cream, "sms"];
  return (
    <View style={{ position: "absolute", right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.cream, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <MbIcon name={icon} size={10} color={fg} stroke={2.5} />
    </View>
  );
}

/** The designs' underlined tabs inside a screen. */
export function Tabs<V extends string>({ options, value, onChange }: { options: [V, string][]; value: V; onChange: (v: V) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 4, borderBottomWidth: 1, borderBottomColor: c.line2 }}>
      {options.map(([id, name]) => {
        const on = id === value;
        return (
          <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(id)}
            style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: on ? c.ink : "transparent", marginBottom: -1 }}>
            <Text style={{ fontFamily: f.semi, fontSize: 14, color: on ? c.ink : c.tab }}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- a sheet that rises from the bottom ----------

/**
 * A panel over the screen for a short form or a choice. The body scrolls and stays above the keyboard;
 * `footer` (the button that does the thing) stays pinned under it.
 */
export function Sheet({ open, onClose, title, sub, children, footer }: { open: boolean; onClose: () => void; title: string; sub?: string; children?: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(26,21,19,.45)" }]} />
        <View accessibilityViewIsModal style={{ backgroundColor: c.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", paddingBottom: Math.max(insets.bottom, 16) }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: pad, paddingTop: 18, paddingBottom: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3, paddingTop: 2 }}>
              <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 22, lineHeight: 26, color: c.ink }}>{title}</Text>
              {sub ? <T size={13} muted>{sub}</T> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={6} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.white, borderWidth: 1, borderColor: c.line }}>
              <Icon name="close" size={18} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 6, gap: 14 }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: pad, paddingTop: 12, gap: 8 }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Asks before something that cannot be taken back. */
export function Confirm({ open, onClose, title, message, action, onConfirm, busy, danger }: { open: boolean; onClose: () => void; title: string; message: string; action: string; onConfirm: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={<><Btn kind={danger ? "danger" : "ink"} busy={busy} onPress={onConfirm}>{action}</Btn><Btn kind="soft" onPress={onClose}>Not now</Btn></>}>
      <T muted>{message}</T>
    </Sheet>
  );
}

/** One line in a sheet of choices. */
export function Choice({ title, sub, on, onPress, danger, right }: { title: string; sub?: string; on?: boolean; onPress?: () => void; danger?: boolean; right?: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 52, borderRadius: radius.field, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: c.white, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="semi" color={danger ? c.bad : c.ink}>{title}</T>
        {sub ? <T size={13} muted>{sub}</T> : null}
      </View>
      {right ?? (on ? <Icon name="check" size={18} /> : null)}
    </Pressable>
  );
}

/** A time of day moved in steps: minus, the time, plus. `value` is minutes after midnight. */
export function TimeStep({ label, value, onChange, step = 15, min = 0, max = 24 * 60 }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  // Two quick presses must both count, so the latest value is kept here between renders.
  const now = useRef(value);
  now.current = value;
  const set = (v: number) => { now.current = Math.min(max, Math.max(min, v)); onChange(now.current); };
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.muted }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, borderRadius: radius.field, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingHorizontal: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${step} minutes earlier`} onPress={() => set(now.current - step)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><MbIcon name="minus" size={18} /></Pressable>
        <Text accessibilityLabel={`${label} ${clockOf(value)}`} style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{clockOf(value)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${step} minutes later`} onPress={() => set(now.current + step)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="plus" size={18} /></Pressable>
      </View>
    </View>
  );
}

/** The dark round button that floats over a tab's content. */
export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({ position: "absolute", right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: c.ink, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.9 : 1, shadowColor: c.ink, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 12 }, elevation: 8 })}>
      <Icon name="plus" size={24} color={c.cream} stroke={2.4} />
    </Pressable>
  );
}
