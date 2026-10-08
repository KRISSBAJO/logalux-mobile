// The client's Home (design: Main). Everything on it is for the chosen city and comes from the API:
// the client's own next booking and last visit, the saved businesses, and rows of businesses in the city.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { BusinessTile, profileHref } from "@/components/ca-business-card";
import { Avatar, Btn, Card, Chip, Empty, Failed, Icon, IconButton, Loading, Pill, Row, Screen, Serif, T } from "@/components/ui";
import { api, qs, type Row as Data } from "@/lib/api";
import { CITIES, useCity } from "@/lib/ca-city";
import { bookAt, CATEGORIES, loadCovers, loadOpenings, slotLabel, type Biz, type Opening, type Openings } from "@/lib/ca-data";
import { useSaved } from "@/lib/ca-saved";
import { clock, dayShort, firstName, money, when } from "@/lib/format";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const HERE = "/client/home";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** A sideways row of businesses under a heading. */
function Shelf({ title, onSeeAll, items, render }: { title: string; onSeeAll?: () => void; items: Biz[]; render: (b: Biz) => ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Row between style={{ paddingHorizontal: pad, marginBottom: 12 }}>
        <Serif size={22} style={{ flex: 1 }}>{title}</Serif>
        {onSeeAll ? <Pressable accessibilityRole="link" onPress={onSeeAll} hitSlop={14}><T size={13} weight="semi" color={c.wine}>See all</T></Pressable> : null}
      </Row>
      <FlatList horizontal data={items} keyExtractor={(b) => b.slug} renderItem={({ item }) => <>{render(item)}</>} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: pad, gap: 12 }} />
    </View>
  );
}

export default function Home() {
  const s = useSession();
  const city = useCity();
  const saved = useSaved(HERE);
  const [picking, setPicking] = useState(false);
  const currency = city.market === "NG" ? "NGN" : "USD";

  // The city's businesses: the best rated, and when each can next take a client.
  const town = useLoad(async () => {
    if (!city.ready) return null;
    const [list, covers] = await Promise.all([api<{ businesses: Biz[]; total: number }>(`/businesses${qs({ market: city.market, limit: 30 })}`), loadCovers()]);
    const top = [...(list.businesses ?? [])].sort((a, b) => Number(b.rating) - Number(a.rating) || Number(b.review_count) - Number(a.review_count)).slice(0, 10);
    const openings = await loadOpenings(top.map((b) => b.slug));
    const soonest = top.filter((b) => openings[b.slug]?.slots?.length)
      .sort((a, b) => new Date(openings[a.slug].slots[0].starts_at).getTime() - new Date(openings[b.slug].slots[0].starts_at).getTime());
    return { top, soonest, openings, covers, total: list.total };
  }, [city.market, city.ready]);

  // The signed-in client's own bookings: the next one, and the last visit in this city to book again.
  const mine = useLoad(async () => {
    if (!s.clientToken || !city.ready) return null;
    const out = await s.capi<{ bookings: Data[] }>("/auth/me");
    const now = Date.now(), all = out.bookings ?? [];
    const upcoming = all.filter((b) => ["requested", "confirmed"].includes(b.status) && new Date(b.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ?? null;
    // Newest first already. A visit that happened, at a business in the chosen city.
    const last = all.find((b) => ["completed", "paid"].includes(b.status) && b.currency === currency && new Date(b.starts_at).getTime() < now) ?? null;
    let opening: Opening | null = null;
    if (last) {
      const names = String(last.services ?? "").split(", ").filter(Boolean);
      const found: Openings = await loadOpenings([last.slug], names[0] ?? "");
      const o = found[last.slug];
      // Only offer a time when it is for a service they had: anything else would not be a rebook.
      if (o?.slots?.length && names.includes(o.service)) opening = o;
    }
    return { upcoming, last, opening };
  }, [s.clientToken, city.market, city.ready]);

  // Coming back to this tab: a booking may have been made or cancelled, a business saved.
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    void mine.reload();
    void saved.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.clientToken, city.market]));

  const toSearch = (category?: string) => router.navigate((category ? `/client/search?category=${category}&t=${Date.now()}` : "/client/search") as never);
  const savedHere = saved.list.filter((x) => x.currency === currency) as Biz[];
  const name = s.customer ? `${s.customer.first_name ?? ""} ${s.customer.last_name ?? ""}`.trim() : "";
  const up = mine.data?.upcoming, last = mine.data?.last, reopen = mine.data?.opening;

  return (
    <Screen padded={false} onRefresh={() => { void town.refresh(); void mine.refresh(); void saved.reload(); }} refreshing={town.refreshing}>
      <View style={{ paddingHorizontal: pad }}>
        <Row between>
          <View style={{ flex: 1 }}>
            <T muted size={13} weight="medium">{greeting()}{s.customer?.first_name ? `, ${s.customer.first_name}` : ""}</T>
            <Pressable accessibilityRole="button" accessibilityLabel={`City: ${city.label}. Change city.`} accessibilityState={{ expanded: picking }} onPress={() => setPicking(!picking)}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start" }}>
              <Text style={{ fontFamily: f.serifBold, fontSize: 26, color: c.ink }}>{city.label}</Text>
              <Icon name="down" size={18} stroke={2.2} />
            </Pressable>
          </View>
          <Row gap={10}>
            <IconButton icon="bell" label="Your bookings" onPress={() => router.navigate("/client/bookings" as never)} />
            {s.customer ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.navigate("/client/profile" as never)} hitSlop={2}>
                <Avatar name={name || s.customer.email || "You"} tone={c.ink} />
              </Pressable>
            ) : s.ready ? (
              <Pressable accessibilityRole="link" onPress={() => router.push(`/sign-in?next=${encodeURIComponent(HERE)}` as never)} hitSlop={12} style={{ minHeight: 44, justifyContent: "center" }}>
                <T size={13} weight="semi" color={c.wine}>Sign in</T>
              </Pressable>
            ) : null}
          </Row>
        </Row>

        {picking ? (
          <Card style={{ marginTop: 6, paddingHorizontal: 14 }}>
            {CITIES.map((x, i) => (
              <Pressable key={x.market} accessibilityRole="radio" accessibilityState={{ checked: x.market === city.market }} onPress={() => { city.setMarket(x.market); setPicking(false); }}
                style={{ minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                <T weight={x.market === city.market ? "semi" : "body"}>{x.label}</T>
                {x.market === city.market ? <Icon name="check" size={18} /> : null}
              </Pressable>
            ))}
          </Card>
        ) : null}

        <Pressable accessibilityRole="button" accessibilityLabel={`Search ${city.city}`} onPress={() => toSearch()}
          style={({ pressed }) => ({ marginTop: 18, minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.85 : 1 })}>
          <Icon name="search" size={20} />
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.body, fontSize: 15, color: c.muted2 }}>Knotless braids, skin fade, lash fill…</Text>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.cream2, alignItems: "center", justifyContent: "center" }}><Icon name="filter" size={16} /></View>
        </Pressable>
      </View>

      {saved.error ? <View style={{ paddingHorizontal: pad, marginTop: 14 }}><Failed error={saved.error} /></View> : null}

      {last ? (
        <View style={{ paddingHorizontal: pad, marginTop: 20 }}>
          <View style={{ backgroundColor: c.ink, borderRadius: 20, padding: 18, gap: 14 }}>
            <Row between>
              <Pill kind="gold">{reopen ? "Rebook in one tap" : "Book again"}</Pill>
              <Text style={{ fontFamily: f.body, fontSize: 12, color: "#C9BCB0" }}>Last visit {dayShort(last.starts_at, last.timezone)}</Text>
            </Row>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${last.business}`} onPress={() => router.push(profileHref(last.slug) as never)} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
              <Avatar name={last.business} tone={c.wine} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 16, color: "#F4ECE3" }}>{last.business}</Text>
                <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 13, color: "#C9BCB0" }}>{[last.services, money(last.total_cents, last.currency)].filter(Boolean).join(" · ")}</Text>
              </View>
            </Pressable>
            <Row between>
              <Text style={{ flex: 1, fontFamily: f.body, fontSize: 13, color: "#C9BCB0" }}>
                {reopen ? <>Next open: <Text style={{ fontFamily: f.bold, color: "#F4ECE3" }}>{when(reopen.slots[0].starts_at, last.timezone)}</Text></> : "Choose a service and a time."}
              </Text>
              <Btn kind="gold" small onPress={() => router.push((reopen ? bookAt(last.slug, [reopen.service_id], reopen.slots[0], last.timezone) : profileHref(last.slug)) as never)}>Rebook</Btn>
            </Row>
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 22 }}>
        <Serif size={22} style={{ paddingHorizontal: pad, marginBottom: 12 }}>What are we doing today?</Serif>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, gap: 8 }}>
          {CATEGORIES.map(([id, label]) => <Chip key={id} onPress={() => toSearch(id)}>{label}</Chip>)}
        </ScrollView>
      </View>

      {s.clientToken && mine.error && !mine.data ? <View style={{ paddingHorizontal: pad, marginTop: 22 }}><Failed error={mine.error} onRetry={mine.reload} /></View> : null}

      {up ? (
        <View style={{ paddingHorizontal: pad, marginTop: 22 }}>
          <Row between style={{ marginBottom: 12 }}>
            <Serif size={22}>Upcoming</Serif>
            <Pressable accessibilityRole="link" onPress={() => router.navigate("/client/bookings" as never)} hitSlop={14}><T size={13} weight="semi" color={c.wine}>See all</T></Pressable>
          </Row>
          <Card onPress={() => router.navigate("/client/bookings" as never)} label={`${up.services} at ${up.business}, ${when(up.starts_at, up.timezone)}`} style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ width: 52, height: 56, borderRadius: 14, backgroundColor: c.wineBg, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: f.bold, fontSize: 11, letterSpacing: 0.7, color: c.wine }}>{dayShort(up.starts_at, up.timezone).split(" ")[0].toUpperCase()}</Text>
              <Text style={{ fontFamily: f.serifBold, fontSize: 24, lineHeight: 26, color: c.wine }}>{dayShort(up.starts_at, up.timezone).split(" ")[1]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{[up.services, up.business].filter(Boolean).join(" · ")}</Text>
              {/* The booking's end time includes the business's clean-up time, so no length is shown here. */}
              <T muted size={13} numberOfLines={1} style={{ marginTop: 2 }}>
                {[clock(up.starts_at, up.timezone), up.staff ? `with ${firstName(String(up.staff))}` : "", up.city].filter(Boolean).join(" · ")}
              </T>
            </View>
            <Pill kind={up.status === "confirmed" ? "ok" : "gold"}>{up.status === "confirmed" ? "Confirmed" : "Requested"}</Pill>
          </Card>
        </View>
      ) : null}

      {savedHere.length ? <Shelf title="Your saved" items={savedHere} render={(b) => <BusinessTile b={b} cover={town.data?.covers[b.slug]} src="app" />} /> : null}

      {!town.data && (town.loading || !city.ready) ? <Loading label={`Loading ${city.city}`} /> : null}
      {town.error && !town.data ? <View style={{ paddingHorizontal: pad, marginTop: 22 }}><Failed error={town.error} onRetry={town.reload} /></View> : null}
      {town.data && town.data.top.length === 0 ? (
        <View style={{ paddingHorizontal: pad, marginTop: 22 }}>
          <Empty title={`No one is taking bookings in ${city.city} yet`}>Businesses appear here as soon as they open their calendar on LogaLuxe. You can look in the other city from the top of this screen.</Empty>
        </View>
      ) : null}
      {town.data && town.data.top.length > 0 ? (
        <>
          <Shelf title={`Top rated in ${city.city}`} onSeeAll={() => toSearch()} items={town.data.top} render={(b) => <BusinessTile b={b} cover={town.data!.covers[b.slug]} src="app" />} />
          {town.data.soonest.length ? (
            <Shelf title="Free soonest" items={town.data.soonest} render={(b) => {
              const o = town.data!.openings[b.slug];
              return <BusinessTile b={b} cover={town.data!.covers[b.slug]} src="app" note={`${slotLabel(o.slots[0].starts_at, b.timezone)} · ${o.service}`} />;
            }} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
