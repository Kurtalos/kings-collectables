import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { storeMeta } from "@/db/schema";
import { DEFAULT_SITE_CHROME,validateSiteChrome,type ChromeRecord } from "./site-chrome";
export const CHROME_KEY="store.chrome.v1";
const empty=():ChromeRecord=>({draft:structuredClone(DEFAULT_SITE_CHROME),published:null,revision:0,publishedAt:null});
export async function readChromeRecord():Promise<ChromeRecord>{const [row]=await db.select().from(storeMeta).where(eq(storeMeta.key,CHROME_KEY));return row ? JSON.parse(row.value):empty();}
// Only published content is selected: private drafts must never enter storefront RSC props.
export const getPublishedChrome=cache(async()=>{const result=await db.execute(sql`SELECT value::jsonb->'published' AS published FROM store_meta WHERE key=${CHROME_KEY}`);return result.rows[0]?.published ? validateSiteChrome(result.rows[0].published):DEFAULT_SITE_CHROME;});
export async function updateChrome(input:unknown,revision:unknown,action:unknown){
  if(!["save","publish","reset"].includes(String(action))||!Number.isSafeInteger(revision)||Number(revision)<0)throw new Error("Choose a valid header/footer action and revision.");
  const content=action==="reset" ? structuredClone(DEFAULT_SITE_CHROME):validateSiteChrome(input);
  return db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${CHROME_KEY}))`);
    const [row]=await tx.select().from(storeMeta).where(eq(storeMeta.key,CHROME_KEY)).for("update");const current:ChromeRecord=row ? JSON.parse(row.value):empty();
    if(current.revision!==revision)throw new Error("Header/footer changed in another tab. Reload the editor before saving.");
    const next:ChromeRecord={draft:content,published:action==="publish" ? content:current.published,revision:current.revision+1,publishedAt:action==="publish" ? new Date().toISOString():current.publishedAt};
    await tx.insert(storeMeta).values({key:CHROME_KEY,value:JSON.stringify(next)}).onConflictDoUpdate({target:storeMeta.key,set:{value:JSON.stringify(next)}});return next;
  });
}
