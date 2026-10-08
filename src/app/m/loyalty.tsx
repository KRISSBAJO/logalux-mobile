// Loyalty points: the rules (earn, worth, fewest to spend), on or off, who holds points, and every movement.
// GET /v1/m/loyalty reads it all; PUT /loyalty/settings saves the rules; POST /loyalty/adjust adds or takes points by hand.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Grp, Header, Sheet, SmallBtn, Sw, Tag, piece } from "@/components/mc-kit";
import { LinkText } from "@/components/ma-kit";
import { B, KV, Night, NightBig, NightLabel, NightStat, NightText, NotReady, Tip, Toast, type Said } from "@/components/mg-kit";
import { Btn, Card, Chip, Empty, Field, Label, Note, Row, T } from "@/components/ui";
import { qs, type Row as Data } from "@/lib/api";
import { money, plural, when } from "@/lib/format";
import { major, symbol, toCents, toInt } from "@/lib/mc-util";
import { useGrow } from "@/lib/mg-load";
import { POINT_REASON, n, type Rules } from "@/lib/mg-util";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

type RulesForm = { enabled: boolean; earn: string; per: string; value: string; least: string };
type Adjust = { id: string; name: string; points: number | null; dir: "add" | "take"; amount: string; note: string };
type Item = { kind: "client" | "move"; row: Data };
const FIRST_MOVES = 10;

/** The worked example under the rules, in the web's words. Null when the numbers are not all there. */
function example(earn: number, perCents: number, valueCents: number, least: number, cur: string) {
  if (!(perCents > 0 && earn > 0 && valueCents > 0)) return null;
  const spend = perCents * 100, points = Math.floor(spend / perCents) * earn, back = (earn * valueCents) / perCents;
  return { text: `Spend ${money(spend, cur)}, earn ${n(points)} points. ${n(least)} points = ${money(least * valueCents, cur)} off.`, back: `${(back * 100).toFixed(back < 0.1 ? 1 : 0).replace(/\.0$/, "")}%`, tooMuch: back > 0.5 };
}

export default function Loyalty() {
  const s = useSession();
  const insets = useSafeAreaInsets();
  const cur = (s.merchant?.currency as string) ?? "USD", tz = s.merchant?.timezone as string | undefined;

  const { d, denied, error, reload, refresh, refreshing } = useGrow(s, () => s.mapi<Data>("/loyalty"));
  const [note, setNote] = useState<Said>(null);
  const [form, setForm] = useState<RulesForm | null>(null), [formError, setFormError] = useState(""), [saving, setSaving] = useState(false);
  const [adj, setAdj] = useState<Adjust | null>(null), [adjError, setAdjError] = useState(""), [adjBusy, setAdjBusy] = useState(false);
  const [find, setFind] = useState(""), [found, setFound] = useState<Data[] | null>(null), [finding, setFinding] = useState(false), [findError, setFindError] = useState("");
  const [filter, setFilter] = useState(""), [allMoves, setAllMoves] = useState(false), [toggling, setToggling] = useState(false);

  const clients = useMemo(() => ((d?.clients ?? []) as Data[]), [d]);
  const recent = useMemo(() => ((d?.recent ?? []) as Data[]), [d]);
  const balance = useMemo(() => new Map(clients.map((x) => [String(x.id), Number(x.points)])), [clients]);
  const shownClients = useMemo(() => { const q = filter.trim().toLowerCase(); return q ? clients.filter((x) => String(x.name).toLowerCase().includes(q) || String(x.phone ?? "").includes(q)) : clients; }, [clients, filter]);
  const sections = useMemo(() => [
    { key: "clients", title: `Clients with points · ${clients.length}`, data: shownClients.map((row) => ({ kind: "client", row }) as Item) },
    { key: "moves", title: "Recent movements", data: (allMoves ? recent : recent.slice(0, FIRST_MOVES)).map((row) => ({ kind: "move", row }) as Item) },
  ], [clients.length, shownClients, recent, allMoves]);

  if (!d) return <NotReady title="Loyalty" denied={denied} error={error} reload={reload} what="Loyalty points and their rules are set by a manager or the owner." />;

  const rules = d.rules as Rules, k = (d.kpis ?? {}) as Data;
  const ex = example(rules.earn_points, rules.per_cents, rules.point_value_cents, rules.min_redeem, cur);

  const saveRules = async (next: Rules, done: string) => {
    await s.mapi("/loyalty/settings", { method: "PUT", body: next });
    setNote({ kind: "ok", text: done });
    await refresh();
  };
  const toggle = async () => {
    const enabled = !rules.enabled;
    setToggling(true); setNote(null);
    try { await saveRules({ ...rules, enabled }, enabled ? "Loyalty is on. Clients earn points from their next checkout." : "Loyalty is off: nobody earns or spends points. Balances are kept."); }
    catch (e) { setNote({ kind: "bad", text: (e as Error).message }); }
    setToggling(false);
  };
  const openRules = () => { setFormError(""); setForm({ enabled: rules.enabled, earn: String(rules.earn_points), per: major(rules.per_cents), value: major(rules.point_value_cents), least: String(rules.min_redeem) }); };
  const live = form ? { earn: toInt(form.earn) ?? 0, per: toCents(form.per) ?? 0, value: toCents(form.value) ?? 0, least: toInt(form.least) ?? 0 } : null;
  const liveEx = live ? example(live.earn, live.per, live.value, live.least, cur) : null;
  const submitRules = async () => {
    if (!form || !live) return;
    if (live.earn < 1 || live.earn > 1000) { setFormError("Points earned must be a whole number between 1 and 1,000."); return; }
    if (live.per < 1) { setFormError("Say how much a client spends to earn those points."); return; }
    if (live.value < 1) { setFormError("Say what one point is worth."); return; }
    if (live.least < 1 || live.least > 100000) { setFormError("The fewest points that can be spent must be at least 1."); return; }
    setSaving(true); setFormError("");
    try {
      await saveRules({ enabled: form.enabled, earn_points: live.earn, per_cents: live.per, point_value_cents: live.value, min_redeem: live.least }, form.enabled ? "Saved. Clients earn points from their next checkout." : "Saved. Loyalty is off: nobody earns or spends points.");
      setForm(null);
    } catch (e) { setFormError((e as Error).message); }
    setSaving(false);
  };

  const search = async () => {
    const q = find.trim();
    if (!q) { setFound(null); return; }
    setFinding(true); setFindError("");
    try {
      const out = await s.mapi<Data>("/clients" + qs({ q, per_page: 8 }));
      setFound(((out.clients ?? []) as Data[]).slice(0, 8));
    } catch (e) { setFindError((e as Error).message); setFound(null); }
    setFinding(false);
  };

  const openAdjust = (client: Data, points: number | null) => { setAdjError(""); setAdj({ id: String(client.id), name: String(client.name), points, dir: "add", amount: "", note: "" }); };
  const submitAdjust = async () => {
    if (!adj) return;
    const amount = toInt(adj.amount);
    if (amount === null || amount < 1 || amount > 100000) { setAdjError("Enter the points as a whole number from 1 to 100,000."); return; }
    if (adj.note.trim().length < 3) { setAdjError("Add a short reason. It is kept on the record."); return; }
    setAdjBusy(true); setAdjError("");
    try {
      const out = await s.mapi<Data>("/loyalty/adjust", { body: { client_id: adj.id, points: adj.dir === "take" ? -amount : amount, note: adj.note.trim() } });
      setNote({ kind: "ok", text: `Done. ${adj.name} now has ${n(out.points)} points.` });
      setAdj(null);
      await refresh();
    } catch (e) { setAdjError((e as Error).message); }
    setAdjBusy(false);
  };

  const header = (
    <View>
      <Header title="Loyalty" />

      <Night style={{ marginTop: 14 }}>
        <Row between style={{ alignItems: "flex-start" }}>
          <NightLabel>Points not yet spent</NightLabel>
          <Tag kind="night">{rules.enabled ? "Loyalty is on" : "Loyalty is off"}</Tag>
        </Row>
        <NightBig label={`${n(k.outstanding)} points`}>{n(k.outstanding)}</NightBig>
        <NightText>worth {money(Number(k.outstanding) * rules.point_value_cents, cur)} off future visits, held by {plural(Number(k.members), "client")}</NightText>
        <Row gap={10} style={{ marginTop: 14, alignItems: "flex-start" }}>
          <NightStat label="Earned · 30 days" value={n(k.earned_30d)} sub="points given at checkout" />
          <NightStat label="Spent · 30 days" value={n(k.redeemed_30d)} sub={Number(k.redeemed_30d) ? `${money(Number(k.redeemed_30d) * rules.point_value_cents, cur)} off, across ${plural(Number(k.redemptions_30d), "sale")}` : "no points spent"} />
        </Row>
      </Night>

      <Grp>The rules</Grp>
      <Card>
        <Row style={{ paddingVertical: 13, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <View style={{ flex: 1 }}>
            <T size={14} weight="semi">Give loyalty points</T>
            <T size={12} muted>When this is off nobody earns or spends points. Balances are kept.</T>
          </View>
          <Sw on={rules.enabled} disabled={toggling} label={`Give loyalty points: ${rules.enabled ? "on, turn off" : "off, turn on"}`} onPress={toggle} />
        </Row>
        <View style={{ paddingHorizontal: 16 }}>
          <KV k="Clients earn" v={`${plural(rules.earn_points, "point")} per ${money(rules.per_cents, cur)} spent`} />
          <KV k="One point is worth" v={money(rules.point_value_cents, cur)} />
          <KV k="Fewest to spend at once" v={`${n(rules.min_redeem)} points = ${money(rules.min_redeem * rules.point_value_cents, cur)} off`} last />
        </View>
      </Card>
      {ex ? <Tip style={{ marginTop: 8 }}><B>{ex.text}</B> That gives back {ex.back} of what a client spends.</Tip> : null}
      <SmallBtn kind="out" onPress={openRules} style={{ alignSelf: "flex-start", marginTop: 10 }}>Change the rules</SmallBtn>
      <T size={12} muted style={{ marginTop: 10 }}>Points are earned on what a client pays for services and products, not on tips or tax. They are spent at Checkout. A change to the rules applies from the next sale; points already earned stay as they are.</T>

      <Grp>Give points to a client by hand</Grp>
      <Row gap={8} style={{ alignItems: "flex-end" }}>
        <View style={{ flex: 1 }}><Field label="Name or phone number" value={find} onChangeText={(t) => { setFind(t); if (!t.trim()) setFound(null); }} returnKeyType="search" onSubmitEditing={search} autoCorrect={false} placeholder="Find a client" /></View>
        <Btn kind="out" busy={finding} onPress={search} style={{ height: 52 }}>Find</Btn>
      </Row>
      {findError ? <View style={{ marginTop: 8 }}><Note kind="bad">{findError}</Note></View> : null}
      {found ? (found.length ? (
        <Card style={{ marginTop: 8 }}>
          {found.map((x, i) => {
            const has = balance.get(String(x.id));
            return (
              <Row key={x.id} style={{ paddingVertical: 10, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: i === found.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{x.name}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{[x.phone, has !== undefined ? `${n(has)} points` : "no points yet"].filter(Boolean).join(" · ")}</Text>
                </View>
                <SmallBtn kind="out" onPress={() => openAdjust(x, has ?? null)}>{has === undefined ? "Give points" : "Adjust"}</SmallBtn>
              </Row>
            );
          })}
        </Card>
      ) : <T size={13} muted style={{ marginTop: 8 }}>No client matches &quot;{find.trim()}&quot;.</T>) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <SectionList
        sections={sections}
        keyExtractor={(x) => x.kind + String(x.row.id)}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: pad, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <View>
            <Grp style={{ marginTop: 20 }}>{section.title}</Grp>
            {section.key === "clients" && clients.length > 8 ? <View style={{ marginBottom: 10 }}><Field label="Search these clients" value={filter} onChangeText={setFilter} autoCorrect={false} placeholder="Name or phone number" /></View> : null}
            {section.key === "clients" && !clients.length ? <Empty title="Nobody has points yet">{rules.enabled ? "Clients earn points the next time they pay at Checkout." : "Switch loyalty on and clients earn points each time they pay at Checkout."}</Empty> : null}
            {section.key === "clients" && clients.length > 0 && !shownClients.length ? <T size={13} muted>No client with points matches &quot;{filter.trim()}&quot;.</T> : null}
            {section.key === "moves" && !recent.length ? <Empty title="No movements yet">Every time points are earned, spent or changed by hand, it is listed here.</Empty> : null}
          </View>
        )}
        renderSectionFooter={({ section }) => (section.key === "moves" && recent.length > FIRST_MOVES && !allMoves ? <LinkText onPress={() => setAllMoves(true)}>{`Show all ${recent.length} movements`}</LinkText> : null)}
        renderItem={({ item, index, section }) => {
          const first = index === 0, last = index === section.data.length - 1, x = item.row;
          if (item.kind === "client") {
            return (
              <Pressable accessibilityRole="button" accessibilityLabel={`${x.name}, ${n(x.points)} points, worth ${money(Number(x.points) * rules.point_value_cents, cur)}. Adjust`} onPress={() => openAdjust(x, Number(x.points))}
                style={({ pressed }) => [piece(first, last), { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 60, opacity: pressed ? 0.75 : 1 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{x.name}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>Earned {n(x.earned)} · spent {n(x.redeemed)}{x.last_at ? ` · ${when(String(x.last_at), tz)}` : ""}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontFamily: f.bold, fontSize: 15, color: c.ink }}>{n(x.points)}</Text>
                  <Text style={{ fontFamily: f.medium, fontSize: 11, lineHeight: 15, color: c.muted }}>{money(Number(x.points) * rules.point_value_cents, cur)}</Text>
                </View>
              </Pressable>
            );
          }
          const pts = Number(x.points);
          return (
            <View style={[piece(first, last), { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 60 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{x.client}</Text>
                <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{[POINT_REASON[x.reason] ?? x.reason, x.note, x.actor ? `by ${x.actor}` : ""].filter(Boolean).join(" · ")}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: f.bold, fontSize: 15, color: pts < 0 ? c.bad : c.ok }}>{pts > 0 ? "+" : "−"}{n(Math.abs(pts))}</Text>
                <Text style={{ fontFamily: f.medium, fontSize: 11, lineHeight: 15, color: c.muted }}>{when(String(x.created_at), tz)}</Text>
              </View>
            </View>
          );
        }}
      />

      <Toast note={note} onDone={() => setNote(null)} />

      <Sheet tall open={!!form} onClose={() => setForm(null)} title="Loyalty rules" sub="A change applies from the next sale. Points already earned stay as they are."
        footer={<Btn busy={saving} onPress={submitRules}>Save rules</Btn>}>
        {form ? (
          <>
            {formError ? <Note kind="bad">{formError}</Note> : null}
            <Card>
              <Row style={{ paddingVertical: 13, paddingHorizontal: 16, minHeight: 56 }}>
                <View style={{ flex: 1 }}>
                  <T size={14} weight="semi">Give loyalty points</T>
                  <T size={12} muted>When this is off nobody earns or spends points. Balances are kept.</T>
                </View>
                <Sw on={form.enabled} label="Give loyalty points" onPress={() => setForm({ ...form, enabled: !form.enabled })} />
              </Row>
            </Card>
            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}><Field label="Points earned" value={form.earn} onChangeText={(earn) => setForm({ ...form, earn })} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Field label={`Per ${symbol(cur)} spent`} value={form.per} onChangeText={(per) => setForm({ ...form, per })} keyboardType="decimal-pad" /></View>
            </Row>
            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}><Field label={`Point worth (${symbol(cur)})`} value={form.value} onChangeText={(value) => setForm({ ...form, value })} keyboardType="decimal-pad" /></View>
              <View style={{ flex: 1 }}><Field label="Fewest to spend" value={form.least} onChangeText={(least) => setForm({ ...form, least })} keyboardType="number-pad" /></View>
            </Row>
            {liveEx
              ? <Tip><B>{liveEx.text}</B> That gives back {liveEx.back} of what a client spends.{liveEx.tooMuch ? <B> That is more than half of every sale, so it will not be saved. Check the numbers.</B> : null}</Tip>
              : <Tip>Fill in all four numbers to see an example.</Tip>}
          </>
        ) : null}
      </Sheet>

      <Sheet open={!!adj} onClose={() => setAdj(null)} title={adj ? `Points for ${adj.name}` : ""} sub={adj ? (adj.points === null ? "Add points by hand, for a gift or to put right a mistake." : `${n(adj.points)} points now. A balance cannot go below zero.`) : undefined}
        footer={<Btn busy={adjBusy} onPress={submitAdjust}>Save</Btn>}>
        {adj ? (
          <>
            {adjError ? <Note kind="bad">{adjError}</Note> : null}
            {adj.points ? (
              <View style={{ gap: 8 }}>
                <Label>Add or take away</Label>
                <Row gap={8}>
                  <Chip on={adj.dir === "add"} onPress={() => setAdj({ ...adj, dir: "add" })}>Add points</Chip>
                  <Chip on={adj.dir === "take"} onPress={() => setAdj({ ...adj, dir: "take" })}>Take points away</Chip>
                </Row>
              </View>
            ) : null}
            <Field label={adj.points ? "Points" : "Points to add"} value={adj.amount} onChangeText={(amount) => setAdj({ ...adj, amount })} keyboardType="number-pad" hint={toInt(adj.amount) ? `Worth ${money((toInt(adj.amount) ?? 0) * rules.point_value_cents, cur)} off a visit.` : undefined} />
            <Field label="Reason · kept on the record" value={adj.note} onChangeText={(text) => setAdj({ ...adj, note: text })} maxLength={160} placeholder="Birthday gift" />
            <LinkText onPress={() => { const id = adj.id; setAdj(null); router.push(`/m/client/${id}` as never); }}>Open this client</LinkText>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
