// Account and wallet (design: C9-Account). Everything shown comes from the account: the design's

// loyalty tier, beauty profile, family profiles, saved cards, reminder settings and language are left

// out because the product has nothing behind them.

import { router } from "expo-router";

import { useState } from "react";

import { Linking, Pressable, Text, View } from "react-native";

import { Grp, Item, Rows, SignInGate, TabTitle } from "@/components/cc-ui";

import { Avatar, Btn, Failed, IconButton, Loading, Note, Row, Screen, T } from "@/components/ui";

import { WEB_URL, type Row as Data } from "@/lib/api";

import { inCountry, moneyName, providerName, shopHref, usePlace } from "@/lib/ca-place";

import { useRefocus } from "@/lib/cc-data";

import { money, plural } from "@/lib/format";

import { cardName, useCards } from "@/lib/mp-cards";

import { useLoad } from "@/lib/use-load";

import { useFeatures } from "@/lib/mp-features";

import { useShopHandoff } from "@/lib/shop-handoff";

import { useSession } from "@/lib/session";

import { c, f } from "@/lib/theme";



const web = (path: string) => void Linking.openURL(WEB_URL + path);

const names = (list: string[], none: string) => (list.length === 0 ? none : list.length <= 3 ? list.join(", ") : `${list.slice(0, 3).join(", ")} and ${list.length - 3} more`);



export default function Profile() {

  const s = useSession();

  const shop = useShopHandoff();

  const ft = useFeatures();

  const [sent, setSent] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const [sending, setSending] = useState(false), [leaving, setLeaving] = useState(false);

  const kept = useCards(); // shown only while saved cards are switched on

  const w = usePlace();



  // Each part is asked on its own, so one that fails does not hide the rest.

  const q = useLoad(async () => {

    if (!s.clientToken) return null;

    const [me, favs, prods, wallet, referral] = await Promise.all([

      s.capi<{ user: Data; summary: Data }>("/auth/me?paged=1&scope=upcoming"),

      s.capi<{ favourites: Data[] }>("/auth/favourites").catch(() => null),

      s.capi<{ products: Data[] }>("/auth/favourite-products").catch(() => null),

      s.capi<{ wallet: Data[]; credit_cents?: number; credit_balances?: Record<string, number> }>("/auth/wallet").catch(() => null),

      s.capi<Data>("/auth/referral").catch(() => null),

    ]);

    return { summary: me.summary, user: me.user, favs: favs?.favourites, prods: prods?.products, wallet, referral };

  }, [s.clientToken]);

  useRefocus(() => { if (s.clientToken) q.refresh(); });



  if (!s.ready) return <View style={{ flex: 1, backgroundColor: c.cream }} />;

  if (!s.clientToken) {

    // Someone signed in only to their business still needs the way back to it.

    const business = s.businessToken

      ? <Item title="Switch to my business" sub={s.merchant?.business ? String(s.merchant.business) : "Your calendar, clients and payouts"} onPress={() => { s.setMode("business"); router.replace("/business/today" as never); }} />

      : <Item title="I run a business" sub="Sign in to your calendar, clients and payouts" onPress={() => router.push("/sign-in?side=business" as never)} />;

    return <SignInGate title="Account" next="/client/profile" extra={<View style={{ marginTop: 12 }}><Rows>{business}</Rows></View>}>Your details, saved places, packages, memberships and points are kept with your account.</SignInGate>;

  }

  if (!q.data) return <Screen><TabTitle title="Account" />{q.error ? <View style={{ marginTop: 18 }}><Failed error={q.error} onRetry={q.reload} /></View> : <Loading label="Loading your account" />}</Screen>;



  const { user, favs, prods, wallet, referral } = q.data;

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");

  const held = wallet?.wallet ?? [];

  const points = held.reduce((n, w) => n + (Number(w.points) || 0), 0);

  const passes = held.reduce((n, w) => n + ((w.plans ?? []) as Data[]).length, 0);

  const creditCurrency = w.scope === "NG" ? "NGN" : "USD";
  const credit = Number(wallet?.credit_balances?.[creditCurrency] ?? (creditCurrency === "USD" ? wallet?.credit_cents ?? referral?.balance_cents : 0)) || 0;

  // The invitation shows only while the programme is switched on and there is a link to share.

  const inviting = !!referral?.on && !!referral.link && !!referral.code && Number(referral.credit_cents) > 0;



  const resend = async () => {

    setSending(true); setSent(null);

    try {

      const out = await s.capi<Data>("/auth/verify/send", { method: "POST", body: {} });

      if (out.already) { await s.refresh(); q.refresh(); setSent({ kind: "ok", text: "Your email is already confirmed." }); }

      else setSent({ kind: "ok", text: `We sent a new link to ${out.email}. It works for 48 hours.` });

    } catch (e) {

      setSent({ kind: "bad", text: (e as Error).message });

    }

    setSending(false);

  };



  const signOut = async () => { setLeaving(true); await s.signOut("client"); setLeaving(false); router.replace("/client/home"); };



  return (

    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>

      <TabTitle title="Account" right={<IconButton icon="settings" label="Details and password" onPress={() => router.push("/c/account/details" as never)} />} />



      {q.error ? <Failed error={q.error} onRetry={q.reload} /> : null}

      <Row gap={14} style={{ marginTop: 18 }}>

        <Avatar name={name || user.email} tone={c.ink} size={64} />

        <View style={{ flex: 1, minWidth: 0 }}>

          <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 18, color: c.ink }}>{name}</Text>

          <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 13, color: c.muted }}>{user.email}</Text>

          <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 13, color: c.muted }}>{user.phone || "No mobile number yet"}</Text>

        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Edit your details" onPress={() => router.push("/c/account/details" as never)} style={{ minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" }}>

          <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>Edit</Text>

        </Pressable>

      </Row>



      {user.email_verified === false && user.email ? (

        <View accessibilityRole="alert" style={{ marginTop: 18, backgroundColor: c.goldBg, borderRadius: 16, padding: 14, gap: 10 }}>

          <T size={14} color={c.goldInk}>Please confirm your email. We sent a link to <T size={14} weight="semi" color={c.goldInk}>{user.email}</T>. You need it to leave reviews.</T>

          <Btn small kind="out" busy={sending} onPress={resend} style={{ alignSelf: "flex-start" }}>Send the link again</Btn>

        </View>

      ) : null}

      {sent ? <View style={{ marginTop: 12 }}><Note kind={sent.kind}>{sent.text}</Note></View> : null}



      <Pressable accessibilityRole="button" accessibilityLabel={`Wallet. Store credit ${money(credit, creditCurrency)}, ${plural(points, "point")}, ${plural(passes, "pass", "passes")}. Open wallet`} onPress={() => router.push("/c/account/wallet" as never)}

        style={({ pressed }) => ({ marginTop: 18, backgroundColor: c.wine, borderRadius: 20, padding: 16, flexDirection: "row", gap: 8, opacity: pressed ? 0.9 : 1 })}>

        <Stat k="Credit" v={wallet || referral ? money(credit, creditCurrency) : "…"} />

        <Stat k="Points" v={wallet ? points.toLocaleString("en-US") : "…"} />

        <Stat k="Passes" v={wallet ? String(passes) : "…"} />

      </Pressable>

      {!wallet ? <T size={12} muted style={{ marginTop: 6 }}>Your wallet could not be loaded just now. Pull down to try again.</T> : null}



      <Grp>At a glance</Grp>

      <Rows>

        <Item title="Upcoming visits" sub={String(q.data.summary?.upcoming ?? 0)} onPress={() => router.push("/client/bookings" as never)} />

        <Item title="Active orders" sub={String(q.data.summary?.active_orders ?? 0)} onPress={() => router.push("/c/account/orders" as never)} />

        <Item title="Unread messages" sub={String(q.data.summary?.unread ?? 0)} onPress={() => router.push("/client/inbox" as never)} />

      </Rows>

      <Grp>Saved</Grp>

      <Rows>

        <Item icon="heart" title="Saved businesses" sub={favs ? names(favs.map((x) => String(x.name)), "None yet. Save a business to keep it here") : "Could not be loaded just now"} onPress={() => router.push("/c/account/saved" as never)} />

        <Item icon="shop" title="Saved products" sub={prods ? names(prods.map((x) => String(x.name)), "None yet. Use the heart on a product in the shop") : "Could not be loaded just now"} onPress={() => router.push("/c/account/saved?tab=products" as never)} />

      </Rows>



      {shop.error ? <Note kind="bad">{shop.error}</Note> : null}

      {shop.busy ? <T size={13}>Opening secure shop…</T> : null}

      <Grp>Wallet and orders</Grp>

      <Rows>

        <Item icon="wallet" title="Wallet" sub={wallet ? (held.length ? `Packages, memberships and points at ${names(held.map((w) => String(w.business)), "")}` : "Packages, memberships, points and store credit") : "Could not be loaded just now"} onPress={() => router.push("/c/account/wallet" as never)} />

        {kept.on ? <Item icon="card" title="Saved cards" sub={kept.cards.length ? names(kept.cards.map(cardName), "") : "None yet. Keep a card the next time you pay"} onPress={() => router.push("/c/account/wallet" as never)} /> : null}

        <Item icon="shop" title="The shop" sub={`Products from the professionals you book, priced in ${moneyName(w.scope)}. Opens securely with your app account`} onPress={() => void shop.open(shopHref(w.scope))} />

        <Item icon="card" title="Gift cards" sub={`For someone in ${inCountry(w.scope)}, in ${moneyName(w.scope)}, paid on ${providerName(w.scope)}. Opens securely with your app account`} onPress={() => void shop.open(`/gift-cards?country=${w.scope.toLowerCase()}`)} />

        <Item icon="card" title="Shop orders" sub="Purchases, payment and delivery progress" onPress={() => router.push("/c/account/orders" as never)} />

      </Rows>



      <Grp>More</Grp>

      <Rows>

        {inviting ? <Item title="Invite a friend" sub={`You each get ${money(referral!.credit_cents, "USD")} of credit after their first visit or order`} onPress={() => router.push("/c/account/wallet" as never)} /> : null}

        <Item title="Journal" sub="Articles on hair, braids, nails, skin and more, written for here" onPress={() => router.push("/c/journal" as never)} />

        <Item title="Details and password" sub={user.phone && user.phone_verified === false && ft.sms_login ? "Your mobile number is not confirmed yet" : "Your name, mobile number and password"} onPress={() => router.push("/c/account/details" as never)} />

        <Item icon="pin" title={w.source === "picked" || w.source === "device" ? "Forget my location" : "Where you are looking"} sub={w.place ? (w.source === "device" ? `Near you, around ${w.place.label}. Forget it and go back to our first guess` : w.source === "picked" ? `You chose ${w.place.label}. Forget it and go back to our first guess` : `${w.place.label}, our guess. Change it from the top of Home`) : "Not set yet"} onPress={() => { if (w.source === "picked" || w.source === "device") { void w.forget(); setSent({ kind: "ok", text: "Your location is forgotten. Home shows our first guess again." }); } else router.navigate("/client/home" as never); }} />

        <Item title="Help" sub="Answers, and how to write to us" onPress={() => web("/help")} />

        <Item title="Terms" sub="Opens on the LogaLuxe website" onPress={() => web("/legal/terms")} />

        <Item title="Privacy and devices" sub="Export your data, manage sign-ins or delete your account" onPress={() => router.push("/c/account/privacy" as never)} />

        <Item title="Cancellation policy" sub="What happens to a deposit when plans change" onPress={() => web("/legal/cancellation")} />

        {s.businessToken

          ? <Item title="Switch to my business" sub={s.merchant?.business ? String(s.merchant.business) : "Your calendar, clients and payouts"} onPress={() => { s.setMode("business"); router.replace("/business/today" as never); }} />

          : <Item title="I run a business" sub="Sign in to your calendar, clients and payouts" onPress={() => router.push("/sign-in?side=business" as never)} />}

      </Rows>



      <Btn kind="out" icon="out" busy={leaving} onPress={signOut} style={{ marginTop: 18 }}>Sign out</Btn>

    </Screen>

  );

}



function Stat({ k, v }: { k: string; v: string }) {

  return (

    <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,.1)", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 }}>

      <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.44, textTransform: "uppercase", color: "#F1D9DC" }}>{k}</Text>

      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: f.bold, fontSize: 18, color: "#F4ECE3", marginTop: 2 }}>{v}</Text>

    </View>

  );

}

