// Sign-ins & roles: who can sign in to this business, when they last did, and what each role may open
// (the web's Settings, "Team & permissions"). Invites, role changes and removals are the owner's, done on a person's page.
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { AskManager, Grp, Header, Tag, Wait } from "@/components/mc-kit";
import { AskCard, Face } from "@/components/me-kit";
import { Avatar, Card, Failed, Icon, Screen, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { plural, when } from "@/lib/format";
import { DENIED, orDenied, signedIn } from "@/lib/mc-util";
import { toneOf } from "@/lib/mb-util";
import { ROLE, ROLE_CAN, atLeast, isRenter } from "@/lib/me-staff";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";
import { useRefocus } from "@/lib/mb-hooks";

export default function Logins() {
  const s = useSession();
  const m = s.merchant, tz = m?.timezone as string | undefined;
  const owner = atLeast(m, "owner");
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(async () => {
    if (!atLeast(m, "manager")) return DENIED;
    const [settings, team] = await Promise.all([s.mapi<Data>("/settings"), s.mapi<Data>("/staff")]);
    return { logins: (settings.logins ?? []) as Data[], business: String((settings.business as Data | undefined)?.name ?? m?.business ?? ""), staff: (team.staff ?? []) as Data[] };
  })), [s.businessToken, m?.business_id]);
  useRefocus(() => { void refresh(); });

  if (!data || data === DENIED) {
    return (
      <Screen>
        <Header title="Sign-ins & roles" />
        {data === DENIED ? <AskManager what="Who can sign in to the business is for a manager or the owner to see." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const { logins, staff } = data;
  const personOf = (l: Data) => staff.find((p) => String(p.login_email ?? "").toLowerCase() === String(l.email).toLowerCase());
  const without = staff.filter((p) => !p.archived && !isRenter(p) && !p.login_email);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Sign-ins & roles" />
      <T size={13} muted style={{ marginTop: 12 }}>{plural(logins.length, "person", "people")} can sign in to {data.business}. {owner ? "To give someone a sign-in, open them below and invite them." : "Only the owner can invite people or remove a sign-in."}</T>

      <Grp>Can sign in · {logins.length}</Grp>
      <Card>
        {logins.map((l, i) => {
          const p = personOf(l);
          return (
            <Pressable key={l.id} accessibilityRole={p ? "button" : undefined} accessibilityLabel={`${l.name}, ${ROLE[String(l.role)] ?? l.role}, ${l.email}`} disabled={!p} onPress={() => p && router.push(`/m/staff/${p.id}` as never)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 68, borderBottomWidth: i === logins.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
              {p ? <Face p={p} size={40} /> : <Avatar name={String(l.name)} tone={toneOf(String(l.name))} size={40} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{String(l.name)}{l.id === m?.id ? " · you" : ""}</Text>
                  <Tag kind={l.role === "owner" ? "gold" : "grey"}>{ROLE[String(l.role)] ?? String(l.role)}</Tag>
                </View>
                <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{String(l.email)}</Text>
                <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{l.last_login_at ? `Last signed in ${when(String(l.last_login_at), tz)}` : "Has not signed in yet"}</Text>
              </View>
              {p ? <Icon name="next" size={16} color={c.muted2} /> : null}
            </Pressable>
          );
        })}
      </Card>

      {without.length ? (
        <>
          <Grp>On the roster without a sign-in · {without.length}</Grp>
          <Card>
            {without.map((p, i) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.name}. ${owner ? "Invite to sign in" : "Open"}`} onPress={() => router.push(`/m/staff/${p.id}${owner ? "?open=invite" : ""}` as never)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 60, borderBottomWidth: i === without.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
                <Face p={p} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{String(p.name)}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{ROLE[String(p.role)] ?? String(p.role)} · {p.email ? String(p.email) : "no email on file"}</Text>
                </View>
                {owner ? <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>Invite</Text> : null}
                <Icon name="next" size={16} color={c.muted2} />
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
      {!owner ? <View style={{ marginTop: 12 }}><AskCard title="Ask the owner">Only the owner can invite people, change what a sign-in can open, or remove one.</AskCard></View> : null}

      <Grp>Roles</Grp>
      <Card>
        {ROLE_CAN.map(([key, name, can], i) => (
          <View key={key} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: i === ROLE_CAN.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{name}</Text>
              <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{can}</Text>
            </View>
            <Text style={{ fontFamily: f.serifBold, fontSize: 20, color: c.ink }}>{logins.filter((l) => l.role === key).length}</Text>
          </View>
        ))}
      </Card>
      <T size={12} muted style={{ marginTop: 8 }}>A sign-in&apos;s role is chosen when the person is invited. A team member&apos;s three permissions (other calendars, payments, reports) are switched on their own page.</T>
    </Screen>
  );
}
