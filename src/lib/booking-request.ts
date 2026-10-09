// Save only the random request ID, not the booking/contact payload. Native storage is encrypted.
// A lost response keeps the ID, including across app restarts, so a retry cannot create a second visit.
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const pending = new Map<string, Promise<string>>();
const get = async (key: string) => Platform.OS === "web" ? globalThis.localStorage.getItem(key) : SecureStore.getItemAsync(key);
const put = async (key: string, id: string) => { if (Platform.OS === "web") globalThis.localStorage.setItem(key,id); else await SecureStore.setItemAsync(key,id); };
const remove = async (key: string) => { if (Platform.OS === "web") globalThis.localStorage.removeItem(key); else await SecureStore.deleteItemAsync(key); };

export async function sendBooking<T>(owner: string, body: Record<string, unknown>, send: (body: Record<string, unknown>) => Promise<T>): Promise<T> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify([owner, body]));
  const key = `lx_booking.${digest}`;
  let saved = pending.get(key);
  if (!saved) {
    saved = (async () => {
      try {
        const existing = await get(key);
        if (existing) return existing;
        const id = Crypto.randomUUID();
        await put(key,id);
        return id;
      } catch { throw new Error("Your device could not save a safe booking request. Check its storage, or book on the website."); }
    })();
    pending.set(key,saved);
  }
  let id: string;
  try { id = await saved; } catch (error) { pending.delete(key); throw error; }
  const result = await send({ ...body, request_id: id });
  // Cleanup cannot turn a successful booking into a reported failure.
  try { if (await get(key) === id) await remove(key); } catch { /* same ID will safely replay next time */ }
  pending.delete(key);
  return result;
}
