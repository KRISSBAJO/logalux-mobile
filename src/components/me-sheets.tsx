// The forms of the Staff & chairs screens, each a sheet from the bottom: a new person, their details, pay,
// rental terms, their week and breaks, what they perform, time off, and their sign-in.
// Fields, limits and wording follow the web's Staff & rosters tool; every save goes to the same API calls.
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Choice, Sheet, SmallBtn, Sw } from "@/components/mc-kit";
import { DateField, DayTicks, Options, Tick, TimeStep, TonePick, first } from "@/components/me-kit";
import { Btn, Card, Chip, Field, Label, Note, Row, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { DAY_LONG, ask, major, symbol, toCents } from "@/lib/mc-util";
import { addDays } from "@/lib/mb-util";
import { DAYS, DAY_SHORT, LEVELS, PAY_SUB, breaksOf, hoursOf, invitedText, isRenter, reassignedText, serviceBodyWithPrice, span12, staffBody, type Day, type WeekHours } from "@/lib/me-staff";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

type Done = (text: string) => void;
const RENT_DAYS = DAYS.map((d) => [d, DAY_SHORT[d]] as const);
const toPct = (text: string): number | null => { const t = text.trim(); if (t === "") return 0; if (!/^\d+(\.\d+)?$/.test(t)) return null; const n = Number(t); return n >= 0 && n <= 100 ? n : null; };

/** A sheet's own saving state: the busy flag, the error sentence, and a runner that fills both. */
function useSave() {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await work(); } catch (e) { setError((e as Error).message || "Something went wrong."); }
    setBusy(false);
  };
  return { busy, error, setError, run };
}

// ---------- rent terms, used for a new renter and an existing one ----------

type Rent = { trading: string; rent: string; period: "weekly" | "monthly"; days: string[] };
const rentOf = (p?: Data): Rent => ({ trading: String(p?.trading_name ?? ""), rent: p?.rent_cents ? major(p.rent_cents) : "", period: p?.rent_period === "monthly" ? "monthly" : "weekly", days: ((p?.rent_days ?? []) as string[]).slice() });
const rentBody = (r: Rent, cents: number) => ({ pay_type: "renter", trading_name: r.trading.trim(), rent_cents: cents, rent_period: r.period, rent_days: DAYS.filter((d) => r.days.includes(d)) });

function RentFields({ value, onChange, cur }: { value: Rent; onChange: (r: Rent) => void; cur: string }) {
  return (
    <>
      <Field label="Their business name" value={value.trading} onChangeText={(trading) => onChange({ ...value, trading })} maxLength={80} placeholder="Lash Haus" />
      <Field label={`Rent (${symbol(cur)})`} value={value.rent} onChangeText={(rent) => onChange({ ...value, rent })} keyboardType="decimal-pad" placeholder="0" />
      <Options label="Charged" options={[["weekly", "Every week"], ["monthly", "Every month"]]} value={value.period} onChange={(period) => onChange({ ...value, period })} />
      <DayTicks label="Days the chair is theirs" days={RENT_DAYS} value={value.days} onChange={(days) => onChange({ ...value, days })} />
    </>
  );
}

// ---------- a new person ----------

/** Adds someone to the team. `renter` opens it with the chair-rental box ticked. */
export function AddPersonSheet({ open, onClose, owner, cur, renter: startRenter, onAdded }: { open: boolean; onClose: () => void; owner: boolean; cur: string; renter?: boolean; onAdded: (id: string, text: string) => void }) {
  const s = useSession();
  const blank = { name: "", role: "staff", level: "senior", pay: "commission", hourly: "", salary: "", commission: "0", retail: "0", email: "", phone: "", tone: "#7A1F2B", bookable: true };
  const [v, setV] = useState(blank), [renter, setRenter] = useState(!!startRenter), [rent, setRent] = useState<Rent>(rentOf());
  const { busy, error, setError, run } = useSave();
  useEffect(() => { if (open) { setV(blank); setRenter(!!startRenter); setRent(rentOf()); setError(""); } /* a fresh form each time it opens */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (change: Partial<typeof blank>) => setV((x) => ({ ...x, ...change }));

  const save = () => run(async () => {
    const hourly = toCents(v.hourly), salary = toCents(v.salary), rentCents = toCents(rent.rent), com = toPct(v.commission), ret = toPct(v.retail);
    if (!v.name.trim()) throw new Error("Give them a name.");
    if (!renter && (hourly === null || salary === null)) throw new Error("Enter the pay as an amount, like 22 or 22.50.");
    if (!renter && (com === null || ret === null)) throw new Error("Commission is a percentage between 0 and 100.");
    if (renter && rentCents === null) throw new Error("Enter the rent as an amount, like 250.");
    const body: Record<string, unknown> = {
      name: v.name.trim(), role: renter ? "staff" : v.role, level: v.level, tone: v.tone, bookable: renter ? false : v.bookable, email: v.email.trim(), phone: v.phone.trim(),
      commission_pct: renter ? 0 : com, retail_commission_pct: renter ? 0 : ret,
      ...(renter ? rentBody(rent, rentCents ?? 0) : { pay_type: v.pay, hourly_cents: v.pay === "hourly" ? hourly : 0, salary_cents: v.pay === "salary" ? salary : 0 }),
    };
    const out = await s.mapi<Data>("/staff", { body });
    onAdded(String(out.id ?? ""), renter ? "Chair renter added. Their rent is listed under Chair rental from the next period." : "Added to the team. They can do every service until you say otherwise.");
  });

  return (
    <Sheet tall open={open} onClose={onClose} title={renter ? "Add a chair renter" : "Add to the team"} sub={renter ? "They run their own book, so clients do not book them here." : "They follow the location hours and can do every service until you change it."}
      footer={<Btn busy={busy} onPress={save}>{renter ? "Add the renter" : "Add to the team"}</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      <Field label={renter ? "Name on the roster" : "Name"} value={v.name} onChangeText={(name) => set({ name })} maxLength={60} autoCapitalize="words" />
      <Card style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
        <Tick on={renter} onPress={() => setRenter(!renter)} title="This person rents a chair from you" sub="A renter keeps their own takings and earns no commission. LogaLuxe records the rent and does not collect it." />
      </Card>
      {renter ? <RentFields value={rent} onChange={setRent} cur={cur} /> : (
        <>
          <Options label="Role" options={[["staff", "Team member"], ["manager", "Manager"], ...(owner ? [["owner", "Owner"] as [string, string]] : [])]} value={v.role} onChange={(role) => set({ role })} />
          <Options label="Level" options={LEVELS} value={v.level} onChange={(level) => set({ level })} />
          <PayFields pay={v.pay} hourly={v.hourly} salary={v.salary} commission={v.commission} retail={v.retail} cur={cur} onChange={(x) => set(x)} />
        </>
      )}
      <Field label="Email" value={v.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <Field label="Phone" value={v.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" />
      <TonePick value={v.tone} onChange={(tone) => set({ tone })} />
      {renter ? null : (
        <Card style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
          <Tick on={v.bookable} onPress={() => set({ bookable: !v.bookable })} title="Clients can book them" sub="Off keeps them on the roster but out of online booking." />
        </Card>
      )}
      <T size={12} muted>This adds them to the roster. To let them sign in, the owner sends an invite from their page afterwards.</T>
    </Sheet>
  );
}

type PayV = { pay: string; hourly: string; salary: string; commission: string; retail: string };
function PayFields({ pay, hourly, salary, commission, retail, cur, onChange, withRenter }: PayV & { cur: string; onChange: (x: Partial<PayV>) => void; withRenter?: boolean }) {
  const kinds: [string, string][] = [["commission", "Commission only"], ["hourly", "Hourly + commission"], ["salary", "Salary + commission"], ["owner", "Owner"], ...(withRenter ? [["renter", "Chair renter"] as [string, string]] : [])];
  return (
    <>
      <View style={{ gap: 6 }}>
        <Label>Pay</Label>
        <View style={{ gap: 8 }}>{kinds.map(([k, name]) => <Choice key={k} title={name} sub={PAY_SUB[k]} on={pay === k} onPress={() => onChange({ pay: k })} />)}</View>
      </View>
      {pay === "hourly" ? <Field label={`Hourly rate (${symbol(cur)})`} value={hourly} onChangeText={(x) => onChange({ hourly: x })} keyboardType="decimal-pad" placeholder="0" hint="Counted on rostered hours, without breaks or approved time off." /> : null}
      {pay === "salary" ? <Field label={`Salary a month (${symbol(cur)})`} value={salary} onChangeText={(x) => onChange({ salary: x })} keyboardType="decimal-pad" placeholder="0" hint="Counted by the day." /> : null}
      {pay === "renter" ? <T size={13} muted>Save, then set the rent under Chair rental on their page. A renter is not booked through your page and earns no commission.</T> : pay === "owner" ? null : (
        <Row gap={10} style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}><Field label="Service commission %" value={commission} onChangeText={(x) => onChange({ commission: x })} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Retail commission %" value={retail} onChangeText={(x) => onChange({ retail: x })} keyboardType="decimal-pad" /></View>
        </Row>
      )}
    </>
  );
}

// ---------- one person's details ----------

export function DetailsSheet({ p, open, onClose, owner, onSaved }: { p: Data; open: boolean; onClose: () => void; owner: boolean; onSaved: Done }) {
  const s = useSession();
  const start = () => ({ name: String(p.name ?? ""), role: String(p.role ?? "staff"), level: String(p.level ?? "senior"), email: String(p.email ?? ""), phone: String(p.phone ?? ""), tone: String(p.tone ?? "#7A1F2B") });
  const [v, setV] = useState(start);
  const { busy, error, setError, run } = useSave();
  useEffect(() => { if (open) { setV(start()); setError(""); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p.id]);
  const set = (change: Partial<ReturnType<typeof start>>) => setV((x) => ({ ...x, ...change }));
  const lockedOwner = p.role === "owner" && !owner, renter = isRenter(p);

  const save = () => run(async () => {
    if (!v.name.trim()) throw new Error("Give them a name.");
    await s.mapi(`/staff/${p.id}`, { method: "PUT", body: staffBody(p, { name: v.name.trim(), role: v.role, level: v.level, email: v.email.trim(), phone: v.phone.trim(), tone: v.tone }) });
    onSaved("Saved.");
  });

  return (
    <Sheet tall open={open} onClose={onClose} title="Details" footer={<Btn busy={busy} onPress={save}>Save</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      <Field label={renter ? "Name on the roster" : "Name"} value={v.name} onChangeText={(name) => set({ name })} maxLength={60} autoCapitalize="words" />
      {renter ? null : (
        <>
          {lockedOwner ? <T size={13} muted>{first(p.name)} is an owner. Only the owner can change who is an owner.</T>
            : <Options label="Role" options={[["staff", "Team member"], ["manager", "Manager"], ...(owner ? [["owner", "Owner"] as [string, string]] : [])]} value={v.role} onChange={(role) => set({ role })} />}
          <Options label="Level" options={LEVELS} value={v.level} onChange={(level) => set({ level })} />
          <T size={12} muted>The role here is their place on the team. What their sign-in can open is chosen when the owner invites them.</T>
        </>
      )}
      <Field label="Email" value={v.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <Field label="Phone" value={v.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" />
      <TonePick value={v.tone} onChange={(tone) => set({ tone })} />
    </Sheet>
  );
}

// ---------- pay ----------

export function PaySheet({ p, open, onClose, cur, onSaved }: { p: Data; open: boolean; onClose: () => void; cur: string; onSaved: Done }) {
  const s = useSession();
  const start = (): PayV => ({ pay: String(p.pay_type ?? "commission"), hourly: p.hourly_cents ? major(p.hourly_cents) : "", salary: p.salary_cents ? major(p.salary_cents) : "", commission: String(p.commission_pct ?? 0), retail: String(p.retail_commission_pct ?? 0) });
  const [v, setV] = useState(start);
  const { busy, error, setError, run } = useSave();
  useEffect(() => { if (open) { setV(start()); setError(""); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p.id]);

  const save = () => run(async () => {
    const hourly = toCents(v.hourly), salary = toCents(v.salary), com = toPct(v.commission), ret = toPct(v.retail);
    if (hourly === null || salary === null) throw new Error("Enter the pay as an amount, like 22 or 22.50.");
    if (com === null || ret === null) throw new Error("Commission is a percentage between 0 and 100.");
    const change: Record<string, unknown> = v.pay === "renter" ? { pay_type: "renter" } : { pay_type: v.pay, hourly_cents: hourly, salary_cents: salary, commission_pct: com, retail_commission_pct: ret };
    await s.mapi(`/staff/${p.id}`, { method: "PUT", body: staffBody(p, change) });
    onSaved(v.pay === "renter" && !isRenter(p) ? `${first(p.name)} is now a chair renter and is no longer booked through your page. Set the rent below.` : "Pay saved.");
  });

  return (
    <Sheet tall open={open} onClose={onClose} title={`How ${first(p.name)} is paid`} sub="A summary to pay from. LogaLuxe does not send wages." footer={<Btn busy={busy} onPress={save}>Save pay</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      <PayFields {...v} cur={cur} withRenter onChange={(x) => setV((old) => ({ ...old, ...x }))} />
    </Sheet>
  );
}

/** A renter's terms: their business name, the rent, how often, and which days the chair is theirs. */
export function RentTermsSheet({ p, open, onClose, cur, onSaved }: { p: Data; open: boolean; onClose: () => void; cur: string; onSaved: Done }) {
  const s = useSession();
  const [rent, setRent] = useState<Rent>(rentOf(p)), [stop, setStop] = useState("");
  const { busy, error, setError, run } = useSave();
  useEffect(() => { if (open) { setRent(rentOf(p)); setError(""); setStop(""); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p.id]);

  const save = () => run(async () => {
    const cents = toCents(rent.rent);
    if (cents === null) throw new Error("Enter the rent as an amount, like 250.");
    await s.mapi(`/staff/${p.id}`, { method: "PUT", body: staffBody(p, rentBody(rent, cents)) });
    onSaved("Rental terms saved. They apply from the next period's charge.");
  });
  /** Ends the rental: they go back to being paid by the business. */
  const end = (pay: string) => run(async () => {
    if (!(await ask(`Stop renting to ${p.name}?`, "They go back to being paid by the business. Rent already charged stays in the list. Switch on online booking for them afterwards if clients should book them.", "Stop the rental"))) return;
    await s.mapi(`/staff/${p.id}`, { method: "PUT", body: staffBody(p, { pay_type: pay }) });
    onSaved(`${first(p.name)} no longer rents a chair. Check their pay and whether clients can book them.`);
  });

  return (
    <Sheet tall open={open} onClose={onClose} title="Chair rental" sub="LogaLuxe records the rent and does not collect it." footer={<Btn busy={busy} onPress={save}>Save rental terms</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      <RentFields value={rent} onChange={setRent} cur={cur} />
      <View style={{ gap: 8 }}>
        <Label>No longer renting</Label>
        {stop ? (
          <View style={{ gap: 8 }}>
            {(["commission", "hourly", "salary"] as const).map((k) => <Choice key={k} title={{ commission: "Commission only", hourly: "Hourly + commission", salary: "Salary + commission" }[k]} sub={PAY_SUB[k]} on={false} onPress={() => end(k)} />)}
          </View>
        ) : <SmallBtn onPress={() => setStop("1")} style={{ alignSelf: "flex-start" }}>Change them to a paid team member</SmallBtn>}
      </View>
    </Sheet>
  );
}

// ---------- the week and breaks ----------

type DayV = { open: boolean; from: string; to: string; breaks: [string, string][] };

export function HoursSheet({ p, loc, open, onClose, onSaved }: { p: Data; loc: WeekHours | null; open: boolean; onClose: () => void; onSaved: Done }) {
  const s = useSession();
  const start = () => {
    const h = hoursOf(p, loc);
    return Object.fromEntries(DAYS.map((d) => { const x = h[d]; return [d, { open: Array.isArray(x) && x.length === 2, from: x?.[0] ?? "09:00", to: x?.[1] ?? "18:00", breaks: breaksOf(p, d) } as DayV]; })) as Record<Day, DayV>;
  };
  const [follow, setFollow] = useState(!p.hours), [days, setDays] = useState(start);
  const { busy, error, setError, run } = useSave();
  useEffect(() => { if (open) { setFollow(!p.hours); setDays(start()); setError(""); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p.id]);
  const change = (d: Day, patch: Partial<DayV>) => setDays((all) => ({ ...all, [d]: { ...all[d], ...patch } }));
  const who = first(p.name);
  const openLoc = DAYS.filter((d) => Array.isArray(loc?.[d]) && loc![d]!.length === 2);

  const save = () => run(async () => {
    const body: Record<string, unknown> = staffBody(p);
    if (follow) body.use_location_hours = true;
    else body.hours = Object.fromEntries(DAYS.filter((d) => days[d].open).map((d) => [d, [days[d].from, days[d].to]]));
    for (const d of DAYS) {
      if (!follow && days[d].open && days[d].to <= days[d].from) throw new Error(`${DAY_LONG[d]} needs to end after it starts.`);
      for (const b of days[d].breaks) if (b[1] <= b[0]) throw new Error(`A break on ${DAY_LONG[d]} needs to end after it starts.`);
    }
    body.breaks = Object.fromEntries(DAYS.filter((d) => (follow ? openLoc.includes(d) : days[d].open) && days[d].breaks.length).map((d) => [d, days[d].breaks]));
    await s.mapi(`/staff/${p.id}`, { method: "PUT", body });
    onSaved(follow ? "They follow the location hours. Breaks are saved." : "Their week and breaks are saved. They repeat until you change them.");
  });

  return (
    <Sheet tall open={open} onClose={onClose} title={`${who}'s week`} sub="Hours and breaks repeat every week until you change them." footer={<Btn busy={busy} onPress={save}>Save hours</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      <Card style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
        <Row>
          <View style={{ flex: 1 }}>
            <T size={14} weight="semi">Follow the location hours</T>
            <T size={12} muted>{follow ? `${who} works whenever the location is open. Switch this off to give them a week of their own.` : `Switch on the days ${who} works and set the times. A day switched off is a day off.`}</T>
          </View>
          <Sw on={follow} label="Follow the location hours" onPress={() => setFollow(!follow)} />
        </Row>
      </Card>
      {DAYS.map((d) => {
        const v = days[d], lh = loc?.[d], locOpen = Array.isArray(lh) && lh.length === 2;
        const working = follow ? locOpen : v.open;
        return (
          <Card key={d} style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 8 }}>
            <Row style={{ minHeight: 36 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{DAY_LONG[d]}</Text>
                {follow ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{locOpen ? `Location: ${span12(lh)}` : "The location is closed"}</Text> : !v.open ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted2 }}>Day off</Text> : null}
              </View>
              {follow ? null : <Sw on={v.open} label={`${who} works on ${DAY_LONG[d]}`} onPress={() => change(d, { open: !v.open })} />}
            </Row>
            {!follow && v.open ? (
              <>
                <Row between><T size={13} muted>Starts</T><TimeStep value={v.from} label={`${DAY_LONG[d]} start`} onChange={(from) => change(d, { from })} /></Row>
                <Row between><T size={13} muted>Ends</T><TimeStep value={v.to} label={`${DAY_LONG[d]} end`} onChange={(to) => change(d, { to })} /></Row>
              </>
            ) : null}
            {working ? (
              <>
                {v.breaks.map((b, i) => (
                  <View key={i} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8, gap: 6 }}>
                    <Row between>
                      <T size={13} weight="semi">Break {v.breaks.length > 1 ? i + 1 : ""}</T>
                      <SmallBtn onPress={() => change(d, { breaks: v.breaks.filter((_, n) => n !== i) })}>Remove</SmallBtn>
                    </Row>
                    <Row between><T size={13} muted>From</T><TimeStep value={b[0]} label={`${DAY_LONG[d]} break ${i + 1} start`} onChange={(x) => change(d, { breaks: v.breaks.map((y, n) => (n === i ? [x, y[1]] : y)) as [string, string][] })} /></Row>
                    <Row between><T size={13} muted>To</T><TimeStep value={b[1]} label={`${DAY_LONG[d]} break ${i + 1} end`} onChange={(x) => change(d, { breaks: v.breaks.map((y, n) => (n === i ? [y[0], x] : y)) as [string, string][] })} /></Row>
                  </View>
                ))}
                {v.breaks.length < 4 ? <SmallBtn icon="plus" onPress={() => change(d, { breaks: [...v.breaks, ["13:00", "13:30"]] })} style={{ alignSelf: "flex-start" }}>Add a break</SmallBtn> : null}
              </>
            ) : null}
          </Card>
        );
      })}
      <T size={12} muted>Times move a quarter of an hour at a time. Nobody can be booked during a break. Bookings already made are not moved.</T>
    </Sheet>
  );
}

// ---------- what they perform, and their own prices ----------

export function ServicesSheet({ p, open, onClose, cur, onSaved }: { p: Data; open: boolean; onClose: () => void; cur: string; onSaved: Done }) {
  const s = useSession();
  const [menu, setMenu] = useState<Data[] | null>(null), [loadError, setLoadError] = useState("");
  const [on, setOn] = useState<string[]>([]), [price, setPrice] = useState<Record<string, string>>({});
  const { busy, error, setError, run } = useSave();
  const pid = String(p.id);

  const load = () => {
    setMenu(null); setLoadError("");
    s.mapi<Data>("/services").then((out) => {
      const list = ((out.services ?? []) as Data[]).filter((x) => !x.archived);
      setMenu(list);
      setOn(((p.service_ids ?? []) as string[]).filter((id) => list.some((x) => x.id === id)));
      setPrice(Object.fromEntries(list.map((sv) => { const own = ((sv.staff ?? []) as Data[]).find((x) => String(x.staff_id) === pid)?.price_cents; return [String(sv.id), own === null || own === undefined ? "" : major(own)]; })));
    }).catch((e: Error) => setLoadError(e.message));
  };
  useEffect(() => { if (open) { setError(""); load(); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pid]);

  const save = () => run(async () => {
    if (!menu) return;
    const want: Record<string, number | null> = {};
    for (const sv of menu.filter((x) => on.includes(String(x.id)))) {
      const t = (price[String(sv.id)] ?? "").trim();
      const cents = t === "" ? null : toCents(t);
      if (t !== "" && cents === null) throw new Error(`Enter the price for ${sv.name} as an amount, or leave it empty for the menu price.`);
      want[String(sv.id)] = cents;
    }
    await s.mapi(`/staff/${pid}`, { method: "PUT", body: staffBody(p, { service_ids: on }) });
    // A person's own price lives on the service, so each one that changed is saved there.
    const fresh = (((await s.mapi<Data>("/services")).services ?? []) as Data[]);
    for (const sv of fresh) {
      const id = String(sv.id);
      if (!(id in want)) continue;
      const had = ((sv.staff ?? []) as Data[]).find((x) => String(x.staff_id) === pid)?.price_cents ?? null;
      if (had !== want[id]) await s.mapi(`/services/${id}`, { method: "PUT", body: serviceBodyWithPrice(sv, pid, want[id]) });
    }
    onSaved(`Saved. ${first(p.name)} performs ${on.length === menu.length && menu.length ? "every service" : plural(on.length, "service")}.`);
  });

  const cats = [...new Set((menu ?? []).map((x) => String(x.category)))];
  return (
    <Sheet tall open={open} onClose={onClose} title={`What ${first(p.name)} performs`} sub="Leave a price empty to charge the menu price." footer={menu?.length ? <Btn busy={busy} onPress={save}>Save</Btn> : undefined}>
      {error ? <Note kind="bad">{error}</Note> : null}
      {loadError ? <Note kind="bad">{loadError}</Note> : !menu ? <T muted>Loading the menu</T> : !menu.length ? <T muted>No services on the menu yet. Add them under Services and pricing first.</T> : (
        <>
          <Row gap={8}>
            <Chip on={on.length === menu.length} onPress={() => setOn(menu.map((x) => String(x.id)))}>Every service</Chip>
            <Chip on={on.length === 0} onPress={() => setOn([])}>None</Chip>
          </Row>
          {cats.map((cat) => (
            <View key={cat} style={{ gap: 4 }}>
              <Label>{cat}</Label>
              <Card style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
                {menu.filter((x) => x.category === cat).map((sv, i, list) => {
                  const id = String(sv.id), ticked = on.includes(id);
                  return (
                    <View key={id} style={{ borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: c.line, paddingVertical: 4 }}>
                      <Tick on={ticked} onPress={() => setOn(ticked ? on.filter((x) => x !== id) : [...on, id])} title={String(sv.name)} sub={`Menu price ${money(sv.price_cents, cur)}`} />
                      {ticked ? <View style={{ paddingLeft: 36, paddingBottom: 8 }}><Field label={`Price with ${first(p.name)} (${symbol(cur)})`} value={price[id] ?? ""} onChangeText={(x) => setPrice({ ...price, [id]: x })} keyboardType="decimal-pad" placeholder={`Menu price, ${major(sv.price_cents)}`} /></View> : null}
                    </View>
                  );
                })}
              </Card>
            </View>
          ))}
          <T size={12} muted>A person&apos;s own price replaces the menu price, and pricing rules then adjust it. Clients see the final price when they book.</T>
        </>
      )}
    </Sheet>
  );
}

// ---------- time off ----------

/** Adds time off (a manager, approved at once) or asks for it (a team member, for themselves). */
export function TimeOffSheet({ open, onClose, people, staffId, manager, today, onSaved }: { open: boolean; onClose: () => void; people: Data[]; staffId: string; manager: boolean; today: string; onSaved: Done }) {
  const s = useSession();
  const [who, setWho] = useState(staffId), [from, setFrom] = useState(today), [to, setTo] = useState(""), [reason, setReason] = useState("");
  const { busy, error, setError, run } = useSave();
  useEffect(() => { if (open) { setWho(staffId); setFrom(today); setTo(""); setReason(""); setError(""); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, staffId]);

  const save = () => run(async () => {
    if (!who) throw new Error("Choose who it is for.");
    const out = await s.mapi<Data>("/time-off", { body: { staff_id: who, starts_on: from, ends_on: to || from, reason: reason.trim() } });
    onSaved(out.status === "approved" ? "Time off added. They cannot be booked on those days." : "Request sent. A manager will approve or decline it.");
  });

  return (
    <Sheet tall open={open} onClose={onClose} title={manager ? "Add time off" : "Ask for time off"} footer={<Btn busy={busy} onPress={save}>{manager ? "Add time off" : "Send request"}</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      {manager && people.length > 1 ? (
        <View style={{ gap: 6 }}>
          <Label>Who</Label>
          <Row gap={8} wrap>{people.map((x) => <Chip key={x.id} on={who === x.id} onPress={() => setWho(String(x.id))}>{String(x.name)}</Chip>)}</Row>
        </View>
      ) : null}
      <DateField label="First day" value={from} today={today} min={addDays(today, -14)} onChange={(d) => { if (d) { setFrom(d); if (to && to < d) setTo(""); } }} />
      <DateField label="Last day" value={to} today={today} min={from} max={addDays(from, 120)} empty="Same day" clearable onChange={setTo} />
      <Field label="Reason" value={reason} onChangeText={setReason} maxLength={120} placeholder="Holiday, training, family" />
      <T size={12} muted>{manager ? "It is approved at once and those days stop taking bookings. Bookings already made stay where they are: move them from the calendar." : "A manager will approve or decline it. You stay bookable until then."}</T>
    </Sheet>
  );
}

/** Approve, decline or remove time off, with the sentence to show afterwards. */
export function useOffActions(after: (text: string, kind?: "ok" | "bad") => void) {
  const s = useSession();
  const [busy, setBusy] = useState("");
  const act = async (o: Data, decision: "approve" | "decline" | "cancel", reassign = false) => {
    if (decision === "cancel" && !(await ask("Remove this time off?", `Those days become bookable again for ${o.staff}.`, "Remove", true))) return;
    setBusy(String(o.id));
    try {
      const out = await s.mapi<Data>(`/time-off/${o.id}`, { body: reassign ? { decision, reassign: true } : { decision } });
      after(reassign ? reassignedText(out) : decision === "approve" ? "Time off approved." : decision === "decline" ? "Time off declined." : "Time off removed.");
    } catch (e) {
      after((e as Error).message, "bad");
    }
    setBusy("");
  };
  return { busy, act };
}

// ---------- their sign-in ----------

export function InviteSheet({ p, open, onClose, onSaved }: { p: Data; open: boolean; onClose: () => void; onSaved: Done }) {
  const s = useSession();
  const has = !!p.login_email;
  const [email, setEmail] = useState(""), [role, setRole] = useState<"staff" | "manager">("staff");
  const { busy, error, setError, run } = useSave();
  useEffect(() => { if (open) { setEmail(String(p.login_email || p.email || "")); setRole(p.login_role === "manager" ? "manager" : "staff"); setError(""); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p.id]);

  const save = () => run(async () => {
    const to = email.trim().toLowerCase();
    if (!to) throw new Error("Enter the email address to invite.");
    const out = await s.mapi<Data>(`/staff/${p.id}/invite`, { body: { email: to, role } });
    onSaved(invitedText(out, to, role === "manager", has));
  });
  const remove = () => run(async () => {
    if (!(await ask(`Remove the sign-in of ${p.name}?`, "They stay on the roster but can no longer open this business.", "Remove sign-in", true))) return;
    await s.mapi(`/staff/${p.id}/invite`, { method: "DELETE" });
    onSaved("Sign-in removed. They can no longer open this business.");
  });

  return (
    <Sheet tall open={open} onClose={onClose} title={has ? "Their sign-in" : "Invite to sign in"} footer={<Btn busy={busy} onPress={save}>{has ? "Change what they can do" : "Send invite"}</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      {has ? <T size={14}>{first(p.name)} signs in as <Text style={{ fontFamily: f.semi }}>{String(p.login_email)}</Text>.</T>
        : <Field label="Email to invite" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="name@example.com" />}
      <View style={{ gap: 6 }}>
        <Label>What they can do</Label>
        <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
          <Choice title="Team member" sub="Calendar, clients, checkout, inbox" on={role === "staff"} onPress={() => setRole("staff")} />
          <Choice title="Manager" sub="Also the menu, team, stock, marketing and reports" on={role === "manager"} onPress={() => setRole("manager")} />
        </View>
      </View>
      {has ? <Btn kind="danger" disabled={busy} onPress={remove}>Remove sign-in</Btn>
        : <T size={12} muted>They get an email with a link to choose a password. Someone who already has a LogaLuxe account is added without an email.</T>}
    </Sheet>
  );
}
