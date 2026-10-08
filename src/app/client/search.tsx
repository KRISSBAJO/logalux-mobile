// Search results (design: C2-Results). One query against GET /v1/businesses for the chosen city,
// a page at a time as the person scrolls, with each business's next free times.
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BusinessCard } from "@/components/ca-business-card";
import { Btn, Card, Chip, Empty, Failed, Icon, IconButton, Loading, Row, T } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { CITIES, useCity } from "@/lib/ca-city";
import { CATEGORIES, categoryLabel, loadCovers, loadOpenings, type Biz, type Opening } from "@/lib/ca-data";
import { useSaved } from "@/lib/ca-saved";
import { plural } from "@/lib/format";
import { c, f, pad } from "@/lib/theme";

const PAGE = 12;
/** The orders the API offers. The first is its own: best rated first, with businesses that pay to be seen ahead and marked. */
const SORTS: [string, string, string][] = [["", "Best match", "best match"], ["reviews", "Most reviewed", "most reviewed"], ["price", "Lowest price", "lowest price"]];

type State = { items: Biz[]; total: number; loading: boolean; more: boolean; refreshing: boolean; error: string; moreError: string };

export default function Search() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ q?: string; category?: string; t?: string }>();
  const city = useCity();
  const saved = useSaved("/client/search");
  const [text, setText] = useState(typeof p.q === "string" ? p.q : "");
  const [q, setQ] = useState(text.trim());
  const [category, setCategory] = useState(CATEGORIES.some(([id]) => id === p.category) ? String(p.category) : "");
  const [sort, setSort] = useState("");
  const [sorting, setSorting] = useState(false);
  const [st, setSt] = useState<State>({ items: [], total: 0, loading: true, more: false, refreshing: false, error: "", moreError: "" });
  const [openings, setOpenings] = useState<Record<string, Opening | null>>({});
  const [covers, setCovers] = useState<Record<string, string>>({});
  const turn = useRef(0);
  const list = useRef<FlatList<Biz>>(null);

  // Arriving from Home with a category or a word: take it, even when this tab was already open.
  useEffect(() => {
    if (p.t === undefined && p.q === undefined && p.category === undefined) return;
    const cat = CATEGORIES.some(([id]) => id === p.category) ? String(p.category) : "";
    const word = typeof p.q === "string" ? p.q : "";
    setCategory(cat); setText(word); setQ(word.trim());
  }, [p.t, p.q, p.category]);

  // Search a moment after the typing stops, not on every letter.
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(id);
  }, [text]);

  useEffect(() => { void loadCovers().then(setCovers); }, []);

  const load = useCallback(async (offset: number, how: "new" | "more" | "pull") => {
    if (!city.ready) return;
    const mine = ++turn.current; // only the newest request may answer
    setSt((x) => ({ ...x, loading: how === "new", more: how === "more", refreshing: how === "pull", error: how === "more" ? x.error : "", moreError: "" }));
    try {
      const out = await api<{ businesses: Biz[]; total: number }>(`/businesses${qs({ q, category, market: city.market, sort, limit: PAGE, offset })}`);
      if (mine !== turn.current) return;
      const page = out.businesses ?? [];
      setSt((x) => ({ items: offset ? [...x.items, ...page.filter((b) => !x.items.some((y) => y.slug === b.slug))] : page, total: out.total ?? 0, loading: false, more: false, refreshing: false, error: "", moreError: "" }));
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
  }, [q, category, sort, city.market, city.ready]);

  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
    void load(0, "new");
  }, [load]);

  const hasMore = st.items.length < st.total;
  const more = () => { if (hasMore && !st.loading && !st.more && !st.refreshing && !st.moreError) void load(st.items.length, "more"); };
  const other = CITIES.find((x) => x.market !== city.market)!;
  const filtered = !!q || !!category;
  const clear = () => { setText(""); setQ(""); setCategory(""); };
  const sortName = SORTS.find(([v]) => v === sort)?.[2] ?? "best match";

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
            <Pressable accessibilityRole="button" accessibilityLabel={`City: ${city.city}. Switch to ${other.city}.`} onPress={() => city.setMarket(other.market)} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: "center" }}>
              <Text style={{ fontFamily: f.medium, fontSize: 12, color: c.muted }}>{city.city}</Text>
            </Pressable>
          </View>
        </Row>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: pad, gap: 8 }}>
          <Chip on={!category} onPress={() => setCategory("")}>All</Chip>
          {CATEGORIES.map(([id, label]) => <Chip key={id} on={category === id} onPress={() => setCategory(category === id ? "" : id)}>{label}</Chip>)}
        </ScrollView>

        <Row between style={{ paddingHorizontal: pad, marginTop: 10 }}>
          <Text accessibilityLiveRegion="polite" numberOfLines={1} style={{ flex: 1, fontFamily: f.body, fontSize: 13, color: c.muted }}>
            {st.loading || st.error ? " " : <><Text style={{ fontFamily: f.bold, color: c.ink }}>{plural(st.total, "professional")}</Text> · sorted by {sortName}</>}
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
              <Pressable key={v} accessibilityRole="radio" accessibilityState={{ checked: v === sort }} onPress={() => { setSort(v); setSorting(false); }}
                style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                <T size={14} weight={v === sort ? "semi" : "body"}>{label}</T>
                {v === sort ? <Icon name="check" size={18} /> : null}
              </Pressable>
            ))}
          </Card>
        ) : null}
      </View>

      <FlatList ref={list} data={st.loading || st.error ? [] : st.items} keyExtractor={(b) => b.slug}
        renderItem={({ item }) => <BusinessCard b={item} cover={covers[item.slug]} opening={openings[item.slug]} saved={saved.has(item.slug)} onSave={() => void saved.toggle(item)} src="search" />}
        contentContainerStyle={{ paddingHorizontal: pad, paddingTop: 4, paddingBottom: 28, gap: 14 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
        onEndReached={more} onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={st.refreshing} onRefresh={() => { void load(0, "pull"); void saved.reload(); }} tintColor={c.wine} />}
        ListHeaderComponent={saved.error ? <Failed error={saved.error} /> : null}
        ListEmptyComponent={
          st.loading || !city.ready ? <Loading label="Searching" />
            : st.error ? <Failed error={st.error} onRetry={() => void load(0, "new")} />
              : (
                <Empty title={filtered ? "No one matches that" : `No one is taking bookings in ${city.city} yet`}
                  action={filtered ? <Btn kind="out" small onPress={clear}>Clear the search</Btn> : <Btn kind="out" small onPress={() => city.setMarket(other.market)}>Look in {other.city}</Btn>}>
                  {filtered
                    ? `Nothing in ${city.city} matches ${[q ? `“${q}”` : "", category ? `in ${categoryLabel(category)}` : ""].filter(Boolean).join(" ")}. Try a shorter word such as “braids” or “fade”, or another category.`
                    : "Businesses appear here as soon as they open their calendar on LogaLuxe."}
                </Empty>
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
