// Reading one article: the cover, title and dek, who wrote it, when and how long it takes, the body,
// a way to share it, the four professionals to book for it, related pieces, and the next one.
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BusinessTile, tierLabel } from "@/components/ca-business-card";
import { ArticleRow, Cover } from "@/components/cj-cards";
import { Avatar, Btn, Empty, Failed, Icon, Loading, Note, Pill, Row, Screen, Serif, T, type IconName } from "@/components/ui";
import { ApiError, media } from "@/lib/api";
import { loadCovers } from "@/lib/ca-data";
import { inCountry, shortName, usePlace } from "@/lib/ca-place";
import { articleWebUrl, journalCategoryLabel, journalHref, loadArticle, loadProfessionals, metaLine, type Article } from "@/lib/cj-data";
import { Markdown } from "@/lib/cj-markdown";
import { shareText } from "@/lib/mc-util";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

/** The round buttons that sit on the cover. */
function Round({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(251,247,242,.92)", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={icon === "back" ? 20 : 18} />
    </Pressable>
  );
}

export default function Reader() {
  const p = useLocalSearchParams<{ slug: string }>();
  const slug = String(p.slug ?? "");
  const w = usePlace();
  const insets = useSafeAreaInsets();
  const opened = useRef(""); // the first open of an article counts as a read; a refresh does not
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const page = useLoad(async () => {
    try {
      const quiet = opened.current === slug;
      const out = await loadArticle(slug, quiet);
      opened.current = slug;
      return { missing: false as const, ...out };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return { missing: true as const, article: null, related: [], next: null };
      throw e;
    }
  }, [slug]);
  const a: Article | null = page.data && !page.data.missing ? page.data.article : null;

  // Who to book for it, nearest the place first. Asked once the article is known, with the same place as Home and Search.
  const placeKey = JSON.stringify(w.query);
  const pros = useLoad(async () => {
    if (!a || !w.ready) return null;
    const [list, covers] = await Promise.all([loadProfessionals(slug, w.query), loadCovers()]);
    return { list: list.slice(0, 4), covers };
  }, [slug, !!a, placeKey, w.ready]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/c/journal" as never));
  const share = async () => {
    if (!a) return;
    setNote(null);
    const out = await shareText(a.title, articleWebUrl(a.slug));
    if (out === "copied") setNote({ kind: "ok", text: "Link copied." });
    else if (out === "failed") setNote({ kind: "bad", text: "Could not share just now." });
  };

  if (!a) {
    return (
      <Screen>
        <Row style={{ minHeight: 44, marginBottom: 14 }}><Round icon="back" label="Back" onPress={back} /></Row>
        {page.data?.missing ? (
          <Empty title="We could not find this article" action={<Btn small onPress={() => router.replace("/c/journal" as never)}>Read the Journal</Btn>}>It may have moved, or it is not published yet.</Empty>
        ) : page.error ? <Failed error={page.error} onRetry={page.reload} /> : <Loading label="Loading the article" />}
      </Screen>
    );
  }

  const next = page.data?.next && page.data.next.slug !== a.slug ? page.data.next : null;
  // The next piece has its own card at the end, so it is not repeated among the related ones.
  const related = (page.data?.related ?? []).filter((x) => x.slug !== a.slug && x.slug !== next?.slug).slice(0, 3);
  const here = w.place ? shortName(w.place) : "";
  const cta = (a.cta_text || "").trim() || "Book it";
  const tags = (a.tags ?? []).filter((t) => typeof t === "string" && t.trim());
  const proCategory = a.related_category || a.category;

  return (
    <Screen padded={false} top={false} onRefresh={page.refresh} refreshing={page.refreshing}>
      {/* ----- cover ----- */}
      <Cover a={a} height={300} motif={260}>
        <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 10, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <Round icon="back" label="Back" onPress={back} />
          <Round icon="share" label={`Share ${a.title}`} onPress={() => void share()} />
        </View>
        <Pressable accessibilityRole="link" accessibilityLabel={`More in ${journalCategoryLabel(a)}`} onPress={() => router.push(journalHref({ category: a.category }) as never)} hitSlop={8} style={{ position: "absolute", left: 16, bottom: 14 }}>
          <View style={{ backgroundColor: "rgba(251,247,242,.92)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.goldInk }}>{journalCategoryLabel(a)}</Text>
          </View>
        </Pressable>
      </Cover>

      {/* ----- title, dek, author, when ----- */}
      <View style={{ paddingHorizontal: pad, paddingTop: 20 }}>
        {note ? <View style={{ marginBottom: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
        <Serif size={30} style={{ fontFamily: f.serifBold, lineHeight: 36 }}>{a.title}</Serif>
        {a.dek ? <Text style={{ fontFamily: f.body, fontSize: 17, lineHeight: 25, color: c.muted, marginTop: 12 }}>{a.dek}</Text> : null}
        <Row gap={12} style={{ marginTop: 18 }}>
          <Avatar name={a.author_name || "LogaLuxe"} uri={media(a.author_media_id)} tone={c.ink} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{a.author_name || "LogaLuxe"}</Text>
            {a.author_role ? <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 13, color: c.muted }}>{a.author_role}</Text> : null}
          </View>
        </Row>
        <Row gap={10} wrap style={{ marginTop: 12 }}>
          <T muted size={13}>{metaLine(a)}</T>
          {a.country ? <Pill kind="grey">For {inCountry(a.country)}</Pill> : null}
        </Row>
        {a.cover_media_id && a.cover_alt ? <T muted size={12} style={{ marginTop: 10 }}>{a.cover_alt}</T> : null}
        <View style={{ height: 1, backgroundColor: c.line, marginTop: 20, marginBottom: 24 }} />

        {/* ----- the body ----- */}
        <Markdown source={a.body_md ?? ""} />

        {tags.length ? (
          <Row gap={8} wrap style={{ marginTop: 6 }}>
            {tags.map((t) => (
              <Pressable key={t} accessibilityRole="link" accessibilityLabel={`Articles tagged ${t}`} onPress={() => router.push(journalHref({ tag: t }) as never)} style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.cream2, justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
                <Text style={{ fontFamily: f.medium, fontSize: 13, color: c.muted }}>{t}</Text>
              </Pressable>
            ))}
          </Row>
        ) : null}

        <Row gap={10} style={{ marginTop: 24 }}>
          <Btn kind="out" small icon="share" onPress={() => void share()}>Share this article</Btn>
        </Row>
      </View>

      {/* ----- book it ----- */}
      <View style={{ marginTop: 32 }}>
        <View style={{ paddingHorizontal: pad, marginBottom: 12 }}>
          <Serif size={22}>{cta}</Serif>
          {pros.data?.list.length ? <T muted size={13} style={{ marginTop: 2 }}>{here ? `Nearest ${w.source === "device" ? "you" : here} first. Tap one to see times.` : "Tap one to see times."}</T> : null}
        </View>
        {pros.loading && !pros.data ? <Loading label="Finding professionals" /> : null}
        {pros.error && !pros.data ? <View style={{ paddingHorizontal: pad }}><Failed error={pros.error} onRetry={pros.reload} /></View> : null}
        {pros.data && pros.data.list.length === 0 ? (
          <View style={{ paddingHorizontal: pad }}>
            <Empty title={here ? `No one for this near ${here} yet` : "No one for this yet"} action={<Btn kind="out" small onPress={() => router.navigate(`/client/search?category=${encodeURIComponent(proCategory)}&t=${Date.now()}` as never)}>Search LogaLuxe</Btn>}>
              Professionals appear here as soon as one in this category opens their calendar on LogaLuxe.
            </Empty>
          </View>
        ) : null}
        {pros.data && pros.data.list.length ? (
          <FlatList horizontal data={pros.data.list} keyExtractor={(b) => b.slug} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, gap: 12 }}
            renderItem={({ item }) => <BusinessTile b={item} cover={pros.data!.covers[item.slug]} src="app" tag={tierLabel(item.tier, w.scope)} />} />
        ) : null}
      </View>

      {/* ----- related, next ----- */}
      {related.length ? (
        <View style={{ paddingHorizontal: pad, marginTop: 32, gap: 10 }}>
          <Serif size={22} style={{ marginBottom: 2 }}>Related</Serif>
          {related.map((x) => <ArticleRow key={x.slug} a={x} />)}
        </View>
      ) : null}
      {next ? (
        <View style={{ paddingHorizontal: pad, marginTop: 32 }}>
          <Serif size={22} style={{ marginBottom: 12 }}>Up next</Serif>
          <ArticleRow a={next} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: pad, marginTop: 24 }}>
        <Btn kind="soft" onPress={() => router.push(journalHref() as never)}>Read the Journal</Btn>
      </View>
    </Screen>
  );
}
