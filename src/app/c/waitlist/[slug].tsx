import { useFormReset } from "../../../lib/form-reset";
// Joining a business's waitlist for days that are full (design: C10-Waitlist).
// Opened as /c/waitlist/<slug>?services=<ids>&staff=<id>&date=<YYYY-MM-DD>.
// The design promises a WhatsApp message and a slot held for 15 minutes. Neither exists: the business sees the
// list and gets in touch itself, so that is what the screen says. Nothing is sent by itself when a time opens,
// with any feature on. While texts to clients are live the business can text from its inbox, and only then,
// for a number with a country code, does the screen say so. There is no call to leave the list either,
// so that button is left out.
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type ScrollView } from "react-native";
import { BizMark, Cta, Grp, Head, Icon, Shell } from "@/components/cb-ui";
import { Btn, Card, Empty, Failed, Field, Loading, Note, T } from "@/components/ui";
import { api } from "@/lib/api";
import { chosenFrom, useBiz } from "@/lib/cb-biz";
import { addDays, bookHref, dayLabel, DOW_KEYS, dowShort, isDate, mondayOf, one, weekdayOf, whenLabel, type Slot } from "@/lib/cb-lib";
import { duration, firstName, money, ymd } from "@/lib/format";
import { useFeatures } from "@/lib/mp-features";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

const WHEN = ["Morning", "Afternoon", "Any time"];
const MOST = 7; // as many days as one request may name

export default function Waitlist() {
  const p = useLocalSearchParams<{ slug: string; services?: string; staff?: string; date?: string }>();
  const slug = one(p.slug);
  const s = useSession();
  const ft = useFeatures();
  const q = useBiz(slug);
  const scroll = useRef<ScrollView>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/c/b/${slug}` as never));

  const data = q.data;
  const biz = data?.biz;
  const chosen = useMemo(() => (data ? chosenFrom(data.services, one(p.services), data.biz.policy.multi_service !== false) : []), [data, p.services]);
  const ids = chosen.map((x) => x.id).join(",");
  const pro = data?.staff.find((x) => x.id === one(p.staff));
  const today = biz ? ymd(new Date(), biz.tz) : "";
  const lastDay = biz ? addDays(today, biz.policy.max_days ?? 60) : "";
  const asked = isDate(one(p.date)) && one(p.date) >= today && one(p.date) <= lastDay ? one(p.date) : "";

  const [picked, setPicked] = useState<string[]>([]);
  const [when, setWhen] = useState("Any time");
  const [name, setName] = useState(""), [phone, setPhone] = useState("");
  const [tried, setTried] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [joined, setJoined] = useState<{ place: number; next: Slot[] } | null>(null);
  // The day they came from is the one they wanted.
  const hours = biz?.place.hours;
  const closed = (d: string) => d > lastDay || (!!hours && !hours[DOW_KEYS[weekdayOf(d)]]);
  useFormReset([asked, hours], () => { if (asked && !closed(asked)) setPicked((x) => (x.length ? x : [asked]));   });
  useFormReset([s.customer], () => {
    if (!s.customer) return;
    setName((x) => x || `${s.customer!.first_name ?? ""} ${s.customer!.last_name ?? ""}`.trim());
    setPhone((x) => x || String(s.customer!.phone ?? ""));
  });

  if (!data || !biz) {
    return <Shell side={24}><Head title="Join the waitlist" onBack={back} /><View style={{ marginTop: 18 }}>{q.loading ? <Loading /> : <Failed error={q.error || "We could not load this business."} onRetry={q.reload} />}</View></Shell>;
  }
  if (!data.live || biz.policy.waitlist === false) {
    return <Shell side={24}><Head title="Join the waitlist" onBack={back} /><View style={{ marginTop: 18 }}><Empty title={`${biz.name} does not keep a waitlist`} action={<Btn small onPress={back}>Back to the times</Btn>}>Pick another day, or message the business to ask about a time.</Empty></View></Shell>;
  }

  // Two weeks of days, starting with the week of the day they wanted. A day the business is closed cannot be picked.
  const from = asked && mondayOf(asked) > today ? mondayOf(asked) : today;
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i));
  const toggle = (d: string) => { setError(""); setPicked((x) => (x.includes(d) ? x.filter((v) => v !== d) : x.length >= MOST ? x : [...x, d].sort())); };
  const what = chosen.length ? chosen.map((x) => x.name).join(" + ") : "A visit";
  const mins = chosen.reduce((a, x) => a + x.duration_min + x.processing_min, 0);
  const price = chosen.reduce((a, x) => a + x.price_cents, 0);
  const summary = `${picked.map(dayLabel).join(", ")}${when === "Any time" ? "" : `, ${when.toLowerCase()}s`}`;

  async function join() {
    setTried(true); setError("");
    if (picked.length === 0) { setError("Pick at least one day."); scroll.current?.scrollTo({ y: 0, animated: true }); return; }
    if (!name.trim() || !phone.trim()) return;
    setBusy(true);
    try {
      const out = await api<{ position?: number }>("/waitlist", { body: { business_slug: slug, client_name: name.trim().slice(0, 200), client_phone: phone.trim().slice(0, 200), dates: picked, time_of_day: when } });
      // What is free soonest, in case another day would do. Not being able to load it changes nothing.
      let next: Slot[] = [];
      if (ids) { try { next = (await api<{ slots?: Slot[] }>(`/businesses/${encodeURIComponent(slug)}/openings?services=${ids}&staff=${pro ? pro.id : "any"}&limit=1`)).slots ?? []; } catch { /* nothing to offer */ } }
      // The API counts every request waiting at this business, one for each day asked for, these included.
      setJoined({ place: Math.max(1, Number(out.position ?? 0) - (picked.length - 1)), next });
      scroll.current?.scrollTo({ y: 0, animated: false });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const how = (n: string, title: string, text: string, last?: boolean, tone?: "ok") => (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tone ? c.okBg : c.goldBg, alignItems: "center", justifyContent: "center" }}>
        {n === "check" ? <Icon name="check" size={15} color={c.ok} stroke={2.6} /> : n === "next" ? <Icon name="next" size={15} color={c.goldInk} stroke={2.4} /> : <Text style={{ fontFamily: f.bold, fontSize: 13, color: c.goldInk }}>{n}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{title}</Text>
        <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: c.muted }}>{text}</Text>
      </View>
    </View>
  );

  if (joined) {
    const first = joined.next[0];
    return (
      <Shell side={24} footer={<Cta onPress={back}>Done</Cta>}>
        <Head title="You're on the list" onBack={back} />
        <View accessibilityRole="alert" style={{ marginTop: 18, backgroundColor: c.ink, borderRadius: 22, padding: 22, alignItems: "center" }}>
          <Text style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.72, textTransform: "uppercase", color: "#C9BCB0" }}>Your place</Text>
          <Text style={{ fontFamily: f.serif, fontSize: 64, lineHeight: 70, color: "#F4ECE3" }}>#{joined.place}</Text>
          <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: "#C9BCB0", marginTop: 6, textAlign: "center" }}>on {biz.name}&apos;s list for {summary}</Text>
        </View>
        <View style={{ marginTop: 14, backgroundColor: c.goldBg, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Icon name="chat" size={22} color={c.goldInk} />
          <Text style={{ flex: 1, fontFamily: f.body, fontSize: 13, lineHeight: 19, color: c.goldInk }}>{biz.name} can see you are waiting and will get in touch on {phone.trim()} if a time opens.{ft.sms_messages && phone.trim().startsWith("+") ? " It can text you at that number." : ""} Nothing is booked and nothing is charged until you take a time.</Text>
        </View>
        <Grp style={{ marginTop: 20 }}>Meanwhile</Grp>
        <Card style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
          {first ? (
            <Pressable accessibilityRole="link" onPress={() => router.replace(bookHref(slug, { services: ids, staff: pro ? pro.id : "any", date: first.starts_at.slice(0, 10), time: first.time }) as never)}>
              {how("check", `Book ${pro ? firstName(pro.name) : biz.name} on another day`, `The next free time is ${whenLabel(first.starts_at, biz.tz, " at ")}.`, false, "ok")}
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="link" onPress={() => router.push("/client/search")}>
            {how("next", "Look at other businesses", "Search LogaLuxe for someone with a free time on the day you want.", true)}
          </Pressable>
        </Card>
      </Shell>
    );
  }

  const footer = (
    <View>
      <Cta busy={busy} onPress={join}>Join the waitlist</Cta>
      <T muted size={11} center style={{ marginTop: 8 }}>Free. Nothing is booked or charged.</T>
    </View>
  );
  return (
    <Shell side={24} footer={footer} scrollRef={scroll}>
      <Head title="Join the waitlist" onBack={back} />
      {error ? <View style={{ marginTop: 14 }}><Note kind="bad">{error}</Note></View> : null}

      <Card style={{ marginTop: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <BizMark name={biz.name} tone={biz.tone} logoId={biz.logoId} />
        <View style={{ flex: 1 }}>
          <T weight="semi" size={15}>{what}{pro ? ` with ${firstName(pro.name)}` : ""}</T>
          <T muted size={13} style={{ marginTop: 2 }}>{[chosen.length ? duration(mins) : "", chosen.length ? money(price, biz.currency) : "", biz.name].filter(Boolean).join(" · ")}</T>
        </View>
      </Card>

      <Grp style={{ marginTop: 20 }}>Which days work?</Grp>
      <View style={{ gap: 6 }}>
        {[days.slice(0, 7), days.slice(7)].map((row) => (
          <View key={row[0]} style={{ flexDirection: "row", gap: 6 }}>
            {row.map((d) => {
              const on = picked.includes(d), off = closed(d);
              return (
                <Pressable key={d} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: off }} accessibilityLabel={`${dayLabel(d)}${off ? ", closed" : ""}`} disabled={off} onPress={() => toggle(d)}
                  style={({ pressed }) => ({ flex: 1, minHeight: 58, borderRadius: 14, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, paddingVertical: 8, alignItems: "center", gap: 3, opacity: off ? 0.35 : pressed ? 0.85 : 1 })}>
                  <Text style={{ fontFamily: f.body, fontSize: 11, color: on ? "#C9BCB0" : c.muted }}>{dowShort(d)}</Text>
                  <Text style={{ fontFamily: f.semi, fontSize: 16, lineHeight: 20, color: on ? c.cream : c.ink }}>{Number(d.slice(8))}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <T muted size={12} style={{ marginTop: 8 }}>Pick up to {MOST}. Faded days are closed{days[13] > lastDay ? " or too far ahead" : ""}.</T>

      <Grp style={{ marginTop: 20 }}>Time of day</Grp>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 8 }}>
        {WHEN.map((w) => {
          const on = when === w;
          return (
            <Pressable key={w} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setWhen(w)}
              style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ fontFamily: f.semi, fontSize: 14, color: on ? c.cream : c.ink }}>{w}</Text>
            </Pressable>
          );
        })}
      </View>

      <Grp style={{ marginTop: 20 }}>How to reach you</Grp>
      <View style={{ gap: 12 }}>
        <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={tried && !name.trim() ? "Add your name." : undefined} />
        <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder={biz.market === "NG" ? "+234 803 555 0144" : "+1 615 555 0144"} error={tried && !phone.trim() ? "Add a mobile number so the business can reach you." : undefined} />
      </View>

      <Grp style={{ marginTop: 20 }}>How it works</Grp>
      <Card style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
        {how("1", "A time opens", `Someone cancels or ${biz.name} adds hours.`)}
        {how("2", `${biz.name} gets in touch`, "It sees everyone who is waiting for that day and contacts you on the number above.")}
        {how("3", "You decide", "Nothing is booked and nothing is charged until you take the time.", true)}
      </Card>
    </Shell>
  );
}
