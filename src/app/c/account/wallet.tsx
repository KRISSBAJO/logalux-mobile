// Wallet (opened from Account): store credit, and the packages, memberships and points the client holds
// at each business. The invitation card shows only while LogaLuxe has the programme switched on, and
// "Saved cards" only while an admin has saved cards switched on.
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { BackTitle, Grp } from "@/components/cc-ui";
import { CardList } from "@/components/mp-pay";
import { Avatar, Btn, Card, Empty, Failed, Loading, Note, Pill, Row, Screen, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { useRefocus } from "@/lib/cc-data";
import { money, plural } from "@/lib/format";
import { useCards } from "@/lib/mp-cards";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

/** "28 October 2026" */
const day = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${d.toLocaleDateString("en-US", { timeZone: "UTC", month: "long" })} ${d.getUTCFullYear()}`;
};
const dateOnly = (v: unknown) => day(String(v).slice(0, 10) + "T12:00:00Z");

export default function Wallet() {
  const s = useSession();
  const [shared, setShared] = useState("");
  const kept = useCards();

  const q = useLoad(async () => {
    if (!s.clientToken) return null;
    const [w, r] = await Promise.all([
      s.capi<{ wallet: Data[]; credit_cents?: number }>("/auth/wallet"),
      // The invitation is an extra: if it cannot be read, the wallet still shows.
      s.capi<Data>("/auth/referral").catch(() => null),
    ]);
    return { wallet: w.wallet ?? [], credit: Number(w.credit_cents ?? r?.balance_cents) || 0, referral: r };
  }, [s.clientToken]);
  useRefocus(() => { if (s.clientToken) q.refresh(); });

  if (!s.ready) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
  if (!s.clientToken) {
    return (
      <Screen><BackTitle title="Wallet" />
        <Card style={{ marginTop: 18, padding: 22, gap: 12 }}>
          <T weight="semi" size={16}>Sign in to see your wallet</T>
          <Btn onPress={() => router.push("/sign-in?next=%2Fc%2Faccount%2Fwallet" as never)}>Sign in</Btn>
        </Card>
      </Screen>
    );
  }
  if (!q.data) return <Screen><BackTitle title="Wallet" /><View style={{ marginTop: 18 }}>{q.error ? <Failed error={q.error} onRetry={q.reload} /> : <Loading label="Loading your wallet" />}</View></Screen>;

  const { wallet, credit, referral } = q.data;
  const history = (referral?.history ?? []) as Data[];
  const inviting = !!referral?.on && !!referral.link && !!referral.code && Number(referral.credit_cents) > 0;
  const showCredit = credit !== 0 || history.length > 0 || inviting;

  const share = async () => {
    setShared("");
    try {
      await Share.share({ message: `Join me on LogaLuxe: ${referral!.link}` });
    } catch {
      setShared(`Copy this link: ${referral!.link}`);
    }
  };

  return (
    <Screen onRefresh={() => { q.refresh(); void kept.reload(); }} refreshing={q.refreshing}>
      <BackTitle title="Wallet" />

      {showCredit ? (
        <View style={{ marginTop: 18, backgroundColor: c.wine, borderRadius: 20, padding: 16, gap: 4 }}>
          <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.44, textTransform: "uppercase", color: "#F1D9DC" }}>Store credit</Text>
          <Text style={{ fontFamily: f.bold, fontSize: 30, color: "#F4ECE3" }}>{money(credit, "USD")}</Text>
          <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: "#F1D9DC", marginTop: 4 }}>Credit is in US dollars. It comes off your next shop order in dollars by itself, after any promo code or gift card. It is not used on an order in naira.</Text>
        </View>
      ) : null}

      {history.length > 0 ? (
        <>
          <Grp>Credit history</Grp>
          <Card style={{ paddingHorizontal: 16 }}>
            {history.map((h, i) => (
              <Row key={i} between style={{ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, alignItems: "flex-start" }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T size={14}>{String(h.reason)}</T>
                  <T size={12} muted>{day(h.created_at)}</T>
                </View>
                <T size={14} weight="semi" color={h.amount_cents < 0 ? c.muted : c.ok}>{h.amount_cents < 0 ? `-${money(-h.amount_cents, "USD")}` : `+${money(h.amount_cents, "USD")}`}</T>
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      {inviting && referral ? (
        <>
          <Grp>Invite a friend</Grp>
          <Card style={{ padding: 16, gap: 10 }}>
            <T weight="semi" size={18}>You each get {money(referral.credit_cents, "USD")} of credit</T>
            <T size={13} muted>A friend joins with your link, confirms their email, and pays for a first visit or has a first order delivered. Then you each get the credit. Credit is in US dollars and is spent on shop orders priced in dollars.</T>
            <View style={{ backgroundColor: c.cream, borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 10 }}>
              <T size={13} selectable>{String(referral.link)}</T>
            </View>
            <Row between>
              <T size={14}>Your code: <T size={14} weight="semi" selectable style={{ letterSpacing: 1.1 }}>{String(referral.code)}</T></T>
              <Btn small icon="share" onPress={share}>Share link</Btn>
            </Row>
            {shared ? <Note kind="gold">{shared}</Note> : null}
            <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10 }}>
              <T size={13} muted>{referral.friends_joined > 0 ? `${plural(referral.friends_joined, "friend has", "friends have")} joined · ${referral.friends_paid} ${referral.friends_paid === 1 ? "has" : "have"} made a first purchase` : "No friends have joined with your link yet."}</T>
            </View>
          </Card>
        </>
      ) : null}

      {kept.on ? (
        <>
          <Grp>Saved cards</Grp>
          <CardList cards={kept.cards} onChanged={() => void kept.reload()} />
        </>
      ) : null}

      <Grp>At each business</Grp>
      <T size={13} muted style={{ marginBottom: 12 }}>Packages, memberships and points belong to the business you got them from. They are used there when you pay: tell them at the desk.</T>
      <View style={{ gap: 12 }}>
        {wallet.map((w) => {
          const plans = (w.plans ?? []) as Data[];
          return (
            <Card key={w.slug} style={{ padding: 14 }}>
              <Row gap={12}>
                <Avatar name={w.business} tone={w.tone} />
                <Pressable accessibilityRole="link" accessibilityLabel={`Open ${w.business}`} onPress={() => router.push(`/c/b/${w.slug}` as never)} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
                  <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{w.business}</Text>
                </Pressable>
                <Btn small kind="out" onPress={() => router.push(`/c/b/${w.slug}` as never)}>Book</Btn>
              </Row>
              {plans.map((p) => {
                const credits = (p.credits ?? []) as Data[], member = p.kind === "membership";
                const benefits = [p.service_discount_pct > 0 ? `${p.service_discount_pct}% off services` : "", p.retail_discount_pct > 0 ? `${p.retail_discount_pct}% off products` : ""].filter(Boolean);
                return (
                  <View key={p.id} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line, gap: 6 }}>
                    <Row gap={8} wrap>
                      <Text style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{p.name}</Text>
                      <Pill>{member ? "Membership" : "Package"}</Pill>
                      {p.status === "past_due" ? <Pill kind="wine">Payment overdue</Pill> : null}
                    </Row>
                    {member ? (
                      <T size={13} muted>
                        {benefits.length ? benefits.join(" · ") : "No discount with this membership"}
                        {p.renews_on ? ` · renews ${dateOnly(p.renews_on)}${p.price_cents > 0 ? ` for ${money(p.price_cents, w.currency)}` : ""}` : ""}
                        {" · "}{p.card_on_file ? "paid from the card on file" : "no card on file: you pay at the business"}
                      </T>
                    ) : null}
                    {p.status === "past_due" ? <Note kind="bad">The last payment did not go through{p.charge_problem ? `: ${p.charge_problem}` : ""}. Speak to {w.business} to keep this membership.</Note> : null}
                    {!member && p.expires_at ? <T size={13} muted>Use by {day(p.expires_at)}</T> : null}
                    {credits.map((k) => (
                      <Row key={k.id} between style={{ alignItems: "flex-start" }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <T size={14}>{String(k.service)}</T>
                          {k.expires_at ? <T size={12} muted>use by {day(k.expires_at)}</T> : null}
                          {!k.usable && k.left > 0 ? <T size={12} color={c.bad}>cannot be used now</T> : null}
                        </View>
                        <T size={14} weight="semi">{k.left} of {k.total} left</T>
                      </Row>
                    ))}
                  </View>
                );
              })}
              {w.points > 0 ? (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line, gap: 2 }}>
                  <T size={14}><T size={14} weight="semi">{plural(w.points, "point")}</T>{w.points_value_cents > 0 ? ` · worth ${money(w.points_value_cents, w.currency)}` : ""}</T>
                  {w.min_redeem > 0 ? <T size={13} muted>{w.points >= w.min_redeem ? "Ready to use on your next visit" : `Can be used from ${plural(w.min_redeem, "point")}`}</T> : null}
                </View>
              ) : null}
            </Card>
          );
        })}
        {wallet.length === 0 ? <Empty title="Nothing here yet">A package or membership you buy from a business, and points you earn there, appear here.</Empty> : null}
      </View>
    </Screen>
  );
}
