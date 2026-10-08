// Data and privacy: where the business's data can be taken out, and pausing online booking
// (POST /v1/m/listing, the owner's). Closing a business is done by LogaLuxe support, as on the web.
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Grp, Item, SmallBtn, Tag } from "@/components/mc-kit";
import { Gate, Page, backTo } from "@/components/mi-kit";
import { Card, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { dateMed } from "@/lib/mb-util";
import { DENIED, ask, orDenied, signedIn } from "@/lib/mc-util";
import { STATUS, type Flash } from "@/lib/mi-util";
import { useSession } from "@/lib/session";
import { c } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const back = backTo("/m/settings");

export default function DataAndPrivacy() {
  const s = useSession();
  const owner = s.merchant?.role === "owner";
  const { data, error, reload, refresh, refreshing } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/settings"))), [s.businessToken]);
  const [busy, setBusy] = useState(false), [note, setNote] = useState<Flash>(null);

  if (!data || data === DENIED) return <Gate title="Data & privacy" onBack={back} denied={data === DENIED} what="The business's data and its listing are looked after by a manager or the owner." error={error} onRetry={reload} />;

  const b = data.business as Data;
  const status = String(b.status ?? "");

  const setPaused = async (paused: boolean) => {
    if (paused && !(await ask("Pause online booking?", "Clients will not be able to find or book you until you bring it back. Your data and existing bookings are kept.", "Pause"))) return;
    setBusy(true); setNote(null);
    try {
      await s.mapi("/listing", { body: { paused } });
      await Promise.all([refresh(), s.refresh()]);
      setNote({ kind: "ok", text: paused ? "Online booking is paused. Your data and existing bookings are kept." : "You are live again. Clients can find and book you." });
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy(false);
  };

  return (
    <Page title="Data & privacy" onBack={back} note={note} onRefresh={refresh} refreshing={refreshing}>
      <Grp>Your data</Grp>
      <Card>
        <Item title="Clients" sub="Everyone you have served, with their visits and notes" onPress={() => router.push("/business/clients" as never)} />
        <Item title="Sales and bookings" sub="The numbers for any period" onPress={() => router.push("/m/reports" as never)} last={!owner} />
        {owner ? <Item last title="Payments, fees and payouts" sub="Every money movement, day by day" onPress={() => router.push("/m/money" as never)} /> : null}
      </Card>
      <T size={12} muted style={{ marginTop: 8 }}>{b.name} has been on LogaLuxe since {dateMed(String(b.created_at), String(b.timezone))}. Spreadsheet downloads of clients, sales and money are made from the web app, where a file can be saved.</T>

      <Grp>Pause or close</Grp>
      <Card style={{ borderColor: "#E9C7C3" }}>
        <View style={{ padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Row between style={{ alignItems: "flex-start" }}>
            <T weight="semi" size={14} style={{ flex: 1 }}>{status === "paused" ? "Online booking is paused" : "Pause online booking"}</T>
            <Tag kind={status === "live" ? "ok" : "gold"}>{STATUS[status] ?? status}</Tag>
          </Row>
          <T size={13} muted>
            {status === "paused" ? "Clients cannot find or book you. Your data and existing bookings are kept."
              : status === "live" ? "Takes you off search and stops new online bookings. Keeps your data and existing bookings."
              : "Only a live business can be paused. Yours is not live yet."}
          </T>
          {!owner ? <T size={13} weight="medium">Only the owner can pause the business or bring it back.</T>
            : status === "live" ? <SmallBtn kind="danger" busy={busy} onPress={() => setPaused(true)} style={{ alignSelf: "flex-start" }}>Pause online booking</SmallBtn>
            : status === "paused" ? <SmallBtn kind="ink" busy={busy} onPress={() => setPaused(false)} style={{ alignSelf: "flex-start" }}>Go live again</SmallBtn>
            : null}
        </View>
        <View style={{ padding: 16, gap: 6 }}>
          <T weight="semi" size={14}>Close the business</T>
          <T size={13} muted>This cannot be done from here. Contact LogaLuxe support and we will close the account and send you your data.</T>
        </View>
      </Card>
    </Page>
  );
}
