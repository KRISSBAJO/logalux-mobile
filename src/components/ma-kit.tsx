import { useFormReset } from "../lib/form-reset";
// Pieces shared by the business day-to-day screens: a sheet that rises from the bottom, the week strip,
// the free-time picker (the same business-side availability the web's booking forms use), and a few icons
// the shared kit does not have.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { Chip, Icon, IconButton, Row, T } from "@/components/ui";
import { qs, type Row as Data } from "@/lib/api";
import { clock, duration, firstName, money } from "@/lib/format";
import { addDays, dayLabel, dayNum, mondayOf, todayIn, weekdayLetter } from "@/lib/ma-format";
import { c, f } from "@/lib/theme";

// ---------- small things ----------

/** The capital label above a group, as the designs draw it, with room for something on the right. */
export function Group({ children, right, top = 16 }: { children: ReactNode; right?: ReactNode; top?: number }) {
  return (
    <Row between style={{ marginTop: top, marginBottom: 8, minHeight: 18 }}>
      <Text accessibilityRole="header" style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: c.muted }}>{children}</Text>
      {typeof right === "string" ? <Text style={{ fontFamily: f.semi, fontSize: 12, color: c.ink }}>{right}</Text> : right}
    </Row>
  );
}

/** A text link in the wine colour, tall enough to press. */
export function LinkText({ children, onPress, size = 13, color = c.wine, style }: { children: ReactNode; onPress: () => void; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={({ pressed }) => [{ minHeight: 44, justifyContent: "center", opacity: pressed ? 0.7 : 1 }, style]}>
      <Text style={{ fontFamily: f.semi, fontSize: size, color }}>{children}</Text>
    </Pressable>
  );
}

const EXTRA = {
  dots: [] as string[],
  tap: ["M7 8a5 5 0 0 1 10 0", "M4 5a9 9 0 0 1 16 0", "M12 12v9", "M9 21h6"],
  paycard: ["M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z", "M2 10h20", "M6 15h4"],
  cash: ["M3 7h18v10H3z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5", "M6 12h.01", "M18 12h.01"],
  link: ["M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1", "M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"],
  transfer: ["M4 9h16", "m16 5 4 4-4 4", "M20 15H4", "m8 11-4 4 4 4"],
  minus: ["M5 12h14"],
} as const;
export type MaIconName = keyof typeof EXTRA;

export function MaIcon({ name, size = 20, color = c.ink }: { name: MaIconName; size?: number; color?: string }) {
  if (name === "dots") {
    return <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Circle cx={5} cy={12} r={2} /><Circle cx={12} cy={12} r={2} /><Circle cx={19} cy={12} r={2} /></Svg>;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {EXTRA[name].map((d, i) => <Path key={i} d={d} />)}
    </Svg>
  );
}

/** A round button holding one of the icons above, sized like the kit's IconButton. */
export function RoundButton({ label, onPress, children, dark }: { label: string; onPress?: () => void; children: ReactNode; dark?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: dark ? c.ink : c.white, borderWidth: 1, borderColor: dark ? c.ink : c.line, opacity: pressed ? 0.8 : 1 })}>
      {children}
    </Pressable>
  );
}

// ---------- a sheet from the bottom ----------

export function Sheet({ open, onClose, title, sub, children, footer }: { open: boolean; onClose: () => void; title: string; sub?: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,21,19,.45)" }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
          <View accessibilityViewIsModal style={{ maxHeight: "88%", backgroundColor: c.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16 }}>
            <Row between style={{ paddingHorizontal: 20, alignItems: "flex-start", marginBottom: 8 }}>
              <View style={{ flex: 1, gap: 4, paddingTop: 6 }}>
                <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 22, lineHeight: 26, color: c.ink }}>{title}</Text>
                {sub ? <T muted size={13}>{sub}</T> : null}
              </View>
              <IconButton icon="close" label="Close" onPress={onClose} />
            </Row>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: footer ? 16 : Math.max(insets.bottom, 20) }}>
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16), borderTopWidth: 1, borderTopColor: c.line }}>{footer}</View> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------- the week strip (M1) ----------

/** Seven days in a row. `dots` marks days with bookings, `off` greys days the business is closed, `before` stops earlier days being picked. */
export function WeekStrip({ days, value, onPick, dots, off, before }: { days: string[]; value: string; onPick: (day: string) => void; dots?: Set<string>; off?: Set<string>; before?: string }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {days.map((d) => {
        const on = d === value, closed = off?.has(d), locked = !!before && d < before;
        return (
          <Pressable key={d} accessibilityRole="button" accessibilityLabel={dayLabel(d) + (closed ? ", closed" : "")} accessibilityState={{ selected: on, disabled: locked }} disabled={locked} onPress={() => onPick(d)}
            style={({ pressed }) => ({ flex: 1, minHeight: 64, alignItems: "center", gap: 8, opacity: locked ? 0.35 : pressed ? 0.7 : 1 })}>
            <Text style={{ fontFamily: on ? f.semi : f.medium, fontSize: 11, letterSpacing: 0.4, color: on ? c.ink : c.muted2 }}>{weekdayLetter(d)}</Text>
            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : "transparent" }}>
              <Text style={{ fontFamily: on ? f.semi : f.medium, fontSize: 15, color: on ? c.cream : closed ? "#C9BCB0" : c.ink }}>{dayNum(d)}</Text>
            </View>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.gold, opacity: dots?.has(d) && !on ? 1 : 0 }} />
          </Pressable>
        );
      })}
    </View>
  );
}

export const weekFrom = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

// ---------- the free-time picker ----------

export type Slot = { time: string; starts_at: string; staff_id: string; staff: string; price_cents?: number };
export type Person = { id: string; name: string; bookable?: boolean };

/**
 * Picks a day, a person and a free time. It asks the API for the open slots of the chosen day and person
 * (GET /v1/m/availability, which respects breaks, rooms and blocks), so a taken time can never be chosen.
 * `again` changes when the times should be asked for afresh, for example after a clash.
 */
export function SlotPicker({ mapi, tz, currency, staff, serviceIds, exclude, day, onDay, who, onWho, value, onPick, again = 0 }: {
  mapi: <T = Data>(path: string) => Promise<T>; tz?: string; currency: string; staff: Person[]; serviceIds: string[]; exclude?: string;
  day: string; onDay: (day: string) => void; who: string; onWho: (id: string) => void; value: Slot | null; onPick: (slot: Slot | null) => void; again?: number;
}) {
  const today = todayIn(tz);
  const [monday, setMonday] = useState(mondayOf(day));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);
  const key = serviceIds.join(",");
  const people = staff.filter((p) => p.bookable !== false);

  useFormReset([day], () => { setMonday(mondayOf(day)); });

  useFormReset([key, day, who, exclude, again], () => { setAll(false); setSlots(null); setError(""); });
  useEffect(() => {
    onPick(null);
    if (!key || !day) return;
    let open = true;
    mapi<{ slots?: Slot[]; duration_min?: number }>("/availability" + qs({ date: day, services: key, staff: who || "any", exclude }))
      .then((out) => { if (open) { setSlots(out.slots ?? []); setMinutes(out.duration_min ?? 0); } })
      .catch((e: Error) => { if (open) setError(e.message || "Could not load the free times."); });
    return () => { open = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, day, who, exclude, again]);

  // With "anyone", the same time can be free with several people: keep each time once, earliest person first.
  const byTime = useMemo(() => {
    const seen = new Set<string>(), out: Slot[] = [];
    for (const s of slots ?? []) { const k = who === "any" ? s.time : s.time + s.staff_id; if (!seen.has(k)) { seen.add(k); out.push(s); } }
    return out;
  }, [slots, who]);
  // Pricing rules can make one time dearer than another. Say so only when they do.
  const varies = new Set(byTime.map((s) => s.price_cents)).size > 1;
  const shown = all ? byTime : byTime.slice(0, 12);
  const week = weekFrom(monday);

  return (
    <View style={{ gap: 12 }}>
      {people.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip on={who === "any"} onPress={() => onWho("any")}>Anyone free</Chip>
          {people.map((p) => <Chip key={p.id} on={who === p.id} onPress={() => onWho(p.id)}>{firstName(p.name)}</Chip>)}
        </ScrollView>
      ) : null}

      <View style={{ backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, paddingTop: 6, paddingBottom: 4, paddingHorizontal: 6 }}>
        <Row between style={{ paddingHorizontal: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Earlier week" disabled={monday <= mondayOf(today)} onPress={() => setMonday(addDays(monday, -7))} hitSlop={4}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: monday <= mondayOf(today) ? 0.3 : 1 }}>
            <Icon name="back" size={18} />
          </Pressable>
          <T weight="semi" size={14}>{dayLabel(day)}</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Later week" onPress={() => setMonday(addDays(monday, 7))} hitSlop={4} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Icon name="next" size={18} />
          </Pressable>
        </Row>
        <WeekStrip days={week} value={day} onPick={onDay} before={today} />
      </View>

      <View>
        <T muted size={12} weight="semi" style={{ marginBottom: 8 }}>{`Free times${minutes ? ` · ${duration(minutes)} needed` : ""}`}</T>
        {!key ? <T muted size={14}>Choose a service to see the free times.</T>
          : error ? <T size={14} color={c.bad}>{error}</T>
          : slots === null ? <View accessibilityLabel="Looking for free times" style={{ paddingVertical: 14, alignItems: "flex-start" }}><ActivityIndicator color={c.wine} /></View>
          : byTime.length === 0 ? <T muted size={14}>{`Nothing is free that day${who !== "any" ? " with this person" : ""}. Try another day${who !== "any" ? " or anyone free" : ""}.`}</T>
          : (
            <>
              <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {shown.map((s) => {
                  const on = value?.starts_at === s.starts_at && value.staff_id === s.staff_id;
                  const sub = [who === "any" && people.length > 1 ? firstName(s.staff) : "", varies && s.price_cents !== undefined ? money(s.price_cents, currency) : ""].filter(Boolean).join(" · ");
                  return (
                    <Pressable key={s.starts_at + s.staff_id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onPick(s)}
                      style={({ pressed }) => ({ width: "31.5%", minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 6, opacity: pressed ? 0.85 : 1 })}>
                      <Text style={{ fontFamily: f.semi, fontSize: 14, color: on ? c.cream : c.ink }}>{clock(s.starts_at, tz)}</Text>
                      {sub ? <Text numberOfLines={1} style={{ fontFamily: f.medium, fontSize: 11, color: on ? "#C9BCB0" : c.muted }}>{sub}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
              {byTime.length > shown.length ? <LinkText onPress={() => setAll(true)}>{`Show all ${byTime.length} times`}</LinkText> : null}
            </>
          )}
      </View>
    </View>
  );
}
