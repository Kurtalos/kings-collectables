import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { storeMeta } from "@/db/schema";
import { DEFAULT_BRANDING, validateBranding, type BrandingRecord } from "./branding";
import { checkBrandingImage } from "./branding-images";
const KEY="store.branding.v1";
export async function readBranding(): Promise<BrandingRecord> {
  const [row]=await db.select().from(storeMeta).where(eq(storeMeta.key,KEY)).limit(1);
  if (!row) return {settings:{...DEFAULT_BRANDING,colors:{...DEFAULT_BRANDING.colors}},revision:0};
  const record=JSON.parse(row.value) as BrandingRecord;
  return {settings:validateBranding(record.settings),revision:record.revision};
}
export const getBranding=cache(readBranding);
export async function saveBranding(input: unknown, revision: unknown): Promise<BrandingRecord> {
  const settings=validateBranding(input);
  if (!Number.isSafeInteger(revision) || Number(revision)<0) throw new Error("Reload branding before saving.");
  await Promise.all([settings.logo,settings.darkLogo,settings.favicon].map(checkBrandingImage));
  return db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${KEY}))`);
    const [row]=await tx.select().from(storeMeta).where(eq(storeMeta.key,KEY)).limit(1);
    const current=row ? (JSON.parse(row.value) as BrandingRecord).revision : 0;
    if (current!==revision) throw new Error("Branding changed in another session. Reload branding before saving.");
    const record={settings,revision:current+1};
    await tx.insert(storeMeta).values({key:KEY,value:JSON.stringify(record)}).onConflictDoUpdate({target:storeMeta.key,set:{value:JSON.stringify(record)}});
    return record;
  });
}
