import { db } from "@/db";
import { products, categories, productCategories, storeMeta, orders, orderItems, imports } from "@/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import seedCards from "@/data/cards.json";
import type { Card, Collection, StoreOrder, ImportLog } from "./types";

export async function ensureSeeded() {
  const marker = await db.select().from(storeMeta).where(eq(storeMeta.key, "catalogue-v1")).limit(1);
  if (marker.length) return;
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(849211)`);
    const checked = await tx.select().from(storeMeta).where(eq(storeMeta.key, "catalogue-v1")).limit(1);
    if (checked.length) return;
    const groups = [
      { name: "Commander staples", slug: "commander-staples", description: "The essentials for your favourite hundred-card format.", color: "#f26b0a" },
      { name: "Modern favourites", slug: "modern-favourites", description: "Powerful picks for competitive Modern decks.", color: "#111111" },
      { name: "Under $5", slug: "under-5", description: "Big upgrades that won't break the bank.", color: "#e8b923" },
      { name: "New arrivals", slug: "new-arrivals", description: "Fresh discoveries, just added to the shop.", color: "#d45504" },
    ];
    const savedGroups = await tx.insert(categories).values(groups).onConflictDoNothing().returning();
    const allGroups = savedGroups.length === groups.length ? savedGroups : await tx.select().from(categories);
    for (const item of seedCards) {
      const { categories: names, ...card } = item;
      const [saved] = await tx.insert(products).values(card).onConflictDoNothing().returning();
      if (saved) {
        const links = allGroups.filter(group => names.includes(group.name)).map(group => ({ productId: saved.id, categoryId: group.id }));
        if (links.length) await tx.insert(productCategories).values(links).onConflictDoNothing();
      }
    }
    await tx.insert(storeMeta).values({ key: "catalogue-v1", value: "seeded" }).onConflictDoNothing();
  });
}

export async function getCatalog(): Promise<{ products: Card[]; collections: Collection[] }> {
  await ensureSeeded();
  const [cards, groups, links] = await Promise.all([
    db.select().from(products).orderBy(desc(products.createdAt)),
    db.select().from(categories).orderBy(categories.createdAt),
    db.select().from(productCategories),
  ]);
  return {
    products: cards.map(card => ({ ...card, createdAt: card.createdAt.toISOString(), categoryIds: links.filter(link => link.productId === card.id).map(link => link.categoryId) })),
    collections: groups.map(group => ({ id: group.id, name: group.name, slug: group.slug, description: group.description, color: group.color, count: links.filter(link => link.categoryId === group.id).length })),
  };
}

export async function getOrders(filter?: { email?: string; orderNumber?: string; customerId?: string }): Promise<StoreOrder[]> {
  const list = filter?.customerId
    ? await db.select().from(orders).where(eq(orders.customerId, filter.customerId)).orderBy(desc(orders.createdAt)).limit(100)
    : filter?.email && filter.orderNumber
    ? await db.select().from(orders).where(sql`lower(${orders.email}) = ${filter.email.toLowerCase()} and ${orders.orderNumber} = ${filter.orderNumber.toUpperCase()}`).limit(1)
    : await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(200);
  if (!list.length) return [];
  const lines = await db.select().from(orderItems).where(inArray(orderItems.orderId, list.map(order => order.id)));
  return list.map(order => ({
    ...order,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    refundedAt: order.refundedAt ? order.refundedAt.toISOString() : null,
    items: lines.filter(line => line.orderId === order.id),
  }));
}

export async function getImportHistory(): Promise<ImportLog[]> {
  const logs = await db.select({ id: imports.id, filename: imports.filename, status: imports.status, imported: imports.imported, skipped: imports.skipped, createdAt: imports.createdAt }).from(imports).where(eq(imports.status, "completed")).orderBy(desc(imports.createdAt)).limit(20);
  return logs.map(log => ({ ...log, createdAt: log.createdAt.toISOString() }));
}
