import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Only opaque hashes and random IDs are persisted, never customer/ticket details.
export type CheckoutRequest = { key: string; id: string };
const pending = new Map<string, Promise<CheckoutRequest>>();
const queues = new Map<string, Promise<unknown>>();
const validID = /^[A-Za-z0-9_-]{20,80}$/;
const get = async (key: string) => Platform.OS === "web" ? globalThis.localStorage.getItem(key) : SecureStore.getItemAsync(key);
const put = async (key: string, value: string) => { if (Platform.OS === "web") globalThis.localStorage.setItem(key, value); else await SecureStore.setItemAsync(key, value); };
const remove = async (key: string) => { if (Platform.OS === "web") globalThis.localStorage.removeItem(key); else await SecureStore.deleteItemAsync(key); };
function exclusive<T>(scope: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(scope) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  queues.set(scope, next);
  void next.finally(() => { if (queues.get(scope) === next) queues.delete(scope); }).catch(() => {});
  return next;
}
const indexKey = (start: string) => `${start}pending`;
async function index(start: string): Promise<string[]> {
  const raw = await get(indexKey(start));
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((key) => typeof key !== "string" || !key.startsWith(start) || !/^[a-f0-9]{64}$/.test(key.slice(start.length))))
    throw new Error("Invalid saved checkout index.");
  return parsed as string[];
}
const digest = (value: unknown) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(value));
async function prefix(business: string, merchant: string, customer: string) {
  if (!business || !merchant) throw new Error("Reload your business session before taking payment.");
  return `lx_checkout.${await digest([business, merchant, customer])}.`;
}
export async function checkoutRequest(body: Record<string, unknown>, business: string, merchant: string, customer: string): Promise<CheckoutRequest> {
  const start = await prefix(business, merchant, customer);
  const key = start + await digest(body);
  let flight = pending.get(key);
  if (!flight) {
    flight = exclusive(start, async () => {
      const existing = await get(key);
      if (existing && !validID.test(existing)) throw new Error("Invalid saved checkout request.");
      const id = existing || Crypto.randomUUID();
      await put(key, id);
      const keys = await index(start);
      if (!keys.includes(key)) await put(indexKey(start), JSON.stringify([...keys, key]));
      return { key, id };
    });
    pending.set(key, flight);
  }
  try { return await flight; }
  catch { pending.delete(key); throw new Error("Your device could not save a safe checkout request. Check its storage before trying again."); }
}
export async function pendingCheckouts(business: string, merchant: string, customer: string): Promise<CheckoutRequest[]> {
  const start = await prefix(business, merchant, customer);
  const keys = await index(start);
  const records = await Promise.all(keys.map(async (key) => ({ key, id: await get(key) })));
  return records.filter((record): record is CheckoutRequest => !!record.id && validID.test(record.id));
}
export async function completeCheckout(request: CheckoutRequest) {
  // Cleanup failure must not turn an acknowledged sale into an apparent failure.
  const start = request.key.slice(0, request.key.lastIndexOf(".") + 1);
  try {
    await exclusive(start, async () => {
      if (await get(request.key) !== request.id) return;
      await remove(request.key);
      const keys = (await index(start)).filter((key) => key !== request.key);
      if (keys.length) await put(indexKey(start), JSON.stringify(keys)); else await remove(indexKey(start));
    });
  } catch {}
  pending.delete(request.key);
}
