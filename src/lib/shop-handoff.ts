import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { WEB_URL } from "./api";
import { useSession } from "./session";

/** The browser gets a short-lived exchange code, never the app's bearer token. */
export function useShopHandoff() {
  const s = useSession();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const open = async (path: string) => {
    if (busy) return;
    setBusy(true);setError("");
    try {
      const url = s.clientToken ? (await s.capi<{url:string}>("/auth/web-handoff",{body:{path}})).url : WEB_URL+path;
      if (new URL(url).origin !== new URL(WEB_URL).origin) throw new Error("The shop address is not configured correctly. Please try again later.");
      await WebBrowser.openBrowserAsync(url);
    } catch (e) { setError((e as Error).message || "The shop could not be opened. Try again."); }
    finally {setBusy(false)}
  };
  return {open,busy,error};
}
