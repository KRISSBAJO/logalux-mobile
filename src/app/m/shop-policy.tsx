// What shoppers are told: returns, delivery time and same-day pick-up, shown beside every product the
// business sells in the shop. PUT /v1/m/shop-policy replaces the whole policy, so the languages the
// business speaks (set on its storefront) travel back unchanged.
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Choice, Grp, Header } from "@/components/mc-kit";
import { Blank, Fine } from "@/components/mf-kit";
import { Btn, Field, Note, Row, Screen } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { DENIED, orDenied, signedIn } from "@/lib/mc-util";
import { whole } from "@/lib/mf-stock";
import { useSession } from "@/lib/session";
import { c } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const has = (v: unknown) => v !== null && v !== undefined;

export default function ShopPolicy() {
  const s = useSession();
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/shop-policy"))), [s.businessToken]);
  const p = data && data !== DENIED ? data : null;

  const [returns, setReturns] = useState<"none" | "no" | "days">("none"), [returnsN, setReturnsN] = useState(""), [returnsNote, setReturnsNote] = useState("");
  const [ship, setShip] = useState<"none" | "days">("none"), [shipMin, setShipMin] = useState(""), [shipMax, setShipMax] = useState("");
  const [pickup, setPickup] = useState<"none" | "mins">("none"), [pickupN, setPickupN] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!p) return;
    const r = !has(p.returns_days) ? "none" : Number(p.returns_days) === 0 ? "no" : "days";
    setReturns(r); setReturnsN(r === "days" ? String(p.returns_days) : ""); setReturnsNote(String(p.returns_note ?? ""));
    const sh = has(p.ship_days_min) && has(p.ship_days_max);
    setShip(sh ? "days" : "none"); setShipMin(sh ? String(p.ship_days_min) : ""); setShipMax(sh ? String(p.ship_days_max) : "");
    setPickup(has(p.pickup_ready_mins) ? "mins" : "none"); setPickupN(has(p.pickup_ready_mins) ? String(p.pickup_ready_mins) : "");
  }, [p]);

  if (!p) return <Blank title="What shoppers are told" error={error} onRetry={reload} denied={data === DENIED} what="Only a manager or the owner can change what shoppers are told." />;

  const save = async () => {
    const bad = (text: string) => setNote({ kind: "bad", text });
    const days = whole(returnsN), min = whole(shipMin), max = whole(shipMax), mins = whole(pickupN);
    if (returns === "days" && (days === null || days < 1 || days > 90)) return bad("Enter how many days you take returns for, 1 to 90.");
    if (returnsNote.trim().length > 300) return bad("Keep the returns note under 300 characters.");
    if (ship === "days" && (min === null || max === null)) return bad("Enter the shortest and the longest delivery time.");
    if (ship === "days" && (max! < min! || max! > 30)) return bad("Delivery takes between 0 and 30 days, shortest first.");
    if (pickup === "mins" && (mins === null || mins > 480)) return bad("Enter how many minutes an order takes to get ready, 0 to 480.");
    setBusy(true); setNote(null);
    try {
      await s.mapi("/shop-policy", { method: "PUT", body: {
        languages: (p.languages ?? []) as string[],
        returns_days: returns === "days" ? days : returns === "no" ? 0 : null, returns_note: returnsNote.trim(),
        ship_days_min: ship === "days" ? min : null, ship_days_max: ship === "days" ? max : null,
        pickup_ready_mins: pickup === "mins" ? mins : null,
      } });
      setNote({ kind: "ok", text: "Saved. Shoppers see this on your products now." });
      await refresh();
    } catch (e) {
      bad((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.cream }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen onRefresh={refresh} refreshing={refreshing} footer={<View style={{ gap: 10 }}>{note ? <Note kind={note.kind}>{note.text}</Note> : null}<Btn busy={busy} onPress={save}>Save what shoppers are told</Btn></View>}>
        <Header title="What shoppers are told" size={22} />
        <Fine style={{ marginTop: 12 }}>Shown beside every product you sell in the shop. Where you state nothing, shoppers are told nothing.</Fine>

        <Grp>Returns</Grp>
        <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
          <Choice title="We do not state a returns policy" sub="Customers cannot ask for a return in the app." on={returns === "none"} onPress={() => setReturns("none")} />
          <Choice title="No returns" on={returns === "no"} onPress={() => setReturns("no")} />
          <Choice title="Returns within a number of days" sub="Customers can ask to send an order back until then." on={returns === "days"} onPress={() => setReturns("days")} />
          {returns === "days" ? <Field label="Days a shopper has to return an item" value={returnsN} onChangeText={setReturnsN} keyboardType="number-pad" placeholder="14" hint="1 to 90 days, counted from when the order was collected or delivered." /> : null}
          <Field label="Note, optional" value={returnsNote} onChangeText={setReturnsNote} maxLength={300} placeholder="Unopened items only" hint="Shown with your returns line. Up to 300 characters." />
        </View>

        <Grp>Delivery time</Grp>
        <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
          <Choice title="We do not state a delivery time" on={ship === "none"} onPress={() => setShip("none")} />
          <Choice title="Arrives in a number of business days" on={ship === "days"} onPress={() => setShip("days")} />
          {ship === "days" ? (
            <>
              <Row gap={10} style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}><Field label="Shortest (days)" value={shipMin} onChangeText={setShipMin} keyboardType="number-pad" placeholder="2" /></View>
                <View style={{ flex: 1 }}><Field label="Longest (days)" value={shipMax} onChangeText={setShipMax} keyboardType="number-pad" placeholder="4" /></View>
              </Row>
              <Fine>Business days, 0 to 30, shortest first. Use the same number twice for a fixed time.</Fine>
            </>
          ) : null}
        </View>

        <Grp>Pick up today</Grp>
        <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
          <Choice title="Not offered" on={pickup === "none"} onPress={() => setPickup("none")} />
          <Choice title="Ready some minutes after ordering" sub="While you are open, shoppers see &quot;Pick up today&quot; with the time it will be ready." on={pickup === "mins"} onPress={() => setPickup("mins")} />
          {pickup === "mins" ? <Field label="Minutes until an order is ready to collect" value={pickupN} onChangeText={setPickupN} keyboardType="number-pad" placeholder="30" hint="0 to 480 minutes." /> : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
