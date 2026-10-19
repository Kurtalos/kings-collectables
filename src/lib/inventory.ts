import { db } from "@/db";
import {
  products,
  inventoryLots as lots,
  inventoryReceipts as receipts,
  inventoryAllocations as allocations,
  inventoryRestockEvents as events,
  orderItems,
  customers,
  creditTransactions,
  watchlists,
} from "@/db/schema";
import { and, eq, inArray, asc, sql, gt, isNull } from "drizzle-orm";
import type { ReceiveLine } from "./inventory-input";
export type InventoryTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** All callers lock products in ascending ID order before changing lots. */
export async function receiveStock(
  tx: InventoryTx,
  lines: ReceiveLine[],
  key: string,
  trade?: { customerId: string; amount: number },
) {
  const [receipt] = await tx
    .insert(receipts)
    .values({
      idempotencyKey: key,
      customerId: trade?.customerId,
      creditAmount: trade?.amount || 0,
    })
    .onConflictDoNothing()
    .returning();
  if (!receipt) {
    const [existing] = await tx
      .select()
      .from(receipts)
      .where(eq(receipts.idempotencyKey, key));
    return existing;
  }
  const ids = [...new Set(lines.map((l) => l.productId))].sort();
  const stock = await tx
    .select()
    .from(products)
    .where(inArray(products.id, ids))
    .orderBy(asc(products.id))
    .for("update");
  if (stock.length !== ids.length)
    throw new Error("A selected printing no longer exists.");
  for (const card of stock) {
    const matched = lines.filter((l) => l.productId === card.id);
    const added = matched.reduce((s, l) => s + l.quantity, 0);
    if (card.quantity + added > 1000000)
      throw new Error("Stock limit exceeded.");
    await tx
      .insert(lots)
      .values(
        matched.map((l) => ({
          receiptId: receipt.id,
          productId: card.id,
          acquiredQuantity: l.quantity,
          remainingQuantity: l.quantity,
          unitCost: l.unitCost,
          acquisitionType: l.acquisitionType,
          acquiredAt: l.date ? new Date(l.date) : new Date(),
          supplier: l.supplier,
          reference: l.reference,
          note: l.note,
        })),
      );
    await tx
      .update(products)
      .set({ quantity: card.quantity + added })
      .where(eq(products.id, card.id));
    await recordRestock(tx, card.id, card.quantity, card.quantity + added);
  }
  if (trade) {
    if (!lines.every((l) => l.acquisitionType === "Trade-in"))
      throw new Error("Store credit receipts must contain only trade-ins.");
    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, trade.customerId))
      .for("update");
    if (!customer) throw new Error("Customer not found.");
    await tx
      .update(customers)
      .set({ creditBalance: sql`${customers.creditBalance} + ${trade.amount}` })
      .where(eq(customers.id, customer.id));
    await tx
      .insert(creditTransactions)
      .values({
        customerId: customer.id,
        amount: trade.amount,
        reason: "Trade-in",
        note: `Inventory receipt ${receipt.id}`,
      });
  }
  return receipt;
}
async function recordRestock(
  tx: InventoryTx,
  id: string,
  before: number,
  after: number,
) {
  if (before !== 0 || after <= 0) return;
  await tx.insert(events).values({ productId: id, quantity: after });
  // Existing account watch flow uses lastSeenQuantity. Durable events are the delivery outbox;
  // no external email service is currently configured in this application.
  await tx
    .update(watchlists)
    .set({ lastSeenQuantity: after })
    .where(eq(watchlists.productId, id));
}
export async function consumeItem(
  tx: InventoryTx,
  item: typeof orderItems.$inferSelect,
) {
  if (!item.productId) throw new Error("Sale line has no product.");
  const [card] = await tx
    .select()
    .from(products)
    .where(eq(products.id, item.productId))
    .for("update");
  if (!card || card.quantity < item.quantity)
    throw new Error("Insufficient stock.");
  const available = await tx
    .select()
    .from(lots)
    .where(and(eq(lots.productId, card.id), gt(lots.remainingQuantity, 0)))
    .orderBy(asc(lots.acquiredAt), asc(lots.createdAt), asc(lots.id))
    .for("update");
  let needed = item.quantity,
    cost: number | null = 0;
  for (const lot of available) {
    if (!needed) break;
    const quantity = Math.min(needed, lot.remainingQuantity);
    needed -= quantity;
    if (lot.unitCost === null) cost = null;
    else if (cost !== null) cost += quantity * lot.unitCost;
    await tx
      .insert(allocations)
      .values({
        orderItemId: item.id,
        lotId: lot.id,
        quantity,
        unitCost: lot.unitCost,
      });
    await tx
      .update(lots)
      .set({ remainingQuantity: lot.remainingQuantity - quantity })
      .where(eq(lots.id, lot.id));
  }
  if (needed)
    throw new Error(
      "Inventory ledger does not match stock. Run the inventory audit; no sale was saved.",
    );
  await tx
    .update(orderItems)
    .set({ costBasis: cost })
    .where(eq(orderItems.id, item.id));
  await tx
    .update(products)
    .set({ quantity: card.quantity - item.quantity })
    .where(eq(products.id, card.id));
}
export async function restoreItem(
  tx: InventoryTx,
  item: typeof orderItems.$inferSelect,
) {
  if (!item.productId) return;
  const [card] = await tx
    .select()
    .from(products)
    .where(eq(products.id, item.productId))
    .for("update");
  const used = await tx
    .select()
    .from(allocations)
    .where(
      and(eq(allocations.orderItemId, item.id), isNull(allocations.restoredAt)),
    )
    .for("update");
  if (!used.length) {
    // Orders created before the migration have no allocations. Their order-level lock/status
    // guards this one-time return; retain unknown cost rather than manufacturing provenance.
    const historical = await tx
      .select()
      .from(allocations)
      .where(eq(allocations.orderItemId, item.id))
      .limit(1);
    if (historical.length) return;
    const [lot] = await tx
      .insert(lots)
      .values({
        productId: item.productId,
        acquiredQuantity: item.quantity,
        remainingQuantity: 0,
        acquisitionType: "Opening balance",
        note: "Legacy order return; cost unknown",
      })
      .returning();
    const [allocation] = await tx
      .insert(allocations)
      .values({ orderItemId: item.id, lotId: lot.id, quantity: item.quantity })
      .returning();
    used.push(allocation);
  }
  let returned = 0;
  for (const allocation of used) {
    await tx
      .update(lots)
      .set({
        remainingQuantity: sql`${lots.remainingQuantity} + ${allocation.quantity}`,
      })
      .where(eq(lots.id, allocation.lotId));
    await tx
      .update(allocations)
      .set({ restoredAt: new Date() })
      .where(eq(allocations.id, allocation.id));
    returned += allocation.quantity;
  }
  await tx
    .update(products)
    .set({ quantity: card.quantity + returned })
    .where(eq(products.id, card.id));
  await recordRestock(tx, card.id, card.quantity, card.quantity + returned);
}
