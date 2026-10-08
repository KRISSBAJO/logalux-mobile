// Locations: every place the business trades from. Add one, change its address and arrival notes,
// set its opening hours, choose the main one, delete one that has never been booked.
// The map position is found from the address by the API each time the address is saved, as on the web, unless a pin was set by hand.
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { LocationFields, emptyLocation, locationFieldsBody, locationProblem, locationValueOf, type LocationValue } from "@/components/ca-location-fields";
import { Sheet, SmallBtn, Stepper, Sw, Tag } from "@/components/mc-kit";
import { Gate, Page, backTo } from "@/components/mi-kit";
import { Btn, Card, Empty, Field, Icon, Note, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { distanceLabel, pinWords } from "@/lib/ca-place";
import { DAYS, DAY_LONG, DENIED, HALF_HOURS, ask, clock12, orDenied, signedIn, type Day, type Hours } from "@/lib/mc-util";
import { hoursLine, isOpen, locationBody, type Flash } from "@/lib/mi-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Form = { id: string; name: string; arrival_notes: string; loc: LocationValue };
type Draft = Record<Day, [string, string] | null>;
const back = backTo("/m/settings");
const shift = (hhmm: string, up: boolean) => {
  const i = HALF_HOURS.findIndex((t) => t >= hhmm);
  const at = i < 0 ? HALF_HOURS.length - 1 : HALF_HOURS[i] === hhmm ? i + (up ? 1 : -1) : up ? i : i - 1;
  return HALF_HOURS[Math.max(0, Math.min(HALF_HOURS.length - 1, at))];
};
const onMap = (l: Data) => l.lat !== null && l.lat !== undefined && l.lng !== null && l.lng !== undefined;

export default function Locations() {
  const s = useSession();
  const { data, error, reload, refresh, refreshing } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/settings"))), [s.businessToken]);
  const [note, setNote] = useState<Flash>(null);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState<Form | null>(null), [formError, setFormError] = useState("");
  const [hours, setHours] = useState<{ loc: Data; draft: Draft } | null>(null), [hoursError, setHoursError] = useState("");

  if (!data || data === DENIED) return <Gate title="Locations" onBack={back} denied={data === DENIED} what="Locations and their opening hours are set by a manager or the owner." error={error} onRetry={reload} />;

  const locations = (data.locations ?? []) as Data[];
  const country = String(data.business?.market ?? locations[0]?.country ?? "US");
  const set = (change: Partial<Form>) => { setForm((x) => (x ? { ...x, ...change } : x)); if (change.name !== undefined) setFormError(""); };
  const setLoc = (change: Partial<LocationValue>) => { setForm((x) => (x ? { ...x, loc: { ...x.loc, ...change } } : x)); setFormError(""); };

  const open = (l?: Data) => {
    setFormError("");
    setForm(l ? { id: String(l.id), name: String(l.name ?? ""), arrival_notes: String(l.arrival_notes ?? ""), loc: locationValueOf(l, country) } : { id: "", name: "", arrival_notes: "", loc: emptyLocation(country) });
  };

  const save = async () => {
    if (!form) return;
    if (locationProblem(form.loc)) { setFormError(locationProblem(form.loc)); return; }
    const fields = { name: form.name.trim(), arrival_notes: form.arrival_notes.trim(), ...locationFieldsBody(form.loc) };
    const old = locations.find((l) => l.id === form.id);
    setBusy("form"); setFormError(""); setNote(null);
    try {
      // A new location is sent without hours, so the API gives it Monday to Saturday to start with.
      const out = old ? await s.mapi<Data>(`/locations/${old.id}`, { method: "PUT", body: locationBody(old, fields) }) : await s.mapi<Data>("/locations", { body: fields });
      setForm(null);
      await refresh();
      const pin = pinWords(String(out.position ?? ""));
      setNote(!old ? { kind: out.position === "not found" ? "bad" : "ok", text: `Location added. ${pin} It opens Monday to Saturday to start with: set its real hours next.`.replace(/  /g, " ") }
        : out.position === "not found" ? { kind: "bad", text: `Saved. ${pin}` }
        : { kind: "ok", text: `Location saved. ${pin}`.trim() });
    } catch (e) {
      setFormError((e as Error).message);
    }
    setBusy("");
  };

  const openHoursOf = (l: Data) => {
    const h = (l.hours ?? {}) as Hours;
    setHoursError("");
    setHours({ loc: l, draft: Object.fromEntries(DAYS.map((d) => { const v = h[d]; return [d, isOpen(v) ? [v[0], v[1]] : null]; })) as Draft });
  };
  const setDay = (d: Day, v: [string, string] | null) => setHours((x) => (x ? { ...x, draft: { ...x.draft, [d]: v } } : x));
  const saveHours = async () => {
    if (!hours) return;
    const sent: Record<string, string[]> = {};
    for (const d of DAYS) { const v = hours.draft[d]; if (v) sent[d] = v; }
    setBusy("hours"); setHoursError(""); setNote(null);
    try {
      await s.mapi(`/locations/${hours.loc.id}`, { method: "PUT", body: locationBody(hours.loc, { hours: sent }) });
      setHours(null);
      await refresh();
      setNote({ kind: "ok", text: `Hours saved for ${hours.loc.name}.` });
    } catch (e) {
      setHoursError((e as Error).message);
    }
    setBusy("");
  };

  const act = async (l: Data, action: "primary" | "delete") => {
    if (action === "delete" && !(await ask(`Delete ${l.name}?`, "A location with bookings on record cannot be deleted.", "Delete", true))) return;
    setBusy(action + l.id); setNote(null);
    try {
      await s.mapi(`/locations/${l.id}/action`, { body: { action } });
      await refresh();
      setNote({ kind: "ok", text: action === "primary" ? `${l.name} is now your main location.` : "Location deleted." });
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  const openDay = Object.values(hours?.draft ?? {}).find((v) => !!v) as [string, string] | undefined;

  return (
    <Page title="Locations" onBack={back} note={note} onRefresh={refresh} refreshing={refreshing}
      lead="The main location is the one shown on your booking page. The address places you on the map and in search near the client."
      footer={<Btn icon="plus" onPress={() => open()}>Add a location</Btn>}>
      <View style={{ gap: 12, marginTop: 16 }}>
        {!locations.length ? <Empty title="No location yet">Add the place you work from and clients can find you on the map.</Empty> : null}
        {locations.map((l) => {
          const where = [l.address, l.city, l.region].filter(Boolean).join(", ");
          return (
            <Card key={l.id} style={{ padding: 16, gap: 10 }}>
              <Row between style={{ alignItems: "flex-start" }}>
                <Text accessibilityRole="header" style={{ flex: 1, fontFamily: f.serifBold, fontSize: 20, lineHeight: 24, color: c.ink }}>{l.name}</Text>
                {l.is_primary ? <Tag kind="ok">Main</Tag> : null}
              </Row>
              <View style={{ gap: 6 }}>
                <Row gap={8} style={{ alignItems: "flex-start" }}>
                  <View style={{ marginTop: 2 }}><Icon name="pin" size={15} color={c.muted} /></View>
                  <T size={13} style={{ flex: 1 }} muted={!where}>{where || "No address yet. Clients need one to find you."}</T>
                </Row>
                <Row gap={8} style={{ alignItems: "flex-start" }}>
                  <View style={{ marginTop: 2 }}><Icon name="clock" size={15} color={c.muted} /></View>
                  <T size={13} style={{ flex: 1 }}>{hoursLine(l.hours as Hours) || "Closed every day"}</T>
                </Row>
                {l.arrival_notes ? (
                  <Row gap={8} style={{ alignItems: "flex-start" }}>
                    <View style={{ marginTop: 2 }}><Icon name="info" size={15} color={c.muted} /></View>
                    <T size={13} muted style={{ flex: 1 }}>{l.arrival_notes}</T>
                  </Row>
                ) : null}
              </View>
              <Row gap={8} wrap>
                <Tag kind={onMap(l) ? "ok" : "gold"}>{onMap(l) ? "On the map" : "Not on the map yet"}</Tag>
                <Tag>{String(l.timezone ?? "").replace(/_/g, " ")}</Tag>
                {l.travels ? <Tag kind="gold">Comes to clients{Number(l.travel_radius_km) > 0 ? ` · within ${distanceLabel(Number(l.travel_radius_km), String(l.country ?? country) === "US" ? "mi" : "km")}` : ""}</Tag> : null}
              </Row>
              {!onMap(l) ? <T size={12} muted>Save a street address and city, and LogaLuxe places it on the map for you.</T> : null}
              <Row gap={8} wrap>
                <SmallBtn onPress={() => open(l)}>Edit</SmallBtn>
                <SmallBtn onPress={() => openHoursOf(l)}>Hours</SmallBtn>
                {onMap(l) ? <SmallBtn onPress={() => { void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`).catch(() => undefined); }}>See on a map</SmallBtn> : null}
              </Row>
              {!l.is_primary ? (
                <Row gap={8} wrap style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10 }}>
                  <SmallBtn busy={busy === "primary" + l.id} onPress={() => act(l, "primary")}>Make this the main one</SmallBtn>
                  <SmallBtn kind="danger" busy={busy === "delete" + l.id} onPress={() => act(l, "delete")}>Delete</SmallBtn>
                </Row>
              ) : null}
            </Card>
          );
        })}
      </View>

      {/* Add or edit: name, address, arrival notes */}
      <Sheet tall open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit ${locations.find((l) => l.id === form.id)?.name ?? "location"}` : "New location"}
        sub={form?.id ? "The address places you on the map and in search near the client." : "A second place you trade from. It starts with Monday to Saturday hours, which you can change straight after."}
        footer={<Btn busy={busy === "form"} onPress={save}>{form?.id ? "Save location" : "Add location"}</Btn>}>
        {form ? (
          <>
            {formError && !/needs a name/i.test(formError) && !/address|street|city|state|region/i.test(formError) ? <Note kind="bad">{formError}</Note> : null}
            <Field label="Name · how you tell your locations apart" value={form.name} onChangeText={(name) => set({ name })} maxLength={80} placeholder="Lekki Phase 1" error={/needs a name/i.test(formError) ? formError : undefined} />
            <LocationFields value={form.loc} onChange={setLoc} fixedCountry error={formError && /address|street|city|state|region/i.test(formError) ? formError : undefined} />
            <Field label="Parking and arrival notes" value={form.arrival_notes} onChangeText={(arrival_notes) => set({ arrival_notes })} multiline maxLength={400} placeholder="Free parking behind the building, ring bell 2" hint="Shown to clients with your address." />
          </>
        ) : null}
      </Sheet>

      {/* Opening hours of one location */}
      <Sheet tall open={!!hours} onClose={() => setHours(null)} title={hours ? `Opening hours · ${hours.loc.name}` : ""} sub="Clients can only book inside these hours. Switch a day off to close it."
        footer={<Btn busy={busy === "hours"} onPress={saveHours}>Save hours</Btn>}>
        {hours ? (
          <>
            {hoursError ? <Note kind="bad">{hoursError}</Note> : null}
            <Card>
              {DAYS.map((d, i) => {
                const v = hours.draft[d];
                return (
                  <View key={d} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 10, borderBottomWidth: i === 6 ? 0 : 1, borderBottomColor: c.line }}>
                    <Row between style={{ minHeight: 32 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{DAY_LONG[d]}</Text>
                        {v ? null : <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted2 }}>Closed</Text>}
                      </View>
                      <Sw on={!!v} label={`Open on ${DAY_LONG[d]}`} onPress={() => setDay(d, v ? null : openDay ? [openDay[0], openDay[1]] : ["09:00", "18:00"])} />
                    </Row>
                    {v ? (
                      <Row gap={8} wrap>
                        <Stepper value={clock12(v[0])} lessLabel={`${DAY_LONG[d]}: open earlier`} moreLabel={`${DAY_LONG[d]}: open later`} onLess={() => setDay(d, [shift(v[0], false), v[1]])} onMore={() => setDay(d, [shift(v[0], true), v[1]])} />
                        <T size={13} muted>to</T>
                        <Stepper value={clock12(v[1])} lessLabel={`${DAY_LONG[d]}: close earlier`} moreLabel={`${DAY_LONG[d]}: close later`} onLess={() => setDay(d, [v[0], shift(v[1], false)])} onMore={() => setDay(d, [v[0], shift(v[1], true)])} />
                      </Row>
                    ) : null}
                  </View>
                );
              })}
            </Card>
            <T size={12} muted>Times are in {String(hours.loc.timezone ?? "").replace(/_/g, " ")}, in steps of half an hour. Each person&apos;s own working days are set with the team.</T>
          </>
        ) : null}
      </Sheet>
    </Page>
  );
}
