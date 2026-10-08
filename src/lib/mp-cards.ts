// Saved cards: the cards a signed-in client has kept with Stripe or Paystack, and the choice of
// one of them (or a different card) when paying. LogaLuxe never holds a card number; the API
// answers with the brand and the last four digits only. All of it is hidden while the feature is off.
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useFeatures } from "./mp-features";
import { useSession } from "./session";

export type SavedCard = { id: string; provider: string; currency: string; brand: string; last4: string; exp_month: number; exp_year: number };

const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", verve: "Verve", diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay" };
/** "Visa ending 4242" */
export const cardName = (k: SavedCard) => {
  const b = String(k.brand ?? "").trim().toLowerCase();
  return `${BRANDS[b] ?? (b ? b[0].toUpperCase() + b.slice(1) : "Card")} ending ${k.last4}`;
};
/** "expires 04/27", or "" when the provider did not say. */
export const cardExpiry = (k: SavedCard) => (k.exp_month && k.exp_year ? `expires ${String(k.exp_month).padStart(2, "0")}/${String(k.exp_year).slice(-2)}` : "");
/** The company that keeps the card and takes the payment. */
export const keeperOf = (k: SavedCard) => (k.provider === "paystack" ? "Paystack" : "Stripe");

/**
 * The client's kept cards. `on` is true only while saved cards are live, the person is signed in
 * and the API agrees (`enabled`); when it is false nothing about saved cards should be shown.
 * The list is read again each time the screen comes back into view.
 */
export function useCards() {
  const s = useSession();
  const ft = useFeatures();
  const want = ft.saved_cards && !!s.clientToken;
  const [got, setGot] = useState<{ enabled: boolean; cards: SavedCard[] } | null>(null);
  const [error, setError] = useState("");
  const turn = useRef(0);
  const capi = s.capi;
  const load = useCallback(async () => {
    const mine = ++turn.current;
    if (!want) { setGot(null); setError(""); return; }
    try {
      const out = await capi<{ enabled?: boolean; cards?: SavedCard[] }>("/auth/cards");
      if (mine === turn.current) { setGot({ enabled: out.enabled === true, cards: Array.isArray(out.cards) ? out.cards : [] }); setError(""); }
    } catch (e) {
      if (mine === turn.current) setError((e as Error).message || "Your saved cards could not be loaded.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, s.clientToken]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const on = want && !!got?.enabled;
  return { on, loading: want && !got && !error, error: want ? error : "", cards: on ? got!.cards : [], reload: load };
}

export type PayChoice = ReturnType<typeof usePayChoice>;

/**
 * How the client pays one payment in `currency`: with a kept card in that currency, or with a
 * different card on the provider's page, which they may ask to keep. `fields()` is what to add to
 * the payment call: nothing at all while saved cards are off or the person is a guest.
 */
export function usePayChoice(currency: string) {
  const all = useCards();
  const cards = all.cards.filter((k) => k.currency === currency);
  const [pick, setPick] = useState("");
  const [keep, setKeep] = useState(false);
  // The first kept card is offered first; a card that was removed elsewhere is not left chosen.
  const chosen = pick === "new" || cards.some((k) => k.id === pick) ? pick : cards[0]?.id ?? "new";
  const card = cards.find((k) => k.id === chosen) ?? null;
  const fields = (): { card_id?: string; save_card?: boolean } => (!all.on ? {} : card ? { card_id: card.id } : keep ? { save_card: true } : {});
  return { on: all.on, cards, chosen, card, choose: setPick, keep: keep && !card, setKeep, fields, reload: all.reload };
}
