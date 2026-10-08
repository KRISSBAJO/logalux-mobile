// Choosing a picture on the phone and sending it to the API as a file.
//
// The API takes a multipart form with the picture under "file" (POST /v1/m/storefront/photos,
// POST /v1/m/storefront/logo) and trusts the bytes, not the name: JPEG, PNG or WebP, up to 8 MB.
//
// A browser and a phone hand the picture over differently:
//  - in a browser the picker gives a real File (or a blob: address that can be fetched into one),
//    and FormData carries it as it is;
//  - on a phone the picker gives the address of a file on the device (file:// or content://).
//    React Native's FormData sends such a file when given {uri, name, type} in place of a Blob,
//    and writes the multipart boundary itself, so no Content-Type header is set by hand.
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { MAX_IMAGE_BYTES } from "./md-profile";

export type Picked = { uri: string; name: string; type: string; size: number; width: number; height: number; file?: Blob };

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", gif: "image/gif" };

function toPicked(a: ImagePicker.ImagePickerAsset, i: number): Picked {
  const ext = (/\.([a-z0-9]+)(?:\?|#|$)/i.exec(a.fileName ?? a.uri)?.[1] ?? "").toLowerCase();
  const type = (a.mimeType || a.file?.type || TYPE_BY_EXT[ext] || "image/jpeg").toLowerCase();
  const name = a.fileName || `photo-${Date.now()}-${i}.${EXT[type] ?? (ext || "jpg")}`;
  return { uri: a.uri, name, type, size: Number(a.fileSize ?? a.file?.size ?? 0), width: a.width, height: a.height, file: a.file };
}

export type PickResult = { photos: Picked[]; error: string };

/**
 * Opens the phone's photo library or its camera. Answers the chosen pictures, or a sentence saying
 * why none could be chosen. Closing the picker without choosing answers neither.
 * `quality` below 1 has the phone hand back a compressed copy, which also turns an iPhone's HEIC
 * photo into a JPEG the API accepts.
 */
export async function pickPhotos(from: "library" | "camera", many = 1): Promise<PickResult> {
  try {
    if (from === "camera") {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return { photos: [], error: perm.canAskAgain ? "LogaLuxe needs the camera to take a photo." : "The camera is switched off for LogaLuxe. Turn it on in your phone's settings, or choose a photo from your library instead." };
      }
      const out = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, exif: false });
      return { photos: out.canceled ? [] : out.assets.map(toPicked), error: "" };
    }
    // The system photo picker needs no permission on current iOS and Android: the app only sees what is chosen.
    const out = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, exif: false, allowsMultipleSelection: many > 1, selectionLimit: many > 1 ? many : 1 });
    return { photos: out.canceled ? [] : out.assets.slice(0, many).map(toPicked), error: "" };
  } catch (e) {
    const text = String((e as Error)?.message ?? "");
    return { photos: [], error: from === "camera" ? `The camera could not be opened${/simulator|not available|unavailable/i.test(text) ? " on this device" : ""}. Choose a photo from your library instead.` : "Your photos could not be opened. Try again." };
  }
}

/** A reason this picture would be refused, known before sending it. "" when it looks fine. */
export function refusal(p: Picked, what: "photo" | "image" = "photo"): string {
  if (p.size > MAX_IMAGE_BYTES) return `The ${what} is too large. The limit is 8 MB.`;
  if (p.type && !EXT[p.type] && Platform.OS === "web") return `Use a JPEG, PNG or WebP ${what}.`;
  return "";
}

/** The multipart form the API expects: the picture under "file", plus any text fields. */
export async function photoForm(p: Picked, fields: Record<string, string> = {}): Promise<FormData> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (Platform.OS === "web") {
    const blob = p.file ?? (await (await fetch(p.uri)).blob());
    form.append("file", blob, p.name);
  } else {
    // React Native's own way of naming a file on the device. Its FormData reads the file when the request is sent.
    form.append("file", { uri: p.uri, name: p.name, type: EXT[p.type] ? p.type : "image/jpeg" } as unknown as Blob);
  }
  return form;
}
