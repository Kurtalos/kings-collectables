import { db } from "@/db";
import { wishlists, watchlists } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getOrders, getProductsByIds } from "@/lib/catalog";
import { listAddresses } from "@/app/api/addresses/route";
import type { AccountData, Customer } from "@/lib/types";

/** One source of truth for server-rendered accounts and the customer account API. */
export async function getAccountData(customer: Customer | null): Promise<AccountData> {
  if (!customer) return { customer: null, orders: [], addresses: [], wishlistIds: [], watchlist: [], wishlistProducts: [], watchProducts: [] };

  const [saved, watched, orders, addresses] = await Promise.all([
    db.select({ productId: wishlists.productId }).from(wishlists).where(eq(wishlists.customerId, customer.id)).orderBy(asc(wishlists.createdAt)),
    db.select().from(watchlists).where(eq(watchlists.customerId, customer.id)).orderBy(asc(watchlists.createdAt)),
    getOrders({ customerId: customer.id }),
    listAddresses(customer.id),
  ]);

  const wishlistIds = saved.map(row => row.productId);
  const watchlist = watched.map(row => ({
    productId: row.productId,
    lastSeenQuantity: row.lastSeenQuantity,
    lastSeenPrice: row.lastSeenPrice,
    createdAt: row.createdAt.toISOString(),
  }));
  const allProducts = await getProductsByIds([...wishlistIds, ...watchlist.map(row => row.productId)]);
  const byId = new Map(allProducts.map(product => [product.id, product]));
  return {
    customer,
    orders,
    addresses,
    wishlistIds,
    watchlist,
    wishlistProducts: wishlistIds.flatMap(id => { const product = byId.get(id); return product ? [product] : []; }),
    watchProducts: watchlist.flatMap(row => { const product = byId.get(row.productId); return product ? [product] : []; }),
  };
}
