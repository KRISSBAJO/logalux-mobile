// Talks to the LogaLuxe API. The app calls it directly with the signed-in person's token.
// Set EXPO_PUBLIC_API_URL to the API's address (a phone cannot reach "localhost" on your computer:
// use the computer's network address, or the public address once deployed).

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:18080").replace(/\/+$/, "");
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3100").replace(/\/+$/, "");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Row = {}) {
    super(message);
  }
}

// The API writes its sentences in lower case with no full stop, to be dropped into any sentence.
// Shown on their own they read better as sentences.
const sentence = (s: string) => {
  const t = s.trim();
  if (!t) return "Something went wrong.";
  const up = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(up) ? up : up + ".";
};

type Options = { method?: string; body?: unknown; token?: string | null; form?: FormData };

/** One call to the API. `path` starts after /v1, for example "/businesses/ada". */
export async function api<T = Row>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined && !opts.form) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    });
  } catch {
    throw new ApiError(0, "We could not reach LogaLuxe. Check your connection and try again.");
  }
  const text = await res.text();
  let json: Row = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // not JSON: a calendar file or an image
  }
  if (!res.ok) throw new ApiError(res.status, sentence(String(json.error ?? "")), json);
  return json as T;
}

/** The address of an uploaded picture. */
export const media = (id?: string | null) => (id ? `${API_URL}/v1/media/${id}` : undefined);

/** Builds a query string, leaving out empty values. */
export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
