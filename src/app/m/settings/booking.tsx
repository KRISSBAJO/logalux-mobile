// Booking page rules: what clients may do when they book online (the web's "Booking page" tab).
// Instant booking, lead time and the booking window are in Hours & policies, so they are not repeated here.
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Grp, Item, McIcon, SmallBtn, Tag, mc } from "@/components/mc-kit";
import { Night } from "@/components/mi-kit";
import { RulesScreen, type RuleRow } from "@/components/mi-rules";
import { Card, Icon, Row } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { bookingLink, copyText, openWeb } from "@/lib/mc-util";
import { STATUS } from "@/lib/mi-util";
import { c, f } from "@/lib/theme";

const ROWS: RuleRow[] = [
  { key: "anyone", title: "Choose \"anyone available\"", sub: "The client gets whoever on the team is free and can do the service", on: "Clients can choose anyone available.", off: "Clients now have to choose a person." },
  { key: "multi_service", title: "Book several services in one visit", sub: "The services follow one another in a single booking", on: "Clients can book several services in one visit.", off: "Clients now book one service at a time." },
  { key: "waitlist", title: "Join the waitlist", sub: "When a day is full, clients can ask to be told if a slot opens", on: "Clients can join your waitlist when a day is full.", off: "The waitlist is closed to new requests. People already on it stay." },
  { key: "on_search", title: "Show on LogaLuxe search", sub: "A new-client fee applies to bookings that come from search", on: "You are shown on LogaLuxe search.", off: "You are hidden from LogaLuxe search. Your own link still works." },
];

function PageCard({ d }: { d: Data }) {
  const b = d.business as Data;
  const main = ((d.locations ?? []) as Data[]).find((l) => l.is_primary);
  const link = bookingLink(String(b.slug));
  const [copied, setCopied] = useState("");
  return (
    <Night style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: f.serifBold, fontSize: 22, lineHeight: 26, color: mc.onNight }}>{b.name}</Text>
      <Row gap={6} wrap style={{ marginTop: 8 }}>
        <Tag kind={b.status === "live" ? "ok" : "gold"}>{STATUS[b.status] ?? b.status}</Tag>
        <Tag kind={b.verification_status === "verified" ? "ok" : "night"}>{b.verification_status === "verified" ? "Verified" : "Not verified yet"}</Tag>
        {main ? <Tag kind="night">{main.name}</Tag> : null}
      </Row>
      <Row gap={8} style={{ backgroundColor: "rgba(255,255,255,.08)", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 14 }}>
        <McIcon name="link" size={16} color={c.gold} />
        <Text numberOfLines={1} selectable style={{ flex: 1, minWidth: 0, fontFamily: f.semi, fontSize: 13, color: mc.onNight }}>{link.replace(/^https?:\/\//, "")}</Text>
      </Row>
      <Row gap={8} wrap style={{ marginTop: 12 }}>
        <SmallBtn kind="gold" onPress={async () => setCopied((await copyText(link)) === "copied" ? "Link copied." : "The link could not be copied. Press and hold it to select it.")}>Copy link</SmallBtn>
        <SmallBtn kind="ghost" onPress={() => { void openWeb(`/b/${b.slug}`); }}>Preview</SmallBtn>
        <SmallBtn kind="ghost" onPress={() => router.push("/m/share" as never)}>Share</SmallBtn>
      </Row>
      {copied ? <Text accessibilityRole="alert" style={{ fontFamily: f.medium, fontSize: 12, color: mc.nightMuted, marginTop: 10 }}>{copied}</Text> : null}
    </Night>
  );
}

export default function BookingRules() {
  return (
    <RulesScreen title="Booking page" what="What clients can do on the booking page is set by a manager or the owner." group="booking" heading="What clients can do" rows={ROWS}
      before={(d) => <PageCard d={d} />}
      after={() => (
        <>
          <Grp>Set elsewhere</Grp>
          <Card>
            <Item icon={<Icon name="clock" size={18} />} title="Hours & policies" sub="Instant booking, lead time, how far ahead, cancellation and deposits" onPress={() => router.push("/m/hours" as never)} />
            <Item icon={<McIcon name="list" />} title="Questions at booking" sub="What clients are asked when they book online" onPress={() => router.push("/m/questions" as never)} />
            <Item last icon={<Icon name="users" size={18} />} title="Waitlist" sub="The people hoping for a slot" onPress={() => router.push("/m/waitlist" as never)} />
          </Card>
          <View style={{ height: 4 }} />
        </>
      )} />
  );
}
