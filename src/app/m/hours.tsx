// Hours and policies: when the main location is open, and the rules clients book under (design: M10-Hours).
// Every value is one the API keeps (GET /v1/m/settings); each change is saved as it is made.
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AskManager, Wait, Choice, Grp, Header, SetRow, Sheet, Stepper, Sw, Tabs2, Val, WebLink } from "@/components/mc-kit";
import { Btn, Card, Failed, Field, Icon, Note, Screen, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { DAYS, DAY_LONG, DAY_SHORT, DENIED, HALF_HOURS, clock12, orDenied, signedIn, toInt, type Day, type Hours } from "@/lib/mc-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const FEES: [string, string, string][] = [["none", "No fee", "Nothing is charged"], ["deposit", "Keep the deposit", "The deposit they paid is not returned"], ["50", "50% of the service", "Half the price of what was booked"], ["100", "100% of the service", "The full price of what was booked"]];
const feeName = (v: unknown) => FEES.find(([k]) => k === String(v))?.[1] ?? String(v ?? "");
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** The next multiple of `step` below or above a value, kept inside the API's limits. */
const stepTo = (n: number, step: number, up: boolean, lo: number, hi: number) => clamp(up ? Math.floor(n / step) * step + step : Math.ceil(n / step) * step - step, lo, hi);
const shift = (hhmm: string, up: boolean) => {
  const i = HALF_HOURS.findIndex((t) => t >= hhmm);
  const at = i < 0 ? HALF_HOURS.length - 1 : HALF_HOURS[i] === hhmm ? i + (up ? 1 : -1) : up ? i : i - 1;
  return HALF_HOURS[clamp(at, 0, HALF_HOURS.length - 1)];
};
const isOpen = (v: unknown): v is string[] => Array.isArray(v) && v.length === 2;

type NumAsk = { title: string; sub: string; label: string; value: string; group: string; key: string };

export default function HoursAndPolicies() {
  const s = useSession();
  const { data, error, refreshing, refresh, reload, setData } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/settings"))), [s.businessToken]);
  const [tab, setTab] = useState<"hours" | "policy">("hours");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [dayEdit, setDayEdit] = useState<{ day: Day; from: string; to: string } | null>(null);
  const [dayError, setDayError] = useState("");
  const [num, setNum] = useState<NumAsk | null>(null), [numError, setNumError] = useState("");
  const [fee, setFee] = useState<{ key: "late_cancel_fee" | "no_show_fee"; title: string } | null>(null);
  const [addr, setAddr] = useState<{ address: string; city: string; region: string } | null>(null), [addrError, setAddrError] = useState("");

  if (!data || data === DENIED) {
    return (
      <Screen>
        <Header title="Hours & policies" />
        {data === DENIED ? <AskManager what="Opening hours and booking policies are set by a manager or the owner." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const locations = (data.locations ?? []) as Data[];
  const loc = locations.find((l) => l.is_primary) ?? locations[0];
  const hours = ((loc?.hours ?? {}) as Hours);
  const rules = (data.rules ?? {}) as Data;
  const booking = (rules.booking ?? {}) as Data, policy = (rules.policy ?? {}) as Data;

  /** Saves the main location's hours. The API takes the whole location, so the rest of it is sent back unchanged. */
  const saveHours = async (next: Hours, tag: string): Promise<boolean> => {
    if (!loc) return false;
    const open: Record<string, string[]> = {};
    for (const d of DAYS) { const v = next[d]; if (isOpen(v)) open[d] = [v[0], v[1]]; }
    setBusy(tag); setNote(null);
    try {
      await s.mapi(`/locations/${loc.id}`, { method: "PUT", body: { name: loc.name, address: loc.address ?? "", city: loc.city ?? "", region: loc.region ?? "", arrival_notes: loc.arrival_notes ?? "", hours: open } });
      setData((d) => (d && d !== DENIED ? { ...d, locations: (d.locations as Data[]).map((l) => (l.id === loc.id ? { ...l, hours: Object.fromEntries(DAYS.map((x) => [x, open[x] ?? null])) } : l)) } : d));
      setBusy("");
      return true;
    } catch (e) {
      setBusy("");
      throw e;
    }
  };

  const saveAddress = async () => {
    if (!loc || !addr) return;
    const open: Record<string, string[]> = {};
    for (const d of DAYS) { const v = hours[d]; if (isOpen(v)) open[d] = [v[0], v[1]]; }
    setBusy("addr"); setAddrError(""); setNote(null);
    try {
      const out = await s.mapi<Data>(`/locations/${loc.id}`, { method: "PUT", body: { name: loc.name, address: addr.address.trim(), city: addr.city.trim(), region: addr.region.trim(), arrival_notes: loc.arrival_notes ?? "", hours: open } });
      setData((d) => (d && d !== DENIED ? { ...d, locations: (d.locations as Data[]).map((l) => (l.id === loc.id ? { ...l, address: addr.address.trim(), city: addr.city.trim(), region: addr.region.trim() } : l)) } : d));
      setNote(out.position === "not found" ? { kind: "bad", text: "Saved. We could not place that address on the map, so check the street and city." } : { kind: "ok", text: "Address saved." });
      setAddr(null);
    } catch (e) {
      setAddrError((e as Error).message);
    }
    setBusy("");
  };

  const toggleDay = async (day: Day) => {
    const next: Hours = { ...hours };
    if (isOpen(hours[day])) next[day] = null;
    else {
      // Opens with the hours of the nearest open day, or nine to six.
      const like = DAYS.map((d) => hours[d]).find(isOpen);
      next[day] = like ? [like[0], like[1]] : ["09:00", "18:00"];
    }
    try {
      await saveHours(next, day);
      setNote({ kind: "ok", text: isOpen(next[day]) ? `${DAY_LONG[day]} is open ${clock12(next[day]![0])} to ${clock12(next[day]![1])}. Tap the times to change them.` : `${DAY_LONG[day]} is closed. Bookings already made for it are kept.` });
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
  };

  const saveDay = async (all: boolean) => {
    if (!dayEdit) return;
    const next: Hours = { ...hours };
    for (const d of DAYS) if (d === dayEdit.day || (all && isOpen(hours[d]))) next[d] = [dayEdit.from, dayEdit.to];
    setDayError("");
    try {
      await saveHours(next, "day");
      setNote({ kind: "ok", text: all ? "Hours saved for every open day." : `${DAY_LONG[dayEdit.day]} hours saved.` });
      setDayEdit(null);
    } catch (e) {
      setDayError((e as Error).message);
    }
  };

  /** Saves one rule and takes the API's answer as the new truth. Answers the error sentence, or "". */
  const saveRule = async (group: string, key: string, value: boolean | number | string): Promise<string> => {
    setBusy(`${group}.${key}`); setNote(null);
    try {
      const out = await s.mapi<Data>("/settings/rules", { method: "PUT", body: { [group]: { [key]: value } } });
      setData((d) => (d && d !== DENIED ? { ...d, rules: out.rules ?? d.rules } : d));
      setBusy("");
      return "";
    } catch (e) {
      setBusy("");
      return (e as Error).message;
    }
  };
  const quick = async (group: string, key: string, value: boolean | number | string) => {
    const bad = await saveRule(group, key, value);
    if (bad) setNote({ kind: "bad", text: bad });
  };

  const saveNum = async () => {
    if (!num) return;
    const n = toInt(num.value);
    if (n === null) { setNumError("Enter a whole number."); return; }
    const bad = await saveRule(num.group, num.key, n);
    if (bad) setNumError(bad); else setNum(null);
  };
  const askNum = (a: NumAsk) => { setNumError(""); setNum(a); };

  const cancelH = Number(policy.cancel_hours ?? 0), leadH = Number(booking.lead_hours ?? 0), maxD = Number(booking.max_days ?? 0), newPct = Number(policy.new_client_deposit_pct ?? 0);
  const late = String(policy.late_cancel_fee ?? "none"), noShow = String(policy.no_show_fee ?? "none");
  const preview = [
    cancelH > 0 ? `Free cancellation until ${cancelH} ${cancelH === 1 ? "hour" : "hours"} before.` : "Free cancellation right up to the start.",
    cancelH > 0 ? (late === "none" ? "Cancelling later than that costs nothing." : late === "deposit" ? "After that the deposit is kept." : `After that ${late}% of the service is charged.`) : "",
    noShow === "none" ? "No-shows are not charged." : noShow === "deposit" ? "A no-show loses the deposit." : `No-shows are charged ${noShow}%.`,
    newPct > 0 ? `A first visit asks for ${newPct}% up front when the service has no deposit of its own.` : "",
    policy.prepay_after_no_show ? "After a no-show, the next booking is paid in full up front." : "",
  ].filter(Boolean).join(" ");

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Hours & policies" />
      <View style={{ marginTop: 14 }}>
        <Tabs2 tabs={[["hours", "Hours & availability"], ["policy", "Cancellation & deposits"]]} value={tab} onChange={(k) => { setTab(k); setNote(null); }} />
      </View>
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}

      {tab === "hours" ? (
        <>
          {loc ? (
            <>
              <Grp>Where you work</Grp>
              <Card>
                <SetRow last title={String(loc.name)} sub={[loc.address, loc.city, loc.region].filter(Boolean).join(", ") || "No address yet. Clients need one to find you."} right={<Val>Change</Val>}
                  onPress={() => { setAddrError(""); setAddr({ address: String(loc.address ?? ""), city: String(loc.city ?? ""), region: String(loc.region ?? "") }); }} />
              </Card>
            </>
          ) : null}
          <Grp>Weekly hours{loc ? ` · ${loc.name}` : ""}</Grp>
          {loc ? (
            <Card>
              {DAYS.map((d, i) => {
                const v = hours[d], open = isOpen(v);
                return (
                  <View key={d} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: i === 6 ? 0 : 1, borderBottomColor: c.line }}>
                    <Text style={{ width: 40, fontFamily: f.semi, fontSize: 14, color: c.ink }}>{DAY_SHORT[d]}</Text>
                    {open ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`${DAY_LONG[d]}, ${clock12(v[0])} to ${clock12(v[1])}. Change the times`} onPress={() => { setDayError(""); setDayEdit({ day: d, from: v[0], to: v[1] }); }} style={{ flex: 1, minHeight: 32, justifyContent: "center" }}>
                        <Text style={{ fontFamily: f.body, fontSize: 14, color: c.ink }}>{clock12(v[0])} to {clock12(v[1])}</Text>
                      </Pressable>
                    ) : <Text style={{ flex: 1, fontFamily: f.body, fontSize: 14, color: c.muted2 }}>Closed</Text>}
                    <Sw on={open} disabled={busy === d} label={`Open on ${DAY_LONG[d]}`} onPress={() => toggleDay(d)} />
                  </View>
                );
              })}
            </Card>
          ) : <Card style={{ padding: 18 }}><T muted>This business has no location yet. Add one under Settings, Locations, and its hours show here.</T></Card>}
          <T size={12} muted style={{ marginTop: 8 }}>Tap a day&apos;s times to change them. Bookings follow these hours.</T>
          <WebLink to="/m/staff/time-off">Time off</WebLink>
          <WebLink to="/m/staff">Each person&apos;s own hours</WebLink>
          <WebLink to="/m/settings/locations">Other locations</WebLink>

          <Grp style={{ marginTop: 8 }}>Booking window</Grp>
          <Card>
            <SetRow title="Clients can book from" sub="No same-hour surprises" right={<Val>{leadH === 0 ? "Right away" : `${leadH} h ahead`}</Val>}
              onPress={() => askNum({ title: "Lead time", sub: "How many hours before a slot starts it stops being bookable online. 0 means right up to the start.", label: "Hours ahead", value: String(leadH), group: "booking", key: "lead_hours" })} />
            <SetRow title="Up to" sub="How far ahead the calendar opens" right={<Val>{maxD % 7 === 0 && maxD >= 7 ? `${maxD / 7} ${maxD === 7 ? "week" : "weeks"}` : `${maxD} ${maxD === 1 ? "day" : "days"}`}</Val>}
              onPress={() => askNum({ title: "How far ahead", sub: "The number of days ahead clients can book.", label: "Days ahead", value: String(maxD), group: "booking", key: "max_days" })} />
            <SetRow last title="Instant booking" sub={booking.instant ? "Confirmed without your approval" : "Each booking waits for you as a request"} right={<Sw on={!!booking.instant} disabled={busy === "booking.instant"} label="Instant booking" onPress={() => quick("booking", "instant", !booking.instant)} />} />
          </Card>
          <WebLink to="/m/settings/booking">Waitlist, &quot;anyone available&quot; and search listing</WebLink>
        </>
      ) : (
        <>
          <Grp>Cancellation</Grp>
          <Card>
            <SetRow title="Free cancellation until" sub="Hours before the appointment" right={
              <Stepper value={`${cancelH} h`} disabled={busy === "policy.cancel_hours"} lessLabel="Fewer hours" moreLabel="More hours"
                onLess={() => quick("policy", "cancel_hours", stepTo(cancelH, 12, false, 0, 168))} onMore={() => quick("policy", "cancel_hours", stepTo(cancelH, 12, true, 0, 168))}
                onValue={() => askNum({ title: "Free cancellation", sub: "How many hours before the appointment a client can still cancel free of charge. 0 means right up to the start.", label: "Hours before", value: String(cancelH), group: "policy", key: "cancel_hours" })} />} />
            <SetRow title="Late cancel fee" sub="When a client cancels inside that window" right={<Val>{feeName(late)}</Val>} onPress={() => setFee({ key: "late_cancel_fee", title: "Late cancel fee" })} />
            <SetRow last title="No-show fee" sub="When you mark a client as a no-show" right={<Val>{feeName(noShow)}</Val>} onPress={() => setFee({ key: "no_show_fee", title: "No-show fee" })} />
          </Card>

          <Grp>Deposits</Grp>
          <Card>
            <SetRow title="Standard deposit" sub="Per service, set in Services" right={<Icon name="next" size={18} color={c.muted2} />} onPress={() => router.push("/m/services" as never)} />
            <SetRow title="New clients" sub="First visit, when the service has no deposit" right={
              <Stepper value={`${newPct}%`} disabled={busy === "policy.new_client_deposit_pct"} lessLabel="Lower deposit" moreLabel="Higher deposit"
                onLess={() => quick("policy", "new_client_deposit_pct", stepTo(newPct, 25, false, 0, 100))} onMore={() => quick("policy", "new_client_deposit_pct", stepTo(newPct, 25, true, 0, 100))}
                onValue={() => askNum({ title: "New-client deposit", sub: "The share of the price a new client pays up front when what they book has no deposit of its own. 0 means none.", label: "Percent", value: String(newPct), group: "policy", key: "new_client_deposit_pct" })} />} />
            <SetRow last title="Clients with a no-show" sub="Pay in full to book again" right={<Sw on={!!policy.prepay_after_no_show} disabled={busy === "policy.prepay_after_no_show"} label="Full prepayment after a no-show" onPress={() => quick("policy", "prepay_after_no_show", !policy.prepay_after_no_show)} />} />
          </Card>

          <Grp>What clients see</Grp>
          <View style={{ backgroundColor: c.ink, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.66, textTransform: "uppercase", color: "#C9BCB0", marginBottom: 6 }}>Your policy in short</Text>
            <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19.5, color: "#F4ECE3" }}>{preview}</Text>
          </View>
        </>
      )}

      {/* One day's opening and closing time */}
      <Sheet open={!!dayEdit} onClose={() => setDayEdit(null)} title={dayEdit ? `${DAY_LONG[dayEdit.day]} hours` : ""} sub="In steps of half an hour."
        footer={dayEdit ? (
          <View style={{ gap: 8 }}>
            <Btn busy={busy === "day"} onPress={() => saveDay(false)}>Save {DAY_LONG[dayEdit.day]}</Btn>
            {DAYS.filter((d) => isOpen(hours[d])).length > 1 ? <Btn kind="out" disabled={busy === "day"} onPress={() => saveDay(true)}>Use these hours for every open day</Btn> : null}
          </View>
        ) : undefined}>
        {dayEdit ? (
          <>
            {dayError ? <Note kind="bad">{dayError}</Note> : null}
            <Card>
              <SetRow title="Opens" right={<Stepper value={clock12(dayEdit.from)} lessLabel="Open earlier" moreLabel="Open later" onLess={() => setDayEdit((x) => (x ? { ...x, from: shift(x.from, false) } : x))} onMore={() => setDayEdit((x) => (x ? { ...x, from: shift(x.from, true) } : x))} />} />
              <SetRow last title="Closes" right={<Stepper value={clock12(dayEdit.to)} lessLabel="Close earlier" moreLabel="Close later" onLess={() => setDayEdit((x) => (x ? { ...x, to: shift(x.to, false) } : x))} onMore={() => setDayEdit((x) => (x ? { ...x, to: shift(x.to, true) } : x))} />} />
            </Card>
          </>
        ) : null}
      </Sheet>

      {/* The main location's address */}
      <Sheet open={!!addr} onClose={() => setAddr(null)} title="Address" sub="Clients see this on your page and in their confirmation." footer={<Btn busy={busy === "addr"} onPress={saveAddress}>Save address</Btn>}>
        {addr ? (
          <>
            {addrError ? <Note kind="bad">{addrError}</Note> : null}
            <Field label="Street address" value={addr.address} onChangeText={(address) => setAddr({ ...addr, address })} autoComplete="street-address" placeholder="Leave empty if you travel to clients" />
            <Field label="City" value={addr.city} onChangeText={(city) => setAddr({ ...addr, city })} />
            <Field label="State" value={addr.region} onChangeText={(region) => setAddr({ ...addr, region })} autoCapitalize="characters" />
          </>
        ) : null}
      </Sheet>

      {/* An exact number */}
      <Sheet open={!!num} onClose={() => setNum(null)} title={num?.title ?? ""} sub={num?.sub} footer={<Btn busy={!!num && busy === `${num.group}.${num.key}`} onPress={saveNum}>Save</Btn>}>
        {num ? <Field label={num.label} value={num.value} onChangeText={(value) => setNum({ ...num, value })} keyboardType="number-pad" autoFocus error={numError || undefined} onSubmitEditing={saveNum} /> : null}
      </Sheet>

      {/* A fee */}
      <Sheet open={!!fee} onClose={() => setFee(null)} title={fee?.title ?? ""} sub={fee?.key === "late_cancel_fee" ? "What a client owes when they cancel after the free window has closed." : "What a client owes when they do not turn up."}>
        {fee ? FEES.map(([k, name, sub]) => (
          <Choice key={k} title={name} sub={sub} on={String(policy[fee.key]) === k} onPress={async () => { const key = fee.key; setFee(null); await quick("policy", key, k); }} />
        )) : null}
      </Sheet>
    </Screen>
  );
}
