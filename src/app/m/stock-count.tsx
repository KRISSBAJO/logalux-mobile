// A count of the whole shelf: type what is there, and every product whose number changed is set to it
// (POST /v1/m/products/{id}/stock with reason "count", one product at a time, as the web does).
// With more than one location the count is of one location's shelf.
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Grp, Header, piece } from "@/components/mc-kit";
import { Blank, ChipRow, CountChip, Fine, NumBox, SearchBox } from "@/components/mf-kit";
import { Btn, Empty, Field, Note } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { plural } from "@/lib/format";
import { DENIED, orDenied, signedIn } from "@/lib/mc-util";
import { shelf, whole } from "@/lib/mf-stock";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function StockCount() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const { location } = useLocalSearchParams<{ location?: string }>();
  const { data, error, reload, refresh } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/inventory"))), [s.businessToken]);

  const [at, setAt] = useState(String(location ?? ""));
  const [q, setQ] = useState(""), [memo, setMemo] = useState("");
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const d = data && data !== DENIED ? data : null;
  const all = useMemo(() => ((d?.products ?? []) as Data[]).slice().sort((a, b) => String(a.name).localeCompare(String(b.name))), [d]);
  const locations = useMemo(() => ((d?.locations ?? []) as Data[]), [d]);
  const multi = locations.length > 1;
  const loc = multi ? locations.find((l) => l.id === at) ?? locations.find((l) => l.is_primary) ?? locations[0] : undefined;
  const was = (p: Data) => (loc ? shelf(p, String(loc.id)) : Number(p.stock));
  const shown = useMemo(() => {
    const word = q.trim().toLowerCase();
    return all.filter((p) => !word || String(p.name).toLowerCase().includes(word) || String(p.sku ?? "").toLowerCase().includes(word));
  }, [all, q]);

  if (!d) return <Blank title="Stock count" error={error} onRetry={reload} denied={data === DENIED} what="Counting stock belongs to a manager or the owner." />;

  const changes = all.filter((p) => { const t = (counted[String(p.id)] ?? "").trim(); return t !== "" && t !== String(was(p)); });
  const bad = changes.some((p) => whole(counted[String(p.id)] ?? "") === null);

  const save = async () => {
    if (bad) { setNote({ kind: "bad", text: "A count is a whole number, zero or more. Check the boxes you changed." }); return; }
    setSaving(true); setNote(null);
    let ok = 0, failed = "";
    for (const p of changes) {
      try {
        await s.mapi(`/products/${p.id}/stock`, { body: { delta: whole(counted[String(p.id)]), reason: "count", note: memo.trim() || "Stock count", ...(loc ? { location_id: loc.id } : {}) } });
        ok++;
      } catch (e) {
        failed = `${p.name}: ${(e as Error).message}`;
        break;
      }
    }
    setCounted({});
    await refresh();
    setNote(failed
      ? { kind: "bad", text: `${ok ? `${plural(ok, "product")} corrected, then it stopped. ` : ""}${failed} The rest were not changed.` }
      : { kind: "ok", text: ok ? `Count saved. ${ok} ${ok === 1 ? "product was" : "products were"} corrected.` : "Nothing was different, so nothing changed." });
    setSaving(false);
  };

  const header = (
    <View>
      <Header title="Stock count" />
      {all.length ? (
        <>
          <Fine style={{ marginTop: 12 }}>{loc ? `Type what is on the shelf at ${loc.name}. ` : "Type what is on the shelf. "}Only the numbers you change are saved.</Fine>
          {multi ? (
            <ChipRow style={{ marginTop: 12 }}>
              {locations.map((l) => <CountChip key={l.id} on={loc?.id === l.id} onPress={() => { setAt(String(l.id)); setCounted({}); setNote(null); }}>{`${l.name}${l.is_primary ? " (main)" : ""}`}</CountChip>)}
            </ChipRow>
          ) : null}
          <View style={{ marginTop: 12 }}><SearchBox value={q} onChange={setQ} placeholder="Product or SKU" /></View>
          <Grp>{q.trim() ? `${plural(shown.length, "product")} of ${all.length}` : plural(all.length, "product")}</Grp>
        </>
      ) : <View style={{ marginTop: 16 }}><Empty title="No products to count">Add products in Inventory first, then count them here.</Empty></View>}
      {all.length && !shown.length ? <Empty title="No products match">Try another word. The numbers you typed are kept.</Empty> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.cream }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        data={shown}
        keyExtractor={(p) => String(p.id)}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: pad, paddingBottom: 24 }}
        ListHeaderComponent={header}
        ListFooterComponent={all.length ? (
          <View style={{ marginTop: 16 }}>
            <Field label="Note" value={memo} onChangeText={setMemo} maxLength={120} placeholder="Stock count" hint="Saved with each correction in the stock history." />
          </View>
        ) : null}
        renderItem={({ item: p, index }) => {
          const key = String(p.id), text = counted[key] ?? "", on = text.trim() !== "" && text.trim() !== String(was(p));
          return (
            <View style={[piece(index === 0, index === shown.length - 1), { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 16, minHeight: 64 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{p.name}</Text>
                <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: on ? c.goldInk : c.muted }}>{[p.sku, `${was(p)} on record`, on && whole(text) !== null ? `${whole(text)! - was(p) > 0 ? "+" : "−"}${Math.abs(whole(text)! - was(p))}` : ""].filter(Boolean).join(" · ")}</Text>
              </View>
              <NumBox label={`Counted: ${p.name}`} value={text} placeholder={String(was(p))} changed={on} onChangeText={(t) => { setNote(null); setCounted((x) => ({ ...x, [key]: t })); }} />
            </View>
          );
        }}
      />
      {all.length ? (
        <View style={{ paddingHorizontal: pad, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.cream, gap: 10 }}>
          {note ? <Note kind={note.kind}>{note.text}</Note> : null}
          <Btn busy={saving} disabled={!changes.length} onPress={save}>{changes.length ? `Save count · ${changes.length} changed` : "Save count"}</Btn>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
