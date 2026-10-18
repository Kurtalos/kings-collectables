import { db } from "@/db";
import { customers, orders, orderItems, wishlists, watchlists, addresses, creditTransactions, products, productCategories } from "@/db/schema";
import { and, desc, eq, sql, inArray } from "drizzle-orm";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { isUUID } from "@/lib/validation";
import type { Card } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_PAGE = 100;

/** Shape returned for a customer row in the list. Never includes passwordHash. */
export type CustomerSummary = {
  id: string;
  name: string;
  email: string;
  creditBalance: number;
  joinedAt: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  wishlistCount: number;
  watchlistCount: number;
  addressCount: number;
};

/** Postgres aggregates come back as strings through the pg driver, so normalise defensively. */
function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }
  return null;
}

function summarise(row: typeof customers.$inferSelect, stats: { orderCount: number; totalSpent: number; lastOrderAt: unknown; wishlistCount: number; watchlistCount: number; addressCount: number }): CustomerSummary {
  return {
    id: row.id, name: row.name, email: row.email, creditBalance: row.creditBalance,
    joinedAt: row.createdAt.toISOString(),
    orderCount: Number(stats.orderCount),
    totalSpent: Number(stats.totalSpent),
    lastOrderAt: toIsoString(stats.lastOrderAt),
    wishlistCount: Number(stats.wishlistCount),
    watchlistCount: Number(stats.watchlistCount),
    addressCount: Number(stats.addressCount),
  };
}

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const params = new URL(request.url).searchParams;
    const detailId = params.get("id");
    if (detailId !== null) return customerDetail(detailId);

    const search = params.get("search")?.trim() || "";
    const sort = params.get("sort") || "recent";
    const page = Math.max(1, Number(params.get("page") || 1));
    const size = Math.min(MAX_PAGE, Math.max(5, Number(params.get("size") || 25)));

    // Aggregate stats in one grouped query rather than per-customer round trips.
    const orderStats = await db.select({
      customerId: orders.customerId,
      orderCount: sql<number>`count(*)::int`,
      totalSpent: sql<number>`coalesce(sum(case when ${orders.status} not in ('Cancelled','Refunded') then ${orders.total} else 0 end), 0)::int`,
      lastOrderAt: sql<string | null>`max(${orders.createdAt})::text`,
    }).from(orders).where(sql`${orders.customerId} is not null`).groupBy(orders.customerId);

    const wishCounts = await db.select({ customerId: wishlists.customerId, count: sql<number>`count(*)::int` }).from(wishlists).groupBy(wishlists.customerId);
    const watchCounts = await db.select({ customerId: watchlists.customerId, count: sql<number>`count(*)::int` }).from(watchlists).groupBy(watchlists.customerId);
    const addressCounts = await db.select({ customerId: addresses.customerId, count: sql<number>`count(*)::int` }).from(addresses).groupBy(addresses.customerId);

    const orderMap = new Map(orderStats.map(row => [row.customerId!, row]));
    const wishMap = new Map(wishCounts.map(row => [row.customerId, Number(row.count)]));
    const watchMap = new Map(watchCounts.map(row => [row.customerId, Number(row.count)]));
    const addressMap = new Map(addressCounts.map(row => [row.customerId, Number(row.count)]));

    let rows = await db.select().from(customers).orderBy(desc(customers.createdAt));
    if (search) {
      const term = search.toLowerCase();
      rows = rows.filter(row => row.name.toLowerCase().includes(term) || row.email.toLowerCase().includes(term));
    }

    const summaries = rows.map(row => summarise(row, {
      orderCount: orderMap.get(row.id)?.orderCount ?? 0,
      totalSpent: orderMap.get(row.id)?.totalSpent ?? 0,
      lastOrderAt: orderMap.get(row.id)?.lastOrderAt ?? null,
      wishlistCount: wishMap.get(row.id) ?? 0,
      watchlistCount: watchMap.get(row.id) ?? 0,
      addressCount: addressMap.get(row.id) ?? 0,
    }));

    const sorted = sort === "spend" ? [...summaries].sort((a, b) => b.totalSpent - a.totalSpent)
      : sort === "orders" ? [...summaries].sort((a, b) => b.orderCount - a.orderCount)
      : sort === "name" ? [...summaries].sort((a, b) => a.name.localeCompare(b.name))
      : summaries;
    const total = sorted.length;
    const paged = sorted.slice((page - 1) * size, page * size);

    return Response.json({
      customers: paged, total, page, size,
      totals: {
        customers: summaries.length,
        withOrders: summaries.filter(row => row.orderCount > 0).length,
        totalSpent: summaries.reduce((sum, row) => sum + row.totalSpent, 0),
        creditOutstanding: summaries.reduce((sum, row) => sum + row.creditBalance, 0),
        wishlistItems: summaries.reduce((sum, row) => sum + row.wishlistCount, 0),
        watchlistItems: summaries.reduce((sum, row) => sum + row.watchlistCount, 0),
      },
    });
  } catch (error) { return apiError(error); }
}

function cardRow(row: typeof products.$inferSelect, categoryIds: string[]): Card {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    priceUpdatedAt: row.priceUpdatedAt ? row.priceUpdatedAt.toISOString() : null,
    priceMode: row.priceMode === "auto" ? "auto" as const : "manual" as const,
    categoryIds,
  };
}

async function customerDetail(id: string) {
  try {
    if (!isUUID(id)) throw new Error("Invalid customer ID.");
    const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!row) return Response.json({ error: "Customer not found." }, { status: 404 });

    const [theirOrders, savedRows, watchedRows, theirAddresses, credits] = await Promise.all([
      db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.createdAt)).limit(200),
      db.select({ productId: wishlists.productId, createdAt: wishlists.createdAt }).from(wishlists).where(eq(wishlists.customerId, id)),
      db.select().from(watchlists).where(eq(watchlists.customerId, id)),
      db.select().from(addresses).where(eq(addresses.customerId, id)),
      db.select().from(creditTransactions).where(eq(creditTransactions.customerId, id)).orderBy(desc(creditTransactions.createdAt)).limit(100),
    ]);

    const orderIds = theirOrders.map(order => order.id);
    const lines = orderIds.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];

    // Resolve wishlist/watchlist product ids into live catalogue rows so the owner sees current price and stock.
    const productIds = [...new Set([...savedRows.map(entry => entry.productId), ...watchedRows.map(entry => entry.productId)])];
    const catalogue = productIds.length ? await db.select().from(products).where(inArray(products.id, productIds)) : [];
    const links = catalogue.length ? await db.select().from(productCategories).where(inArray(productCategories.productId, catalogue.map(card => card.id))) : [];
    const catalogueMap = new Map(catalogue.map(card => [card.id, cardRow(card, links.filter(link => link.productId === card.id).map(link => link.categoryId))]));

    return Response.json({
      customer: {
        id: row.id, name: row.name, email: row.email, creditBalance: row.creditBalance, joinedAt: row.createdAt.toISOString(),
      },
      orders: theirOrders.map(order => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt ? order.paidAt.toISOString() : null,
        refundedAt: order.refundedAt ? order.refundedAt.toISOString() : null,
        items: lines.filter(line => line.orderId === order.id).map(line => ({ id: line.id, productId: line.productId, cardName: line.cardName, variant: line.variant, quantity: line.quantity, unitPrice: line.unitPrice })),
      })),
      wishlist: savedRows.map(entry => {
        const card = catalogueMap.get(entry.productId);
        return {
          productId: entry.productId, addedAt: entry.createdAt.toISOString(),
          card: card ? { id: card.id, name: card.name, setName: card.setName, imageUrl: card.imageUrl, price: card.price, quantity: card.quantity, condition: card.condition, finish: card.finish } : null,
        };
      }),
      watchlist: watchedRows.map(entry => {
        const card = catalogueMap.get(entry.productId);
        return {
          productId: entry.productId, addedAt: entry.createdAt.toISOString(),
          lastSeenQuantity: entry.lastSeenQuantity, lastSeenPrice: entry.lastSeenPrice,
          restocked: card ? card.quantity > entry.lastSeenQuantity : false,
          priceDrop: card ? card.price < entry.lastSeenPrice : false,
          card: card ? { id: card.id, name: card.name, setName: card.setName, imageUrl: card.imageUrl, price: card.price, quantity: card.quantity, condition: card.condition, finish: card.finish } : null,
        };
      }),
      addresses: theirAddresses.map(address => ({
        id: address.id, label: address.label, recipientName: address.recipientName, line1: address.line1, line2: address.line2,
        suburb: address.suburb, state: address.state, postcode: address.postcode, phone: address.phone, isDefault: address.isDefault,
      })),
      credits: credits.map(entry => ({
        id: entry.id, amount: entry.amount, reason: entry.reason, note: entry.note,
        orderNumber: entry.orderId ? theirOrders.find(order => order.id === entry.orderId)?.orderNumber ?? null : null,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    await requireOwner(request);
    const body = await request.json().catch(() => null) as { id?: unknown; amount?: unknown; reason?: unknown } | null;
    const id = body?.id;
    if (!id || !isUUID(id)) throw new Error("Invalid customer ID.");
    const amount = Number(body?.amount);
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1000000) throw new Error("Enter an adjustment between -$10,000 and $10,000.");
    const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 80) : amount > 0 ? "Store credit added" : "Store credit removed";

    const updated = await db.transaction(async tx => {
      const [customer] = await tx.select().from(customers).where(eq(customers.id, String(id))).for("update");
      if (!customer) throw new Error("Customer not found.");
      const balance = customer.creditBalance + amount;
      if (balance < 0) throw new Error(`${customer.name} only has ${customer.creditBalance} cents in store credit.`);
      await tx.update(customers).set({ creditBalance: balance }).where(eq(customers.id, customer.id));
      await tx.insert(creditTransactions).values({ customerId: customer.id, amount, reason });
      return { id: customer.id, name: customer.name, email: customer.email, creditBalance: balance };
    });
    return Response.json({ customer: updated });
  } catch (error) { return apiError(error); }
}
