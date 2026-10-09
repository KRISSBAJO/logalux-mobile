// Saved businesses and saved products (opened from Account). A business opens in the app; a product opens
// its page on the website, because the shop is not part of the app.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Acts, ActBtn, BackTitle, Seg } from "@/components/cc-ui";
import { Avatar, Btn, Card, Empty, Failed, Loading, Note, Row, Stars } from "@/components/ui";
import { api, media, type Row as Data } from "@/lib/api";
import { CountryBanner } from "@/components/ca-country-banner";
import { shopHref, usePlace } from "@/lib/ca-place";
import { useRefocus } from "@/lib/cc-data";
import { money } from "@/lib/format";
import { useLoad } from "@/lib/use-load";
import { useShopHandoff } from "@/lib/shop-handoff";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

type Tab = "businesses" | "products";

export default function Saved() {
  const p = useLocalSearchParams<{ tab?: string }>();
  const s = useSession();
  const shop = useShopHandoff();
  const w = usePlace();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(p.tab === "products" ? "products" : "businesses");
  const [busy, setBusy] = useState(""), [said, setSaid] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const q = useLoad(async () => {
    if (!s.clientToken) return null;
    const [biz, prods] = await Promise.all([
      s.capi<{ favourites: Data[] }>("/auth/favourites").then((r) => r.favourites ?? [], () => null),
      s.capi<{ products: Data[] }>("/auth/favourite-products").then((r) => r.products ?? [], () => null),
    ]);
    if (!biz && !prods) throw new Error("We could not load your saved list just now. Try again in a moment.");
    // The saved list does not say what each product is priced in, so each product is asked.
    // A price is shown only once its currency is known.
    await Promise.all((prods ?? []).slice(0, 60).map(async (x) => {
      x.currency = (await api<{ product: Data }>(`/products/${encodeURIComponent(x.slug)}`).catch(() => null))?.product?.currency;
    }));
    return { biz, prods };
  }, [s.clientToken]);
  useRefocus(() => { if (s.clientToken) q.refresh(); });

  const remove = async (kind: Tab, slug: string) => {
    setBusy(slug); setSaid(null);
    try {
      await s.capi(`/auth/${kind === "businesses" ? "favourites" : "favourite-products"}/${encodeURIComponent(slug)}`, { method: "DELETE" });
      setSaid({ kind: "ok", text: kind === "businesses" ? "Removed from your saved businesses." : "Removed from your saved products." });
      await q.refresh();
    } catch (e) {
      setSaid({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  if (!s.ready) return <View style={{ flex: 1, backgroundColor: c.cream }} />;
  const list = q.data ? (tab === "businesses" ? q.data.biz : q.data.prods) : [];

  const header = (
    <View style={{ paddingBottom: 14 }}>
      <BackTitle title="Saved" />
      {!s.clientToken ? (
        <Card style={{ marginTop: 18, padding: 22, gap: 12 }}>
          <Text style={{ fontFamily: f.semi, fontSize: 16, color: c.ink }}>Sign in to see what you saved</Text>
          <Btn onPress={() => router.push("/sign-in?next=%2Fc%2Faccount%2Fsaved" as never)}>Sign in</Btn>
        </Card>
      ) : (
        <>
          <View style={{ marginTop: 18 }}><Seg<Tab> options={[["businesses", "Businesses"], ["products", "Products"]]} value={tab} onChange={(t) => { setTab(t); setSaid(null); }} /></View>
          {tab === "products" ? <CountryBanner style={{ marginTop: 12 }} /> : null}
          {said ? <View style={{ marginTop: 12 }}><Note kind={said.kind}>{said.text}</Note></View> : null}
          {q.error && !q.data ? <View style={{ marginTop: 14 }}><Failed error={q.error} onRetry={q.reload} /></View> : null}
          {q.loading && !q.data ? <Loading label="Loading your saved list" /> : null}
          {q.data && list === null ? <View style={{ marginTop: 14 }}><Failed error={`We could not load your saved ${tab} just now.`} onRetry={q.reload} /></View> : null}
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={s.clientToken ? list ?? [] : []}
        keyExtractor={(x) => x.slug}
        contentContainerStyle={{ paddingHorizontal: pad, paddingTop: insets.top + 12, paddingBottom: 28 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        refreshControl={s.clientToken ? <RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={c.wine} /> : undefined}
        renderItem={({ item: x }) => (tab === "businesses" ? (
          <Card style={{ padding: 14 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${x.name}`} onPress={() => router.push(`/c/b/${x.slug}` as never)}>
              <Row gap={14}>
                <Avatar name={x.name} tone={x.tone} size={48} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{x.name}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 13, color: c.muted, marginTop: 2 }}>{[x.area, x.city && x.city !== x.area ? x.city : ""].filter(Boolean).join(", ") || "Location not listed"}</Text>
                  <Row gap={8} style={{ marginTop: 4 }}>
                    {x.review_count > 0 ? <Stars rating={x.rating} count={x.review_count} /> : <Text style={{ fontFamily: f.body, fontSize: 13, color: c.muted }}>No reviews yet</Text>}
                    {x.from_cents ? <Text style={{ fontFamily: f.body, fontSize: 13, color: c.muted }}>from <Text style={{ fontFamily: f.semi, color: c.ink }}>{money(x.from_cents, x.currency)}</Text></Text> : null}
                  </Row>
                </View>
              </Row>
            </Pressable>
            <Acts>
              <ActBtn kind="ink" onPress={() => router.push(`/c/b/${x.slug}` as never)}>Book</ActBtn>
              <ActBtn busy={busy === x.slug} onPress={() => void remove("businesses", x.slug)}>Remove</ActBtn>
            </Acts>
          </Card>
        ) : (
          <Product x={x} busy={busy === x.slug} onRemove={() => void remove("products", x.slug)} />
        ))}
        ListEmptyComponent={s.clientToken && q.data && list ? (
          tab === "businesses"
            ? <Empty title="No businesses saved yet" action={<Btn small onPress={() => router.push("/client/search" as never)}>Find a professional</Btn>}>Use Save on a business page to keep it here.</Empty>
            : <Empty title="No products saved yet" action={<Btn small kind="out" onPress={() => void shop.open(shopHref(w.scope))}>Visit the shop on the website</Btn>}>Use the heart on a product in the shop to keep it here.</Empty>
        ) : null}
      />
    </View>
  );
}

function Product({ x, busy, onRemove }: { x: Data; busy: boolean; onRemove: () => void }) {
  const sizes = ((x.sizes ?? []) as Data[]).map((z) => Number(z.price_cents)).filter((n) => Number.isFinite(n) && n > 0);
  const lowest = Math.min(Number(x.price_cents), ...sizes);
  const shop = useShopHandoff();
  const view = () => void shop.open(`/shop/${encodeURIComponent(x.slug)}${x.currency === "NGN" ? "?country=ng" : x.currency === "USD" ? "?country=us" : ""}`);
  const uri = media(x.photo_id);
  return (
    <Card style={{ padding: 14 }}>
      <Pressable accessibilityRole="link" accessibilityLabel={`${x.name}. Opens on the LogaLuxe website`} onPress={view}>
        <Row gap={14}>
          <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: x.tone || c.photo, overflow: "hidden" }}>
            {uri ? <Image source={{ uri }} accessibilityIgnoresInvertColors style={{ width: 56, height: 56 }} /> : null}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{x.name}</Text>
            <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 13, color: c.muted, marginTop: 2 }}>Sold by {x.seller_name}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 13, color: c.muted, marginTop: 2 }}>
              {x.currency ? <Text style={{ fontFamily: f.semi, color: c.ink }}>{lowest < Number(x.price_cents) ? `From ${money(lowest, x.currency)}` : money(x.price_cents, x.currency)}</Text> : "See the price on its page"}
              {Number(x.stock) <= 0 ? " · out of stock" : ""}
            </Text>
          </View>
        </Row>
      </Pressable>
      {shop.error ? <Note kind="bad">{shop.error}</Note> : null}
      <Acts>
        <ActBtn kind="ink" busy={shop.busy} onPress={view}>View on the website</ActBtn>
        <ActBtn busy={busy} onPress={onRemove}>Remove</ActBtn>
      </Acts>
    </Card>
  );
}
