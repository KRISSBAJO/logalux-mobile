// Renders an article's Markdown as native text: headings in the serif, paragraphs at 17 on a 26 line,
// bold, italic, links, bullet and numbered lists, block quotes as pull quotes, pictures by media id.
// Anything it does not understand is shown as the plain words it was written as: nothing is injected.
import { router } from "expo-router";
import { Fragment } from "react";
import { Image, Linking, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { media, WEB_URL } from "./api";
import { c, f, pad } from "./theme";

// ---------- blocks ----------

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "image"; alt: string; src: string }
  | { kind: "code"; text: string }
  | { kind: "rule" };

/** Cuts the Markdown into blocks, top to bottom. */
export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "paragraph", text: para.join(" ").trim() });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flush(); continue; }
    let m: RegExpMatchArray | null;
    if (t.startsWith("```")) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) code.push(lines[i]);
      out.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    if ((m = t.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { flush(); out.push({ kind: "heading", level: m[1].length, text: m[2] }); continue; }
    if (/^([-*_])\s*(\1\s*){2,}$/.test(t)) { flush(); out.push({ kind: "rule" }); continue; }
    if ((m = t.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/))) { flush(); out.push({ kind: "image", alt: m[1], src: m[2] }); continue; }
    if (t.startsWith(">")) {
      flush();
      const q: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith(">"); i++) q.push(lines[i].trim().replace(/^>\s?/, ""));
      i--;
      out.push({ kind: "quote", text: q.join(" ").trim() });
      continue;
    }
    const bullet = /^\s*[-*+]\s+/, number = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || number.test(line)) {
      flush();
      const ordered = number.test(line), re = ordered ? number : bullet;
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const l = lines[i];
        if (re.test(l)) items.push(l.replace(re, "").trim());
        else if (l.trim() && /^\s+/.test(l) && items.length) items[items.length - 1] += " " + l.trim(); // a wrapped item
        else break;
      }
      i--;
      out.push({ kind: "list", ordered, items });
      continue;
    }
    para.push(t);
  }
  flush();
  return out;
}

/** The "##" headings, for a table of contents. */
export const headings = (md: string) => parseBlocks(md).filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading" && b.level === 2).map((b) => b.text);

// ---------- inline ----------

type Inline = { kind: "text"; text: string } | { kind: "bold" | "italic"; children: Inline[] } | { kind: "code"; text: string } | { kind: "link"; href: string; children: Inline[] };

const INLINE = /(\*\*(.+?)\*\*|__(.+?)__|\*([^*\n]+?)\*|_([^_\n]+?)_|`([^`]+?)`|!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\[([^\]]+?)\]\(([^)\s]+)(?:\s+"[^"]*")?\))/;

/** Splits a run of text into words, bold, italic, code and links. Markup it cannot place stays as written. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    const m = rest.match(INLINE);
    if (!m || m.index === undefined) { out.push({ kind: "text", text: rest }); break; }
    // An underscore or a star inside a word (snake_case, 2*3) is not emphasis: keep the character and read on.
    const emphasis = m[3] !== undefined || m[4] !== undefined || m[5] !== undefined;
    const word = /\w/;
    if (emphasis && (word.test(rest[m.index - 1] ?? "") || word.test(rest[m.index + m[0].length] ?? ""))) {
      out.push({ kind: "text", text: rest.slice(0, m.index + 1) });
      rest = rest.slice(m.index + 1);
      continue;
    }
    if (m.index > 0) out.push({ kind: "text", text: rest.slice(0, m.index) });
    if (m[2] !== undefined) out.push({ kind: "bold", children: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ kind: "bold", children: parseInline(m[3]) });
    else if (m[4] !== undefined) out.push({ kind: "italic", children: parseInline(m[4]) });
    else if (m[5] !== undefined) out.push({ kind: "italic", children: parseInline(m[5]) });
    else if (m[6] !== undefined) out.push({ kind: "code", text: m[6] });
    else if (m[8] !== undefined) out.push({ kind: "text", text: m[7] }); // a picture inside a sentence: its words
    else if (m[10] !== undefined) out.push({ kind: "link", href: m[10], children: parseInline(m[9]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

/** The words alone, with every mark stripped: for a summary line or a label. */
export const plainText = (text: string): string => parseInline(text).map((n) => (n.kind === "text" || n.kind === "code" ? n.text : plainText(n.children.map(inlineSource).join("")))).join("");
const inlineSource = (n: Inline): string => (n.kind === "text" || n.kind === "code" ? n.text : n.children.map(inlineSource).join(""));

// ---------- where a link goes ----------

/** The address of a picture written as `media:<id>`, `/media/<id>` or a full address. */
export function imageSrc(src: string): string | undefined {
  if (src.startsWith("media:")) return media(src.slice(6));
  const m = src.match(/^\/media\/([^/?#]+)/);
  if (m) return media(m[1]);
  return /^https?:\/\//i.test(src) ? src : undefined;
}

/** Opens a link: another article or a business inside the app, a page of the website in the browser, anything else as it is. */
export function openLink(href: string) {
  const h = href.trim();
  let m: RegExpMatchArray | null;
  if ((m = h.match(/^\/journal\/([^/?#]+)\/?$/))) { router.push(`/c/journal/${m[1]}` as never); return; }
  if (/^\/journal\/?$/.test(h)) { router.push("/c/journal" as never); return; }
  if ((m = h.match(/^\/b\/([^/?#]+)\/?$/))) { router.push(`/c/b/${m[1]}` as never); return; }
  if (h.startsWith("/")) { void Linking.openURL(WEB_URL + h).catch(() => undefined); return; }
  if (/^(https?:\/\/|mailto:|tel:)/i.test(h)) { void Linking.openURL(h).catch(() => undefined); return; }
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(h)) { void Linking.openURL(`https://${h}`).catch(() => undefined); return; }
}

// ---------- drawing ----------

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.kind === "text") return <Fragment key={i}>{n.text}</Fragment>;
        if (n.kind === "code") return <Text key={i} style={styles.code}>{n.text}</Text>;
        if (n.kind === "bold") return <Text key={i} style={{ fontFamily: f.bold }}><Inlines nodes={n.children} /></Text>;
        if (n.kind === "italic") return <Text key={i} style={{ fontStyle: "italic" }}><Inlines nodes={n.children} /></Text>;
        if (n.kind === "link") return <Text key={i} accessibilityRole="link" onPress={() => openLink(n.href)} style={styles.link}><Inlines nodes={n.children} /></Text>;
        return null;
      })}
    </>
  );
}

/** One run of inline Markdown as text, in the given style. */
export function MdText({ text, style }: { text: string; style?: object }) {
  return <Text style={[styles.body, style]}><Inlines nodes={parseInline(text)} /></Text>;
}

function Picture({ alt, src }: { alt: string; src: string }) {
  const { width } = useWindowDimensions();
  const uri = imageSrc(src);
  const w = Math.min(width, 600) - pad * 2;
  if (!uri) return alt ? <Text style={[styles.body, styles.caption]}>{alt}</Text> : null;
  return (
    <View style={{ marginVertical: 8, marginBottom: 22 }}>
      <Image source={{ uri }} accessibilityLabel={alt || "Picture"} resizeMode="cover" style={{ width: w, height: Math.round(w * 0.66), borderRadius: 16, backgroundColor: c.cream2 }} />
      {alt ? <Text style={styles.caption}>{alt}</Text> : null}
    </View>
  );
}

/** The article body. */
export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source || "");
  return (
    <View>
      {blocks.map((b, i) => {
        const first = i === 0;
        switch (b.kind) {
          case "heading": {
            const size = b.level <= 1 ? 28 : b.level === 2 ? 24 : 19;
            return <Text key={i} accessibilityRole="header" style={{ fontFamily: b.level <= 1 ? f.serif : f.serifBold, fontSize: size, lineHeight: Math.round(size * 1.2), color: c.ink, marginTop: first ? 0 : b.level <= 2 ? 30 : 22, marginBottom: 10 }}><Inlines nodes={parseInline(b.text)} /></Text>;
          }
          case "paragraph":
            return <Text key={i} style={[styles.body, { marginBottom: 18 }]}><Inlines nodes={parseInline(b.text)} /></Text>;
          case "quote":
            return (
              <View key={i} style={styles.quote}>
                <Text style={styles.quoteText}><Inlines nodes={parseInline(b.text)} /></Text>
              </View>
            );
          case "list":
            return (
              <View key={i} style={{ gap: 8, marginBottom: 18 }}>
                {b.items.map((item, n) => (
                  <View key={n} style={{ flexDirection: "row", gap: 12, paddingRight: 4 }}>
                    {b.ordered
                      ? <Text style={[styles.body, { fontFamily: f.semi, minWidth: 22, textAlign: "right" }]}>{n + 1}.</Text>
                      : <View style={{ width: 22, alignItems: "flex-end" }}><View style={styles.dot} /></View>}
                    <Text style={[styles.body, { flex: 1 }]}><Inlines nodes={parseInline(item)} /></Text>
                  </View>
                ))}
              </View>
            );
          case "image":
            return <Picture key={i} alt={b.alt} src={b.src} />;
          case "code":
            return <View key={i} style={styles.codeBlock}><Text style={[styles.body, { fontSize: 15, lineHeight: 22 }]}>{b.text}</Text></View>;
          case "rule":
            return <View key={i} style={{ height: 1, backgroundColor: c.line, marginVertical: 22 }} />;
          default:
            return null;
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: f.body, fontSize: 17, lineHeight: 26, color: c.ink },
  link: { fontFamily: f.semi, color: c.wine, textDecorationLine: "underline", textDecorationColor: c.gold },
  code: { fontFamily: f.medium, backgroundColor: c.cream2, borderRadius: 4 },
  codeBlock: { backgroundColor: c.cream2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18 },
  quote: { borderLeftWidth: 3, borderLeftColor: c.gold, paddingLeft: 16, marginVertical: 8, marginBottom: 24 },
  quoteText: { fontFamily: f.serifItalic, fontSize: 21, lineHeight: 30, color: c.ink },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.gold, marginTop: 10 },
  caption: { fontFamily: f.body, fontSize: 13, lineHeight: 18, color: c.muted, marginTop: 8 },
});
