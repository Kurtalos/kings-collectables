import type { Card, ImportInput } from "./types";

export type ScryfallCard = {
  id: string; name: string; set: string; set_name: string; collector_number: string; rarity: string;
  colors?: string[]; type_line: string; mana_cost?: string; oracle_text?: string;
  image_uris?: { normal: string; art_crop: string };
  card_faces?: { image_uris?: { normal: string; art_crop: string }; colors?: string[]; oracle_text?: string }[];
  prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null };
  tcgplayer_id?: number | null;
  tcgplayer_etched_id?: number | null;
};
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;
async function scryfallFetch(path: string, body?: unknown, attempt = 0): Promise<unknown> {
  try {
    const response = await fetch(`https://api.scryfall.com${path}`, {
      method: body ? "POST" : "GET",
      headers: { "User-Agent": "ManaVaultStore/1.0 (independent card catalogue)", "Accept": "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(45000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(response.status === 429 ? "Scryfall is temporarily rate-limited. Please wait 30 seconds and try again." : result.details || "The card service could not resolve this card.");
    return result;
  } catch (error) {
    // One retry with backoff keeps the daily sync resilient to transient network stalls.
    if (attempt === 0 && !(error instanceof Error && error.message.includes("rate-limited"))) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return scryfallFetch(path, body, 1);
    }
    throw error;
  }
}
export async function scryfallRequest(path: string, body?: unknown): Promise<unknown> {
  const task = queue.catch(() => {}).then(async () => {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 550 - (Date.now() - lastCall))));
    lastCall = Date.now();
    return scryfallFetch(path, body);
  });
  queue = task;
  return task;
}

export type CardMetadata = Omit<Card, "id" | "createdAt" | "categoryIds" | "quantity" | "price" | "condition" | "finish" | "priceMode" | "usdPrice" | "priceUpdatedAt">;
export function cardMetadata(card: ScryfallCard): CardMetadata {
  const images = card.image_uris || card.card_faces?.[0]?.image_uris;
  if (!images) throw new Error("This printing doesn't have a card image yet.");
  return {
    scryfallId: card.id, name: card.name, setCode: card.set, setName: card.set_name, collectorNumber: card.collector_number,
    imageUrl: images.normal, artUrl: images.art_crop, rarity: card.rarity, colors: card.colors || card.card_faces?.[0]?.colors || [],
    typeLine: card.type_line, manaCost: card.mana_cost || "", oracleText: card.oracle_text || card.card_faces?.[0]?.oracle_text || "", featured: false,
  };
}
export async function lookupCard(name: string, set?: string) {
  return cardMetadata(await scryfallRequest(`/cards/named?exact=${encodeURIComponent(name)}${set ? `&set=${encodeURIComponent(set)}` : ""}`) as ScryfallCard);
}
export function identifier(input: ImportInput): Record<string, string> {
  if (input.scryfall_id?.trim()) return { id: input.scryfall_id.trim() };
  if (input.set?.trim() && input.collector_number?.trim()) return { set: input.set.trim().toLowerCase(), collector_number: input.collector_number.trim() };
  return { name: input.name?.trim() || "", ...(input.set?.trim() ? { set: input.set.trim().toLowerCase() } : {}) };
}
export function matchesCard(input: ImportInput, card: { scryfallId: string; name: string; setCode: string; collectorNumber: string }) {
  if (input.scryfall_id?.trim()) return card.scryfallId === input.scryfall_id.trim();
  if (input.set?.trim() && input.collector_number?.trim()) return card.setCode === input.set.trim().toLowerCase() && card.collectorNumber === input.collector_number.trim();
  return card.name.toLowerCase() === input.name?.trim().toLowerCase() && (!input.set?.trim() || card.setCode === input.set.trim().toLowerCase());
}
