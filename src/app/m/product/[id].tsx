// One product: its photo, how much is on the shelf and where, its fields, what it is used in, and its
// stock history. /m/product/new adds one. There is no single-product route in the API, so the product is
// read from GET /v1/m/inventory (as the web does), with its history and its shop details beside it.
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Grp, Header, Sheet, SmallBtn, Sw, Tag, mc } from "@/components/mc-kit";
import { Blank, Fine, Kv, Line, Meter, Night, Said, useRefocus } from "@/components/mf-kit";
import { ProductFields, bodyOf, draftOf, type ProductDraft } from "@/components/mf-product-form";
import { AdjustSheet, DetailsSheet, MoveSheet, ReorderSheet, UsesSheet } from "@/components/mf-product-sheets";
import { LinkText } from "@/components/ma-kit";
import { Btn, Card, Empty, Note, Photo, Row, Screen, T } from "@/components/ui";
import { media, type Row as Data } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { DENIED, ask, orDenied, signedIn, soft } from "@/lib/mc-util";
import { CATEGORY, KIND, REASON, isLow, isOut, marginOf, meterOf, onOrderIds, reachOf, sells, shelf, stamp, stockState, trim } from "@/lib/mf-stock";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Loaded = { inv: Data; history: Data[]; historyError: string; details: Data | null };
type Open = "" | "edit" | "adjust" | "move" | "reorder" | "details" | "uses";
const MAX_PHOTO = 8 * 1024 * 1024;

export default function Product() {
  const s = useSession();
  const { id: raw, location } = useLocalSearchParams<{ id: string; location?: string }>();
  const id = String(raw ?? ""), isNew = id === "new";
  const cur = (s.merchant?.currency as string) ?? "USD", tz = s.merchant?.timezone as string | undefined;

  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(async (): Promise<Loaded> => {
    const inv = await s.mapi<Data>("/inventory");
    // A product that is not in the list has no history to ask for.
    if (isNew || !((inv.products ?? []) as Data[]).some((x) => x.id === id)) return { inv, history: [], historyError: "", details: null };
    const [hist, det] = await Promise.all([soft(() => s.mapi<Data>(`/products/${encodeURIComponent(id)}/history`)), soft(() => s.mapi<Data>(`/products/${encodeURIComponent(id)}/details`))]);
    return { inv, history: (hist.data?.history ?? []) as Data[], historyError: hist.data ? "" : hist.error, details: det.data };
  })), [s.businessToken, id]);
  useRefocus(refresh, !!s.businessToken && !isNew);

  const [open, setOpen] = useState<Open>("");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string; orders?: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [allHistory, setAllHistory] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(draftOf());
  const [formError, setFormError] = useState("");

  const d = data && data !== DENIED ? data : null;
  const all = useMemo(() => ((d?.inv.products ?? []) as Data[]), [d]);
  const p = useMemo(() => all.find((x) => x.id === id), [all, id]);
  const suppliers = (d?.inv.suppliers ?? []) as Data[], locations = (d?.inv.locations ?? []) as Data[], services = (d?.inv.services ?? []) as Data[];
  const multi = locations.length > 1;
  const set = (change: Partial<ProductDraft>) => { setDraft((x) => ({ ...x, ...change })); setFormError(""); };

  const title = isNew ? "New product" : "Product";
  if (!d) return <Blank title={title} error={error} onRetry={reload} denied={data === DENIED} what="Products and stock belong to a manager or the owner." />;

  // ---------- a new product ----------
  if (isNew) {
    const create = async () => {
      const out = bodyOf(draft, true);
      if (!out.body) { setFormError(out.error ?? ""); return; }
      setBusy("save"); setFormError("");
      try {
        const made = await s.mapi<Data>("/products", { body: out.body });
        router.replace(`/m/product/${made.id}` as never);
      } catch (e) {
        setFormError((e as Error).message);
      }
      setBusy("");
    };
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.cream }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Screen footer={<View style={{ gap: 10 }}>{formError ? <Note kind="bad">{formError}</Note> : null}<Btn busy={busy === "save"} onPress={create}>Add product</Btn></View>}>
          <Header title="New product" />
          <View style={{ marginTop: 16, gap: 14 }}>
            <ProductFields v={draft} set={set} suppliers={suppliers} cur={cur} isNew />
            <Fine>You can add a photo, ingredients and directions once the product is saved.</Fine>
          </View>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  if (!p) {
    return (
      <Screen onRefresh={refresh} refreshing={refreshing}>
        <Header title="Product" />
        <View style={{ marginTop: 16 }}>
          <Empty title="Product not found" action={<Btn small kind="out" onPress={() => router.replace("/m/inventory" as never)} style={{ marginTop: 4 }}>Open Inventory</Btn>}>It may have been removed, or it belongs to another business.</Empty>
        </View>
      </Screen>
    );
  }

  // ---------- a saved product ----------
  const st = stockState(p, onOrderIds((d.inv.orders ?? []) as Data[]));
  const top = Math.max(1, ...all.map((x) => Number(x.stock)));
  const storage = d.inv.storage !== false;
  const used = (p.used_in ?? []) as Data[];
  const history = d.history, shownHistory = allHistory ? history : history.slice(0, 5);
  const main = locations.find((l) => l.is_primary) ?? locations[0];
  const startAt = multi && locations.some((l) => l.id === location) ? String(location) : undefined;

  const done = (text: string, orders = false) => { setOpen(""); setNote({ kind: "ok", text, orders }); void refresh(); };
  const fail = (e: unknown) => setNote({ kind: "bad", text: (e as Error).message || "Something went wrong." });

  const startEdit = () => { setDraft(draftOf(p)); setFormError(""); setOpen("edit"); };
  const save = async () => {
    const out = bodyOf(draft, false);
    if (!out.body) { setFormError(out.error ?? ""); return; }
    setBusy("save"); setFormError("");
    try {
      await s.mapi(`/products/${p.id}`, { method: "PUT", body: out.body });
      done("Product saved.");
    } catch (e) {
      setFormError((e as Error).message);
    }
    setBusy("");
  };

  const toggleOnline = async () => {
    const out = bodyOf({ ...draftOf(p), online: !p.active }, false);
    if (!out.body) return;
    setBusy("online"); setNote(null);
    try {
      await s.mapi(`/products/${p.id}`, { method: "PUT", body: out.body });
      setNote({ kind: "ok", text: p.active ? `${p.name} is no longer sold online. You can still sell it at checkout.` : `${p.name} is sold online now, in the shop and on your booking page.` });
      await refresh();
    } catch (e) {
      fail(e);
    }
    setBusy("");
  };

  const pickPhoto = async (from: "camera" | "library") => {
    setNote(null);
    try {
      if (from === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { setNote({ kind: "bad", text: "LogaLuxe is not allowed to use the camera. Allow it in your phone's settings, or choose a photo from your library." }); return; }
      }
      const picked = from === "camera" ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (picked.canceled || !picked.assets?.length) return;
      const a = picked.assets[0];
      if (Number(a.fileSize ?? a.file?.size ?? 0) > MAX_PHOTO) { setNote({ kind: "bad", text: "The photo is too large. The limit is 8 MB." }); return; }
      const name = a.fileName || `product-${Date.now()}.${(a.mimeType ?? "image/jpeg").split("/")[1] ?? "jpg"}`;
      const form = new FormData();
      form.append("alt", String(p.name));
      // A browser hands over the file itself; a phone hands over where the photo is kept.
      if (a.file) form.append("file", a.file, name);
      else form.append("file", { uri: a.uri, name, type: a.mimeType ?? "image/jpeg" } as unknown as Blob);
      setBusy("photo");
      await s.mapi(`/products/${p.id}/photo`, { form });
      setNote({ kind: "ok", text: "Photo saved." });
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message || "The photo could not be opened." });
    }
    setBusy("");
  };

  const removePhoto = async () => {
    if (!(await ask("Remove the photo?", `The photo of ${p.name} is removed here, in the shop and on your booking page.`, "Remove", true))) return;
    setBusy("photo"); setNote(null);
    try {
      await s.mapi(`/products/${p.id}/photo`, { method: "DELETE" });
      setNote({ kind: "ok", text: "Photo removed." });
      await refresh();
    } catch (e) {
      fail(e);
    }
    setBusy("");
  };

  const ingredients = String(d.details?.extras?.ingredients ?? "").trim(), how = String(d.details?.product?.how_to_use ?? "").trim();

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} footer={note ? (
      <View style={{ gap: 2 }}>
        <Said note={note} onClose={() => setNote(null)} />
        {note.orders ? <LinkText onPress={() => router.push("/m/purchase-orders" as never)}>Open purchase orders</LinkText> : null}
      </View>
    ) : undefined}>
      <Header title="Product" right={<SmallBtn kind="out" onPress={startEdit}>Edit</SmallBtn>} />

      <Photo uri={media(p.photo_id)} tone={p.tone} height={190} caption={p.photo_id ? `Photo of ${p.name}` : [CATEGORY[p.category] ?? p.category, p.sku].filter(Boolean).join(" · ")} style={{ borderRadius: 20, marginTop: 14 }} />
      {storage ? (
        <>
          <Row gap={8} wrap style={{ marginTop: 10 }}>
            <SmallBtn kind="out" icon="camera" busy={busy === "photo"} onPress={() => pickPhoto("library")}>{p.photo_id ? "Replace photo" : "Add photo"}</SmallBtn>
            {Platform.OS !== "web" ? <SmallBtn kind="out" disabled={busy === "photo"} onPress={() => pickPhoto("camera")}>Take a photo</SmallBtn> : null}
            {p.photo_id ? <SmallBtn kind="danger" disabled={busy === "photo"} onPress={removePhoto}>Remove</SmallBtn> : null}
          </Row>
          <Fine style={{ marginTop: 6 }}>JPEG, PNG or WebP, up to 8 MB. Shown here, in the shop and on the booking page.</Fine>
        </>
      ) : <Fine style={{ marginTop: 8 }}>Photo uploads are not set up on this server yet. Contact LogaLuxe support.</Fine>}

      <Row between gap={10} style={{ marginTop: 16, alignItems: "flex-start" }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: f.serifBold, fontSize: 24, lineHeight: 28, color: c.ink }}>{p.name}</Text>
        <View style={{ marginTop: 4 }}><Tag kind={st.kind}>{st.label}</Tag></View>
      </Row>
      <T muted size={14} style={{ marginTop: 2 }}>{[KIND[p.kind] ?? p.kind, CATEGORY[p.category] ?? p.category, p.sku].filter(Boolean).join(" · ")}</T>
      {p.description ? <T size={14} style={{ marginTop: 8 }}>{p.description}</T> : null}

      <Night style={{ marginTop: 14 }}>
        <Row between style={{ alignItems: "flex-end" }}>
          <View>
            <Text style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: mc.nightMuted }}>In stock</Text>
            <Text style={{ fontFamily: f.serif, fontSize: 44, lineHeight: 50, color: isOut(p) || isLow(p) ? c.gold : mc.onNight }}>{p.stock}</Text>
          </View>
          <View style={{ alignItems: "flex-end", paddingBottom: 6 }}>
            <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: mc.nightMuted }}>{Number(p.reorder_at) > 0 ? `Reorder at ${p.reorder_at}` : "No reorder level"}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: mc.nightMuted }}>{Number(p.par_level) > 0 ? `Full shelf ${p.par_level}` : "Full shelf not set"}</Text>
          </View>
        </Row>
        <Meter night value={meterOf(p, top)} low={isLow(p) || isOut(p)} style={{ marginTop: 10 }} />
        {Number(p.backbar_open) > 0 ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: mc.nightMuted, marginTop: 8 }}>{trim(Number(p.backbar_open))} of the open unit is used so far.</Text> : null}
        <Row gap={8} wrap style={{ marginTop: 14 }}>
          <SmallBtn kind="gold" onPress={() => setOpen("adjust")}>Adjust stock</SmallBtn>
          <SmallBtn kind="ghost" onPress={() => setOpen("reorder")}>Reorder</SmallBtn>
          {multi ? <SmallBtn kind="ghost" onPress={() => setOpen("move")}>Move</SmallBtn> : null}
        </Row>
      </Night>

      {multi ? (
        <>
          <Grp>Where it is</Grp>
          <Card>
            {locations.map((l) => <Kv key={l.id} k={`${l.name}${l.is_primary ? " (main)" : ""}`} v={String(shelf(p, String(l.id)))} strong />)}
            <Kv last k="In all" v={String(p.stock)} strong />
          </Card>
        </>
      ) : null}

      <Grp>Selling</Grp>
      <Card>
        {sells(p) ? <Line title="Sell online" sub="In the LogaLuxe shop and on your booking page." right={<Sw on={!!p.active} disabled={busy === "online"} label={`${p.name}: sell online`} onPress={toggleOnline} />} /> : <Kv k="Sold online" sub="A back-bar product has no price and is never sold online." v="No" />}
        {sells(p) ? <Kv k="Delivery" sub={!p.active ? "For orders from the shop, once it is sold online." : p.shipping ? "Charged once on an order." : undefined} v={reachOf(p, cur)} /> : null}
        <Kv k="Retail price" v={sells(p) ? money(p.price_cents, cur) : "Not sold"} strong />
        <Kv k="Cost" v={money(p.cost_cents, cur)} />
        <Kv k="Margin" v={marginOf(p)} />
        <Kv k="Sold last 30 days" v={String(p.sold_30d)} />
        <Kv k="Stock value at cost" v={money(Number(p.stock) * Number(p.cost_cents), cur)} />
        <Kv last k="Supplier" v={p.supplier ?? "None"} />
      </Card>

      <Grp right={sells(p) && d.details ? <LinkText onPress={() => setOpen("details")} style={{ minHeight: 17 }}>{ingredients || how ? "Change" : "Add"}</LinkText> : undefined}>Ingredients and directions</Grp>
      <Card style={{ padding: 16, gap: 10 }}>
        {!sells(p) ? <T muted size={14}>A back-bar product is not sold, so it has no page in the shop to show these on.</T>
          : !d.details ? <T muted size={14}>These could not be loaded just now. Pull down to try again.</T>
          : !ingredients && !how ? <T muted size={14}>Nothing added yet. Shoppers read these on the product&apos;s page in the shop{p.active ? "" : ", once it is sold online"}.</T>
          : (
            <>
              {ingredients ? <View><T size={12} weight="semi" muted>Ingredients</T><T size={14}>{ingredients}</T></View> : null}
              {how ? <View><T size={12} weight="semi" muted>How to use</T><T size={14}>{how}</T></View> : null}
            </>
          )}
      </Card>

      <Grp right={services.length ? <LinkText onPress={() => setOpen("uses")} style={{ minHeight: 17 }}>{used.length ? "Change" : "Set"}</LinkText> : undefined}>Used in services</Grp>
      <Card>
        {used.length ? used.map((u, i) => <Kv key={u.service_id} last={i === used.length - 1} k={String(u.name)} v={`${trim(Number(u.qty))} per service`} />)
          : <View style={{ padding: 16 }}><T muted size={14}>{services.length ? "No service uses this product. Set how much each one uses, and checkout takes it off the shelf as the service is paid for." : "There are no services on the menu yet. Add services first."}</T></View>}
      </Card>

      <Grp>Stock history</Grp>
      {d.historyError ? <Note kind="bad">{d.historyError}</Note> : history.length ? (
        <>
          <Card>
            {shownHistory.map((h, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: i === shownHistory.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                <Text style={{ width: 44, fontFamily: f.bold, fontSize: 15, lineHeight: 20, color: Number(h.delta) < 0 ? c.bad : c.ok }}>{Number(h.delta) > 0 ? `+${h.delta}` : `−${Math.abs(Number(h.delta))}`}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{REASON[h.reason] ?? h.reason}{multi ? ` · ${h.location ?? main?.name ?? ""}` : ""}</Text>
                  {h.note ? <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.ink }}>{h.note}</Text> : null}
                  <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{stamp(h.created_at, tz)} · {h.actor || "System"}</Text>
                </View>
              </View>
            ))}
          </Card>
          {history.length > shownHistory.length ? <LinkText onPress={() => setAllHistory(true)}>{`Show all ${plural(history.length, "change")}`}</LinkText> : <Fine style={{ marginTop: 8 }}>The last 40 changes are shown, newest first.</Fine>}
        </>
      ) : <Empty title="No stock changes yet">Deliveries, counts, corrections and back-bar use are listed here as they happen.</Empty>}

      <Sheet tall open={open === "edit"} onClose={() => setOpen("")} title="Edit product" footer={<View style={{ gap: 10 }}>{formError ? <Note kind="bad">{formError}</Note> : null}<Btn busy={busy === "save"} onPress={save}>Save</Btn></View>}>
        <ProductFields v={draft} set={set} suppliers={suppliers} cur={cur} isNew={false} inStock={Number(p.stock)} />
      </Sheet>
      <AdjustSheet open={open === "adjust"} onClose={() => setOpen("")} p={p} onDone={(m) => done(m)} locations={locations} startAt={startAt} />
      <MoveSheet open={open === "move"} onClose={() => setOpen("")} p={p} onDone={(m) => done(m)} locations={locations} startAt={startAt} />
      <ReorderSheet open={open === "reorder"} onClose={() => setOpen("")} p={p} onDone={(m) => done(m, true)} cur={cur} tz={tz} />
      <DetailsSheet open={open === "details"} onClose={() => setOpen("")} p={p} onDone={(m) => done(m)} details={d.details} />
      <UsesSheet open={open === "uses"} onClose={() => setOpen("")} p={p} onDone={(m) => done(m)} services={services} />
    </Screen>
  );
}
