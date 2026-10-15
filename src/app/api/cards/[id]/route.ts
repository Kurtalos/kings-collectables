import { db } from "@/db";
import { products, categories, productCategories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { apiError, requireOwner } from "@/lib/admin-auth";
import { readBody, isUUID, validateStock, validatePrice, validateVariant } from "@/lib/validation";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner(request);
    const { id } = await params;
    if (!isUUID(id)) throw new Error("Invalid card ID.");
    const body = await readBody(request);
    const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) return Response.json({ error: "This card no longer exists." }, { status: 404 });
    const price = body.price === undefined ? existing.price : validatePrice(body.price);
    const quantity = body.quantity === undefined ? existing.quantity : validateStock(body.quantity);
    const condition = String(body.condition || existing.condition), finish = String(body.finish || existing.finish);
    validateVariant(condition, finish);
    const groupIds = body.categoryIds;
    if (groupIds !== undefined && (!Array.isArray(groupIds) || groupIds.length > 30 || !groupIds.every(isUUID))) throw new Error("Choose valid collections.");
    if (Array.isArray(groupIds) && groupIds.length && (await db.select().from(categories).where(inArray(categories.id, groupIds))).length !== new Set(groupIds).size) throw new Error("One of the collections no longer exists.");
    const [updated] = await db.transaction(async tx => {
      const result = await tx.update(products).set({ price, quantity, condition, finish, featured: body.featured === undefined ? existing.featured : Boolean(body.featured) }).where(eq(products.id, id)).returning();
      if (Array.isArray(groupIds)) {
        await tx.delete(productCategories).where(eq(productCategories.productId, id));
        if (groupIds.length) await tx.insert(productCategories).values([...new Set(groupIds)].map(categoryId => ({ productId: id, categoryId })));
      }
      return result;
    });
    return Response.json({ product: updated });
  } catch (error) { return apiError(error instanceof Error && error.message.includes("product_printing_variant") ? new Error("Another card already has this printing, condition and finish.") : error); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireOwner(request); const { id } = await params; if (!isUUID(id)) throw new Error("Invalid card ID."); const deleted = await db.delete(products).where(eq(products.id, id)).returning(); if (!deleted.length) throw new Error("This card no longer exists."); return Response.json({ ok: true }); } catch (error) { return apiError(error); }
}
