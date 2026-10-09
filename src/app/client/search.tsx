import { useFormReset } from "../../lib/form-reset";
// Search results (design: C2-Results). One query against GET /v1/businesses for the place the client is
// looking in, inside their country, nearest first from a point, a page at a time as the person scrolls,
// with each business's next free times and how far it is.
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BusinessCard } from "@/components/ca-business-card";
import { CountryBanner } from "@/components/ca-country-banner";
import { PlaceButton, PlacePanel } from "@/components/ca-place-panel";
import { Btn, Card, Chip, Empty, Failed, Icon, IconButton, Loading, Note, Row, T } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { CATEGORIES, categoryLabel, loadCovers, loadOpenings, type Biz, type Opening } from "@/lib/ca-data";
import { inCountry, shortName, usePlace, type Geo, type Place } from "@/lib/ca-place";
import { useSaved } from "@/lib/ca-saved";
import { plural } from "@/lib/format";
import { c, f, pad } from "@/lib/theme";

const PAGE = 12;

type State = { items: Biz[]; total: number; geo: Geo | null; loading: boolean; more: boolean; refreshing: boolean; error: string; moreError: string };

export default function Search() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ q?: string; category?: string; t?: string }>();
  const w = usePlace();
  const saved = useSaved("/client/search");
  const [text, setText] = useState(typeof p.q === "string" ? p.q : "");
  const [q, setQ] = useState(text.trim());
  const [category, setCategory] = useState(CATEGORIES.some(([id]) => id === p.category) ? String(p.category) : "");
  const [sort, setSort] = useState("");
  const [sorting, setSorting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [near, setNear] = useState<{ busy: boolean; why: string }>({ busy: false, why: "" });
  const [st, setSt] = useState<State>({ items: [], total: 0, geo: null, loading: true, more: false, refreshing: false, error: "", moreError: "" });
  const [openings, setOpenings] = useState<Record<string, Opening | null>>({});
  const [covers, setCovers] = useState<Record<string, string>>({});
  const turn = useRef(0);
  const list = useRef<FlatList<Biz>>(null);
  const placeKey = JSON.stringify(w.query);
  const device = w.source === "device";
  const here = w.place ? shortName(w.place) : "";

  /** The orders on offer. From a point the nearest come first; the API's own order (best rated, promoted ahead and marked) is "Top rated". */
  const SORTS: [string, string, string][] = w.point
    ? [[device ? "" : "distance", "Nearest", "nearest"], [device ? "top" : "", "Top rated", "top rated"], ["reviews", "Most reviewed", "most reviewed"], ["price", "Lowest price", "lowest price"]]
    : [["", "Best match", "best match"], ["reviews", "Most reviewed", "most reviewed"], ["price", "Lowest price", "lowest price"]];
  const sortOk = SORTS.some(([v]) => v === sort) ? sort : "";

  // Arriving from Home with a category or a word: take it, even when this tab was already open.
  useFormReset([p.t, p.q, p.category], () => {
    if (p.t === undefined && p.q === undefined && p.category === undefined) return;
    const cat = CATEGORIES.some(([id]) => id === p.category) ? String(p.category) : "";
    const word = typeof p.q === "string" ? p.q : "";
    setCategory(cat); setText(word); setQ(word.trim());
  });

  // Search a moment after the typing stops, not on every letter.
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(id);
  }, [text]);

  useEffect(() => { void loadCovers().then(setCovers); }, []);

  const load = useCallback(async (offset: number, how: "new" | "more" | "pull") => {
    if (!w.ready || !w.place) return;
    const mine = ++turn.current; // only the newest request may answer
    setSt((x) => ({ ...x, loading: how === "new", more: how === "more", refreshing: how === "pull", error: how === "more" ? x.error : "", moreError: "" }));
    try {
      const out = await api<{ businesses: Biz[]; total: number; geo?: Geo }>(`/businesses${qs({ q, category, ...w.query, sort: sortOk, limit: PAGE, offset })}`);
      if (mine !== turn.current) return;
      const page = out.businesses ?? [];
      setSt((x) => ({ items: offset ? [...x.items, ...page.filter((b) => !x.items.some((y) => y.slug === b.slug))] : page, total: out.total ?? 0, geo: out.geo ?? x.geo, loading: false, more: false, refreshing: false, error: "", moreError: "" }));
      if (!offset) setOpenings({});
      // The free times of this page's businesses, in one call, for the service that matches the search.
      const found = await loadOpenings(page.map((b) => b.slug), q);
      if (mine !== turn.current) return;
      setOpenings((o) => ({ ...o, ...Object.fromEntries(page.map((b) => [b.slug, found[b.slug]?.slots?.length ? found[b.slug] : null])) }));
    } catch (e) {
      if (mine !== turn.current) return;
      const msg = (e as Error).message || "Something went wrong.";
      setSt((x) => ({ ...x, loading: false, more: false, refreshing: false, error: how === "more" ? x.error : msg, moreError: how === "more" ? msg : "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, sortOk, placeKey, w.ready]);

  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
    let live = true;
    queueMicrotask(() => { if (live) void load(0, "new"); });
    return () => { live = false; };
  }, [load]);

  const hasMore = st.items.length < st.total;
  const more = () => { if (hasMore && !st.loading && !st.more && !st.refreshing && !st.moreError) void load(st.items.length, "more"); };
  const filtered = !!q || !!category;
  const clear = () => { setText(""); setQ(""); setCategory(""); };
  const sortName = SORTS.find(([v]) => v === sortOk)?.[2] ?? "best match";
  const nearMe = async () => {
    if (device) { setPicking(true); return; }
    setNear({ busy: true, why: "" });
    const me = await w.useExactLocation();
    setNear({ busy: false, why: me.ok ? "" : me.why });
  };
  const geo = st.geo;
  const nearby: Place[] = (geo?.nearest_places ?? []).filter((x) => x.slug !== w.place?.slug).slice(0, 4);
  const where = w.place?.kind === "country" ? `in ${inCountry(w.scope)}` : `near ${here}`;
  // A distance from the person reads plainly. One from the middle of a city is said once, above the list.
  const from = w.point ? (device ? "Distances are from you." : `Distances are from the middle of ${here}.`) : "";

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <View style={{ paddingTop: insets.top + 12 }}>
        <Row gap={10} style={{ paddingHorizontal: pad }}>
          <IconButton icon="back" label="Back to Home" onPress={() => router.navigate("/client/home" as never)} />
          <View style={{ flex: 1, minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingLeft: 14, paddingRight: 4, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Icon name="search" size={18} />
            <TextInput accessibilityLabel="Search" value={text} onChangeText={setText} placeholder="Service or business" placeholderTextColor={c.muted2}
              returnKeyType="search" autoCorrect={false} autoCapitalize="none" onSubmitEditing={() => setQ(text.trim())}
              style={[{ flex: 1, minWidth: 0, minHeight: 50, fontFamily: f.body, fontSize: 15, color: c.ink }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]} />
            {text ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear the search" onPress={() => { setText(""); setQ(""); }} hitSlop={8} style={{ width: 28, height: 44, alignItems: "center", justifyContent: "center" }}>
                <Icon name="close" size={16} color={c.muted} />
              </Pressable>
            ) : null}
            <PlaceButton label={w.place ? (device ? "Near you" : here) : "Place"} onPress={() => setPicking(true)} />
          </View>
        </Row>
        <CountryBanner style={{ marginHorizontal: pad, marginTop: 10 }} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: pad, gap: 8 }}>
          <Chip icon="pin" on={device} onPress={() => void nearMe()}>{near.busy ? "Finding you…" : "Near me"}</Chip>
          <Chip on={!category} onPress={() => setCategory("")}>All</Chip>
          {CATEGORIES.map(([id, label]) => <Chip key={id} on={category === id} onPress={() => setCategory(category === id ? "" : id)}>{label}</Chip>)}
        </ScrollView>
        {near.why ? <View style={{ paddingHorizontal: pad, marginTop: 10 }}><Note kind="gold">{near.why}</Note></View> : null}

        <Row between style={{ paddingHorizontal: pad, marginTop: 10 }}>
          <Text accessibilityLiveRegion="polite" numberOfLines={1} style={{ flex: 1, fontFamily: f.body, fontSize: 13, color: c.muted }}>
            {st.loading || st.error ? " " : <><Text style={{ fontFamily: f.bold, color: c.ink }}>{plural(st.total, "professional")}</Text> {where} · sorted by {sortName}</>}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Sort: ${sortName}. Change.`} accessibilityState={{ expanded: sorting }} onPress={() => setSorting(!sorting)}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="filter" size={16} color={c.wine} />
            <T size={13} weight="semi" color={c.wine}>Sort</T>
          </Pressable>
        </Row>
        {sorting ? (
          <Card style={{ marginHorizontal: pad, marginBottom: 8, paddingHorizontal: 14 }}>
            {SORTS.map(([v, label], i) => (
              <Pressable key={label} accessibilityRole="radio" accessibilityState={{ checked: v === sortOk }} onPress={() => { setSort(v); setSorting(false); }}
                style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                <T size={14} weight={v === sortOk ? "semi" : "body"}>{label}</T>
                {v === sortOk ? <Icon name="check" size={18} /> : null}
              </Pressable>
            ))}
          </Card>
        ) : null}
        {/* The API says when it had to look further out, and where the nearest are. */}
        {!st.loading && !st.error && st.items.length > 0 && (geo?.notice || from) ? (
          <T size={12.5} muted style={{ paddingHorizontal: pad, marginBottom: 6 }}>{[geo?.notice, from].filter(Boolean).join(" ")}</T>
        ) : null}
      </View>

      <PlacePanel open={picking} onClose={() => setPicking(false)} />

      <FlatList ref={list} data={st.loading || st.error ? [] : st.items} keyExtractor={(b) => b.slug}
        renderItem={({ item }) => <BusinessCard b={item} cover={covers[item.slug]} opening={openings[item.slug]} saved={saved.has(item.slug)} onSave={() => void saved.toggle(item)} src="search" />}
        contentContainerStyle={{ paddingHorizontal: pad, paddingTop: 4, paddingBottom: 28, gap: 14 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
        onEndReached={more} onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={st.refreshing} onRefresh={() => { void load(0, "pull"); void saved.reload(); }} tintColor={c.wine} />}
        ListHeaderComponent={saved.error ? <Failed error={saved.error} /> : null}
        ListEmptyComponent={
          !w.ready || (st.loading && w.place) ? <Loading label="Searching" />
            : !w.place ? (w.error ? <Failed error={w.error} onRetry={() => void w.reload()} /> : <Empty title="Choose where to look" action={<Btn kind="out" small onPress={() => setPicking(true)}>Choose a place</Btn>}>Pick a city, a state or a country to search in.</Empty>)
              : st.error ? <Failed error={st.error} onRetry={() => void load(0, "new")} />
                : (
                  <View style={{ gap: 12 }}>
                    <Empty title={filtered ? "No one matches that" : `No one is taking bookings ${where} yet`}
                      action={filtered ? <Btn kind="out" small onPress={clear}>Clear the search</Btn> : <Btn kind="out" small onPress={() => setPicking(true)}>Look somewhere else</Btn>}>
                      {filtered
                        ? `Nothing ${where} matches ${[q ? `“${q}”` : "", category ? `in ${categoryLabel(category)}` : ""].filter(Boolean).join(" ")}${geo?.mode === "near" && w.scope ? `, and nothing anywhere else in ${inCountry(w.scope)}` : ""}. Try a shorter word such as “braids” or “fade”, or another category.`
                        : geo?.notice || "Businesses appear here as soon as they open their calendar on LogaLuxe."}
                    </Empty>
                    {nearby.length ? (
                      <View>
                        <T muted size={13} style={{ marginBottom: 8 }}>Nearest places with professionals</T>
                        <Row gap={8} wrap>
                          {nearby.map((x) => <Chip key={x.slug} icon="pin" onPress={() => w.setPlace(x)}>{x.label}{x.distance_text ? ` · ${x.distance_text}` : ""}</Chip>)}
                        </Row>
                      </View>
                    ) : null}
                  </View>
                )
        }
        ListFooterComponent={
          st.more ? <View style={{ paddingVertical: 16, alignItems: "center" }}><ActivityIndicator color={c.wine} /></View>
            : st.moreError ? <Failed error={st.moreError} onRetry={() => void load(st.items.length, "more")} />
              : null
        }
      />
    </View>
  );
}
