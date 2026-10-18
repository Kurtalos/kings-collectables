import { db } from "@/db";
import { products, priceEvents, storeMeta } from "@/db/schema";
import { eq, sql, desc, inArray } from "drizzle-orm";
import { scryfallRequest, type ScryfallCard } from "./scryfall";
import { resolvePriceSource, getMarketPrices, pickProductId, matchPriceRow, rowPriceCents, type TcgPriceRow } from "./tcgplayer";
import { CONDITIONS, type PricingSettings, type FxRate, type PriceRun, type PriceEvent } from "./types";

const SETTINGS_KEY = "pricing.settings";
const LAST_RUN_KEY = "pricing.lastRun";
const LAST_FX_KEY = "pricing.lastFx";
const BATCH = 75;
const DEFAULT_MULTIPLIERS: Record<string, number> = {
  "Near mint": 1,
  "Lightly played": 0.85,
  "Moderately played": 0.7,
  "Heavily played": 0.5,
  "Damaged": 0.35,
};
export const DEFAULT_SETTINGS: PricingSettings = {
  autoFx: true, rate: 1.5, markupPct: 15, roundingCents: 50, conditionMultipliers: DEFAULT_MULTIPLIERS, priceSource: "auto",
};

async function readMeta<T>(key: string): Promise<T | null> {
  const [row] = await db.select().from(storeMeta).where(eq(storeMeta.key, key)).limit(1);
  if (!row) return null;
  try { return JSON.parse(row.value) as T; } catch { return null; }
}
async function writeMeta(key: string, value: unknown) {
  await db.insert(storeMeta).values({ key, value: JSON.stringify(value) }).onConflictDoUpdate({ target: [storeMeta.key], set: { value: JSON.stringify(value) } });
}

export async function getPricingSettings(): Promise<PricingSettings> {
  const stored = await readMeta<Partial<PricingSettings>>(SETTINGS_KEY);
  if (!stored) return DEFAULT_SETTINGS;
  return validateSettings({ ...DEFAULT_SETTINGS, ...stored }, false);
}
export function validateSettings(input: Partial<PricingSettings>, strict = true): PricingSettings {
  const multipliers: Record<string, number> = {};
  for (const condition of CONDITIONS) {
    const fallback = DEFAULT_MULTIPLIERS[condition];
    const raw = input.conditionMultipliers?.[condition];
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
    if (strict && (value < 0.05 || value > 1)) throw new Error(`The ${condition} multiplier must be between 0.05 and 1.00.`);
    multipliers[condition] = Math.min(1, Math.max(0.05, value));
  }
  const settings: PricingSettings = {
    autoFx: input.autoFx === true,
    rate: typeof input.rate === "number" && Number.isFinite(input.rate) ? input.rate : DEFAULT_SETTINGS.rate,
    markupPct: typeof input.markupPct === "number" && Number.isFinite(input.markupPct) ? input.markupPct : DEFAULT_SETTINGS.markupPct,
    roundingCents: Number.isInteger(input.roundingCents) ? Number(input.roundingCents) : DEFAULT_SETTINGS.roundingCents,
    conditionMultipliers: multipliers,
    priceSource: ["auto", "tcgplayer", "scryfall"].includes(String(input.priceSource)) ? input.priceSource as PricingSettings["priceSource"] : DEFAULT_SETTINGS.priceSource,
  };
  if (strict) {
    if (!["auto", "tcgplayer", "scryfall"].includes(String(input.priceSource ?? "auto"))) throw new Error("Choose a valid market price source.");
    if (settings.markupPct < -50 || settings.markupPct > 200) throw new Error("Markup must be between -50% and 200%.");
    if (!settings.autoFx && (settings.rate < 0.5 || settings.rate > 5)) throw new Error("The manual exchange rate must be between 0.50 and 5.00 AUD per USD.");
    if (![1, 5, 10, 25, 50, 100, 250, 500, 1000].includes(settings.roundingCents)) throw new Error("Choose a valid rounding increment.");
    if (settings.priceSource === "tcgplayer") resolvePriceSource("tcgplayer"); // hard-fails early without credentials so a bad save can't silently fall back
  }
  return settings;
}
export async function savePricingSettings(input: Partial<PricingSettings>) {
  const settings = validateSettings(input, true);
  await writeMeta(SETTINGS_KEY, settings);
  return settings;
}

function today() { return new Date().toISOString().slice(0, 10); }

export async function getFxRate(settings: PricingSettings): Promise<FxRate> {
  if (!settings.autoFx) return { rate: settings.rate, date: today(), source: "manual setting" };
  try {
    const response = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD", { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Live rate request failed (${response.status}).`);
    const data = await response.json() as { rates?: { AUD?: number }; date?: string };
    const rate = data.rates?.AUD;
    if (typeof rate !== "number" || !(rate > 0.5 && rate < 5)) throw new Error("The live rate service returned an unexpected value.");
    const fx: FxRate = { rate: Math.round(rate * 10000) / 10000, date: data.date || today(), source: "ECB via Frankfurter" };
    await writeMeta(LAST_FX_KEY, fx);
    return fx;
  } catch (error) {
    const cached = await readMeta<FxRate>(LAST_FX_KEY);
    if (cached && cached.rate > 0.5 && cached.rate < 5) return { ...cached, source: `${cached.source} (cached)` };
    throw new Error(`Could not fetch the live USD→AUD rate (${error instanceof Error ? error.message : "unexpected error"}). Set a manual exchange rate in Pricing settings, or try again later.`);
  }
}

function usdCents(card: ScryfallCard, finish: string): number | null {
  const prices = card.prices;
  if (!prices) return null;
  const pick = finish === "Foil" ? [prices.usd_foil, prices.usd, prices.usd_etched]
    : finish === "Etched" ? [prices.usd_etched, prices.usd, prices.usd_foil]
    : [prices.usd, prices.usd_foil, prices.usd_etched];
  for (const value of pick) {
    if (value) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 100);
    }
  }
  return null;
}

export function computeAudPrice(usdCents: number, condition: string, settings: PricingSettings, fx: FxRate): number {
  const multiplier = settings.conditionMultipliers[condition] ?? 1;
  const raw = usdCents * fx.rate * (1 + settings.markupPct / 100) * multiplier;
  const rounded = Math.ceil(raw / settings.roundingCents) * settings.roundingCents;
  return Math.max(settings.roundingCents, Math.min(10_000_000, Math.round(rounded)));
}

export async function runPriceUpdate(source: "daily" | "manual"): Promise<PriceRun> {
  const settings = await getPricingSettings();
  const following = await db.select().from(products).where(eq(products.priceMode, "auto"));
  const priceSource = resolvePriceSource(settings.priceSource);
  if (!following.length) {
    const fx: FxRate = settings.autoFx
      ? (await readMeta<FxRate>(LAST_FX_KEY)) || { rate: settings.rate, date: today(), source: "no fetch needed" }
      : { rate: settings.rate, date: today(), source: "manual setting" };
    const run: PriceRun = { ranAt: new Date().toISOString(), source, following: 0, updated: 0, unchanged: 0, failed: 0, priceSource, fallbacks: 0, fx };
    await writeMeta(LAST_RUN_KEY, run);
    return run;
  }

  const fx = await getFxRate(settings);
  const ids = following.map(card => card.scryfallId);
  const byId = new Map<string, ScryfallCard>();

  // Scryfall supplies the card→TCGplayer productId mapping *and* the fallback USD price in the same call.
  for (let start = 0; start < ids.length; start += BATCH) {
    const chunk = ids.slice(start, start + BATCH);
    const response = await scryfallRequest("/cards/collection", { identifiers: chunk.map(id => ({ id })) }) as { data?: ScryfallCard[]; not_found?: unknown[] };
    for (const card of response.data || []) byId.set(card.id, card);
  }

  let tcgPrices: Map<number, TcgPriceRow[]> | null = null;
  if (priceSource === "tcgplayer") {
    const productIds = following
      .map(card => { const record = byId.get(card.scryfallId); return record ? pickProductId(record, card.finish) : null; })
      .filter((id): id is number => Boolean(id));
    tcgPrices = await getMarketPrices(productIds);
  }

  let updated = 0, unchanged = 0, failed = 0, fallbacks = 0;
  for (const card of following) {
    const record = byId.get(card.scryfallId);
    if (!record) { failed++; continue; }

    let usd: number | null = null;
    let usedFallback = false;
    if (priceSource === "tcgplayer" && tcgPrices) {
      const productId = pickProductId(record, card.finish);
      const rows = productId ? tcgPrices.get(productId) : undefined;
      const row = rows ? matchPriceRow(rows, card.finish) : null;
      usd = row ? rowPriceCents(row) : null;
      if (!usd) { usd = usdCents(record, card.finish); usedFallback = true; }
    } else {
      usd = usdCents(record, card.finish);
    }
    if (!usd) { failed++; continue; }

    const newPrice = computeAudPrice(usd, card.condition, settings, fx);
    if (!newPrice || newPrice > 10_000_000) { failed++; continue; }

    await db.transaction(async tx => {
      await tx.update(products).set({ usdPrice: usd, priceUpdatedAt: sql`now()`, ...(newPrice !== card.price ? { price: newPrice } : {}) }).where(eq(products.id, card.id));
      if (newPrice !== card.price) {
        await tx.insert(priceEvents).values({ productId: card.id, oldPrice: card.price, newPrice, usdPrice: usd, rate: Math.round(fx.rate * 10000), source });
      }
    });
    if (usedFallback) fallbacks++;
    if (newPrice !== card.price) updated++; else unchanged++;
  }

  const run: PriceRun = { ranAt: new Date().toISOString(), source, following: following.length, updated, unchanged, failed, priceSource, fallbacks, fx };
  await writeMeta(LAST_RUN_KEY, run);
  return run;
}

export async function getLastRun(): Promise<PriceRun | null> {
  return readMeta<PriceRun>(LAST_RUN_KEY);
}

export async function getPriceEvents(limit = 25): Promise<PriceEvent[]> {
  const events = await db.select().from(priceEvents).orderBy(desc(priceEvents.createdAt)).limit(limit);
  const ids = [...new Set(events.map(event => event.productId))];
  const rows = ids.length ? await db.select({ id: products.id, name: products.name, setCode: products.setCode, collectorNumber: products.collectorNumber, condition: products.condition, finish: products.finish }).from(products).where(inArray(products.id, ids)) : [];
  const names = new Map(rows.map(row => [row.id, { name: row.name, variant: `${row.setCode.toUpperCase()} #${row.collectorNumber} · ${row.condition} · ${row.finish}` }]));
  return events.map(event => ({
    id: event.id, productId: event.productId, cardName: names.get(event.productId)?.name || "(deleted product)",
    variant: names.get(event.productId)?.variant || "", oldPrice: event.oldPrice, newPrice: event.newPrice,
    usdPrice: event.usdPrice, rate: event.rate / 10000, source: event.source, createdAt: event.createdAt.toISOString(),
  }));
}

export async function getPriceFollowCounts(): Promise<{ auto: number; manual: number }> {
  const auto = await db.select({ id: products.id }).from(products).where(eq(products.priceMode, "auto"));
  const manual = await db.select({ id: products.id }).from(products).where(eq(products.priceMode, "manual"));
  return { auto: auto.length, manual: manual.length };
}
