// Profile & portfolio: what clients see on the business's public page, and how to change it.
// The same job as the web's Storefront tool (GET and PUT /v1/m/storefront), cut into short sections
// for a phone. Each section saves on its own and goes live at once: there is no draft.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Image, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { AskManager, Grp, Header, Item, McIcon, SetRow, Sheet, SmallBtn, Sw, Tag, Val, Wait, WebLink, mc } from "@/components/mc-kit";
import { Bar, BigChoice, MdIcon, PhotoSource, Shot, ShotTag, Tick, said, useSaid } from "@/components/md-kit";
import { Btn, Card, Failed, Field, Icon, Label, Note, Row, Screen, T } from "@/components/ui";
import { media, type Row as Data } from "@/lib/api";
import { firstName, plural } from "@/lib/format";
import { DENIED, ask, bookingLink, isLocalAddress, orDenied, signedIn, soft, type Hours } from "@/lib/mc-util";
import { CATEGORIES, HIGHLIGHT_IDEAS, SLUG_RE, TONES, TONE_RE, categoryName, checks, hoursLine, openNow, pageBody, statusWords, type Display } from "@/lib/md-profile";
import { photoForm, refusal, type Picked } from "@/lib/md-upload";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type SheetName = "" | "name" | "handle" | "tagline" | "about" | "category" | "highlights" | "languages" | "logo" | "tone" | "social" | "notice" | "arrival";
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export default function Profile() {
  const s = useSession();
  const m = s.merchant;
  const { data, error, refreshing, refresh, reload, setData } = useLoad(signedIn(s, () => orDenied(async () => {
    const page = await s.mapi<Data>("/storefront");
    const [menu, policy] = await Promise.all([soft(() => s.mapi<Data>("/services")), soft(() => s.mapi<Data>("/shop-policy"))]);
    return { page, menu: menu.data, policy: policy.data, policyError: policy.error };
  })), [s.businessToken]);

  // Photos and reviews are changed on their own screens: read them again on the way back.
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (seen.current) void refresh();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));

  const [note, setNote] = useSaid();
  const [sheet, setSheet] = useState<SheetName>("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [sheetError, setSheetError] = useState("");
  const [logoFrom, setLogoFrom] = useState(false);
  const [place, setPlace] = useState<Data | null>(null);
  const [allChecks, setAllChecks] = useState(false);

  if (!data || data === DENIED || !m) {
    return (
      <Screen>
        <Header title="Profile & portfolio" />
        {data === DENIED ? <AskManager what="Your public page, its photos and its reviews are looked after by a manager or the owner." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const d = data.page;
  const b = d.business as Data, disp = (d.display ?? {}) as Display, loc = (d.location ?? null) as Data | null;
  const photos = (d.photos ?? []) as Data[], reviews = (d.reviews ?? []) as Data[];
  const storage = !!d.storage;
  const highlights = (b.highlights ?? []) as string[];
  const tone = TONE_RE.test(String(b.tone ?? "")) ? String(b.tone) : c.photo;
  const logoId = b.logo_id ? String(b.logo_id) : "";
  const link = bookingLink(String(b.slug ?? m.slug));
  const st = statusWords(b.status);
  const unreplied = reviews.filter((r) => r.status === "published" && !r.reply).length;
  const open = openNow(loc?.hours as Hours | undefined, m.timezone);
  const menuList = data.menu ? ((data.menu.services ?? []) as Data[]).filter((x) => x.online && !x.archived) : null;
  const team = data.menu ? ((data.menu.staff ?? []) as Data[]).filter((p) => p.bookable) : [];
  const pol = data.policy;
  const spoken = ((pol?.languages ?? []) as string[]);
  const langChoices = [...new Set([...((pol?.language_choices ?? []) as string[]), ...spoken])];
  const list = checks(d, menuList ? menuList.length : null);
  const done = list.filter((x) => x.ok).length;
  const owner = m.role === "owner";

  const patch = (business: Data, display?: Partial<Display>) => setData((x) => (x && x !== DENIED ? { ...x, page: { ...x.page, business: { ...x.page.business, ...business }, display: { ...x.page.display, ...(display ?? {}) } } } : x));

  /** Saves the page with one change laid over what is saved. Answers "" or the sentence that says what is wrong. */
  const save = async (tag: string, change: Record<string, unknown>, display?: Partial<Display>): Promise<string> => {
    setBusy(tag);
    try {
      const out = await s.mapi<Data>("/storefront", { method: "PUT", body: pageBody(b, change, display) });
      patch({ ...change, slug: out.slug ?? b.slug }, display);
      setBusy("");
      return "";
    } catch (e) {
      setBusy("");
      return (e as Error).message;
    }
  };

  const openSheet = (name: SheetName, start: Record<string, string> = {}, chosen: string[] = []) => { setSheetError(""); setDraft(start); setPicks(chosen); setNote(null); setSheet(name); };
  const set = (k: string) => (v: string) => setDraft((x) => ({ ...x, [k]: v }));
  const close = () => setSheet("");

  /** A sheet's Save: checks what the phone can check, saves, says so, closes. */
  const saveSheet = async (change: Record<string, unknown>, okText: string, problem = "", display?: Partial<Display>) => {
    if (problem) { setSheetError(problem); return; }
    setSheetError("");
    const bad = await save("sheet", change, display);
    if (bad) setSheetError(bad);
    else { setNote({ kind: "ok", text: okText }); close(); }
  };

  const saveHandle = async () => {
    const slug = (draft.slug ?? "").trim().toLowerCase(), was = String(b.slug);
    if (!SLUG_RE.test(slug)) { setSheetError("The handle can use lower-case letters, numbers and dashes, and must be at least two characters."); return; }
    if (slug === was) { close(); return; }
    if (!(await ask("Move your page?", `Links, QR codes and social bios that use /b/${was} stop working as soon as you save.`, "Move it", true))) return;
    setSheetError("");
    const bad = await save("sheet", { slug });
    if (bad) { setSheetError(bad); return; }
    await s.refresh(); // the signed-in person carries the handle too
    void refresh(); // pictures are filed under the handle: show what the page has now
    setNote({ kind: "gold", text: `Saved. Your page has moved to /b/${slug}. Links to /b/${was} no longer work, so update them wherever you shared them.` });
    close();
  };

  const toggle = async (key: keyof Display, on: string, off: string) => {
    const next = !disp[key];
    setNote(null);
    const bad = await save(key, {}, { [key]: next });
    setNote(bad ? { kind: "bad", text: bad } : { kind: "ok", text: next ? on : off });
  };

  const saveLanguages = async () => {
    if (!pol) return;
    setBusy("sheet"); setSheetError("");
    try {
      // The languages are kept with the shop policy, which the API replaces whole: the rest goes back as it came.
      await s.mapi("/shop-policy", { method: "PUT", body: { languages: picks, returns_days: pol.returns_days ?? null, returns_note: pol.returns_note ?? "", ship_days_min: pol.ship_days_min ?? null, ship_days_max: pol.ship_days_max ?? null, pickup_ready_mins: pol.pickup_ready_mins ?? null } });
      setData((x) => (x && x !== DENIED && x.policy ? { ...x, policy: { ...x.policy, languages: langChoices.filter((l) => picks.includes(l)) } } : x));
      setNote({ kind: "ok", text: picks.length ? "Saved. Your page now lists the languages you speak." : "Saved. Your page no longer lists any languages." });
      close();
    } catch (e) {
      setSheetError((e as Error).message);
    }
    setBusy("");
  };

  const uploadLogo = async (p: Picked) => {
    setLogoFrom(false);
    const no = refusal(p, "image");
    if (no) { setSheetError(no); return; }
    setBusy("logo"); setSheetError("");
    try {
      const out = await s.mapi<Data>("/storefront/logo", { form: await photoForm(p) });
      patch({ logo_id: out.id });
      setNote({ kind: "ok", text: "Logo saved. It shows on your page now." });
      close();
    } catch (e) {
      setSheetError((e as Error).message);
    }
    setBusy("");
  };
  const removeLogo = async () => {
    if (!(await ask("Remove your logo?", "Your page will show your first letter instead.", "Remove", true))) return;
    setBusy("logo-off"); setSheetError("");
    try {
      await s.mapi("/storefront/logo", { method: "DELETE" });
      patch({ logo_id: null });
      setNote({ kind: "ok", text: "Logo removed. Your page shows your first letter instead." });
      close();
    } catch (e) {
      setSheetError((e as Error).message);
    }
    setBusy("");
  };

  /** The arrival notes belong to the main location, which is saved whole: it is read first and sent back with the one change. */
  const openArrival = async () => {
    openSheet("arrival", { notes: String(loc?.arrival_notes ?? "") });
    setPlace(null);
    try {
      const out = await s.mapi<Data>("/settings");
      const all = (out.locations ?? []) as Data[];
      const main = all.find((l) => l.is_primary) ?? all[0];
      if (main) { setPlace(main); setDraft({ notes: String(main.arrival_notes ?? "") }); } else setSheetError("This business has no location yet. Add one on the web first.");
    } catch (e) {
      setSheetError((e as Error).message);
    }
  };
  const saveArrival = async () => {
    if (!place) return;
    const notes = (draft.notes ?? "").trim();
    const hours: Record<string, string[]> = {};
    for (const [k, v] of Object.entries((place.hours ?? {}) as Record<string, unknown>)) if (Array.isArray(v) && v.length === 2) hours[k] = [String(v[0]), String(v[1])];
    setBusy("sheet"); setSheetError("");
    try {
      await s.mapi(`/locations/${place.id}`, { method: "PUT", body: { name: place.name, address: place.address ?? "", city: place.city ?? "", region: place.region ?? "", arrival_notes: notes, hours } });
      setData((x) => (x && x !== DENIED && x.page.location ? { ...x, page: { ...x.page, location: { ...x.page.location, arrival_notes: notes } } } : x));
      setNote({ kind: "ok", text: notes ? "Arrival notes saved." : "Arrival notes cleared." });
      close();
    } catch (e) {
      setSheetError((e as Error).message);
    }
    setBusy("");
  };

  const setListing = async (paused: boolean) => {
    if (paused && !(await ask("Pause online booking?", "Clients will not be able to find or book you until you bring it back. Your data and existing bookings are kept.", "Pause"))) return;
    setBusy("listing"); setNote(null);
    try {
      const out = await s.mapi<Data>("/listing", { body: { paused } });
      patch({ status: out.status });
      await s.refresh();
      setNote({ kind: "ok", text: paused ? "Online booking is paused. Your data and existing bookings are kept." : "You are live again. Clients can find and book you." });
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  const fix = (go: NonNullable<(typeof list)[number]["go"]>) => {
    if (go === "photos") router.push("/m/profile-photos" as never);
    else if (go === "reviews") router.push("/m/reviews" as never);
    else if (go === "services") router.push("/m/services" as never);
    else if (go === "hours") router.push("/m/hours" as never);
    else if (go === "highlights") openSheet("highlights", { more: "" }, highlights);
    else if (go === "social") openSheet("social", { instagram: String(b.instagram ?? ""), tiktok: String(b.tiktok ?? ""), website: String(b.website ?? "") });
    else openSheet(b.tagline ? "about" : "tagline", b.tagline ? { about: String(b.about ?? "") } : { tagline: "" });
  };

  const hl = [...highlights, ...HIGHLIGHT_IDEAS.filter((h) => !highlights.some((x) => same(x, h))), ...picks.filter((p) => !highlights.some((x) => same(x, p)) && !HIGHLIGHT_IDEAS.some((x) => same(x, p)))];
  const addOwn = () => {
    const more = (draft.more ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    const next = [...picks];
    for (const h of more) if (!next.some((x) => same(x, h))) next.push(h);
    if (next.length > 6) { setSheetError("Pick up to six highlights."); return; }
    setSheetError(""); setPicks(next); setDraft((x) => ({ ...x, more: "" }));
  };
  const footer = (label: string, onPress: () => void, off = false) => <Btn busy={busy === "sheet"} disabled={off} onPress={onPress}>{label}</Btn>;
  const address = loc ? [loc.address, loc.city, loc.region].filter(Boolean).join(", ") : "";
  const shownChecks = allChecks ? list : list.filter((x) => !x.ok);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} footer={said(note)}>
      <Header title="Profile & portfolio" />

      {/* The page at a glance */}
      <View style={{ backgroundColor: mc.night, borderRadius: 22, padding: 18, marginTop: 14 }}>
        <Row gap={14} style={{ alignItems: "flex-start" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={logoId ? "Change your logo" : "Add a logo"} onPress={() => openSheet("logo")} style={({ pressed }) => ({ width: 60, height: 60, borderRadius: 16, backgroundColor: c.gold, alignItems: "center", justifyContent: "center", overflow: "hidden", opacity: pressed ? 0.85 : 1 })}>
            {logoId ? <Image source={{ uri: media(logoId) }} accessibilityIgnoresInvertColors style={{ width: 60, height: 60 }} /> : <Text style={{ fontFamily: f.serifBold, fontSize: 26, color: c.ink }}>{String(b.name ?? "").trim().charAt(0).toUpperCase()}</Text>}
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 22, lineHeight: 26, color: mc.onNight }}>{b.name}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: mc.nightMuted, marginTop: 2 }}>{b.tagline || "No tagline yet. One line under your name tells clients what you do."}</Text>
            <Row gap={6} wrap style={{ marginTop: 8 }}>
              <Tag kind={st.kind === "grey" ? "night" : st.kind}>{st.tag}</Tag>
              {b.verification_status === "verified" ? <Tag kind="ok">Verified</Tag> : null}
              {Number(b.review_count) > 0 ? <Tag kind="gold">{Number(b.rating).toFixed(1)} · {plural(Number(b.review_count), "review")}</Tag> : null}
              {disp.open_badge && open !== null ? <Tag kind="night">{open ? "Open now" : "Closed now"}</Tag> : null}
            </Row>
          </View>
        </Row>
        <Row gap={8} style={{ marginTop: 14 }}>
          <SmallBtn kind="gold" style={{ flex: 1 }} onPress={() => Linking.openURL(link).catch(() => setNote({ kind: "bad", text: "Your page could not be opened from here." }))}>See your page</SmallBtn>
          <SmallBtn kind="ghost" style={{ flex: 1 }} onPress={() => router.push("/m/qr" as never)}>QR code and link</SmallBtn>
        </Row>
        <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: mc.nightMuted, marginTop: 10 }}>
          {isLocalAddress(link) ? "Your page is at a local address for now, which only this computer can open." : "Every change here shows on your page as soon as it is saved. There is no draft."}
        </Text>
      </View>

      {/* Photos */}
      <Grp right={<Pressable accessibilityRole="button" onPress={() => router.push("/m/profile-photos" as never)} hitSlop={12}><Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>{photos.length ? "Manage" : "Add photos"}</Text></Pressable>}>
        {`Photos${photos.length ? ` · ${photos.length}` : ""}`}
      </Grp>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
          {photos.slice(0, 8).map((p, i) => (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${i === 0 ? "Cover photo" : `Photo ${i + 1}`}${p.alt ? `: ${p.alt}` : ""}. Manage photos`} onPress={() => router.push("/m/profile-photos" as never)}>
              <Shot uri={media(String(p.id))} tone={tone} label={String(p.alt ?? "")} dim={!p.active} style={{ width: i === 0 ? 150 : 104, height: 104 }} tag={!p.active ? <ShotTag kind="grey">Hidden</ShotTag> : i === 0 ? <ShotTag>Cover</ShotTag> : undefined} />
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" onPress={() => router.push("/m/profile-photos?add=1" as never)} style={({ pressed }) => ({ width: 104, height: 104, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: c.muted2, alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.7 : 1 })}>
            <Icon name="plus" size={20} color={c.wine} />
            <Text style={{ fontFamily: f.semi, fontSize: 12, color: c.wine }}>Add</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <Card style={{ padding: 18, gap: 10, alignItems: "flex-start" }}>
          <T weight="semi" size={15}>No photos yet</T>
          <T muted size={13}>Add photos of finished work so clients can see what you do. The first one is your cover. Until then your page shows your page colour.</T>
          <SmallBtn kind="ink" icon="camera" onPress={() => router.push("/m/profile-photos?add=1" as never)}>Add a photo</SmallBtn>
        </Card>
      )}

      {/* Reviews */}
      <Grp>Reviews</Grp>
      <Card>
        <Item last icon={<Icon name="star" size={18} />} title={Number(b.review_count) > 0 ? `${Number(b.rating).toFixed(1)} from ${plural(Number(b.review_count), "review")}` : "No published reviews yet"}
          sub={unreplied ? `${plural(unreplied, "review")} without a reply` : reviews.length ? "Every published review has a reply" : "Clients can review a visit once it is finished"}
          right={unreplied ? <Row gap={6}><Tag kind="wine">{`${unreplied} to answer`}</Tag><Icon name="next" size={18} color={c.muted2} /></Row> : undefined}
          onPress={() => router.push("/m/reviews" as never)} />
      </Card>

      {/* The words */}
      <Grp>What clients read</Grp>
      <Card>
        <SetRow title="Business name" sub={String(b.name ?? "")} right={<Val>Change</Val>} onPress={() => openSheet("name", { name: String(b.name ?? "") })} />
        <SetRow title="Tagline" sub={b.tagline || "One line under your name"} right={<Val>{b.tagline ? "Change" : "Add"}</Val>} onPress={() => openSheet("tagline", { tagline: String(b.tagline ?? "") })} />
        <SetRow title="About" sub={b.about ? (String(b.about).length > 90 ? String(b.about).slice(0, 90).trimEnd() + "…" : String(b.about)) : "Who you are and what you are known for"} right={<Val>{b.about ? "Change" : "Add"}</Val>} onPress={() => openSheet("about", { about: String(b.about ?? "") })} />
        <SetRow title="Category" sub="Shown in search" right={<Val>{categoryName(b.category) || "Choose"}</Val>} onPress={() => openSheet("category")} />
        <SetRow title="Highlights" sub={highlights.length ? highlights.join(", ") : "Small facts clients scan before they book"} right={<Val>{highlights.length ? `${highlights.length} of 6` : "Pick"}</Val>} onPress={() => openSheet("highlights", { more: "" }, highlights)} />
        {pol ? <SetRow title="Languages you speak" sub={spoken.length ? spoken.join(", ") : "None listed on your page"} right={<Val>{spoken.length ? "Change" : "Add"}</Val>} onPress={() => openSheet("languages", {}, spoken)} />
          : data.policyError ? <SetRow title="Languages you speak" sub={`The languages could not be loaded: ${data.policyError}`} /> : null}
        <SetRow last title="Handle" sub={link.replace(/^https?:\/\//, "")} right={<Val>Change</Val>} onPress={() => openSheet("handle", { slug: String(b.slug ?? "") })} />
      </Card>

      <Grp>Logo and colour</Grp>
      <Card>
        <SetRow title="Logo" sub={logoId ? "The small square beside your name" : "Without one, your page shows your first letter"} right={<Val>{logoId ? "Change" : "Add"}</Val>} onPress={() => openSheet("logo")} />
        <SetRow last title="Page colour" sub="Shown where a photo is missing or still loading" right={<View accessibilityLabel={`Colour ${tone}`} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tone, borderWidth: 1, borderColor: c.line2 }} />} onPress={() => openSheet("tone", { tone })} />
      </Card>

      {/* Contact */}
      <Grp>Contact and social</Grp>
      <Card>
        <SetRow title="Instagram, TikTok and website" sub={[b.instagram, b.tiktok, b.website].filter(Boolean).join(" · ") || "None added yet"} right={<Val>{b.instagram || b.tiktok || b.website ? "Change" : "Add"}</Val>}
          onPress={() => openSheet("social", { instagram: String(b.instagram ?? ""), tiktok: String(b.tiktok ?? ""), website: String(b.website ?? "") })} />
        <SetRow last title="Show phone number" sub={b.phone ? `${b.phone} · ${disp.show_phone ? "always shown" : "hidden until booked"}` : "You have not added a business phone"}
          right={<Sw on={!!disp.show_phone} disabled={busy === "show_phone"} label="Show phone number" onPress={() => toggle("show_phone", "Your phone number now shows on your page.", "Your phone number is hidden until a client has booked.")} />} />
      </Card>
      <WebLink to="/m/settings/business">Change the business phone</WebLink>

      {/* What the booking page shows */}
      <Grp style={{ marginTop: 8 }}>On your booking page</Grp>
      <Card>
        <SetRow title="Your menu" sub={menuList ? (menuList.length ? menuList.slice(0, 3).map((x) => String(x.name)).join(", ") + (menuList.length > 3 ? ` and ${menuList.length - 3} more` : "") : "Nothing can be booked online yet") : "Prices, durations and the order of the menu"} right={<Icon name="next" size={18} color={c.muted2} />} onPress={() => router.push("/m/services" as never)} />
        <SetRow title={"Show \"from\" prices"} sub={"The lowest price across your team, with \"from\" in front"} right={<Sw on={!!disp.show_from} disabled={busy === "show_from"} label="Show from prices" onPress={() => toggle("show_from", "Your page now shows \"from\" prices.", "Your page shows each service's own price.")} />} />
        <SetRow title="Show durations" sub="Clients plan their day around them" right={<Sw on={!!disp.show_durations} disabled={busy === "show_durations"} label="Show durations" onPress={() => toggle("show_durations", "Durations now show on your page.", "Durations are hidden on your page.")} />} />
        <SetRow last title="Show staff and let clients choose" sub={team.length ? team.slice(0, 5).map((p) => firstName(String(p.name))).join(", ") : "Nobody on the team takes bookings yet"} right={<Sw on={!!disp.show_staff} disabled={busy === "show_staff"} label="Show staff" onPress={() => toggle("show_staff", "Clients can now choose who they see.", "Your team is hidden on your page.")} />} />
      </Card>

      {/* Hours and location */}
      <Grp>Hours and location</Grp>
      <Card>
        <SetRow title={hoursLine(loc?.hours as Hours | undefined) || "No opening hours set"} sub={loc?.name ? `${loc.name} · change in Hours & policies` : "No main location"} right={<Icon name="next" size={18} color={c.muted2} />} onPress={() => router.push("/m/hours" as never)} />
        <SetRow title={"Show \"open now\" badge"} sub={`Based on your hours. Right now you are ${open === null ? "without hours" : open ? "open" : "closed"}.`} right={<Sw on={!!disp.open_badge} disabled={busy === "open_badge"} label="Show open now badge" onPress={() => toggle("open_badge", "The open now badge shows on your page.", "The open now badge is hidden.")} />} />
        <SetRow title="Notice" sub={disp.notice ? `"${disp.notice}"` : "For holidays and closures. None showing."} right={<Val>{disp.notice ? "Change" : "Add"}</Val>} onPress={() => openSheet("notice", { notice: String(disp.notice ?? "") })} />
        <SetRow title="Show exact address" sub={`${address || "No address yet"} · off shows the area only until booked`} right={<Sw on={!!disp.show_address} disabled={busy === "show_address"} label="Show exact address" onPress={() => toggle("show_address", "Your exact address shows on your page.", "Your page shows the area only until a client has booked.")} />} />
        <SetRow last title="Parking and arrival notes" sub={loc?.arrival_notes ? `"${loc.arrival_notes}"` : "None yet"} right={<Val>{loc?.arrival_notes ? "Change" : "Add"}</Val>} onPress={openArrival} />
      </Card>

      {/* Being found */}
      <Grp>Being found</Grp>
      <Card style={{ paddingTop: 16 }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
          <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 28, lineHeight: 32, color: c.ink }}>{done}<Text style={{ fontFamily: f.medium, fontSize: 14, color: c.muted }}>{done === list.length ? ` of ${list.length}. Everything is in place` : ` of ${list.length} basics in place`}</Text></Text>
          <Bar share={done / list.length} color={done === list.length ? c.ok : c.ink} />
          <T size={12} muted>A plain checklist of what clients look for. It is not a ranking score.</T>
        </View>
        {shownChecks.map((x) => (
          <Pressable key={x.title} accessibilityRole={!x.ok && x.go ? "button" : undefined} disabled={x.ok || !x.go} onPress={() => x.go && fix(x.go)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 52, borderTopWidth: 1, borderTopColor: c.line, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: x.ok ? c.okBg : c.goldBg, alignItems: "center", justifyContent: "center" }}>
              {x.ok ? <Icon name="check" size={13} color={c.ok} stroke={3} /> : <Text style={{ fontFamily: f.bold, fontSize: 13, color: c.goldInk }}>!</Text>}
            </View>
            <Text style={{ flex: 1, fontFamily: f.medium, fontSize: 14, lineHeight: 19, color: c.ink }}>{x.title}</Text>
            {!x.ok && x.go ? <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>{x.fix}</Text> : null}
          </Pressable>
        ))}
        {done > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setAllChecks(!allChecks)} style={({ pressed }) => ({ minHeight: 46, paddingHorizontal: 16, justifyContent: "center", borderTopWidth: 1, borderTopColor: c.line, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>{allChecks ? "Show only what is missing" : `Show the ${done} in place`}</Text>
          </Pressable>
        ) : null}
      </Card>

      {/* The listing */}
      <Grp>Your listing</Grp>
      <Card>
        <SetRow title={st.title} sub={st.sub} right={<Tag kind={st.kind}>{st.tag}</Tag>} />
        {b.status === "live" || b.status === "paused" ? (
          owner ? (
            <SetRow last title={b.status === "paused" ? "Bring your page back" : "Pause online booking"} sub={b.status === "paused" ? "Clients can find and book you again" : "Takes you off search and stops new online bookings. Keeps your data and existing bookings."}
              right={<SmallBtn kind={b.status === "paused" ? "ink" : "out"} busy={busy === "listing"} onPress={() => setListing(b.status !== "paused")}>{b.status === "paused" ? "Go live again" : "Pause"}</SmallBtn>} />
          ) : <SetRow last title={b.status === "paused" ? "Bring your page back" : "Pause online booking"} sub="Only the owner can pause the listing or bring it back." />
        ) : <SetRow last title="Pause online booking" sub="Only a live business can be paused. Yours is not live yet." />}
      </Card>
      <WebLink to="/m/settings/booking">Whether you show on LogaLuxe search</WebLink>

      {/* ---------- the sheets ---------- */}

      <Sheet open={sheet === "name"} onClose={close} title="Business name" sub="The name clients see at the top of your page and on their bookings."
        footer={footer("Save name", () => { const name = (draft.name ?? "").trim(); void saveSheet({ name }, "Saved. Your page is up to date.", name.length < 2 || name.length > 80 ? "The business name must be 2 to 80 characters." : ""); })}>
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <Field label="Business name" value={draft.name ?? ""} onChangeText={set("name")} maxLength={80} autoFocus autoCapitalize="words" />
      </Sheet>

      <Sheet open={sheet === "handle"} onClose={close} title="Handle" sub="The last part of your page's address." footer={footer("Save handle", saveHandle)}>
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <Note kind="gold">{`Changing the handle changes your public address. Links, QR codes and social bios that use /b/${b.slug} stop working as soon as you save. Leave it alone unless you mean to move.`}</Note>
        <View style={{ gap: 6 }}>
          <Label>Handle</Label>
          <Row gap={0} style={{ minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, paddingHorizontal: 14 }}>
            <Text style={{ fontFamily: f.body, fontSize: 16, color: c.muted }}>/b/</Text>
            <TextInput accessibilityLabel="Handle" value={draft.slug ?? ""} onChangeText={(v) => set("slug")(v.toLowerCase().replace(/[^a-z0-9-]/g, ""))} autoCapitalize="none" autoCorrect={false} spellCheck={false} maxLength={60}
              style={{ flex: 1, minHeight: 50, fontFamily: f.body, fontSize: 16, color: c.ink }} />
          </Row>
          <T size={13} muted>Lower-case letters, numbers and dashes. At least two characters.</T>
        </View>
      </Sheet>

      <Sheet open={sheet === "tagline"} onClose={close} title="Tagline" sub="One line under your name."
        footer={footer("Save tagline", () => saveSheet({ tagline: (draft.tagline ?? "").trim() }, (draft.tagline ?? "").trim() ? "Tagline saved." : "Tagline cleared."))}>
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <Field label="Tagline" value={draft.tagline ?? ""} onChangeText={set("tagline")} maxLength={140} autoFocus placeholder="Knotless braids and locs, gentle on edges" hint={`${(draft.tagline ?? "").length} of 140`} />
      </Sheet>

      <Sheet open={sheet === "about"} onClose={close} title="About" sub="Who you are, what you are known for, and what a first visit is like." tall
        footer={footer("Save about text", () => saveSheet({ about: (draft.about ?? "").trim() }, (draft.about ?? "").trim() ? "About text saved." : "About text cleared."))}>
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <Field label="About" value={draft.about ?? ""} onChangeText={set("about")} maxLength={2000} multiline autoFocus style={{ minHeight: 220 }} hint={`${(draft.about ?? "").length} of 2,000`} />
      </Sheet>

      <Sheet open={sheet === "category"} onClose={close} title="Category" sub="Where clients find you in search. Saves when you choose.">
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CATEGORIES.map(([k, name]) => {
            const on = b.category === k;
            return (
              <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: busy === "sheet" }} disabled={busy === "sheet"} onPress={() => (on ? close() : saveSheet({ category: k }, `Saved. You are listed under ${name}.`))}
                style={({ pressed }) => ({ width: "48.5%", minHeight: 52, borderRadius: 16, borderWidth: on ? 2 : 1, borderColor: on ? c.ink : c.line2, backgroundColor: c.white, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: pressed ? 0.8 : 1 })}>
                <Text style={{ fontFamily: f.semi, fontSize: 14, color: c.ink }}>{name}</Text>
                {on ? <Icon name="check" size={16} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      <Sheet open={sheet === "highlights"} onClose={close} title="Highlights" sub="Small facts clients scan before they book. Pick up to six. Only tick what is true for you." tall
        footer={footer(`Save ${plural(picks.length, "highlight")}`, () => saveSheet({ highlights: picks }, picks.length ? "Highlights saved." : "Highlights cleared.", picks.length > 6 ? "Pick up to six highlights." : ""))}>
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {hl.map((h) => {
            const on = picks.some((x) => same(x, h));
            return <Tick key={h} on={on} disabled={!on && picks.length >= 6} onPress={() => { setSheetError(""); setPicks(on ? picks.filter((x) => !same(x, h)) : [...picks, h]); }}>{h}</Tick>;
          })}
        </View>
        <T size={12} muted>{picks.length >= 6 ? "Six picked. Untick one to choose another." : `${picks.length} of 6 picked.`}</T>
        <Field label="Add your own" value={draft.more ?? ""} onChangeText={set("more")} placeholder="Private room, Open late" hint="Separate several with commas." maxLength={120} onSubmitEditing={addOwn} returnKeyType="done" />
        <SmallBtn kind="out" disabled={!(draft.more ?? "").trim() || picks.length >= 6} onPress={addOwn} style={{ alignSelf: "flex-start" }}>Add to the list</SmallBtn>
      </Sheet>

      <Sheet open={sheet === "languages"} onClose={close} title="Languages you speak" sub="Clients see these on your page. Tick only the ones someone on your team can serve a client in." tall footer={footer("Save languages", saveLanguages)}>
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {langChoices.map((l) => {
            const on = picks.includes(l);
            return <Tick key={l} on={on} onPress={() => setPicks(on ? picks.filter((x) => x !== l) : [...picks, l])}>{l}</Tick>;
          })}
        </View>
      </Sheet>

      <Sheet open={sheet === "logo"} onClose={close} title="Logo" sub="A small square image beside your name: a monogram or your mark.">
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <Row gap={14}>
          <View style={{ width: 96, height: 96, borderRadius: 22, backgroundColor: c.gold, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {logoId ? <Image source={{ uri: media(logoId) }} accessibilityLabel={`${b.name} logo`} style={{ width: 96, height: 96 }} /> : <Text style={{ fontFamily: f.serifBold, fontSize: 44, color: c.ink }}>{String(b.name ?? "").trim().charAt(0).toUpperCase()}</Text>}
          </View>
          <T muted size={13} style={{ flex: 1 }}>{logoId ? "This is the logo on your page. A new one replaces it." : "Without a logo, your page shows your first letter like this."}</T>
        </Row>
        {storage ? (
          <>
            <BigChoice icon={<MdIcon name="image" size={20} />} title={logoId ? "Replace the logo" : "Add a logo"} sub="From your photos or the camera. JPEG, PNG or WebP, up to 8 MB." busy={busy === "logo"} disabled={busy === "logo-off"} onPress={() => { setSheetError(""); setLogoFrom(true); }} />
            {logoId ? <BigChoice danger icon={<MdIcon name="trash" size={20} color={c.bad} />} title="Remove the logo" sub="Your page shows your first letter instead" busy={busy === "logo-off"} disabled={busy === "logo"} onPress={removeLogo} /> : null}
          </>
        ) : <Note kind="gold">Image uploads are not set up yet. File storage has not been connected for LogaLuxe on this server, so a logo cannot be added for now. Contact LogaLuxe support if this does not change.</Note>}
        <PhotoSource open={logoFrom} onClose={() => setLogoFrom(false)} title={logoId ? "Replace the logo" : "Add a logo"} sub="A square image works best." onPicked={(p) => uploadLogo(p[0])} />
      </Sheet>

      <Sheet open={sheet === "tone"} onClose={close} title="Page colour" sub="Shown where a photo is missing or still loading."
        footer={footer("Save colour", () => { const t = (draft.tone ?? "").trim().toUpperCase(); void saveSheet({ tone: t }, "Page colour saved.", TONE_RE.test(t) ? "" : "The colour must look like #7A1F2B."); })}>
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <View style={{ height: 96, borderRadius: 16, backgroundColor: TONE_RE.test(draft.tone ?? "") ? draft.tone : tone, justifyContent: "flex-end", padding: 12 }}>
          <Text style={{ fontFamily: f.medium, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>Where a photo would be</Text>
        </View>
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {TONES.map((t) => {
            const on = same(draft.tone ?? "", t);
            return (
              <Pressable key={t} accessibilityRole="radio" accessibilityLabel={`Colour ${t}`} accessibilityState={{ checked: on }} onPress={() => set("tone")(t)} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: on ? c.ink : "transparent", alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t, alignItems: "center", justifyContent: "center" }}>{on ? <Icon name="check" size={16} color="#F4ECE3" stroke={2.5} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
        <Field label="Or type a colour" value={draft.tone ?? ""} onChangeText={set("tone")} autoCapitalize="characters" autoCorrect={false} maxLength={7} placeholder="#7A1F2B" />
      </Sheet>

      <Sheet open={sheet === "social"} onClose={close} title="Contact and social" sub="Shown as links on your page. Leave any of them empty." tall
        footer={footer("Save links", () => {
          const website = (draft.website ?? "").trim();
          void saveSheet({ instagram: (draft.instagram ?? "").trim(), tiktok: (draft.tiktok ?? "").trim(), website }, "Links saved.", website && !/^https?:\/\//i.test(website) ? "The website must start with https://" : "");
        })}>
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <Field label="Instagram" value={draft.instagram ?? ""} onChangeText={set("instagram")} placeholder="@yourname" maxLength={80} autoCapitalize="none" autoCorrect={false} />
        <Field label="TikTok" value={draft.tiktok ?? ""} onChangeText={set("tiktok")} placeholder="@yourname" maxLength={80} autoCapitalize="none" autoCorrect={false} />
        <Field label="Website" value={draft.website ?? ""} onChangeText={set("website")} placeholder="https://" maxLength={200} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      </Sheet>

      <Sheet open={sheet === "notice"} onClose={close} title="Notice" sub="For holidays and closures. Shows on your page until you clear it."
        footer={(
          <View style={{ gap: 8 }}>
            {footer("Save notice", () => saveSheet({}, (draft.notice ?? "").trim() ? "Notice saved. It shows on your page now." : "Notice cleared.", "", { notice: (draft.notice ?? "").trim() }))}
            {disp.notice ? <Btn kind="out" disabled={busy === "sheet"} onPress={() => saveSheet({}, "Notice cleared.", "", { notice: "" })}>Clear the notice</Btn> : null}
          </View>
        )}>
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <Field label="Notice" value={draft.notice ?? ""} onChangeText={set("notice")} maxLength={200} autoFocus placeholder="Closed 24 to 26 Dec" hint="Leave empty for no notice." />
      </Sheet>

      <Sheet open={sheet === "arrival"} onClose={close} title="Parking and arrival notes" sub="Clients read these before they set off." footer={footer("Save notes", saveArrival, !place)}>
        {sheetError ? <Note kind="bad">{sheetError}</Note> : null}
        <Field label={place ? `Notes for ${place.name}` : "Notes"} value={draft.notes ?? ""} onChangeText={set("notes")} multiline maxLength={500} editable={!!place} placeholder="Park behind the building. Ring the bell for suite 4." />
      </Sheet>
    </Screen>
  );
}
