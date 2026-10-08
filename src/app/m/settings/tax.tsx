// Sales tax on retail products. It is part of the business profile (PUT /v1/m/settings/profile),
// so the rest of the profile is sent back unchanged. Nigeria has none.
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Grp, mc } from "@/components/mc-kit";
import { Gate, Night, NightLabel, Page, backTo } from "@/components/mi-kit";
import { Btn, Card, Field, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money } from "@/lib/format";
import { DENIED, orDenied, signedIn } from "@/lib/mc-util";
import { profileBody, type Flash } from "@/lib/mi-util";
import { useSession } from "@/lib/session";
import { f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const back = backTo("/m/settings");

export default function SalesTax() {
  const s = useSession();
  const { data, error, reload, refresh } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/settings"))), [s.businessToken]);
  const [pct, setPct] = useState("");
  const [saving, setSaving] = useState(false), [note, setNote] = useState<Flash>(null), [bad, setBad] = useState("");

  const b = data && data !== DENIED ? (data.business as Data) : null;
  const saved = Number(b?.sales_tax_bp ?? 0) / 100;
  useEffect(() => { if (b) setPct(String(saved)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [data]);

  if (!b) return <Gate title="Sales tax" onBack={back} denied={data === DENIED} what="Sales tax is set by a manager or the owner." error={error} onRetry={reload} />;

  const cur = String(b.currency ?? "USD");
  const typed = pct.trim() === "" ? 0 : /^\d+(\.\d{0,2})?$/.test(pct.trim()) ? Number(pct) : NaN;
  const shown = Number.isNaN(typed) ? saved : typed;

  const save = async () => {
    if (Number.isNaN(typed)) { setBad("Enter a percentage like 9.25."); return; }
    setSaving(true); setNote(null); setBad("");
    try {
      await s.mapi("/settings/profile", { method: "PUT", body: profileBody(b, { sales_tax_pct: typed }) });
      await refresh();
      setNote({ kind: "ok", text: typed > 0 ? `Saved. ${typed}% is added to retail products at checkout.` : "Saved. No sales tax is added." });
    } catch (e) {
      const text = (e as Error).message;
      if (/sales tax/i.test(text)) setBad(text); else setNote({ kind: "bad", text });
    }
    setSaving(false);
  };

  if (b.market === "NG") {
    return (
      <Page title="Sales tax" onBack={back}>
        <Card style={{ padding: 18, gap: 6, marginTop: 16 }}>
          <T weight="semi" size={16}>None</T>
          <T muted size={14}>Sales tax is not charged in Nigeria, so nothing is added to what your clients pay.</T>
        </Card>
      </Page>
    );
  }

  return (
    <Page title="Sales tax" onBack={back} note={note} footer={<Btn busy={saving} disabled={!Number.isNaN(typed) && typed === saved} onPress={save}>Save sales tax</Btn>}>
      <Night style={{ marginTop: 16 }}>
        <NightLabel>On retail products</NightLabel>
        <Text style={{ fontFamily: f.serif, fontSize: 44, lineHeight: 50, color: mc.onNight, marginTop: 4 }}>{shown}%</Text>
        <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 19, color: mc.nightMuted, marginTop: 6 }}>
          {shown > 0 ? `A ${money(2000, cur)} product costs the client ${money(Math.round(2000 * (1 + shown / 100)), cur)} at checkout.` : "Nothing is added to the price of a product at checkout."}
        </Text>
      </Night>

      <Grp>The rate</Grp>
      <View style={{ gap: 14 }}>
        <Field label="Sales tax on retail · %" value={pct} onChangeText={(v) => { setPct(v); setBad(""); }} keyboardType="decimal-pad" maxLength={5} placeholder="0" error={bad || undefined} hint="Between 0 and 30. Use the combined state and local rate for where you sell." />
        <T size={13} muted>It is added to the products on a sale at checkout. Services are not taxed.</T>
      </View>
    </Page>
  );
}
