// "From the Journal" on the client's Home: the featured piece tall, the three latest in a sideways row,
// and the way into the whole Journal. One call, GET /v1/journal/home, for the country being browsed.
import { router } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { ArticleTile, FeaturedCard } from "@/components/cj-cards";
import { Btn, Empty, Failed, Loading, Row, Serif, T } from "@/components/ui";
import { journalHref, loadJournalHome, type Article } from "@/lib/cj-data";
import { c, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export function JournalSection({ country }: { country: string }) {
  const q = useLoad(() => loadJournalHome(country), [country]);
  const d = q.data;
  // With nothing marked featured, the newest piece takes the tall card so the section still has a lead.
  const lead: Article | null = d ? d.featured ?? d.latest?.[0] ?? null : null;
  const rest: Article[] = d ? (d.latest ?? []).filter((a) => a.slug !== lead?.slug).slice(0, 3) : [];
  const count = Number(d?.count) || 0;
  const readAll = () => router.push(journalHref() as never);

  return (
    <View style={{ marginTop: 26 }}>
      <Row between style={{ paddingHorizontal: pad }}>
        <Serif size={22} style={{ flex: 1 }}>From the Journal</Serif>
        {lead ? <Pressable accessibilityRole="link" onPress={readAll} hitSlop={14}><T size={13} weight="semi" color={c.wine}>See all</T></Pressable> : null}
      </Row>
      <T muted size={13} style={{ paddingHorizontal: pad, marginTop: 2, marginBottom: 12 }}>Useful reading on hair, nails, skin and the rest, written for here.</T>

      {q.loading && !d ? <Loading label="Loading the Journal" /> : null}
      {q.error && !d ? <View style={{ paddingHorizontal: pad }}><Failed error={q.error} onRetry={q.reload} /></View> : null}
      {d && !lead ? <View style={{ paddingHorizontal: pad }}><Empty title="Nothing published yet">Articles appear here as soon as the editors publish them.</Empty></View> : null}

      {lead ? (
        <>
          <View style={{ paddingHorizontal: pad }}><FeaturedCard a={lead} /></View>
          {rest.length ? (
            <FlatList horizontal data={rest} keyExtractor={(a) => a.slug} renderItem={({ item }) => <ArticleTile a={item} />} showsHorizontalScrollIndicator={false}
              style={{ marginTop: 12 }} contentContainerStyle={{ paddingHorizontal: pad, gap: 12 }} />
          ) : null}
          <View style={{ paddingHorizontal: pad, marginTop: 14 }}>
            <Btn kind="out" onPress={readAll} label={count > 1 ? `Read the Journal, ${count} articles` : "Read the Journal"}>Read the Journal</Btn>
          </View>
        </>
      ) : null}
    </View>
  );
}
