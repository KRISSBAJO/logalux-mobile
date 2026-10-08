// Share your booking page: the public link, to copy or to send through the phone's share sheet.
// The QR code and the website snippets have their own screen, /m/qr.
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { Grp, Header, Item, McIcon, SmallBtn, Wait } from "@/components/mc-kit";
import { Card, Note, Row, Screen, T } from "@/components/ui";
import { bookingLink, copyText, isLocalAddress, openWeb, shareText } from "@/lib/mc-util";
import { useSession } from "@/lib/session";
import { c, f } from "@/lib/theme";

export default function SharePage() {
  const s = useSession();
  const m = s.merchant;
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  if (!m) return <Screen><Header title="Share your page" /><Wait /></Screen>;

  const link = bookingLink(m.slug);
  const live = m.status === "live";
  const copy = async () => {
    const out = await copyText(link);
    setNote(out === "copied" ? { kind: "ok", text: "Link copied." } : out === "failed" ? { kind: "bad", text: "The link could not be copied. Press and hold it to select it instead." } : null);
  };
  const share = async () => {
    const out = await shareText(`Book with ${m.business} on LogaLuxe:`, link);
    setNote(out === "copied" ? { kind: "ok", text: "This browser has no share sheet, so the link was copied instead." } : null);
  };

  return (
    <Screen>
      <Header title="Share your page" />
      <T muted size={14} style={{ marginTop: 10 }}>Put this link in your Instagram bio, your WhatsApp status and your messages to clients. They book straight into your calendar.</T>

      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {!live ? <View style={{ marginTop: 12 }}><Note kind="gold">Your page is not live yet, so clients who open this link cannot book. It starts working once LogaLuxe has approved your business.</Note></View> : null}
      {isLocalAddress(link) ? <View style={{ marginTop: 12 }}><Note kind="gold">This link is at a local address, which only this computer can open. It will work for clients once LogaLuxe is on the internet.</Note></View> : null}

      <Grp>Your link</Grp>
      <Row gap={8} style={{ backgroundColor: "#F4ECE2", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
        <McIcon name="link" size={18} color={c.wine} />
        <Text selectable style={{ flex: 1, minWidth: 0, fontFamily: f.semi, fontSize: 15, lineHeight: 21, color: c.ink }}>{link.replace(/^https?:\/\//, "")}</Text>
        <SmallBtn kind="ink" onPress={copy}>Copy</SmallBtn>
      </Row>
      <Row gap={8} style={{ marginTop: 12 }}>
        <SmallBtn kind="out" icon="share" style={{ flex: 1 }} onPress={share}>Share</SmallBtn>
        <SmallBtn kind="out" style={{ flex: 1 }} onPress={() => Linking.openURL(link).catch(() => undefined)}>Open my page</SmallBtn>
      </Row>
      <T size={12} muted style={{ marginTop: 10 }}>Bookings made through your own link count as yours, so no new-client fee applies to them.</T>

      <Grp style={{ marginTop: 22 }}>More ways to share</Grp>
      <Card>
        <Item last title="QR code and website button" sub="Show the code, or add booking to your own site" onPress={() => router.push("/m/qr" as never)} />
      </Card>
    </Screen>
  );
}
