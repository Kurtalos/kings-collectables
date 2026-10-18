import { db } from "@/db";
import { watchlists, customers, products } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Notify watchers when a product comes back in stock.
 * Call this whenever a product's quantity goes from 0 to >0.
 */
export async function notifyRestock(productId: string, newQuantity: number) {
  const watchers = await db
    .select({
      id: watchlists.customerId,
      name: customers.name,
      email: customers.email,
      lastSeenQuantity: watchlists.lastSeenQuantity,
    })
    .from(watchlists)
    .innerJoin(customers, eq(customers.id, watchlists.customerId))
    .where(eq(watchlists.productId, productId));

  if (watchers.length === 0) return;

  // In a real implementation, you'd send emails here.
  // For now, we'll log to console and could extend to email/SMS later.
  console.log(
    `[Restock Notification] Product ${productId} back in stock (qty: ${newQuantity}). Notifying ${watchers.length} watcher(s):`,
    watchers.map(w => ({ email: w.email, name: w.name })),
  );

  // Update lastSeenQuantity for all watchers so they don't get notified again
  // until stock changes again
  await db
    .update(watchlists)
    .set({ lastSeenQuantity: newQuantity })
    .where(eq(watchlists.productId, productId));
}

/**
 * Check if a product came back in stock and notify watchers.
 * Call this after updating product inventory.
 */
export async function checkAndNotifyRestock(
  productId: string,
  oldQuantity: number,
  newQuantity: number,
) {
  if (oldQuantity === 0 && newQuantity > 0) {
    await notifyRestock(productId, newQuantity);
  }
}
