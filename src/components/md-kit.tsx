// Pieces the "Profile & portfolio" screens share: a few icons, the star row, a picture tile,
// the note that stays pinned while a long screen scrolls, and the sheet that picks a photo.
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Sheet } from "@/components/mc-kit";
import { Icon, Note, T } from "@/components/ui";
import { pickPhotos, type Picked } from "@/lib/md-upload";
import { c, f } from "@/lib/theme";

// ---------- icons ----------

const PATHS = {
  pencil: ["M4 20h4L19 9l-4-4L4 16z", "m13.5 6.5 4 4"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v5", "M14 11v5"],
  pin: ["M9 4h6l-1 6 3 3H7l3-3z", "M12 13v7"],
  code: ["m8 8-5 4 5 4", "m16 8 5 4-5 4", "m13.5 5-3 14"],
  image: ["m4 17 5-5 4 4 3-3 4 4"],
  flag: ["M5 21V4", "M5 4h12l-2 4 2 4H5"],
  reply: ["M9 7 4 12l5 5", "M4 12h9a7 7 0 0 1 7 7"],
} as const;
export type MdIconName = keyof typeof PATHS | "qr";

export function MdIcon({ name, size = 18, color = c.ink, stroke = 2 }: { name: MdIconName; size?: number; color?: string; stroke?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {name === "qr" ? (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={1} /><Rect x={14} y={3} width={7} height={7} rx={1} /><Rect x={3} y={14} width={7} height={7} rx={1} />
          <Path d="M14 14h3v3h-3z" /><Path d="M21 14v.01" /><Path d="M21 21v.01" /><Path d="M17.5 21h.01" /><Path d="M21 17.5v.01" />
        </>
      ) : (
        <>
          {name === "image" ? <><Rect x={3} y={4} width={18} height={16} rx={2} /><Circle cx={8.5} cy={9} r={1.5} /></> : null}
          {PATHS[name].map((d, i) => <Path key={i} d={d} />)}
        </>
      )}
    </Svg>
  );
}

// ---------- stars ----------

/** Five stars, as many filled as the rating. Read out as "4 out of 5". */
export function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${n} out of 5`} style={{ flexDirection: "row", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => <Icon key={i} name="star" size={size} color={i <= n ? c.gold : c.line2} fill={i <= n ? c.gold : "none"} stroke={1.6} />)}
    </View>
  );
}

// ---------- pictures ----------

/** One uploaded picture on the business's colour, with a small tag in its corner. */
export function Shot({ uri, tone, label, tag, dim, style, radius = 14 }: { uri?: string; tone?: string | null; label?: string; tag?: ReactNode; dim?: boolean; style?: StyleProp<ViewStyle>; radius?: number }) {
  return (
    <View style={[{ backgroundColor: tone || c.photo, borderRadius: radius, overflow: "hidden" }, style]}>
      {uri ? <Image source={{ uri }} accessibilityLabel={label || "Photo with no description"} resizeMode="cover" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", opacity: dim ? 0.35 : 1 }} /> : null}
      {tag ? <View style={{ position: "absolute", top: 8, left: 8 }}>{tag}</View> : null}
    </View>
  );
}

/** A tag that sits on a picture: solid, so it reads on any photo. */
export function ShotTag({ children, kind = "gold" }: { children: ReactNode; kind?: "gold" | "grey" }) {
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: kind === "gold" ? c.gold : "rgba(26,21,19,.78)" }}>
      <Text style={{ fontFamily: f.semi, fontSize: 11, lineHeight: 13, color: kind === "gold" ? c.ink : "#F4ECE3" }}>{children}</Text>
    </View>
  );
}

// ---------- a note that stays in view ----------

export type Said = { kind: "ok" | "bad" | "gold"; text: string } | null;

/** Holds the last thing said after a save. Good news clears itself after a few seconds; bad news stays until the next action. */
export function useSaid(): [Said, (s: Said) => void] {
  const [said, setSaid] = useState<Said>(null);
  useEffect(() => {
    if (!said || said.kind === "bad") return;
    const t = setTimeout(() => setSaid(null), 5000);
    return () => clearTimeout(t);
  }, [said]);
  return [said, setSaid];
}

/** The note for a screen's pinned footer, so it is seen wherever the screen has been scrolled to. */
export const said = (s: Said) => (s ? <Note kind={s.kind}>{s.text}</Note> : undefined);

// ---------- small things ----------

/** A thin bar filled to a share of its width. */
export function Bar({ share, color = c.ink, height = 6 }: { share: number; color?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: "#EFE5DA", overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

/** A chip that is ticked or not, for choosing several of many. */
export function Tick({ children, on, onPress, disabled }: { children: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, flexDirection: "row", alignItems: "center", gap: 6, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 })}>
      {on ? <Icon name="check" size={14} color={c.cream} stroke={2.5} /> : null}
      <Text style={{ fontFamily: f.semi, fontSize: 13, color: on ? c.cream : c.ink }}>{children}</Text>
    </Pressable>
  );
}

/** A wide button with an icon tile, a title and a line under it: the two ways to bring in a photo. */
export function BigChoice({ icon, title, sub, onPress, busy, disabled, danger }: { icon: ReactNode; title: string; sub?: string; onPress: () => void; busy?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }} disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, minHeight: 64, borderRadius: 16, backgroundColor: c.white, borderWidth: 1, borderColor: danger ? "#E9C7C3" : c.line2, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: danger ? c.badBg : "#F4ECE2", alignItems: "center", justifyContent: "center" }}>{busy ? <ActivityIndicator color={c.wine} /> : icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 15, lineHeight: 20, color: danger ? c.bad : c.ink }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

/**
 * The sheet that asks where a photo comes from: the phone's library or its camera.
 * It hands back what was chosen and closes; the screen that opened it does the sending.
 */
export function PhotoSource({ open, onClose, title, sub, many = 1, onPicked }: { open: boolean; onClose: () => void; title: string; sub?: string; many?: number; onPicked: (photos: Picked[]) => void }) {
  const [busy, setBusy] = useState<"" | "library" | "camera">("");
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setError(""); setBusy(""); } }, [open]);
  const go = async (from: "library" | "camera") => {
    setBusy(from); setError("");
    const out = await pickPhotos(from, from === "library" ? many : 1);
    setBusy("");
    if (out.error) setError(out.error);
    else if (out.photos.length) onPicked(out.photos);
  };
  return (
    <Sheet open={open} onClose={onClose} title={title} sub={sub}>
      {error ? <Note kind="bad">{error}</Note> : null}
      <BigChoice icon={<MdIcon name="image" size={20} />} title="Choose from your photos" sub={many > 1 ? `Pick up to ${many} at once` : "Open your photo library"} busy={busy === "library"} disabled={busy === "camera"} onPress={() => go("library")} />
      <BigChoice icon={<Icon name="camera" size={20} />} title="Take a photo" sub="Use the camera now" busy={busy === "camera"} disabled={busy === "library"} onPress={() => go("camera")} />
      <T size={12} muted>JPEG, PNG or WebP, up to 8 MB each.</T>
    </Sheet>
  );
}
