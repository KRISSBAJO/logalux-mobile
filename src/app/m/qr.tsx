// The booking link as a QR code, large enough to scan off the screen, with the link under it to
// copy or share, and the snippets that put a booking button on the business's own website.
// The same link and snippets as the "Share your booking page" card of the web's Storefront tool.
import { useState } from "react";
import { Linking, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Grp, Header, McIcon, SmallBtn, Wait } from "@/components/mc-kit";
import { MdIcon, said, useSaid } from "@/components/md-kit";
import { Card, Note, Row, Screen, T } from "@/components/ui";
import { WEB_URL } from "@/lib/api";
import { copyText, isLocalAddress, shareText } from "@/lib/mc-util";
import { shareKit } from "@/lib/md-profile";
import { useSession } from "@/lib/session";
import { c, f, pad } from "@/lib/theme";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, Consolas, monospace" });

function Code({ text, label }: { text: string; label: string }) {
  return (
    <View accessible accessibilityLabel={label} style={{ backgroundColor: c.ink, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Text selectable style={{ fontFamily: MONO, fontSize: 12, lineHeight: 18, color: "#F4ECE3" }}>{text}</Text>
    </View>
  );
}

export default function BookingQr() {
  const s = useSession();
  const m = s.merchant;
  const { width } = useWindowDimensions();
  const [note, setNote] = useSaid();
  const [qrFailed, setQrFailed] = useState(false);
  if (!m) return <Screen><Header title="QR code and link" /><Wait /></Screen>;

  const kit = shareKit(WEB_URL, String(m.slug), String(m.business ?? ""));
  const live = m.status === "live";
  const size = Math.max(200, Math.min(width - pad * 2 - 48, 300));
  const shown = kit.link.replace(/^https?:\/\//, "");

  const copy = async (text: string, what: string) => {
    const out = await copyText(text);
    setNote(out === "copied" ? { kind: "ok", text: `${what} copied.` } : { kind: "bad", text: `${what} could not be copied. Press and hold the text to select it instead.` });
  };
  const share = async () => {
    const out = await shareText(`Book with ${m.business} on LogaLuxe:`, kit.link);
    if (out === "copied") setNote({ kind: "ok", text: "This browser has no share sheet, so the link was copied instead." });
  };

  return (
    <Screen footer={said(note)}>
      <Header title="QR code and link" />

      {!live ? <View style={{ marginTop: 12 }}><Note kind="gold">{m.status === "paused" ? "Your page is paused, so clients who scan this code cannot book until you bring it back." : "Your page is not live yet, so clients who scan this code cannot book. It starts working once LogaLuxe has approved your business."}</Note></View> : null}
      {isLocalAddress(kit.link) ? <View style={{ marginTop: 12 }}><Note kind="gold">{`This link is at a local address (${WEB_URL.replace(/^https?:\/\//, "")}), which only this computer can open. The link, the QR code and the snippets will work once LogaLuxe is on the internet.`}</Note></View> : null}

      <Card style={{ marginTop: 14, paddingVertical: 24, paddingHorizontal: 24, alignItems: "center", gap: 14 }}>
        <Text accessibilityRole="header" style={{ fontFamily: f.serifBold, fontSize: 22, lineHeight: 26, color: c.ink, textAlign: "center" }}>{m.business}</Text>
        <View accessible accessibilityRole="image" accessibilityLabel={`QR code that opens ${kit.link}`} style={{ backgroundColor: c.white }}>
          {qrFailed ? <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}><T muted center>The QR code could not be drawn. Use the link below.</T></View>
            : <QRCode value={kit.link} size={size} color={c.ink} backgroundColor={c.white} quietZone={8} ecl="M" onError={() => setQrFailed(true)} />}
        </View>
        <T size={13} muted center>Clients point their phone camera at this and your booking page opens.</T>
      </Card>

      <Row gap={8} style={{ backgroundColor: "#F4ECE2", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginTop: 12 }}>
        <McIcon name="link" size={18} color={c.wine} />
        <Text selectable style={{ flex: 1, minWidth: 0, fontFamily: f.semi, fontSize: 15, lineHeight: 21, color: c.ink }}>{shown}</Text>
      </Row>
      <Row gap={8} style={{ marginTop: 10 }}>
        <SmallBtn kind="ink" style={{ flex: 1 }} onPress={() => copy(kit.link, "Link")}>Copy link</SmallBtn>
        <SmallBtn kind="out" icon="share" style={{ flex: 1 }} onPress={share}>Share</SmallBtn>
      </Row>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(kit.link).catch(() => setNote({ kind: "bad", text: "Your page could not be opened from here." }))} style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ fontFamily: f.semi, fontSize: 13, color: c.wine }}>See your page</Text>
        <McIcon name="external" size={14} color={c.wine} />
      </Pressable>
      <T size={12} muted>Show the code at your chair or front desk, or put the link in your Instagram bio, your WhatsApp status and your messages to clients. Bookings made this way count as your own link, so no new-client fee applies to them.</T>

      <Grp style={{ marginTop: 24 }}>Booking button for your own website</Grp>
      <Card style={{ padding: 16, gap: 12 }}>
        <Row gap={10} style={{ alignItems: "flex-start" }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F4ECE2", alignItems: "center", justifyContent: "center" }}><MdIcon name="code" /></View>
          <T size={13} muted style={{ flex: 1 }}>Paste this into your page where you want the booking button to show. Send it to whoever looks after your website.</T>
        </Row>
        <Code text={kit.script} label="Snippet for your website" />
        <SmallBtn kind="ink" onPress={() => copy(kit.script, "Snippet")} style={{ alignSelf: "flex-start" }}>Copy snippet</SmallBtn>
        <View style={{ gap: 6 }}>
          <T size={12} muted><Text style={{ fontFamily: MONO, color: c.ink }}>{"data-label=\"Book now\""}</Text> changes the words on the button. Leave it out to keep the standard words.</T>
          <T size={12} muted><Text style={{ fontFamily: MONO, color: c.ink }}>{"data-color=\"#7A1F2B\""}</Text> changes the colour of the button. Leave it out to keep the standard colour.</T>
        </View>
      </Card>

      <Grp>If your site builder does not allow scripts</Grp>
      <Card style={{ padding: 16, gap: 12 }}>
        <T size={13} muted>Use this instead. It shows the booking page inside a frame on your page.</T>
        <Code text={kit.frame} label="Frame snippet for your website" />
        <SmallBtn kind="ink" onPress={() => copy(kit.frame, "Snippet")} style={{ alignSelf: "flex-start" }}>Copy snippet</SmallBtn>
        <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, gap: 8 }}>
          <T size={13} muted>Some builders ask only for an address. Give them this one:</T>
          <Text selectable style={{ fontFamily: f.semi, fontSize: 13, lineHeight: 19, color: c.ink }}>{kit.embed.replace(/^https?:\/\//, "")}</Text>
          <Row gap={8} wrap>
            <SmallBtn kind="out" onPress={() => copy(kit.embed, "Address")}>Copy address</SmallBtn>
            <SmallBtn kind="out" onPress={() => Linking.openURL(kit.embed).catch(() => setNote({ kind: "bad", text: "The page could not be opened from here." }))}>Open it</SmallBtn>
          </Row>
        </View>
      </Card>
    </Screen>
  );
}
