import { useFormReset } from "../lib/form-reset";
// The place panel: where the client is looking, and every way to change it. Typing offers places we
// already know, with no outside call; "Search" asks the lookup service for any city or town in the United
// States or Nigeria. "Use my exact location" is the only thing that asks the device where it is, and only
// when pressed. Another country can be browsed on purpose. "Forget my location" goes back to the first guess.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Card, Icon, IconButton, Row, Serif, T } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { inCountry, people, placeName, usePlace, type Place } from "@/lib/ca-place";
import { c, f, pad, radius } from "@/lib/theme";

type Found = { places: Place[]; looked_up?: boolean; complete?: boolean };

/** One place in a list: its name on the left, how many professionals on the right. */
function PlaceRow({ p, scope, onPress, first, sub }: { p: Place; scope: string; onPress: () => void; first: boolean; sub?: string }) {
  const right = sub ?? (p.businesses > 0 ? people(p.businesses) : p.kind === "country" ? "" : "None yet");
  const aside = p.kind === "state" ? "whole state" : p.kind === "city" && p.country !== scope ? p.country_name : "";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${placeName(p)}${aside ? `, ${aside}` : ""}${right ? `. ${right}` : ""}`} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderTopWidth: first ? 0 : 1, borderTopColor: c.line, opacity: pressed ? 0.7 : 1 })}>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.medium, fontSize: 14.5, color: c.ink }}>
        {placeName(p)}{aside ? <Text style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>  {aside}</Text> : null}
      </Text>
      {right ? <Text style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>{right}</Text> : null}
    </Pressable>
  );
}

function Head({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: f.semi, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: c.muted, marginBottom: 6, paddingHorizontal: 2 }}>{children}</Text>;
}

export function PlacePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const w = usePlace();
  const [text, setText] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState<"" | "typing" | "search" | "near" | "country">("");
  const [note, setNote] = useState("");
  const asked = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null); // the type-ahead waiting to run, dropped when Search is pressed

  useFormReset([open], () => { if (open) { setText(""); setFound(null); setNote(""); setBusy(""); } });

  /** Ask for places. `lookup` also asks the outside service; it is sent only when the person presses Search. */
  const ask = useCallback(async (q: string, lookup: boolean) => {
    const n = ++asked.current;
    setBusy(lookup ? "search" : "typing");
    setNote("");
    try {
      const data = await api<Found>(`/places/search${qs({ q, lookup: lookup ? 1 : undefined })}`);
      if (n !== asked.current) return; // an older answer arriving late
      setFound(data);
      if (lookup && data.complete === false) setNote("The place search is not answering just now. These are the places we already know.");
    } catch (e) {
      if (n === asked.current) { setFound(null); setNote((e as Error).message || "We could not search places just now. Try again in a moment."); }
    } finally {
      if (n === asked.current) setBusy("");
    }
  }, []);

  useFormReset([text, open], () => { setFound(null); setBusy(""); setNote(""); });
  // As the person types: places we already know. A short pause first, so every key is not a request.
  useEffect(() => {
    if (!open) return;
    const q = text.trim();
    if (!q) { asked.current++; return; }
    const t = setTimeout(() => { pending.current = null; void ask(q, false); }, 180);
    pending.current = t;
    return () => clearTimeout(t);
  }, [text, open, ask]);

  const q = text.trim();
  const search = () => {
    if (pending.current) { clearTimeout(pending.current); pending.current = null; }
    if (q.length >= 3) void ask(q, true); else if (q) setNote("Type at least three letters to search.");
  };
  const choose = (p: Place) => { w.setPlace(p); onClose(); };
  const nearMe = async () => {
    setBusy("near"); setNote("");
    const me = await w.useExactLocation();
    setBusy("");
    if (me.ok) onClose(); else setNote(me.why);
  };
  const other = async (code: string) => {
    setBusy("country");
    await w.switchCountry(code);
    setBusy("");
    onClose();
  };
  const forget = async () => { onClose(); await w.forget(); };

  const shown = w.place?.label ?? "your area";
  const suggested = w.places.filter((p) => !w.scope || p.country === w.scope).slice(0, 8);
  const list = q ? found?.places ?? [] : suggested;
  const own = w.countries.find((x) => x.code === w.scope);
  const recent = q ? [] : w.recent.filter((r) => r.label !== w.place?.label);
  const how = w.source === "ip" ? <>We think you are near <T size={13} weight="semi">{shown}</T>, going by your internet connection. It is a rough guess: choose your own place below.</>
    : w.source === "device" ? <>You are seeing what is near <T size={13} weight="semi">{shown}</T>, from your device&apos;s location.</>
    : w.source === "picked" ? <>You chose <T size={13} weight="semi">{shown}</T>.</>
    : w.place ? <>We could not tell where you are, so we started you in <T size={13} weight="semi">{shown}</T>. Choose your own place below.</>
    : "Choose where to look.";

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,21,19,.45)" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, minHeight: 40 }} />
        <View accessibilityViewIsModal style={{ maxHeight: "92%", backgroundColor: c.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <Row between style={{ paddingHorizontal: pad, paddingTop: 16, paddingBottom: 4 }}>
            <Serif size={26} style={{ flex: 1 }}>Where to look</Serif>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: Math.max(insets.bottom, 20), gap: 14 }}>
            <T size={13} muted>{how}</T>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, minHeight: 50, borderRadius: radius.field, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingLeft: 14, paddingRight: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="search" size={16} color={c.muted} />
                <TextInput accessibilityLabel="City, state or country" value={text} onChangeText={setText} placeholder="City, state or country" placeholderTextColor={c.muted2} maxLength={80}
                  autoCorrect={false} autoCapitalize="words" returnKeyType="search" onSubmitEditing={search}
                  style={[{ flex: 1, minWidth: 0, minHeight: 48, fontFamily: f.body, fontSize: 15, color: c.ink }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]} />
                {text ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setText("")} hitSlop={8} style={{ width: 28, height: 44, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="close" size={15} color={c.muted} />
                  </Pressable>
                ) : null}
              </View>
              <Btn small busy={busy === "search"} disabled={!q} onPress={search} style={{ minHeight: 50 }}>Search</Btn>
            </View>

            <View style={{ gap: 6 }}>
              <Pressable accessibilityRole="button" accessibilityState={{ busy: busy === "near" }} disabled={busy === "near"} onPress={nearMe}
                style={({ pressed }) => ({ minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderRadius: radius.field, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, opacity: busy === "near" ? 0.6 : pressed ? 0.85 : 1 })}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.cream2, alignItems: "center", justifyContent: "center" }}>
                  {busy === "near" ? <ActivityIndicator size="small" color={c.wine} /> : <Icon name="pin" size={15} color={c.wine} />}
                </View>
                <Text style={{ flex: 1, fontFamily: f.semi, fontSize: 14, color: c.ink }}>{busy === "near" ? "Finding you…" : "Use my exact location"}</Text>
              </Pressable>
              <T size={12.5} muted style={{ paddingHorizontal: 2 }}>
                {w.denied ? "You did not allow this last time, so we are using the approximate place. Press the button to be asked again." : `${Platform.OS === "web" ? "Your browser" : "Your phone"} will ask first. It is used only to put what is nearest to you first.`}
              </T>
            </View>

            {note ? <Text accessibilityRole="alert" style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.ink, paddingHorizontal: 2 }}>{note}</Text> : null}

            {recent.length ? (
              <View>
                <Head>Recent</Head>
                <Card>{recent.map((p, i) => <PlaceRow key={`r-${p.kind}-${p.slug}`} p={p} scope={w.scope} first={i === 0} sub={p.country_name} onPress={() => choose(p)} />)}</Card>
              </View>
            ) : null}

            <View>
              <Head>{q ? (found?.looked_up ? "Places found" : "Places we know") : w.scope ? `Places with professionals in ${inCountry(w.scope)}` : "Places with professionals"}</Head>
              {list.length || (!q && own) ? (
                <Card>
                  {list.map((p, i) => <PlaceRow key={`${p.kind}-${p.slug}`} p={p} scope={w.scope} first={i === 0} onPress={() => choose(p)} />)}
                  {!q && own ? <PlaceRow p={{ slug: "", kind: "country", city: "", region: "", region_name: "", country: own.code, country_name: own.name, label: own.name, lat: 0, lng: 0, businesses: 0, currency: own.currency, unit: own.unit, timezone: "" }} scope={w.scope} first={list.length === 0} sub={people(own.businesses)} onPress={() => void other(own.code)} /> : null}
                </Card>
              ) : null}
              {busy === "typing" && list.length === 0 ? <T size={13} muted style={{ paddingHorizontal: 2, paddingVertical: 6 }}>Looking…</T> : null}
              {q && busy === "" && found && list.length === 0 && !note ? (
                <T size={13} muted style={{ paddingHorizontal: 2, paddingVertical: 6 }}>{found.looked_up ? "We could not find that in the United States or Nigeria. Check the spelling, or add the state." : "Press Search to look for any city or town in the United States or Nigeria."}</T>
              ) : null}
              {q && busy === "" && found && list.length > 0 && !found.looked_up && q.length >= 3 ? <T size={12.5} muted style={{ paddingHorizontal: 2, paddingTop: 6 }}>Not here? Press Search to look for it.</T> : null}
              {!q && !suggested.length && !own ? <T size={13} muted style={{ paddingHorizontal: 2, paddingVertical: 6 }}>Type a city, a state or a country.</T> : null}
            </View>

            {!q && (w.source === "picked" || w.source === "device" || w.denied) ? (
              <Pressable accessibilityRole="button" onPress={() => void forget()} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 2 }}>
                <T size={13.5} weight="semi" muted>Forget my location</T>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * The control that opens the panel: a pin, the place, a chevron. `big` is Home's serif headline;
 * otherwise a small pill for a search bar.
 */
export function PlaceButton({ label, onPress, big, open }: { label: string; onPress: () => void; big?: boolean; open?: boolean }) {
  if (big) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Place: ${label}. Change`} accessibilityState={{ expanded: !!open }} onPress={onPress}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start" }}>
        <Icon name="pin" size={17} stroke={2.2} />
        <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: f.serifBold, fontSize: 20, color: c.ink }}>{label}</Text>
        <Icon name="down" size={16} stroke={2.2} />
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Place: ${label}. Change`} onPress={onPress} style={{ minHeight: 44, maxWidth: 120, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon name="pin" size={13} color={c.muted} />
      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: f.medium, fontSize: 12, color: c.muted }}>{label}</Text>
    </Pressable>
  );
}
