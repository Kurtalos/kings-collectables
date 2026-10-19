import { readStoreSettings } from "@/lib/store-settings-server";
import { db } from "@/db";
import { orders, payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiError } from "@/lib/admin-auth";
import { getCustomer, requireCustomer } from "@/lib/customer-auth";
import { readBody, isUUID } from "@/lib/validation";
import { stripeAvailable, stripeClient, stripePublishableKey, recordPayment, markPaymentResult } from "@/lib/payments";
import { limitPublicRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const customer = await getCustomer();
    return Response.json({ cardAvailable: stripeAvailable(), publishableKey: stripePublishableKey(), customer });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    if (!stripeAvailable()) throw new Error("Card payments are not enabled. Please choose Bank Transfer.");
    const limited = limitPublicRequests(request, "stripe-intent", 6); if (limited) return limited;
    const customer = await requireCustomer();
    const body = await readBody(request);
    if (!isUUID(body.orderId)) throw new Error("Order not found.");
    const [order] = await db.select().from(orders).where(eq(orders.id, String(body.orderId))).limit(1);
    if (!order) throw new Error("Order not found.");
    if (order.customerId !== customer.id) throw new Error("This order does not belong to your account.");
    if (order.status !== "Awaiting payment") throw new Error("This order is already being processed.");
    if (order.total < 50) throw new Error("Minimum order for card payments is A$0.50.");

    const pending = await db.select().from(payments).where(eq(payments.orderId, order.id));
    for (const prior of pending) if (prior.status === "pending" && prior.clientSecret) return Response.json({ clientSecret: prior.clientSecret, paymentId: prior.id });

    const intent = await stripeClient().paymentIntents.create({
      amount: order.total,
      currency: "aud",
      receipt_email: customer.email,
      description: `${(await readStoreSettings()).storeName} order ${order.orderNumber}`,
      metadata: { orderId: order.id, orderNumber: order.orderNumber, customerEmail: customer.email },
      automatic_payment_methods: { enabled: true },
      statement_descriptor: "KINGSCOLLECTABLES",
      statement_descriptor_suffix: "KC",
    });
    if (!intent.client_secret) throw new Error("Stripe did not return a client secret. Please try again.");
    const payment = await recordPayment(order.id, "Card", order.total, { providerReference: intent.id, clientSecret: intent.client_secret, status: "pending" });
    return Response.json({ clientSecret: intent.client_secret, paymentId: payment.id });
  } catch (error) { return apiError(error); }
}
