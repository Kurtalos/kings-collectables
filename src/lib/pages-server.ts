import { cache } from "react";
import { eq, like, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import { storeMeta, products } from "@/db/schema";
import { PAGE_STARTERS, validSlug, validatePage, type ContentPage, type PageRecord, type PageNav } from "./pages";
import { checkCarouselImage } from "./carousel-images";
import { getCatalog, getProductsByIds } from "./catalog";
const PREFIX = "content.page.";
const virtual = (draft: ContentPage): PageRecord => ({ draft, published: null, revision: 0, publishedAt: null });
export async function listPageRecords(): Promise<PageRecord[]> {
  const rows = await db.select().from(storeMeta).where(like(storeMeta.key, PREFIX + "%"));
  const records = rows.map(row => JSON.parse(row.value) as PageRecord);
  return [...PAGE_STARTERS.filter(page => !records.some(r => r.draft.slug === page.slug)).map(virtual), ...records].sort((a, b) => a.draft.slug === "home" ? -1 : b.draft.slug === "home" ? 1 : a.draft.title.localeCompare(b.draft.title));
}
export const getPageNavigation = cache(async (): Promise<PageNav[]> => {
  // Project only published navigation fields; large/private drafts never enter public props.
  const rows = await db.execute(sql`SELECT value::jsonb->'published'->>'slug' AS slug,
    value::jsonb->'published'->>'title' AS title,
    (value::jsonb->'published'->>'inHeader')::boolean AS "inHeader",
    (value::jsonb->'published'->>'inFooter')::boolean AS "inFooter"
    FROM store_meta WHERE key LIKE ${PREFIX + "%"}`);
  return (rows.rows as PageNav[]).filter(page => typeof page.slug === "string" && page.slug !== "home").sort((a,b) => a.title.localeCompare(b.title));
});
export async function readPublishedPage(slug: string): Promise<ContentPage | null> {
  if (!validSlug(slug)) return null;
  const rows = await db.execute(sql`SELECT value::jsonb->'published' AS page FROM store_meta WHERE key=${PREFIX + slug} LIMIT 1`);
  const page = (rows.rows[0] as { page: ContentPage | null } | undefined)?.page;
  return page ? { ...page, blocks: page.blocks.filter(block => block.enabled) } : null;
}
export async function updatePage(input: unknown, revision: unknown, action: unknown): Promise<PageRecord | null> {
  if (!["save", "publish", "unpublish", "delete"].includes(String(action))) throw new Error("Choose a valid page action.");
  const page = validatePage(input);
  if (!Number.isSafeInteger(revision) || Number(revision) < 0) throw new Error("Reload the page before saving.");
  if (action === "publish") {
    try { await Promise.all(page.blocks.filter(b => b.enabled && b.type === "image").map(b => checkCarouselImage(b.image))); }
    catch { throw new Error("A page image is missing. Upload it again before publishing."); }
  }
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('content.pages'))`);
    const [row] = await tx.select().from(storeMeta).where(eq(storeMeta.key, PREFIX + page.slug)).for("update");
    const current: PageRecord = row ? JSON.parse(row.value) : virtual(page);
    if (current.revision !== revision) throw new Error("This page changed in another tab. Reload Pages before saving to avoid overwriting it.");
    if (!row && !PAGE_STARTERS.some(p => p.slug === page.slug)) {
      const count = await tx.select({ key: storeMeta.key }).from(storeMeta).where(like(storeMeta.key, PREFIX + "%"));
      if (count.length >= 50) throw new Error("Keep at most 50 saved pages.");
    }
    if (action === "delete") {
      if (PAGE_STARTERS.some(p => p.slug === page.slug)) throw new Error("Starter pages cannot be deleted. Unpublish them instead.");
      await tx.delete(storeMeta).where(eq(storeMeta.key, PREFIX + page.slug)); return null;
    }
    const record: PageRecord = { draft: action === "unpublish" ? current.draft : page, published: action === "publish" ? page : action === "unpublish" ? null : current.published, revision: current.revision + 1, publishedAt: action === "publish" ? new Date().toISOString() : action === "unpublish" ? null : current.publishedAt };
    const value = JSON.stringify(record);
    await tx.insert(storeMeta).values({ key: PREFIX + page.slug, value }).onConflictDoUpdate({ target: storeMeta.key, set: { value } });
    return record;
  });
}
export async function pageCatalog(page: ContentPage | null) {
  const base = await getCatalog({ limit: 48 });
  const sources = [...new Set(page?.blocks.filter(b => b.type === "products" && !["featured", "newest"].includes(b.source)).map(b => b.source) || [])];
  const extra = await Promise.all(sources.map(category => getCatalog({ category, limit: 12 })));
  const needed = new Set(page?.blocks.filter(b => b.type === "products").map(b => b.source));
  const ids: string[] = [];
  if (needed.has("featured")) ids.push(...(await db.select({ id: products.id }).from(products).where(eq(products.featured, true)).orderBy(desc(products.createdAt)).limit(12)).map(row => row.id));
  if (needed.has("newest")) ids.push(...(await db.select({ id: products.id }).from(products).orderBy(desc(products.createdAt)).limit(12)).map(row => row.id));
  const special = await getProductsByIds(ids);
  return { products: [...new Map([...base.products, ...extra.flatMap(result => result.products), ...special].map(card => [card.id, card])).values()], collections: base.collections };
}
