// Remembers that the welcome screen has been seen, so it greets a person once and then gets out of the way.
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "lx_welcomed";

export async function wasWelcomed(): Promise<boolean> {
  try {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(KEY) === "1";
    return (await SecureStore.getItemAsync(KEY)) === "1";
  } catch {
    return true; // storage is blocked: do not trap the person on the welcome screen at every start
  }
}

export async function markWelcomed(): Promise<void> {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, "1");
    else await SecureStore.setItemAsync(KEY, "1");
  } catch { /* nothing to do */ }
}
