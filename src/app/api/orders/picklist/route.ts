import { db } from "@/db";
import { orders, orderItems, products } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { picklistCSV } from "@/lib/picklist";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const result = await db.transaction(
      async (tx) => {
        const packing = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.status, "Packing"));
        const lines = await tx
          .select({
            orderNumber: orders.orderNumber,
            customerName: orders.customerName,
            productId: orderItems.productId,
            cardName: orderItems.cardName,
            variant: orderItems.variant,
            quantity: orderItems.quantity,
            setCode: products.setCode,
            collectorNumber: products.collectorNumber,
            condition: products.condition,
            finish: products.finish,
          })
          .from(orders)
          .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(eq(orders.status, "Packing"))
          .orderBy(
            asc(orders.createdAt),
            asc(orders.orderNumber),
            asc(orderItems.cardName),
            asc(orderItems.variant),
            asc(orderItems.id),
          );
        return { packing, lines };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    if (!result.packing.length)
      return Response.json(
        { error: "No orders are currently marked Packing." },
        { status: 404 },
      );
    if (!result.lines.length)
      return Response.json(
        { error: "Packing orders have no card lines to export." },
        { status: 409 },
      );
    return new Response(picklistCSV(result.lines), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="kings-picklist-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Picklist-Orders": String(result.packing.length),
        "X-Picklist-Units": String(
          result.lines.reduce((s, l) => s + l.quantity, 0),
        ),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
