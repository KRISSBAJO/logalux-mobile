// Booking a visit: choose a time, confirm (and pay the deposit on the provider's page), and the confirmation.
// Opened as /c/book/<slug>?services=<ids>&staff=<id|any>&date=<YYYY-MM-DD>&time=<HH:MM>&src=<search|…>.
// What has been chosen lives in the address, so a reload (or signing in half way) comes back to the same place.
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BackHandler, View } from "react-native";
import { CbBooked } from "@/components/cb-booked";
import { CbConfirm } from "@/components/cb-confirm";
import { CbTime, type Times } from "@/components/cb-time";
import { Head, Shell } from "@/components/cb-ui";
import { Btn, Empty, Failed, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { chosenFrom, useBiz, type Loaded } from "@/lib/cb-biz";
import { addDays, dayLabel, isDate, isTime, one, type Pro, type Slot } from "@/lib/cb-lib";
import { initials, money, ymd } from "@/lib/format";
import { useLoad } from "@/lib/use-load";

type Params = { slug: string; services?: string; staff?: string; date?: string; time?: string; step?: string; src?: string; booking?: string };

const leave = (slug: string) => (router.canGoBack() ? router.back() : router.replace(`/c/b/${slug}` as never));

export default function Book() {
  const p = useLocalSearchParams<Params>();
  const slug = one(p.slug);
  const q = useBiz(slug);

  if (!q.data) {
    return (
      <Shell>
        <Head title="Book" onBack={() => leave(slug)} />
        <View style={{ marginTop: 18 }}>{q.loading ? <Loading /> : <Failed error={q.error || "We could not load this business."} onRetry={q.reload} />}</View>
      </Shell>
    );
  }
  if (one(p.booking)) return <CbBooked biz={q.data.biz} id={one(p.booking)} ids={one(p.services)} src={one(p.src)} />;
  return <Flow data={q.data} reloadBiz={q.refresh} />;
}

function Flow({ data, reloadBiz }: { data: Loaded; reloadBiz: () => void }) {
  const p = useLocalSearchParams<Params>();
  const { biz } = data;
  const slug = biz.slug;
  const src = one(p.src);

  // ----- the services being booked -----
  const chosen = useMemo(() => chosenFrom(data.services, one(p.services), biz.policy.multi_service !== false), [data.services, p.services, biz.policy.multi_service]);
  const ids = chosen.map((x) => x.id).join(",");
  const mins = chosen.reduce((a, x) => a + x.duration_min + x.processing_min, 0);
  const today = ymd(new Date(), biz.tz);
  const lastDay = addDays(today, biz.policy.max_days ?? 60);

  // ----- who can do them -----
  // Only people who perform every chosen service are offered. Each is asked for their next free times,
  // which also gives the price they charge. Someone with nothing free in the coming weeks is left out
  // while "anyone" is on offer; otherwise everyone is shown and the calendar speaks.
  const anyone = biz.policy.anyone !== false;
  const pros = useLoad<Pro[]>(async () => {
    if (!ids || !data.live || (!data.showStaff && anyone)) return [];
    const able = data.staff.filter((x) => !x.service_ids || chosen.every((s) => x.service_ids!.includes(s.id)));
    const probes = await Promise.all(able.map(async (x) => {
      try { return { x, slots: (await api<{ slots?: Slot[] }>(`/businesses/${encodeURIComponent(slug)}/openings?services=${ids}&staff=${x.id}&limit=6`)).slots ?? [] }; } catch { return { x, slots: [] as Slot[] }; }
    }));
    const withTimes = probes.filter((v) => v.slots.length > 0);
    const offered = withTimes.length > 0 ? withTimes : anyone ? [] : probes;
    return offered.map(({ x, slots }) => {
      const prices = slots.map((v) => v.price_cents);
      const lo = prices.length ? Math.min(...prices) : 0, hi = prices.length ? Math.max(...prices) : 0;
      const role = x.role === "owner" ? "Owner" : x.level ? x.level[0].toUpperCase() + x.level.slice(1) : "";
      return { id: x.id, name: x.name, initials: x.initials || initials(x.name), tone: x.tone || biz.tone, sub: [role, Number(x.rating) ? Number(x.rating).toFixed(1) : "", prices.length ? (lo === hi ? money(lo, biz.currency) : `from ${money(lo, biz.currency)}`) : ""].filter(Boolean).join(" · ") };
    });
  }, [slug, ids, data.live]);

  // ----- what has been chosen, read from the address -----
  const list = pros.data ?? [];
  const staffRaw = one(p.staff);
  const staff = staffRaw === "any" && anyone ? "any" : list.some((x) => x.id === staffRaw) ? staffRaw : anyone || !list[0] ? "any" : list[0].id;
  const dateRaw = one(p.date);
  const date = isDate(dateRaw) && dateRaw >= today && dateRaw <= lastDay ? dateRaw : "";
  const time = date && isTime(one(p.time)) ? one(p.time) : "";
  const set = useCallback((next: { staff?: string; date?: string; time?: string | null; step?: string | null }) => {
    const o: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(next)) o[k] = v === null ? undefined : v;
    router.setParams(o);
  }, []);

  // ----- the free times of the chosen day -----
  const [reload, setReload] = useState(0);
  const ready = !!pros.data && !!ids && data.live;
  const key = `${ids}|${staff}|${date}|${reload}`;
  const [avail, setAvail] = useState<{ key: string; slots: Slot[]; failed: boolean } | null>(null);
  useEffect(() => {
    if (!ready || !date) return;
    let live = true;
    api<{ slots?: Slot[] }>(`/businesses/${encodeURIComponent(slug)}/availability?date=${date}&services=${ids}&staff=${staff}`)
      .then((j) => { if (live) setAvail({ key, slots: j.slots ?? [], failed: false }); })
      .catch(() => { if (live) setAvail({ key, slots: [], failed: true }); });
    return () => { live = false; };
  }, [ready, slug, ids, staff, date, key]);
  const times: Times = useMemo(() => {
    if (!date || avail?.key !== key) return { ready: false, failed: false, slots: [] };
    // With "anyone", the same time can be free with several people: each time is offered once, at its lowest price.
    const by = new Map<string, Slot>();
    for (const s of avail.slots) { const had = by.get(s.time); if (!had || s.price_cents < had.price_cents) by.set(s.time, s); }
    return { ready: true, failed: avail.failed, slots: [...by.values()].sort((a, b) => a.time.localeCompare(b.time)) };
  }, [avail, key, date]);
  const slot = time && times.ready ? times.slots.find((s) => s.time === time) ?? null : null;

  const [notice, setNotice] = useState("");
  // A time in the address that is no longer free (an old link, or someone else took it).
  useEffect(() => {
    if (times.ready && !times.failed && time && !slot) {
      setNotice(`${time} on ${dayLabel(date)} is no longer free. Choose another time.`);
      set({ time: null, step: null });
    }
  }, [times, time, slot, date, set]);

  const step = one(p.step) === "confirm" && time ? "confirm" : "time";
  // The phone's own back button steps back inside the flow before it leaves it.
  useEffect(() => {
    if (step !== "confirm") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { set({ step: null }); return true; });
    return () => sub.remove();
  }, [step, set]);

  const back = () => leave(slug);
  const shell = (body: ReactNode) => <Shell><Head title="Choose a time" onBack={back} /><View style={{ marginTop: 18 }}>{body}</View></Shell>;
  if (!data.live) return shell(<Empty title={`${biz.name} is not taking bookings yet`}>Its page is still being set up. Once it is live, its free times will show here.</Empty>);
  if (chosen.length === 0) return shell(<Empty title="Choose a service first" action={<Btn small onPress={() => router.replace(`/c/b/${slug}` as never)}>See the services</Btn>}>Pick what you would like done on {biz.name}&apos;s page, then choose a time.</Empty>);
  if (!pros.data) return shell(pros.loading ? <Loading /> : <Failed error={pros.error || "We could not load who is available."} onRetry={pros.reload} />);

  const summary = chosen.map((x) => x.name).join(" + ");
  if (step === "confirm") {
    if (!slot) return <Shell><Head title="Confirm" onBack={() => set({ step: null })} /><View style={{ marginTop: 18 }}>{times.ready && times.failed ? <Failed error="We could not check that the time is still free." onRetry={() => setReload((n) => n + 1)} /> : <Loading label={`Checking that ${time} is still free`} />}</View></Shell>;
    const intake = data.intake.filter((x) => !x.service_id || chosen.some((s) => s.id === x.service_id)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    return (
      <CbConfirm biz={biz} services={chosen} ids={ids} mins={mins} intake={intake} slot={slot} staff={staff} date={date} src={src}
        onBack={() => set({ step: null })}
        onTaken={(why) => { setNotice(why); set({ time: null, step: null }); setReload((n) => n + 1); }}
        onStale={reloadBiz} />
    );
  }
  return (
    <CbTime biz={biz} ids={ids} mins={mins} summary={summary} pros={list} anyone={anyone} staff={staff} date={date} time={time} today={today} lastDay={lastDay}
      times={times} slot={slot} notice={notice} reload={reload}
      onRetry={() => setReload((n) => n + 1)}
      onPick={(next) => { setNotice(""); set(next); }}
      onContinue={() => set({ step: "confirm" })}
      onBack={back}
      onWaitlist={() => router.push(`/c/waitlist/${slug}?services=${ids}${staff !== "any" ? `&staff=${staff}` : ""}${date ? `&date=${date}` : ""}` as never)} />
  );
}
