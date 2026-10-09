import { useFormReset } from "../../../lib/form-reset";
// One person on the team: who they are, this week, whether clients can book them, what they perform and at
// what price, their week and breaks, time off, pay, rental terms, what their sign-in may do, and leaving the team.
// A manager or the owner changes it; a team member reads their own page and can ask for time off.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { Grp, Header, Item, SetRow, SmallBtn, Sw, Tag, Val, Wait } from "@/components/mc-kit";
import { AskCard, Face, Minis, OffCard, first, roleLine } from "@/components/me-kit";
import { DetailsSheet, HoursSheet, InviteSheet, PaySheet, RentTermsSheet, ServicesSheet, TimeOffSheet, useOffActions } from "@/components/me-sheets";
import { Btn, Card, Empty, Failed, Icon, Note, Row, Screen, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { money } from "@/lib/format";
import { DAY_LONG, ask, dateOnly, soft } from "@/lib/mc-util";
import { tel } from "@/lib/ma-format";
import { monthYear } from "@/lib/mb-util";
import { DAYS, PAY, PERMS, ROLE, breaksOf, dur, isRenter, owed, pattern, pct, rentDays, rostered, shiftOf, span12, staffBody, stateOf, useTeam } from "@/lib/me-staff";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type SheetName = "" | "details" | "pay" | "rent" | "hours" | "services" | "off" | "invite";
const SHEETS = ["details", "pay", "rent", "hours", "services", "off", "invite"];

export default function Person() {
  const q = useLocalSearchParams<{ id: string; open?: string; added?: string }>();
  const id = String(q.id ?? "");
  const { data, error, refreshing, refresh, reload, s, tz, today, monday, cur, manager, owner, mine } = useTeam();
  // Their own prices live on the menu; their pay for the month so far is the manager's to see.
  const extra = useLoad(async () => {
    if (!s.businessToken) return null;
    const [menu, pay] = await Promise.all([soft(() => s.mapi<Data>("/services")), manager ? soft(() => s.mapi<Data>("/payroll")) : Promise.resolve(null)]);
    return { menu: menu.data, pay: pay?.data ?? null };
  }, [s.businessToken, id, manager]);

  const [sheet, setSheet] = useState<SheetName>("");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(q.added ? { kind: "ok", text: "Added. Set their hours, what they perform and how they are paid below." } : null);
  const [busy, setBusy] = useState("");
  const done = (text: string) => { setSheet(""); setNote({ kind: "ok", text }); void refresh(); void extra.refresh(); };
  const off = useOffActions((text, kind = "ok") => { setNote({ kind, text }); void refresh(); void s.refresh(); });

  const p = data?.staff.find((x) => x.id === id);
  const self = !!mine && mine === id;
  const mayEdit = manager && !!p && !p.archived;
  // A link can ask for one of the forms to be open on arrival, for example from the roster.
  const wanted = SHEETS.includes(String(q.open)) ? (String(q.open) as SheetName) : "";
  useFormReset([wanted, mayEdit], () => { if (wanted && mayEdit) setSheet(wanted);  
  });

  if (!data || !p) {
    return (
      <Screen>
        <Header title="Team member" onBack={() => (router.canGoBack() ? router.back() : router.replace("/m/staff" as never))} />
        {error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View>
          : data ? <View style={{ marginTop: 16 }}><Empty title="This person is not on your team" action={<Btn small onPress={() => router.replace("/m/staff" as never)} style={{ marginTop: 4 }}>See the team</Btn>}>They may have been added to another business, or the link is old.</Empty></View>
          : <Wait />}
      </Screen>
    );
  }

  const renter = isRenter(p);
  const [label, kind] = stateOf(p, data, today);
  const loc = data.location_hours;
  const roster = rostered(p, data, monday);
  const services = data.services, does = services.filter((sv) => ((p.service_ids ?? []) as string[]).includes(String(sv.id)));
  const menu = ((extra.data?.menu?.services ?? []) as Data[]);
  const ownPrice = (svId: string) => ((menu.find((x) => x.id === svId)?.staff ?? []) as Data[]).find((x) => String(x.staff_id) === id)?.price_cents as number | null | undefined;
  const menuPrice = (svId: string) => menu.find((x) => x.id === svId)?.price_cents as number | undefined;
  const timeOff = data.time_off.filter((o) => o.staff_id === id);
  const pay = extra.data?.pay, payRow = ((pay?.payroll ?? []) as Data[]).find((x) => x.id === id);
  const full = p.login_role === "manager" || p.login_role === "owner";
  const perms = (p.permissions ?? {}) as Record<string, boolean>;
  const permOn = (k: string) => full || (perms[k] ?? data.permission_defaults[k] ?? false);
  const rating = Number(p.rating);

  /** Saves one change to the person and reads the team again. */
  const put = async (tag: string, change: Record<string, unknown>, text: string) => {
    setBusy(tag); setNote(null);
    try {
      await s.mapi(`/staff/${id}`, { method: "PUT", body: staffBody(p, change) });
      setNote({ kind: "ok", text });
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };
  const action = async (act: "archive" | "restore") => {
    if (act === "archive" && !(await ask(`Remove ${p.name} from the team?`, "Their history is kept and their sign-in stops working here. This is refused while they have upcoming bookings.", "Remove", true))) return;
    setBusy(act); setNote(null);
    try {
      await s.mapi(`/staff/${id}/action`, { body: { action: act } });
      setNote({ kind: "ok", text: act === "archive" ? "Removed from the team. Their past bookings and sales are kept, and their sign-in no longer opens this business." : "Back on the team and taking bookings." });
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  return (
    <Screen onRefresh={() => { void refresh(); void extra.refresh(); }} refreshing={refreshing}>
      <Header title={self ? "You" : "Team member"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/m/staff" as never))}
        right={mayEdit ? <SmallBtn onPress={() => setSheet("details")}>Edit</SmallBtn> : undefined} />

      {/* Who they are */}
      <Card style={{ padding: 16, marginTop: 14, gap: 14 }}>
        <Row gap={14} style={{ alignItems: "flex-start" }}>
          <Face p={p} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 24, lineHeight: 28, color: c.ink }}>{String(p.name)}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.muted }}>{renter ? `Chair renter${p.trading_name ? ` · ${p.trading_name}` : ""}` : roleLine(p)} · since {monthYear(String(p.created_at), tz)}</Text>
            <Row gap={6} wrap style={{ marginTop: 8 }}>
              <Tag kind={kind}>{label}</Tag>
              {rating > 0 ? <Tag kind="gold">{rating.toFixed(1)} rating</Tag> : !renter && !p.archived ? <Tag>No rating yet</Tag> : null}
              {p.hours && !renter ? <Tag>Own hours</Tag> : null}
            </Row>
          </View>
        </Row>
        <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.muted, marginBottom: -6 }}>{renter ? "The rental" : "This week"}</Text>
        {!renter ? (
          <Minis items={[
            [String(p.week_bookings ?? 0), "Bookings"],
            [roster > 0 ? `${pct(Number(p.week_booked_min ?? 0), roster)}%` : dur(Number(p.week_booked_min ?? 0)), "Booked"],
            manager ? [money(p.week_cents, cur), "Value"] : [dur(roster), "Rostered"],
          ]} />
        ) : (
          <Minis items={[[money(p.rent_cents, cur), p.rent_period === "monthly" ? "A month" : "A week"], [String(((p.rent_days ?? []) as string[]).length), "Days"], manager ? [money(owed(data.rent, p), cur), "Owed"] : ["Own book", "Bookings"]]} />
        )}
        {(p.phone || p.email) && (manager || self) ? (
          <Row gap={8} wrap>
            {p.phone ? <SmallBtn icon="phone" onPress={() => { void Linking.openURL(tel(String(p.phone))).catch(() => undefined); }}>{String(p.phone)}</SmallBtn> : null}
            {p.email ? <SmallBtn onPress={() => { void Linking.openURL(`mailto:${p.email}`).catch(() => undefined); }}>Email</SmallBtn> : null}
          </Row>
        ) : null}
      </Card>

      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}

      {p.archived ? (
        <View style={{ marginTop: 16, gap: 10 }}>
          <AskCard title="No longer on the team">{first(p.name)} cannot be booked and their sign-in does not open this business. Their past bookings and sales are kept.</AskCard>
          {manager ? <Btn busy={busy === "restore"} onPress={() => action("restore")}>Bring back to the team</Btn> : null}
        </View>
      ) : null}

      {/* On the calendar */}
      {!renter && !p.archived ? (
        <>
          <Grp>On the calendar</Grp>
          <Card>
            <SetRow last title="Clients can book them" sub={p.bookable ? "Shown on your booking page and offered for free times" : "Off the booking page. Bookings already made are kept"}
              right={mayEdit ? <Sw on={!!p.bookable} disabled={busy === "bookable"} label="Clients can book them" onPress={() => put("bookable", { bookable: !p.bookable }, p.bookable ? `${first(p.name)} is off online booking. Bookings already made stay where they are.` : `Clients can book ${first(p.name)} online again.`)} /> : <Tag kind={p.bookable ? "ok" : "grey"}>{p.bookable ? "Yes" : "No"}</Tag>} />
          </Card>
        </>
      ) : null}

      {/* The week */}
      {!renter && !p.archived ? (
        <>
          <Grp right={mayEdit ? <SmallBtn onPress={() => setSheet("hours")}>Edit hours</SmallBtn> : undefined}>Weekly hours</Grp>
          <Card>
            {DAYS.map((d, i) => {
              const h = shiftOf(p, loc, d), brk = breaksOf(p, d);
              return (
                <View key={d} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 11, paddingHorizontal: 16, minHeight: 44, borderBottomWidth: i === 6 ? 0 : 1, borderBottomColor: c.line }}>
                  <Text style={{ width: 92, fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: h ? c.ink : c.muted2 }}>{DAY_LONG[d]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: h ? c.ink : c.muted2 }}>{h ? span12(h) : "Off"}</Text>
                    {h && brk.length ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{brk.length === 1 ? "Break" : "Breaks"} {brk.map((b) => span12(b)).join(", ")}</Text> : null}
                  </View>
                </View>
              );
            })}
          </Card>
          <T size={12} muted style={{ marginTop: 8 }}>{p.hours ? `${first(p.name)} has a week of their own` : `${first(p.name)} follows the location hours`}: {dur(roster)} this week, {pattern(p, loc)}. One week applies at every location. It repeats until it is changed.</T>
        </>
      ) : null}

      {/* What they perform */}
      {!renter && !p.archived ? (
        <>
          <Grp right={mayEdit ? <SmallBtn onPress={() => setSheet("services")}>Change</SmallBtn> : undefined}>Can perform · {does.length === services.length && services.length ? "every service" : `${does.length} of ${services.length}`}</Grp>
          {does.length ? (
            <Card>
              {does.map((sv, i) => {
                const own = ownPrice(String(sv.id)), base = menuPrice(String(sv.id));
                return (
                  <View key={sv.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 16, minHeight: 52, borderBottomWidth: i === does.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{String(sv.name)}</Text>
                      <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{String(sv.category)}{own !== null && own !== undefined && base !== undefined ? ` · menu price ${money(base, cur)}` : ""}</Text>
                    </View>
                    {base !== undefined ? (
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontFamily: f.bold, fontSize: 14, color: c.ink }}>{money(own ?? base, cur)}</Text>
                        <Text style={{ fontFamily: f.medium, fontSize: 11, lineHeight: 15, color: own !== null && own !== undefined ? c.goldInk : c.muted }}>{own !== null && own !== undefined ? "own price" : "menu price"}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          ) : <Card style={{ padding: 16 }}><T muted size={14}>{services.length ? `${first(p.name)} is not set to perform anything, so no service offers them.` : "No services on the menu yet. Add them under Services and pricing."}</T></Card>}
          <T size={12} muted style={{ marginTop: 8 }}>Level: {String(p.level)}. Pricing rules can raise or lower a price by level, day and time.</T>
        </>
      ) : null}

      {/* Time off */}
      {!renter && !p.archived && (manager || self) ? (
        <>
          <Grp right={<SmallBtn icon="plus" onPress={() => setSheet("off")}>{manager ? "Add" : "Ask"}</SmallBtn>}>Time off</Grp>
          {timeOff.length ? <View style={{ gap: 8 }}>{timeOff.map((o) => <OffCard key={o.id} o={o} manager={manager} mine={self} busy={off.busy === o.id} onDo={off.act} showWho={false} />)}</View>
            : <Card style={{ padding: 16 }}><T muted size={14}>Nothing from the last two weeks onwards. {manager ? "Add a holiday or a day away and those days stop taking bookings." : "Ask here and a manager will approve or decline it."}</T></Card>}
        </>
      ) : null}

      {/* Pay */}
      {manager && !renter && !p.archived ? (
        <>
          <Grp right={<SmallBtn onPress={() => setSheet("pay")}>Change</SmallBtn>}>Pay</Grp>
          <Card>
            <SetRow title="Paid by" sub={p.pay_type === "hourly" ? `${money(p.hourly_cents, cur)} an hour` : p.pay_type === "salary" ? `${money(p.salary_cents, cur)} a month` : undefined} right={<Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{PAY[String(p.pay_type)] ?? String(p.pay_type)}</Text>} />
            <SetRow last={!payRow} title="Commission" sub={p.pay_type === "owner" ? "None is counted for an owner" : "On services and on retail"} right={<Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{p.pay_type === "owner" ? "None" : `${Number(p.commission_pct)}% · ${Number(p.retail_commission_pct)}%`}</Text>} />
            {payRow && pay ? <SetRow last title={`${money(payRow.earned_cents, cur)} earned`} sub={`${dateOnly(String(pay.from))} to ${dateOnly(String(pay.to))} · ${money(payRow.service_cents, cur)} services · ${money(payRow.tips_cents, cur)} tips`} right={<Val>All pay</Val>} onPress={() => router.push("/m/staff/pay" as never)} /> : null}
          </Card>
        </>
      ) : null}

      {/* Chair rental */}
      {renter && !p.archived ? (
        <>
          <Grp right={manager ? <SmallBtn onPress={() => setSheet("rent")}>Change</SmallBtn> : undefined}>Chair rental</Grp>
          <Card>
            <SetRow title="Rent" right={<Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{money(p.rent_cents, cur)} {p.rent_period === "monthly" ? "a month" : "a week"}</Text>} />
            <SetRow title="Days the chair is theirs" right={<Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{rentDays(p)}</Text>} last={!manager} />
            {manager ? <SetRow last title={owed(data.rent, p) > 0 ? `${money(owed(data.rent, p), cur)} owed` : "Nothing owed"} sub="Mark a period as paid when you have the money" right={<Val>Rent by period</Val>} onPress={() => router.push("/m/staff/rent" as never)} /> : null}
          </Card>
          <T size={12} muted style={{ marginTop: 8 }}>LogaLuxe records the rent and does not collect it. A renter is not booked through your page and earns no commission.</T>
        </>
      ) : null}

      {/* What their sign-in may do */}
      {manager && !renter && !p.archived ? (
        <>
          <Grp>Permissions</Grp>
          <Card>
            {PERMS.map(([k, title, sub]) => (
              <SetRow key={k} title={title} sub={sub} right={<Sw on={permOn(k)} disabled={full || busy === k} label={title}
                onPress={() => put(k, { permissions: { ...Object.fromEntries(PERMS.map(([x]) => [x, permOn(x)])), [k]: !permOn(k) } }, `${title}: ${permOn(k) ? "off" : "on"} for ${first(p.name)}.`)} />} />
            ))}
            <SetRow last title="Signs in" sub={p.login_email ? String(p.login_email) : "No sign-in yet"} right={p.login_email ? <Tag kind={p.login_role === "owner" ? "gold" : "grey"}>{ROLE[String(p.login_role)] ?? String(p.login_role)}</Tag> : undefined} />
          </Card>
          <T size={12} muted style={{ marginTop: 8 }}>{full ? `${first(p.name)} signs in as ${p.login_role === "owner" ? "the owner" : "a manager"}, who can always do all three.` : "These three apply to a team member sign-in. Managers and the owner can always do all three."}</T>
        </>
      ) : null}

      {/* Their sign-in */}
      {manager && !renter && !p.archived && p.login_role !== "owner" ? (
        <>
          <Grp>Sign-in</Grp>
          {owner ? (
            <Card>
              <Item last icon={<Icon name="user" size={18} />} title={p.login_email ? "Change or remove their sign-in" : "Invite to sign in"} sub={p.login_email ? `${p.login_email} · ${ROLE[String(p.login_role)] ?? p.login_role}` : "They get an email with a link to choose a password"} onPress={() => setSheet("invite")} />
            </Card>
          ) : <AskCard title="Ask the owner">Only the owner can invite people, change what a sign-in can open, or remove one.</AskCard>}
        </>
      ) : null}

      {/* What a team member may not change */}
      {!manager ? (
        <View style={{ marginTop: 16, gap: 10 }}>
          {self ? (
            <>
              <AskCard>Your hours, breaks, services and pay are set by a manager or the owner. You can ask for time off above, and change your own name, phone and password in your account.</AskCard>
              <Card>
                <Item title="Your account" sub="Your name, phone and password" onPress={() => router.push("/m/account" as never)} />
                <Item last title="Calendar sync" sub="Your bookings in your own calendar" onPress={() => router.push("/m/calendar-sync" as never)} />
              </Card>
            </>
          ) : <AskCard>You can see {first(p.name)}&apos;s hours and what they perform. Pay, permissions and sign-ins are for a manager or the owner.</AskCard>}
        </View>
      ) : null}

      {/* Leaving the team */}
      {manager && !p.archived && p.role !== "owner" ? (
        <View style={{ marginTop: 24, gap: 8 }}>
          <Btn kind="danger" busy={busy === "archive"} onPress={() => action("archive")}>Remove from the team</Btn>
          <T size={12} muted center>Their history is kept. To pause bookings without removing them, switch off &quot;Clients can book them&quot;.</T>
        </View>
      ) : null}

      {mayEdit ? (
        <>
          <DetailsSheet p={p} open={sheet === "details"} onClose={() => setSheet("")} owner={owner} onSaved={done} />
          <PaySheet p={p} open={sheet === "pay"} onClose={() => setSheet("")} cur={cur} onSaved={done} />
          <RentTermsSheet p={p} open={sheet === "rent"} onClose={() => setSheet("")} cur={cur} onSaved={done} />
          <HoursSheet p={p} loc={loc} open={sheet === "hours"} onClose={() => setSheet("")} onSaved={done} />
          <ServicesSheet p={p} open={sheet === "services"} onClose={() => setSheet("")} cur={cur} onSaved={done} />
          {owner ? <InviteSheet p={p} open={sheet === "invite"} onClose={() => setSheet("")} onSaved={done} /> : null}
        </>
      ) : null}
      <TimeOffSheet open={sheet === "off"} onClose={() => setSheet("")} people={[p]} staffId={id} manager={manager} today={today} onSaved={(text) => { done(text); void s.refresh(); }} />
    </Screen>
  );
}
