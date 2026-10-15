import { db } from "@/db";
import { products, categories, productCategories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getCatalog, ensureSeeded } from "@/lib/catalog";
import { apiError, requireOwner } from "@/lib/admin-auth";
import { readBody, isUUID, validateStock, validatePrice, validateVariant } from "@/lib/validation";
import { cardMetadata, scryfallRequest, type ScryfallCard } from "@/lib/scryfall";

export const dynamic = "force-dynamic";
export async function GET() { return Response.json(await getCatalog()); }
export async function POST(request: Request) {
  try {
    await requireOwner(request); await ensureSeeded();
    const body = await readBody(request);
    if (!isUUID(body.scryfallId)) throw new Error("Look up a card before adding it.");
    const price = validatePrice(body.price), quantity = validateStock(body.quantity);
    const condition = String(body.condition || "Near mint"), finish = String(body.finish || "Non-foil");
    validateVariant(condition, finish);
    const groupIds = Array.isArray(body.categoryIds) ? body.categoryIds : [];
    if (groupIds.length > 30 || !groupIds.every(isUUID)) throw new Error("Choose valid collections.");
    if (groupIds.length && (await db.select().from(categories).where(inArray(categories.id, groupIds))).length !== new Set(groupIds).size) throw new Error("One of the collections no longer exists.");
    const [known] = await db.select().from(products).where(eq(products.scryfallId, body.scryfallId)).limit(1);
    const metadata = known ? (({ id: _id, createdAt: _date, price: _price, quantity: _quantity, condition: _condition, finish: _finish, ...rest }) => rest)(known) : cardMetadata(await scryfallRequest(`/cards/${body.scryfallId}`) as ScryfallCard);
    const result = await db.transaction(async tx => {
      const [card] = await tx.insert(products).values({ ...metadata, price, quantity, condition, finish, featured: Boolean(body.featured) }).onConflictDoNothing().returning();
      if (!card) throw new Error("This printing and variant already exists. Edit its stock or use the importer.");
      if (groupIds.length) await tx.insert(productCategories).values([...new Set(groupIds)].map(categoryId => ({ productId: card.id, categoryId }))).onConflictDoNothing();
      return card;
    });
    return Response.json({ product: result }, { status: 201 });
  } catch (error) { return apiError(error); }
}
export async function PUT(request: Request) {
  try {
    await requireOwner(request);
    const body = await readBody(request);
    const ids = body.productIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || !ids.every(isUUID) || !isUUID(body.categoryId)) throw new Error("Select cards and a valid collection.");
    const [group] = await db.select().from(categories).where(eq(categories.id, body.categoryId)).limit(1);
    if (!group) throw new Error("This collection no longer exists.");
    const existing = await db.select({ id: products.id }).from(products).where(inArray(products.id, ids));
    if (existing.length !== new Set(ids).size) throw new Error("Some selected cards no longer exist. Refresh and try again.");
    await db.insert(productCategories).values(existing.map(card => ({ productId: card.id, categoryId: group.id }))).onConflictDoNothing();
    return Response.json({ ok: true, assigned: existing.length });
  } catch (error) { return apiError(error); }
}
