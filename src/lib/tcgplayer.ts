import type { ScryfallCard } from "./scryfall";

const API_VERSION = "v1.39.0";
const BASE = `https://api.tcgplayer.com/${API_VERSION}`;
const BATCH_SIZE = 100;             // pricing endpoint accepts many ids per call; stay well under any per-day quota
const REQUEST_GAP_MS = 150;         // ~6.6 req/s, safely under the documented hard limits
const TOKEN_MARGIN_MS = 60 * 60 * 1000; // refresh the token an hour before expiry

export type TcgPriceRow = {
  productId: number;
  marketPrice: number | null;
  midPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  directLowPrice: number | null;
  subTypeName: string;
};
export type PriceSource = "auto" | "tcgplayer" | "scryfall";

let cachedToken: { token: string; expiresAt: number } | null = null;
let lastRequestAt = 0;

export function tcgplayerConfigured() {
  return Boolean(process.env.TCGPLAYER_PUBLIC_KEY && process.env.TCGPLAYER_PRIVATE_KEY);
}

export function resolvePriceSource(preferred: PriceSource): "tcgplayer" | "scryfall" {
  if (preferred === "tcgplayer") {
    if (!tcgplayerConfigured()) throw new Error("TCGplayer pricing needs TCGPLAYER_PUBLIC_KEY and TCGPLAYER_PRIVATE_KEY set in the server .env. Choose ‘Scryfall’ or ‘Automatic’ instead.");
    return "tcgplayer";
  }
  return preferred === "auto" && tcgplayerConfigured() ? "tcgplayer" : "scryfall";
}

async function throttle() {
  const wait = Math.max(0, lastRequestAt + REQUEST_GAP_MS - Date.now());
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_MARGIN_MS) return cachedToken.token;
  await throttle();
  const response = await fetch("https://api.tcgplayer.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.TCGPLAYER_PUBLIC_KEY || "",
      client_secret: process.env.TCGPLAYER_PRIVATE_KEY || "",
    }),
    cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    cachedToken = null;
    throw new Error(`TCGplayer rejected the developer credentials (${response.status}). Check TCGPLAYER_PUBLIC_KEY and TCGPLAYER_PRIVATE_KEY. ${detail.slice(0, 160)}`);
  }
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("TCGplayer token response was missing access_token.");
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ? data.expires_in * 1000 : 14 * 24 * 60 * 60 * 1000) };
  return cachedToken.token;
}

async function tcgFetch(path: string, allowRetry = true): Promise<{ success?: boolean; results?: TcgPriceRow[]; errors?: string[] }> {
  const token = await getToken();
  await throttle();
  const response = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `bearer ${token}`, Accept: "application/json" },
    cache: "no-store", signal: AbortSignal.timeout(25000),
  });
  if (response.status === 401 && allowRetry) { cachedToken = null; return tcgFetch(path, false); }
  if (response.status === 429 && allowRetry) { await new Promise(resolve => setTimeout(resolve, 2000)); return tcgFetch(path, false); }
  if (response.status >= 500 && allowRetry) { await new Promise(resolve => setTimeout(resolve, 2000)); return tcgFetch(path, false); }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`TCGplayer pricing request failed (${response.status}). ${detail.slice(0, 160)}`);
  }
  const data = await response.json();
  if (data.success === false && allowRetry) { await new Promise(resolve => setTimeout(resolve, 2000)); return tcgFetch(path, false); }
  return data;
}

/**Fetch market price rows for up to BATCH_SIZE product ids per request. Returns a map of productId → rows (a row exists per subType like "Normal" and "Foil"). */
export async function getMarketPrices(productIds: number[]): Promise<Map<number, TcgPriceRow[]>> {
  const unique = [...new Set(productIds.filter(id => Number.isInteger(id) && id > 0))];
  const result = new Map<number, TcgPriceRow[]>();
  for (let start = 0; start < unique.length; start += BATCH_SIZE) {
    const chunk = unique.slice(start, start + BATCH_SIZE);
    const data = await tcgFetch(`/pricing/product/${chunk.join(",")}`);
    for (const row of data.results || []) {
      if (!Number.isInteger(row.productId)) continue;
      result.set(row.productId, [...(result.get(row.productId) || []), row]);
    }
  }
  return result;
}

/**Which TCGplayer product should we price a given print/finish against? Etched foils live under a separate product when Scryfall knows it; everything else uses tcgplayer_id. (Null means the card isn't mapped — it will fall back to Scryfall USD.) */
export function pickProductId(card: Pick<ScryfallCard, "tcgplayer_id" | "tcgplayer_etched_id">, finish: string): number | null {
  if (finish === "Etched" && typeof card.tcgplayer_etched_id === "number") return card.tcgplayer_etched_id;
  return typeof card.tcgplayer_id === "number" ? card.tcgplayer_id : null;
}

/**Pick the correct subType row for a finish. Non-foil and Etched both price from the "Normal" row at TCGplayer — etched sits under its own productId already. Foils price from the "Foil" row; fall back to the Normal row only when the Foil row carries no usable price. */
export function matchPriceRow(rows: TcgPriceRow[], finish: string): TcgPriceRow | null {
  if (!rows.length) return null;
  const usable = (row: TcgPriceRow) => row.marketPrice != null || row.midPrice != null || row.lowPrice != null;
  const wantFoil = finish === "Foil";
  if (wantFoil) {
    const foil = rows.find(row => /foil/i.test(row.subTypeName) && usable(row));
    if (foil) return foil;
  }
  const normal = rows.find(row => /^normal$/i.test(row.subTypeName) && usable(row));
  if (normal) return normal;
  return rows.find(usable) || null;
}

/**Best representative price in cents: marketPrice first, then midPrice, then lowPrice. */
export function rowPriceCents(row: TcgPriceRow): number | null {
  for (const value of [row.marketPrice, row.midPrice, row.lowPrice]) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value * 100);
  }
  return null;
}
