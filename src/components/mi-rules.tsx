// A screen of on/off rules kept under GET /v1/m/settings → rules. Each switch saves as it is pressed
// (PUT /v1/m/settings/rules with just that rule), and the API's answer becomes the new truth.
import { useState, type ReactNode } from "react";
import { Grp, SetRow, Sw } from "@/components/mc-kit";
import { Gate, Page, backTo } from "@/components/mi-kit";
import { Card } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { DENIED, orDenied, signedIn } from "@/lib/mc-util";
import { type Flash } from "@/lib/mi-util";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";

export type RuleRow = { key: string; title: string; sub: string; on?: string; off?: string };
const back = backTo("/m/settings");

export function RulesScreen({ title, what, group, heading, rows, lead, before, after }: {
  title: string; what: string; group: "booking" | "notify" | "policy"; heading: string; rows: RuleRow[]; lead?: string;
  before?: (settings: Data) => ReactNode; after?: (settings: Data) => ReactNode;
}) {
  const s = useSession();
  const { data, error, reload, refresh, refreshing, setData } = useLoad(signedIn(s, () => orDenied(() => s.mapi<Data>("/settings"))), [s.businessToken]);
  const [busy, setBusy] = useState(""), [note, setNote] = useState<Flash>(null);

  if (!data || data === DENIED) return <Gate title={title} onBack={back} denied={data === DENIED} what={what} error={error} onRetry={reload} />;

  const values = ((data.rules ?? {}) as Record<string, Data>)[group] ?? {};
  const flip = async (r: RuleRow) => {
    const now = !values[r.key];
    setBusy(r.key); setNote(null);
    try {
      const out = await s.mapi<Data>("/settings/rules", { method: "PUT", body: { [group]: { [r.key]: now } } });
      setData((d) => (d && d !== DENIED ? { ...d, rules: out.rules ?? d.rules } : d));
      const said = now ? r.on : r.off;
      if (said) setNote({ kind: "ok", text: said });
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    }
    setBusy("");
  };

  return (
    <Page title={title} onBack={back} note={note} lead={lead} onRefresh={refresh} refreshing={refreshing}>
      {before?.(data)}
      <Grp>{heading}</Grp>
      <Card>
        {rows.map((r, i) => (
          <SetRow key={r.key} last={i === rows.length - 1} title={r.title} sub={r.sub} right={<Sw on={!!values[r.key]} disabled={busy === r.key} label={r.title} onPress={() => flip(r)} />} />
        ))}
      </Card>
      {after?.(data)}
    </Page>
  );
}
