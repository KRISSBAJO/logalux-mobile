import { useClock } from "@/lib/use-clock";
// One client's profile (design: M7-Client): who they are, the numbers, what the business has noted,
// what they hold (packages, memberships, points), their visits and their conversations.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Card, Empty, Failed, IconButton, Loading, Note, Row as Line, Serif, T } from "@/components/ui";
import { ClientSheet, type ClientFormMode } from "@/components/mb-client-form";
import { ChannelBadge, Choice, Face, RoundBtn, Sheet, Tabs, Tag } from "@/components/mb-ui";
import type { Row } from "@/lib/api";
import { clock, money } from "@/lib/format";
import { useFlash, useMapi, useRefocus } from "@/lib/mb-hooks";
import { cap, channelLabel, dateMed, monthYear, sand, stampShort, STATUS_LABEL, tagText, tagTone, toneOf, type Tone } from "@/lib/mb-util";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

type TabId = "notes" | "visits" | "msgs";

/** "12 Sep" */
const dayMonthOf = (iso: string, tz?: string) => {
  const parts = (zone?: string) => new Intl.DateTimeFormat("en-US", { timeZone: zone, day: "numeric", month: "short" }).formatToParts(new Date(iso));
  let p: Intl.DateTimeFormatPart[];
  try { p = parts(tz); } catch { p = parts(); }
  return (p.find((x) => x.type === "day")?.value ?? "") + " " + (p.find((x) => x.type === "month")?.value ?? "");
};
const dateOnly = (v: string) => { const day = String(v).slice(0, 10) + "T12:00:00Z"; return dayMonthOf(day, "UTC") + " " + day.slice(0, 4); };
const PLAN: Record<string, [string, Tone]> = { active: ["Active", "ok"], past_due: ["Payment owing", "gold"], cancelled: ["Cancelled", "wine"], used: ["Used up", "grey"], expired: ["Expired", "grey"] };

export default function ClientProfile() {
  const clockNow = useClock();
  const p = useLocalSearchParams<{ id: string; added?: string }>();
  const id = String(p.id ?? "");
  const s = useSession();
  const mapi = useMapi();
  const insets = useSafeAreaInsets();
  const me = s.merchant, tz = me?.timezone as string | undefined, cur = (me?.currency as string) ?? "USD";

  const [tab, setTab] = useState<TabId>("notes");
  const [edit, setEdit] = useState<ClientFormMode | null>(null);
  const [menu, setMenu] = useState(false);
  const { flash, show } = useFlash();

  const main = useLoad<Row>(() => mapi(`/clients/${encodeURIComponent(id)}`), [id, s.businessToken]);
  // What they hold. If this part fails the profile still shows, with the reason in its place.
  const held = useLoad<Row>(() => mapi(`/clients/${encodeURIComponent(id)}/plans`), [id, s.businessToken]);
  const cl = main.data?.client as Row | undefined;
  const name = String(cl?.name ?? "");
  // Their conversations, open and done, asked for when the Messages tab is first opened.
  const talks = useLoad<Row[]>(async () => {
    if (tab !== "msgs" || !cl) return [];
    const [open, closed] = await Promise.all([mapi<Row>(`/inbox?filter=open&q=${encodeURIComponent(name)}`), mapi<Row>(`/inbox?filter=closed&q=${encodeURIComponent(name)}`)]);
    return [...((open.threads ?? []) as Row[]), ...((closed.threads ?? []) as Row[])].filter((t) => t.client_id === cl.id);
  }, [tab === "msgs", cl?.id, name]);

  const reload = () => { void main.reload(); void held.reload(); if (tab === "msgs") void talks.reload(); };
  useRefocus(reload);
  useEffect(() => { if (p.added) show("Client added."); /* said once, on arriving from the Add client form */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/business/clients"));

  if (!cl) {
    return (
      <View style={{ flex: 1, backgroundColor: sand, paddingTop: insets.top + 14, paddingHorizontal: pad }}>
        <Line between><IconButton icon="back" label="Back" onPress={back} /></Line>
        <View style={{ marginTop: 16 }}>
          {main.loading || !s.ready ? <Loading label="Loading the client" /> : <Failed error={main.error || "Client not found."} onRetry={() => { void main.reload(); }} />}
        </View>
      </View>
    );
  }

  const visits = (main.data?.visits ?? []) as Row[];
  const tags = (cl.tags ?? []) as string[];
  const plans = (held.data?.plans ?? []) as Row[], loyalty = (held.data?.loyalty ?? null) as Row | null, points = Number(held.data?.points ?? 0);
  const consent = Object.entries((cl.consent ?? {}) as Record<string, unknown>).filter(([, v]) => v !== null && v !== "");
  const isAhead = (v: Row) => Date.parse(v.starts_at) > clockNow && (v.status === "requested" || v.status === "confirmed");
  const ahead = visits.filter(isAhead).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const past = visits.filter((v) => !isAhead(v));
  const off = (pl: Row) => [pl.service_discount_pct > 0 ? `${pl.service_discount_pct}% off services` : "", pl.retail_discount_pct > 0 ? `${pl.retail_discount_pct}% off retail` : ""].filter(Boolean).join(", ");

  const call = () => { void Linking.openURL(`tel:${String(cl.phone).replace(/[^\d+]/g, "")}`).catch(() => show("This device cannot place calls.", "bad")); };
  const mail = () => { void Linking.openURL(`mailto:${cl.email}`).catch(() => show("No mail app is set up on this device.", "bad")); };
  const message = () => router.push(`/m/thread/new?client=${cl.id}` as never);

  const visitRow = (v: Row, last: boolean) => {
    const upcoming = isAhead(v), gone = String(v.status).startsWith("cancelled") || v.status === "no_show" || v.status === "rescheduled";
    return (
      <Pressable key={v.id} accessibilityRole="button" onPress={() => router.push(`/m/booking/${v.id}` as never)}
        style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingVertical: 12, alignItems: "center", borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: upcoming ? c.gold : gone ? "#C9BCB0" : c.photo, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: f.bold, fontSize: 15, lineHeight: 17, color: upcoming ? c.ink : "#F4ECE3" }}>{dayMonthOf(v.starts_at, tz).split(" ")[0]}</Text>
          <Text style={{ fontFamily: f.semi, fontSize: 11, lineHeight: 13, color: upcoming ? c.ink : "rgba(255,255,255,.75)", textTransform: "uppercase" }}>{dayMonthOf(v.starts_at, tz).split(" ")[1]}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 19, color: c.ink }}>{v.services ?? "Visit"}</Text>
          <Text numberOfLines={2} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>
            {[upcoming ? `${dateMed(v.starts_at, tz)} · ${clock(v.starts_at, tz)}` : dateMed(v.starts_at, tz), `${money(v.total_cents, cur)}${Number(v.tip_cents) > 0 ? ` + ${money(v.tip_cents, cur)} tip` : ""}`, v.staff, upcoming ? "" : STATUS_LABEL[v.status] ?? v.status].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {upcoming ? <Tag tone="gold" style={{ alignSelf: "center" }}>{v.status === "requested" ? "Requested" : "Upcoming"}</Tag> : null}
      </Pressable>
    );
  };

  const group = (text: string) => <Text style={{ fontFamily: f.semi, fontSize: 12, letterSpacing: 0.9, textTransform: "uppercase", color: c.muted, marginTop: 16, marginBottom: 8 }}>{text}</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: sand }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: pad, paddingBottom: Math.max(insets.bottom, 16) + 24 }}
        refreshControl={<RefreshControl refreshing={main.refreshing} onRefresh={() => { void main.refresh(); void held.reload(); if (tab === "msgs") void talks.reload(); }} tintColor={c.wine} />}>
        <Line between>
          <IconButton icon="back" label="Back" onPress={back} />
          <Line gap={8}>
            <IconButton icon="chat" label={`Message ${name}`} onPress={message} />
            <RoundBtn icon="dots" label="More" onPress={() => setMenu(true)} />
          </Line>
        </Line>

        <Line gap={14} style={{ marginTop: 14, alignItems: "flex-start" }}>
          <Face name={name} tone={toneOf(name)} size={64} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Serif size={28}>{name}</Serif>
            <T size={13} muted style={{ marginTop: 4 }}>Client since {monthYear(cl.created_at, tz)}{cl.last_visit ? ` · last visit ${dateMed(cl.last_visit, tz)}` : ""}</T>
            {cl.phone || cl.email ? (
              <View style={{ marginTop: 2 }}>
                {cl.phone ? <Pressable accessibilityRole="link" accessibilityLabel={`Call ${cl.phone}`} onPress={call} hitSlop={{ top: 6, bottom: 6 }} style={{ minHeight: 26, justifyContent: "center" }}><T size={13} weight="semi" color={c.wine} selectable>{cl.phone}</T></Pressable> : null}
                {cl.email ? <Pressable accessibilityRole="link" accessibilityLabel={`Email ${cl.email}`} onPress={mail} hitSlop={{ top: 6, bottom: 6 }} style={{ minHeight: 26, justifyContent: "center" }}><T size={13} weight="semi" color={c.wine} numberOfLines={1}>{cl.email}</T></Pressable> : null}
              </View>
            ) : <T size={13} muted>No phone or email on file.</T>}
            {tags.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {tags.map((t) => <Tag key={t} tone={tagTone(t)}>{tagText(t)}</Tag>)}
              </View>
            ) : null}
          </View>
        </Line>

        {flash ? <View style={{ marginTop: 14 }}><Note kind={flash.kind}>{flash.text}</Note></View> : null}
        {main.error ? <View style={{ marginTop: 14 }}><Note kind="bad">{main.error} Showing what was loaded before.</Note></View> : null}
        {cl.blocked ? <View style={{ marginTop: 14 }}><Note kind="bad">This phone number is on the blocked list, so it cannot book online.</Note></View> : null}

        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          {([[String(cl.visits ?? 0), "Visits"], [money(cl.spent_cents, cur), "Spent"], [money(cl.tips_cents, cur), "Tips"], [String(cl.no_show_count ?? 0), "No-shows"]] as [string, string][]).map(([value, label]) => (
            <View key={label} accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 4, alignItems: "center" }}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: f.bold, fontSize: 17, lineHeight: 22, color: c.ink }}>{value}</Text>
              <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 11, lineHeight: 14, letterSpacing: 0.4, textTransform: "uppercase", color: c.muted }}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Btn small style={{ flex: 1, minHeight: 44, paddingHorizontal: 8 }} onPress={() => router.push(`/m/new-booking?client=${cl.id}` as never)}>Book</Btn>
          {cl.phone
            ? <Btn small kind="out" style={{ flex: 1, minHeight: 44, paddingHorizontal: 8 }} onPress={call}>Call</Btn>
            : <Btn small kind="out" style={{ flex: 1, minHeight: 44, paddingHorizontal: 8 }} onPress={message}>Message</Btn>}
          <Btn small kind="out" style={{ flex: 1, minHeight: 44, paddingHorizontal: 8 }} onPress={() => { setTab("notes"); setEdit("notes"); }}>{cl.notes ? "Edit note" : "Add note"}</Btn>
        </View>

        <View style={{ marginTop: 16 }}>
          <Tabs options={[["notes", "Notes"], ["visits", "Visits"], ["msgs", "Messages"]]} value={tab} onChange={setTab} />
        </View>

        {tab === "notes" ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Formula and preferences. Edit" onPress={() => setEdit("notes")} style={({ pressed }) => ({ marginTop: 12, backgroundColor: "#FFF9E8", borderWidth: 1, borderColor: "#F0E2B8", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, opacity: pressed ? 0.85 : 1 })}>
              <T size={13} weight="bold">Formula and preferences</T>
              {cl.notes ? <T size={13} style={{ lineHeight: 20 }}>{cl.notes}</T> : <T size={13} muted style={{ lineHeight: 20 }}>Nothing noted yet. Press to add their formula, allergies and how they like it done.</T>}
              <T size={12} muted style={{ marginTop: 6 }}>Private to your business · press to edit</T>
            </Pressable>

            <Pressable accessibilityRole="button" accessibilityLabel="Tags. Edit" onPress={() => setEdit("tags")} style={({ pressed }) => ({ marginTop: 8, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, opacity: pressed ? 0.85 : 1 })}>
              <T size={13} weight="bold">Tags</T>
              {tags.length ? <T size={13} style={{ lineHeight: 20 }}>{tags.map(tagText).join(", ")}</T> : <T size={13} muted style={{ lineHeight: 20 }}>No tags yet. Press to add some, like vip or waitlist.</T>}
            </Pressable>

            {consent.length ? (
              <View style={{ marginTop: 8, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
                <T size={13} weight="bold">Consent on file</T>
                <T size={13} style={{ lineHeight: 20 }}>{consent.map(([k, v]) => `${cap(k.replace(/_/g, " "))}: ${v === true ? "yes" : v === false ? "no" : String(v)}`).join(". ")}.</T>
              </View>
            ) : null}

            {held.error && !held.data ? (
              <>{group("Packages and memberships")}<Failed error={held.error} onRetry={() => { void held.reload(); }} /></>
            ) : null}

            {loyalty?.enabled && points > 0 ? (
              <>
                {group("Loyalty")}
                <Card style={{ padding: 16 }}>
                  <T weight="semi">{points.toLocaleString("en-US")} loyalty {points === 1 ? "point" : "points"}</T>
                  <T size={13} muted>Worth {money(points * Number(loyalty.point_value_cents ?? 0), cur)} off. {points >= Number(loyalty.min_redeem ?? 0) ? "They can spend them at checkout." : `They can spend them from ${loyalty.min_redeem} points.`}</T>
                </Card>
              </>
            ) : null}

            {plans.length ? (
              <>
                {group("Packages and memberships")}
                <Card style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
                  {plans.map((pl, i) => {
                    const live = pl.status === "active" || pl.status === "past_due", expired = !!pl.expires_at && Date.parse(pl.expires_at) < clockNow;
                    const [label, tone] = pl.status === "active" && pl.kind === "membership" ? (["Member", "ok"] as [string, Tone]) : PLAN[pl.status] ?? [cap(String(pl.status)), "grey"];
                    return (
                      <View key={pl.id} style={{ paddingVertical: 12, borderBottomWidth: i === plans.length - 1 ? 0 : 1, borderBottomColor: c.line, gap: 2 }}>
                        <Line between gap={8}><T size={14} weight="semi" style={{ flex: 1 }}>{pl.name}</T><Tag tone={tone} style={{ alignSelf: "center" }}>{label}</Tag></Line>
                        <T size={12} muted>
                          {[pl.kind === "membership" ? `Membership · ${money(pl.price_cents, cur)} a month` : `Package · ${money(pl.price_cents, cur)}`, pl.kind === "membership" ? off(pl) : "",
                            pl.kind === "membership" ? (pl.renews_on ? `${pl.status === "cancelled" ? "would have renewed" : "renews"} ${dateOnly(pl.renews_on)}` : "") : pl.expires_at ? `${expired ? "ran out" : "use by"} ${dateOnly(pl.expires_at)}` : ""].filter(Boolean).join(" · ")}
                        </T>
                        {pl.kind === "membership" && live ? <T size={12} muted>{pl.card_on_file ? "Card on file · renews automatically" : "No card on file · collect at the desk"}</T> : null}
                        {pl.status === "past_due" ? <T size={12} color={c.bad}>{pl.charge_problem ? `The last renewal was declined: ${pl.charge_problem}` : "The renewal is owed. Collect it at checkout."}</T> : null}
                        {((pl.credits ?? []) as Row[]).map((cr) => <T key={cr.id} size={12} muted>{cr.service}: {cr.left} of {cr.total} left{cr.left > 0 && !cr.usable && live ? " (cannot be used now)" : ""}</T>)}
                      </View>
                    );
                  })}
                </Card>
              </>
            ) : null}

            <T size={12} muted style={{ marginTop: 16 }}>
              {[`Marketing messages ${cl.marketing_opt_in ? "on" : "off"}`, `prefers ${channelLabel(String(cl.preferred_channel))}`, cl.birthday ? `birthday ${dayMonthOf(String(cl.birthday).slice(0, 10) + "T12:00:00Z", "UTC")}` : ""].filter(Boolean).join(" · ")}.
            </T>
          </>
        ) : null}

        {tab === "visits" ? (
          visits.length ? (
            <>
              {ahead.length ? <>{group("Coming up")}<Card style={{ paddingVertical: 4, paddingHorizontal: 16 }}>{ahead.map((v, i) => visitRow(v, i === ahead.length - 1))}</Card></> : null}
              {past.length ? <>{ahead.length ? group("Past") : <View style={{ height: 12 }} />}<Card style={{ paddingVertical: 4, paddingHorizontal: 16 }}>{past.map((v, i) => visitRow(v, i === past.length - 1))}</Card></> : null}
              {visits.length >= 12 ? <T size={12} muted center style={{ marginTop: 10 }}>These are the 12 most recent.</T> : null}
            </>
          ) : (
            <View style={{ marginTop: 12 }}><Empty title="No visits yet" action={<Btn small onPress={() => router.push(`/m/new-booking?client=${cl.id}` as never)}>Book {name.split(/\s+/)[0]}</Btn>}>Their bookings show here once they have one, with what they paid and who looked after them.</Empty></View>
          )
        ) : null}

        {tab === "msgs" ? (
          <View style={{ marginTop: 12, gap: 10 }}>
            {talks.loading && !talks.data?.length ? <Loading label="Loading conversations" />
              : talks.error ? <Failed error={talks.error} onRetry={() => { void talks.reload(); }} />
              : (talks.data ?? []).length ? (
                <Card style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
                  {(talks.data ?? []).map((t, i, all) => (
                    <Pressable key={t.id} accessibilityRole="button" onPress={() => router.push(`/m/thread/${t.id}` as never)}
                      style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingVertical: 12, alignItems: "flex-start", borderBottomWidth: i === all.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
                      <Face name={name} tone={toneOf(name)} size={40} badge={<ChannelBadge channel={String(t.channel)} />} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Line between gap={8}><T size={14} weight="semi">{channelLabel(String(t.channel))}{t.status === "closed" ? " · done" : ""}</T><T size={12} muted>{stampShort(t.last_message_at, tz)}</T></Line>
                        <T size={13} muted numberOfLines={2} color={Number(t.unread_business) > 0 ? c.ink : undefined}>{t.last_preview || "No messages yet"}</T>
                      </View>
                      {Number(t.unread_business) > 0 ? <View accessibilityLabel="Unread" style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.wine, marginTop: 6 }} /> : null}
                    </Pressable>
                  ))}
                </Card>
              ) : <Empty title="No conversations yet">When {name.split(/\s+/)[0]} writes to you, or you write to them, it shows here.</Empty>}
            <Btn kind="out" small style={{ minHeight: 44, alignSelf: "flex-start" }} onPress={message}>New message</Btn>
          </View>
        ) : null}
      </ScrollView>

      <Sheet open={menu} onClose={() => setMenu(false)} title={name}>
        <Choice title="Edit details" sub="Name, phone and email" onPress={() => { setMenu(false); setEdit("details"); }} />
        <Choice title="Edit tags" sub={tags.length ? tags.map(tagText).join(", ") : "None yet"} onPress={() => { setMenu(false); setEdit("tags"); }} />
        <Choice title="Send a message" sub="Starts a conversation in your Inbox, or adds to the one already there" onPress={() => { setMenu(false); message(); }} />
        {cl.phone ? <Choice title="Call" sub={String(cl.phone)} onPress={() => { setMenu(false); call(); }} /> : null}
        {cl.email ? <Choice title="Email" sub={String(cl.email)} onPress={() => { setMenu(false); mail(); }} /> : null}
      </Sheet>

      <ClientSheet open={!!edit} mode={edit ?? "details"} client={cl} onClose={() => setEdit(null)} onSaved={(_, message) => { setEdit(null); show(message); void main.reload(); }} />
    </View>
  );
}
