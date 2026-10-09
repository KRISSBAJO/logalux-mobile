import { useFormReset } from "@/lib/form-reset";
// The portfolio: the photos on the business's public page. Add from the phone's library or camera,
// describe, reorder, choose the cover, delete. The first photo is the cover.
// The same calls as the Photos tab of the web's Storefront tool (/v1/m/storefront/photos).
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Image, Platform, Pressable, RefreshControl, Text, View, useWindowDimensions } from "react-native";
import { AskManager, Header, Sheet, Wait } from "@/components/mc-kit";
import { BigChoice, MdIcon, PhotoSource, Shot, ShotTag, said, useSaid } from "@/components/md-kit";
import { Btn, Card, Failed, Field, Icon, Note, Row, Screen, T } from "@/components/ui";
import { media, type Row as Data } from "@/lib/api";
import { dayShort, plural } from "@/lib/format";
import { DENIED, ask, fileSize, orDenied, signedIn } from "@/lib/mc-util";
import { MAX_PHOTOS_HELD, TONE_RE } from "@/lib/md-profile";
import { photoForm, refusal, type Picked } from "@/lib/md-upload";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const GAP = 10;

export default function ProfilePhotos() {
  const s = useSession();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const { width } = useWindowDimensions();
  const { data, error, refreshing, refresh, reload, setData } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/storefront"))), [s.businessToken]);
  const [note, setNote] = useSaid();
  const [source, setSource] = useState(false);
  const [queue, setQueue] = useState<Picked[]>([]);
  const [alt, setAlt] = useState("");
  const [sending, setSending] = useState(0); // which of the queue is being sent, counted from one
  const [queueError, setQueueError] = useState("");
  const [edit, setEdit] = useState<{ id: string; alt: string } | null>(null);
  const [editError, setEditError] = useState("");
  const [busy, setBusy] = useState("");

  // What the "add" sheet shows. It keeps the last choice while it slides away, so its words do not change on the way out.
  const [held, setHeld] = useState<Picked[]>([]);
  if (queue.length && held !== queue) setHeld(queue);
  const q = queue.length ? queue : held;

  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (seen.current) void refresh();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));

  const loaded = !!data && data !== DENIED;
  const storage = loaded && !!data.storage;
  const count = loaded ? ((data.photos ?? []) as Data[]).length : 0;

  // Arriving from "Add a photo" opens the chooser straight away, once.
  useFormReset([add, loaded, storage, count], () => { if (add && loaded && storage && count < MAX_PHOTOS_HELD) setSource(true); });
  const asked = useRef(false);
  useEffect(() => {
    if (add && loaded && !asked.current) {
      asked.current = true;
      router.setParams({ add: undefined }); // once only: coming back to this screen must not ask again

    }
  }, [add, loaded, storage, count]);

  if (!loaded) {
    return (
      <Screen>
        <Header title="Photos" />
        {data === DENIED ? <AskManager what="The photos on your public page are looked after by a manager or the owner." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const photos = (data.photos ?? []) as Data[];
  const maxShown = Number(data.max_photos ?? 8);
  const tone = TONE_RE.test(String(data.business?.tone ?? "")) ? String(data.business.tone) : c.photo;
  const tz = s.merchant?.timezone as string | undefined;
  const room = MAX_PHOTOS_HELD - photos.length;
  const tile = Math.floor((Math.min(width, 520) - pad * 2 - GAP) / 2);
  const setPhotos = (next: Data[]) => setData((x) => (x && x !== DENIED ? { ...x, photos: next } : x));
  const current = edit ? photos.find((p) => String(p.id) === edit.id) : undefined;
  const at = current ? photos.indexOf(current) : -1;

  /** Saves a new order. The screen shows it at once and goes back to the saved one if the save fails. */
  const reorder = async (next: Data[], okText: string) => {
    const before = photos;
    setPhotos(next); setBusy("order"); setNote(null);
    try {
      await s.mapi("/storefront/photos", { method: "PUT", body: { ids: next.map((p) => String(p.id)) } });
      setNote({ kind: "ok", text: okText });
    } catch (e) {
      setPhotos(before);
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    void reorder(next, j === 0 || i === 0 ? "Order saved. The first photo is your cover." : "Order saved.");
  };
  const makeCover = async (id: string) => {
    const p = photos.find((x) => String(x.id) === id);
    if (!p) return;
    setBusy("cover"); setEditError("");
    try {
      await s.mapi(`/storefront/photos/${id}`, { method: "PUT", body: { cover: true } });
      setPhotos([p, ...photos.filter((x) => x !== p)]);
      setNote({ kind: "ok", text: "This photo is now the cover." });
      setEdit(null);
    } catch (e) {
      setEditError((e as Error).message);
    }
    setBusy("");
  };
  const saveAlt = async () => {
    if (!edit) return;
    const text = edit.alt.trim();
    if (text.length > 200) { setEditError("Keep the description under 200 characters."); return; }
    setBusy("alt"); setEditError("");
    try {
      await s.mapi(`/storefront/photos/${edit.id}`, { method: "PUT", body: { alt: text } });
      setPhotos(photos.map((p) => (String(p.id) === edit.id ? { ...p, alt: text } : p)));
      setNote({ kind: "ok", text: "Description saved." });
      setEdit(null);
    } catch (e) {
      setEditError((e as Error).message);
    }
    setBusy("");
  };
  const remove = async (id: string) => {
    if (!(await ask("Delete this photo?", "It is removed from your page for good.", "Delete", true))) return;
    setBusy("delete"); setEditError("");
    try {
      await s.mapi(`/storefront/photos/${id}`, { method: "DELETE" });
      setPhotos(photos.filter((p) => String(p.id) !== id));
      setNote({ kind: "ok", text: "Photo deleted." });
      setEdit(null);
    } catch (e) {
      setEditError((e as Error).message);
    }
    setBusy("");
  };

  // On an iPhone a sheet cannot rise while another is still sliding away, so the next one waits for it.
  const picked = (list: Picked[]) => {
    setSource(false); setQueueError(""); setAlt("");
    setTimeout(() => setQueue(list.slice(0, Math.max(1, room))), Platform.OS === "ios" ? 400 : 0);
  };
  /** Sends the chosen photos one after another, so one that is refused does not stop the rest. */
  const send = async () => {
    const text = alt.trim();
    if (text.length > 200) { setQueueError("Keep the description under 200 characters."); return; }
    setQueueError(""); setNote(null);
    let added = 0;
    const failed: string[] = [];
    for (let i = 0; i < queue.length; i++) {
      setSending(i + 1);
      const no = refusal(queue[i]);
      if (no) { failed.push(no); continue; }
      try {
        await s.mapi("/storefront/photos", { form: await photoForm(queue[i], { alt: queue.length === 1 ? text : "" }) });
        added++;
      } catch (e) {
        failed.push((e as Error).message);
      }
    }
    setSending(0);
    if (added) await refresh();
    const why = [...new Set(failed)].join(" ");
    if (!added) { setQueueError(queue.length === 1 ? why : `None of the photos could be added. ${why}`); return; }
    setQueue([]);
    setNote(failed.length ? { kind: "gold", text: `${plural(added, "photo")} added. ${failed.length} could not be added: ${why}` } : { kind: "ok", text: added === 1 ? "Photo added." : `${added} photos added.` });
  };

  const tagFor = (p: Data, i: number) => (!p.active ? <ShotTag kind="grey">Hidden by LogaLuxe</ShotTag> : i === 0 ? <ShotTag>Cover</ShotTag> : i >= maxShown ? <ShotTag kind="grey">Not shown</ShotTag> : undefined);
  const arrow = (dir: "back" | "next", label: string, off: boolean, go: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off }} disabled={off || busy === "order"} onPress={go}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: off ? 0.25 : pressed ? 0.5 : 1 })}>
      <Icon name={dir} size={18} />
    </Pressable>
  );

  const head = (
    <View style={{ marginBottom: 6 }}>
      <Header title="Photos" />
      {!storage ? <View style={{ marginTop: 14 }}><Note kind="gold">Photo uploads are not set up yet. File storage has not been connected for LogaLuxe on this server, so photos cannot be added for now. Your page shows your page colour in their place. Contact LogaLuxe support if this does not change.</Note></View> : null}
      {photos.length ? (
        <>
          <Shot uri={media(String(photos[0].id))} tone={tone} label={String(photos[0].alt ?? "")} dim={!photos[0].active} radius={20} style={{ height: 190, marginTop: 14 }} tag={<ShotTag>Cover</ShotTag>} />
          {!photos[0].active ? <View style={{ marginTop: 10 }}><Note kind="gold">This photo has been hidden by LogaLuxe, so it does not show on your page. Choose another cover.</Note></View> : null}
          <T size={13} muted style={{ marginTop: 10 }}>The cover is the first thing clients see. Use your best finished work, landscape, with no text on it.</T>
          <Row between style={{ marginTop: 18, marginBottom: 4 }}>
            <Text accessibilityRole="header" style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.96, textTransform: "uppercase", color: c.muted }}>{`Portfolio · ${plural(photos.length, "photo")}`}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 12, color: c.muted }}>{`The first ${maxShown} show on your page`}</Text>
          </Row>
        </>
      ) : (
        <Card style={{ padding: 22, gap: 10, marginTop: 14 }}>
          <View style={{ height: 120, borderRadius: 14, backgroundColor: tone, justifyContent: "flex-end", padding: 12 }}>
            <Text style={{ fontFamily: f.medium, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>No cover yet. Your page shows this colour.</Text>
          </View>
          <T weight="semi" size={16}>No photos yet</T>
          <T muted>Add photos of finished work so clients can see what you do. The first one becomes your cover.</T>
        </Card>
      )}
    </View>
  );

  const foot = (
    <View style={{ gap: 10 }}>
      {said(note)}
      {!storage ? null : room <= 0 ? <Note kind="gold">You have 40 photos, which is the most a page can hold. Delete one to add another.</Note>
        : <Btn icon="camera" onPress={() => { setNote(null); setSource(true); }}>{photos.length ? "Add photos" : "Add your first photo"}</Btn>}
    </View>
  );

  return (
    <Screen scroll={false} padded={false} footer={storage || note ? foot : undefined} style={{ paddingBottom: 0 }}>
      <FlatList
        data={photos}
        keyExtractor={(p) => String(p.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 24, gap: GAP }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={head}
        renderItem={({ item: p, index: i }) => (
          <View style={{ width: tile, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, overflow: "hidden" }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${i === 0 ? "Cover photo" : `Photo ${i + 1}`}${p.alt ? `: ${p.alt}` : ", no description"}. Edit`} onPress={() => { setEditError(""); setNote(null); setEdit({ id: String(p.id), alt: String(p.alt ?? "") }); }}>
              <Shot uri={media(String(p.id))} tone={tone} label={String(p.alt ?? "")} dim={!p.active} radius={0} style={{ width: "100%", height: tile - 2 }} tag={tagFor(p, i)} />
            </Pressable>
            <Row gap={0} between style={{ paddingHorizontal: 2 }}>
              <Row gap={0}>
                {arrow("back", `Move photo ${i + 1} earlier`, i === 0, () => move(i, -1))}
                {arrow("next", `Move photo ${i + 1} later`, i === photos.length - 1, () => move(i, 1))}
              </Row>
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit photo ${i + 1}`} onPress={() => { setEditError(""); setNote(null); setEdit({ id: String(p.id), alt: String(p.alt ?? "") }); }} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.6 : 1 })}>
                <MdIcon name="pencil" size={14} color={c.wine} />
                <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>{p.alt ? "Edit" : "Describe"}</Text>
              </Pressable>
            </Row>
          </View>
        )}
      />

      <PhotoSource open={source} onClose={() => setSource(false)} title="Add photos" sub="Finished work shows best. You can describe and reorder them afterwards." many={Math.max(1, Math.min(10, room))} onPicked={picked} />

      {/* What was chosen, before it is sent */}
      <Sheet open={queue.length > 0} onClose={() => { if (!sending) setQueue([]); }} title={q.length === 1 ? "Add this photo" : `Add ${q.length} photos`} sub={q.length === 1 ? undefined : "They are added to the end of your portfolio. Describe each one afterwards."}
        footer={<Btn busy={sending > 0} onPress={send}>{sending > 0 ? `Sending ${sending} of ${q.length}` : q.length === 1 ? "Add photo" : `Add ${q.length} photos`}</Btn>}>
        {queueError ? <Note kind="bad">{queueError}</Note> : null}
        {q.length === 1 ? (
          <>
            <Image source={{ uri: q[0]?.uri }} accessibilityLabel="The photo you chose" resizeMode="cover" style={{ width: "100%", height: 240, borderRadius: 16, backgroundColor: tone }} />
            <Field label="Describe it, for people using screen readers" value={alt} onChangeText={setAlt} maxLength={200} placeholder="Medium knotless braids, back view" hint="Optional. You can add it later." />
          </>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {q.map((p, i) => (
              <View key={p.uri + i} style={{ width: 100, height: 100, borderRadius: 14, overflow: "hidden", backgroundColor: tone }}>
                <Image source={{ uri: p.uri }} accessibilityLabel={`Chosen photo ${i + 1}`} resizeMode="cover" style={{ width: 100, height: 100, opacity: sending > i + 1 ? 0.4 : 1 }} />
                {sending === 0 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Leave out photo ${i + 1}`} onPress={() => setQueue(queue.filter((_, j) => j !== i))} hitSlop={8} style={{ position: "absolute", top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(26,21,19,.78)", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="close" size={14} color="#F4ECE3" />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </Sheet>

      {/* One photo */}
      <Sheet open={!!edit && !!current} onClose={() => setEdit(null)} title={at === 0 ? "Cover photo" : `Photo ${at + 1}`} sub="The description is read out to people who use a screen reader." tall
        footer={<Btn busy={busy === "alt"} onPress={saveAlt}>Save description</Btn>}>
        {edit && current ? (
          <>
            {editError ? <Note kind="bad">{editError}</Note> : null}
            <Shot uri={media(edit.id)} tone={tone} label={String(current.alt ?? "")} dim={!current.active} radius={16} style={{ height: 240 }} tag={tagFor(current, at)} />
            {!current.active ? <Note kind="gold">This photo has been hidden by LogaLuxe, so it does not show on your page.</Note> : at >= maxShown ? <Note kind="gold">{`Only the first ${maxShown} photos show on your page. Move this one earlier to show it.`}</Note> : null}
            <Field label="Description" value={edit.alt} onChangeText={(v) => setEdit({ ...edit, alt: v })} maxLength={200} placeholder="Waist-length knotless braids, side view" onSubmitEditing={saveAlt} returnKeyType="done" />
            {at > 0 ? <BigChoice icon={<Icon name="star" size={20} />} title="Make this the cover" sub="Moves it to the front of your portfolio" busy={busy === "cover"} onPress={() => makeCover(edit.id)} /> : null}
            <BigChoice danger icon={<MdIcon name="trash" size={20} color={c.bad} />} title="Delete this photo" sub="Removes it from your page for good" busy={busy === "delete"} onPress={() => remove(edit.id)} />
            <T size={12} muted>{`Added ${dayShort(String(current.created_at), tz)} · ${fileSize(Number(current.size_bytes))}`}</T>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
