// The client's Home (design: Main). Everything on it is for the place the client is looking in and comes
// from the API: the client's own next booking and last visit, the saved businesses, and rows of businesses
// near the place, nearest first, filled out with the best of the country and of LogaLuxe when few are near.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { BusinessTile, FirstHereTile, profileHref, tierLabel } from "@/components/ca-business-card";
import { CountryBanner } from "@/components/ca-country-banner";
import { HeroCard, ListYours, SoonestList, type HeroPhoto } from "@/components/ca-home";
import { PlaceButton, PlacePanel } from "@/components/ca-place-panel";
import { Avatar, Btn, Card, Chip, Empty, Failed, Icon, IconButton, Loading, Pill, Row, Screen, Serif, T } from "@/components/ui";
import { api, qs, type Row as Data } from "@/lib/api";
import { bookAt, CATEGORIES, loadCovers, loadOpenings, type Biz, type Opening, type Openings } from "@/lib/ca-data";
import { inCountry, shortName, usePlace, whereLine, type Geo, type Place } from "@/lib/ca-place";
import { useSaved } from "@/lib/ca-saved";
import { clock, dayShort, firstName, money, when } from "@/lib/format";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const HERE = "/client/home";
const FILL = 10;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** A sideways row of businesses under a heading. `after` is appended to the row (the "be the first" cards). */
function Shelf({ title, sub, onSeeAll, items, render, after }: { title: string; sub?: string; onSeeAll?: () => void; items: Biz[]; render: (b: Biz) => ReactNode; after?: ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Row between style={{ paddingHorizontal: pad, marginBottom: sub ? 4 : 12 }}>
        <Serif size={22} style={{ flex: 1 }}>{title}</Serif>
        {onSeeAll ? <Pressable accessibilityRole="link" onPress={onSeeAll} hitSlop={14}><T size={13} weight="semi" color={c.wine}>See all</T></Pressable> : null}
      </Row>
      {sub ? <T muted size={13} style={{ paddingHorizontal: pad, marginBottom: 12 }}>{sub}</T> : null}
      <FlatList horizontal data={items} keyExtractor={(b) => b.slug} renderItem={({ item }) => <>{render(item)}</>} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: pad, gap: 12 }} ListFooterComponent={after ? <View style={{ flexDirection: "row", gap: 12 }}>{after}</View> : null} />
    </View>
  );
}

export default function Home() {
  const s = useSession();
  const w = usePlace();
  const saved = useSaved(HERE);
  const [picking, setPicking] = useState(false);
  const currency = w.currency;
  const placeKey = JSON.stringify(w.query);
  const here = w.place ? shortName(w.place) : "";

  // The businesses near the place: the best rated, filled to a full row, and when each can next take a client.
  const town = useLoad(async () => {
    if (!w.ready || !w.place) return null;
    const [list, covers, heroes] = await Promise.all([
      api<{ businesses: Biz[]; total: number; geo?: Geo & { fill?: { near: number; country: number; anywhere: number; short: number }; fill_notice?: string } }>(`/businesses${qs({ ...w.query, sort: "top", fill: FILL, limit: FILL })}`),
      loadCovers(),
      api<{ media: HeroPhoto[] }>("/site/media?slot=hero").then((r) => r.media ?? []).catch(() => [] as HeroPhoto[]),
    ]);
    const top = list.businesses ?? [];
    const openings = await loadOpenings(top.map((b) => b.slug));
    // The nearest tier first, then by time: a free chair across an ocean is not sooner for anyone.
    const rank = (b: Biz) => (b.tier === "anywhere" ? 2 : b.tier === "country" ? 1 : 0);
    const soonest = top.filter((b) => openings[b.slug]?.slots?.length)
      .sort((a, b) => rank(a) - rank(b) || new Date(openings[a.slug].slots[0].starts_at).getTime() - new Date(openings[b.slug].slots[0].starts_at).getTime());
    // One of the site's own photos for the banner, a different one each day.
    const hero = heroes.length ? heroes[new Date().getDate() % heroes.length] : undefined;
    const geo = list.geo;
    return { top, soonest, openings, covers, total: Number(list.total) || 0, hero, geo, fill: geo?.fill, fillNotice: geo?.fill_notice ?? "", near: top.filter((b) => !b.tier || b.tier === "near").length };
  }, [placeKey, w.ready]);

  // The signed-in client's own bookings: the next one, and the last visit in this country to book again.
  const mine = useLoad(async () => {
    if (!s.clientToken || !w.ready) return null;
    const out = await s.capi<{ bookings: Data[] }>("/auth/me");
    const now = Date.now(), all = out.bookings ?? [];
    const upcoming = all.filter((b) => ["requested", "confirmed"].includes(b.status) && new Date(b.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ?? null;
    // Newest first already. A visit that happened, at a business priced in the money of the country being browsed.
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
  }, [s.clientToken, currency, w.ready]);

  // Coming back to this tab: a booking may have been made or cancelled, a business saved.
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    void mine.reload();
    void saved.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.clientToken, currency]));

  const toSearch = (category?: string) => router.navigate((category ? `/client/search?category=${category}&t=${Date.now()}` : "/client/search") as never);
  const savedHere = saved.list.filter((x) => x.currency === currency) as Biz[];
  const name = s.customer ? `${s.customer.first_name ?? ""} ${s.customer.last_name ?? ""}`.trim() : "";
  const up = mine.data?.upcoming, last = mine.data?.last, reopen = mine.data?.opening;
  const t = town.data;
  const nothingNear = !!t && t.near === 0;
  const nearby: Place[] = (t?.geo?.nearest_places ?? []).filter((p) => p.slug !== w.place?.slug).slice(0, 4);
  const tileTag = (b: Biz) => tierLabel(b.tier, w.scope);
  const tile = (b: Biz) => <BusinessTile b={b} cover={t?.covers[b.slug]} src="app" tag={tileTag(b)} />;
  const firstHere = t?.fill?.short ? Array.from({ length: Math.min(t.fill.short, 3) }, (_, i) => <FirstHereTile key={`first-${i}`} place={here} onPress={() => router.push("/m/start" as never)} />) : null;

  return (
    <Screen padded={false} onRefresh={() => { void town.refresh(); void mine.refresh(); void saved.reload(); }} refreshing={town.refreshing}>
      <View style={{ paddingHorizontal: pad }}>
        <Row between style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T muted size={13} weight="medium">{greeting()}{s.customer?.first_name ? `, ${s.customer.first_name}` : ""}</T>
            {w.place ? <PlaceButton big label={w.place.label} open={picking} onPress={() => setPicking(true)} /> : <View style={{ minHeight: 44 }} />}
          </View>
          <Row gap={10} style={{ paddingTop: 14 }}>
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
        {/* How we came by the place, said plainly. A guess is called a guess. */}
        {w.place && (w.approximate || w.elsewhere || w.source === "device") ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${whereLine(w)}. Change place`} onPress={() => setPicking(true)} style={{ minHeight: 32, justifyContent: "center" }}>
            <T muted size={13} numberOfLines={2}>{whereLine(w)}. <T size={13} weight="semi" color={c.wine}>Change</T></T>
          </Pressable>
        ) : null}
        <CountryBanner style={{ marginTop: 10 }} />

        <Pressable accessibilityRole="button" accessibilityLabel={`Search ${here || "LogaLuxe"}`} onPress={() => toSearch()}
          style={({ pressed }) => ({ marginTop: 18, minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.85 : 1 })}>
          <Icon name="search" size={20} />
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.body, fontSize: 15, color: c.muted2 }}>Knotless braids, skin fade, lash fill…</Text>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.cream2, alignItems: "center", justifyContent: "center" }}><Icon name="filter" size={16} /></View>
        </Pressable>
      </View>

      <PlacePanel open={picking} onClose={() => setPicking(false)} />

      {saved.error ? <View style={{ paddingHorizontal: pad, marginTop: 14 }}><Failed error={saved.error} /></View> : null}

      {/* Someone with a visit to rebook sees that card here instead. */}
      {!last && t && t.total > 0 ? (
        <View style={{ paddingHorizontal: pad, marginTop: 16 }}>
          <HeroCard photo={t.hero} city={here} count={t.total} onPress={() => toSearch()} />
        </View>
      ) : null}

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

      {savedHere.length ? <Shelf title="Your saved" items={savedHere} render={(b) => <BusinessTile b={b} cover={t?.covers[b.slug]} src="app" />} /> : null}

      {!w.ready || (!t && town.loading) ? <Loading label={here ? `Loading ${here}` : "Finding where you are"} /> : null}
      {w.ready && !w.place ? (
        <View style={{ paddingHorizontal: pad, marginTop: 22 }}>
          {w.error ? <Failed error={w.error} onRetry={() => void w.reload()} /> : <Empty title="Choose where to look" action={<Btn kind="out" small onPress={() => setPicking(true)}>Choose a place</Btn>}>Pick a city, a state or a country and the professionals there appear here.</Empty>}
        </View>
      ) : null}
      {town.error && !t ? <View style={{ paddingHorizontal: pad, marginTop: 22 }}><Failed error={town.error} onRetry={town.reload} /></View> : null}

      {/* Nothing near the place: the API's own sentence, and the nearest places that do have professionals. */}
      {t && nothingNear ? (
        <View style={{ paddingHorizontal: pad, marginTop: 22 }}>
          <Empty title={`No one is taking bookings ${w.place?.kind === "country" ? `in ${inCountry(w.scope)}` : `near ${here}`} yet`}
            action={firstHere ? <Btn kind="out" small onPress={() => router.push("/m/start" as never)}>List your business</Btn> : undefined}>
            {t.geo?.notice || "Businesses appear here as soon as they open their calendar on LogaLuxe."}
          </Empty>
          {nearby.length ? (
            <View style={{ marginTop: 12 }}>
              <T muted size={13} style={{ marginBottom: 8 }}>Nearest places with professionals</T>
              <Row gap={8} wrap>
                {nearby.map((p) => <Chip key={p.slug} icon="pin" onPress={() => w.setPlace(p)}>{p.label}{p.distance_text ? ` · ${p.distance_text}` : ""}</Chip>)}
              </Row>
            </View>
          ) : null}
        </View>
      ) : null}

      {t && t.top.length === 0 && !t.fill?.short ? (
        <View style={{ paddingHorizontal: pad, marginTop: 22 }}>
          <Empty title="No one is taking bookings on LogaLuxe yet">Businesses appear here as soon as they open their calendar on LogaLuxe.</Empty>
        </View>
      ) : null}

      {t && (t.top.length > 0 || t.fill?.short) ? (
        <>
          <Shelf title={w.place?.kind === "country" ? `Top rated in ${inCountry(w.scope)}` : `Top rated near ${here}`} sub={t.fillNotice || (t.geo?.widened ? t.geo.notice : "")} onSeeAll={() => toSearch()} items={t.top} render={tile} after={firstHere} />
          {t.soonest.length ? (
            <View style={{ paddingHorizontal: pad, marginTop: 26 }}>
              <Serif size={22}>Free soonest</Serif>
              <T muted size={13} style={{ marginTop: 2, marginBottom: 12 }}>Tap a time to book it.{w.point ? ` Distances are from ${w.source === "device" ? "you" : `the middle of ${here}`}.` : ""}</T>
              <SoonestList items={t.soonest.slice(0, 5)} openings={t.openings} tag={tileTag} />
            </View>
          ) : null}
          <View style={{ paddingHorizontal: pad, marginTop: 26, marginBottom: 8 }}>
            <ListYours onPress={() => router.push("/m/start" as never)} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
