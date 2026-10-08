// Where a business is: its country, street, city and state, and whether it travels to clients.
// "Check on the map" asks the API where the address lands (POST /v1/places/locate) and which time zone
// that is; when the pin is wrong it can be set by hand with a position, which is then sent with the form.
// The country sets the money and cannot be changed once the business exists (`fixedCountry`).
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { Sw } from "@/components/mc-kit";
import { Btn, Chip, Field, Label, Note, Row, T } from "@/components/ui";
import { loadStates, locateAddress, moneyName, pinWords, providerName, type LocatedAddress, type StateRow } from "@/lib/ca-place";
import { c, f, radius } from "@/lib/theme";

export type LocationValue = {
  country: string; address: string; city: string; region: string;
  /** A pin set by hand, as typed. Empty means the API finds the position from the address. */
  lat: string; lng: string;
  travels: boolean;
  /** How far they go, in the country's own unit (miles in the US, kilometres in Nigeria), as typed. Empty means no limit. */
  far: string;
};

export const emptyLocation = (country = "US"): LocationValue => ({ country: country === "NG" ? "NG" : "US", address: "", city: "", region: "", lat: "", lng: "", travels: false, far: "" });

/** A stored location, as GET /v1/m/settings lists it, in the shape the fields edit. */
export function locationValueOf(l: { country?: string | null; address?: string | null; city?: string | null; region?: string | null; travels?: boolean | null; travel_radius_km?: number | null }, country: string): LocationValue {
  const miles = (l.country ?? country) === "US";
  const km = Number(l.travel_radius_km) || 0;
  return { country: l.country ?? country, address: String(l.address ?? ""), city: String(l.city ?? ""), region: String(l.region ?? ""), lat: "", lng: "", travels: !!l.travels, far: km > 0 ? String(Math.round(miles ? km / 1.609344 : km)) : "" };
}

const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
const pinOf = (v: LocationValue) => {
  const lat = num(v.lat), lng = num(v.lng);
  return lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

/** What the fields send: the shape POST /v1/m/signup and POST or PUT /v1/m/locations take. */
export function locationFieldsBody(v: LocationValue): Record<string, unknown> {
  const body: Record<string, unknown> = { country: v.country, address: v.address.trim(), city: v.city.trim(), region: v.region.trim(), travels: v.travels };
  const pin = pinOf(v);
  if (pin) { body.lat = pin.lat; body.lng = pin.lng; }
  const miles = v.country === "US";
  const far = Number(v.far) || 0;
  body.travel_radius_km = v.travels && far > 0 ? Math.max(1, Math.round(miles ? far * 1.609344 : far)) : 0; // 0 means no limit
  return body;
}

/** "Add your city and state." when either is missing, else "". */
export const locationProblem = (v: LocationValue) => (!v.city.trim() || !v.region.trim() ? "Add your city and state." : "");

export function LocationFields({ value: v, onChange, fixedCountry, error }: { value: LocationValue; onChange: (change: Partial<LocationValue>) => void; fixedCountry?: boolean; /** The API's sentence about these fields, shown by the field it names. */ error?: string }) {
  const [states, setStates] = useState<Record<string, StateRow[]>>({});
  const [statesError, setStatesError] = useState("");
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const [found, setFound] = useState<LocatedAddress | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [byHand, setByHand] = useState(false);
  const miles = v.country === "US";
  const list = states[v.country] ?? [];
  // A stored state that is not in the list (typed before states were checked) is still offered, so nothing is lost.
  const chosen = list.find((s) => s.value === v.region || s.code === v.region || s.name === v.region);
  const shown = useMemo(() => { const q = find.trim().toLowerCase(); return q ? list.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q) : list; }, [list, find]);

  useEffect(() => {
    let live = true;
    loadStates().then((d) => { if (live) setStates(d); }).catch((e) => { if (live) setStatesError((e as Error).message || "The list of states could not be loaded. Type the state instead."); });
    return () => { live = false; };
  }, []);

  // Anything typed after a check makes the check stale.
  const set = (change: Partial<LocationValue>) => { onChange(change); setFound(null); setProblem(""); };
  const pin = pinOf(v);

  const check = async (hand?: { lat: number; lng: number }) => {
    setBusy(true); setProblem("");
    try {
      const out = await locateAddress({ address: v.address.trim(), city: v.city.trim(), region: v.region.trim(), country: v.country, ...(hand ?? {}) });
      setFound(out);
      if (out.location?.region && !hand) onChange({ region: out.location.region });
    } catch (e) {
      setFound(null);
      setProblem((e as Error).message || "We could not check that address just now. You can still save; we look it up again then.");
    }
    setBusy(false);
  };
  const where = pin ?? (found?.location.lat != null && found.location.lng != null ? { lat: found.location.lat, lng: found.location.lng } : null);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Label>Country</Label>
        {fixedCountry ? (
          <T size={14}>{v.country === "NG" ? "Nigeria" : "United States"} · paid in {moneyName(v.country)}</T>
        ) : (
          <Row gap={8} wrap>
            {(["US", "NG"] as const).map((k) => <Chip key={k} on={v.country === k} onPress={() => { if (k !== v.country) { set({ country: k, region: "", lat: "", lng: "", far: "" }); setByHand(false); } }}>{k === "NG" ? "Nigeria" : "United States"}</Chip>)}
          </Row>
        )}
        {!fixedCountry ? <T size={13} muted>You are paid in {moneyName(v.country)}, through {providerName(v.country)}. This cannot be changed later.</T> : null}
      </View>

      <Field label="Street address" value={v.address} onChangeText={(address) => set({ address })} maxLength={200} autoComplete="street-address" textContentType="streetAddressLine1"
        placeholder={v.travels ? "Leave empty if you have no shop front" : v.country === "NG" ? "12 Admiralty Way, Lekki Phase 1" : "1402 Gallatin Ave"} error={error && /address|street/i.test(error) ? error : undefined} />
      <Field label="City or town" value={v.city} onChangeText={(city) => set({ city })} maxLength={80} textContentType="addressCity" error={error && /city/i.test(error) ? error : undefined} />

      <View style={{ gap: 6 }}>
        <Label>State</Label>
        <Pressable accessibilityRole="button" accessibilityLabel={`State: ${chosen?.name || v.region || "not chosen"}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
          style={({ pressed }) => ({ minHeight: 52, borderRadius: radius.field, borderWidth: open ? 2 : 1, borderColor: error && /state|region/i.test(error) ? c.bad : open ? c.ink : c.line2, backgroundColor: c.white, paddingHorizontal: open ? 13 : 14, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.85 : 1 })}>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.body, fontSize: 16, color: v.region ? c.ink : c.muted2 }}>{chosen?.name || v.region || "Choose"}</Text>
          <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>{open ? "Done" : "Change"}</Text>
        </Pressable>
        {error && /state|region/i.test(error) ? <T size={13} color={c.bad}>{error}</T> : null}
        {open ? (
          <View style={{ gap: 8, marginTop: 2 }}>
            {list.length > 12 ? (
              <TextInput accessibilityLabel="Find a state" value={find} onChangeText={setFind} placeholder="Type to find a state" placeholderTextColor={c.muted2} autoCorrect={false}
                style={[{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingHorizontal: 12, fontFamily: f.body, fontSize: 15, color: c.ink }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]} />
            ) : null}
            {statesError ? (
              <>
                <T size={13} muted>{statesError}</T>
                <Field label="State" value={v.region} onChangeText={(region) => set({ region })} maxLength={80} textContentType="addressState" />
              </>
            ) : !list.length ? <T size={13} muted>Loading the states…</T> : (
              <Row gap={8} wrap>
                {shown.map((s) => <Chip key={s.value} on={!!chosen && chosen.value === s.value} onPress={() => { set({ region: s.value }); setOpen(false); setFind(""); }}>{s.name}</Chip>)}
                {!shown.length ? <T size={13} muted>No state matches that.</T> : null}
              </Row>
            )}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Row between style={{ minHeight: 32 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>I travel to clients</Text>
            <T size={12.5} muted>Clients see “Comes to you” and your pin marks the area you work from, not a door.</T>
          </View>
          <Sw on={v.travels} label="I travel to clients" onPress={() => set({ travels: !v.travels })} />
        </Row>
        {v.travels ? <Field label={`How far you go, in ${miles ? "miles" : "kilometres"}`} value={v.far} onChangeText={(far) => set({ far: far.replace(/[^\d]/g, "") })} keyboardType="number-pad" maxLength={3} placeholder="Leave empty for no limit" /> : null}
      </View>

      <View style={{ gap: 8 }}>
        <Row gap={10} wrap>
          <Btn kind="out" small busy={busy} disabled={!v.city.trim() || !v.region.trim()} onPress={() => void check(pin ?? undefined)}>Check on the map</Btn>
          {!byHand && !pin ? (
            <Pressable accessibilityRole="button" onPress={() => setByHand(true)} style={{ minHeight: 40, justifyContent: "center" }}><T size={13} weight="semi" color={c.wine}>Set the pin by hand</T></Pressable>
          ) : null}
        </Row>
        {!found && !problem && !byHand ? <T size={12.5} muted>See where the address lands and which time zone it is in. Without a check, the address is looked up when you save.</T> : null}
        {problem ? <Note kind="bad">{problem}</Note> : null}
        {found ? (
          <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
            <T size={13.5}><T size={13.5} weight="semi">{pin ? "Pin set by hand. It is saved where you put it." : pinWords(found.position)}</T>{found.location.matched && !pin ? <T size={13.5} muted> {found.location.matched}</T> : null}</T>
            <T size={13} muted>Time zone: {found.timezone_name || found.location.timezone || "not known yet"}.{where ? ` Position ${where.lat.toFixed(4)}, ${where.lng.toFixed(4)}.` : ""}</T>
          </View>
        ) : null}
        {byHand || pin ? (
          <View style={{ gap: 8 }}>
            <T size={13} muted>Type the latitude and longitude of your door, as a map app shows them. Leave both empty to go back to the address.</T>
            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}><Field label="Latitude" value={v.lat} onChangeText={(lat) => set({ lat: lat.replace(/[^\d.-]/g, "") })} keyboardType="numbers-and-punctuation" placeholder={miles ? "36.1627" : "6.4541"} /></View>
              <View style={{ flex: 1 }}><Field label="Longitude" value={v.lng} onChangeText={(lng) => set({ lng: lng.replace(/[^\d.-]/g, "") })} keyboardType="numbers-and-punctuation" placeholder={miles ? "-86.7816" : "3.3947"} /></View>
            </Row>
            {(v.lat || v.lng) && !pin ? <T size={13} color={c.bad}>Latitude is -90 to 90 and longitude -180 to 180.</T> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
