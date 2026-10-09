import { useFormReset } from "../../../lib/form-reset";
// One return request: what is coming back and why, and the answer. Approve and refund, or refuse with a
// reason (POST /v1/m/returns/{id}). It is answered once. The refund goes back the way the money came:
// to the card through the payment provider, or as LogaLuxe store credit. While payments are in simulation
// no card is touched, and the screen says so before anything is approved.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, Text, View } from "react-native";
import { Grp, Header, Sw, Tabs2, Tag } from "@/components/mc-kit";
import { Blank, Fine, Kv, Line } from "@/components/mf-kit";
import { Btn, Card, Empty, Field, Icon, Note, Row, Screen, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { money } from "@/lib/format";
import { tel } from "@/lib/ma-format";
import { DENIED, ask, major, orDenied, signedIn, soft, symbol, toCents } from "@/lib/mc-util";
import { PROVIDER, RETURN_STATE, currencyName, dateMed, itemsLine, refundSplit, stamp } from "@/lib/mf-stock";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Loaded = { res: Data; mode: string };

export default function ReturnAnswer() {
  const s = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tz = s.merchant?.timezone as string | undefined;
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(async (): Promise<Loaded> => {
    // Checkout is the one thing a manager can read that says whether payments are live or simulated.
    const [res, pay] = await Promise.all([s.mapi<Data>("/returns"), soft(() => s.mapi<Data>("/checkout"))]);
    return { res, mode: String(pay.data?.payments_mode ?? "") };
  })), [s.businessToken]);

  const [tab, setTab] = useState<"approve" | "refuse">("approve");
  const [refund, setRefund] = useState(""), [restock, setRestock] = useState(false), [reply, setReply] = useState(""), [why, setWhy] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const d = data && data !== DENIED ? data : null;
  const r = ((d?.res.returns ?? []) as Data[]).find((x) => x.id === id);
  const itemsCents = Number(r?.items_cents ?? 0);
  useFormReset([r?.id], () => { if (r?.id) setRefund(major(itemsCents));   });

  if (!d) return <Blank title="Return" error={error} onRetry={reload} denied={data === DENIED} what="Only a manager or the owner can answer returns." />;
  if (!r) {
    return (
      <Screen onRefresh={refresh} refreshing={refreshing}>
        <Header title="Return" />
        <View style={{ marginTop: 16 }}>
          <Empty title="Return not found" action={<Btn small kind="out" onPress={() => router.replace("/m/returns" as never)} style={{ marginTop: 4 }}>Open returns</Btn>}>It is not one of your last 300 return requests.</Empty>
        </View>
      </Screen>
    );
  }

  const cur = String(r.currency ?? s.merchant?.currency ?? "USD"); // an order is refunded in the currency it was paid in
  const reasons = (d.res.reasons ?? {}) as Record<string, string>;
  const st = r.provider_refund_status === "pending" ? { label: "Provider refund pending", kind: "gold" as const } : RETURN_STATE[r.status] ?? { label: String(r.status), kind: "grey" as const };
  const items = (r.items ?? []) as Data[], shipping = Number(r.shipping_cents ?? 0), most = itemsCents + shipping;
  const waiting = r.status === "requested";
  const simulated = d.mode !== "" && d.mode !== "live";
  const provider = PROVIDER[String(s.merchant?.market ?? "")] ?? "the payment provider";
  const cents = toCents(refund);

  const approve = async () => {
    if (cents === null || cents <= 0) { setNote({ kind: "bad", text: `Enter the refund as an amount in ${currencyName(cur)}, like ${major(itemsCents) || "45"}.` }); return; }
    if (cents > most) { setNote({ kind: "bad", text: `The most you can refund is ${money(most, cur)}, what the customer paid you.` }); return; }
    if (!(await ask("Approve and refund?", `Approve this return and refund ${r.customer_name} ${money(cents, cur)}? This cannot be undone.`, "Approve and refund"))) return;
    setBusy(true); setNote(null);
    try {
      const out = await s.mapi<Data>(`/returns/${r.id}`, { body: { action: "approve", reply: reply.trim(), refund_cents: cents, restock } });
      const card = Number(out.to_card_cents ?? 0), credit = Number(out.credit_cents ?? 0);
      const where = card > 0 && credit > 0 ? `${money(card, cur)} to the customer's card and ${money(credit, cur)} as LogaLuxe store credit` : card > 0 ? "to the customer's card" : "as LogaLuxe store credit";
      setNote({ kind: "ok", text: out.provider_refund_status === "pending" ? "Return approved. Provider confirmation is pending; recovery is automatic." : `Return approved. ${money(Number(out.refund_cents ?? cents), cur)} refunded, ${where}. ${restock ? "The items are back in stock." : "Stock was not changed."}` });
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy(false);
  };

  const refuse = async () => {
    if (why.trim().length < 10) { setNote({ kind: "bad", text: "Tell the customer why, in a sentence. At least 10 characters." }); return; }
    if (!(await ask("Refuse the return?", `${r.customer_name} is emailed your message. Nothing is refunded, and the request cannot be answered again.`, "Refuse", true))) return;
    setBusy(true); setNote(null);
    try {
      await s.mapi(`/returns/${r.id}`, { body: { action: "refuse", reply: why.trim() } });
      setNote({ kind: "ok", text: "Return refused. The customer is emailed your message. Nothing was refunded." });
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy(false);
  };

  // While there is something to answer, what went wrong is said beside the button; the page is long.
  const footer = !waiting ? undefined : (
    <View style={{ gap: 10 }}>
      {note ? <Note kind={note.kind}>{note.text}</Note> : null}
      {tab === "approve"
        ? <Btn busy={busy} onPress={approve}>{cents && cents > 0 && cents <= most ? `Approve and refund ${money(cents, cur)}` : "Approve and refund"}</Btn>
        : <Btn kind="danger" busy={busy} onPress={refuse}>Refuse the return</Btn>}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.cream }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen onRefresh={refresh} refreshing={refreshing} footer={footer}>
        <Header title="Return" />
        {note && !footer ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}

        <Card style={{ marginTop: 14, padding: 16, gap: 10 }}>
          <Row between gap={10} style={{ alignItems: "flex-start" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T weight="semi" size={16}>{r.customer_name}</T>
              <T muted size={13}>Asked {stamp(r.created_at, tz)}</T>
            </View>
            <Tag kind={st.kind}>{st.label}</Tag>
          </Row>
          {r.customer_phone ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`Call ${r.customer_name} on ${r.customer_phone}`} onPress={() => Linking.openURL(tel(String(r.customer_phone))).catch(() => undefined)} style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.7 : 1 })}>
              <Icon name="phone" size={18} color={c.wine} />
              <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.wine }}>{r.customer_phone}</Text>
            </Pressable>
          ) : null}
          {r.customer_email ? <T selectable muted size={14}>{r.customer_email}</T> : null}
        </Card>

        <Grp>Why they want to send it back</Grp>
        <Card style={{ padding: 16, gap: 6 }}>
          <T weight="semi" size={16}>{reasons[r.reason] ?? r.reason}</T>
          <T size={14} muted={!r.note}>{r.note ? `“${r.note}”` : "No note from the customer."}</T>
        </Card>

        <Grp>What they bought</Grp>
        <Card>
          <Kv k="Items" v={itemsLine(items)} />
          {r.received_at ? <Kv k={r.fulfilment === "ship" ? "Shipped order" : "Collected"} v={`Finished ${dateMed(r.received_at, tz)}`} /> : null}
          <Kv k="Items total" v={money(itemsCents, cur)} />
          <Kv k="Shipping they paid you" v={shipping > 0 ? money(shipping, cur) : "None"} />
          <Kv last k="Paid to you" v={money(most, cur)} strong />
        </Card>

        {!waiting ? (
          <>
            <Grp>Your answer</Grp>
            <Card>
              {r.status === "approved" ? (
                <>
                  <Kv k={r.provider_refund_status === "pending" ? "Refund reserved" : "Refunded"} v={money(r.refund_cents, cur)} strong />
                  <Kv k="Where it went" v={refundSplit(r.refund_cents, r.credit_cents, cur)} />
                  <Kv k="Stock" v={r.restocked ? "Items put back in stock" : "Items not put back in stock"} />
                </>
              ) : <Kv k="Refused" v="Nothing refunded" strong />}
              {r.reply ? <Kv k="You said" v={`“${r.reply}”`} /> : null}
              <Kv last k="Answered by" v={r.decided_at ? `${r.decided_by || "Someone on your team"} · ${stamp(r.decided_at, tz)}` : "Not recorded"} />
            </Card>
            <Fine style={{ marginTop: 10 }}>A return is answered once. The customer was emailed this answer.</Fine>
          </>
        ) : (
          <View style={{ marginTop: 20, gap: 14 }}>
            <Tabs2 tabs={[["approve", "Approve and refund"], ["refuse", "Refuse"]]} value={tab} onChange={(k) => { setTab(k); setNote(null); }} />
            {tab === "approve" ? (
              <>
                <Field label={`Refund amount, in ${currencyName(cur)} (${symbol(cur)})`} value={refund} onChangeText={(t) => { setRefund(t); setNote(null); }} keyboardType="decimal-pad" selectTextOnFocus
                  hint={`The items came to ${money(itemsCents, cur)}. The most you can refund is ${money(most, cur)}${shipping > 0 ? ", which includes the shipping" : ""}.`} />
                <Card>
                  <Line last title="Put the items back in stock" sub="Adds what was bought back to your stock count." right={<Sw on={restock} label="Put the items back in stock" onPress={() => setRestock(!restock)} />} />
                </Card>
                <Field label="Message to the customer, optional" value={reply} onChangeText={setReply} multiline maxLength={1000} />
                <Note kind="gold">
                  {simulated
                    ? "Payments are in simulation on this server, so no card is refunded. The whole amount is recorded as LogaLuxe store credit for the customer. It comes out of your balance in Money, and LogaLuxe returns its marketplace fee on the refunded items."
                    : `The money goes back to the customer's card through ${provider} where a card paid, otherwise as LogaLuxe store credit. A card refund can take a few days to show. It comes out of your balance in Money, and LogaLuxe returns its marketplace fee on the refunded items.`}
                </Note>
                <Fine>The customer is emailed that the return is approved, with the amount and your message.</Fine>
              </>
            ) : (
              <>
                <Field label="Message to the customer" value={why} onChangeText={(t) => { setWhy(t); setNote(null); }} multiline maxLength={1000} hint="Say why, in a sentence or more. At least 10 characters. Nothing is refunded." />
                <Fine>The customer is emailed your message. A return is answered once, so a refusal cannot be changed here afterwards.</Fine>
              </>
            )}
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
