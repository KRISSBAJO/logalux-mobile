// Suppliers: who the business buys stock from. Products and purchase orders can name one.
// The API adds and removes a supplier; it has no route to change one (the web has none either).
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Header, Sheet, SmallBtn } from "@/components/mc-kit";
import { Blank, Fine, MfIcon, Said } from "@/components/mf-kit";
import { Avatar, Btn, Card, Empty, Field, Icon, Note, Row, Screen } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { plural } from "@/lib/format";
import { tel } from "@/lib/ma-format";
import { DENIED, ask, orDenied, signedIn } from "@/lib/mc-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const BLANK = { name: "", contact: "", phone: "", email: "" };

export default function Suppliers() {
  const s = useSession();
  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/inventory"))), [s.businessToken]);
  const [form, setForm] = useState<typeof BLANK | null>(null);
  const [formError, setFormError] = useState(""), [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const d = data && data !== DENIED ? data : null;
  if (!d) return <Blank title="Suppliers" error={error} onRetry={reload} denied={data === DENIED} what="Suppliers belong to a manager or the owner." />;
  const suppliers = (d.suppliers ?? []) as Data[];

  const add = async () => {
    if (!form) return;
    if (!form.name.trim()) { setFormError("The supplier needs a name."); return; }
    setBusy("add"); setFormError("");
    try {
      await s.mapi("/suppliers", { body: { name: form.name.trim(), contact: form.contact.trim(), email: form.email.trim(), phone: form.phone.trim() } });
      setForm(null);
      setNote({ kind: "ok", text: "Supplier added." });
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
    }
    setBusy("");
  };

  const remove = async (su: Data) => {
    if (!(await ask(`Remove ${su.name}?`, "Its products and past orders are kept, without a supplier.", "Remove", true))) return;
    setBusy(String(su.id)); setNote(null);
    try {
      await s.mapi(`/suppliers/${su.id}`, { method: "DELETE" });
      setNote({ kind: "ok", text: "Supplier removed. Its products are kept without a supplier." });
      await refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  const set = (change: Partial<typeof BLANK>) => setForm((x) => (x ? { ...x, ...change } : x));

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} footer={note ? <Said note={note} onClose={() => setNote(null)} /> : undefined}>
      <Header title="Suppliers" right={<SmallBtn kind="ink" icon="plus" onPress={() => { setForm(BLANK); setFormError(""); }}>Add</SmallBtn>} />
      <View style={{ marginTop: 16, gap: 10 }}>
        {suppliers.length ? suppliers.map((su) => (
          <Card key={su.id} style={{ padding: 16, gap: 12 }}>
            <Row gap={12} style={{ alignItems: "flex-start" }}>
              <Avatar name={String(su.name)} tone="#4A3426" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: f.semi, fontSize: 15, lineHeight: 21, color: c.ink }}>{su.name}</Text>
                <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.muted }}>{[su.contact, plural(Number(su.products), "product")].filter(Boolean).join(" · ")}</Text>
                {su.email ? <Text selectable style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.muted }}>{su.email}</Text> : null}
                {!su.contact && !su.phone && !su.email ? <Text style={{ fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.muted2 }}>No contact details</Text> : null}
              </View>
            </Row>
            <Row gap={8} wrap>
              {su.phone ? (
                <Pressable accessibilityRole="link" accessibilityLabel={`Call ${su.name} on ${su.phone}`} onPress={() => Linking.openURL(tel(String(su.phone))).catch(() => undefined)}
                  style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.line2, backgroundColor: c.white, flexDirection: "row", alignItems: "center", gap: 8, opacity: pressed ? 0.8 : 1 })}>
                  <Icon name="phone" size={16} />
                  <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.ink }}>{su.phone}</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${su.name}`} disabled={busy === su.id} onPress={() => remove(su)}
                style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: "#E9C7C3", backgroundColor: c.white, flexDirection: "row", alignItems: "center", gap: 8, opacity: busy === su.id ? 0.5 : pressed ? 0.8 : 1 })}>
                <MfIcon name="trash" size={16} color={c.bad} />
                <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.bad }}>Remove</Text>
              </Pressable>
            </Row>
          </Card>
        )) : (
          <Empty title="No suppliers yet" action={<Btn small onPress={() => { setForm(BLANK); setFormError(""); }} style={{ marginTop: 4 }}>Add a supplier</Btn>}>Add who you buy stock from, so products and purchase orders can name them.</Empty>
        )}
        {suppliers.length ? <Fine>To change a supplier&apos;s details, remove it and add it again. Its products are kept, and you can name the supplier on each product again.</Fine> : null}
      </View>

      <Sheet open={!!form} onClose={() => setForm(null)} title="Add a supplier" sub="Who you buy stock from." footer={<Btn busy={busy === "add"} onPress={add}>Add supplier</Btn>}>
        {form ? (
          <>
            {formError ? <Note kind="bad">{formError}</Note> : null}
            <Field label="Supplier name" value={form.name} onChangeText={(name) => set({ name })} maxLength={100} autoFocus />
            <Field label="Contact person" value={form.contact} onChangeText={(contact) => set({ contact })} maxLength={100} />
            <Field label="Phone" value={form.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" />
            <Field label="Email" value={form.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
