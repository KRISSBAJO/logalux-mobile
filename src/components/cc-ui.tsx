// Pieces the signed-in client's screens share, drawn to the sizes in designs C6 to C9.
import { router } from "expo-router";
import { Children, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Card, Icon, IconButton, Row, Screen, Serif, T, type IconName } from "@/components/ui";
import { c, f, pad, radius } from "@/lib/theme";

/** A screen title in the serif with room for one control on the right (C6, C9). */
export function TabTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <Row between style={{ minHeight: 44 }}>
      <Serif size={30} style={{ flex: 1 }}>{title}</Serif>
      {right}
    </Row>
  );
}

/** A back button with a serif title beside it (C8). */
export function BackTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <Row gap={12} style={{ minHeight: 44 }}>
      <IconButton icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <View style={{ flex: 1 }}>
        <Serif size={26} numberOfLines={1}>{title}</Serif>
        {sub ? <T size={13} muted numberOfLines={1} style={{ marginTop: 2 }}>{sub}</T> : null}
      </View>
    </Row>
  );
}

/** The small capital heading above a group of rows or fields. */
export function Grp({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ marginTop: 18, marginBottom: 10 }, style]}><Text accessibilityRole="header" style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.96, textTransform: "uppercase", color: c.muted }}>{children}</Text></View>;
}

/** Two or three choices side by side, one of them on (C6: Upcoming, Past). */
export function Seg<K extends string>({ options, value, onChange }: { options: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: c.cream2, borderRadius: radius.pill, padding: 4, gap: 4 }}>
      {options.map(([k, label]) => {
        const on = k === value;
        return (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(k)}
            style={{ flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : "transparent" }}>
            <Text style={{ fontFamily: f.semi, fontSize: 14, color: on ? c.cream : c.muted }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The square date beside an upcoming booking. `next` tints the soonest one. */
export function DateTile({ top, day, next }: { top: string; day: string; next?: boolean }) {
  const fg = next ? c.wine : c.ink;
  return (
    <View style={{ width: 52, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: next ? c.wineBg : c.cream2 }}>
      <Text style={{ fontFamily: f.bold, fontSize: 11, letterSpacing: 0.66, color: fg }}>{top}</Text>
      <Text style={{ fontFamily: f.serifBold, fontSize: 24, lineHeight: 26, color: fg }}>{day}</Text>
    </View>
  );
}

/** A button in the row of actions under a booking: they share the width equally. */
export function ActBtn({ children, onPress, kind = "out", grow = true, busy }: { children: string; onPress?: () => void; kind?: "ink" | "soft" | "out" | "danger"; grow?: boolean; busy?: boolean }) {
  const bg = { ink: c.ink, soft: c.cream2, out: c.white, danger: c.white }[kind];
  const fg = { ink: c.cream, soft: c.ink, out: c.ink, danger: c.bad }[kind];
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!busy, busy: !!busy }} disabled={busy} onPress={onPress}
      style={({ pressed }) => ({ flexGrow: grow ? 1 : 0, flexShrink: 0, flexBasis: "auto", minHeight: 44, paddingHorizontal: grow ? 8 : 16, borderRadius: radius.pill, backgroundColor: bg, borderWidth: 1, borderColor: kind === "out" ? c.line2 : kind === "danger" ? "#E9C7C3" : "transparent", alignItems: "center", justifyContent: "center", opacity: busy ? 0.5 : pressed ? 0.85 : 1 })}>
      <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, color: fg }}>{children}</Text>
    </Pressable>
  );
}

/** The actions under a booking card, above a hairline. */
export function Acts({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", gap: 8, paddingTop: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: c.line }}>{children}</View>;
}

/** One row of a list of settings (C9): an icon tile, a title, a line under it and a chevron. */
export function Item({ icon, title, sub, onPress, tone }: { icon?: IconName; title: string; sub?: string; onPress?: () => void; tone?: "bad" }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={sub ? `${title}. ${sub}` : title} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16, minHeight: 52, opacity: pressed ? 0.7 : 1 })}>
      {icon ? <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.cream2, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={18} color={tone === "bad" ? c.bad : c.ink} /></View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 14, color: tone === "bad" ? c.bad : c.ink }}>{title}</Text>
        {sub ? <Text numberOfLines={2} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{sub}</Text> : null}
      </View>
      <Icon name="next" size={18} color={c.muted2} />
    </Pressable>
  );
}

/** A white card of rows with a hairline between them. Rows that are not there leave no line. */
export function Rows({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  if (rows.length === 0) return null;
  return <Card>{rows.map((row, i) => <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>{row}</View>)}</Card>;
}

/** What a guest sees on a screen that needs an account. */
export function SignInGate({ title, children, next, extra }: { title: string; children: string; next: string; extra?: ReactNode }) {
  return (
    <Screen>
      <TabTitle title={title} />
      <Card style={{ marginTop: 18, padding: 22, gap: 12 }}>
        <T weight="semi" size={16}>Sign in to see this</T>
        <T muted>{children}</T>
        <Btn onPress={() => router.push(`/sign-in?next=${encodeURIComponent(next)}` as never)}>Sign in</Btn>
        <Btn kind="soft" onPress={() => router.push("/client/search" as never)}>Look around first</Btn>
      </Card>
      {extra}
    </Screen>
  );
}

/** A panel that rises from the bottom for one job (move, cancel, tip). The keyboard never covers it. */
export function Sheet({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,21,19,.45)" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, minHeight: 40 }} />
        <View accessibilityViewIsModal style={{ maxHeight: "90%", backgroundColor: c.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <Row between style={{ paddingHorizontal: pad, paddingTop: 16, paddingBottom: 8 }}>
            <Serif size={22} style={{ flex: 1 }}>{title}</Serif>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 16, gap: 14 }}>{children}</ScrollView>
          <View style={{ paddingHorizontal: pad, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16), borderTopWidth: footer ? 1 : 0, borderTopColor: c.line, gap: 8 }}>{footer}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One choice in a list where exactly one is picked. */
export function Choice({ children, on, onPress }: { children: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress}
      style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: c.white }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? c.ink : c.muted2, alignItems: "center", justifyContent: "center" }}>{on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink }} /> : null}</View>
      <Text style={{ flex: 1, fontFamily: f.medium, fontSize: 14, color: c.ink }}>{children}</Text>
    </Pressable>
  );
}
