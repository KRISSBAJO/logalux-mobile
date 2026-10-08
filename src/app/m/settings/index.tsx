// Settings: the hub. Each row opens one part of what the web keeps under Settings, and the line
// under it is read from the API (GET /v1/m/settings, GET /v1/m/security).
// A team member cannot open the business's settings, but their own account is theirs to manage.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { Text, View } from "react-native";
import { Grp, Header, Item, McIcon, Tag, Wait, mc } from "@/components/mc-kit";
import { Night } from "@/components/mi-kit";
import { Card, Failed, Icon, Row, Screen, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { plural } from "@/lib/format";
import { PLAN, openDays, signedIn, soft, type Hours } from "@/lib/mc-util";
import { CATEGORIES, STATUS } from "@/lib/mi-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const go = (path: string) => () => router.push(path as never);

export default function Settings() {
  const s = useSession();
  const m = s.merchant;
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, async () => {
    const [settings, security] = await Promise.all([soft(() => s.mapi<Data>("/settings")), soft(() => s.mapi<Data>("/security"))]);
    if (!settings.data && !settings.denied) throw new Error(settings.error);
    return { settings: settings.data, denied: settings.denied, security: security.data };
  }), [s.businessToken, m?.business_id]);

  // Coming back from a part that changed something: read it again, quietly.
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!s.businessToken) return;
    if (seen.current) void refresh();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));

  if (!data) {
    return (
      <Screen>
        <Header title="Settings" />
        {error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const d = data.settings, sec = data.security;
  const b = (d?.business ?? {}) as Data, rules = (d?.rules ?? {}) as Record<string, Data>;
  const locations = (d?.locations ?? []) as Data[], logins = (d?.logins ?? []) as Data[];
  const main = locations.find((l) => l.is_primary) ?? locations[0];
  const taxPct = Number(b.sales_tax_bp ?? 0) / 100;
  const count = (group: string, keys: string[]) => keys.filter((k) => !!rules[group]?.[k]).length;
  const alerts = count("notify", ["new_booking_email", "cancellation_email", "daily_summary", "low_stock_email"]);
  const can = count("booking", ["anyone", "multi_service", "waitlist", "on_search"]);
  const policy = (rules.policy ?? {}) as Data;

  const you = (
    <>
      <Grp>You</Grp>
      <Card>
        <Item icon={<Icon name="user" size={18} />} title="Your account" sub={m ? `${m.name} · ${m.email}` : undefined} onPress={go("/m/account")} />
        <Item icon={<McIcon name="shield" />} title="Two-step sign-in" sub={!sec ? "A code from your phone at every sign-in" : sec.two_step ? `${plural(Number(sec.recovery_left ?? 0), "recovery code")} left` : "Your password alone signs you in"}
          right={sec ? <Tag kind={sec.two_step ? "ok" : "grey"}>{sec.two_step ? "On" : "Off"}</Tag> : undefined} onPress={go("/m/security")} />
        <Item last icon={<Icon name="calendar" size={18} />} title="Calendar sync" sub="Your bookings in your own calendar" onPress={go("/m/calendar-sync")} />
      </Card>
    </>
  );

  if (data.denied || !d) {
    return (
      <Screen onRefresh={refresh} refreshing={refreshing}>
        <Header title="Settings" />
        <Card style={{ padding: 18, gap: 6, marginTop: 16 }}>
          <T weight="semi" size={16}>Business settings</T>
          <T muted size={14}>The business profile, opening hours, booking rules and the plan are looked after by managers and the owner. Ask them if something there needs changing.</T>
        </Card>
        {you}
      </Screen>
    );
  }

  const status = String(b.status ?? "");
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Settings" />

      <Night style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: f.serifBold, fontSize: 24, lineHeight: 28, color: mc.onNight }}>{b.name}</Text>
        <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: mc.nightMuted, marginTop: 4 }}>
          {[CATEGORIES.find(([k]) => k === b.category)?.[1], main ? [main.city, main.region].filter(Boolean).join(", ") : "", b.currency].filter(Boolean).join(" · ")}
        </Text>
        <Row gap={6} wrap style={{ marginTop: 10 }}>
          <Tag kind={status === "live" ? "ok" : "gold"}>{STATUS[status] ?? status}</Tag>
          <Tag kind={b.verification_status === "verified" ? "ok" : "night"}>{b.verification_status === "verified" ? "Verified" : "Not verified yet"}</Tag>
        </Row>
        {b.verification_status !== "verified" ? (
          <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: mc.nightMuted, marginTop: 10 }}>Our team checks every new business before it appears on LogaLuxe. You can set everything up now. It goes live once it is approved.</Text>
        ) : status === "paused" ? (
          <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: mc.nightMuted, marginTop: 10 }}>Online booking is paused. Clients cannot find or book you until you bring it back under Data and privacy.</Text>
        ) : null}
      </Night>

      <Grp>The business</Grp>
      <Card>
        <Item icon={<Icon name="shop" size={18} />} title="Business details" sub={[b.phone, b.email].filter(Boolean).join(" · ") || "Name, contact, time zone and your about text"} onPress={go("/m/settings/business")} />
        <Item icon={<Icon name="pin" size={18} />} title="Locations" sub={main ? `${plural(locations.length, "location")} · ${[main.address, main.city].filter(Boolean).join(", ") || "no address yet"}` : "No location yet"} onPress={go("/m/settings/locations")} />
        <Item last icon={<McIcon name="percent" />} title="Sales tax" sub={b.market === "NG" ? "None. Not charged in Nigeria" : taxPct > 0 ? `${taxPct}% on retail products` : "No sales tax on retail products"} onPress={go("/m/settings/tax")} />
      </Card>

      <Grp>Booking</Grp>
      <Card>
        <Item icon={<McIcon name="link" />} title="Booking page rules" sub={`${can} of 4 on: anyone available, several services, waitlist, search`} onPress={go("/m/settings/booking")} />
        <Item icon={<Icon name="clock" size={18} />} title="Hours & policies" sub={[main ? openDays(main.hours as Hours) : "", `${Number(policy.cancel_hours ?? 0)} h free cancellation`].filter(Boolean).join(" · ")} onPress={go("/m/hours")} />
        <Item last icon={<Icon name="bell" size={18} />} title="Notifications" sub={`${alerts} of 4 emails to you are on`} onPress={go("/m/settings/notifications")} />
      </Card>

      <Grp>Team and tools</Grp>
      <Card>
        <Item icon={<Icon name="users" size={18} />} title="Team & permissions" sub={`${plural(logins.length, "person", "people")} can sign in`} onPress={go("/m/staff/logins")} />
        <Item icon={<Icon name="card" size={18} />} title="Plan & billing" sub={PLAN[String(b.plan)] ?? String(b.plan ?? "")} onPress={go("/m/plan")} />
        <Item icon={<McIcon name="key" />} title="Integrations" sub={d.mail_mode === "log" ? "Email is not connected on this server" : "Email is connected"} onPress={go("/m/settings/integrations")} />
        <Item last icon={<McIcon name="doc" />} title="Data & privacy" sub={status === "paused" ? "Online booking is paused" : "Your data, and pausing online booking"} onPress={go("/m/settings/data")} right={status === "paused" ? <Tag kind="gold">Paused</Tag> : undefined} />
      </Card>

      {you}
      <T size={12} muted style={{ marginTop: 12 }}>Money is taken in {String(b.currency)}; that is fixed for a business in {b.market === "NG" ? "Nigeria" : "the United States"}.</T>
      <View style={{ height: 4, backgroundColor: c.cream }} />
    </Screen>
  );
}
