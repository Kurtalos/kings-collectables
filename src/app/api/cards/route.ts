import { db } from "@/db";
import { products, categories, productCategories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { apiError, requireOwner } from "@/lib/admin-auth";
import { readBody, isUUID } from "@/lib/validation";

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
 try { await requireOwner(request); throw new Error("Use Receive stock to add inventory and acquisition lots."); } catch(error) { return apiError(error); }
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
