// The features a LogaLuxe admin switches on and off: signing in with a texted code, texts and
// WhatsApp to clients, Apple Pay and Google Pay, and saved cards. A screen only ever asks "is it
// live". The answer is read when the app starts and again each time the app or a screen comes back
// into view, so an admin's switch shows within seconds. While the answer is not known, or the call
// failed, every feature counts as off.
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { api, type Row } from "./api";
import { useSession } from "./session";

export type Features = { sms_login: boolean; sms_messages: boolean; whatsapp: boolean; wallets: boolean; saved_cards: boolean };
/** `loaded` turns true after the first answer, whether it arrived or failed. */
export type FeatureState = Features & { loaded: boolean };

const KEYS = ["sms_login", "sms_messages", "whatsapp", "wallets", "saved_cards"] as const;
const OFF: Features = { sms_login: false, sms_messages: false, whatsapp: false, wallets: false, saved_cards: false };

let state: FeatureState = { ...OFF, loaded: false };
let flying: Promise<void> | null = null;
let askedAt = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => state;

/** Asks the API again. Several screens asking at once share one call. */
export function refreshFeatures(): Promise<void> {
  if (flying) return flying;
  if (state.loaded && Date.now() - askedAt < 1500) return Promise.resolve();
  flying = (async () => {
    let next: Features = OFF;
    try {
      const got = (await api<{ features?: Row }>("/features")).features ?? {};
      next = { sms_login: got.sms_login === true, sms_messages: got.sms_messages === true, whatsapp: got.whatsapp === true, wallets: got.wallets === true, saved_cards: got.saved_cards === true };
    } catch {
      next = OFF; // not reachable: offer nothing that might not be there
    }
    askedAt = Date.now();
    flying = null;
    // The same object is kept when nothing changed, so screens do not draw again for nothing.
    if (!state.loaded || KEYS.some((k) => state[k] !== next[k])) {
      state = { ...next, loaded: true };
      listeners.forEach((fn) => fn());
    }
  })();
  return flying;
}

/** What is live right now. Use it in any screen or piece of a screen. */
export function useFeatures(): FeatureState {
  const v = useSyncExternalStore(subscribe, snapshot, snapshot);
  useFocusEffect(useCallback(() => { void refreshFeatures(); }, []));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void refreshFeatures(); });
    return () => sub.remove();
  }, []);
  return v;
}

// ---------- the business side: what each channel really does ----------

export type Mode = "live" | "log";
export type Modes = { email: Mode; whatsapp: Mode; sms: Mode };
const NAMES: Record<keyof Modes, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS" };
const ORDER: (keyof Modes)[] = ["email", "whatsapp", "sms"];

/** The `modes` the business API answers with, read safely. Anything that is not "log" is delivered. */
export const modesOf = (raw: unknown): Modes => {
  const m = (raw ?? {}) as Row;
  const one = (v: unknown): Mode => (v === "log" ? "log" : "live");
  return { email: one(m.email), whatsapp: one(m.whatsapp), sms: one(m.sms) };
};

const join = (a: string[]) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

/** The note at the top of the marketing screens: which channels reach clients and which are only logged. "" when all three are delivered. */
export function channelsNote(m: Modes): string {
  const live = ORDER.filter((k) => m[k] === "live").map((k) => NAMES[k]);
  const log = ORDER.filter((k) => m[k] === "log").map((k) => NAMES[k]);
  if (log.length === 0) return "";
  if (live.length === 0) return "Email, WhatsApp and SMS are not connected yet. Messages are logged, not delivered.";
  return `${join(live)} ${live.length === 1 ? "is" : "are"} delivered. ${join(log)} ${log.length === 1 ? "is" : "are"} not connected yet: those messages are logged, not delivered.`;
}

/** "Email and SMS", the channels that reach clients today. "" when none does. */
export const liveChannels = (m: Modes) => join(ORDER.filter((k) => m[k] === "live").map((k) => NAMES[k]));

/**
 * The modes for a screen that does not load the marketing page itself (a conversation, settings).
 * GET /m/marketing carries them but belongs to managers and owners. For anyone it refuses, WhatsApp
 * follows its switch exactly and SMS follows its switch, which is right wherever the SMS provider
 * for the business's country is set up. `mailMode` is the `mail_mode` the screen already has, if any.
 */
export function useModes(mailMode?: string): Modes & { known: boolean } {
  const s = useSession();
  const ft = useFeatures();
  const [got, setGot] = useState<Modes | null>(null);
  const token = s.businessToken;
  // Asked again when a switch changes, so the wording follows it.
  useEffect(() => {
    let live = true;
    if (!token) return;
    s.mapi<Row>("/marketing").then((r) => { if (live) setGot(modesOf(r.modes)); }).catch(() => { if (live) setGot(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ft.sms_messages, ft.whatsapp]);
  if (got && token) return { ...got, known: true };
  return { email: mailMode === "log" ? "log" : "live", whatsapp: ft.whatsapp ? "live" : "log", sms: ft.sms_messages ? "live" : "log", known: false };
}

/** The sentence shown after the business sends a message, by channel and by what the API said happened to it. */
export function sentResult(delivery: string, channel: string, m: Modes): { kind: "ok" | "bad"; message: string } {
  const phone = channel === "whatsapp" || channel === "sms";
  const name = channel === "whatsapp" ? "WhatsApp" : "SMS";
  if (delivery === "delivered") return { kind: "ok", message: phone ? `Message sent to the client on ${name}.` : "Message delivered to the client's LogaLuxe account." };
  if (delivery === "sent") return { kind: "ok", message: "Message sent by email." };
  if (delivery === "logged") {
    if (phone) return { kind: "ok", message: m[channel as "whatsapp" | "sms"] === "live" ? `Message logged, not sent: it did not go out on ${name}.` : `Message logged, not sent. ${name} is not connected yet.` };
    if (channel === "email") return { kind: "ok", message: "Message logged, not sent. No mail provider is set up." };
    if (channel === "in_app") return { kind: "ok", message: "Message logged, not sent. This client has no LogaLuxe account to read it in." };
    return { kind: "ok", message: "Message logged, not sent. The note under the messages says why." };
  }
  if (delivery === "failed") return { kind: "bad", message: `${phone ? `The ${name} message` : "The email"} could not be sent. The message is saved in the conversation as failed.` };
  return { kind: "bad", message: `Message saved but not sent: ${delivery || "unknown reason"}.` };
}

// ---------- the client side: a word on the phone about a booking ----------

// The number a booking was made with, kept while the app is open: the public copy of a booking does not carry it.
const bookedWith: Record<string, string> = {};
export const keepBookingPhone = (bookingId: string, phone: string) => { bookedWith[bookingId] = phone; };
export const bookingPhone = (bookingId: string) => bookedWith[bookingId] ?? "";

/**
 * How the API also tells a phone about a booking, or "" when it sends nothing there. It follows the
 * API's own rule: WhatsApp when that is live and the person did not choose texts, else a text when
 * texts are live and they did not choose email only. A number without a country code, and the
 * test numbers the API never texts, get nothing. `prefer` is the account's preferred channel, "" for a guest.
 */
export function phoneWord(ft: Features, prefer: string, phone: string): "" | "on WhatsApp" | "by text" {
  const p = phone.replace(/\s/g, "");
  if (!p.startsWith("+") || /^\+1\d{3}555\d{4}$|^\+234803555\d{4}$/.test(p)) return "";
  if (prefer !== "sms" && ft.whatsapp) return "on WhatsApp";
  if (prefer !== "email" && ft.sms_messages) return "by text";
  return "";
}
