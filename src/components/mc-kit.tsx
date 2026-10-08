// Pieces the "run the business" screens share (More, Money, Services, Hours, Onboarding).
// Sizes and colours are the ones the M5, M9, M10, M11 and M12 designs draw.
import { Redirect, router } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Btn, Card, Icon, IconButton, Loading, Row, T, type IconName } from "@/components/ui";
import { openWeb } from "@/lib/mc-util";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

// Colours the designs use that the shared theme does not name.
export const mc = { night: "#120E0D", onNight: "#F4ECE3", nightMuted: "#C9BCB0", tile: "#F4ECE2", swOff: "#D9CFC4", grab: "#C9BCB0" } as const;

// ---------- icons the shared set does not have ----------

const PATHS = {
  link: ["M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1", "M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"],
  list: ["M4 6h16", "M4 12h16", "M4 18h10"],
  megaphone: ["M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z", "M15 9a4 4 0 0 1 0 6"],
  gift: ["M20 12v8H4v-8", "M2 7h20v5H2z", "M12 7v13", "M12 7c-2-3-6-3-6 0", "M12 7c2-3 6-3 6 0"],
  chart: ["M3 3v18h18", "M7 14l4-4 4 4 5-6"],
  doc: ["M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z", "M14 3v6h6", "M8 13h8", "M8 17h5"],
  shield: ["M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"],
  staffAdd: ["M2 20a7 7 0 0 1 14 0", "M19 8v6", "M22 11h-6"],
  up: ["m6 15 6-6 6 6"],
  down: ["m6 9 6 6 6-6"],
  external: ["M14 4h6v6", "M20 4 10 14", "M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"],
  box: ["M3 8 12 3l9 5v8l-9 5-9-5z", "M3 8l9 5 9-5", "M12 13v8"],
  bank: ["M3 10 12 4l9 6", "M5 10v8", "M10 10v8", "M14 10v8", "M19 10v8", "M3 20h18"],
  refund: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"],
  tip: ["M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"],
  percent: ["M19 5 5 19"],
  key: ["M14 10l7-7", "M17 6l3 3", "M10.5 13.5 13 11"],
} as const;
const DOTS: Partial<Record<keyof typeof PATHS, [number, number, number][]>> = { staffAdd: [[9, 8, 3.5]], percent: [[7, 7, 2.5], [17, 17, 2.5]], key: [[7.5, 16.5, 4.5]] };
export type McIconName = keyof typeof PATHS | "photo" | "grab";

export function McIcon({ name, size = 18, color = c.ink, stroke = 2 }: { name: McIconName; size?: number; color?: string; stroke?: number }) {
  if (name === "grab") {
    return <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>{[6, 12, 18].flatMap((y) => [9, 15].map((x) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} />))}</Svg>;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {name === "photo" ? <><Rect x={3} y={5} width={18} height={14} rx={2} /><Circle cx={12} cy={12} r={3.5} /></> : (
        <>
          {(DOTS[name] ?? []).map(([x, y, r], i) => <Circle key={"c" + i} cx={x} cy={y} r={r} />)}
          {PATHS[name].map((d, i) => <Path key={i} d={d} />)}
        </>
      )}
    </Svg>
  );
}

/** While a screen above the tabs has nothing to show yet: a spinner, or the sign-in screen when nobody is signed in. */
export function Wait() {
  const s = useSession();
  return s.ready && !s.businessToken ? <Redirect href={"/sign-in?side=business" as never} /> : <Loading />;
}

// ---------- headings ----------

/** The top of a screen that opens above the tabs: round back button, serif title, room for one action (M9, M10). */
export function Header({ title, right, onBack, size = 26 }: { title: string; right?: ReactNode; onBack?: () => void; size?: number }) {
  return (
    <Row between style={{ minHeight: 44 }}>
      <Row style={{ flex: 1, minWidth: 0 }}>
        <IconButton icon="back" label="Back" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/business/more")))} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, fontFamily: f.serifBold, fontSize: size, lineHeight: Math.round(size * 1.15), color: c.ink }}>{title}</Text>
      </Row>
      {right}
    </Row>
  );
}

/** The small capital label above a group of rows. */
export function Grp({ children, right, style }: { children: ReactNode; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Row between style={[{ marginTop: 16, marginBottom: 8, minHeight: 17 }, style]}>
      <Text style={{ flex: 1, fontFamily: f.semi, fontSize: 12, letterSpacing: 0.96, textTransform: "uppercase", color: c.muted }}>{children}</Text>
      {right}
    </Row>
  );
}

// ---------- controls ----------

/** The on/off switch the designs draw: 44 by 26, ink when on. */
export function Sw({ on, onPress, label, disabled }: { on: boolean; onPress?: () => void; label: string; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on, disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
      style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: on ? c.ink : mc.swOff, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 10, backgroundColor: c.cream }} />
    </Pressable>
  );
}

/** Minus, a value, plus. Pressing the value opens exact entry when `onValue` is given. */
export function Stepper({ value, onLess, onMore, onValue, lessLabel, moreLabel, disabled }: { value: string; onLess: () => void; onMore: () => void; onValue?: () => void; lessLabel: string; moreLabel: string; disabled?: boolean }) {
  const side = (sign: string, label: string, go: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={go} hitSlop={{ top: 2, bottom: 2 }} style={({ pressed }) => ({ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
      <Text style={{ fontFamily: f.body, fontSize: 18, color: c.ink }}>{sign}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: c.line2, borderRadius: 999, backgroundColor: c.white, opacity: disabled ? 0.6 : 1 }}>
      {side("−", lessLabel, onLess)}
      <Pressable accessibilityRole={onValue ? "button" : undefined} accessibilityLabel={onValue ? `${value}. Type an exact value` : undefined} disabled={!onValue || disabled} onPress={onValue} style={{ minWidth: 44, height: 40, justifyContent: "center" }}>
        <Text style={{ fontFamily: f.bold, fontSize: 14, color: c.ink, textAlign: "center" }}>{value}</Text>
      </Pressable>
      {side("+", moreLabel, onMore)}
    </View>
  );
}

/** Two or three words to switch between, underlined (M10). */
export function Tabs2<K extends string>({ tabs, value, onChange }: { tabs: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 4, borderBottomWidth: 1, borderBottomColor: c.line2 }}>
      {tabs.map(([k, name]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: k === value }} onPress={() => onChange(k)} style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: k === value ? c.ink : "transparent", marginBottom: -1 }}>
          <Text style={{ fontFamily: f.semi, fontSize: 14, color: k === value ? c.ink : c.tab, textAlign: "center" }}>{name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- rows ----------

/** A row in a card of links (M11): an optional icon tile, a title, one line under it, and a chevron or a tag. */
export function Item({ icon, title, sub, right, onPress, last, web, danger }: { icon?: ReactNode; title: string; sub?: string; right?: ReactNode; onPress?: () => void; last?: boolean; web?: boolean; danger?: boolean }) {
  return (
    <Pressable accessibilityRole={web ? "link" : "button"} accessibilityLabel={`${title}${sub ? `. ${sub}` : ""}${web ? ". Opens on the web" : ""}`} onPress={onPress} disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 54, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
      {icon ? <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: mc.tile, alignItems: "center", justifyContent: "center" }}>{icon}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: danger ? c.bad : c.ink }}>{title}</Text>
        {sub || web ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{[sub, web ? "Opens on the web" : ""].filter(Boolean).join(" · ")}</Text> : null}
      </View>
      {right ?? (onPress ? (web ? <McIcon name="external" size={16} color={c.muted2} /> : <Icon name="next" size={18} color={c.muted2} />) : null)}
    </Pressable>
  );
}

/** A setting in a card (M10): what it is, one line about it, and its control on the right. */
export function SetRow({ title, sub, right, last, onPress }: { title: string; sub?: string; right?: ReactNode; last?: boolean; onPress?: () => void }) {
  const body = (
    <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{sub}</Text> : null}
      </View>
      {right}
    </>
  );
  const style: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line };
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}>{body}</Pressable> : <View style={style}>{body}</View>;
}

/** A value in wine on the right of a setting, pressed to change it. */
export function Val({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.wine, flexShrink: 0 }}>{children}</Text>;
}

/** The small tag the designs use (11px), smaller than the shared Pill. */
export function Tag({ children, kind = "grey" }: { children: ReactNode; kind?: "ok" | "gold" | "grey" | "wine" | "night" }) {
  const [bg, fg] = { ok: [c.okBg, c.ok], gold: [c.goldBg, c.goldInk], grey: ["#EFE5DA", c.muted], wine: [c.wineBg, c.wine], night: ["rgba(255,255,255,.1)", mc.onNight] }[kind];
  return <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: bg, flexShrink: 0 }}><Text style={{ fontFamily: f.semi, fontSize: 11, lineHeight: 13, color: fg }}>{children}</Text></View>;
}

// ---------- a sheet from the bottom ----------

/** A panel that slides up over the screen for one small job: choosing a time, typing a value, a form. */
export function Sheet({ open, onClose, title, sub, children, footer, tall }: { open: boolean; onClose: () => void; title: string; sub?: string; children: ReactNode; footer?: ReactNode; tall?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,21,19,.45)" }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, minHeight: 40 }} />
        <View accessibilityViewIsModal style={{ backgroundColor: c.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", height: tall ? "92%" : undefined, paddingTop: 14 }}>
          <Row between style={{ paddingHorizontal: pad, marginBottom: 8, alignItems: "flex-start" }}>
            <View style={{ flex: 1, minWidth: 0, paddingTop: 6 }}>
              <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 22, lineHeight: 26, color: c.ink }}>{title}</Text>
              {sub ? <T size={13} muted style={{ marginTop: 4 }}>{sub}</T> : null}
            </View>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, paddingTop: 6, paddingBottom: footer ? 16 : Math.max(insets.bottom, 20), gap: 14 }} style={{ flexGrow: tall ? 1 : 0 }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: pad, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14), borderTopWidth: 1, borderTopColor: c.line }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One choice in a list of choices inside a sheet. */
export function Choice({ title, sub, on, onPress }: { title: string; sub?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, minHeight: 56, borderRadius: 16, backgroundColor: c.white, borderWidth: on ? 2 : 1, borderColor: on ? c.ink : c.line2, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{sub}</Text> : null}
      </View>
      {on ? <Icon name="check" size={18} /> : null}
    </Pressable>
  );
}

// ---------- when a role may not open a screen ----------

/**
 * Shown when the API answers 403: the screen belongs to a manager or the owner. It says so calmly and
 * offers what every team member may do: their own account, their calendar sync, signing out.
 */
export function AskManager({ what, who = "a manager or the owner" }: { what: string; who?: string }) {
  const s = useSession();
  return (
    <View style={{ gap: 12, marginTop: 16 }}>
      <Card style={{ padding: 18, gap: 6 }}>
        <T weight="semi" size={16}>Ask {who}</T>
        <T muted size={14}>{what} Your sign-in is for the day's work: the calendar, clients, checkout and messages.</T>
      </Card>
      <Card>
        <Item title="Your account" sub="Your name, phone and password" onPress={() => router.push("/m/account" as never)} />
        <Item title="Calendar sync" sub="Your bookings in your own calendar" onPress={() => router.push("/m/calendar-sync" as never)} />
        <Item title="Sign out" last danger right={<Icon name="out" size={18} color={c.bad} />} onPress={async () => { await s.signOut("business"); router.replace("/sign-in?side=business" as never); }} />
      </Card>
    </View>
  );
}

/** A plain link that opens a page of the web app, with the words that say so. */
export function WebLink({ children, path, style }: { children: ReactNode; path: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => openWeb(path)} style={({ pressed }) => [{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, opacity: pressed ? 0.7 : 1 }, style]}>
      <Text style={{ flexShrink: 1, fontFamily: f.semi, fontSize: 13, color: c.wine }}>{children}</Text>
      <McIcon name="external" size={14} color={c.wine} />
    </Pressable>
  );
}

/** A button the size the phone designs use for secondary actions (40 high, 13px). */
export function SmallBtn({ children, onPress, kind = "out", busy, disabled, style, icon }: { children: ReactNode; onPress?: () => void; kind?: "ink" | "gold" | "out" | "ghost" | "danger"; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: IconName }) {
  if (kind === "ghost") {
    return (
      <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: "rgba(244,236,227,.3)", alignItems: "center", justifyContent: "center", opacity: disabled || busy ? 0.5 : pressed ? 0.8 : 1 }, style]}>
        <Text style={{ fontFamily: f.semi, fontSize: 14, color: mc.onNight }}>{children}</Text>
      </Pressable>
    );
  }
  return <Btn small kind={kind} onPress={onPress} busy={busy} disabled={disabled} style={style} icon={icon}>{children}</Btn>;
}

/** The style of one row of a list drawn as a single card: rounded and bordered at its first and last rows. */
export function piece(first: boolean, last: boolean): ViewStyle {
  return {
    backgroundColor: c.white, borderColor: c.line, borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: first ? 1 : 0, borderBottomWidth: 1, borderBottomColor: last ? c.line : c.line,
    borderTopLeftRadius: first ? 20 : 0, borderTopRightRadius: first ? 20 : 0, borderBottomLeftRadius: last ? 20 : 0, borderBottomRightRadius: last ? 20 : 0,
  };
}
