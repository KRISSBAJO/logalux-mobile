// The client list (design: M3-Clients). The API searches, filters, sorts and pages (25 at a time);
// this screen asks for the next page as the list nears its end.
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Empty, Failed, Field, IconButton, Loading, Note, Row as Line, Serif, T } from "@/components/ui";
import { ClientSheet } from "@/components/mb-client-form";
import { ChipRow, Choice, CountChip, Face, MbIcon, RoundBtn, SearchBox, Sheet, Tag } from "@/components/mb-ui";
import { qs, type Row } from "@/lib/api";
import { clock, money, plural, ymd } from "@/lib/format";
import { useDebounced, useFlash, useMapi, useRefocus } from "@/lib/mb-hooks";
import { can, dateMed, dayOf, tagPills, toneOf } from "@/lib/mb-util";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

// The filters the API has. The design's VIP chip is not one of them (VIP is a tag a business may or may not use), so it is left out.
const SEGMENTS: { id: string; name: string; count?: string }[] = [
  { id: "", name: "All", count: "all" },
  { id: "new", name: "New", count: "new" },
  { id: "regulars", name: "Regulars", count: "regulars" },
  { id: "upcoming", name: "Booked ahead", count: "upcoming" },
  { id: "lapsed", name: "Lapsed", count: "lapsed" },
  { id: "no_show", name: "No-shows", count: "no_show" },
  { id: "waitlist", name: "Waitlist" },
];
const SORTS: [string, string][] = [["", "Last visit"], ["name", "Name"], ["spent", "Most spent"], ["visits", "Most visits"], ["new", "Newest"]];

// One line of a pasted list: commas or tabs, with quotes allowed around a cell (as the web app reads it).
function cells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}
const EMAIL = /^\S+@\S+\.\S+$/, PHONE = /^\+?[\d\s().-]{7,}$/;
function parseRows(text: string) {
  const rows: { name: string; phone: string; email: string; notes: string }[] = [];
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    let name = "", phone = "", email = "";
    const rest: string[] = [];
    for (const cell of cells(line).map((x) => x.trim()).filter(Boolean)) {
      if (!email && EMAIL.test(cell)) email = cell; else if (!phone && PHONE.test(cell)) phone = cell; else if (!name) name = cell; else rest.push(cell);
    }
    if (i === 0 && !phone && !email && /^(name|full name|client|client name)$/i.test(name)) return; // a heading row
    rows.push({ name, phone, email, notes: rest.join(", ") });
  });
  return rows;
}

export default function Clients() {
  const s = useSession();
  const mapi = useMapi();
  const insets = useSafeAreaInsets();
  const me = s.merchant, tz = me?.timezone as string | undefined, cur = (me?.currency as string) ?? "USD";
  const manager = can(me, "manager");

  const [q, setQ] = useState(""), dq = useDebounced(q.trim(), 300);
  const [segment, setSegment] = useState(""), [sort, setSort] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ total: number; per: number; pages: number; counts: Row }>({ total: 0, per: 25, pages: 0, counts: {} });
  const [loaded, setLoaded] = useState(false); // whether what is shown matches the search and filter chosen
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [more, setMore] = useState(false);
  const [error, setError] = useState(""), [moreError, setMoreError] = useState("");
  const [sortOpen, setSortOpen] = useState(false), [addOpen, setAddOpen] = useState(false), [importOpen, setImportOpen] = useState(false);
  const [paste, setPaste] = useState(""), [importing, setImporting] = useState(false), [importError, setImportError] = useState("");
  const { flash, show } = useFlash(9000);
  const turn = useRef(0);

  const path = (page: number) => "/clients" + qs({ q: dq, segment, sort, page: page > 1 ? page : undefined });

  /** Loads the first `pages` pages again and replaces the list (a new search, a pull, or coming back to the screen). */
  const load = useCallback(async (pages: number, how: "first" | "pull" | "quiet") => {
    const mine = ++turn.current;
    if (how === "first") { setLoading(true); setLoaded(false); } else if (how === "pull") setRefreshing(true);
    try {
      const out = await Promise.all(Array.from({ length: Math.max(1, pages) }, (_, i) => mapi<Row>(path(i + 1))));
      if (mine !== turn.current) return;
      const seen = new Set<string>();
      setRows(out.flatMap((o) => (o.clients ?? []) as Row[]).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))));
      setMeta({ total: Number(out[0].total ?? 0), per: Number(out[0].per_page ?? 25), pages: out.length, counts: (out[0].counts ?? {}) as Row });
      setError(""); setMoreError(""); setLoaded(true);
    } catch (e) {
      if (mine === turn.current) setError((e as Error).message || "Something went wrong.");
    } finally {
      if (mine === turn.current) { setLoading(false); setRefreshing(false); setMore(false); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, segment, sort, mapi]);

  useEffect(() => { void load(1, "first"); }, [load, s.businessToken]);
  useRefocus(() => { void load(meta.pages || 1, "quiet"); });

  const hasMore = loaded && rows.length < meta.total;
  const loadMore = async () => {
    if (!hasMore || more || loading || refreshing) return;
    const mine = turn.current, next = meta.pages + 1;
    setMore(true); setMoreError("");
    try {
      const out = await mapi<Row>(path(next));
      if (mine !== turn.current) return;
      const got = (out.clients ?? []) as Row[];
      setRows((old) => { const seen = new Set(old.map((r) => r.id)); return [...old, ...got.filter((r) => !seen.has(r.id))]; });
      setMeta((m) => ({ ...m, pages: next, total: got.length ? Number(out.total ?? m.total) : Math.min(m.total, rows.length) }));
    } catch (e) {
      if (mine === turn.current) setMoreError((e as Error).message);
    } finally {
      if (mine === turn.current) setMore(false);
    }
  };

  const runImport = async () => {
    const list = parseRows(paste);
    if (!list.length) { setImportError("Paste at least one client: a name, then a phone number or an email."); return; }
    setImporting(true); setImportError("");
    try {
      const out = await mapi<Row>("/clients/import", { method: "POST", body: { rows: list } });
      const added = Number(out.added ?? 0), skipped = Number(out.skipped ?? 0), problems = ((out.problems ?? []) as string[]).join("; ");
      const message = `${added} added, ${skipped} skipped.` + (skipped ? ` Rows are skipped when the phone or email is already in your list or does not look right.${problems ? " " + problems + "." : ""}` : "");
      setImportOpen(false); setPaste("");
      show(message, added > 0 ? "ok" : "bad");
      void load(1, "first");
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const today = ymd(new Date(), tz);
  const subOf = (r: Row) => {
    const visits = Number(r.visits ?? 0), noShows = Number(r.no_show_count ?? 0);
    const first = r.next_visit ? `Next: ${dayOf(r.next_visit, tz) === today ? `today ${clock(r.next_visit, tz)}` : dateMed(r.next_visit, tz)}` : r.last_visit ? `Last: ${dayOf(r.last_visit, tz) === today ? "today" : dateMed(r.last_visit, tz)}` : "";
    const parts = [first, visits > 0 ? plural(visits, "visit") : "", Number(r.spent_cents) > 0 ? money(r.spent_cents, cur) : "", noShows > 0 ? plural(noShows, "no-show") : ""].filter(Boolean);
    return parts.length ? parts.join(" · ") : r.phone || r.email || "No visits yet";
  };

  const counts = meta.counts, lapsed = Number(counts.lapsed ?? 0);
  const sortName = SORTS.find(([id]) => id === sort)?.[1] ?? "Last visit";

  const header = (
    <View style={{ paddingTop: insets.top + 14 }}>
      <Line between>
        <Line gap={8} style={{ alignItems: "baseline", flex: 1 }}>
          <Serif size={30}>Clients</Serif>
          {counts.all !== undefined ? <Text style={{ fontFamily: f.medium, fontSize: 18, color: c.muted }}>{Number(counts.all).toLocaleString("en-US")}</Text> : null}
        </Line>
        <Line gap={8}>
          {manager ? <RoundBtn icon="download" label="Import clients" onPress={() => { setImportError(""); setImportOpen(true); }} /> : null}
          <IconButton icon="plus" label="Add client" dark onPress={() => setAddOpen(true)} />
        </Line>
      </Line>

      <SearchBox label="Search clients" placeholder="Name, phone or email" value={q} onChangeText={setQ} style={{ marginTop: 16 }} />

      <ChipRow style={{ marginTop: 12 }}>
        {SEGMENTS.map((seg) => <CountChip key={seg.id} on={segment === seg.id} count={seg.count && counts[seg.count] !== undefined ? Number(counts[seg.count]) : undefined} onPress={() => setSegment(seg.id)}>{seg.name}</CountChip>)}
      </ChipRow>

      {flash ? <View style={{ marginTop: 12 }}><Note kind={flash.kind}>{flash.text}</Note></View> : null}

      {lapsed > 0 && segment !== "lapsed" ? (
        <View style={{ marginTop: 14, backgroundColor: c.ink, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <MbIcon name="spark" size={22} color={c.gold} />
          <Text style={{ flex: 1, fontFamily: f.body, fontSize: 13, lineHeight: 19, color: "#F4ECE3" }}>
            <Text style={{ fontFamily: f.bold }}>{plural(lapsed, "client")}</Text> {lapsed === 1 ? "has" : "have"} not been back in 60 days and {lapsed === 1 ? "has" : "have"} nothing booked.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setSegment("lapsed")} style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.gold, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.ink }}>See them</Text>
          </Pressable>
        </View>
      ) : null}

      <Line between style={{ marginTop: 10, minHeight: 44 }}>
        <T size={12} muted>{loaded ? (dq || segment ? `${plural(meta.total, "client")} found` : `${plural(meta.total, "client")}`) : " "}</T>
        <Pressable accessibilityRole="button" accessibilityLabel={`Sort by ${sortName.toLowerCase()}. Change`} onPress={() => setSortOpen(true)} hitSlop={8} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <T size={12} muted>Sort: </T><T size={12} weight="semi">{sortName.toLowerCase()}</T>
          <View style={{ marginLeft: 2 }}><MbChevron /></View>
        </Pressable>
      </Line>

      {(loading || !s.ready) && !loaded ? <Loading label="Loading clients" /> : null}
      {error && !loaded && !loading && s.ready ? <Failed error={error} onRetry={() => { void load(1, "first"); }} /> : null}
      {error && loaded ? <View style={{ marginBottom: 8 }}><Note kind="bad">{error} Showing what was loaded before.</Note></View> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.cream }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        data={loaded ? rows : []}
        keyExtractor={(r) => String(r.id)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(1, "pull"); }} tintColor={c.wine} />}
        ListHeaderComponent={header}
        onEndReachedThreshold={0.4}
        onEndReached={() => { void loadMore(); }}
        renderItem={({ item: r }) => {
          const pill = tagPills(r)[0];
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${r.name}. ${subOf(r)}`} onPress={() => router.push(`/m/client/${r.id}` as never)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
              <Face name={r.name} tone={toneOf(String(r.name))} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 15, lineHeight: 20, color: c.ink }}>{r.name}</Text>
                <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{subOf(r)}</Text>
              </View>
              {pill ? <Tag tone={pill.tone} style={{ alignSelf: "center" }}>{pill.text}</Tag> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={loaded ? (
          dq || segment
            ? <Empty title="No clients match" action={<Btn kind="out" small onPress={() => { setQ(""); setSegment(""); }}>See everyone</Btn>}>Try another name or number, or a different filter.</Empty>
            : <Empty title="No clients yet" action={<Btn small onPress={() => setAddOpen(true)}>Add client</Btn>}>Add your first client here. Anyone who books online is added for you.</Empty>
        ) : null}
        ListFooterComponent={loaded && rows.length ? (
          <View style={{ paddingTop: 16, alignItems: "center", gap: 10 }}>
            {more ? <ActivityIndicator color={c.wine} /> : null}
            {moreError ? <Failed error={moreError} onRetry={() => { void loadMore(); }} /> : null}
            {!more && !moreError ? <T size={12} muted>{hasMore ? `Showing ${rows.length} of ${meta.total.toLocaleString("en-US")}` : `That is all ${plural(rows.length, "client")}.`}</T> : null}
            {hasMore && !more && !moreError ? <Btn kind="out" small onPress={() => { void loadMore(); }}>Show more</Btn> : null}
          </View>
        ) : null}
      />

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort clients">
        {SORTS.map(([id, name]) => <Choice key={id} title={name} on={sort === id} onPress={() => { setSort(id); setSortOpen(false); }} />)}
      </Sheet>

      <ClientSheet open={addOpen} mode="new" onClose={() => setAddOpen(false)} onSaved={(id) => { setAddOpen(false); router.push(`/m/client/${id}?added=1` as never); }} />

      <Sheet open={importOpen} onClose={() => setImportOpen(false)} title="Import clients" sub="Paste a list. Nobody already in your list is changed." footer={<Btn busy={importing} onPress={runImport}>Import</Btn>}>
        {importError ? <Note kind="bad">{importError}</Note> : null}
        <Field label="One client per line" value={paste} onChangeText={setPaste} multiline autoCapitalize="none" autoCorrect={false} style={{ minHeight: 180 }}
          placeholder={"Kemi Adeyemi, +16155554471, kemi@example.com\nTomi Alade, +16155552210"} hint="Name, phone, email, in any order, separated by commas or tabs. You can paste straight from a spreadsheet. Up to 2,000 at a time." />
        <T size={13} muted>Imported clients get the tag imported. A row is skipped when its phone or email is already in your list.</T>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function MbChevron() {
  return <View style={{ width: 7, height: 7, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: c.ink, transform: [{ rotate: "45deg" }], marginTop: -3 }} />;
}
