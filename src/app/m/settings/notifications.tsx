// Notifications: the emails LogaLuxe sends the business, each one on or off (the web's "Notifications" tab).
import { router } from "expo-router";
import { Grp, Item, SetRow, Tag } from "@/components/mc-kit";
import { RulesScreen, type RuleRow } from "@/components/mi-rules";
import { Card, Note, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { LinkText } from "@/components/ma-kit";
import { View } from "react-native";

const ROWS: RuleRow[] = [
  { key: "new_booking_email", title: "New booking", sub: "An email when a client books", on: "Saved. You get an email when a client books.", off: "Saved. No email when a client books." },
  { key: "cancellation_email", title: "Cancellation", sub: "An email when a client cancels", on: "Saved. You get an email when a client cancels.", off: "Saved. No email when a client cancels." },
  { key: "daily_summary", title: "Morning summary", sub: "Today's bookings in one email", on: "Saved. You get the day's bookings in one email each morning.", off: "Saved. No morning summary." },
  { key: "low_stock_email", title: "Low stock", sub: "An email when a product reaches its reorder level", on: "Saved. You get an email when a product runs low.", off: "Saved. No email when a product runs low." },
];

export default function Notifications() {
  return (
    <RulesScreen title="Notifications" what="The alerts the business gets are chosen by a manager or the owner." group="notify" heading="Alerts to you and your team" rows={ROWS}
      before={(d) => (d.mail_mode === "log" ? <View style={{ marginTop: 12 }}><Note kind="gold">Email is not connected on this server: alerts are logged, not delivered.</Note></View> : null)}
      after={(d) => {
        const email = String((d.business as Data)?.email ?? "");
        return (
          <>
            <T size={12} muted style={{ marginTop: 8 }}>{email ? `These emails go to ${email}, the business email in your profile.` : "These emails go to the owner, because the business profile has no email."} New bookings and messages always show on Today and in the Inbox as well.</T>
            <LinkText onPress={() => router.push("/m/settings/business" as never)}>Change the business email</LinkText>
            <Grp style={{ marginTop: 8 }}>Messages to clients</Grp>
            <Card>
              <Item title="Confirmations, reminders and review requests" sub="Turned on and off, and worded, in Automatic messages" onPress={() => router.push("/m/automations" as never)} />
              <SetRow last title="WhatsApp and SMS" sub="Not connected yet. Messages on these channels are logged, not delivered." right={<Tag>Not available yet</Tag>} />
            </Card>
          </>
        );
      }} />
  );
}
