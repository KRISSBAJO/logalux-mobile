// Pieces the settings and pricing-tool screens share: the shell of a screen and its waiting states,
// and the form controls a phone needs where the web uses a select, a date box or a time box.
// Pickers open in place, under their own label, so a form in a sheet never stacks a second sheet on top.
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AskManager, Header, McIcon, Sw, Wait, mc } from "@/components/mc-kit";
import { Card, Failed, Icon, Label, Note, Row, Screen, T } from "@/components/ui";
import { todayIn } from "@/lib/ma-format";
import { HALF_HOURS, clock12, dateOnly } from "@/lib/mc-util";
import { addMonths, monthGrid, monthName, type Flash } from "@/lib/mi-util";
import { c, f, pad, radius } from "@/lib/theme";

/** Back to where the person came from, or to a named screen when this one was opened by its address. */
export const backTo = (path: string) => () => (router.canGoBack() ? router.back() : router.replace(path as never));

/** What a screen shows before it has its data: the reason it cannot open, the error, or a spinner. */
export function Gate({ title, denied, what, error, onRetry, onBack }: { title: string; denied?: boolean; what?: string; error?: string; onRetry?: () => void; onBack?: () => void }) {
  return (
    <Screen>
      <Header title={title} onBack={onBack} />
      {denied ? <AskManager what={what ?? "This is looked after by a manager or the owner."} />
        : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={onRetry} /></View> : <Wait />}
    </Screen>
  );
}

/** A whole screen with its title, an optional message under it, and fields that stay above the keyboard. */
export function Page({ title, children, footer, note, right, onBack, onRefresh, refreshing, lead }: { title: string; children: ReactNode; footer?: ReactNode; note?: Flash; right?: ReactNode; onBack?: () => void; onRefresh?: () => void; refreshing?: boolean; lead?: string }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen footer={footer} onRefresh={onRefresh} refreshing={refreshing}>
        <Header title={title} right={right} onBack={onBack} />
        {lead ? <T muted size={14} style={{ marginTop: 10 }}>{lead}</T> : null}
        {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
        {children}
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** The one dark card a screen may have, for the thing that matters most on it. */
export function Night({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: mc.night, borderRadius: 22, padding: 18 }, style]}>{children}</View>;
}
export function NightLabel({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: mc.nightMuted }}>{children}</Text>;
}

/** Told to a team member whose role may read a screen but not change it. */
export function ReadOnly({ children }: { children: ReactNode }) {
  return <View style={{ marginTop: 12 }}><Note kind="gold">{children}</Note></View>;
}

// ---------- form controls ----------

/** A field that is chosen, not typed: shows the choice, and opens its options underneath when pressed. */
export function Pick({ label, value, placeholder, open, onToggle, error, hint, children, disabled }: { label: string; value: string; placeholder?: string; open: boolean; onToggle: () => void; error?: string; hint?: string; children?: ReactNode; disabled?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value || placeholder || "not set"}`} accessibilityState={{ expanded: open, disabled: !!disabled }} disabled={disabled} onPress={onToggle}
        style={({ pressed }) => ({ minHeight: 52, borderRadius: radius.field, borderWidth: open ? 2 : 1, borderColor: error ? c.bad : open ? c.ink : c.line2, backgroundColor: c.white, paddingHorizontal: open ? 13 : 14, flexDirection: "row", alignItems: "center", gap: 10, opacity: disabled ? 0.6 : pressed ? 0.85 : 1 })}>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.body, fontSize: 16, color: value ? c.ink : c.muted2 }}>{value || placeholder || ""}</Text>
        <McIcon name={open ? "up" : "down"} size={18} color={c.muted} />
      </Pressable>
      {error ? <T size={13} color={c.bad}>{error}</T> : hint && !open ? <T size={13} muted>{hint}</T> : null}
      {open ? <View style={{ gap: 8, marginTop: 2 }}>{children}</View> : null}
    </View>
  );
}

/** One of a few choices, side by side. */
export function Seg<K extends string>({ label, options, value, onChange, hint }: { label?: string; options: [K, string][]; value: K; onChange: (k: K) => void; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", backgroundColor: c.cream2, borderRadius: 14, padding: 4, gap: 4 }}>
        {options.map(([k, name]) => {
          const on = k === value;
          return (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(k)}
              style={{ flex: 1, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, backgroundColor: on ? c.white : "transparent", borderWidth: 1, borderColor: on ? c.line2 : "transparent" }}>
              <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 13, color: on ? c.ink : c.muted }}>{name}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <T size={13} muted>{hint}</T> : null}
    </View>
  );
}

/** A switch with its own line of explanation, inside a card, for a form. */
export function SwitchCard({ title, sub, on, onPress, disabled }: { title: string; sub?: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Card>
      <Row style={{ paddingVertical: 13, paddingHorizontal: 16, minHeight: 56 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={14} weight="semi">{title}</T>
          {sub ? <T size={12} muted>{sub}</T> : null}
        </View>
        <Sw on={on} label={title} onPress={onPress} disabled={disabled} />
      </Row>
    </Card>
  );
}

/** An up or down arrow for putting a list in order. */
export function ArrowBtn({ up, disabled, label, onPress }: { up?: boolean; disabled?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={4}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}>
      <McIcon name={up ? "up" : "down"} size={18} />
    </Pressable>
  );
}

/** A plain text button inside a group heading: "Reorder", "Done". */
export function HeadLink({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} hitSlop={14}><Text style={{ fontFamily: f.semi, fontSize: 12, color: c.wine }}>{children}</Text></Pressable>;
}

// ---------- a day and a time, chosen in place ----------

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

/** A month to pick a day from. `value` and the answer are YYYY-MM-DD. */
export function DayGrid({ value, onPick, tz, min }: { value: string; onPick: (day: string) => void; tz?: string; min?: string }) {
  const today = todayIn(tz);
  const [month, setMonth] = useState((value || today).slice(0, 7));
  return (
    <View style={{ backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, padding: 8 }}>
      <Row between>
        <Pressable accessibilityRole="button" accessibilityLabel="Earlier month" onPress={() => setMonth(addMonths(month, -1))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="back" size={18} /></Pressable>
        <T weight="semi" size={14}>{monthName(month)}</T>
        <Pressable accessibilityRole="button" accessibilityLabel="Later month" onPress={() => setMonth(addMonths(month, 1))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="next" size={18} /></Pressable>
      </Row>
      <View style={{ flexDirection: "row" }}>
        {WEEK.map((w, i) => <Text key={i} style={{ flex: 1, textAlign: "center", fontFamily: f.medium, fontSize: 11, color: c.muted2, paddingBottom: 4 }}>{w}</Text>)}
      </View>
      {monthGrid(month).map((week, i) => (
        <View key={i} style={{ flexDirection: "row" }}>
          {week.map((d, j) => {
            const on = !!d && d === value, off = !d || (!!min && d < min);
            return (
              <Pressable key={j} accessibilityRole={d ? "button" : undefined} accessibilityLabel={d ? dateOnly(d) : undefined} accessibilityState={d ? { selected: on, disabled: off } : undefined} disabled={off} onPress={() => onPick(d)}
                style={{ flex: 1, height: 44, alignItems: "center", justifyContent: "center" }}>
                {d ? (
                  <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : "transparent", borderWidth: d === today && !on ? 1 : 0, borderColor: c.gold }}>
                    <Text style={{ fontFamily: on ? f.semi : f.medium, fontSize: 14, color: on ? c.cream : off ? "#C9BCB0" : c.ink }}>{Number(d.slice(8))}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Every half hour of the day to pick from. A time that is not on the half hour is kept and shown first. */
export function TimeGrid({ value, onPick }: { value: string; onPick: (hhmm: string) => void }) {
  const times = value && !HALF_HOURS.includes(value) ? [value, ...HALF_HOURS] : HALF_HOURS;
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {times.map((t) => {
        const on = t === value;
        return (
          <Pressable key={t} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onPick(t)}
            style={{ width: "23.5%", minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: f.semi, fontSize: 12, color: on ? c.cream : c.ink }}>{clock12(t)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Clears a chosen day or time: "Any time", "No last day". */
export function ClearLink({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", alignSelf: "flex-start", opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>{children}</Text>
    </Pressable>
  );
}

// ---------- a screen that is one long list ----------

/** A screen whose body is a list that may be long: the heading scrolls with it, and it can be pulled to refresh. */
export function ListPage<T>({ data, keyOf, render, header, footer, empty, onRefresh, refreshing, pinned, gap = 0 }: {
  data: T[]; keyOf: (item: T) => string; render: (item: T, index: number) => ReactNode; header: ReactNode; footer?: ReactNode; empty?: ReactNode;
  onRefresh?: () => void; refreshing?: boolean; pinned?: ReactNode; gap?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={data}
        keyExtractor={keyOf}
        renderItem={({ item, index }) => <>{render(item, index)}</>}
        ItemSeparatorComponent={gap ? () => <View style={{ height: gap }} /> : undefined}
        ListHeaderComponent={<View>{header}</View>}
        ListEmptyComponent={empty ? <View>{empty}</View> : undefined}
        ListFooterComponent={footer ? <View>{footer}</View> : undefined}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: pad, paddingBottom: (pinned ? 0 : Math.max(insets.bottom, 14)) + 24 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.wine} /> : undefined}
      />
      {pinned ? <View style={{ paddingHorizontal: pad, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.cream }}>{pinned}</View> : null}
    </View>
  );
}
