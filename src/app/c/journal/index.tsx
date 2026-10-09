// The Journal: every published article, newest first, with the featured one on top. Category chips,
// a search field, a page at a time, and the country being browsed (its pieces and the shared ones).
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { ArticleRow, FeaturedCard } from "@/components/cj-cards";
import { Btn, Chip, Empty, Failed, Icon, Loading, Row, Screen, Serif, T, TopBar } from "@/components/ui";
import { inCountry, usePlace } from "@/lib/ca-place";
import { JOURNAL_CATEGORIES, loadJournal, PAGE, type Article, type Category } from "@/lib/cj-data";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type More = { items: Article[]; loading: boolean; error: string };

export default function Journal() {
  const p = useLocalSearchParams<{ category?: string; tag?: string; q?: string }>();
  const w = usePlace();
  const [category, setCategory] = useState(typeof p.category === "string" ? p.category : "");
  const [tag, setTag] = useState(typeof p.tag === "string" ? p.tag : "");
  const [typed, setTyped] = useState(typeof p.q === "string" ? p.q : "");
  const [q, setQ] = useState(typed.trim());
  const [everywhere, setEverywhere] = useState(false);
  const country = everywhere ? "" : w.scope;
  const filtered = !!(category || q || tag);

  // The search waits for the typing to pause.
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 350);
    return () => clearTimeout(t);
  }, [typed]);

  const first = useLoad(async () => (w.ready ? loadJournal({ category, country, q, tag, limit: PAGE, offset: 0 }) : null), [category, country, q, tag, w.ready]);
  const [more, setMore] = useState<More>({ items: [], loading: false, error: "" });
  useEffect(() => { setMore({ items: [], loading: false, error: "" }); }, [first.data]);

  // The category chips keep the counts of the whole journal, not of the current filter.
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => {
    const got = first.data?.categories ?? [];
    if (got.length && (!filtered || !cats.length)) setCats(got);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first.data]);

  const d = first.data;
  const items = [...(d?.articles ?? []), ...more.items];
  const total = Number(d?.total) || 0;
  const lead = !filtered && items[0]?.featured ? items[0] : null;
  const rows = lead ? items.slice(1) : items;

  const loadMore = async () => {
    setMore((m) => ({ ...m, loading: true, error: "" }));
    try {
      const out = await loadJournal({ category, country, q, tag, limit: PAGE, offset: items.length });
      setMore((m) => ({ items: [...m.items, ...(out.articles ?? []).filter((a) => !items.some((x) => x.slug === a.slug))], loading: false, error: "" }));
    } catch (e) {
      setMore((m) => ({ ...m, loading: false, error: (e as Error).message }));
    }
  };

  const chips: Category[] = cats.length ? cats : JOURNAL_CATEGORIES.map(([key, label]) => ({ key, label, count: 0 }));
  const allCount = cats.length ? cats.reduce((n, x) => n + (Number(x.count) || 0), 0) : total;
  const input = useRef<TextInput>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/client/home" as never));

  const header = (
    <View style={{ paddingHorizontal: pad }}>
      <TopBar onBack={back} />
      <Serif size={30}>The Journal</Serif>
      <T muted size={14} style={{ marginTop: 4 }}>Useful reading on hair, braids, nails, skin and the rest, and how LogaLuxe works.</T>

      <View style={{ marginTop: 16, minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name="search" size={20} />
        <TextInput ref={input} accessibilityLabel="Search the Journal" value={typed} onChangeText={setTyped} placeholder="Search articles" placeholderTextColor={c.muted2} returnKeyType="search" autoCorrect={false}
          style={{ flex: 1, minHeight: 50, fontFamily: f.body, fontSize: 15, color: c.ink }} />
        {typed ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear the search" onPress={() => { setTyped(""); input.current?.focus(); }} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.cream2 }}>
            <Icon name="close" size={14} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -pad }} contentContainerStyle={{ paddingHorizontal: pad, gap: 8 }}>
        <Chip on={!category} onPress={() => setCategory("")}>{allCount ? `All ${allCount}` : "All"}</Chip>
        {chips.filter((x) => x.count > 0 || !cats.length).map((x) => <Chip key={x.key} on={category === x.key} onPress={() => setCategory(category === x.key ? "" : x.key)}>{x.count ? `${x.label} ${x.count}` : x.label}</Chip>)}
      </ScrollView>

      {tag ? (
        <Row gap={8} style={{ marginTop: 10 }}>
          <T muted size={13}>Tagged</T>
          <Chip on onPress={() => setTag("")} icon="close">{tag}</Chip>
        </Row>
      ) : null}

      {w.scope ? (
        <Pressable accessibilityRole="button" accessibilityLabel={everywhere ? `Showing all articles. Show only those for ${inCountry(w.scope)}` : `Showing articles for ${inCountry(w.scope)}. Show all articles`} onPress={() => setEverywhere(!everywhere)} style={{ marginTop: 12, minHeight: 32, justifyContent: "center" }}>
          <T muted size={13}>
            {everywhere ? "Showing every article" : `Showing articles for ${inCountry(w.scope)}`} · <T size={13} weight="semi" color={c.wine}>{everywhere ? `Only for ${inCountry(w.scope)}` : "All articles"}</T>
          </T>
        </Pressable>
      ) : null}

      {first.loading && d ? <ActivityIndicator color={c.wine} accessibilityLabel="Loading articles" style={{ marginTop: 12 }} /> : null}
      {lead ? <View style={{ marginTop: 14, marginBottom: 12 }}><FeaturedCard a={lead} /></View> : <View style={{ height: 14 }} />}
    </View>
  );

  const empty = !w.ready || (first.loading && !d) ? <Loading label="Loading the Journal" />
    : first.error && !d ? <View style={{ paddingHorizontal: pad }}><Failed error={first.error} onRetry={first.reload} /></View>
    : d && items.length === 0 ? (
      <View style={{ paddingHorizontal: pad }}>
        {filtered ? (
          <Empty title="No articles match" action={<Btn kind="out" small onPress={() => { setCategory(""); setTag(""); setTyped(""); setQ(""); }}>Clear the filters</Btn>}>
            {q ? `Nothing mentions "${q}"${category ? " in this category" : ""}. ` : ""}Try another word or category{!everywhere && w.scope ? ", or show all articles" : ""}.
          </Empty>
        ) : (
          <Empty title="Nothing published yet">Articles appear here as soon as the editors publish them.</Empty>
        )}
      </View>
    ) : null;

  const footer = (
    <View style={{ paddingHorizontal: pad, paddingTop: 6, gap: 10 }}>
      {more.error ? <Failed error={more.error} onRetry={() => void loadMore()} /> : null}
      {more.loading ? <ActivityIndicator color={c.wine} accessibilityLabel="Loading more articles" /> : null}
      {!more.loading && items.length < total ? <Btn kind="out" onPress={() => void loadMore()}>Load more</Btn> : null}
      {items.length > 0 && items.length >= total ? <T muted size={12} center>{total === 1 ? "1 article" : `${total} articles`}</T> : null}
    </View>
  );

  return (
    <Screen scroll={false} padded={false}>
      <FlatList data={rows} keyExtractor={(a) => a.slug} renderItem={({ item }) => <View style={{ paddingHorizontal: pad, marginBottom: 10 }}><ArticleRow a={item} /></View>}
        ListHeaderComponent={header} ListEmptyComponent={empty} ListFooterComponent={footer} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        refreshing={first.refreshing} onRefresh={first.refresh} contentContainerStyle={{ paddingBottom: 20 }} />
    </Screen>
  );
}
