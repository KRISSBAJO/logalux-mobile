// Step two of booking: check it, say who is coming, answer the business's questions, confirm (design: C5-Confirm).
// The design draws saved cards and a choice of reminders. Cards are never typed into the app (the deposit is
// paid on the provider's own page) and reminders are not something a client can choose today, so the first is
// one honest line in the same box and the second is left out.
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View, type ScrollView } from "react-native";
import { BizMark, Cta, Grp, Head, Icon, Line, LinkText, LockIcon, Opt, Shell, ShieldIcon, Strip, Tile } from "@/components/cb-ui";
import { Card, Field, Note, Row, T } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { bookHref, nice, cancelRule, span, dayLabel, draftOf, inZone, keepDraft, providerOf, REFUSALS, sentence, type Biz, type Booking, type Details, type Question, type Service, type Slot } from "@/lib/cb-lib";
import { duration, firstName, money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { c, f, radius } from "@/lib/theme";

type Props = {
  biz: Biz; services: Service[]; ids: string; mins: number; intake: Question[];
  slot: Slot; staff: string; date: string; src: string;
  onBack: () => void;
  /** The time went to someone else while this client was reading: back to the times, with the API's sentence. */
  onTaken: (why: string) => void;
  /** The business changed its questions since the screen was opened. */
  onStale: () => void;
};

type Promo = { code: string; discount: number; unchecked?: boolean };

export function CbConfirm(p: Props) {
  const { biz, services, slot, intake } = p;
  const s = useSession();
  const me = s.customer;
  const cur = biz.currency;
  const scroll = useRef<ScrollView>(null);
  const at = useRef<Record<string, number>>({});
  const mark = (key: string) => (e: { nativeEvent: { layout: { y: number } } }) => { at.current[key] = e.nativeEvent.layout.y; };
  // A question is measured inside the group of questions, which starts under its heading.
  const show = (key: string) => scroll.current?.scrollTo({ y: Math.max(0, (at.current[key] ?? 0) + (key.startsWith("q-") ? (at.current.questions ?? 0) + 46 : 0) - 16), animated: true });

  // ----- who is booking, who is coming, and their answers -----
  const [d, setD] = useState<Details>(() => draftOf(biz.slug) ?? { first: "", last: "", phone: "", email: "", note: "", who: "me", guest: "", answers: {} });
  // A signed-in client's own details fill any gap, also when they sign in half way through.
  useEffect(() => {
    if (!me) return;
    setD((x) => ({ ...x, first: x.first || String(me.first_name ?? ""), last: x.last || String(me.last_name ?? ""), phone: x.phone || String(me.phone ?? ""), email: x.email || String(me.email ?? "") }));
  }, [me]);
  useEffect(() => { keepDraft(biz.slug, d); }, [d, biz.slug]);
  const [editing, setEditing] = useState(false);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<{ id: string; text: string } | null>(null);
  const guest = d.who === "other" ? d.guest.trim() : "";
  const fullName = `${d.first} ${d.last}`.trim();
  const answerOf = (q: Question) => (d.answers[q.id] ?? "").trim();
  // A box to tick is always required. A choice must be one of the options on offer today.
  const mustAnswer = (q: Question) => q.required || q.kind === "consent";
  const answered = (q: Question) => (q.kind === "consent" ? answerOf(q) === "yes" : q.kind === "yesno" ? ["yes", "no"].includes(answerOf(q)) : q.kind === "choice" ? (q.options ?? []).includes(answerOf(q)) : answerOf(q) !== "");
  const missing = intake.filter((q) => mustAnswer(q) && !answered(q));
  const setAnswer = (id: string, value: string) => { setRefused(null); setD((x) => ({ ...x, answers: { ...x.answers, [id]: value } })); };
  const detailsOk = d.first.trim() !== "" && d.phone.trim() !== "";
  const showFields = !me || editing || !detailsOk;

  // ----- money: the chosen time decides the price, not the menu -----
  const [promo, setPromo] = useState<Promo | null>(null);
  const [code, setCode] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState("");
  const menuTotal = services.reduce((a, x) => a + x.price_cents, 0);
  const list = slot.price_cents;
  const discount = Math.min(list, promo?.discount ?? 0);
  const total = list - discount;
  const deposit = Math.min(total, services.reduce((a, x) => a + x.deposit_cents, 0));
  const atVisit = total - deposit;
  const menuMatches = list === menuTotal;
  const provider = providerOf(biz.market);
  const online = biz.policy.payments_live !== false;
  const firstPct = deposit === 0 ? biz.policy.new_client_deposit_pct ?? 0 : 0;
  const instant = biz.policy.instant !== false;
  const ends = inZone(new Date(new Date(slot.starts_at).getTime() + p.mins * 60_000), biz.tz).time;
  const where = biz.showAddress ? [biz.place.address, biz.place.city].filter(Boolean).join(", ") : "";

  async function applyPromo() {
    const want = code.trim().toUpperCase();
    if (!want || promoBusy) return;
    setPromoBusy(true); setPromoError("");
    try {
      const out = await api<{ discount_cents?: number; promo_error?: string }>("/checkout/check", { body: { scope: "bookings", currency: cur, subtotal_cents: list, promo_code: want, business_slug: biz.slug } });
      const why = String(out.promo_error ?? "");
      if (why && /different business/.test(why)) {
        // A business's own code can only be checked against that business, which happens when the booking is made.
        setPromo({ code: want, discount: 0, unchecked: true }); setCode("");
      } else if (why) setPromoError(sentence(why));
      else if (!out.discount_cents) setPromoError("That code takes nothing off this booking.");
      else { setPromo({ code: want, discount: out.discount_cents }); setCode(""); }
    } catch (e) {
      setPromoError((e as Error).message);
    }
    setPromoBusy(false);
  }

  // ----- confirm -----
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (busy) return;
    setTried(true); setRefused(null); setError("");
    if (!detailsOk || (d.who === "other" && !guest)) { show(!detailsOk ? "details" : "who"); return; }
    if (missing.length > 0) { show(`q-${missing[0].id}`); return; }
    setBusy(true);
    let made: Booking;
    try {
      made = (await s.capi<{ booking: Booking }>("/bookings", {
        body: {
          business_slug: biz.slug, staff_id: slot.staff_id, starts_at: slot.starts_at, service_ids: services.map((x) => x.id), client_name: fullName, client_phone: d.phone.trim(), client_email: d.email.trim(),
          notes: d.note.trim(), promo_code: promo?.code ?? "", source: p.src === "search" ? "search" : "app", guest_name: guest,
          answers: intake.filter(answered).map((q) => ({ question_id: q.id, answer: answerOf(q) })),
        },
      })).booking;
    } catch (e) {
      setBusy(false);
      const err = e as ApiError;
      const said = String(err.body?.error ?? "");
      if (err.status === 409) { p.onTaken(err.message); return; }
      if (err.status === 400 && REFUSALS.some((r) => said.toLowerCase().startsWith(r))) {
        // The API names the question it is not happy with: its words go beside that question.
        const q = intake.find((x) => said.includes(x.label));
        setRefused({ id: q?.id ?? "", text: err.message });
        if (q) show(`q-${q.id}`); else { p.onStale(); show("questions"); }
        return;
      }
      if (err.status === 400 && /promo code/.test(said)) { setPromo(null); setPromoError(err.message); show("promo"); return; }
      setError(err.status === 0 ? "We could not reach LogaLuxe. Nothing was booked. Try again in a moment." : err.message);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
      return;
    }
    keepDraft(biz.slug, null);
    // A deposit paid online: the provider's own page opens. The booking screen then says whether it arrived.
    if (made.payment?.url) {
      try { await WebBrowser.openBrowserAsync(made.payment.url); } catch { /* the next screen has a button to open it again */ }
    }
    router.replace(bookHref(biz.slug, { booking: made.id, services: p.ids, src: p.src }) as never);
  }

  const here = bookHref(biz.slug, { services: p.ids, staff: p.staff, date: p.date, time: slot.time, step: "confirm", src: p.src });
  const cta = deposit > 0 && online ? `Pay ${money(deposit, cur)} deposit and confirm` : instant ? "Confirm booking" : "Send booking request";
  // A question the API named before this screen knew of it is matched by its wording once the questions are reloaded.
  const refusedQ = refused ? intake.find((x) => (refused.id ? x.id === refused.id : refused.text.includes(x.label))) : undefined;
  const problemOf = (q: Question) => refusedQ === q ? refused!.text : tried && missing.includes(q) ? (q.kind === "consent" ? "Tick this box to continue." : q.kind === "text" ? "Answer this question to continue." : "Choose an answer to continue.") : "";
  const noteFor = firstName(slot.staff) || biz.name;

  const footer = (
    <View style={{ gap: 8 }}>
      <Cta busy={busy} onPress={confirm} lead={deposit > 0 && online ? <LockIcon /> : undefined}>{cta}</Cta>
      <T muted size={11} center>By confirming you agree to {biz.name}&apos;s cancellation policy and LogaLuxe&apos;s terms.</T>
    </View>
  );

  return (
    <Shell footer={footer} scrollRef={scroll}>
      <Head title={deposit > 0 && online ? "Confirm and pay" : instant ? "Confirm" : "Send your request"} onBack={p.onBack} />

      <Card style={{ marginTop: 18, padding: 16, gap: 14 }}>
        <Row>
          <BizMark name={biz.name} tone={biz.tone} logoId={biz.logoId} />
          <View style={{ flex: 1 }}>
            <T weight="semi" size={16} numberOfLines={1}>{biz.name}</T>
            <T muted size={13} numberOfLines={2}>{[`with ${slot.staff}`, biz.place.name].filter(Boolean).join(" · ")}</T>
          </View>
          <LinkText onPress={p.onBack} label="Change the person, day or time">Change</LinkText>
        </Row>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Tile label="When" value={`${dayLabel(p.date)} · ${nice(slot.time)}`} />
          <Tile label="Duration" value={`${span(p.mins)} · ends ${nice(ends)}`} />
        </View>
        {where ? <Row gap={8} style={{ alignItems: "flex-start" }}><Icon name="pin" size={16} color={c.muted} /><T muted size={13} style={{ flex: 1 }}>{where}</T></Row> : null}
        <View>
          {services.map((x) => <Line key={x.id} left={x.name} right={services.length === 1 ? money(list, cur) : menuMatches ? money(x.price_cents, cur) : ""} />)}
          {services.length > 1 ? <Line muted left={menuMatches ? "Total" : "Total at this time"} right={money(list, cur)} /> : null}
          {promo && discount > 0 ? <Line muted left={`Promo ${promo.code}`} right={`-${money(discount, cur)}`} /> : null}
          {deposit > 0 ? <Line muted left="Deposit now" right={money(deposit, cur)} /> : null}
          <Line muted left="Pay at the visit" right={money(atVisit, cur)} />
          <Line total left="Due today" right={money(deposit, cur)} />
        </View>
        {!menuMatches && services.length === 1 ? <T muted size={12}>The price for this time{p.staff === "any" ? " and person" : ""}. The menu price is {money(menuTotal, cur)}.</T> : null}
      </Card>

      <View style={{ marginTop: 12, gap: 8 }}>
        <Strip kind="ok" icon={<ShieldIcon />}>{cancelRule(slot.starts_at, biz.policy, deposit, cur, biz.tz)}</Strip>
        {firstPct > 0 ? <Strip kind="gold" icon={<Icon name="info" size={18} color={c.goldInk} />}>If this is your first visit here, a {firstPct}% deposit ({money(Math.round(total * firstPct / 100), cur)}) is asked for when you confirm{online ? `, paid on ${provider}'s secure page` : ""}.</Strip> : null}
        {!instant ? <Strip kind="gold" icon={<Icon name="clock" size={18} color={c.goldInk} />}>{biz.name} confirms each booking itself. Your time is held while you wait to hear back.</Strip> : null}
      </View>

      <View onLayout={mark("details")}>
        <Grp>Your details</Grp>
        {showFields ? (
          <View style={{ gap: 12 }}>
            {me ? null : (
              <Pressable accessibilityRole="link" accessibilityLabel="Sign in to keep this booking in your account" onPress={() => router.push(`/sign-in?next=${encodeURIComponent(here)}` as never)} style={{ minHeight: 44, justifyContent: "center" }}>
                <T muted size={13}>No account needed. <T size={13} weight="semi" color={c.wine}>Sign in</T> to keep this booking in your account.</T>
              </Pressable>
            )}
            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}><Field label="First name" value={d.first} onChangeText={(v) => setD((x) => ({ ...x, first: v }))} autoComplete="given-name" textContentType="givenName" error={tried && !d.first.trim() ? "Add your first name." : undefined} /></View>
              <View style={{ flex: 1 }}><Field label="Last name" value={d.last} onChangeText={(v) => setD((x) => ({ ...x, last: v }))} autoComplete="family-name" textContentType="familyName" /></View>
            </Row>
            <Field label="Mobile number" value={d.phone} onChangeText={(v) => setD((x) => ({ ...x, phone: v }))} keyboardType="phone-pad" autoComplete="tel" placeholder={biz.market === "NG" ? "+234 803 555 0144" : "+1 615 555 0144"}
              error={tried && !d.phone.trim() ? "Add a mobile number so the business can reach you." : undefined} hint={`${biz.name} uses it to reach you about this booking.`} />
            {me ? <T muted size={13}>Changes here are for this booking only. Signed in as {String(me.email ?? "")}.</T> : <Field label="Email (optional)" value={d.email} onChangeText={(v) => setD((x) => ({ ...x, email: v }))} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" hint={deposit > 0 && online ? "For the payment receipt." : undefined} />}
          </View>
        ) : (
          <Card style={{ paddingVertical: 6, paddingLeft: 14, paddingRight: 14 }}>
            <Row>
              <View style={{ flex: 1, paddingVertical: 6 }}>
                <T weight="semi" size={14} numberOfLines={1}>{fullName}</T>
                <T muted size={12} numberOfLines={1}>{[d.phone, String(me?.email ?? "")].filter(Boolean).join(" · ")}</T>
              </View>
              <LinkText onPress={() => setEditing(true)} label="Edit your details">Edit</LinkText>
            </Row>
          </Card>
        )}
      </View>

      <View onLayout={mark("who")}>
        <Grp>This booking is for</Grp>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Opt center title="Me" on={d.who === "me"} onPress={() => setD((x) => ({ ...x, who: "me" }))} style={{ flex: 1 }} />
          <Opt center title="Someone else" on={d.who === "other"} onPress={() => setD((x) => ({ ...x, who: "other" }))} style={{ flex: 1 }} />
        </View>
        {d.who === "other" ? (
          <View style={{ marginTop: 12 }}>
            <Field label="Their name" value={d.guest} maxLength={80} onChangeText={(v) => setD((x) => ({ ...x, guest: v }))} autoComplete="off" error={tried && !guest ? "Add the name of the person who is coming." : undefined} hint={`The contact details above stay yours, so ${biz.name} can reach you.`} />
          </View>
        ) : null}
      </View>

      {intake.length > 0 ? (
        <View onLayout={mark("questions")}>
          <Grp>A few questions from {biz.name}</Grp>
          {refused && !refusedQ ? <View style={{ marginBottom: 12 }}><Note kind="bad">{refused.text}</Note></View> : null}
          <View style={{ gap: 16 }}>
            {intake.map((q) => {
              const a = d.answers[q.id] ?? "";
              const need = mustAnswer(q);
              const problem = problemOf(q);
              const ask = <Text style={{ fontFamily: f.medium, fontSize: 14, lineHeight: 20, color: c.ink }}>{q.label}<Text style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}> · {need ? "required" : "optional"}</Text></Text>;
              const said = problem ? <Text accessibilityRole="alert" style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.bad }}>{problem}</Text> : null;
              if (q.kind === "consent") {
                const on = a === "yes";
                return (
                  <View key={q.id} onLayout={mark(`q-${q.id}`)} style={{ gap: 6 }}>
                    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={q.label} onPress={() => setAnswer(q.id, on ? "" : "yes")} style={{ flexDirection: "row", gap: 12, minHeight: 44, alignItems: "center" }}>
                      <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: problem ? c.bad : c.ink, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center" }}>{on ? <Icon name="check" size={15} color={c.cream} stroke={3} /> : null}</View>
                      <View style={{ flex: 1 }}>{ask}</View>
                    </Pressable>
                    {said}
                  </View>
                );
              }
              if (q.kind === "text") return (
                <View key={q.id} onLayout={mark(`q-${q.id}`)} style={{ gap: 6 }}>
                  {ask}
                  <TextInput accessibilityLabel={q.label} multiline maxLength={1000} value={a} onChangeText={(v) => setAnswer(q.id, v)} placeholderTextColor={c.muted2}
                    style={{ minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: problem ? c.bad : c.line2, backgroundColor: c.white, paddingHorizontal: 14, paddingVertical: 12, fontFamily: f.body, fontSize: 14, color: c.ink, textAlignVertical: "top" }} />
                  {said}
                </View>
              );
              const opts = q.kind === "yesno" ? [["yes", "Yes"], ["no", "No"]] : (q.options ?? []).map((o) => [o, o]);
              return (
                <View key={q.id} onLayout={mark(`q-${q.id}`)} accessibilityRole="radiogroup" accessibilityLabel={q.label} style={{ gap: 8 }}>
                  {ask}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {opts.map(([v, t]) => <Opt key={v} center title={t} on={a === v} onPress={() => setAnswer(q.id, v)} style={{ minWidth: 92, paddingHorizontal: 16, minHeight: 44, paddingVertical: 8 }} />)}
                    {!need && a ? <LinkText onPress={() => setAnswer(q.id, "")} label={`Clear the answer to ${q.label}`}>Clear</LinkText> : null}
                  </View>
                  {said}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {deposit > 0 ? (
        <>
          <Grp>{online ? "Pay with" : "Deposit"}</Grp>
          <Opt radio on title={online ? provider : "Not charged online"} sub={online ? `You pay on ${provider}'s secure page. LogaLuxe never sees your card.` : "Online payment is not switched on for this business yet, so no card is asked for. The deposit is noted on your booking."} />
        </>
      ) : null}

      <View onLayout={mark("promo")}>
        <Grp note="(optional)">Promo code</Grp>
        {promo ? (
          <Card style={{ paddingVertical: 6, paddingHorizontal: 14 }}>
            <Row>
              <View style={{ flex: 1, paddingVertical: 6 }}>
                <T weight="semi" size={14}>{promo.code}</T>
                <T size={12} color={promo.unchecked ? c.muted : c.ok}>{promo.unchecked ? `This is a business's own code. It is checked when you confirm; if ${biz.name} does not accept it, nothing is booked.` : `${money(discount, cur)} off. The total is now ${money(total, cur)}.`}</T>
              </View>
              <LinkText onPress={() => setPromo(null)} label={`Remove the code ${promo.code}`}>Remove</LinkText>
            </Row>
          </Card>
        ) : (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput accessibilityLabel="Promo code" value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setPromoError(""); }} autoCapitalize="characters" autoCorrect={false} autoComplete="off" maxLength={40} onSubmitEditing={applyPromo} returnKeyType="done" placeholderTextColor={c.muted2}
                style={{ flex: 1, minHeight: 52, borderRadius: radius.field, borderWidth: 1, borderColor: promoError ? c.bad : c.line2, backgroundColor: c.white, paddingHorizontal: 14, fontFamily: f.medium, fontSize: 16, letterSpacing: 0.6, color: c.ink }} />
              <Cta kind="out" busy={promoBusy} disabled={!code.trim()} onPress={applyPromo} label="Apply the promo code">Apply</Cta>
            </View>
            {promoError ? <Text accessibilityRole="alert" style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.bad }}>{promoError}</Text> : null}
          </View>
        )}
      </View>

      <Grp note="(optional)">Note for {noteFor}</Grp>
      <TextInput accessibilityLabel={`Note for ${noteFor}`} multiline maxLength={1000} value={d.note} onChangeText={(v) => setD((x) => ({ ...x, note: v }))} placeholder="Hair length, allergies, anything they should know…" placeholderTextColor={c.muted2}
        style={{ minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingHorizontal: 14, paddingVertical: 12, fontFamily: f.body, fontSize: 14, color: c.ink, textAlignVertical: "top" }} />

      {error ? <View style={{ marginTop: 16 }}><Note kind="bad">{error}</Note></View> : null}
    </Shell>
  );
}
