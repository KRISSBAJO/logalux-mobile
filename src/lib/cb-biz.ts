// Loads the business being booked and puts what the booking screens need from it in one shape.
import { api, type Row } from "@/lib/api";
import type { Biz, Place, Policy, Question, Service, Staff } from "@/lib/cb-lib";
import { useLoad } from "@/lib/use-load";

export type Loaded = { biz: Biz; live: boolean; services: Service[]; staff: Staff[]; intake: Question[]; showStaff: boolean };

export function useBiz(slug: string) {
  return useLoad<Loaded>(async () => {
    const j = await api<Row>(`/businesses/${encodeURIComponent(slug)}`);
    if (!["USD", "NGN"].includes(String(j.business?.currency))) throw new Error("This business has no supported pricing currency. Please try again later.");
    const b = j.business as Row;
    const locations = (j.locations ?? []) as (Place & { is_primary?: boolean })[];
    const place = locations.find((l) => l.is_primary) ?? locations[0] ?? {};
    const display = (j.display ?? {}) as Row;
    return {
      biz: { slug: String(b.slug), name: String(b.name), tone: String(b.tone ?? ""), logoId: (b.logo_id as string | null) ?? null, currency: String(b.currency), tz: String(b.timezone || "UTC"), market: String(b.market ?? ""), place, showAddress: display.show_address !== false, policy: (j.policy ?? {}) as Policy },
      live: b.status === "live",
      services: (j.services ?? []) as Service[],
      staff: (j.staff ?? []) as Staff[],
      intake: (j.intake ?? []) as Question[],
      showStaff: display.show_staff !== false,
    };
  }, [slug]);
}

/** The chosen services, in the order they were chosen, each once. */
export function chosenFrom(all: Service[], csv: string, multi: boolean) {
  const picked = csv.split(",").map((id) => all.find((x) => x.id === id.trim())).filter((x): x is Service => !!x);
  const once = picked.filter((x, i) => picked.indexOf(x) === i);
  return multi ? once : once.slice(0, 1);
}
