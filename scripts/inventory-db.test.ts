import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
async function main() {
  if (!process.env.DATABASE_URL?.includes("/inventory_test"))
    throw new Error("Use only the isolated inventory_test database.");
  const { db, pool } = await import("../src/db");
  const {
    products,
    inventoryLots,
    inventoryAllocations,
    inventoryRestockEvents,
    orders,
    orderItems,
    customers,
    creditTransactions,
    watchlists,
  } = await import("../src/db/schema");
  const { receiveStock, consumeItem, restoreItem } =
    await import("../src/lib/inventory");
  const { eq, sql } = await import("drizzle-orm");
  try {
    const [card] = await db
      .insert(products)
      .values({
        scryfallId: randomUUID(),
        name: "Inventory Test Card",
        setName: "Test Set",
        setCode: "tst",
        collectorNumber: "1",
        imageUrl: "/test.png",
        artUrl: "/test.png",
        rarity: "common",
        typeLine: "Creature",
        price: 1000,
        quantity: 0,
      })
      .returning();
    const [customer] = await db
      .insert(customers)
      .values({
        name: "Inventory Tester",
        email: `${randomUUID()}@example.invalid`,
        passwordHash: "test-only",
      })
      .returning();
    await db
      .insert(watchlists)
      .values({ customerId: customer.id, productId: card.id });
    const line = (
      quantity: number,
      cost: number | null,
      type = "Purchase",
    ) => ({
      productId: card.id,
      quantity,
      unitCost: cost,
      acquisitionType: type,
    });
    await db.transaction((tx) =>
      receiveStock(tx, [line(2, 100)], randomUUID()),
    );
    await db.transaction((tx) =>
      receiveStock(tx, [line(3, 250)], randomUUID()),
    );
    let [current] = await db
      .select()
      .from(products)
      .where(eq(products.id, card.id));
    assert.equal(current.quantity, 5);
    assert.equal(current.price, 1000);
    let events = await db
      .select()
      .from(inventoryRestockEvents)
      .where(eq(inventoryRestockEvents.productId, card.id));
    assert.equal(events.length, 1);
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: randomUUID(),
        customerName: "Test",
        email: "test@example.invalid",
        shippingAddress: "Test",
        subtotal: 3000,
        shipping: 0,
        total: 3000,
      })
      .returning();
    const [item] = await db
      .insert(orderItems)
      .values({
        orderId: order.id,
        productId: card.id,
        cardName: card.name,
        variant: "Test",
        quantity: 3,
        unitPrice: 1000,
      })
      .returning();
    await db.transaction((tx) => consumeItem(tx, item));
    const [costed] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, item.id));
    assert.equal(costed.costBasis, 450);
    const consumed = await db
      .select()
      .from(inventoryAllocations)
      .where(eq(inventoryAllocations.orderItemId, item.id));
    assert.equal(consumed.length, 2);
    await db.transaction((tx) => restoreItem(tx, item));
    await db.transaction((tx) => restoreItem(tx, item));
    [current] = await db
      .select()
      .from(products)
      .where(eq(products.id, card.id));
    assert.equal(current.quantity, 5);
    const restored = await db
      .select()
      .from(inventoryLots)
      .where(eq(inventoryLots.productId, card.id));
    assert.deepEqual(restored.map((l) => l.remainingQuantity).sort(), [2, 3]);
    const key = randomUUID();
    await Promise.all([
      db.transaction((tx) =>
        receiveStock(tx, [line(2, 150, "Trade-in")], key, {
          customerId: customer.id,
          amount: 300,
        }),
      ),
      db.transaction((tx) =>
        receiveStock(tx, [line(2, 150, "Trade-in")], key, {
          customerId: customer.id,
          amount: 300,
        }),
      ),
    ]);
    const [credited] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customer.id));
    assert.equal(credited.creditBalance, 300);
    const credits = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.customerId, customer.id));
    assert.equal(credits.length, 1);
    await db.transaction((tx) =>
      receiveStock(
        tx,
        [
          line(1, null, "Pack opening"),
          line(1, 75, "Pack opening"),
          line(1, 0),
        ],
        randomUUID(),
      ),
    );
    const before = await db
      .select()
      .from(products)
      .where(eq(products.id, card.id));
    await assert.rejects(() =>
      db.transaction((tx) =>
        receiveStock(
          tx,
          [line(1, 100), { ...line(1, 100), productId: randomUUID() }],
          randomUUID(),
        ),
      ),
    );
    const after = await db
      .select()
      .from(products)
      .where(eq(products.id, card.id));
    assert.equal(before[0].quantity, after[0].quantity);
    // Concurrent sells cannot oversell; a forced rollback leaves allocations and quantity intact.
    const [sale2] = await db
      .insert(orderItems)
      .values({
        orderId: order.id,
        productId: card.id,
        cardName: card.name,
        variant: "Test",
        quantity: 10,
        unitPrice: 999,
      })
      .returning();
    const [sale3] = await db
      .insert(orderItems)
      .values({
        orderId: order.id,
        productId: card.id,
        cardName: card.name,
        variant: "Test",
        quantity: 10,
        unitPrice: 999,
      })
      .returning();
    const outcomes = await Promise.allSettled([
      db.transaction((tx) => consumeItem(tx, sale2)),
      db.transaction((tx) => consumeItem(tx, sale3)),
    ]);
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
    const unknown = await db
      .select()
      .from(orderItems)
      .where(
        eq(
          orderItems.id,
          outcomes[0].status === "fulfilled" ? sale2.id : sale3.id,
        ),
      );
    assert.equal(unknown[0].costBasis, null);
    [current] = await db
      .select()
      .from(products)
      .where(eq(products.id, card.id));
    assert.equal(current.quantity, 0);
    await db.transaction((tx) =>
      receiveStock(tx, [line(1, 10), line(1, 20)], randomUUID()),
    );
    events = await db
      .select()
      .from(inventoryRestockEvents)
      .where(eq(inventoryRestockEvents.productId, card.id));
    assert.equal(events.length, 2);
    const [legacy] = await db
      .insert(orderItems)
      .values({
        orderId: order.id,
        productId: card.id,
        cardName: card.name,
        variant: "Legacy test",
        quantity: 1,
        unitPrice: 1000,
        costBasis: 123,
      })
      .returning();
    // Additive migration reruns safely without manufacturing extra opening stock.
    await pool.query(
      readFileSync("scripts/migrations/001-inventory.sql", "utf8"),
    );
    const [legacyAfter] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, legacy.id));
    assert.equal(legacyAfter.costBasis, null);
    assert.equal(legacyAfter.legacyCostBasis, 123);
    const { dispatchRestockEvents } = await import("../src/lib/restock");
    await dispatchRestockEvents();
    await dispatchRestockEvents();
    const processed = await db
      .select()
      .from(inventoryRestockEvents)
      .where(eq(inventoryRestockEvents.productId, card.id));
    assert.ok(processed.every((e) => e.processedAt));
    assert.equal(processed.length, 2);
    const mismatch = await db.execute(
      sql`SELECT p.id FROM products p LEFT JOIN inventory_lots l ON l.product_id=p.id GROUP BY p.id HAVING p.quantity<>coalesce(sum(l.remaining_quantity),0)`,
    );
    assert.equal(mismatch.rows.length, 0);
    console.log(
      "PASS: zero-stock receive; two-cost FIFO; exact/idempotent return; trade credit idempotency; pack unknown/allocated/zero; duplicate lots; transactional rollback; concurrent oversell; restock transitions; migration rerun; ledger parity.",
    );
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
