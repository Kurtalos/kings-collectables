import { db } from "@/db";
import { payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { stripeAvailable, stripeClient, markPaymentResult } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!stripeAvailable()) return Response.json({ error: "Card payments are not enabled." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return Response.json({ error: "Missing signature" }, { status: 400 });
  const rawBody = await request.text();
  let event;
  try { event = stripeClient().webhooks.constructEvent(rawBody, signature, secret); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid signature" }, { status: 400 }); }

  const data = event.data.object as { id: string; status?: string; payment_intent?: string | { id: string; status?: string; last_payment_error?: { message?: string } }; last_payment_error?: { message?: string } };
  if (event.type === "payment_intent.succeeded") {
    const intentId = typeof data === "object" && data && "id" in data ? String(data.id) : null;
    if (intentId) await markPaymentResult(intentId, "succeeded");
  } else if (event.type === "payment_intent.payment_failed") {
    const intentId = typeof data === "object" && data && "id" in data ? String(data.id) : null;
    if (intentId) {
      const failure = (data as { last_payment_error?: { message?: string } }).last_payment_error?.message || "Payment declined.";
      const [existing] = await db.select().from(payments).where(eq(payments.providerReference, intentId)).limit(1);
      if (existing) await db.update(payments).set({ status: "failed", failureReason: failure, updatedAt: new Date() }).where(eq(payments.id, existing.id));
    }
  }
  return Response.json({ received: true });
}
