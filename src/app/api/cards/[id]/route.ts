import { db } from "@/db";
import { products, categories, productCategories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { apiError, requireOwner } from "@/lib/admin-auth";
import { readBody, isUUID, validatePrice, validateVariant } from "@/lib/validation";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner(request);
    const { id } = await params;
    if (!isUUID(id)) throw new Error("Invalid card ID.");
    const body = await readBody(request);
    if (body.quantity !== undefined) throw new Error("Use Receive stock to add inventory; absolute stock edits are disabled.");
    const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) return Response.json({ error: "This card no longer exists." }, { status: 404 });
    const price = body.price === undefined ? existing.price : validatePrice(body.price);
    const condition = String(body.condition || existing.condition), finish = String(body.finish || existing.finish);
    validateVariant(condition, finish);
    if(condition !== existing.condition || finish !== existing.finish) throw new Error("Select the correct variant in Receive stock; existing ledger variants cannot be changed.");
    const priceModeRaw = body.priceMode;
    let priceMode = existing.priceMode;
    if (priceModeRaw !== undefined) {
      const mode = String(priceModeRaw);
      if (mode !== "auto" && mode !== "manual") throw new Error("Price mode must be 'auto' (follow market) or 'manual'.");
      priceMode = mode;
    }
    const groupIds = body.categoryIds;
    if (groupIds !== undefined && (!Array.isArray(groupIds) || groupIds.length > 30 || !groupIds.every(isUUID))) throw new Error("Choose valid collections.");
    if (Array.isArray(groupIds) && groupIds.length && (await db.select().from(categories).where(inArray(categories.id, groupIds))).length !== new Set(groupIds).size) throw new Error("One of the collections no longer exists.");
    const [updated] = await db.transaction(async tx => {
      const [existingRow] = await tx.select().from(products).where(eq(products.id, id)).for("update");
      if (!existingRow) throw new Error("This card no longer exists.");
      const result = await tx.update(products).set({ price, condition, finish, priceMode, featured: body.featured === undefined ? existing.featured : Boolean(body.featured) }).where(eq(products.id, id)).returning();
      if (Array.isArray(groupIds)) {
        await tx.delete(productCategories).where(eq(productCategories.productId, id));
        if (groupIds.length) await tx.insert(productCategories).values([...new Set(groupIds)].map(categoryId => ({ productId: id, categoryId })));
      }
      return result;
    });
    return Response.json({ product: updated });
  } catch (error) { return apiError(error instanceof Error && error.message.includes("product_printing_variant") ? new Error("Another card already has this printing, condition and finish.") : error); }
}
export async function DELETE(request: Request) {
  try { await requireOwner(request); throw new Error("Catalogue printings and inventory history must be retained. Set selling visibility separately; deletion is disabled."); } catch(error) { return apiError(error); }
}
