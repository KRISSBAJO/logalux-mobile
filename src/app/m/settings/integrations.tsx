// Integrations: what is connected to the business today, said plainly (the web's "Integrations" tab).
// Email comes from GET /v1/m/settings → mail_mode; online payments from GET /v1/m/payments, which is the owner's.
import { router } from "expo-router";
import { Grp, Item, SetRow, Tag } from "@/components/mc-kit";
import { Gate, Page, backTo } from "@/components/mi-kit";
import { Card, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { DENIED, orDenied, signedIn, soft } from "@/lib/mc-util";
import { useModes } from "@/lib/mp-features";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";

const LATER: [string, string][] = [
  ["Google Business Profile", "A book button on your Google listing"],
  ["Instagram and Facebook", "A book button on your profile. For now, put your booking link in your bio."],
  ["Card readers", "Taking a card in person on a reader"],
  ["Accounting and imports", "QuickBooks, and moving over from another booking system"],
];
const back = backTo("/m/settings");

export default function Integrations() {
  const s = useSession();
  const owner = s.merchant?.role === "owner";
  const modes = useModes();
  const { data, error, reload, refresh, refreshing } = useLoad(signedIn(s, () => orDenied(async () => {
    const [settings, pay] = await Promise.all([s.mapi<Data>("/settings"), soft(() => s.mapi<Data>("/payments"))]);
    return { settings, pay: pay.data };
  })), [s.businessToken]);

  if (!data || data === DENIED) return <Gate title="Integrations" onBack={back} denied={data === DENIED} what="What the business is connected to is looked after by a manager or the owner." error={error} onRetry={reload} />;

  const logged = data.settings.mail_mode === "log";
  const pay = data.pay;
  const provider = pay?.provider === "paystack" ? "Paystack" : "Stripe";

  return (
    <Page title="Integrations" onBack={back} onRefresh={refresh} refreshing={refreshing}>
      <Grp>Built in</Grp>
      <Card>
        <SetRow title="Email" sub={logged ? "Not connected on this server. Emails to clients and alerts to you are logged, not delivered." : "Emails to clients and alerts to you are delivered."} right={<Tag kind={logged ? "grey" : "ok"}>{logged ? "Logged only" : "Connected"}</Tag>} />
        <SetRow title="WhatsApp" sub={modes.whatsapp === "live" ? "Messages to clients on WhatsApp are sent." : "Not connected yet. Messages on this channel are logged, not delivered."} right={<Tag kind={modes.whatsapp === "live" ? "ok" : "grey"}>{modes.whatsapp === "live" ? "Connected" : "Logged only"}</Tag>} />
        <SetRow title="SMS" sub={modes.sms === "live" ? "Texts to clients are sent." : "Not connected yet. Texts are logged, not delivered."} right={<Tag kind={modes.sms === "live" ? "ok" : "grey"}>{modes.sms === "live" ? "Connected" : "Logged only"}</Tag>} />
        {pay ? (
          pay.mode === "live"
            ? <SetRow title="Online payments" sub={`On through ${provider}: deposits and pay links are taken for real.`} right={<Tag kind="ok">Live</Tag>} />
            : <SetRow title="Online payments" sub={`In simulation. ${provider} is not connected on this server, so deposits and pay links are recorded as if paid, but no money moves and nothing reaches your bank.`} right={<Tag kind="gold">Simulation</Tag>} />
        ) : <SetRow title="Online payments" sub="The owner can see whether online payments are live or simulated, under Money." right={<Tag>Owner only</Tag>} />}
        {owner ? <Item title="Payouts" sub="The bank account your money is paid into" onPress={() => router.push("/m/money" as never)} /> : null}
        <Item last title="Calendar sync" sub="Your bookings in your own calendar, by a private address" onPress={() => router.push("/m/calendar-sync" as never)} />
      </Card>

      <Grp>Not available yet</Grp>
      <Card>
        {LATER.map(([name, what], i) => <SetRow key={name} last={i === LATER.length - 1} title={name} sub={what} />)}
      </Card>
      <T size={12} muted style={{ marginTop: 8 }}>These are planned. There is nothing to connect today, and LogaLuxe will say here when there is.</T>
    </Page>
  );
}
