import { useFormReset } from "../lib/form-reset";
// A 6-digit code sent to a phone: the six boxes of the sign-in design (A1-SignIn), the wait before
// a new code can be asked for, and the small piece that confirms the number on an account.
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { Btn, Note, Pill, Row, T } from "@/components/ui";
import { ApiError, type Row as Data } from "@/lib/api";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

/**
 * Six boxes filled by one text field that lies over them, so the phone's own code suggestion
 * (from the text message), paste and the number keyboard all work as they do in any field.
 * `onFull` is called once when the sixth digit arrives.
 */
export function CodeBoxes({ value, onChange, onFull, autoFocus, bad, disabled }: { value: string; onChange: (v: string) => void; onFull?: (v: string) => void; autoFocus?: boolean; bad?: boolean; disabled?: boolean }) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const set = (raw: string) => {
    const v = raw.replace(/\D/g, "").slice(0, 6); // a pasted "482 913" or a whole sentence still gives the digits
    if (v === value) return;
    onChange(v);
    if (v.length === 6) onFull?.(v);
  };
  const at = Math.min(value.length, 5);
  return (
    <View style={{ height: 60 }}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", gap: 8 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const on = focused && i === at;
          return (
            <View key={i} style={{ flex: 1, height: 60, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: bad ? c.bad : on ? c.ink : c.line2, backgroundColor: c.white, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: f.semi, fontSize: 24, color: value[i] ? c.ink : "#C9BCB4" }}>{value[i] ?? "·"}</Text>
            </View>
          );
        })}
      </View>
      <TextInput ref={input} accessibilityLabel="6-digit code" value={value} onChangeText={set} editable={!disabled} autoFocus={autoFocus}
        keyboardType="number-pad" inputMode="numeric" textContentType="oneTimeCode" autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"} importantForAutofill="yes"
        autoCorrect={false} caretHidden selectionColor="transparent" underlineColorAndroid="transparent" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        // The field itself is not drawn: the boxes under it show what was typed.
        style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, color: "transparent", fontSize: 16, backgroundColor: "transparent", paddingHorizontal: 0 }, Platform.OS === "web" ? ({ outlineStyle: "none", caretColor: "transparent" } as object) : null]} />
    </View>
  );
}

/** Counts down the wait before another code may be asked for. `left` is in seconds; `start()` begins the wait. */
export function useWait(seconds = 30) {
  const [until, setUntil] = useState(0);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [until]);
  return { left, start: () => { setLeft(seconds); setUntil(Date.now() + seconds * 1000); } };
}

/** "0:42" */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** What to say when the API recorded a code but sent nothing (a number it never texts, or no provider for that country). */
export const notSent = (channel: string) => `No ${channel === "whatsapp" ? "WhatsApp message" : "text"} was sent to this number, so no code is on its way.`;

/** Words that act as a link, at a size that can be tapped. */
export function CodeLink({ children, onPress, disabled }: { children: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={6} style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>{children}</Text>
    </Pressable>
  );
}

/**
 * Confirms the mobile number on the signed-in client's account with a code sent to it.
 * `saved` is the number the account holds; `typed` is what is in the field above, so a change
 * that has not been saved yet is not confirmed by mistake. `whatsapp` offers that way to get the code.
 */
export function PhoneConfirm({ saved, typed, confirmed, whatsapp }: { saved: string; typed: string; confirmed: boolean; whatsapp: boolean }) {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [how, setHow] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ kind: "ok" | "bad" | "gold"; text: string } | null>(null);
  const wait = useWait(30);
  const via = whatsapp ? channel : "sms";
  // A different number is a different job: what was typed for the old one is dropped.
  useFormReset([saved], () => { setOpen(false); setCode(""); setSaid(null); });

  if (!saved) return null;
  if (confirmed) return <Row gap={8}><Pill kind="ok">Number confirmed</Pill>{said?.kind === "ok" ? <T size={13} muted style={{ flex: 1 }}>{said.text}</T> : null}</Row>;
  const changed = typed.trim().replace(/[\s()-]/g, "") !== saved.replace(/[\s()-]/g, "");

  const send = async (by: "sms" | "whatsapp") => {
    setBusy(true); setSaid(null);
    try {
      const out = await s.capi<Data>("/auth/phone/send", { body: { channel: by } });
      setChannel(by); setHow(String(out.sent ?? "")); setCode(""); setOpen(true); wait.start();
    } catch (e) {
      setSaid({ kind: "bad", text: (e as Error).message });
    }
    setBusy(false);
  };
  const check = async (v: string) => {
    if (v.length !== 6 || busy) return;
    setBusy(true); setSaid(null);
    try {
      await s.capi("/auth/phone/verify", { body: { code: v } });
      await s.refresh();
      setOpen(false);
      setSaid({ kind: "ok", text: "You can now sign in with a code sent to it." });
    } catch (e) {
      const err = e as ApiError;
      setSaid({ kind: "bad", text: err.message });
      if (err.status === 401) setCode("");
    }
    setBusy(false);
  };

  return (
    <View style={{ backgroundColor: c.goldBg, borderRadius: 16, padding: 14, gap: 10 }}>
      <T size={14} color={c.goldInk}>{open ? <>Enter the 6-digit code {how === "logged" ? "for" : via === "whatsapp" ? "sent on WhatsApp to" : "sent by text to"} <T size={14} weight="semi" color={c.goldInk}>{saved}</T>.</> : <>This number is not confirmed yet. Confirm it with a code and you can sign in with it, without a password.</>}</T>
      {open && how === "logged" ? <T size={13} color={c.goldInk}>{notSent(via)}</T> : null}
      {said && said.kind !== "ok" ? <Note kind={said.kind}>{said.text}</Note> : null}
      {open ? (
        <>
          <CodeBoxes value={code} onChange={(v) => { setCode(v); setSaid(null); }} onFull={check} bad={said?.kind === "bad"} disabled={busy} autoFocus />
          <Row between wrap gap={8}>
            {wait.left > 0 ? <View style={{ minHeight: 44, justifyContent: "center" }}><T size={13} color={c.goldInk}>Send a new code in {mmss(wait.left)}</T></View> : <CodeLink disabled={busy} onPress={() => void send(via)}>Send a new code</CodeLink>}
            {whatsapp ? <CodeLink disabled={busy} onPress={() => void send(via === "whatsapp" ? "sms" : "whatsapp")}>{via === "whatsapp" ? "Send by text instead" : "Send on WhatsApp instead"}</CodeLink> : null}
          </Row>
          <Btn small busy={busy} disabled={code.length !== 6} onPress={() => void check(code)} style={{ alignSelf: "flex-start", minHeight: 44 }}>Confirm number</Btn>
        </>
      ) : changed ? (
        <T size={13} color={c.goldInk}>Save your details first: the code goes to the number saved on your account, {saved}.</T>
      ) : (
        <Row gap={8} wrap>
          <Btn small kind="out" busy={busy} onPress={() => void send("sms")} style={{ minHeight: 44 }}>Text me a code</Btn>
          {whatsapp ? <Btn small kind="out" disabled={busy} onPress={() => void send("whatsapp")} style={{ minHeight: 44 }}>Send it on WhatsApp</Btn> : null}
        </Row>
      )}
    </View>
  );
}
