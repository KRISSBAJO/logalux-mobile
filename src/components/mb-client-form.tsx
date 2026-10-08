// The sheet that adds a client or changes one. The API replaces the whole client on a save,
// so whatever part is being edited, everything else the client already has is sent back unchanged.
import { useEffect, useState } from "react";
import { Btn, Field, Note } from "./ui";
import { Sheet } from "./mb-ui";
import type { Row } from "@/lib/api";
import { useMapi } from "@/lib/mb-hooks";

export type ClientFormMode = "new" | "details" | "notes" | "tags";

const TITLE: Record<ClientFormMode, [string, string]> = {
  new: ["New client", "Anyone who books online is added for you. Add the people who call or walk in."],
  details: ["Edit details", "Their name and how you reach them."],
  notes: ["Formula and preferences", "Private to your business. The client never sees it."],
  tags: ["Tags", "Short labels you sort clients by."],
};

const splitTags = (v: string) => [...new Set(v.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

export function ClientSheet({ open, mode, client, onClose, onSaved }: { open: boolean; mode: ClientFormMode; client?: Row | null; onClose: () => void; onSaved: (id: string, message: string) => void }) {
  const mapi = useMapi();
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [email, setEmail] = useState(""), [tags, setTags] = useState(""), [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");

  // Start from what the client has each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setName(String(client?.name ?? "")); setPhone(String(client?.phone ?? "")); setEmail(String(client?.email ?? ""));
    setTags(((client?.tags ?? []) as string[]).join(", ")); setNotes(String(client?.notes ?? ""));
    setError(""); setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, client?.id]);

  const save = async () => {
    setError("");
    if (!name.trim()) { setError("The client needs a name."); return; }
    if (mode === "new" && !phone.trim() && !email.trim()) { setError("Add a phone number or an email so you can reach them."); return; }
    const list = splitTags(tags);
    if (list.length > 10) { setError("Keep it to 10 tags."); return; }
    if (notes.length > 4000) { setError("Keep the notes under 4,000 characters."); return; }
    const body = {
      name: name.trim(), phone: phone.trim(), email: email.trim(), notes, tags: list,
      birthday: client?.birthday ? String(client.birthday).slice(0, 10) : "",
      preferred_channel: String(client?.preferred_channel ?? "whatsapp"),
      marketing_opt_in: client ? !!client.marketing_opt_in : true,
    };
    setBusy(true);
    try {
      if (client?.id) {
        await mapi(`/clients/${encodeURIComponent(client.id)}`, { method: "PUT", body });
        onSaved(String(client.id), mode === "notes" ? "Notes saved." : mode === "tags" ? "Tags saved." : "Client saved.");
      } else {
        const out = await mapi<Row>("/clients", { method: "POST", body });
        onSaved(String(out.id), "Client added.");
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const [title, sub] = TITLE[mode];
  const all = mode === "new";
  return (
    <Sheet open={open} onClose={onClose} title={title} sub={sub} footer={<Btn busy={busy} onPress={save}>{all ? "Add client" : "Save"}</Btn>}>
      {error ? <Note kind="bad">{error}</Note> : null}
      {all || mode === "details" ? (
        <>
          <Field label="Name" value={name} onChangeText={setName} maxLength={80} autoCapitalize="words" autoComplete="name" autoFocus={all} />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="+1 615 555 0144" hint="With the country code, like +234 or +1." />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
        </>
      ) : null}
      {all || mode === "tags" ? <Field label="Tags" value={tags} onChangeText={setTags} autoCapitalize="none" autoCorrect={false} placeholder="vip, waitlist" hint="Separate with commas. Up to 10. Use waitlist to put them in the Waitlist filter." autoFocus={mode === "tags"} /> : null}
      {all || mode === "notes" ? <Field label={all ? "Formula and preferences" : "Notes"} value={notes} onChangeText={setNotes} multiline maxLength={4000} placeholder="Colour formula, allergies, how they like it done" autoFocus={mode === "notes"} style={mode === "notes" ? { minHeight: 160 } : undefined} /> : null}
    </Sheet>
  );
}
