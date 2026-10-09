import { useFormReset } from "../../../lib/form-reset";
// Business details: the name, category, contact, time zone and about text (the web's "Business profile").
// One save: PUT /v1/m/settings/profile. The sales tax travels with it unchanged; it has its own screen.
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Choice, Grp } from "@/components/mc-kit";
import { Gate, Page, Pick, backTo } from "@/components/mi-kit";
import { Btn, Chip, Field, Label, Note, Row, T } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { DENIED, orDenied, signedIn } from "@/lib/mc-util";
import { CATEGORIES, fieldOf, nowIn, profileBody, timeZones, zoneName, type Flash } from "@/lib/mi-util";
import { useSession } from "@/lib/session";
import { c } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const WHERE: [RegExp, string][] = [[/business name/i, "name"], [/category/i, "category"], [/phone/i, "phone"], [/email/i, "email"], [/about/i, "about"], [/time zone/i, "timezone"]];
const back = backTo("/m/settings");

export default function BusinessDetails() {
  const s = useSession();
  const { data, error, reload, refresh } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/settings"))), [s.businessToken]);
  const [form, setForm] = useState<{ name: string; category: string; phone: string; email: string; about: string; timezone: string } | null>(null);
  const [zoneOpen, setZoneOpen] = useState(false), [find, setFind] = useState("");
  const [saving, setSaving] = useState(false), [note, setNote] = useState<Flash>(null), [bad, setBad] = useState<{ key: string; text: string } | null>(null);

  const b = data && data !== DENIED ? (data.business as Data) : null;
  useFormReset([data], () => {
    if (b) setForm({ name: String(b.name ?? ""), category: String(b.category ?? ""), phone: String(b.phone ?? ""), email: String(b.email ?? ""), about: String(b.about ?? ""), timezone: String(b.timezone ?? "") });
     
  });

  const zones = useMemo(() => timeZones(String(b?.timezone ?? "")), [b?.timezone]);
  const shownZones = useMemo(() => {
    const t = find.trim().toLowerCase().replace(/\s+/g, "_");
    return (t ? zones.filter((z) => z.toLowerCase().includes(t)) : zones).slice(0, 30);
  }, [zones, find]);

  if (!b || !form) return <Gate title="Business details" onBack={back} denied={data === DENIED} what="The business's name, contact details and time zone are set by a manager or the owner." error={error} onRetry={reload} />;

  const set = (change: Partial<typeof form>) => { setForm({ ...form, ...change }); if (bad) { setBad(null); setNote(null); } };
  const err = (key: string) => (bad?.key === key ? bad.text : undefined);
  const changed = form.name !== String(b.name ?? "") || form.category !== b.category || form.phone !== String(b.phone ?? "") || form.email !== String(b.email ?? "") || form.about !== String(b.about ?? "") || form.timezone !== b.timezone;

  const save = async () => {
    setSaving(true); setNote(null); setBad(null);
    try {
      await s.mapi("/settings/profile", { method: "PUT", body: profileBody(b, { name: form.name.trim(), category: form.category, phone: form.phone.trim(), email: form.email.trim(), about: form.about, timezone: form.timezone }) });
      await Promise.all([refresh(), s.refresh()]);
      setNote({ kind: "ok", text: "Business profile saved." });
    } catch (e) {
      const text = (e as Error).message, key = fieldOf(text, WHERE);
      if (key) setBad({ key, text }); else setNote({ kind: "bad", text });
      if (key) setNote({ kind: "bad", text: "Not saved. Check the field marked below." });
    }
    setSaving(false);
  };

  return (
    <Page title="Business details" onBack={back}
      footer={(
        <View style={{ gap: 10 }}>
          {/* The form is longer than the screen, so what happened is said beside the button that did it. */}
          {note ? <Note kind={note.kind}>{note.text}</Note> : null}
          <Btn busy={saving} disabled={!changed} onPress={save}>Save details</Btn>
        </View>
      )}>
      <Grp>Name and category</Grp>
      <View style={{ gap: 14 }}>
        <Field label="Business name" value={form.name} onChangeText={(name) => set({ name })} maxLength={80} autoCapitalize="words" error={err("name")} />
        <View style={{ gap: 6 }}>
          <Label>Primary category</Label>
          <Row gap={8} wrap>{CATEGORIES.map(([k, n]) => <Chip key={k} on={form.category === k} onPress={() => set({ category: k })}>{n}</Chip>)}</Row>
          {err("category") ? <T size={13} color={c.bad}>{err("category")}</T> : null}
        </View>
      </View>

      <Grp style={{ marginTop: 24 }}>Contact</Grp>
      <View style={{ gap: 14 }}>
        <Field label="Business phone" value={form.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" autoComplete="tel" maxLength={24} placeholder={b.market === "NG" ? "+234 803 123 4567" : "+1 615 555 0144"} hint="With the country code." error={err("phone")} />
        <Field label="Email" value={form.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={120} placeholder="hello@yourbusiness.com" hint="Alerts about bookings and stock are sent here." error={err("email")} />
      </View>

      <Grp style={{ marginTop: 24 }}>Where the clock is set</Grp>
      <Pick label="Time zone" value={`${zoneName(form.timezone)}${nowIn(form.timezone) ? ` · ${nowIn(form.timezone)} now` : ""}`} open={zoneOpen} onToggle={() => setZoneOpen(!zoneOpen)} error={err("timezone")} hint="Changing the time zone changes it for every location.">
        <Field label="Find a time zone" value={find} onChangeText={setFind} autoCapitalize="none" autoCorrect={false} placeholder="Chicago, Lagos, New York" />
        {shownZones.map((z) => <Choice key={z} title={zoneName(z)} sub={nowIn(z) ? `${nowIn(z)} now` : undefined} on={z === form.timezone} onPress={() => { set({ timezone: z }); setZoneOpen(false); setFind(""); }} />)}
        {!shownZones.length ? <T muted size={13}>No time zone matches that. Try the nearest big city.</T> : shownZones.length === 30 ? <T muted size={13}>Type a city to narrow the list.</T> : null}
      </Pick>

      <Grp style={{ marginTop: 24 }}>On your booking page</Grp>
      <Field label="About" value={form.about} onChangeText={(about) => set({ about })} multiline maxLength={2000} placeholder="Who you are and what you do best, in a few sentences." hint={`${form.about.length} of 2,000 characters.`} error={err("about")} />
    </Page>
  );
}
