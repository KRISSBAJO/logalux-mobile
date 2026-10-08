// Hands a real file to the person: a download in a browser, the system share sheet on a phone
// (Save to Files, Mail, WhatsApp, Drive, AirDrop and whatever else the phone offers for that kind of file).
// On a phone the file is first written to the app's cache folder, which the system may empty when it likes.
import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/**
 * What became of the file.
 * - "saved": a browser was told to download it.
 * - "shared": the phone's share sheet was opened with the file and has closed again. The system does not
 *   say whether the person sent it somewhere or backed out, so do not claim either.
 * - "unavailable": this device has no way to share a file.
 * - "failed": the file could not be written or handed over.
 */
export type FileStatus = "shared" | "saved" | "unavailable" | "failed";

export type FileToShare = { name: string; mime: string } & ({ text: string; base64?: undefined } | { base64: string; text?: undefined });

/** Apple's name for a kind of file, which the iPhone share sheet uses to decide which apps to offer. */
const UTI: Record<string, string> = {
  "text/csv": "public.comma-separated-values-text",
  "image/png": "public.png",
  "image/jpeg": "public.jpeg",
  "application/pdf": "com.adobe.pdf",
  "text/plain": "public.plain-text",
};

/** A file name that is safe on every phone and computer: no folders, no odd characters. */
export const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(0, 120) || "file";

/** A CSV as text with the mark at its start that makes Excel read names and currency signs correctly. */
export const csvText = (text: string) => "﻿" + text.replace(/^﻿/, "");

function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const bin = globalThis.atob(base64.replace(/^data:[^,]*,/, "").replace(/\s+/g, ""));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function download(file: FileToShare, name: string, type: string): FileStatus {
  const g = globalThis as unknown as { document?: Document; URL: typeof URL; Blob: typeof Blob };
  if (!g.document) return "unavailable";
  const blob = new g.Blob([file.base64 !== undefined ? bytesOf(file.base64) : file.text], { type: file.base64 !== undefined ? type : `${type};charset=utf-8` });
  const url = g.URL.createObjectURL(blob);
  const a = g.document.createElement("a");
  a.href = url; a.download = name; a.style.display = "none";
  g.document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => g.URL.revokeObjectURL(url), 2000);
  return "saved";
}

/** Hands over a file made from text (`text`) or from bytes written as base64 (`base64`). Never throws. */
export async function shareFile(file: FileToShare): Promise<FileStatus> {
  const name = safeName(file.name);
  const type = file.mime.split(";")[0].trim();
  try {
    if (Platform.OS === "web") return download(file, name, type);
    if (!(await Sharing.isAvailableAsync())) return "unavailable";
    const out = new File(Paths.cache, name);
    out.create({ overwrite: true, intermediates: true });
    if (file.base64 !== undefined) out.write(file.base64.replace(/^data:[^,]*,/, ""), { encoding: "base64" });
    else out.write(file.text);
    await Sharing.shareAsync(out.uri, { mimeType: type, UTI: UTI[type], dialogTitle: name });
    return "shared";
  } catch {
    return "failed";
  }
}
