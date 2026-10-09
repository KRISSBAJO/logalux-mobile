// More: the business and its settings (design: M11-More).
// Every tool a business has opens inside the app. Only help pages open the website.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Item, Grp, McIcon, Tag, mc } from "@/components/mc-kit";
import { Card, Failed, Icon, Loading, Note, Row, Screen, T } from "@/components/ui";
import { api, type Row as Data } from "@/lib/api";
import { plural } from "@/lib/format";
import { PLAN, ROLE, bookingLink, copyText, openDays, openWeb, signedIn, soft, type Hours } from "@/lib/mc-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const go = (path: string) => () => router.push(path as never);
const web = (path: string) => () => { void openWeb(path); };
const SCHEDULE: Record<string, string> = { daily: "daily", weekly: "weekly", manual: "on request" };

export default function More() {
  const s = useSession();
  const m = s.merchant;
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const { data, loading, refreshing, refresh, reload } = useLoad(signedIn(s, async () => {
    const [services, settings, money, sync, setup, page] = await Promise.all([
      soft(() => s.mapi<Data>("/services")),
      soft(() => s.mapi<Data>("/settings")),
      soft(() => s.mapi<Data>("/money")),
      soft(() => s.mapi<Data>("/calendar-sync")),
      soft(() => s.mapi<Data>("/onboarding")),
      soft(() => (m?.slug ? api<Data>(`/businesses/${m.slug}`) : Promise.reject(new Error("no page")))),
    ]);
    return { services, settings, money, sync, setup, page };
  }), [s.businessToken, m?.business_id]);

  // Coming back from a screen that changed something: read it all again, quietly.
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!s.businessToken) return;
    if (seen.current) void refresh();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));

  if (!m) return <Screen><Loading /></Screen>;

  const link = bookingLink(m.slug);
  const live = m.status === "live";
  const verified = m.badges?.verification === "verified";
  const area = String(m.badges?.area ?? "");
  const offline = !!data && data.services.status === 0 && data.settings.status === 0;

  // What a manager or the owner may open, as the API answered.
  const managerOnly = !!data?.settings.denied;
  const ownerOnly = !!data?.money.denied;

  const sv = ((data?.services.data?.services ?? []) as Data[]).filter((x) => !x.archived);
  const team = ((data?.services.data?.staff ?? []) as Data[]).length;
  const rules = data?.settings.data?.rules as Data | undefined;
  const main = ((data?.settings.data?.locations ?? []) as Data[]).find((l) => l.is_primary) ?? ((data?.settings.data?.locations ?? []) as Data[])[0];
  const account = data?.money.data?.account as Data | null | undefined;
  const sync = data?.sync.data;
  const syncOn = !!(sync?.feed_url || sync?.cal_import_set);
  const setup = data?.setup.data;
  const setupLeft = setup ? Number(setup.total ?? 0) - Number(setup.done ?? 0) : 0;
  const biz = data?.page.data?.business as Data | undefined;
  const showSetup = !!setup && (!setup.live || setupLeft > 0) && !setup.dismissed;

  const servicesLine = !data ? undefined : data.services.data ? (sv.length ? `${plural(sv.length, "service")} · ${sv.filter((x) => x.online).length} bookable online` : "No services yet. Add your first one.") : undefined;
  const hoursLine = !data || !rules ? undefined : [main ? openDays(main.hours as Hours) : "", `${Number(rules.policy?.cancel_hours ?? 0)} h free cancellation`].filter(Boolean).join(" · ");
  const payoutLine = !data ? undefined : ownerOnly ? "For the owner" : data.money.data ? (account ? `${account.bank_name || "Bank"}${account.account_last4 ? ` ···· ${account.account_last4}` : ""} · ${SCHEDULE[String(data.money.data.schedule)] ?? data.money.data.schedule}` : "No payout account yet") : undefined;

  const copy = async () => {
    const out = await copyText(link);
    setNote(out === "copied" ? { kind: "ok", text: "Link copied." } : out === "failed" ? { kind: "bad", text: "The link could not be copied. Open Share to send it instead." } : null);
  };

  const signOut = async () => {
    await s.signOut("business");
    router.replace("/sign-in?side=business" as never);
  };

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 30, lineHeight: 34, color: c.ink, marginTop: 4 }}>Business</Text>

      {/* The business card */}
      <View style={{ backgroundColor: mc.night, borderRadius: 22, padding: 18, marginTop: 16 }}>
        <Row gap={14} style={{ alignItems: "flex-start" }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.gold, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: f.bold, fontSize: 18, color: c.ink }}>{String(m.business ?? "").trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: f.semi, fontSize: 17, lineHeight: 22, color: mc.onNight }}>{m.business}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: mc.nightMuted }}>{[area, PLAN[m.plan] ?? m.plan, ROLE[m.role] ?? m.role].filter(Boolean).join(" · ")}</Text>
            <Row gap={6} wrap style={{ marginTop: 6 }}>
              <Tag kind={live ? "ok" : "gold"}>{live ? "Live" : m.status === "paused" ? "Paused" : m.status === "suspended" ? "Suspended" : "Not live yet"}</Tag>
              {verified ? <Tag kind="ok">Verified</Tag> : null}
              {biz && Number(biz.review_count) > 0 ? <Tag kind="gold">{Number(biz.rating).toFixed(1)} · {plural(Number(biz.review_count), "review")}</Tag> : null}
            </Row>
          </View>
        </Row>
        <Row gap={8} style={{ backgroundColor: "rgba(255,255,255,.08)", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 14 }}>
          <McIcon name="link" size={16} color={c.gold} />
          <Text numberOfLines={1} selectable style={{ flex: 1, minWidth: 0, fontFamily: f.semi, fontSize: 13, color: mc.onNight }}>{link.replace(/^https?:\/\//, "")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Copy your booking link" onPress={copy} hitSlop={6} style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.gold, justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.ink }}>Copy</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Share your booking page" onPress={go("/m/share")} hitSlop={6} style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: "rgba(244,236,227,.3)", justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: f.semi, fontSize: 13, color: mc.onNight }}>Share</Text>
          </Pressable>
        </Row>
        <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: mc.nightMuted, marginTop: 10 }}>
          {live ? "Clients who open this link book straight into your calendar." : "Clients cannot book through this link until your page is live."}
        </Text>
      </View>

      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {loading && !data ? <Loading /> : null}
      {offline ? <View style={{ marginTop: 16 }}><Failed error={data!.services.error} onRetry={reload} /></View> : null}

      {managerOnly ? (
        <Card style={{ padding: 18, gap: 6, marginTop: 16 }}>
          <T weight="semi" size={16}>Ask a manager or the owner</T>
          <T muted size={14}>Hours, policies, money and the rest of the business’s settings are theirs to change. You can see the menu and look after your own account here.</T>
        </Card>
      ) : null}

      {showSetup && setup ? (
        <>
          <Grp>Get ready</Grp>
          <Card>
            <Item last icon={<Icon name="check" size={18} />} title="Setup checklist" sub={`${setup.done} of ${setup.total} done${setup.live ? "" : " · your page is not live yet"}`} onPress={go("/m/onboarding")} right={<Tag kind="gold">{setupLeft > 0 ? `${setupLeft} left` : "Waiting"}</Tag>} />
          </Card>
        </>
      ) : null}

      <Grp>Set up</Grp>
      <Card>
        <Item icon={<McIcon name="list" />} title="Services & pricing" sub={servicesLine} onPress={go("/m/services")} />
        {managerOnly ? null : (
          <>
            <Item icon={<Icon name="clock" size={18} />} title="Hours & policies" sub={hoursLine} onPress={go("/m/hours")} />
            <Item icon={<McIcon name="photo" />} title="Profile & portfolio" sub="Photos, your bio and what clients see" onPress={go("/m/profile")} />
          </>
        )}
        <Item icon={<McIcon name="staffAdd" />} title="Staff & chairs" sub={team ? `${plural(team, "person", "people")} on the calendar · hours and time off` : "The team, hours and time off"} onPress={go("/m/staff")} last={managerOnly || showSetup} />
        {managerOnly || showSetup ? null : <Item icon={<Icon name="check" size={18} />} title="Setup checklist" sub={setup ? `${setup.done} of ${setup.total} done` : "What is done and what is left"} onPress={go("/m/onboarding")} last />}
      </Card>

      {managerOnly ? null : (
        <>
          <Grp>Sell</Grp>
          <Card>
            <Item icon={<McIcon name="box" />} title="Inventory" sub="Products, stock levels and what to reorder" onPress={go("/m/inventory")} />
            <Item icon={<Icon name="shop" size={18} />} title="Online orders" sub="Shop orders to hand over or send" onPress={go("/m/orders")} />
            <Item icon={<McIcon name="refund" />} title="Returns" sub="Customers asking to send something back" onPress={go("/m/returns")} />
            <Item icon={<McIcon name="gift" />} title="Packages" sub="Sets of visits paid for up front" onPress={go("/m/packages")} />
            <Item icon={<Icon name="repeat" size={18} />} title="Memberships" sub="Monthly plans with discounts and included services" onPress={go("/m/memberships")} />
            <Item icon={<McIcon name="percent" />} title="Pricing rules" sub="Peak and quiet prices, and a price check" onPress={go("/m/pricing-rules")} />
            <Item icon={<Icon name="info" size={18} />} title="Questions at booking" sub="What clients are asked when they book online" onPress={go("/m/questions")} />
            <Item icon={<Icon name="users" size={18} />} title="Waitlist" sub="People hoping for a slot" onPress={go("/m/waitlist")} last />
          </Card>

          <Grp>Grow</Grp>
          <Card>
            <Item icon={<Icon name="share" size={18} />} title="Share your booking page" sub="Your link, to copy or send" onPress={go("/m/share")} />
            <Item icon={<McIcon name="link" />} title="QR code and link" sub="Show the code, or add booking to your site" onPress={go("/m/qr")} />
            <Item icon={<McIcon name="megaphone" />} title="Marketing" sub="Campaigns, automatic messages and promo codes" onPress={go("/m/marketing")} />
            <Item icon={<Icon name="heart" size={18} />} title="Loyalty points" sub="Points clients earn and spend" onPress={go("/m/loyalty")} />
            <Item icon={<Icon name="search" size={18} />} title="New clients from LogaLuxe" sub="Who LogaLuxe brought you and what each cost" onPress={go("/m/leads")} />
            <Item icon={<Icon name="star" size={18} />} title="Reviews" sub="Read them, reply and pin one" onPress={go("/m/reviews")} />
            <Item icon={<McIcon name="chart" />} title="Reports & insights" sub="Sales, bookings and the team's numbers" onPress={go("/m/reports")} last />
          </Card>

          <Grp>Money</Grp>
          <Card>
            <Item icon={<Icon name="wallet" size={18} />} title="Money" sub="Your balance and what came in" onPress={go("/m/money")} />
            <Item icon={<McIcon name="bank" />} title="Payout account" sub={payoutLine} onPress={go("/m/payouts")} />
            <Item icon={<McIcon name="doc" />} title="Statements" sub="Each month: what came in, fees and payouts" onPress={go("/m/statements")} />
            <Item icon={<Icon name="card" size={18} />} title="Plan" sub={PLAN[m.plan] ?? m.plan} onPress={go("/m/plan")} right={m.plan === "free" && !ownerOnly ? <Tag kind="gold">Upgrade</Tag> : undefined} last />
          </Card>
        </>
      )}

      {managerOnly ? (
        <>
          <Grp>Share</Grp>
          <Card>
            <Item icon={<McIcon name="link" />} title="QR code and link" sub="Show the booking code to a client" onPress={go("/m/qr")} last />
          </Card>
        </>
      ) : null}

      <Grp>Account</Grp>
      <Card>
        <Item icon={<Icon name="settings" size={18} />} title="Settings" sub={managerOnly ? "Your own alerts and sign-in" : "Business details, locations, tax and alerts"} onPress={go("/m/settings")} />
        <Item icon={<McIcon name="shield" />} title="Two-step sign-in" sub="A code from your phone at every sign-in" onPress={go("/m/security")} />
        <Item title="Your account" sub={`${m.name} · ${m.email}`} onPress={go("/m/account")} />
        <Item title="Calendar sync" sub={!sync ? (data?.sync.error && !data.sync.denied ? data.sync.error : "Your bookings in your own calendar") : syncOn ? [sync.feed_url ? "Bookings shown in your calendar" : "", sync.cal_import_set ? "busy times read from it" : ""].filter(Boolean).join(" · ") : "Your bookings in your own calendar"} onPress={go("/m/calendar-sync")} right={sync ? <Tag kind={syncOn ? "ok" : "grey"}>{syncOn ? "On" : "Off"}</Tag> : undefined} />
        <Item title="Help & support" sub="Guides and how to reach LogaLuxe" web onPress={web("/help")} last />
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Item icon={<Icon name="repeat" size={18} />} title="Switch to booking" sub="Use LogaLuxe as a client" onPress={() => { s.setMode("client"); router.replace("/client/home" as never); }} />
        <Item icon={<Icon name="out" size={18} color={c.bad} />} title="Sign out" danger last onPress={signOut} right={<View />} />
      </Card>

    </Screen>
  );
}
