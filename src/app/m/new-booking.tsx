import { useFormReset } from "@/lib/form-reset";
// A booking taken by phone, by message or at the desk (design: M13-NewBooking). The steps the web's
// "New booking" sheet has: who, what, a free time with a person, a note, then POST /m/bookings.
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Group, LinkText, SlotPicker, type Person, type Slot } from "@/components/ma-kit";
import { Avatar, Btn, Card, Chip, Empty, Failed, Field, Icon, IconButton, Loading, Note, Row, Screen, Serif, T } from "@/components/ui";
import { ApiError, qs, type Row as Data } from "@/lib/api";
import { clock, dayShort, duration, initials, money, plural } from "@/lib/format";
import { dayLabel, todayIn, waitForSignIn } from "@/lib/ma-format";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const GUTTER = 24;
type Client = { id: string; name: string; phone: string; sub: string };
type Service = { id: string; name: string; category: string; minutes: number; price: number };
const SOURCES = [["phone", "Phone or message"], ["walk_in", "Walk-in"], ["rebook", "Rebooking"]] as const;

const subOf = (x: Data, tz?: string) => [x.phone || x.email || "No contact saved", Number(x.visits) > 0 ? plural(Number(x.visits), "visit") : "New", x.last_visit ? `last ${dayShort(x.last_visit, tz)}` : ""].filter(Boolean).join(" · ");

export default function NewBooking() {
  const p = useLocalSearchParams<{ date?: string; client?: string; name?: string; phone?: string }>();
  const s = useSession();
  const m = s.merchant;
  const tz: string | undefined = m?.timezone, cur: string = m?.currency ?? "USD";
  const today = todayIn(tz);
  const date0 = /^\d{4}-\d{2}-\d{2}$/.test(p.date ?? "") && p.date! >= today ? p.date! : today;

  const { data, error, loading, reload } = useLoad(async () => {
    if (!s.businessToken) return waitForSignIn();
    const [svc, cal, pre] = await Promise.all([
      s.mapi("/services"), s.mapi("/calendar"),
      p.client ? s.mapi(`/clients/${encodeURIComponent(p.client)}`).catch(() => null) : Promise.resolve(null),
    ]);
    const services: Service[] = ((svc.services ?? []) as Data[]).filter((x) => !x.archived).map((x) => ({ id: x.id, name: x.name, category: x.category ?? "", minutes: Number(x.duration_min) + Number(x.processing_min ?? 0), price: Number(x.price_cents) }));
    const staff: Person[] = ((cal.staff ?? []) as Data[]).map((x) => ({ id: String(x.id), name: String(x.name), bookable: x.bookable !== false }));
    return { services, staff, pre: pre?.client ? (pre.client as Data) : null };
  }, [s.businessToken, p.client]);

  // who
  const [client, setClient] = useState<Client | "walk" | null>(null);
  const [adding, setAdding] = useState(!!p.name);
  const [name, setName] = useState(p.name ?? ""), [phone, setPhone] = useState(p.phone ?? "");
  const [find, setFind] = useState(""), [found, setFound] = useState<Data[] | null>(null), [findError, setFindError] = useState("");
  // what, when and with whom
  const [chosen, setChosen] = useState<string[]>([]);
  const [day, setDay] = useState(date0), [who, setWho] = useState("any"), [slot, setSlot] = useState<Slot | null>(null), [again, setAgain] = useState(0);
  const [source, setSource] = useState<string>(p.client ? "rebook" : "phone");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState("");

  const took = useRef(false);
  useEffect(() => {
    if (data?.pre && !took.current) { took.current = true; setClient({ id: data.pre.id, name: data.pre.name, phone: data.pre.phone ?? "", sub: subOf(data.pre, tz) }); }
  }, [data, tz]);

  useFormReset([find], () => { setFound(null); setFindError(""); });

  // Find a client by name or phone while typing.
  useEffect(() => {
    const q = find.trim();
    if (q.length < 2) return;
    let open = true;
    const timer = setTimeout(() => {
      s.mapi<{ clients?: Data[] }>("/clients" + qs({ q }))
        .then((out) => { if (open) { setFound((out.clients ?? []).slice(0, 6)); setFindError(""); } })
        .catch((e: Error) => { if (open) { setFound([]); setFindError(e.message); } });
    }, 220);
    return () => { open = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find, s.businessToken]);

  const services = useMemo(() => data?.services ?? [], [data]);
  const picked = useMemo(() => services.filter((x) => chosen.includes(x.id)), [services, chosen]);
  const total = picked.reduce((a, x) => a + x.price, 0), mins = picked.reduce((a, x) => a + x.minutes, 0);
  // Pricing rules can make a time or a person dearer: the price of the chosen time is the one that counts.
  const price = slot?.price_cents ?? total;

  const close = () => (router.canGoBack() ? router.back() : router.replace("/business/today"));

  const create = async () => {
    setProblem("");
    const typed = adding && client === null;
    if (client === null && !typed) { setProblem("Choose a client, add a new one, or mark it as a walk-in."); return; }
    if (typed && !name.trim()) { setProblem("Type the new client's name."); return; }
    if (!picked.length) { setProblem("Pick at least one service."); return; }
    if (!slot) { setProblem("Choose a free time."); return; }
    setBusy(true);
    try {
      const out = await s.mapi<{ id: string }>("/bookings", { method: "POST", body: {
        client_id: client && client !== "walk" ? client.id : "", client_name: typed ? name.trim() : "", client_phone: typed ? phone.trim() : "",
        staff_id: slot.staff_id, starts_at: slot.starts_at, service_ids: chosen, notes: notes.trim(), source,
      } });
      router.replace(`/m/booking/${out.id}` as never);
    } catch (e) {
      setProblem((e as Error).message);
      // Someone took the time first: drop it and show what is free now.
      if (e instanceof ApiError && e.status === 409) { setSlot(null); setAgain((n) => n + 1); }
      setBusy(false);
    }
  };

  const head = (
    <Row between style={{ minHeight: 44 }}>
      <Row gap={12} style={{ flex: 1 }}>
        <IconButton icon="close" label="Close" onPress={close} />
        <Serif size={26}>New booking</Serif>
      </Row>
      <T muted size={13}>{dayLabel(day)}</T>
    </Row>
  );

  if (s.ready && !s.businessToken) return <Redirect href={"/sign-in?side=business&next=%2Fm%2Fnew-booking" as never} />;
  if (!data) {
    return (
      <Screen padded={false} style={{ paddingHorizontal: GUTTER }}>
        {head}
        <View style={{ marginTop: 18 }}>{error && !loading ? <Failed error={error} onRetry={reload} /> : <Loading label="Loading your menu" />}</View>
      </Screen>
    );
  }

  const row = (key: string, avatar: ReactNode, title: string, sub: string, onPress: () => void, last: boolean) => (
    <Pressable key={key} accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
      {avatar}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>{sub}</Text>
      </View>
    </Pressable>
  );

  const footer = (
    <View style={{ gap: 10 }}>
      {problem ? <Note kind="bad">{problem}</Note> : null}
      <Row between>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: c.muted }}>{[slot ? dayLabel(day) : "Time not set", picked.length ? duration(mins) : ""].filter(Boolean).join(" · ")}</Text>
          <Text numberOfLines={1} style={{ fontFamily: f.bold, fontSize: 18, color: c.ink }}>{picked.length ? `${slot ? clock(slot.starts_at, tz) + " · " : ""}${money(price, cur)}` : "No services"}</Text>
        </View>
        <Btn busy={busy} onPress={create} style={{ minHeight: 52 }}>Create booking</Btn>
      </Row>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen padded={false} footer={footer} style={{ paddingHorizontal: GUTTER }}>
        {head}

        {/* ----- who ----- */}
        <Group top={18} right={client === null ? <LinkText size={12} onPress={() => { setAdding(!adding); setProblem(""); }} style={{ minHeight: 18 }}>{adding ? "Find a client" : "New client"}</LinkText> : undefined}>Client</Group>
        {client !== null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: c.ink, borderRadius: 16 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.gold, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: f.bold, fontSize: 13, color: c.ink }}>{client === "walk" ? "W" : initials(client.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, color: "#F4ECE3" }}>{client === "walk" ? "Walk-in" : client.name}</Text>
              <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, color: "#C9BCB0" }}>{client === "walk" ? "No details. They are not added to your client list." : client.sub}</Text>
            </View>
            <LinkText color="#C9BCB0" onPress={() => { setClient(null); setFind(""); }}>Change</LinkText>
          </View>
        ) : adding ? (
          <View style={{ gap: 12 }}>
            <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="off" maxLength={80} placeholder="First and last name" />
            <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="off" placeholder={m?.market === "NG" ? "+234 803 555 0100" : "+1 615 555 0100"} hint="With the country code. With a phone number they are saved to your client list." />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.white, borderWidth: 1, borderColor: c.line2, borderRadius: 14, paddingHorizontal: 14, minHeight: 50 }}>
              <Icon name="search" size={18} />
              <TextInput accessibilityLabel="Find a client by name or phone" value={find} onChangeText={setFind} placeholder="Name or phone" placeholderTextColor={c.muted2} autoCorrect={false} autoCapitalize="words"
                style={{ flex: 1, minWidth: 0, minHeight: 48, fontFamily: f.body, fontSize: 15, color: c.ink }} />
            </View>
            {findError ? <T size={13} color={c.bad} style={{ marginTop: 6 }}>{findError}</T> : null}
            <Card style={{ marginTop: 8, borderRadius: 18, overflow: "hidden" }}>
              {(found ?? []).map((x) => row(x.id, <Avatar name={x.name} size={40} />, x.name, subOf(x, tz), () => { setClient({ id: x.id, name: x.name, phone: x.phone ?? "", sub: subOf(x, tz) }); setFound(null); }, false))}
              {found && found.length === 0 && !findError ? (
                <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: c.line }}>
                  <T muted size={13}>{`Nobody in your client list matches "${find.trim()}".`}</T>
                  <LinkText onPress={() => { setAdding(true); if (/^[+\d][\d\s()-]+$/.test(find.trim())) setPhone(find.trim()); else setName(find.trim()); }} style={{ minHeight: 32 }}>Add them as a new client</LinkText>
                </View>
              ) : null}
              {row("walk", <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.line2, alignItems: "center", justifyContent: "center" }}><Icon name="plus" size={16} /></View>, "Walk-in, no details", "Booked under the name Walk-in", () => { setClient("walk"); setSource("walk_in"); }, true)}
            </Card>
          </>
        )}

        {/* ----- what ----- */}
        <Group top={18} right={picked.length ? `${money(total, cur)} · ${duration(mins)}` : "Pick at least one"}>Services</Group>
        {services.length === 0 ? (
          <Empty title="Your menu is empty">Add a service first. Bookings are made from the services on your menu.</Empty>
        ) : (
          <Card style={{ borderRadius: 18, overflow: "hidden" }}>
            {services.map((x, i) => {
              const on = chosen.includes(x.id);
              return (
                <Pressable key={x.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${x.name}, ${duration(x.minutes)}, ${money(x.price, cur)}`}
                  onPress={() => setChosen((was) => (was.includes(x.id) ? was.filter((k) => k !== x.id) : [...was, x.id]))}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: i === services.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.ink, backgroundColor: on ? c.ink : "transparent", alignItems: "center", justifyContent: "center" }}>
                    {on ? <Icon name="check" size={12} color={c.cream} stroke={3} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{x.name}</Text>
                    <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>{[duration(x.minutes), x.category].filter(Boolean).join(" · ")}</Text>
                  </View>
                  <Text style={{ fontFamily: f.bold, fontSize: 14, color: c.ink }}>{money(x.price, cur)}</Text>
                </Pressable>
              );
            })}
          </Card>
        )}

        {/* ----- when, and with whom ----- */}
        <Group top={18} right={slot && slot.price_cents !== undefined && slot.price_cents !== total ? `${money(slot.price_cents, cur)} at this time` : undefined}>Time</Group>
        <SlotPicker mapi={s.mapi} tz={tz} currency={cur} staff={data.staff} serviceIds={chosen} day={day} onDay={setDay} who={who} onWho={setWho} value={slot} onPick={setSlot} again={again} />

        <Group top={18}>Booked by</Group>
        <Row gap={8} wrap>
          {SOURCES.map(([id, label]) => <Chip key={id} on={source === id} onPress={() => setSource(id)}>{label}</Chip>)}
        </Row>

        <View style={{ marginTop: 18 }}>
          <Field label="Note (optional)" value={notes} onChangeText={setNotes} multiline maxLength={500} placeholder="Anything the stylist should know" />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
