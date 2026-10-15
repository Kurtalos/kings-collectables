import Stripe from "stripe";
import { db } from "@/db";
import { orders, payments } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

let cachedClient: Stripe | null = null;
export function stripeAvailable() { return Boolean(process.env.STRIPE_SECRET_KEY); }
export function stripeClient() {
  if (!cachedClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Card payments are not enabled. Please choose Bank Transfer.");
    cachedClient = new Stripe(key);
  }
  return cachedClient;
}
export function stripePublishableKey() { return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""; }
export const PAYMENT_STATUSES = ["pending", "succeeded", "failed", "cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const ORDER_STATUSES = ["Awaiting payment", "Paid", "Packing", "Shipped", "Cancelled", "Refunded"] as const;
export function isValidOrderStatus(value: unknown): value is (typeof ORDER_STATUSES)[number] { return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value); }

export async function recordPayment(orderId: string, method: string, amount: number, details: Partial<{ providerReference: string; clientSecret: string; status: PaymentStatus }> = {}) {
  const [payment] = await db.insert(payments).values({ orderId, method, amount, status: details.status || "pending", providerReference: details.providerReference || null, clientSecret: details.clientSecret || null }).returning();
  return payment;
}
export async function markPaymentResult(providerReference: string, status: PaymentStatus, failureReason?: string) {
  const [payment] = await db.update(payments).set({ status, failureReason: failureReason || null, updatedAt: sql`now()` }).where(eq(payments.providerReference, providerReference)).returning();
  if (!payment || status !== "succeeded") return null;
  const [order] = await db.update(orders).set({ status: "Paid", paymentMethod: "Card", paymentReceipt: providerReference, paidAt: sql`now()` }).where(eq(orders.id, payment.orderId)).returning();
  return order;
}
