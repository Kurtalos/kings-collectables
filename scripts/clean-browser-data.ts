import "dotenv/config";
import { readFile } from "node:fs/promises";
import { db, pool } from "../src/db";
import { orders, orderItems, products, customers } from "../src/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

/** Removes the customers and orders created by scripts/browser-check.mjs and returns their stock. */
async function readArtifact(name: string) {
  try { return (await readFile(`artifacts/${name}`, "utf8")).trim(); } catch { return ""; }
}

async function main() {
  const guestOrderNumber = await readArtifact("guest-order.txt");
  let restored = 0;

  if (guestOrderNumber) {
    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, guestOrderNumber)).limit(1);
    if (order) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      for (const item of items) {
        if (!item.productId) continue;
        await db.update(products).set({ quantity: sql`${products.quantity} + ${item.quantity}` }).where(eq(products.id, item.productId));
        restored += item.quantity;
      }
      await db.delete(orders).where(eq(orders.id, order.id));
    }
  }

  const emails = [await readArtifact("checkout-email.txt")].filter(Boolean);
  const testCustomers = await db.select({ id: customers.id, email: customers.email }).from(customers).where(
    emails.length ? sql`${customers.email} like 'ui-checkout-%' or ${customers.email} like 'browser-%' or ${customers.email} in ${emails}` : sql`${customers.email} like 'ui-checkout-%' or ${customers.email} like 'browser-%'`,
  );
  if (testCustomers.length) await db.delete(customers).where(inArray(customers.id, testCustomers.map(row => row.id)));

  const remaining = await db.select({ count: sql<number>`count(*)::int` }).from(orders).where(eq(orders.channel, "web"));
  console.log(`Restored ${restored} cards to stock, removed ${testCustomers.length} test customers (${testCustomers.map(row => row.email).join(", ") || "none"}), ${remaining[0].count} web orders remain.`);
}

main().finally(() => pool.end()).catch(error => { console.error(error); process.exitCode = 1; });
