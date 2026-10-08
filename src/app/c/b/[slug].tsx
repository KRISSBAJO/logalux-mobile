// A professional's page (design: C3-Profile). Everything comes from GET /v1/businesses/{slug}, its
// photos and its reviews. Choosing services fills the bar at the bottom, which leads to the booking flow.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Btn, Chip, Empty, Failed, Icon, Label, Loading, Note, Pill, Row, Screen, Serif, T, type IconName } from "@/components/ui";
import { api, ApiError, media, WEB_URL, type Row as Data } from "@/lib/api";
import { categoryLabel, cleanSrc, hourRows, lateRule, openBadge, replyLine } from "@/lib/ca-data";
import { distanceLabel, kmBetween, shortName, usePlace } from "@/lib/ca-place";
import { dayShort, duration, firstName, money, plural, ymd } from "@/lib/format";
import { useSession } from "@/lib/session";
import { c, f, pad, radius } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Review = { id: string; author_name: string; service_name?: string; rating: number; body: string; reply?: string; created_at: string; photos?: string[] | null };
type Reviews = { stars: number; items: Review[]; total: number; page: number; loading: boolean; error: string };
type Tab = "services" | "portfolio" | "team" | "reviews" | "about";

const TONES = ["#7A1F2B", "#2E2538", "#4A3426", "#1F2A33", "#3A3A2E", "#4A2A2A", "#5A4A3A"];
const toneFor = (name: string) => TONES[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONES.length];
const PER_PAGE = 10;

/** "8 Oct", with the year when it is not this one, on the business's own calendar. */
function reviewDate(at: string, tz: string) {
  const day = dayShort(at, tz).split(" ").slice(1).join(" ");
  const year = ymd(new Date(at), tz).slice(0, 4);
  return year && year !== String(new Date().getFullYear()) ? `${day} ${year}` : day;
}

/** The round buttons that sit on the photo. */
function Round({ icon, label, onPress, on }: { icon: IconName; label: string; onPress: () => void; on?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={on === undefined ? undefined : { selected: on }} onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(251,247,242,.92)", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={icon === "back" ? 20 : 18} color={on ? c.wine : c.ink} fill={on ? c.wine : "none"} />
    </Pressable>
  );
}

function StarRow({ rating }: { rating: number }) {
  return (
    <View accessibilityRole="image" accessibilityLabel={`${rating} out of 5`} style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={12} color={n <= Math.round(rating) ? c.gold : c.line2} fill={n <= Math.round(rating) ? c.gold : c.line2} />)}
    </View>
  );
}

function KV({ k, children, onPress }: { k: string; children: string; onPress?: () => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.line }}>
      <T muted size={13} style={{ width: 96 }}>{k}</T>
      {onPress
        ? <Pressable accessibilityRole="link" onPress={onPress} hitSlop={12} style={{ flex: 1 }}><T size={13} weight="semi" color={c.wine}>{children}</T></Pressable>
        : <T size={13} weight="semi" style={{ flex: 1 }}>{children}</T>}
    </View>
  );
}

export default function Profile() {
  const p = useLocalSearchParams<{ slug: string; src?: string; services?: string }>();
  const slug = String(p.slug ?? "");
  const src = cleanSrc(p.src);
  const s = useSession();
  const w = usePlace();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const here = `/c/b/${slug}${src ? `?src=${src}` : ""}`;

  const page = useLoad(async () => {
    if (!s.ready) return null;
    const at = `/businesses/${encodeURIComponent(slug)}`;
    try {
      // The client's token goes along when there is one, so the page knows whether they have saved this business.
      const [data, photos, reviews] = await Promise.all([
        s.capi<Data>(`${at}${src ? `?src=${src}` : ""}`),
        api<{ media: Data[] }>(`/site/media?slot=business&ref=${encodeURIComponent(slug)}`).then((r) => r.media ?? []).catch(() => [] as Data[]),
        api<Data>(`${at}/reviews?page=1`).catch(() => null),
      ]);
      // A business that is not open to the public yet has no page here.
      if ((data.business?.status ?? "live") !== "live") return { missing: true as const };
      return { missing: false as const, data, photos, reviews };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return { missing: true as const };
      throw e;
    }
  }, [slug, src, s.ready, s.clientToken]);

  const got = page.data && !page.data.missing ? page.data : null;
  const data = got?.data;
  const services: Data[] = useMemo(() => data?.services ?? [], [data]);
  const multi = data?.policy?.multi_service !== false;

  // ----- chosen services -----
  const [picked, setPicked] = useState<string[] | null>(null);
  const chosenIds = useMemo(() => {
    if (picked) return picked.filter((id) => services.some((x) => x.id === id));
    const asked = typeof p.services === "string" ? p.services.split(",").filter((id) => services.some((x) => x.id === id)) : [];
    const start = asked.length ? asked : services[0] ? [services[0].id] : [];
    return multi ? start : start.slice(0, 1);
  }, [picked, services, p.services, multi]);
  const chosen = services.filter((x) => chosenIds.includes(x.id));
  const toggle = (id: string) => setPicked(chosenIds.includes(id) ? chosenIds.filter((x) => x !== id) : multi ? [...chosenIds, id] : [id]);
  const total = chosen.reduce((a, x) => a + x.price_cents, 0);
  const mins = chosen.reduce((a, x) => a + x.duration_min + (x.processing_min ?? 0), 0);

  // ----- saved -----
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  useEffect(() => { setSaved(!!data?.saved); }, [data]);
  const save = async () => {
    if (!s.clientToken) { router.push(`/sign-in?next=${encodeURIComponent(here)}` as never); return; }
    const was = saved;
    setSaved(!was); setNote(null);
    try {
      await s.capi(`/auth/favourites/${encodeURIComponent(slug)}`, { method: was ? "DELETE" : "PUT" });
    } catch (e) {
      setSaved(was);
      setNote({ kind: "bad", text: (e as Error).message });
    }
  };
  const share = async () => {
    const url = `${WEB_URL}/b/${slug}`, name = String(data?.business?.name ?? "LogaLuxe");
    setNote(null);
    try {
      await Share.share(Platform.OS === "ios" ? { url, message: name } : { message: `${name} on LogaLuxe: ${url}`, title: name });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // they closed the share sheet
      // A browser with no share sheet: put the address where they can paste it.
      try {
        await (globalThis.navigator as unknown as { clipboard: { writeText: (t: string) => Promise<void> } }).clipboard.writeText(url);
        setNote({ kind: "ok", text: "Link copied." });
      } catch {
        setNote({ kind: "ok", text: url });
      }
    }
  };

  // ----- reviews: three to start with, then all of them a page at a time -----
  const [all, setAll] = useState(false);
  const [rev, setRev] = useState<Reviews | null>(null);
  const firstPage: Review[] = got?.reviews?.reviews ?? [];
  const bd: Data = got?.reviews?.breakdown ?? {};
  const loadReviews = async (stars: number, pageNo: number) => {
    setRev((r) => ({ stars, items: pageNo === 1 ? [] : r?.items ?? [], total: r?.total ?? 0, page: pageNo - 1, loading: true, error: "" }));
    try {
      const out = await api<{ reviews: Review[]; total: number }>(`/businesses/${encodeURIComponent(slug)}/reviews?page=${pageNo}${stars ? `&stars=${stars}` : ""}`);
      setRev((r) => (r && r.stars === stars ? { stars, items: pageNo === 1 ? out.reviews ?? [] : [...r.items, ...(out.reviews ?? []).filter((x) => !r.items.some((y) => y.id === x.id))], total: Number(out.total) || 0, page: pageNo, loading: false, error: "" } : r));
    } catch (e) {
      setRev((r) => (r && r.stars === stars ? { ...r, loading: false, error: (e as Error).message } : r));
    }
  };
  const readAll = () => { setAll(true); setRev({ stars: 0, items: firstPage, total: Number(got?.reviews?.total) || firstPage.length, page: 1, loading: false, error: "" }); };

  const [tab, setTab] = useState<Tab>("services");
  const [photoAt, setPhotoAt] = useState(0);
  const [zoom, setZoom] = useState<{ ids: string[]; at: number; by: string } | null>(null);

  // ---------- loading, failed, not found ----------
  if (!got) {
    return (
      <Screen>
        <Row style={{ minHeight: 44, marginBottom: 14 }}><Round icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/client/search" as never))} /></Row>
        {page.data?.missing ? (
          <Empty title="We could not find this business" action={<Btn small onPress={() => router.replace("/client/search" as never)}>Search LogaLuxe</Btn>}>
            It may have changed its link, or it is not taking bookings on LogaLuxe yet.
          </Empty>
        ) : page.error ? <Failed error={page.error} onRetry={page.reload} /> : <Loading />}
      </Screen>
    );
  }

  const b: Data = data!.business, display: Data = data!.display ?? {}, policy: Data = data!.policy ?? {};
  const tz: string = b.timezone || "UTC", cur: string = b.currency;
  const locations: Data[] = data!.locations ?? [];
  const loc = locations.find((l) => l.is_primary) ?? locations[0];
  const others = locations.filter((l) => l !== loc);
  const staff: Data[] = display.show_staff === false ? [] : data!.staff ?? [];
  const showReviews = display.show_reviews !== false;
  const showAddress = display.show_address !== false;
  const showDurations = display.show_durations !== false;
  const photos: Data[] = got.photos;
  const rating = Number(b.rating) || 0;
  const reviewCount = Number(bd.all ?? b.review_count) || 0;
  const badge = display.open_badge === false ? null : openBadge(loc?.hours, tz);
  const deposits = services.map((x) => Number(x.deposit_cents) || 0).filter((n) => n > 0);
  const hasDeposit = deposits.length > 0;
  const cancelHours = Number(policy.cancel_hours ?? 24);
  const late = lateRule(policy.late_cancel_fee, hasDeposit);
  // "$40", "from $20", or "from $20 on some services": what a deposit costs across the menu.
  const lowest = hasDeposit ? Math.min(...deposits) : 0;
  const depositSize = !hasDeposit ? "" : deposits.length < services.length ? `from ${money(lowest, cur)} on some services` : lowest === Math.max(...deposits) ? money(lowest, cur) : `from ${money(lowest, cur)}`;
  const depositLine = hasDeposit ? `Deposit ${depositSize}` : "No deposit";
  const cancelLine = cancelHours > 0 ? `Free cancellation until ${cancelHours} h before` : "Free cancellation at any time";
  const summary = String((showReviews ? got.reviews?.summary || b.review_summary : "") ?? "").trim();
  const languages: string[] = (data!.extras?.languages ?? []).filter((l: unknown) => typeof l === "string" && l.trim());
  const replies = replyLine(data!.extras?.reply_minutes);
  const handle = (v?: string) => (v ?? "").replace(/^@/, "").trim();
  const site = b.website ? (/^https?:\/\//.test(b.website) ? b.website : `https://${b.website}`) : "";
  const hasPin = showAddress && typeof loc?.lat === "number" && typeof loc?.lng === "number";
  // How far it is from where the client is looking: from their device, or the middle of their place. Miles for a US business, kilometres for a Nigerian one.
  const howFar = w.point && typeof loc?.lat === "number" && typeof loc?.lng === "number"
    ? `${distanceLabel(kmBetween(w.point, { lat: loc.lat, lng: loc.lng }), (loc.country ?? b.market) === "US" ? "mi" : "km")} ${w.source === "device" ? "from you" : `from the middle of ${shortName(w.place!)}`}` : "";
  const travels = !!loc?.travels;
  const address = showAddress ? [loc?.address, [loc?.city, loc?.region === loc?.city ? "" : loc?.region].filter(Boolean).join(" ")].filter(Boolean).join(", ") || loc?.name || "" : [loc?.city, loc?.region].filter(Boolean).join(" ");
  const openMaps = () => {
    const at = `${loc!.lat},${loc!.lng}`;
    void Linking.openURL(Platform.OS === "ios" ? `http://maps.apple.com/?ll=${at}&q=${encodeURIComponent(b.name)}` : `https://www.google.com/maps/search/?api=1&query=${at}`);
  };
  const tabs = ([["services", "Services", true], ["portfolio", "Portfolio", photos.length > 0], ["team", "Team", staff.length > 0], ["reviews", "Reviews", showReviews], ["about", "About", true]] as [Tab, string, boolean][]).filter((t) => t[2]);
  const groups = [...new Set(services.map((x) => String(x.category ?? "")))];
  const shown: Review[] = all && rev ? rev.items : firstPage.slice(0, 3);
  const ownerFirst = firstName(String(b.owner_name ?? ""));
  const bookHref = `/c/book/${slug}?services=${chosenIds.join(",")}${src ? `&src=${src}` : ""}`;

  const footer = (
    <Row between>
      <View style={{ flex: 1 }}>
        {chosen.length ? (
          <>
            <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: c.muted }}>{plural(chosen.length, "service")}{showDurations && mins ? ` · ${duration(mins)}` : ""}</Text>
            <Text style={{ fontFamily: f.bold, fontSize: 20, color: c.ink }}>{money(total, cur)}</Text>
          </>
        ) : <T muted size={13}>{services.length ? "Choose a service to see times." : "No services to book yet."}</T>}
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !chosen.length }} disabled={!chosen.length} onPress={() => router.push(bookHref as never)}
        style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: c.ink, flexDirection: "row", alignItems: "center", gap: 8, opacity: !chosen.length ? 0.5 : pressed ? 0.85 : 1 })}>
        <Text style={{ fontFamily: f.semi, fontSize: 15, color: c.cream }}>Choose a time</Text>
        <Icon name="next" size={16} color={c.cream} stroke={2.2} />
      </Pressable>
    </Row>
  );

  return (
    <>
      <Screen padded={false} top={false} footer={footer} onRefresh={page.refresh} refreshing={page.refreshing}>
        {/* ----- photos ----- */}
        <View style={{ height: 250, backgroundColor: b.tone || c.photo }}>
          {photos.length ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={32}
              onScroll={(e) => setPhotoAt(Math.max(0, Math.min(photos.length - 1, Math.round(e.nativeEvent.contentOffset.x / width))))}>
              {photos.map((ph, i) => (
                <Pressable key={ph.id} accessibilityRole="imagebutton" accessibilityLabel={`${ph.alt || `${b.name}, photo ${i + 1} of ${photos.length}`}. Open it larger.`} onPress={() => setZoom({ ids: photos.map((x) => x.id), at: i, by: b.name })}>
                  <Image source={{ uri: media(ph.id) }} resizeMode="cover" style={{ width, height: 250 }} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 10, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
            <Round icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/client/search" as never))} />
            <Row gap={8}>
              <Round icon="share" label={`Share ${b.name}`} onPress={() => void share()} />
              <Round icon="heart" label={saved ? `Remove ${b.name} from saved` : `Save ${b.name}`} on={saved} onPress={() => void save()} />
            </Row>
          </View>
          <Text pointerEvents="none" style={styles.caption}>{photos.length ? `${photos[photoAt]?.caption || photos[photoAt]?.alt || "Photo"}${photos.length > 1 ? ` · ${photoAt + 1} / ${photos.length}` : ""}` : categoryLabel(b.category)}</Text>
        </View>

        {/* ----- who they are ----- */}
        <View style={{ paddingHorizontal: pad, paddingTop: 16 }}>
          {note ? <View style={{ marginBottom: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
          {display.notice ? <View style={{ marginBottom: 12 }}><Note kind="gold">{String(display.notice)}</Note></View> : null}
          <Row gap={12} style={{ alignItems: "flex-start" }}>
            {b.logo_id ? <Avatar name={b.name} uri={media(b.logo_id)} size={48} /> : null}
            <Serif size={30} style={{ flex: 1, fontFamily: f.serifBold }}>{b.name}</Serif>
          </Row>
          <Row gap={8} wrap style={{ marginTop: 6 }}>
            {showReviews && reviewCount > 0 ? (
              <Row gap={4}>
                <Icon name="star" size={14} color={c.gold} fill={c.gold} />
                <Text style={{ fontFamily: f.bold, fontSize: 14, color: c.ink }}>{rating.toFixed(1)}</Text>
                <Text style={{ fontFamily: f.medium, fontSize: 14, color: c.muted }}>({reviewCount})</Text>
              </Row>
            ) : null}
            {b.verification_status === "verified" ? (
              <View style={[styles.pill, { backgroundColor: c.okBg }]}><Icon name="check" size={11} color={c.ok} stroke={3} /><Text style={{ fontFamily: f.semi, fontSize: 12, color: c.ok }}>Verified</Text></View>
            ) : null}
            <Pill kind="gold">{policy.instant === false ? "Confirms each request" : "Instant booking"}</Pill>
          </Row>
          <T muted size={13} style={{ marginTop: 8 }}>{[categoryLabel(b.category), loc?.name, badge?.text].filter(Boolean).join(" · ")}</T>
          <T muted size={13} style={{ marginTop: 4 }}>{depositLine} · {cancelLine}</T>
          {b.tagline ? <T size={14} style={{ marginTop: 10 }}>{b.tagline}</T> : null}
          {b.highlights?.length ? (
            <Row gap={6} wrap style={{ marginTop: 10 }}>
              {(b.highlights as string[]).map((h) => <View key={h} style={[styles.pill, { backgroundColor: c.cream2 }]}><Text style={{ fontFamily: f.semi, fontSize: 12, color: c.muted }}>{h}</Text></View>)}
            </Row>
          ) : null}
          <Row gap={10} wrap style={{ marginTop: 14 }}>
            <Btn kind="out" small icon="chat" onPress={() => router.push(`/c/chat/${slug}` as never)}>Message</Btn>
            {replies ? <T muted size={12} style={{ flex: 1 }}>{replies}</T> : null}
          </Row>
        </View>

        {/* ----- tabs ----- */}
        <View accessibilityRole="tablist" style={{ marginHorizontal: pad, marginTop: 14, flexDirection: "row", gap: 4, borderBottomWidth: 1, borderBottomColor: c.line }}>
          {tabs.map(([id, label]) => (
            <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} onPress={() => setTab(id)}
              style={{ flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: tab === id ? c.ink : "transparent", marginBottom: -1 }}>
              <Text style={{ fontFamily: f.semi, fontSize: 14, color: tab === id ? c.ink : c.tab }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: pad, marginTop: 4 }}>
          {tab === "services" ? (
            services.length === 0 ? <View style={{ marginTop: 14 }}><Empty title="No services online yet">This business has not put its services on LogaLuxe yet. Message them to ask what they offer.</Empty></View> : (
              <>
                <T muted size={13} style={{ marginTop: 12 }}>{multi ? "Tap to add one or more." : "Tap to choose one. This business takes one service per booking."}{hasDeposit ? " A deposit holds your slot and comes off the total." : ""}</T>
                {groups.map((g) => (
                  <View key={g}>
                    {groups.length > 1 || g ? <Label style={{ marginTop: 16, marginBottom: 2 }}>{g || "Services"}</Label> : null}
                    {services.filter((x) => String(x.category ?? "") === g).map((x, i, arr) => {
                      const on = chosenIds.includes(x.id);
                      const sub = [showDurations ? duration(x.duration_min + (x.processing_min ?? 0)) : "", x.description, x.deposit_cents > 0 ? `${money(x.deposit_cents, cur)} deposit` : ""].filter(Boolean).join(" · ");
                      return (
                        <View key={x.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{x.name}</Text>
                            {sub ? <T muted size={13} numberOfLines={2}>{sub}</T> : null}
                          </View>
                          <Text style={{ fontFamily: f.bold, fontSize: 15, color: c.ink }}>{money(x.price_cents, cur)}</Text>
                          <Pressable accessibilityRole={multi ? "checkbox" : "radio"} accessibilityState={{ checked: on }} accessibilityLabel={`${on ? "Remove" : "Add"} ${x.name}`} onPress={() => toggle(x.id)}
                            style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: c.ink, backgroundColor: on ? c.ink : c.white, alignItems: "center", justifyContent: "center" }}>
                            <Icon name={on ? "check" : "plus"} size={18} stroke={2.4} color={on ? c.cream : c.ink} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </>
            )
          ) : null}

          {tab === "portfolio" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              {photos.map((ph, i) => (
                <Pressable key={ph.id} accessibilityRole="imagebutton" accessibilityLabel={`${ph.alt || `Photo ${i + 1} of ${photos.length}`}. Open it larger.`} onPress={() => setZoom({ ids: photos.map((x) => x.id), at: i, by: b.name })}>
                  <Image source={{ uri: media(ph.id) }} resizeMode="cover" style={{ width: (width - pad * 2 - 8) / 2, height: (width - pad * 2 - 8) / 2, borderRadius: 14, backgroundColor: b.tone || c.photo }} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {tab === "team" ? (
            <View style={{ marginTop: 6 }}>
              {staff.map((m, i) => (
                <Row key={m.id} gap={12} style={{ paddingVertical: 12, borderBottomWidth: i < staff.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
                  <Avatar name={m.name} tone={m.tone} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{m.name}</Text>
                    <T muted size={13}>{[m.role === "owner" ? "Owner" : "", m.level ? (m.role === "owner" ? m.level : m.level[0].toUpperCase() + m.level.slice(1)) : ""].filter(Boolean).join(" · ") || "Team member"}</T>
                  </View>
                  {Number(m.rating) ? <Row gap={4}><Icon name="star" size={13} color={c.gold} fill={c.gold} /><Text style={{ fontFamily: f.bold, fontSize: 13, color: c.ink }}>{Number(m.rating).toFixed(1)}</Text></Row> : null}
                </Row>
              ))}
            </View>
          ) : null}

          {tab === "reviews" ? (
            <View style={{ marginTop: 16 }}>
              <Serif size={22}>{reviewCount ? `${rating.toFixed(1)} · ${plural(reviewCount, "review")}` : "Reviews"}</Serif>
              <T muted size={12} style={{ marginTop: 4 }}>Only clients with a completed, paid booking can review.</T>
              {reviewCount > 0 ? (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {[5, 4, 3, 2, 1].map((n) => {
                    const count = Number(bd[`s${n}`]) || 0;
                    return (
                      <Row key={n} gap={8} style={{ minHeight: 18 }}>
                        <Text accessibilityLabel={`${n} stars: ${plural(count, "review")}`} style={{ width: 30, fontFamily: f.medium, fontSize: 12, color: c.muted }}>{n} ★</Text>
                        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.cream2, overflow: "hidden" }}><View style={{ width: `${Math.round((count / reviewCount) * 100)}%`, height: 6, backgroundColor: c.gold }} /></View>
                        <Text style={{ width: 26, textAlign: "right", fontFamily: f.medium, fontSize: 12, color: c.muted }}>{count}</Text>
                      </Row>
                    );
                  })}
                </View>
              ) : null}
              {summary ? <View style={{ marginTop: 14, backgroundColor: c.cream2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }}><T size={14}><Text style={{ fontFamily: f.bold }}>What people say: </Text>{summary}</T></View> : null}
              {reviewCount === 0 ? <View style={{ marginTop: 14 }}><Empty title="No reviews yet">Reviews appear here after a client's visit is completed and paid for.</Empty></View> : null}

              {all && rev ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, marginHorizontal: -pad }} contentContainerStyle={{ paddingHorizontal: pad, gap: 8 }}>
                  <Chip on={rev.stars === 0} onPress={() => void loadReviews(0, 1)}>All {reviewCount}</Chip>
                  {[5, 4, 3, 2, 1].filter((n) => Number(bd[`s${n}`]) > 0).map((n) => <Chip key={n} on={rev.stars === n} onPress={() => void loadReviews(n, 1)}>{n} ★ · {Number(bd[`s${n}`])}</Chip>)}
                </ScrollView>
              ) : null}

              {shown.map((r) => (
                <View key={r.id} style={{ flexDirection: "row", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.line }}>
                  <Avatar name={r.author_name} tone={toneFor(r.author_name)} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Row between gap={10} style={{ alignItems: "flex-start" }}>
                      <Text style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>{r.author_name}</Text>
                      <T muted size={12} style={{ flex: 1, textAlign: "right" }}>{[reviewDate(r.created_at, tz), r.service_name].filter(Boolean).join(" · ")}</T>
                    </Row>
                    <StarRow rating={r.rating} />
                    <T size={14}>{r.body}</T>
                    {r.photos?.length ? (
                      <Row gap={8} style={{ marginTop: 4 }}>
                        {r.photos.map((id, i) => (
                          <Pressable key={id} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1} of ${r.photos!.length} from ${r.author_name}'s review. Open it larger.`} onPress={() => setZoom({ ids: r.photos!, at: i, by: r.author_name })}>
                            <Image source={{ uri: media(id) }} resizeMode="cover" style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: c.cream2 }} />
                          </Pressable>
                        ))}
                      </Row>
                    ) : null}
                    {r.reply ? <View style={{ marginTop: 4, backgroundColor: c.cream2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}><T size={13}><Text style={{ fontFamily: f.bold }}>{ownerFirst || "The business"} replied: </Text>{r.reply}</T></View> : null}
                  </View>
                </View>
              ))}

              {!all && reviewCount > Math.min(3, firstPage.length) && firstPage.length > 0 ? <Btn kind="out" small onPress={readAll} style={{ alignSelf: "flex-start", marginTop: 14 }}>Read all {reviewCount}</Btn> : null}
              {all && rev ? (
                <View style={{ marginTop: 14, gap: 10 }}>
                  {rev.loading ? <ActivityIndicator color={c.wine} accessibilityLabel="Loading reviews" /> : null}
                  {rev.error ? <Failed error={rev.error} onRetry={() => void loadReviews(rev.stars, rev.page + 1)} /> : null}
                  {!rev.loading && !rev.error && rev.items.length === 0 ? <T muted size={14}>No reviews with {plural(rev.stars, "star")}.</T> : null}
                  <Row gap={10} wrap>
                    {!rev.loading && !rev.error && rev.items.length < rev.total ? <Btn kind="out" small onPress={() => void loadReviews(rev.stars, rev.page + 1)}>Show {Math.min(PER_PAGE, rev.total - rev.items.length)} more</Btn> : null}
                    <Btn kind="soft" small onPress={() => { setAll(false); setRev(null); }}>Show fewer</Btn>
                  </Row>
                </View>
              ) : null}
            </View>
          ) : null}

          {tab === "about" ? (
            <View style={{ marginTop: 16, gap: 22 }}>
              {String(b.about ?? "").trim() ? <T size={15}>{String(b.about).trim()}</T> : null}
              <View>
                <Serif size={22} style={{ marginBottom: 8 }}>Where</Serif>
                <T size={14} weight="semi">{address}</T>
                {howFar ? <T muted size={13}>{howFar}{travels ? " · comes to you" : ""}</T> : travels ? <T muted size={13}>Comes to you{Number(loc?.travel_radius_km) > 0 ? ` within ${distanceLabel(Number(loc!.travel_radius_km), (loc!.country ?? b.market) === "US" ? "mi" : "km")}` : ""}.</T> : null}
                {!showAddress ? <T muted size={13}>The exact address is sent when you book.</T> : null}
                {showAddress && loc?.arrival_notes ? <T muted size={13} style={{ marginTop: 2 }}>{loc.arrival_notes}</T> : null}
                {hasPin ? (
                  <Pressable accessibilityRole="link" onPress={openMaps} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
                    <Icon name="pin" size={16} color={c.wine} /><T size={13} weight="semi" color={c.wine}>Open in maps</T>
                  </Pressable>
                ) : null}
                {others.length ? <T muted size={13} style={{ marginTop: 4 }}>Also at {others.map((o) => [o.name, showAddress ? o.address : "", o.city].filter(Boolean).join(", ")).join("; ")}.</T> : null}
              </View>
              {hourRows(loc?.hours).length ? (
                <View>
                  <Serif size={22} style={{ marginBottom: 8 }}>Hours</Serif>
                  {badge ? <View style={{ marginBottom: 8 }}><Pill kind={badge.open ? "ok" : "grey"}>{badge.text}</Pill></View> : null}
                  {hourRows(loc?.hours).map(([d, h]) => <KV key={d} k={d}>{h}</KV>)}
                </View>
              ) : null}
              <View>
                <Serif size={22} style={{ marginBottom: 8 }}>Good to know</Serif>
                {b.verification_status === "verified" ? <KV k="Verified">Identity checked by LogaLuxe</KV> : null}
                <KV k="Booking">{policy.instant === false ? "The business confirms each request" : "Confirmed at once"}</KV>
                <KV k="Cancelling">{cancelHours > 0 ? `Free until ${cancelHours} h before your visit${late ? `. After that ${late}.` : "."}` : "Free at any time."}</KV>
                <KV k="Deposit">{hasDeposit ? `${depositSize[0].toUpperCase()}${depositSize.slice(1)}. It holds your slot and comes off the total.` : "None. You pay at the visit."}</KV>
                {Number(policy.new_client_deposit_pct) > 0 ? <KV k="First visit">{`${policy.new_client_deposit_pct}% deposit when you book`}</KV> : null}
                <KV k="Pays with">{policy.payments_live === false ? "Paid at the visit" : b.market === "NG" ? "Card, transfer or USSD, on Paystack's secure page" : "Card, on Stripe's secure page"}</KV>
                {languages.length ? <KV k="Languages">{languages.join(", ")}</KV> : null}
                {replies ? <KV k="Messages">{replies}</KV> : null}
                {b.phone ? <KV k="Phone" onPress={() => void Linking.openURL(`tel:${String(b.phone).replace(/[^\d+]/g, "")}`)}>{String(b.phone)}</KV> : null}
                {handle(b.instagram) ? <KV k="Instagram" onPress={() => void Linking.openURL(`https://instagram.com/${handle(b.instagram)}`)}>{`@${handle(b.instagram)}`}</KV> : null}
                {handle(b.tiktok) ? <KV k="TikTok" onPress={() => void Linking.openURL(`https://tiktok.com/@${handle(b.tiktok)}`)}>{`@${handle(b.tiktok)}`}</KV> : null}
                {site ? <KV k="Website" onPress={() => void Linking.openURL(site)}>{site.replace(/^https?:\/\//, "").replace(/\/$/, "")}</KV> : null}
              </View>
            </View>
          ) : null}
        </View>
      </Screen>

      {/* A photo, larger. */}
      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        {zoom ? (
          <View style={{ flex: 1, backgroundColor: "rgba(26,21,19,.94)", paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 16) }}>
            <Row between style={{ paddingHorizontal: 16 }}>
              <Text style={{ fontFamily: f.medium, fontSize: 13, color: "#F4ECE3" }}>{zoom.ids.length > 1 ? `${zoom.at + 1} of ${zoom.ids.length}` : ""}</Text>
              <Round icon="close" label="Close the photo" onPress={() => setZoom(null)} />
            </Row>
            <Image source={{ uri: media(zoom.ids[zoom.at]) }} accessibilityLabel={`Photo ${zoom.at + 1} of ${zoom.ids.length}, ${zoom.by}`} resizeMode="contain" style={{ flex: 1, marginVertical: 12 }} />
            {zoom.ids.length > 1 ? (
              <Row between style={{ paddingHorizontal: 16 }}>
                <Btn kind="out" small onPress={() => setZoom({ ...zoom, at: (zoom.at + zoom.ids.length - 1) % zoom.ids.length })}>Previous</Btn>
                <Btn kind="out" small onPress={() => setZoom({ ...zoom, at: (zoom.at + 1) % zoom.ids.length })}>Next</Btn>
              </Row>
            ) : null}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  caption: { position: "absolute", left: 14, right: 14, bottom: 14, fontFamily: f.medium, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: "rgba(255,255,255,.6)" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
});
