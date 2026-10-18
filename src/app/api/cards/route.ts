import { db } from "@/db";
import { products, categories, productCategories } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ensureSeeded } from "@/lib/catalog";
import { apiError, requireOwner } from "@/lib/admin-auth";
import { readBody, isUUID, validateStock, validatePrice, validateVariant } from "@/lib/validation";
import { cardMetadata, scryfallRequest, type ScryfallCard } from "@/lib/scryfall";
import { checkAndNotifyRestock } from "@/lib/restock";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || undefined;
  const set = url.searchParams.get("set") || undefined;
  const category = url.searchParams.get("category") || undefined;
  const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : undefined;
  const inStockOnly = url.searchParams.get("inStockOnly") === "true";
  const { getCatalog } = await import("@/lib/catalog");
  return Response.json(await getCatalog({ q, set, category, limit, inStockOnly }));
}

export async function POST(request: Request) {
  try {
    await requireOwner(request); 
    await ensureSeeded();
    const body = await readBody(request);
    if (!isUUID(body.scryfallId)) throw new Error("Look up a card before adding it.");
    const scryfallId = String(body.scryfallId);
    const price = validatePrice(body.price);
    const quantity = validateStock(body.quantity);
    const condition = String(body.condition || "Near mint");
    const finish = String(body.finish || "Non-foil");
    validateVariant(condition, finish);
    
    const groupIds = Array.isArray(body.categoryIds) ? body.categoryIds : [];
    if (groupIds.length > 30 || !groupIds.every(isUUID)) throw new Error("Choose valid collections.");
    if (groupIds.length && (await db.select().from(categories).where(inArray(categories.id, groupIds))).length !== new Set(groupIds).size) {
      throw new Error("One of the collections no longer exists.");
    }

    const [known] = await db.select().from(products).where(eq(products.scryfallId, scryfallId)).limit(1);
    const metadata = known ? (({ id: _id, createdAt: _date, price: _price, quantity: _quantity, condition: _condition, finish: _finish, priceMode: _pm, usdPrice: _usd, priceUpdatedAt: _pu, ...rest }) => rest)(known) : cardMetadata(await scryfallRequest(`/cards/${scryfallId}`) as ScryfallCard);

    const result = await db.transaction(async tx => {
      // Check if this exact variant (scryfallId, condition, finish) already exists
      const [existing] = await tx.select().from(products).where(
        and(
          eq(products.scryfallId, scryfallId),
          eq(products.condition, condition),
          eq(products.finish, finish)
        )
      ).for("update");

      let card;
      if (existing) {
        // If it already exists (e.g. from the 110k sync or previous entry), update price, stock, and settings
        const oldQty = existing.quantity;
        const [updated] = await tx.update(products).set({
          price,
          quantity,
          featured: Boolean(body.featured),
          priceMode: body.priceMode === "auto" ? "auto" : "manual",
        }).where(eq(products.id, existing.id)).returning();
        card = updated;

        if (oldQty === 0 && quantity > 0) {
          await checkAndNotifyRestock(card.id, oldQty, quantity);
        }
      } else {
        // Insert new variant (e.g. specific condition/finish not yet created)
        const [inserted] = await tx.insert(products).values({
          ...metadata,
          price,
          quantity,
          condition,
          finish,
          featured: Boolean(body.featured),
          priceMode: body.priceMode === "auto" ? "auto" : "manual",
        }).returning();
        card = inserted;

        if (quantity > 0) {
          await checkAndNotifyRestock(card.id, 0, quantity);
        }
      }

      if (groupIds.length) {
        await tx.insert(productCategories).values([...new Set(groupIds)].map(categoryId => ({ productId: card.id, categoryId }))).onConflictDoNothing();
      }
      return card;
    });

    return Response.json({ product: result }, { status: 201 });
  } catch (error) { 
    return apiError(error); 
  }
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
