// Small pieces the Staff & chairs screens share: a date picker, a time stepper, choices in a row,
// the colour swatches, a person's row, and one time-off request with what can be done to it.
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { SmallBtn, Stepper, Tag, mc } from "@/components/mc-kit";
import { Avatar, Card, Icon, Label, Row, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { firstName, plural } from "@/lib/format";
import { clock12, dateOnly } from "@/lib/mc-util";
import { addDays, dayLabel, mondayOf } from "@/lib/mb-util";
import { OFF_STATUS, ROLE, TONES, isRenter, offDays, offSpan, shift15 } from "@/lib/me-staff";
import { c, f } from "@/lib/theme";

// ---------- icons the shared sets do not have ----------

const PATHS = {
  chair: ["M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5", "M4 11h16v4H4z", "M6 15v5", "M18 15v5"],
  door: ["M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17", "M3 21h18", "M15 12h.01"],
  key: ["M14 10l7-7", "M17 6l3 3", "M10.5 13.5 13 11"],
  coins: ["M12 7v10", "M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5"],
  sun: ["M12 3v2", "M12 19v2", "M3 12h2", "M19 12h2", "m5.6 5.6 1.4 1.4", "m17 17 1.4 1.4", "m5.6 18.4 1.4-1.4", "m17 7 1.4-1.4"],
  mail: ["M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z", "m3.5 7 8.5 6 8.5-6"],
  week: ["M3 9h18", "M8 3v4", "M16 3v4", "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "M8 13h2", "M14 13h2", "M8 17h2"],
} as const;
const DOTS: Partial<Record<keyof typeof PATHS, [number, number, number][]>> = { key: [[7.5, 16.5, 4.5]], coins: [[12, 12, 9]], sun: [[12, 12, 4]] };
export type MeIconName = keyof typeof PATHS;

export function MeIcon({ name, size = 18, color = c.ink }: { name: MeIconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {(DOTS[name] ?? []).map(([x, y, r], i) => <Circle key={"c" + i} cx={x} cy={y} r={r} />)}
      {PATHS[name].map((d, i) => <Path key={i} d={d} />)}
    </Svg>
  );
}

// ---------- choosing ----------

/** A few choices in a row under a label; one is chosen. */
export function Options<K extends string>({ label, options, value, onChange, disabled }: { label?: string; options: [K, string][]; value: K; onChange: (k: K) => void; disabled?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, opacity: disabled ? 0.5 : 1 }}>
        {options.map(([k, name]) => {
          const on = k === value;
          return (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: !!disabled }} disabled={disabled} onPress={() => onChange(k)}
              style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ fontFamily: f.semi, fontSize: 13, color: on ? c.cream : c.ink }}>{name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A tick box with words beside it. */
export function Tick({ on, onPress, title, sub, disabled }: { on: boolean; onPress: () => void; title: string; sub?: string; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: on ? 0 : 1.5, borderColor: c.line2, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center" }}>
        {on ? <Icon name="check" size={15} color={c.cream} stroke={2.6} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

/** The colour a person has on the calendar. */
export function TonePick({ value, onChange }: { value: string; onChange: (tone: string) => void }) {
  const all = TONES.some((t) => t.toLowerCase() === value.toLowerCase()) || !value ? TONES : [value, ...TONES];
  return (
    <View style={{ gap: 6 }}>
      <Label>Colour on the calendar</Label>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {all.map((t) => {
          const on = t.toLowerCase() === value.toLowerCase();
          return (
            <Pressable key={t} accessibilityRole="radio" accessibilityLabel={`Colour ${t}`} accessibilityState={{ checked: on }} onPress={() => onChange(t)}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: on ? c.ink : "transparent" }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t }} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A time moved a quarter of an hour at a time. */
export function TimeStep({ value, onChange, label, disabled }: { value: string; onChange: (hhmm: string) => void; label: string; disabled?: boolean }) {
  return <Stepper value={clock12(value)} disabled={disabled} lessLabel={`${label}: earlier`} moreLabel={`${label}: later`} onLess={() => onChange(shift15(value, false))} onMore={() => onChange(shift15(value, true))} />;
}

/** Whole days of the week to tick: the days a chair is rented. */
export function DayTicks({ label, days, value, onChange }: { label: string; days: readonly (readonly [string, string])[]; value: string[]; onChange: (days: string[]) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {days.map(([k, name]) => {
          const on = value.includes(k);
          return (
            <Pressable key={k} accessibilityRole="checkbox" accessibilityLabel={name} accessibilityState={{ checked: on }} onPress={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: f.semi, fontSize: 12, color: on ? c.cream : c.ink }}>{name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- a date ----------

const monthName = (ym: string) => new Date(ym + "-15T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
const nextMonth = (ym: string, n: number) => { const d = new Date(ym + "-15T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };

/** A month to pick one day from. `min` and `max` grey out days that cannot be chosen. */
export function MonthPicker({ value, onPick, min, max, today }: { value: string; onPick: (day: string) => void; min?: string; max?: string; today: string }) {
  const [ym, setYm] = useState((value || today).slice(0, 7));
  const first = mondayOf(ym + "-01");
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const weeks = [0, 1, 2, 3, 4, 5].map((w) => days.slice(w * 7, w * 7 + 7)).filter((w) => w.some((d) => d.slice(0, 7) === ym));
  const canBack = !min || ym > min.slice(0, 7), canNext = !max || ym < max.slice(0, 7);
  const arrow = (dir: -1 | 1, ok: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={dir < 0 ? "Month before" : "Month after"} disabled={!ok} onPress={() => setYm(nextMonth(ym, dir))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: ok ? 1 : 0.3 }}>
      <Icon name={dir < 0 ? "back" : "next"} size={18} />
    </Pressable>
  );
  return (
    <View style={{ backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, paddingHorizontal: 6, paddingBottom: 8 }}>
      <Row between>
        {arrow(-1, canBack)}
        <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{monthName(ym)}</Text>
        {arrow(1, canNext)}
      </Row>
      <View style={{ flexDirection: "row" }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <Text key={i} style={{ flex: 1, textAlign: "center", fontFamily: f.medium, fontSize: 11, color: c.muted2, paddingBottom: 4 }}>{d}</Text>)}
      </View>
      {weeks.map((w) => (
        <View key={w[0]} style={{ flexDirection: "row" }}>
          {w.map((d) => {
            const inMonth = d.slice(0, 7) === ym, on = d === value, locked = (!!min && d < min) || (!!max && d > max);
            if (!inMonth) return <View key={d} style={{ flex: 1, height: 44 }} />;
            return (
              <Pressable key={d} accessibilityRole="button" accessibilityLabel={dayLabel(d)} accessibilityState={{ selected: on, disabled: locked }} disabled={locked} onPress={() => onPick(d)} style={{ flex: 1, height: 44, alignItems: "center", justifyContent: "center", opacity: locked ? 0.3 : 1 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : "transparent", borderWidth: d === today && !on ? 1 : 0, borderColor: c.gold }}>
                  <Text style={{ fontFamily: on ? f.semi : f.medium, fontSize: 14, color: on ? c.cream : c.ink }}>{Number(d.slice(8))}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** A date shown as a field; pressing it opens the month to pick from. */
export function DateField({ label, value, onChange, min, max, today, empty = "Choose a day", clearable }: { label: string; value: string; onChange: (day: string) => void; min?: string; max?: string; today: string; empty?: string; clearable?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <Row gap={8}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? dayLabel(value) : empty}. Change`} onPress={() => setOpen(!open)}
          style={{ flex: 1, minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: open ? c.ink : c.line2, backgroundColor: c.white, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon name="calendar" size={18} color={c.muted} />
          <Text style={{ flex: 1, fontFamily: f.body, fontSize: 16, color: value ? c.ink : c.muted2 }}>{value ? dayLabel(value) : empty}</Text>
          <Icon name="down" size={16} color={c.muted2} />
        </Pressable>
        {clearable && value ? <SmallBtn onPress={() => { onChange(""); setOpen(false); }}>Clear</SmallBtn> : null}
      </Row>
      {open ? <MonthPicker value={value} today={today} min={min} max={max} onPick={(d) => { onChange(d); setOpen(false); }} /> : null}
    </View>
  );
}

// ---------- numbers ----------

/** Three numbers side by side with a small word under each. */
export function Minis({ items, night }: { items: [string, string][]; night?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {items.map(([value, name]) => (
        <View key={name} style={{ flex: 1, backgroundColor: night ? "rgba(255,255,255,.08)" : mc.tile, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: f.serifBold, fontSize: 20, lineHeight: 24, color: night ? mc.onNight : c.ink }}>{value}</Text>
          <Text numberOfLines={1} style={{ fontFamily: f.medium, fontSize: 11, lineHeight: 15, color: night ? mc.nightMuted : c.muted }}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

/** One line of a list of figures: what it is on the left, the figure on the right. */
export function Fig({ name, value, bold, last, sub }: { name: string; value: string; bold?: boolean; last?: boolean; sub?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 16, minHeight: 44, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: bold ? f.semi : f.body, fontSize: 14, lineHeight: 20, color: c.ink }}>{name}</Text>
        {sub ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{sub}</Text> : null}
      </View>
      <Text style={{ fontFamily: bold ? f.bold : f.semi, fontSize: 14, color: c.ink }}>{value}</Text>
    </View>
  );
}

// ---------- people ----------

/** "Manager · senior", or "Independent · Lash Haus" for a chair renter. */
export const roleLine = (p: Data) => (isRenter(p) ? `Independent${p.trading_name ? ` · ${p.trading_name}` : ""}` : `${ROLE[p.role] ?? p.role} · ${p.level}`);

/** The face of a person: the API keeps no photo of a team member, so it is their initials on their colour. */
export function Face({ p, size = 40 }: { p: Data; size?: number }) {
  return <Avatar name={String(p.name ?? "")} tone={p.archived ? c.muted2 : (p.tone as string)} size={size} />;
}

// ---------- time off ----------

export type OffDo = (o: Data, decision: "approve" | "decline" | "cancel", reassign?: boolean) => void;

/** One time-off entry: who, when, why, what it does to bookings, and what a manager can do about it. */
export function OffCard({ o, manager, mine, busy, onDo, showWho = true }: { o: Data; manager: boolean; mine: boolean; busy: boolean; onDo: OffDo; showWho?: boolean }) {
  const [label, kind] = OFF_STATUS[String(o.status)] ?? [String(o.status), "grey"];
  const n = offDays(o), hit = Number(o.bookings_affected ?? 0);
  const asked = o.status === "requested";
  return (
    <Card style={{ padding: 14, gap: 10, borderColor: asked ? "#E8D9B5" : c.line, backgroundColor: asked ? "#FFFBF2" : c.white }}>
      <Row gap={10} style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {showWho ? <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{String(o.staff)}</Text> : null}
          <Text style={{ fontFamily: showWho ? f.body : f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{offSpan(o)}</Text>
          <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{[plural(n, "day"), o.reason ? String(o.reason) : "No reason given"].join(" · ")}</Text>
        </View>
        <Tag kind={kind}>{label}</Tag>
      </Row>
      {hit > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/business/calendar" as never)} style={{ minHeight: 44, borderRadius: 12, backgroundColor: c.wineBg, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, fontFamily: f.medium, fontSize: 13, lineHeight: 18, color: c.wine }}>{plural(hit, "booking")} on {hit === 1 ? "that day needs" : "those days need"} moving. Open the calendar on {dateOnly(o.starts_on)}.</Text>
          <Icon name="next" size={16} color={c.wine} />
        </Pressable>
      ) : null}
      {manager ? (
        <Row gap={8} wrap>
          {asked ? <SmallBtn kind={hit > 0 ? "out" : "ink"} disabled={busy} onPress={() => onDo(o, "approve")}>Approve</SmallBtn> : null}
          {asked && hit > 0 ? <SmallBtn kind="ink" disabled={busy} onPress={() => onDo(o, "approve", true)}>Approve and reassign</SmallBtn> : null}
          {asked ? <SmallBtn disabled={busy} onPress={() => onDo(o, "decline")}>Decline</SmallBtn> : null}
          <SmallBtn kind="danger" disabled={busy} onPress={() => onDo(o, "cancel")}>Remove</SmallBtn>
        </Row>
      ) : asked ? <T size={12} muted>{mine ? "Waiting for a manager. You stay bookable until it is approved." : "Waiting for a manager."}</T>
        : mine ? <T size={12} muted>Ask a manager or the owner if this needs changing or removing.</T> : null}
    </Card>
  );
}

/** The short card a role sees in place of a part of a screen it may not use. */
export function AskCard({ title = "Ask a manager or the owner", children }: { title?: string; children: ReactNode }) {
  return (
    <Card style={{ padding: 16, gap: 4 }}>
      <T weight="semi" size={15}>{title}</T>
      <T muted size={13}>{children}</T>
    </Card>
  );
}

export const first = (name: unknown) => firstName(String(name ?? "")) || "They";
