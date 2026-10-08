// Pieces the "Grow" screens share (Marketing, Campaigns, Automatic messages, Promo codes, Loyalty, New clients).
// They sit on the kits the other business screens use, so these screens look like they belong beside them.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { AskManager, Header, Tag, Wait, mc } from "@/components/mc-kit";
import { Card, Failed, Icon, Label, Row, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { dateMed } from "@/lib/mb-util";
import { AUDIENCE_LABEL, CHANNEL_LABEL, addMonths, campaignTag, fill, monthCells, monthTitle, n } from "@/lib/mg-util";
import { dateOnly } from "@/lib/mc-util";
import { c, f, pad, radius } from "@/lib/theme";

// ---------- icons the other sets do not have ----------

const PATHS = {
  spark: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z", "M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"],
  tag: ["M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"],
  mail: ["m3 7 9 6 9-6"],
  trend: ["M3 17l6-6 4 4 8-8", "M15 7h6v6"],
  copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
  bolt: ["M13 2 4 14h7l-1 8 9-12h-7z"],
  pencil: ["M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
} as const;
export type MgIconName = keyof typeof PATHS;

export function MgIcon({ name, size = 18, color = c.ink }: { name: MgIconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {name === "mail" ? <Rect x={3} y={5} width={18} height={14} rx={2} /> : null}
      {name === "tag" ? <Circle cx={7.5} cy={7.5} r={1.2} /> : null}
      {PATHS[name].map((d, i) => <Path key={i} d={d} />)}
    </Svg>
  );
}

// ---------- the frame of a screen ----------

/** What a screen shows before it has its data: a spinner, the reason it failed, or who to ask. */
export function NotReady({ title, denied, error, reload, what, who }: { title: string; denied: boolean; error: string; reload: () => void; what: string; who?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.cream, paddingTop: insets.top + 12, paddingHorizontal: pad }}>
      <Header title={title} />
      {denied ? <AskManager what={what} who={who} /> : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
    </View>
  );
}

/** A scrolling screen above the tabs: back button and serif title, pull to refresh, and a pinned footer that stays above the keyboard. */
export function Page({ title, right, children, footer, onRefresh, refreshing = false, onBack, over }: { title: string; right?: ReactNode; onBack?: () => void; over?: ReactNode; children: ReactNode; footer?: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.cream }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: pad, paddingBottom: footer ? 24 : Math.max(insets.bottom, 14) + 24 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.wine} /> : undefined}>
        <Header title={title} right={right} onBack={onBack} />
        {children}
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: pad, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.cream }}>{footer}</View> : null}
      {over}
    </KeyboardAvoidingView>
  );
}

// ---------- numbers ----------

/** The dark card for the one number that matters most on a screen. */
export function Night({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: mc.night, borderRadius: 20, padding: 16 }, style]}>{children}</View>;
}
export function NightLabel({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.72, textTransform: "uppercase", color: mc.nightMuted }}>{children}</Text>;
}
export function NightBig({ children, label }: { children: ReactNode; label?: string }) {
  return <Text accessibilityLabel={label} style={{ fontFamily: f.serifBold, fontSize: 44, lineHeight: 48, color: mc.onNight, marginTop: 6 }}>{children}</Text>;
}
export function NightText({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Text style={[{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: mc.nightMuted }, style]}>{children}</Text>;
}
/** A figure inside the dark card: a small label, the number, one line about it. */
export function NightStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontFamily: f.body, fontSize: 12, color: mc.nightMuted }}>{label}</Text>
      <Text style={{ fontFamily: f.bold, fontSize: 15, lineHeight: 21, color: mc.onNight }}>{value}</Text>
      {sub ? <Text style={{ fontFamily: f.body, fontSize: 11, lineHeight: 15, color: mc.nightMuted }}>{sub}</Text> : null}
    </View>
  );
}

/** A white tile with one figure: what it is, the number, and the plain sentence behind it. */
export function Stat({ label, value, sub, onPress }: { label: string; value: string; sub?: string; onPress?: () => void }) {
  const body = (
    <>
      <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: c.muted }}>{label}</Text>
      <Text style={{ fontFamily: f.serifBold, fontSize: 28, lineHeight: 34, color: c.ink, marginTop: 2 }}>{value}</Text>
      {sub ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 2 }}>{sub}</Text> : null}
    </>
  );
  const style: ViewStyle = { flexGrow: 1, flexBasis: "47%", minWidth: 0, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, padding: 14 };
  return onPress
    ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}. ${sub ?? ""}`} onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.85 }]}>{body}</Pressable>
    : <View accessible accessibilityLabel={`${label}: ${value}. ${sub ?? ""}`} style={style}>{body}</View>;
}
export function Stats({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: 10 }, style]}>{children}</View>;
}

/** A thin bar showing how much of something is used. */
export function Meter({ part, whole, label, dark }: { part: number; whole: number; label: string; dark?: boolean }) {
  const w = whole > 0 ? Math.min(100, Math.max(part > 0 ? 3 : 0, (part / whole) * 100)) : 0;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={{ height: 8, borderRadius: 4, backgroundColor: dark ? "rgba(255,255,255,.12)" : c.cream2, overflow: "hidden" }}>
      <View style={{ width: `${w}%`, height: 8, borderRadius: 4, backgroundColor: c.gold }} />
    </View>
  );
}

/** One fact in a card of facts: what it is on the left, its value on the right. */
export function KV({ k, v, last, strong }: { k: string; v: ReactNode; last?: boolean; strong?: boolean }) {
  return (
    <Row between gap={16} style={{ paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, alignItems: "flex-start" }}>
      <T size={14} muted style={{ flexShrink: 0, maxWidth: "55%" }}>{k}</T>
      {typeof v === "string" || typeof v === "number" ? <T size={14} weight={strong ? "bold" : "semi"} style={{ flex: 1, textAlign: "right" }}>{v}</T> : <View style={{ flex: 1, alignItems: "flex-end" }}>{v}</View>}
    </Row>
  );
}

/** A quiet explanation in a tinted box. */
export function Tip({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: c.cream2 }, style]}><T size={13} color={c.muted}>{children}</T></View>;
}
export const B = ({ children }: { children: ReactNode }) => <Text style={{ fontFamily: f.bold, color: c.ink }}>{children}</Text>;

/** A row of a list drawn as its own small card (a campaign, a code, a new client). */
export function RowCard({ children, onPress, label, style }: { children: ReactNode; onPress?: () => void; label?: string; style?: StyleProp<ViewStyle> }) {
  const s: StyleProp<ViewStyle> = [{ backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 14, marginBottom: 8 }, style];
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>{children}</Pressable> : <View style={s}>{children}</View>;
}

// ---------- writing a message ----------

/**
 * The message box, the placeholders that can go in it, and how the message reads with them filled in.
 * A placeholder goes in where the cursor is.
 */
export function MessageBox({ value, onChange, max, tokens, sample, previewLabel, label = "Message" }: {
  value: string; onChange: (text: string) => void; max: number; tokens: [string, string][]; sample: Record<string, string>; previewLabel: string; label?: string;
}) {
  const [at, setAt] = useState<{ start: number; end: number } | null>(null);
  const box = useRef<TextInput>(null);
  const touched = useRef(false);
  // Where the cursor is. A phone reports every move; a browser only reports selections, so there the box itself is asked.
  const caret = () => {
    if (!touched.current) return null;
    const el = box.current as unknown as { selectionStart?: number | null; selectionEnd?: number | null } | null;
    if (Platform.OS === "web" && el && typeof el.selectionStart === "number") return { start: el.selectionStart, end: el.selectionEnd ?? el.selectionStart };
    return at;
  };
  const insert = (token: string) => {
    const now = caret();
    const start = Math.min(now?.start ?? value.length, value.length), end = Math.min(now?.end ?? start, value.length);
    onChange((value.slice(0, start) + token + value.slice(end)).slice(0, max));
    setAt({ start: start + token.length, end: start + token.length });
  };
  const shown = fill(value, sample).trim();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Label>{label}</Label>
        <TextInput ref={box} onFocus={() => { touched.current = true; }} accessibilityLabel={label} multiline value={value} onChangeText={(t) => onChange(t.slice(0, max))} maxLength={max} placeholder="Write what you want to say." placeholderTextColor={c.muted2}
          onSelectionChange={(e) => setAt(e.nativeEvent.selection)}
          style={{ minHeight: 168, borderRadius: radius.field, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingHorizontal: 14, paddingVertical: 12, fontFamily: f.body, fontSize: 16, lineHeight: 22, color: c.ink, textAlignVertical: "top" }} />
        <T size={12} muted>{value.length} of {max} characters. At least 10.</T>
      </View>
      <View style={{ gap: 6 }}>
        <T size={12} muted>Placeholders. Each one is replaced for every client:</T>
        <Row gap={6} wrap>
          {tokens.map(([k, what]) => (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={`Insert ${k}. ${what}`} onPress={() => insert(`{${k}}`)} hitSlop={{ top: 4, bottom: 4 }}
              style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ fontFamily: f.semi, fontSize: 12, color: c.wine }}>{`{${k}}`}</Text>
            </Pressable>
          ))}
        </Row>
      </View>
      <Preview label={previewLabel} text={shown} />
    </View>
  );
}

/** A message as a client would read it. */
export function Preview({ label, text, subject }: { label: string; text: string; subject?: string }) {
  return (
    <View style={{ borderRadius: 16, backgroundColor: c.cream2, padding: 12, gap: 8 }}>
      <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: c.muted }}>{label}</Text>
      <View style={{ backgroundColor: c.white, borderRadius: 14, borderTopLeftRadius: 4, padding: 12, borderWidth: 1, borderColor: c.line }}>
        {subject ? <Text style={{ fontFamily: f.bold, fontSize: 14, lineHeight: 20, color: c.ink, marginBottom: 4 }}>{subject}</Text> : null}
        <Text selectable style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: text ? c.ink : c.muted2 }}>{text || "Your message shows here."}</Text>
      </View>
    </View>
  );
}

// ---------- choosing a day ----------

/** A day chosen from a small month calendar that opens under the field. Empty is allowed and says what it means. */
export function DayField({ label, value, onChange, empty, today, min }: { label: string; value: string; onChange: (day: string) => void; empty: string; today: string; min?: string }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value || min || today).slice(0, 7));
  const floor = min && min > today ? min : today;
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <View style={{ minHeight: 52, borderRadius: radius.field, borderWidth: 1, borderColor: open ? c.ink : c.line2, backgroundColor: c.white, paddingLeft: 14, flexDirection: "row", alignItems: "center" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? dateOnly(value) : empty}. Change`} accessibilityState={{ expanded: open }} onPress={() => { setMonth((value || floor).slice(0, 7)); setOpen(!open); }}
          style={{ flex: 1, minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon name="calendar" size={18} color={c.muted} />
          <Text style={{ flex: 1, fontFamily: f.body, fontSize: 16, color: value ? c.ink : c.muted2 }}>{value ? dateOnly(value) : empty}</Text>
        </Pressable>
        {value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} onPress={() => onChange("")} style={{ width: 44, height: 50, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={16} color={c.muted} /></Pressable>
        ) : <View style={{ width: 14 }} />}
      </View>
      {open ? (
        <Card style={{ padding: 10 }}>
          <Row between>
            <Pressable accessibilityRole="button" accessibilityLabel="Earlier month" disabled={month <= today.slice(0, 7)} onPress={() => setMonth(addMonths(month, -1))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: month <= today.slice(0, 7) ? 0.3 : 1 }}><Icon name="back" size={18} /></Pressable>
            <T weight="semi" size={14}>{monthTitle(month)}</T>
            <Pressable accessibilityRole="button" accessibilityLabel="Later month" onPress={() => setMonth(addMonths(month, 1))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="next" size={18} /></Pressable>
          </Row>
          <View style={{ flexDirection: "row" }}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <Text key={i} style={{ flex: 1, textAlign: "center", fontFamily: f.medium, fontSize: 11, color: c.muted2, paddingBottom: 4 }}>{d}</Text>)}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {monthCells(month).map((day, i) => {
              const on = !!day && day === value, off = !day || day < floor;
              return (
                <Pressable key={day || `x${i}`} accessibilityRole={day ? "button" : undefined} accessibilityLabel={day ? dateOnly(day) : undefined} accessibilityState={{ selected: on, disabled: off }} disabled={off}
                  onPress={() => { onChange(day); setOpen(false); }} style={{ width: `${100 / 7}%`, height: 44, alignItems: "center", justifyContent: "center" }}>
                  {day ? (
                    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : "transparent" }}>
                      <Text style={{ fontFamily: on ? f.semi : f.medium, fontSize: 14, color: on ? c.cream : off ? "#C9BCB0" : c.ink }}>{Number(day.slice(8))}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

// ---------- steps of a short flow ----------

export function Steps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <View accessible accessibilityLabel={`Step ${at + 1} of ${steps.length}: ${steps[at]}`} style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
      {steps.map((name, i) => (
        <View key={name} style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= at ? c.gold : c.line2 }} />
          <Text numberOfLines={1} style={{ fontFamily: i === at ? f.semi : f.medium, fontSize: 12, color: i === at ? c.ink : c.muted2 }}>{i + 1}. {name}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------- a campaign in a list ----------

/** One campaign as a row: its name and state, who it went to, and what came of it once sent. */
export function CampaignRow({ camp, currency, tz, onPress }: { camp: Data; currency: string; tz?: string; onPress: () => void }) {
  const tag = campaignTag(String(camp.status));
  const done = camp.status === "sent";
  const delivered = Number(camp.delivered ?? 0), logged = Number(camp.logged ?? 0), booked = Number(camp.booked ?? 0);
  const result = done
    ? [delivered || !logged ? `${n(delivered)} delivered` : "", logged ? `${n(logged)} logged, not delivered` : "", `${n(booked)} booked${booked ? ` · ${money(camp.booked_cents, currency)}` : ""}`].filter(Boolean).join(" · ")
    : camp.status === "sending" ? "Sending now. The numbers appear when it has finished."
    : `Not sent yet · ${plural(Number(camp.recipients ?? 0), "client")} in the audience when saved`;
  const line = [AUDIENCE_LABEL[camp.audience] ?? camp.audience, CHANNEL_LABEL[camp.channel] ?? camp.channel, dateMed(String(camp.sent_at ?? camp.created_at), tz)].join(" · ");
  return (
    <RowCard onPress={onPress} label={`${camp.name}, ${tag.text}. ${line}. ${result}`}>
      <Row between gap={10} style={{ alignItems: "flex-start" }}>
        <Text numberOfLines={2} style={{ flex: 1, fontFamily: f.semi, fontSize: 15, lineHeight: 20, color: c.ink }}>{camp.name}</Text>
        <Tag kind={tag.kind}>{tag.text}</Tag>
      </Row>
      <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 2 }}>{line}</Text>
      <Text style={{ fontFamily: done ? f.semi : f.body, fontSize: 13, lineHeight: 18, color: done ? c.ink : c.muted, marginTop: 6 }}>{result}</Text>
    </RowCard>
  );
}

// ---------- saying what just happened ----------

export type Said = { kind: "ok" | "bad" | "gold"; text: string } | null;

/**
 * What just happened, shown over the bottom of the screen so it is seen wherever the list is scrolled to.
 * It goes away by itself, or when pressed.
 */
export function Toast({ note, onDone }: { note: Said; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(onDone, note.kind === "ok" ? 5000 : 9000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);
  if (!note) return null;
  const [bg, fg, line] = { ok: [c.okBg, c.ok, "#BFDFC8"], bad: [c.badBg, c.bad, "#E9C7C3"], gold: [c.goldBg, c.goldInk, "#E6D3A3"] }[note.kind];
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: pad, right: pad, bottom: Math.max(insets.bottom, 14) + 6 }}>
      <Pressable accessibilityRole="alert" accessibilityLabel={`${note.text} Press to dismiss`} onPress={onDone}
        style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: bg, borderWidth: 1, borderColor: line, shadowColor: "#1A1513", shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
        <Text style={{ fontFamily: f.medium, fontSize: 14, lineHeight: 20, color: fg }}>{note.text}</Text>
      </Pressable>
    </View>
  );
}
