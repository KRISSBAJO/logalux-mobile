// Marketing: what went out lately, what it brought in, and the way into each tool.
// Every number is read from GET /v1/m/marketing; the lines under the tools come from each tool's own endpoint.
import { router } from "expo-router";
import { Text, View } from "react-native";
import { Grp, Item, McIcon, SmallBtn, Tag } from "@/components/mc-kit";
import { LinkText } from "@/components/ma-kit";
import { B, CampaignRow, MgIcon, Night, NightBig, NightLabel, NightStat, NightText, NotReady, Page, Stat, Stats, Tip } from "@/components/mg-kit";
import { Card, Empty, Icon, Note, Row } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { dateMed } from "@/lib/mb-util";
import { channelsNote, modesOf } from "@/lib/mp-features";
import { soft } from "@/lib/mc-util";
import { useGrow } from "@/lib/mg-load";
import { NO_SIZE, n, pct, pct1, promoState, type Size } from "@/lib/mg-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

const go = (path: string) => () => router.push(path as never);

export default function Marketing() {
  const s = useSession();
  const m = s.merchant;
  const cur = (m?.currency as string) ?? "USD", tz = m?.timezone as string | undefined;

  const { d, denied, error, reload, refresh, refreshing } = useGrow(s, async () => {
    const main = await s.mapi<Data>("/marketing");
    const [leads, loyalty, promos] = await Promise.all([soft(() => s.mapi<Data>("/leads")), soft(() => s.mapi<Data>("/loyalty")), soft(() => s.mapi<Data>("/promos"))]);
    return { main, leads: leads.data, loyalty: loyalty.data, promos: promos.data };
  });

  if (!d) return <NotReady title="Marketing" denied={denied} error={error} reload={reload} what="Campaigns, automatic messages, promo codes and loyalty are set by a manager or the owner." />;

  const { main } = d;
  const k = (main.kpis ?? {}) as Data, capN = Number(main.cap ?? 0), modes = (main.modes ?? {}) as Record<string, string>;
  const autos = (main.automations ?? []) as Data[], campaigns = (main.campaigns ?? []) as Data[];
  const audiences = (main.audiences ?? {}) as Record<string, Size>;
  const emailLive = modes.email !== "log";
  const lastSent = campaigns.filter((x) => x.status === "sent").sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))[0];
  const drafts = campaigns.filter((x) => x.status === "draft").length;
  const autosOn = autos.filter((a) => a.enabled).length;

  // A plain suggestion worked out from the audience numbers. Nothing here is written by a machine.
  const lapsed = (audiences.lapsed ?? NO_SIZE).total, birthdays = (audiences.birthday ?? NO_SIZE).total;
  const idea = lapsed > 0 ? "lapsed" : birthdays > 0 ? "birthday" : "";

  const lk = d.leads?.kpis as Data | undefined;
  const rules = d.loyalty?.rules as Data | undefined, lyk = d.loyalty?.kpis as Data | undefined;
  const promos = (d.promos?.promos ?? null) as Data[] | null;
  const promosOn = promos ? promos.filter((p) => promoState(p) === "On").length : 0;
  const promoUses = promos ? promos.reduce((sum, p) => sum + Number(p.used ?? 0), 0) : 0;

  return (
    <Page title="Marketing" onRefresh={refresh} refreshing={refreshing}>
      {channelsNote(modesOf(modes)) ? (
        <View style={{ marginTop: 14 }}>
          <Note kind="gold">{channelsNote(modesOf(modes))}</Note>
        </View>
      ) : null}

      <Night style={{ marginTop: 12 }}>
        <NightLabel>{emailLive ? "Sent" : "Recorded"} this month</NightLabel>
        <NightBig label={`${n(k.sent_month)} messages`}>{n(k.sent_month)}<Text style={{ fontSize: 18, color: "#C9BCB0" }}> {Number(k.sent_month) === 1 ? "message" : "messages"}</Text></NightBig>
        <Row gap={10} style={{ marginTop: 14, alignItems: "flex-start" }}>
          <NightStat label="Marketing" value={n(k.marketing_month)} sub={`at most ${capN} per client in 30 days`} />
          <NightStat label="Confirmations, reminders" value={n(Math.max(0, Number(k.sent_month) - Number(k.marketing_month)))} sub="these do not count toward the cap" />
        </Row>
        <NightText style={{ marginTop: 14 }}>
          {lastSent
            ? <>Last campaign: <Text style={{ fontFamily: f.bold, color: "#F4ECE3" }}>{lastSent.name}</Text>, {dateMed(String(lastSent.sent_at), tz)}. {n(lastSent.delivered)} delivered{Number(lastSent.logged) > 0 ? `, ${n(lastSent.logged)} logged only` : ""}. {Number(lastSent.booked) > 0 ? `${plural(Number(lastSent.booked), "booking")} within 14 days, worth ${money(lastSent.booked_cents, cur)}.` : "No bookings within 14 days so far."}</>
            : "No campaign has been sent yet."}
        </NightText>
        <Row gap={8} style={{ marginTop: 14 }}>
          <SmallBtn kind="gold" onPress={go("/m/campaign-new")} style={{ flex: 1 }}>New campaign</SmallBtn>
          <SmallBtn kind="ghost" onPress={go("/m/campaigns")}>All campaigns</SmallBtn>
        </Row>
      </Night>

      <Grp>What it brought in · last 30 days</Grp>
      <Stats>
        <Stat label="Rebook rate" value={`${pct(k.rebooked, k.visited)}%`} sub={Number(k.visited) ? `${n(k.rebooked)} of ${plural(Number(k.visited), "client")} who visited booked again` : "No visits in the last 30 days"} />
        <Stat label="Win-back" value={n(k.win_back_bookings)} sub={Number(k.win_back_bookings) ? `${money(k.win_back_cents, cur)} in bookings within 14 days` : "No bookings after a win-back yet"} />
        <Stat label="Reviews" value={`${pct(k.reviews, k.visits)}%`} sub={Number(k.visits) ? `${plural(Number(k.reviews), "review")} from ${plural(Number(k.visits), "visit")}` : "No visits in the last 30 days"} />
        <Stat label="Opted out" value={`${pct1(Number(k.opted_out), Number(k.clients))}%`} sub={`${n(k.opted_out)} of ${plural(Number(k.clients), "client")}`} />
      </Stats>

      {idea ? (
        <Card style={{ marginTop: 12, padding: 14, gap: 10 }}>
          <Row gap={10} style={{ alignItems: "flex-start" }}>
            <MgIcon name="spark" size={20} color={c.gold} />
            <Text style={{ flex: 1, fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.ink }}>
              {idea === "lapsed"
                ? <><B>{plural(lapsed, "client")}</B> {lapsed === 1 ? "has" : "have"} not been back in 60 days and can still get marketing from you. A short message with your booking link is the usual way to bring them back.</>
                : <><B>{plural(birthdays, "client")}</B> {birthdays === 1 ? "has" : "have"} a birthday this month. A short note with your booking link is a good reason to write.</>}
            </Text>
          </Row>
          <SmallBtn kind="out" onPress={go(`/m/campaign-new?audience=${idea}`)} style={{ alignSelf: "flex-start" }}>Start a campaign</SmallBtn>
        </Card>
      ) : null}

      <Grp right={campaigns.length > 3 ? <LinkText onPress={go("/m/campaigns")} style={{ minHeight: 17 }}>See all {campaigns.length}</LinkText> : undefined}>Recent campaigns</Grp>
      {campaigns.length
        ? campaigns.slice(0, 3).map((x) => <CampaignRow key={x.id} camp={x} currency={cur} tz={tz} onPress={go(`/m/campaign/${x.id}`)} />)
        : <Empty title="No campaigns yet">A campaign is a one-off message to a group of clients, such as everyone who has not been back in 60 days.</Empty>}

      <Grp>Tools</Grp>
      <Card>
        <Item icon={<McIcon name="megaphone" />} title="Campaigns" sub={campaigns.length ? `${plural(campaigns.length, "campaign")}${drafts ? ` · ${plural(drafts, "draft")} waiting` : ""}` : "One-off messages to a group of clients"} onPress={go("/m/campaigns")} />
        <Item icon={<Icon name="repeat" size={18} />} title="Automatic messages" sub={`${autosOn} of ${autos.length} on · reminders, reviews, win-backs`} onPress={go("/m/automations")} />
        <Item icon={<MgIcon name="tag" />} title="Promo codes" sub={promos ? (promos.length ? `${plural(promosOn, "code")} on · used ${plural(promoUses, "time")}` : "No codes yet") : "Money off, for your business only"} onPress={go("/m/promos")} />
        <Item icon={<McIcon name="gift" />} title="Loyalty points" sub={rules && lyk ? `${plural(Number(lyk.members), "client")} with points` : "Points clients earn and spend"} onPress={go("/m/loyalty")} right={rules ? <Tag kind={rules.enabled ? "ok" : "grey"}>{rules.enabled ? "On" : "Off"}</Tag> : undefined} />
        <Item last icon={<MgIcon name="trend" />} title="New clients from LogaLuxe" sub={lk ? `${n(lk.month_leads)} this month · ${money(lk.month_fee_cents, cur)} in fees` : "What LogaLuxe brought you and what it cost"} onPress={go("/m/leads")} />
      </Card>
      {m?.status !== "live" ? <Tip style={{ marginTop: 12 }}>Automatic messages only run for a live business. Yours is {m?.status === "paused" ? "paused" : "not live yet"}, so nothing goes out for now. You can still set the wording.</Tip> : null}
    </Page>
  );
}
