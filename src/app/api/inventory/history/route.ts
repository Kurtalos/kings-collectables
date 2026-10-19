import { db } from "@/db";
import { products } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { isUUID } from "@/lib/validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const url = new URL(request.url),
      id = url.searchParams.get("productId");
    if (!isUUID(id)) throw new Error("Choose a valid inventory card.");
    const rawPage = Number(url.searchParams.get("page") || 0);
    if (!Number.isSafeInteger(rawPage) || rawPage < 0 || rawPage > 100000)
      throw new Error("Invalid history page.");
    const data = await db.transaction(
      async (tx) => {
        const [card] = await tx
          .select({ name: products.name, imageUrl: products.imageUrl })
          .from(products)
          .where(eq(products.id, id));
        if (!card) throw new Error("Card not found.");
        const variants =
          await tx.execute(sql`SELECT p.id,p.set_name AS "setName",p.set_code AS "setCode",p.collector_number AS "collectorNumber",p.condition,p.finish,p.quantity,p.price,
    count(l.id)::int AS "lotCount",coalesce(sum(l.acquired_quantity),0)::bigint AS acquired,
    coalesce(sum(l.remaining_quantity*l.unit_cost::bigint),0)::bigint AS "knownValue",
    coalesce(sum(l.remaining_quantity) FILTER (WHERE l.unit_cost IS NULL),0)::bigint AS "unknownUnits"
    FROM products p LEFT JOIN inventory_lots l ON l.product_id=p.id WHERE p.name=${card.name}
    GROUP BY p.id HAVING count(l.id)>0 OR p.quantity>0 ORDER BY p.set_code,p.collector_number,p.condition,p.finish,p.id`);
        const sources = await tx.execute(
          sql`SELECT l.acquisition_type AS type,count(*)::int AS receipts, sum(l.acquired_quantity)::bigint AS acquired,sum(l.remaining_quantity)::bigint AS remaining FROM inventory_lots l JOIN products p ON p.id=l.product_id WHERE p.name=${card.name} GROUP BY l.acquisition_type ORDER BY l.acquisition_type`,
        );
        const lots = await tx.execute(
          sql`SELECT l.id,l.product_id AS "productId",l.receipt_id AS "receiptId",l.acquired_quantity AS "acquiredQuantity",l.remaining_quantity AS "remainingQuantity",l.unit_cost AS "unitCost",l.acquisition_type AS "acquisitionType",l.acquired_at AS "acquiredAt",l.supplier,l.reference,l.note FROM inventory_lots l JOIN products p ON p.id=l.product_id WHERE p.name=${card.name} ORDER BY l.acquired_at DESC,l.created_at DESC,l.id LIMIT 101 OFFSET ${rawPage * 100}`,
        );
        return {
          card,
          variants: variants.rows,
          sources: sources.rows,
          lots: lots.rows.slice(0, 100),
          hasMore: lots.rows.length > 100,
          page: rawPage,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
