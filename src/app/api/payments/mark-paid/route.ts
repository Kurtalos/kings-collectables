import { db } from "@/db";
import { orders, payments } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { readBody, isUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";
const METHODS = ["Card", "Bank transfer", "Cash on collection", "Store credit", "Other"] as const;

export async function PATCH(request: Request) {
  try {
    await requireOwner(request);
    const body = await readBody(request);
    if (!isUUID(body.id)) throw new Error("Invalid order ID.");
    if (body.status !== "Paid") throw new Error("Use this endpoint to confirm a received payment.");

    await db.transaction(async tx => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, String(body.id))).for("update");
      if (!order) throw new Error("Order not found.");
      if (order.status !== "Awaiting payment") throw new Error("This order is no longer awaiting payment.");
      const method = METHODS.includes(String(body.paymentMethod) as typeof METHODS[number]) ? String(body.paymentMethod) : "Bank transfer";
      const receipt = typeof body.paymentReceipt === "string" && body.paymentReceipt.trim() ? body.paymentReceipt.trim() : `manual-${Date.now()}`;
      await tx.insert(payments).values({ orderId: order.id, method, amount: order.total, status: "succeeded", providerReference: receipt });
      await tx.update(orders).set({ status: "Paid", paymentMethod: method, paymentReceipt: receipt, paidAt: sql`now()` }).where(eq(orders.id, order.id));
    });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
