import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { storeMeta } from "@/db/schema";
import { DEFAULT_STORE_SETTINGS, validateStoreSettings, type StoreSettings } from "./store-settings";
const KEY = "store.settings.v1";
// No schema changes: use the existing metadata table, separate from pricing settings.
export async function readStoreSettings(reader: Pick<typeof db, "select"> = db): Promise<StoreSettings> {
  const [row] = await reader.select().from(storeMeta).where(eq(storeMeta.key, KEY)).limit(1);
  if (!row) return { ...DEFAULT_STORE_SETTINGS };
  return validateStoreSettings({ ...DEFAULT_STORE_SETTINGS, ...JSON.parse(row.value) });
}
// Deduplicate only within a server render; never cache shipping rates across requests.
export const getStoreSettings = cache(async () => readStoreSettings());
export async function saveStoreSettings(input: unknown) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${KEY}))`);
    const current = await readStoreSettings(tx);
    const candidate = input as Record<string, unknown>;
    const settings = validateStoreSettings({ ...candidate, tradeInPercent: candidate?.tradeInPercent === undefined ? current.tradeInPercent : candidate.tradeInPercent, ...(candidate?.deliveryOptions === undefined && current.deliveryOptions !== undefined ? { deliveryOptions: current.deliveryOptions } : {}) });
    await tx.insert(storeMeta).values({ key: KEY, value: JSON.stringify(settings) }).onConflictDoUpdate({ target: storeMeta.key, set: { value: JSON.stringify(settings) } });
    return settings;
  });
}
