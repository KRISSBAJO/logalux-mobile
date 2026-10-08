// Pieces shared by the numbers and money-account screens (Reports, Statements, Payouts, Plan):
// the dark card for the one figure that matters most, figure tiles, statement rows, and the charts.
// The charts are drawn from the API's own numbers with react-native-svg. Nothing here invents a value.
import { useState, type ReactNode } from "react";
import { Platform, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { SmallBtn, mc } from "@/components/mc-kit";
import { c, f } from "@/lib/theme";
import { csvRows, getCsv, handCsv } from "@/lib/mh-util";
import { plural } from "@/lib/format";

export type Flash = { kind: "ok" | "bad" | "gold"; text: string } | null;

/** The colours a chart gives its parts, in order. The same ones the web's reports use. */
export const TONES = ["#7A1F2B", "#D4AF5A", "#1A1513", "#C9BCB4", "#8C6A3F", "#4A5A52", "#B98A92", "#E6DCD2"] as const;

// ---------- cards and rows ----------

/** The dark card: one per screen, for the figure the person came to see. */
export function Night({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: mc.night, borderRadius: 20, padding: 16 }, style]}>{children}</View>;
}
export const nightLabel = { fontFamily: f.semi, fontSize: 12, letterSpacing: 0.72, textTransform: "uppercase", color: mc.nightMuted } as const;
export const nightBody = { fontFamily: f.body, fontSize: 13, lineHeight: 19, color: mc.nightMuted } as const;
export const nightBig = { fontFamily: f.serifBold, fontSize: 40, lineHeight: 46, color: mc.onNight } as const;

/** A gold button on the dark card. */
export function GoldBtn({ children, onPress, disabled, busy, style }: { children: ReactNode; onPress?: () => void; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  const off = disabled || busy;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!busy }} disabled={off} onPress={onPress}
      style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: c.gold, alignItems: "center", justifyContent: "center", opacity: off ? 0.45 : pressed ? 0.85 : 1 }, style]}>
      <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink, textAlign: "center" }}>{busy ? "One moment" : children}</Text>
    </Pressable>
  );
}

export type Move = { text: string; tone: "up" | "down" | "flat" };

/** A figure in a tile: its name, the number large, and how it moved. */
export function Kpi({ name, value, move }: { name: string; value: string; move?: Move }) {
  const color = move?.tone === "up" ? c.ok : move?.tone === "down" ? c.bad : c.muted;
  return (
    <View accessible accessibilityLabel={`${name}: ${value}. ${move?.text ?? ""}`} style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, padding: 14, minHeight: 104 }}>
      <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.muted }}>{name}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: f.serifBold, fontSize: 28, lineHeight: 34, color: c.ink, marginTop: 4 }}>{value}</Text>
      {move ? <Text style={{ fontFamily: f.medium, fontSize: 12, lineHeight: 16, color, marginTop: 4 }}>{move.text}</Text> : null}
    </View>
  );
}

/** A card's title and the line under it. */
export function Head({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={{ fontFamily: f.semi, fontSize: 16, lineHeight: 22, color: c.ink }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: f.body, fontSize: 12.5, lineHeight: 18, color: c.muted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export const small = { fontFamily: f.body, fontSize: 12.5, lineHeight: 18, color: c.muted } as const;

/** One line of a statement or a summary: what it is, a note under it, and the amount on the right. */
export function Line({ name, note, value, strong, last, tone, onPress }: { name: string; note?: string; value: string; strong?: boolean; last?: boolean; tone?: "bad" | "ok" | "muted"; onPress?: () => void }) {
  const color = tone === "bad" ? c.bad : tone === "ok" ? c.ok : tone === "muted" ? c.muted : c.ink;
  const body = (
    <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: strong ? f.semi : f.medium, fontSize: 14, lineHeight: 20, color: onPress ? c.wine : c.ink }}>{name}</Text>
        {note ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{note}</Text> : null}
      </View>
      <Text style={{ fontFamily: strong ? f.bold : f.semi, fontSize: strong ? 16 : 14, color, flexShrink: 0 }}>{value}</Text>
    </>
  );
  const style: ViewStyle = { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, minHeight: 44, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line };
  return onPress
    ? <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${value}`} onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}>{body}</Pressable>
    : <View accessible accessibilityLabel={`${name}${note ? `, ${note}` : ""}: ${value}`} style={style}>{body}</View>;
}

/** A numbered step of a set-up: done, or still to do. */
export function Step({ n, done, title, sub, last }: { n: number; done: boolean; title: string; sub: string; last?: boolean }) {
  return (
    <View accessible accessibilityLabel={`Step ${n}, ${done ? "done" : "to do"}: ${title}. ${sub}`} style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: done ? c.ok : c.cream2, alignItems: "center", justifyContent: "center" }}>
        {done ? <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c.white} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 6 9 17l-5-5" /></Svg>
          : <Text style={{ fontFamily: f.bold, fontSize: 12, color: c.muted }}>{n}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{title}</Text>
        <Text style={{ fontFamily: f.body, fontSize: 12.5, lineHeight: 18, color: c.muted }}>{sub}</Text>
      </View>
    </View>
  );
}

/** A point in a short list of plain facts. */
export function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.gold, marginTop: 8 }} />
      <Text style={{ flex: 1, fontFamily: f.body, fontSize: 13.5, lineHeight: 20, color: c.ink }}>{children}</Text>
    </View>
  );
}

// ---------- charts ----------

/** A name, a bar for its share, and its value: for a ranked list. */
export function HBar({ name, value, share, color = c.wine, note }: { name: string; value: string; share: number; color?: string; note?: string }) {
  return (
    <View accessible accessibilityLabel={`${name}: ${value}${note ? `, ${note}` : ""}`} style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.medium, fontSize: 14, color: c.ink }}>{name}</Text>
        {note ? <Text style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>{note}</Text> : null}
        <Text style={{ fontFamily: f.bold, fontSize: 14, color: c.ink }}>{value}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.cream2, overflow: "hidden" }}>
        <View style={{ width: `${Math.max(0, Math.min(100, share))}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {items.map(([name, color]) => (
        <View key={name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
          <Text style={{ fontFamily: f.medium, fontSize: 12, color: c.muted }}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

/** The grey of the period before: darker than a hairline, so a thin bar still shows on white. */
export const PREV = "#CDBFB1";

export type Bar = { key: string; label: string; title: string; rev: number; tips: number; prev: number };

/**
 * Revenue for each day or week: sales in ink with tips in gold on top, and the same day of the period
 * before in grey beside it. Pressing a bar says what it stands for, since a phone has no pointer to hover with.
 */
export function RevenueBars({ bars, say, label }: { bars: Bar[]; say: (b: Bar) => string; label: string }) {
  const [w, setW] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const H = 132, n = Math.max(1, bars.length);
  const peak = Math.max(1, ...bars.map((b) => Math.max(b.rev + b.tips, b.prev)));
  const slot = w / n, gap = n > 16 ? 2 : n > 8 ? 4 : 8;
  const inner = Math.max(2, slot - gap), nowW = inner * 0.62, prevW = Math.max(1, inner - nowW - 1);
  const h = (v: number) => (v > 0 ? Math.max(2, (v / peak) * (H - 4)) : 0);
  const at = pick !== null && pick < bars.length ? pick : bars.length - 1;
  const LW = 44;

  return (
    <View>
      <View accessible accessibilityRole="image" accessibilityLabel={label} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
        {w > 0 ? (
          <Svg width={w} height={H}>
            {pick !== null ? <Rect x={at * slot} y={0} width={slot} height={H} rx={4} fill={c.cream2} /> : null}
            <Rect x={0} y={H - 1} width={w} height={1} fill={c.line2} />
            {bars.map((b, i) => {
              const x = i * slot + gap / 2, hr = h(b.rev), ht = h(b.tips), hp = h(b.prev);
              return (
                <G key={b.key}>
                  {hr > 0 ? <Rect x={x} y={H - hr} width={nowW} height={hr} rx={Math.min(2, nowW / 2)} fill={c.ink} /> : null}
                  {ht > 0 ? <Rect x={x} y={H - hr - ht} width={nowW} height={ht} rx={Math.min(2, nowW / 2)} fill={c.gold} /> : null}
                  {hp > 0 ? <Rect x={x + nowW + 1} y={H - hp} width={prevW} height={hp} rx={Math.min(2, prevW / 2)} fill={PREV} /> : null}
                </G>
              );
            })}
          </Svg>
        ) : null}
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row" }}>
          {bars.map((b, i) => <Pressable key={b.key} accessibilityRole="button" accessibilityLabel={say(b)} onPress={() => setPick(i)} style={{ flex: 1 }} />)}
        </View>
      </View>
      <View style={{ height: 18, marginTop: 4 }}>
        {w > 0 ? bars.map((b, i) => (b.label ? (
          <Text key={b.key} numberOfLines={1} style={{ position: "absolute", left: Math.max(0, Math.min(w - LW, i * slot + slot / 2 - LW / 2)), width: LW, textAlign: "center", fontFamily: f.medium, fontSize: 11, color: c.muted }}>{b.label}</Text>
        ) : null)) : null}
      </View>
      {bars[at] ? (
        <View style={{ marginTop: 8, borderRadius: 12, backgroundColor: c.cream, paddingHorizontal: 12, paddingVertical: 9 }}>
          <Text style={{ fontFamily: f.medium, fontSize: 12.5, lineHeight: 18, color: c.ink }}>{say(bars[at])}</Text>
          {pick === null && bars.length > 1 ? <Text style={{ fontFamily: f.body, fontSize: 11.5, lineHeight: 16, color: c.muted }}>Tap a bar to read another one.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** A ring split by share, with a total in the middle. */
export function Donut({ parts, total, noun, size = 128 }: { parts: { n: number; color: string }[]; total: number; noun: string; size?: number }) {
  const stroke = 20, r = (size - stroke) / 2, C = 2 * Math.PI * r, mid = size / 2;
  let start = 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={mid} cy={mid} r={r} stroke={c.cream2} strokeWidth={stroke} fill="none" />
        {/* A circle is drawn from three o'clock; a quarter turn back starts the ring at the top. */}
        {total > 0 ? parts.map((p, i) => {
          const len = (p.n / total) * C, from = start;
          start += len;
          return len > 0 ? <Circle key={i} cx={mid} cy={mid} r={r} stroke={p.color} strokeWidth={stroke} fill="none" strokeDasharray={[len, C - len]} strokeDashoffset={C / 4 - from} /> : null;
        }) : null}
      </Svg>
      <Text style={{ fontFamily: f.serifBold, fontSize: 26, lineHeight: 30, color: c.ink }}>{total}</Text>
      <Text style={{ fontFamily: f.medium, fontSize: 11, color: c.muted }}>{noun}</Text>
    </View>
  );
}

/** Busy hours: a square for each two-hour band of each weekday, darker when busier. */
export function Heat({ days, bands, count, max, bandName, say }: { days: string[]; bands: number[]; count: (dow: number, hour: number) => number; max: number; bandName: (hour: number) => string; say: (day: string, hour: number, n: number) => string }) {
  const [pick, setPick] = useState<[number, number] | null>(null);
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 4, marginBottom: 4 }}>
        <View style={{ width: 50 }} />
        {days.map((d) => <Text key={d} style={{ flex: 1, textAlign: "center", fontFamily: f.semi, fontSize: 11, color: c.muted }}>{d[0]}</Text>)}
      </View>
      {bands.map((hr) => (
        <View key={hr} style={{ flexDirection: "row", gap: 4, marginBottom: 4, alignItems: "center" }}>
          <Text style={{ width: 50, fontFamily: f.medium, fontSize: 11, color: c.muted }}>{bandName(hr)}</Text>
          {days.map((d, i) => {
            const nn = count(i + 1, hr), on = pick?.[0] === i && pick?.[1] === hr;
            return (
              <Pressable key={d} accessibilityRole="button" accessibilityLabel={say(d, hr, nn)} onPress={() => setPick([i, hr])} style={{ flex: 1, height: 28, borderRadius: 6, backgroundColor: c.cream2, overflow: "hidden", borderWidth: on ? 2 : 0, borderColor: c.ink }}>
                <View style={{ flex: 1, backgroundColor: c.wine, opacity: nn ? Math.max(0.15, nn / max) : 0 }} />
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={[small, { marginTop: 6 }]}>{pick ? say(days[pick[0]], pick[1], count(pick[0] + 1, pick[1])) : "Each row is two hours. Tap a square to count it."}</Text>
    </View>
  );
}

// ---------- a spreadsheet file ----------

/**
 * Fetches a CSV from the API with the business's token and hands it over: saved as a file in a browser,
 * passed to the share sheet as a file on a phone.
 */
export function CsvButton({ children, path, token, name, onNote, kind = "out", style }: { children?: ReactNode; path: string; token: string | null; name: string; onNote: (n: Flash) => void; kind?: "out" | "ink"; style?: StyleProp<ViewStyle> }) {
  const [busy, setBusy] = useState(false);
  const web = Platform.OS === "web";
  const go = async () => {
    setBusy(true); onNote(null);
    try {
      const csv = await getCsv(path, token, name);
      const rows = csvRows(csv.text);
      if (rows === 0) { onNote({ kind: "gold", text: "There is nothing in this period to put in a file yet." }); setBusy(false); return; }
      const out = await handCsv(csv);
      onNote(out === "saved" ? { kind: "ok", text: `Saved ${csv.name}, with ${plural(rows, "row")}.` }
        : out === "shared" ? null
        : out === "unavailable" ? { kind: "gold", text: `This device cannot share files, so ${csv.name} could not be handed over. Download it from the web app on a computer.` }
        : out === "failed" ? { kind: "bad", text: "The file could not be handed over. Try again." } : null);
    } catch (e) {
      onNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy(false);
  };
  return <SmallBtn kind={kind} icon="share" busy={busy} onPress={go} style={style}>{children ?? (web ? "Download CSV" : "Share CSV")}</SmallBtn>;
}
