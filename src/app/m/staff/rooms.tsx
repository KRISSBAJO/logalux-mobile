// Rooms, chairs and stations: what a service needs besides a person. A time is only offered to a client
// when the person is free and everything the service requires is free too. Everyone can read the list;
// a manager or the owner adds, changes and removes, and chooses which services need each one.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Grp, Header, Sheet, SmallBtn, Stepper, Wait } from "@/components/mc-kit";
import { MeIcon, Tick } from "@/components/me-kit";
import { Btn, Card, Chip, Empty, Failed, Field, Icon, Label, Note, Row, Screen, T } from "@/components/ui";
import type { Row as Data } from "@/lib/api";
import { plural } from "@/lib/format";
import { ask, signedIn } from "@/lib/mc-util";
import { atLeast } from "@/lib/me-staff";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Form = { id: string; name: string; qty: number; services: string[] };

export default function Rooms() {
  const s = useSession();
  const manager = atLeast(s.merchant, "manager");
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, async () => {
    const [menu, sv] = await Promise.all([s.mapi<Data>("/menu"), s.mapi<Data>("/services")]);
    return { resources: (menu.resources ?? []) as Data[], services: ((sv.services ?? []) as Data[]).filter((x) => !x.archived) };
  }), [s.businessToken, s.merchant?.business_id]);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(""), [formError, setFormError] = useState("");

  if (!data) {
    return (
      <Screen>
        <Header title="Rooms & chairs" />
        {error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const { resources, services } = data;
  const nameOf = new Map(services.map((x) => [String(x.id), String(x.name)]));
  const usedBy = (re: Data) => ((re.service_ids ?? []) as string[]).map((id) => nameOf.get(id)).filter(Boolean) as string[];
  const open = (re?: Data) => { setFormError(""); setForm(re ? { id: String(re.id), name: String(re.name), qty: Number(re.qty), services: ((re.service_ids ?? []) as string[]).filter((id) => nameOf.has(id)) } : { id: "", name: "", qty: 1, services: [] }); };
  const set = (change: Partial<Form>) => setForm((x) => (x ? { ...x, ...change } : x));

  const save = async () => {
    if (!form) return;
    if (form.name.trim().length < 2) { setFormError("Give it a name, like Treatment room."); return; }
    setBusy("save"); setFormError(""); setNote(null);
    try {
      const body = { name: form.name.trim(), qty: form.qty, service_ids: form.services };
      if (form.id) await s.mapi(`/resources/${form.id}`, { method: "PUT", body });
      else await s.mapi("/resources", { body });
      setNote({ kind: "ok", text: form.id ? "Saved." : form.services.length ? "Added. Those services now wait for it to be free." : "Added. Choose the services that need it, or it limits nothing." });
      setForm(null);
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
    }
    setBusy("");
  };
  const remove = async () => {
    if (!form?.id) return;
    const re = resources.find((x) => x.id === form.id), used = re ? usedBy(re).length : 0;
    if (!(await ask(`Remove ${form.name}?`, used ? `${plural(used, "service")} will stop waiting for it.` : "No service requires it.", "Remove", true))) return;
    setBusy("remove"); setFormError("");
    try {
      await s.mapi(`/resources/${form.id}`, { method: "DELETE" });
      setNote({ kind: "ok", text: "Removed. Services that needed it no longer wait for it." });
      setForm(null);
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
    }
    setBusy("");
  };

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Rooms & chairs" right={manager ? <SmallBtn kind="ink" icon="plus" onPress={() => open()}>Add</SmallBtn> : undefined} />
      <T size={13} muted style={{ marginTop: 12 }}>Some services need more than a person: a braiding chair, a wash station, a treatment room. List what you have and how many. A time is only offered when the person and everything the service requires are free.</T>
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {!manager ? <View style={{ marginTop: 12 }}><Note kind="gold">You can read the list here. A manager or the owner changes it.</Note></View> : null}

      <Grp>What you have · {resources.length}</Grp>
      {resources.length ? (
        <Card>
          {resources.map((re, i) => {
            const used = usedBy(re);
            return (
              <Pressable key={re.id} accessibilityRole={manager ? "button" : undefined} accessibilityLabel={`${re.name}, ${re.qty}. ${used.length ? `Required by ${used.join(", ")}` : "No service requires it yet"}${manager ? ". Change" : ""}`} disabled={!manager} onPress={() => open(re)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 64, borderBottomWidth: i === resources.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#F4ECE2", alignItems: "center", justifyContent: "center" }}><MeIcon name={/room|suite|cabin/i.test(String(re.name)) ? "door" : "chair"} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{String(re.name)}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: used.length ? c.muted : c.goldInk }}>{used.length ? `Required by ${used.join(", ")}` : "No service requires it yet, so it limits nothing"}</Text>
                </View>
                <Text style={{ fontFamily: f.serifBold, fontSize: 20, color: c.ink }}>× {Number(re.qty)}</Text>
                {manager ? <Icon name="next" size={16} color={c.muted2} /> : null}
              </Pressable>
            );
          })}
        </Card>
      ) : <Empty title="Nothing listed yet" action={manager ? <Btn small onPress={() => open()} style={{ marginTop: 4 }}>Add a room, chair or station</Btn> : undefined}>Without any, a time is offered whenever the person is free.</Empty>}

      <Sheet tall open={!!form} onClose={() => setForm(null)} title={form?.id ? "Change it" : "Add a room, chair or station"} footer={<Btn busy={busy === "save"} onPress={save}>{form?.id ? "Save" : "Add"}</Btn>}>
        {form ? (
          <>
            {formError ? <Note kind="bad">{formError}</Note> : null}
            <Field label="Name" value={form.name} onChangeText={(name) => set({ name })} maxLength={60} placeholder="Treatment room" autoFocus={!form.id} />
            <Card style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
              <Row>
                <View style={{ flex: 1 }}>
                  <T size={14} weight="semi">How many you have</T>
                  <T size={12} muted>That many clients can use it at once</T>
                </View>
                <Stepper value={String(form.qty)} lessLabel="One fewer" moreLabel="One more" onLess={() => set({ qty: Math.max(1, form.qty - 1) })} onMore={() => set({ qty: Math.min(50, form.qty + 1) })} />
              </Row>
            </Card>
            <View style={{ gap: 6 }}>
              <Label>Services that need it</Label>
              {services.length ? (
                <>
                  <Row gap={8}>
                    <Chip on={form.services.length === services.length} onPress={() => set({ services: services.map((x) => String(x.id)) })}>Every service</Chip>
                    <Chip on={!form.services.length} onPress={() => set({ services: [] })}>None</Chip>
                  </Row>
                  <Card style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
                    {services.map((sv, i) => {
                      const id = String(sv.id), on = form.services.includes(id);
                      return <View key={id} style={{ borderBottomWidth: i === services.length - 1 ? 0 : 1, borderBottomColor: c.line }}><Tick on={on} title={String(sv.name)} sub={String(sv.category)} onPress={() => set({ services: on ? form.services.filter((x) => x !== id) : [...form.services, id] })} /></View>;
                    })}
                  </Card>
                </>
              ) : <T size={13} muted>No services on the menu yet. Add them under Services and pricing, then choose which need this.</T>}
              <T size={12} muted>A ticked service is only offered when one of these is free for the whole visit.</T>
            </View>
            {form.id ? <Btn kind="danger" busy={busy === "remove"} onPress={remove}>Remove it</Btn> : null}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
