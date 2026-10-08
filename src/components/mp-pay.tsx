// How a client pays: the "Pay with" block of the confirm design (C5-Confirm), a list of kept cards
// for the account, and the small marks for Apple Pay and Google Pay.
// What is true and is said here: a kept card is charged by Stripe or Paystack with no page to fill
// in; any other card is typed on the provider's own page; Apple Pay and Google Pay are offered by
// Stripe on that page, never inside this app.
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Btn, Card, Icon, Note, Row, T } from "@/components/ui";
import { cardExpiry, cardName, keeperOf, type PayChoice, type SavedCard } from "@/lib/mp-cards";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

// ---------- Apple Pay and Google Pay ----------

function Mark({ label, children }: { label: string; children: ReactNode }) {
  return <View accessibilityLabel={label} style={{ height: 24, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, flexDirection: "row", alignItems: "center", gap: 3 }}>{children}</View>;
}
const pay = { fontFamily: f.semi, fontSize: 12, color: c.ink } as const;

/** The two small marks, side by side. */
export function WalletMarks() {
  return (
    <Row gap={6}>
      <Mark label="Apple Pay">
        <Svg width={12} height={12} viewBox="0 0 24 24" fill={c.ink}><Path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9s-1.9-.9-3.2-.8c-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8 2.2-1.2 3-2.4c.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.7-3.9zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4z" /></Svg>
        <Text style={pay}>Pay</Text>
      </Mark>
      <Mark label="Google Pay">
        <Text style={[pay, { fontFamily: f.bold }]}>G</Text>
        <Text style={pay}>Pay</Text>
      </Mark>
    </Row>
  );
}

/** Where Apple Pay and Google Pay can really be used: on Stripe's page, on a phone that has one set up. */
export function WalletLine({ align = "left" }: { align?: "left" | "center" }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: align === "center" ? "center" : undefined, flexWrap: "wrap" }}>
      <WalletMarks />
      <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted, flexShrink: 1 }}>Apple Pay and Google Pay can be used on Stripe&apos;s page, on a phone that has one set up.</Text>
    </View>
  );
}

/** True when a payment through `provider` may mention the wallets. Only Stripe offers them. */
export const walletsFor = (live: boolean, provider: string) => live && provider === "Stripe";

// ---------- the choice ----------

function Box({ on, onPress, label, children }: { on: boolean; onPress?: () => void; label: string; children: ReactNode }) {
  // The chosen box has a 2px edge; the padding gives the pixel back so nothing moves (as in the design).
  const box = { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, borderRadius: 14, backgroundColor: c.white, borderWidth: on ? 2 : 1, borderColor: on ? c.ink : c.line2, paddingVertical: on ? 11 : 12, paddingHorizontal: on ? 13 : 14 } as const;
  const body = (
    <>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.ink, alignItems: "center", justifyContent: "center" }}>{on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink }} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>{children}</View>
    </>
  );
  if (!onPress) return <View style={box}>{body}</View>;
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} style={({ pressed }) => [box, pressed && { opacity: 0.85 }]}>{body}</Pressable>;
}
const name = { fontFamily: f.semi, fontSize: 14, color: c.ink } as const;
const small = { fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted } as const;

/**
 * The ways to pay one payment. With saved cards live and the client signed in: each kept card in
 * this currency, "A different card", and a box to keep that card. Otherwise the one honest line
 * about the provider's page. `provider` is "Stripe" or "Paystack"; `wallets` adds the wallet marks.
 */
export function PayWith({ choice, provider, wallets, when = "when you confirm" }: { choice: PayChoice; provider: string; wallets: boolean; when?: string }) {
  const page = `You pay on ${provider}'s secure page. LogaLuxe never sees your card.`;
  if (!choice.on) {
    return (
      <Box on label={provider}>
        <Text style={name}>{provider}</Text>
        <Text style={small}>{page}</Text>
        {wallets ? <View style={{ marginTop: 4 }}><WalletLine /></View> : null}
      </Box>
    );
  }
  const fresh = choice.chosen === "new";
  return (
    <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
      {choice.cards.map((k) => (
        <Box key={k.id} on={choice.chosen === k.id} label={`${cardName(k)}, saved card`} onPress={() => choice.choose(k.id)}>
          <Text style={name}>{cardName(k)}</Text>
          <Text style={small}>{["Saved card", cardExpiry(k), choice.chosen === k.id ? `charged ${when}` : ""].filter(Boolean).join(" · ")}</Text>
        </Box>
      ))}
      <Box on={fresh} label={choice.cards.length ? "A different card" : provider} onPress={() => choice.choose("new")}>
        <Text style={name}>{choice.cards.length ? "A different card" : provider}</Text>
        <Text style={small}>{page}</Text>
        {wallets ? <View style={{ marginTop: 4 }}><WalletLine /></View> : null}
      </Box>
      {fresh ? (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: choice.keep }} accessibilityLabel="Keep this card for next time" onPress={() => choice.setKeep(!choice.keep)} style={{ flexDirection: "row", gap: 12, minHeight: 44, alignItems: "center" }}>
          <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: c.ink, backgroundColor: choice.keep ? c.ink : c.white, alignItems: "center", justifyContent: "center" }}>{choice.keep ? <Icon name="check" size={15} color={c.cream} stroke={3} /> : null}</View>
          <Text style={{ flex: 1, fontFamily: f.medium, fontSize: 14, lineHeight: 20, color: c.ink }}>Keep this card for next time</Text>
        </Pressable>
      ) : null}
      <Text style={small}>{choice.card
        ? `If your bank asks you to approve the payment, or the card is refused, ${provider}'s page opens instead. `
        : ""}Your card is kept by {provider}, not by LogaLuxe. You can remove it any time in your account.</Text>
    </View>
  );
}

// ---------- the account's list ----------

/** The kept cards with a way to remove each. Removing asks once more before it is done. */
export function CardList({ cards, onChanged }: { cards: SavedCard[]; onChanged: () => void }) {
  const s = useSession();
  const [asking, setAsking] = useState("");
  const [busy, setBusy] = useState("");
  const [said, setSaid] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const remove = async (k: SavedCard) => {
    setBusy(k.id); setSaid(null);
    try {
      await s.capi(`/auth/cards/${encodeURIComponent(k.id)}`, { method: "DELETE" });
      setSaid({ kind: "ok", text: `${cardName(k)} was removed.` });
      onChanged();
    } catch (e) {
      setSaid({ kind: "bad", text: (e as Error).message });
    }
    setBusy(""); setAsking("");
  };

  return (
    <View style={{ gap: 10 }}>
      {said ? <Note kind={said.kind}>{said.text}</Note> : null}
      {cards.length === 0 ? (
        <Card style={{ padding: 16, gap: 4 }}>
          <T weight="semi" size={15}>No saved cards</T>
          <T size={13} muted>The next time you pay a deposit or a tip, tick &quot;Keep this card for next time&quot; and it appears here.</T>
        </Card>
      ) : (
        <Card style={{ paddingHorizontal: 16 }}>
          {cards.map((k, i) => (
            <View key={k.id} style={{ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, gap: 10 }}>
              <Row gap={12}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.cream2, alignItems: "center", justifyContent: "center" }}><Icon name="card" size={18} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T weight="semi" size={14}>{cardName(k)}</T>
                  <T size={12} muted>{[cardExpiry(k), `for payments in ${k.currency === "NGN" ? "naira" : "US dollars"}`, `kept by ${keeperOf(k)}`].filter(Boolean).join(" · ")}</T>
                </View>
                {asking === k.id ? null : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${cardName(k)}`} onPress={() => { setAsking(k.id); setSaid(null); }} hitSlop={6} style={{ minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" }}>
                    <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>Remove</Text>
                  </Pressable>
                )}
              </Row>
              {asking === k.id ? (
                <View accessibilityRole="alert" style={{ gap: 8 }}>
                  <T size={13}>Remove this card? You can keep it again the next time you pay.</T>
                  <Row gap={8}>
                    <Btn small kind="danger" busy={busy === k.id} onPress={() => void remove(k)} style={{ minHeight: 44 }}>Remove card</Btn>
                    <Btn small kind="out" disabled={busy === k.id} onPress={() => setAsking("")} style={{ minHeight: 44 }}>Keep it</Btn>
                  </Row>
                </View>
              ) : null}
            </View>
          ))}
        </Card>
      )}
      <T size={12} muted>Card numbers are kept by Stripe (US dollars) and Paystack (naira), not by LogaLuxe. A card can pay only in its own currency.</T>
    </View>
  );
}
