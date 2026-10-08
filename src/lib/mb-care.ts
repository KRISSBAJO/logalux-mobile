// The words for problems clients report about a visit, shared by the Inbox's Problems tab and the problem screen.
import type { Row } from "./api";
import type { Tone } from "./mb-util";

const ABOUT: Record<string, string> = {
  quality: "The result was not what was agreed", charged: "Charged the wrong amount", no_show: "The professional did not show up", conduct: "How the client was treated", other: "Something else",
};
export const aboutOf = (p: Row) => ABOUT[String(p.reason)] ?? String(p.reason ?? "A problem with the visit");

const STATE: Record<string, [string, Tone]> = {
  with_business: ["Waiting for your answer", "gold"], needs_decision: ["With LogaLuxe to decide", "new"], resolved: ["Decided", "ok"], out_of_scope: ["Closed", "grey"],
};
export const stateOf = (p: Row): [string, Tone] => STATE[String(p.status)] ?? [String(p.status ?? ""), "grey"];

export const OUTCOME: Record<string, string> = {
  full: "Full refund to the client", partial: "Part refund to the client", credit: "LogaLuxe credit to the client", decline: "Nothing returned to the client", out_of_scope: "Not something LogaLuxe decides",
};

export const isLate = (p: Row) => p.status === "with_business" && !!p.business_deadline && Date.parse(p.business_deadline) < Date.now();

/** "in 1 day 4 hours", "in 3 hours", "in 20 minutes": how long is left to answer. */
export function timeLeft(deadline: string): string {
  const ms = Date.parse(deadline) - Date.now();
  if (!(ms > 0)) return "";
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  const n = (v: number, w: string) => `${v} ${w}${v === 1 ? "" : "s"}`;
  if (d > 0) return h > 0 ? `${n(d, "day")} ${n(h, "hour")}` : n(d, "day");
  if (h > 0) return n(h, "hour");
  return n(Math.max(1, m), "minute");
}
