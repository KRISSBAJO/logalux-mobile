// The payout account: whether payouts are on, what is missing, the accounts on file, the schedule,
// paying out now, and the recent payouts. The owner's. It follows the web's Payout account page call for call.
//
// Bank details: in the United States they are entered on Stripe's own pages, opened in the phone's browser.
// In Nigeria the web tool itself asks for the bank and the 10-digit account number and sends them straight
// to the API (POST /v1/m/payout-account/bank), which checks the name with the bank through Paystack and keeps
// only the last four digits. This screen mirrors that form exactly; the number is held only while the sheet is open.
import * as WebBrowser from "expo-web-browser";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { AskManager, Choice, Grp, Header, McIcon, Sheet, SmallBtn, Tag, Wait } from "@/components/mc-kit";
import { GoldBtn, Line, Night, Step, nightBody, nightLabel, small, type Flash } from "@/components/mh-kit";
import { Btn, Card, Empty, Failed, Field, Icon, Note, Row, Screen } from "@/components/ui";
import { type Row as Data } from "@/lib/api";
import { dayShort, initials } from "@/lib/format";
import { DENIED, ask, orDenied, signedIn, soft } from "@/lib/mc-util";
import { PROVIDER, bankOf, cap, dateShort, exact, isStripe, payoutKind, payoutState } from "@/lib/mh-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const SCHEDS = [["daily", "Daily", "Sent every day"], ["weekly", "Weekly", "Sent every Monday"], ["manual", "When I ask", "Nothing is sent until you pay out by hand"]] as const;
const SCHEDULE_DONE: Record<string, string> = { daily: "Payouts are now sent every day.", weekly: "Payouts are now sent every Monday.", manual: "Automatic payouts are off. Pay out when you choose." };
/** Two letters for the square beside an account: "Chase" gives CH, "First Bank" gives FB. */
const mark = (name: string) => (/\s/.test(name.trim()) ? initials(name) : name.trim().slice(0, 2).toUpperCase());
const sentence = (e: unknown) => (e as Error).message || "Something went wrong.";

type BankStep = { step: "enter" | "resolved"; bank: { code: string; name: string } | null; number: string; name: string; checked: boolean; find: string; error: string };
const NO_BANK: BankStep = { step: "enter", bank: null, number: "", name: "", checked: false, find: "", error: "" };

export default function Payouts() {
  const s = useSession();
  const m = s.merchant;
  const tz = m?.timezone as string | undefined;
  const [note, setNote] = useState<Flash>(null);
  const [busy, setBusy] = useState("");
  const [sim, setSim] = useState<{ bank_name: string; last4: string; account_name: string; error: string } | null>(null);
  const [bank, setBank] = useState<BankStep | null>(null);
  const [acct, setAcct] = useState<Data | null>(null);
  const [paying, setPaying] = useState(false), [payError, setPayError] = useState("");
  const away = useRef(false); // the person has gone to Stripe and has not been greeted back yet

  const { data, error, refreshing, refresh, reload } = useLoad(signedIn(s, () => orDenied(async () => {
    // Asking for the account also makes the API ask Stripe whether a set-up in progress has finished.
    const d = await s.mapi<Data>("/payout-account");
    const [money, settings] = await Promise.all([soft(() => s.mapi<Data>("/money")), soft(() => s.mapi<Data>("/settings"))]);
    return { d, money: money.data, settings: settings.data };
  })), [s.businessToken]);

  /** Reads the account again and says where things stand, after a visit to Stripe. */
  const backFromStripe = useCallback(async () => {
    if (!away.current) return;
    away.current = false;
    try {
      const d = await s.mapi<Data>("/payout-account");
      const list = (d.accounts ?? []) as Data[];
      const def = list.find((a) => a.is_default);
      const on = list.some((a) => a.is_default && a.status === "verified" && a.mode === "live");
      const pending = list.some((a) => a.provider === "stripe" && a.status === "pending");
      setNote(on ? { kind: "ok", text: `Stripe has verified your account. Payouts are on, and your balance will be sent to ${bankOf(def, "your bank")}.` }
        : pending ? { kind: "gold", text: "You are back from Stripe. Stripe has not turned payouts on yet: it is still checking your details, or it needs something more. This screen asks Stripe each time it loads, so pull down to check again in a few minutes, or continue the set-up below." }
        : { kind: "ok", text: "You are back from Stripe. Your account status is shown below." });
    } catch { /* the reload below shows the failure */ }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]);

  // Coming back to the app, or to this screen: read the state again.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") void backFromStripe(); });
    return () => sub.remove();
  }, [backFromStripe]);
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!s.businessToken) return;
    if (seen.current) void refresh();
    seen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.businessToken]));

  if (!data || data === DENIED) {
    return (
      <Screen>
        <Header title="Payouts" />
        {data === DENIED ? <AskManager who="the owner" what="Payouts and the bank account are for the owner of the business." />
          : error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </Screen>
    );
  }

  const { d, money, settings } = data;
  const us = d.market === "US";
  const cur = String(d.currency ?? m?.currency ?? "USD");
  const accounts = (d.accounts ?? []) as Data[];
  const def = accounts.find((a) => a.is_default) ?? null;
  const live = us ? d.stripe_live === true : d.paystack_live === true;
  // With real payments on, only an account connected for real can be paid. Simulated ones stay listed.
  const real = accounts.filter((a) => !live || a.mode === "live");
  const stale = live && accounts.some((a) => a.mode !== "live");
  const ready = real.some((a) => a.is_default && a.status === "verified");
  const pendingStripe = accounts.find((a) => a.provider === "stripe" && a.status === "pending");
  const verified = d.verification === "verified";
  const provider = us ? "Stripe" : "Paystack";
  // The live list from Paystack repeats some banks. Keep one of each, in name order.
  const seenBank = new Set<string>();
  const banks = ((d.banks ?? []) as { code: string; name: string }[])
    .filter((x) => { const k = `${x.code}|${x.name}`; if (!x.code || seenBank.has(k)) return false; seenBank.add(k); return true; })
    .sort((x, y) => x.name.localeCompare(y.name));

  // The balance and the recent payouts come from the money ledger.
  const bal = (money?.balances ?? {}) as Data, payouts = (money?.payouts ?? []) as Data[], account = (money?.account ?? null) as Data | null;
  const available = Number(bal.available_cents ?? 0);
  const simulated = account ? account.mode !== "live" : !live;
  const blocked = live && !!account && account.mode !== "live";
  const canPay = !!money && !!account && account.status === "verified" && available >= 100 && !blocked;
  const whyNot = blocked ? "This payout account was recorded before real payments were switched on, so it cannot receive a payout. Connect your real account first."
    : !account ? "Add a payout account first, so there is somewhere to send the money."
    : account.status !== "verified" ? "Your payout account is not verified yet."
    : "There is nothing to pay out yet. Money becomes available two days after a client pays.";
  // The fee for an instant payout comes from the fee table of the plan. Only the rate is published, not the minimum.
  const plan = ((settings?.plans ?? []) as Data[]).find((p) => p.plan === m?.plan);
  const feePct: number | null = plan && typeof plan.instant_payout_pct === "number" ? plan.instant_payout_pct : null;
  const feeGuess = feePct ? Math.round((available * feePct) / 100) : 0;

  const state = ready ? "ready" : pendingStripe ? "started" : stale && !real.length ? "real" : accounts.length ? "waiting" : "none";
  const headline = { ready: "Payouts are on", started: "Set-up not finished", real: "Needs a real account", waiting: "Waiting for a verified account", none: "Not set up" }[state];
  const missing = {
    ready: `Your balance is sent to ${bankOf(def, "your account")}${def?.mode === "simulation" ? ", in simulation" : ""}.`,
    started: "You started the set-up on Stripe. Stripe is still checking your details, or it needs something more from you. LogaLuxe is not told which, so continue on Stripe to see what is missing.",
    real: `The account on file was recorded before real payments were switched on, and no bank was ever contacted. ${us ? "Set up your real account with Stripe" : "Add your real bank account"}, then remove the simulated one.`,
    waiting: "Payouts turn on once a verified account is your default.",
    none: "There is no payout account yet, so the money you take cannot reach your bank.",
  }[state];
  const setupLabel = us
    ? (live ? (pendingStripe ? "Continue the set-up on Stripe" : ready ? "Update your details on Stripe" : "Open Stripe to set up payouts") : accounts.length ? "Add another account" : "Add a payout account")
    : (real.length ? "Add another bank account" : live && stale ? "Add your real bank account" : "Add a bank account");

  const run = async (tag: string, call: () => Promise<unknown>, done: string | ((out: Data) => Flash)) => {
    setBusy(tag); setNote(null);
    try {
      const out = (await call()) as Data;
      setNote(typeof done === "string" ? { kind: "ok", text: done } : done(out));
      setBusy("");
      reload();
      return true;
    } catch (e) {
      setNote({ kind: "bad", text: sentence(e) });
      setBusy("");
      return false;
    }
  };

  // United States, with real payments: the API answers with a link to Stripe's own pages.
  const openStripe = async () => {
    setBusy("setup"); setNote(null);
    try {
      const out = await s.mapi<Data>("/payout-account/stripe", { method: "POST", body: {} });
      const url = typeof out.url === "string" ? out.url : "";
      if (!url) { setNote({ kind: "ok", text: "Payout account added as your default. It is simulated: no bank was contacted." }); setBusy(""); reload(); return; }
      if (!isStripe(url)) { setNote({ kind: "bad", text: "Stripe returned a link this app does not trust. Try again." }); setBusy(""); return; }
      away.current = true;
      setBusy("");
      await WebBrowser.openBrowserAsync(url).catch(() => undefined);
      // On a phone the line above waits until Stripe's page is closed. In a browser it returns at once,
      // and coming back to the tab is what reads the state again.
      if (AppState.currentState === "active") await backFromStripe();
    } catch (e) {
      setNote({ kind: "bad", text: sentence(e) });
      setBusy("");
    }
  };

  const startSetup = () => {
    setNote(null);
    if (us && live) void openStripe();
    else if (us) setSim({ bank_name: "", last4: "", account_name: "", error: "" });
    else setBank(NO_BANK);
  };

  // United States, in simulation: the same three fields the web records. Never a full account number.
  const saveSim = async () => {
    if (!sim) return;
    const bank_name = sim.bank_name.trim(), last4 = sim.last4.trim(), account_name = sim.account_name.trim();
    if (!bank_name || !/^\d{4}$/.test(last4) || !account_name) { setSim({ ...sim, error: "Enter the bank, the name on the account and the last four digits." }); return; }
    setBusy("sim");
    try {
      await s.mapi("/payout-account/stripe", { method: "POST", body: { bank_name, last4, account_name } });
      setSim(null); setBusy("");
      setNote({ kind: "ok", text: "Payout account added as your default. It is simulated: no bank was contacted." });
      reload();
    } catch (e) {
      setSim({ ...sim, error: sentence(e) }); setBusy("");
    }
  };

  // Nigeria. Step one: ask the bank whose account this is. Nothing is saved yet.
  const checkBank = async () => {
    if (!bank) return;
    const number = bank.number.replace(/\s/g, ""), typed = bank.name.trim();
    if (!bank.bank) { setBank({ ...bank, error: "Choose a bank." }); return; }
    if (!/^\d{10}$/.test(number)) { setBank({ ...bank, error: "Enter the 10-digit account number." }); return; }
    if (!live && !typed) { setBank({ ...bank, error: "Enter the name on the account." }); return; }
    setBusy("bank");
    try {
      const out = await s.mapi<Data>("/payout-account/bank", { method: "POST", body: { bank_code: bank.bank.code, bank_name: bank.bank.name, account_number: number, account_name: typed, confirm: false } });
      setBank({ ...bank, step: "resolved", number, name: String(out.account_name ?? typed), checked: out.checked_with_bank === true, error: "" });
    } catch (e) {
      setBank({ ...bank, error: sentence(e) });
    }
    setBusy("");
  };
  // Nigeria. Step two: save the account whose name was just confirmed.
  const saveBank = async () => {
    if (!bank?.bank) return;
    setBusy("bank");
    try {
      const out = await s.mapi<Data>("/payout-account/bank", { method: "POST", body: { bank_code: bank.bank.code, bank_name: bank.bank.name, account_number: bank.number, account_name: bank.name, confirm: true } });
      setBank(null); setBusy("");
      setNote({ kind: "ok", text: out.mode === "live" ? "Payout account saved. It is now your default." : "Payout account saved as your default. It is simulated: the bank was not contacted." });
      reload();
    } catch (e) {
      setBank({ ...bank, error: sentence(e) }); setBusy("");
    }
  };

  const makeDefault = async (a: Data) => { setAcct(null); await run("acct", () => s.mapi(`/payout-account/${a.id}/default`, { method: "POST", body: {} }), "Default payout account changed."); };
  const remove = async (a: Data) => {
    const message = a.is_default ? (accounts.length > 1 ? "The newest verified account left becomes the default." : "Payouts stop until you add another.") : "It will no longer be on your list.";
    if (!(await ask(a.is_default ? (accounts.length > 1 ? "Remove your default payout account?" : "Remove your only payout account?") : "Remove this payout account?", message, "Remove", true))) return;
    setAcct(null);
    await run("acct", () => s.mapi(`/payout-account/${a.id}`, { method: "DELETE" }), "Payout account removed.");
  };

  const setSchedule = (id: string) => { if (id !== d.schedule && !busy) void run("sched-" + id, () => s.mapi("/payout-schedule", { method: "PUT", body: { schedule: id } }), SCHEDULE_DONE[id] ?? "Schedule saved."); };

  /** Sends the whole available balance to the bank. An instant payout carries a fee. */
  const payOut = async (instant: boolean) => {
    if (busy) return;
    const question = instant
      ? `Pay out instantly${feePct ? ` for a fee of about ${exact(feeGuess, cur)}` : ", with a fee"}?`
      : `Pay out ${exact(available, cur)} now?`;
    if (!(await ask(question, simulated ? "This is a simulation: no bank transfer is made." : `It is sent to ${bankOf(account, "your bank")}.`, "Pay out"))) return;
    setBusy(instant ? "pay-instant" : "pay"); setPayError("");
    try {
      const made = await s.mapi<Data>("/payouts", { method: "POST", body: { instant } });
      // Read the payout back so the message can say what was sent and what the fee was.
      const fresh = await s.mapi<Data>("/money").catch(() => null);
      const p = ((fresh?.payouts ?? []) as Data[]).find((x) => x.id === made.id);
      const fee = p && Number(p.fee_cents) > 0 ? `, after an instant payout fee of ${exact(p.fee_cents, p.currency || cur)}` : "";
      setNote({ kind: "ok", text: !p ? "Payout created."
        : fresh?.account?.mode !== "live" ? `Payout of ${exact(p.amount_cents, p.currency || cur)} recorded as paid${fee}. Payments are in simulation, so no bank transfer was made.`
        : `Payout of ${exact(p.amount_cents, p.currency || cur)} is on its way to your bank${fee}.` });
      setPaying(false);
      reload();
    } catch (e) {
      setPayError(sentence(e));
    }
    setBusy("");
  };

  const found = bank ? banks.filter((b) => b.name.toLowerCase().includes(bank.find.trim().toLowerCase())) : [];

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Payouts" />
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {error ? <View style={{ marginTop: 12 }}><Failed error={error} onRetry={reload} /></View> : null}

      <Night style={{ marginTop: 14 }}>
        <Row between style={{ alignItems: "flex-start" }}>
          <Text style={nightLabel}>Payout account</Text>
          <Tag kind="night">{provider} · {live ? "live" : "simulation"}</Tag>
        </Row>
        <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 30, lineHeight: 36, color: "#F4ECE3", marginTop: 6 }}>{headline}</Text>
        <Text style={[nightBody, { marginTop: 6 }]}>{missing}</Text>
        {money ? (
          <Row gap={10} style={{ marginTop: 14, alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: f.body, fontSize: 12, color: "#C9BCB0" }}>Available for payout</Text>
              <Text style={{ fontFamily: f.bold, fontSize: 18, color: "#F4ECE3" }}>{exact(available, cur)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: f.body, fontSize: 12, color: "#C9BCB0" }}>Next automatic payout</Text>
              <Text style={{ fontFamily: f.bold, fontSize: 18, color: "#F4ECE3" }}>{money.next_payout ? dateShort(money.next_payout) : "None"}</Text>
              <Text style={{ fontFamily: f.body, fontSize: 11, lineHeight: 15, color: "#C9BCB0" }}>{!money.next_payout ? "you pay out by hand" : !account ? "needs a payout account first" : d.schedule === "weekly" ? "sent every Monday" : "sent every day"}</Text>
            </View>
          </Row>
        ) : null}
        <View style={{ marginTop: 14, gap: 8 }}>
          {ready ? (
            <Row gap={8}>
              <GoldBtn style={{ flex: 1 }} disabled={!money} onPress={() => { setPayError(""); setPaying(true); }}>Pay out now</GoldBtn>
              <SmallBtn kind="ghost" busy={busy === "setup"} onPress={startSetup}>{us && live ? "Stripe" : "Add account"}</SmallBtn>
            </Row>
          ) : <GoldBtn busy={busy === "setup"} onPress={startSetup}>{setupLabel}</GoldBtn>}
          <Text style={[nightBody, { fontSize: 12, lineHeight: 17 }]}>
            {us && live ? "This opens Stripe's own pages, where you enter your legal details, identity and bank account. It takes about five minutes. LogaLuxe never sees your account number or SSN. Close Stripe's page when it says you are done, and this screen reads your status again."
              : us ? "This install has no Stripe key, so it runs in simulation: you record which account payouts would go to, no bank is contacted, and no money moves."
              : live ? "You add the account here, we ask the bank whose account it is through Paystack, and you confirm. No transfer is made."
              : "This install has no Paystack key, so it runs in simulation: no bank is contacted and no money moves."}
          </Text>
        </View>
      </Night>

      <Grp>{us ? (live ? (ready ? "Set-up" : "What is left to do") : "Set-up") : "Set-up"}</Grp>
      <Card style={{ paddingHorizontal: 16 }}>
        <Step n={1} done={verified} title={verified ? "Business verified" : "Business being checked"} sub={verified ? "Our team has approved your listing." : `Our team is still checking your listing. You can ${us ? "set up payouts" : "add the account"} now.`} />
        {us ? (
          <Step n={2} done={real.length > 0 && !pendingStripe} title={live ? "Bank and identity on Stripe" : "Payout account recorded"}
            sub={live ? (pendingStripe ? "You started the set-up on Stripe. Finish it, or wait for Stripe to check your details, to turn payouts on." : real.length ? "Entered on Stripe." : "Stripe asks for your legal details, identity and bank account on its own pages.") : accounts.length ? "You have recorded an account. It is simulated." : "Record the bank, the name on the account and its last four digits."} />
        ) : (
          <Step n={2} done={real.length > 0} title={real.length ? "Account name confirmed" : "Confirm the account name"} sub={live ? "We ask the bank whose account it is, through Paystack. No transfer is made." : "In simulation you type the name and confirm it. No bank is contacted and no transfer is made."} />
        )}
        <Step n={3} last done={ready} title="Payouts enabled" sub={ready ? `Your balance is sent to ${bankOf(def, "your account")}${def?.mode === "simulation" ? ", in simulation" : ""}.` : "Turns on once a verified account is your default."} />
      </Card>

      <Grp>{us ? "Where your money goes" : accounts.length > 1 ? "Payout accounts" : "Current payout account"}</Grp>
      {accounts.length ? (
        <Card>
          {accounts.map((a, i) => {
            const unfinished = a.status !== "verified";
            const title = a.bank_name ? bankOf(a) : `${PROVIDER[a.provider] ?? "Payout"} account`;
            return (
              <Pressable key={String(a.id)} accessibilityRole="button" accessibilityLabel={`${title}. ${a.is_default ? "Default. " : ""}${unfinished ? cap(String(a.status)) : "Verified"}. Options`} onPress={() => setAcct(a)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: i === accounts.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.75 : 1 })}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a.is_default ? "#1F2A33" : c.muted, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: f.bold, fontSize: 13, color: "#F4ECE3" }}>{mark(String(a.bank_name || PROVIDER[a.provider] || "Bank"))}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{title}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{[a.account_name, PROVIDER[a.provider] ?? a.provider, unfinished && a.provider === "stripe" ? "set-up not finished" : ""].filter(Boolean).join(" · ")}</Text>
                  <Row gap={6} wrap>
                    {a.is_default ? <Tag kind="wine">Default</Tag> : null}
                    <Tag kind={unfinished ? "gold" : "ok"}>{unfinished ? cap(String(a.status)) : "Verified"}</Tag>
                    {a.mode === "simulation" ? <Tag kind="grey">Simulated</Tag> : null}
                  </Row>
                </View>
                <Icon name="more" size={20} color={c.muted} />
              </Pressable>
            );
          })}
        </Card>
      ) : <Empty title="No payout account yet">Add one so the money you take can reach your bank.</Empty>}
      {stale ? <View style={{ marginTop: 10 }}><Note kind="gold">A simulated account cannot receive real payouts. It was recorded before real payments were switched on, and no bank was ever contacted. {us ? "Set up your real account with Stripe" : "Add your real bank account"} here, then remove the simulated one.</Note></View>
        : accounts.some((a) => a.mode === "simulation") ? <Text style={[small, { marginTop: 8 }]}>A simulated account is a label only. No bank was contacted, and a payout to it is recorded as paid without a real transfer.</Text> : null}
      {accounts.length ? <SmallBtn kind="out" icon="plus" busy={busy === "setup"} onPress={startSetup} style={{ alignSelf: "flex-start", marginTop: 10 }}>{setupLabel}</SmallBtn> : null}

      <Grp>Payout schedule</Grp>
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        {SCHEDS.map(([id, name, sub]) => <Choice key={id} title={name} sub={busy === "sched-" + id ? "Saving" : sub} on={d.schedule === id} onPress={() => setSchedule(id)} />)}
      </View>
      <Text style={[small, { marginTop: 8 }]}>Money reaches your payout balance two days after the client pays, then follows this schedule. Deposits are held until the visit and released at checkout.</Text>

      <Grp>Account status</Grp>
      <Card style={{ paddingHorizontal: 16 }}>
        <Line name="Payouts" value={ready ? "Enabled" : stale && !real.length ? "Needs a real account" : accounts.length ? "Waiting for a verified account" : "Not set up"} tone={ready ? "ok" : undefined} />
        <Line name="Paid through" value={provider} />
        <Line name="Mode" note={live ? "payouts are really sent" : "no real transfers"} value={live ? "Live" : "Simulation"} />
        <Line name="Default account" value={def ? bankOf(def, provider) : "None"} />
        <Line name="Business check" value={verified ? "Verified" : cap(String(d.verification ?? "pending"))} tone={verified ? "ok" : undefined} />
        {us ? null : <Line name="Flutterwave" note="A second provider. Payouts here go through Paystack only." value={d.flutterwave_live ? "Key set" : "Not connected"} tone="muted" />}
        <Line last name="Currency" note={us ? undefined : "clients see prices in naira and you are paid in naira"} value={cur} />
      </Card>

      <Grp>Recent payouts</Grp>
      {!money ? <Text style={small}>The balance and the payouts could not be read just now. Pull down to try again.</Text>
        : payouts.length ? (
          <Card style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
            {payouts.map((p, i) => {
              const st = payoutState(p);
              const day = p.scheduled_for ? dateShort(p.scheduled_for) : p.paid_at ? dayShort(p.paid_at, tz) : "No date";
              return (
                <View key={String(p.id)} style={{ paddingVertical: 12, borderBottomWidth: i === payouts.length - 1 ? 0 : 1, borderBottomColor: c.line, gap: 6 }}>
                  <Row between style={{ alignItems: "flex-start" }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: f.semi, fontSize: 14, lineHeight: 20, color: c.ink }}>{day} · {payoutKind(String(p.kind))}</Text>
                      <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.muted }}>{[bankOf(p, cap(String(p.provider ?? ""))), p.reference ? `ref ${p.reference}` : "", Number(p.fee_cents) > 0 ? `${exact(p.fee_cents, cur)} fee` : ""].filter(Boolean).join(" · ")}</Text>
                      {p.status === "failed" && p.failure_reason ? <Text style={{ fontFamily: f.body, fontSize: 12, lineHeight: 17, color: c.bad }}>{cap(String(p.failure_reason))}</Text> : null}
                    </View>
                    <Text style={{ fontFamily: f.bold, fontSize: 15, color: c.ink }}>{exact(p.amount_cents, p.currency || cur)}</Text>
                  </Row>
                  <View style={{ flexDirection: "row" }}><Tag kind={st.kind}>{st.word}</Tag></View>
                </View>
              );
            })}
          </Card>
        ) : <Empty title="No payouts yet">The first one is made once money has settled and a payout account is set up.</Empty>}
      {money ? (
        <Text style={[small, { marginTop: 8 }]}>
          {payouts.length >= 8 ? "These are the 8 most recent payouts. Each month's statement lists all of its payouts. " : ""}
          {simulated ? "Payments are in simulation on this install: a payout is recorded as paid without a real bank transfer." : `A payout is really sent to your default payout account through ${provider}. Scheduled means it is not sent yet, being sent means the bank has it, paid means it arrived. If one fails, the money is returned to your balance as an adjustment line.`}
        </Text>
      ) : null}
      <Card style={{ marginTop: 12, paddingHorizontal: 16 }}>
        <Line name="Money" note="Your balance and what came in and went out" value="" onPress={() => router.push("/m/money" as never)} />
        <Line last name="Statements" note="Each month in full" value="" onPress={() => router.push("/m/statements" as never)} />
      </Card>

      {/* Pay out now */}
      <Sheet open={paying} onClose={() => setPaying(false)} title="Pay out now" sub="Sends your whole available balance to your payout account.">
        {payError ? <Note kind="bad">{payError}</Note> : null}
        <Card style={{ paddingHorizontal: 16 }}>
          <Line name="Available now" value={exact(available, cur)} />
          <Line last name="Sent to" value={account ? bankOf(account, "Bank") : "No account yet"} />
        </Card>
        {simulated ? <Note kind="gold">Payments are in simulation on this install. A payout is recorded as paid straight away, but no bank transfer is made.</Note> : null}
        {canPay ? (
          <>
            <Card style={{ padding: 16, gap: 10 }}>
              <Text style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>Standard payout · no fee</Text>
              <Text style={small}>{simulated ? "Recorded as paid at once." : `Sent to your bank through ${provider}. It shows as scheduled, then being sent, then paid.`} You receive {exact(available, cur)}.</Text>
              <Btn kind="gold" busy={busy === "pay"} disabled={!!busy} onPress={() => payOut(false)}>Pay out {exact(available, cur)}</Btn>
            </Card>
            {feePct === 0 ? <Text style={small}>Instant payouts carry no fee on your plan, so the standard payout above is all you need.</Text> : (
              <Card style={{ padding: 16, gap: 10 }}>
                <Text style={{ fontFamily: f.semi, fontSize: 15, color: c.ink }}>Instant payout · {feePct ? `${feePct}% fee` : "a fee applies"}</Text>
                <Text style={small}>{feePct
                  ? `The fee is ${feePct}% of the amount: about ${exact(feeGuess, cur)}, so you would receive about ${exact(available - feeGuess, cur)}. A minimum fee can apply to small amounts. The exact fee is shown as soon as the payout is made.`
                  : "An instant payout carries a fee set by your plan. The exact fee is shown as soon as the payout is made."}</Text>
                <Btn kind="out" busy={busy === "pay-instant"} disabled={!!busy} onPress={() => payOut(true)}>Pay out instantly{feePct ? ` · about ${exact(feeGuess, cur)} fee` : ""}</Btn>
              </Card>
            )}
          </>
        ) : <Text style={{ fontFamily: f.body, fontSize: 14, lineHeight: 20, color: c.ink }}>{whyNot}</Text>}
      </Sheet>

      {/* One account's options */}
      <Sheet open={!!acct} onClose={() => setAcct(null)} title={acct ? (acct.bank_name ? bankOf(acct) : `${PROVIDER[acct.provider] ?? "Payout"} account`) : ""} sub={acct ? [acct.account_name, acct.is_default ? "default" : "", PROVIDER[acct.provider] ?? acct.provider].filter(Boolean).join(" · ") : undefined}>
        {acct && !acct.is_default && acct.status === "verified" ? <Btn kind="ink" busy={busy === "acct"} onPress={() => makeDefault(acct)}>Make default</Btn> : null}
        {acct && acct.is_default ? <Text style={small}>This is the account your payouts are sent to.</Text> : null}
        {acct && acct.status !== "verified" && acct.provider === "stripe" && live ? <Btn kind="ink" busy={busy === "setup"} onPress={() => { setAcct(null); void openStripe(); }}>Continue the set-up on Stripe</Btn> : null}
        {acct ? <Btn kind="danger" disabled={busy === "acct"} onPress={() => remove(acct)}>Remove</Btn> : null}
      </Sheet>

      {/* United States, simulation: record which account payouts would go to */}
      <Sheet open={!!sim} onClose={() => setSim(null)} title={accounts.length ? "Add another account" : "Add a payout account"} sub="Simulated. No bank is contacted and no money moves."
        footer={<Btn busy={busy === "sim"} onPress={saveSim}>Add simulated account</Btn>}>
        {sim ? (
          <>
            {sim.error ? <Note kind="bad">{sim.error}</Note> : null}
            <Field label="Bank" placeholder="Name of the bank" maxLength={80} autoComplete="off" autoCorrect={false} value={sim.bank_name} onChangeText={(v) => setSim({ ...sim, bank_name: v, error: "" })} />
            <Field label="Last four digits" placeholder="0000" maxLength={4} keyboardType="number-pad" autoComplete="off" value={sim.last4} onChangeText={(v) => setSim({ ...sim, last4: v.replace(/\D/g, ""), error: "" })} />
            <Field label="Name on the account" maxLength={120} autoComplete="off" autoCorrect={false} value={sim.account_name} onChangeText={(v) => setSim({ ...sim, account_name: v, error: "" })} />
            <Row gap={10} style={{ alignItems: "flex-start" }}>
              <McIcon name="shield" size={18} color={c.muted} />
              <Text style={[small, { flex: 1 }]}>Do not enter a full account number here. Only the last four digits are kept, to label the account. With a Stripe key, your bank details are entered on Stripe&apos;s own pages and never in this app.</Text>
            </Row>
          </>
        ) : null}
      </Sheet>

      {/* Nigeria: check whose account it is, then confirm and save */}
      <Sheet tall open={!!bank} onClose={() => setBank(null)} title={real.length ? "Add another bank account" : live && stale ? "Add your real bank account" : "Add a bank account"}
        sub={bank?.step === "resolved" ? "Check the name, then save." : live ? "We check the name with the bank before anything is saved." : "The name on it is checked, then you confirm."}
        footer={bank?.step === "resolved" ? (
          <View style={{ gap: 8 }}>
            <Btn busy={busy === "bank"} onPress={saveBank}>Save payout account</Btn>
            <Btn kind="out" disabled={busy === "bank"} onPress={() => setBank(NO_BANK)}>Use a different account</Btn>
          </View>
        ) : bank?.bank ? <Btn busy={busy === "bank"} onPress={checkBank}>{live ? "Check with the bank" : "Check the details"}</Btn> : undefined}>
        {bank ? (
          bank.step === "resolved" ? (
            <>
              {bank.error ? <Note kind="bad">{bank.error}</Note> : null}
              <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 12, borderRadius: 16, backgroundColor: c.okBg, padding: 14 }}>
                <Icon name="check" size={22} color={c.ok} stroke={2.4} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: f.semi, fontSize: 16, lineHeight: 22, color: c.ink }}>{bank.name}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 12.5, lineHeight: 18, color: c.ok }}>{bank.checked ? `Name returned by ${bank.bank?.name}` : "The name you typed. The bank was not asked, because this install has no Paystack key."}</Text>
                </View>
              </View>
              <Card style={{ paddingHorizontal: 16 }}>
                <Line name="Bank" value={bank.bank?.name ?? ""} />
                <Line last name="Account number" value={`···· ${bank.number.slice(-4)}`} />
              </Card>
              <Text style={small}>{accounts.length ? "The new account becomes your default. The one you have now stays on the list." : "It becomes the account your payouts are sent to."}</Text>
            </>
          ) : !bank.bank ? (
            <>
              <Field label="Bank" placeholder="Search for your bank" autoCorrect={false} autoComplete="off" value={bank.find} onChangeText={(v) => setBank({ ...bank, find: v })} />
              <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
                {found.slice(0, 40).map((b) => <Choice key={`${b.code}|${b.name}`} title={b.name} on={false} onPress={() => setBank({ ...bank, bank: b, error: "" })} />)}
              </View>
              {found.length > 40 ? <Text style={small}>{found.length - 40} more. Type a few letters of the name to narrow the list.</Text> : !found.length ? <Text style={small}>No bank matches that. Check the spelling.</Text> : null}
            </>
          ) : (
            <>
              {bank.error ? <Note kind="bad">{bank.error}</Note> : null}
              <Card style={{ paddingHorizontal: 16 }}>
                <Line last name="Bank" value={bank.bank.name} />
              </Card>
              <SmallBtn kind="out" onPress={() => setBank({ ...bank, bank: null, error: "" })} style={{ alignSelf: "flex-start" }}>Choose another bank</SmallBtn>
              <Field label="Account number" placeholder="10 digits" keyboardType="number-pad" maxLength={13} autoComplete="off" autoCorrect={false} value={bank.number} onChangeText={(v) => setBank({ ...bank, number: v.replace(/[^\d ]/g, ""), error: "" })} />
              {!live ? <Field label="Name on the account" maxLength={120} autoComplete="off" autoCorrect={false} value={bank.name} onChangeText={(v) => setBank({ ...bank, name: v, error: "" })} hint="With a Paystack key the bank returns this name. This install has none, so type it as it appears on the account." /> : null}
              <Row gap={10} style={{ alignItems: "flex-start" }}>
                <McIcon name="shield" size={18} color={c.muted} />
                <Text style={[small, { flex: 1 }]}>The full account number is used to check and register the account, and is not stored by LogaLuxe. We keep only the last four digits{live ? " and the Paystack recipient code" : ""}.</Text>
              </Row>
            </>
          )
        ) : null}
      </Sheet>
    </Screen>
  );
}
