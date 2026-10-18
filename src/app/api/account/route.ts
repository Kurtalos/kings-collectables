import { db } from "@/db";
import { customers, wishlists, watchlists, products } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { apiError } from "@/lib/admin-auth";
import { getCustomer, requireCustomer, setCustomerSession, clearCustomerSession, hashPassword, verifyPassword, validatePassword, sameOrigin } from "@/lib/customer-auth";
import { getOrders } from "@/lib/catalog";
import { listAddresses } from "@/app/api/addresses/route";
import { readBody, validEmail, textField, isUUID } from "@/lib/validation";
import { limitPublicRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function accountPayload(customer: { id: string; name: string; email: string }) {
  const [saved, watched, orders, addressesList] = await Promise.all([
    db.select({ productId: wishlists.productId }).from(wishlists).where(eq(wishlists.customerId, customer.id)),
    db.select().from(watchlists).where(eq(watchlists.customerId, customer.id)),
    getOrders({ customerId: customer.id }),
    listAddresses(customer.id),
  ]);
  return {
    customer,
    orders,
    addresses: addressesList,
    wishlistIds: saved.map(row => row.productId),
    watchlist: watched.map(row => ({ productId: row.productId, lastSeenQuantity: row.lastSeenQuantity, lastSeenPrice: row.lastSeenPrice, createdAt: row.createdAt.toISOString() })),
  };
}

export async function GET() {
  try {
    const customer = await getCustomer();
    if (!customer) return Response.json({ customer: null, orders: [], addresses: [], wishlistIds: [], watchlist: [] });
    return Response.json(await accountPayload(customer));
  } catch (error) { return apiError(error); }
}

export async function DELETE() {
  await clearCustomerSession();
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await readBody(request);
    const action = String(body.action || "");

    if (action === "register" || action === "login") {
      const limited = limitPublicRequests(request, `account-${action}`, 8); if (limited) return limited;
      if (!validEmail(body.email)) throw new Error("Enter a valid email address.");
      const email = body.email.toLowerCase().trim();
      const password = validatePassword(body.password);
      if (action === "register") {
        const name = textField(body.name, "Name");
        const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
        if (existing) throw new Error("An account with this email already exists. Try signing in.");
        const [created] = await db.insert(customers).values({ name, email, passwordHash: await hashPassword(password) }).returning({ id: customers.id, name: customers.name, email: customers.email });
        await setCustomerSession(created.id, request);
        return Response.json(await accountPayload(created), { status: 201 });
      }
      const [found] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
      if (!found || !(await verifyPassword(password, found.passwordHash))) throw new Error("That email or password wasn't correct.");
      await setCustomerSession(found.id, request);
      return Response.json(await accountPayload({ id: found.id, name: found.name, email: found.email }));
    }

    const customer = await requireCustomer();

    if (action === "wishlist" || action === "watchlist") {
      if (!isUUID(body.productId)) throw new Error("Choose a valid card.");
      const [card] = await db.select({ id: products.id, quantity: products.quantity, price: products.price }).from(products).where(eq(products.id, body.productId)).limit(1);
      if (!card) throw new Error("This card is no longer in the catalogue.");
      const table = action === "wishlist" ? wishlists : watchlists;
      const match = and(eq(table.customerId, customer.id), eq(table.productId, card.id));
      const [existing] = await db.select().from(table).where(match).limit(1);
      if (existing) await db.delete(table).where(match);
      else if (action === "wishlist") {
        const count = (await db.select({ productId: wishlists.productId }).from(wishlists).where(eq(wishlists.customerId, customer.id))).length;
        if (count >= 200) throw new Error("Your wishlist can hold up to 200 cards.");
        await db.insert(wishlists).values({ customerId: customer.id, productId: card.id });
      } else {
        const count = (await db.select({ productId: watchlists.productId }).from(watchlists).where(eq(watchlists.customerId, customer.id))).length;
        if (count >= 200) throw new Error("Your watch list can hold up to 200 cards.");
        await db.insert(watchlists).values({ customerId: customer.id, productId: card.id, lastSeenQuantity: card.quantity, lastSeenPrice: card.price });
      }
      return Response.json(await accountPayload(customer));
    }

    if (action === "sync") {
      const wishIds = Array.isArray(body.wishlistIds) ? body.wishlistIds.filter(isUUID).slice(0, 200) : [];
      const watchIds = Array.isArray(body.watchlistIds) ? body.watchlistIds.filter(isUUID).slice(0, 200) : [];
      const ids = [...new Set([...wishIds, ...watchIds])];
      const existing = ids.length ? await db.select({ id: products.id, quantity: products.quantity, price: products.price }).from(products).where(inArray(products.id, ids)) : [];
      const known = new Map(existing.map(card => [card.id, card]));
      if (wishIds.length) await db.insert(wishlists).values(wishIds.filter(id => known.has(id)).map(productId => ({ customerId: customer.id, productId }))).onConflictDoNothing();
      if (watchIds.length) await db.insert(watchlists).values(watchIds.filter(id => known.has(id)).map(productId => ({ customerId: customer.id, productId, lastSeenQuantity: known.get(productId)!.quantity, lastSeenPrice: known.get(productId)!.price }))).onConflictDoNothing();
      return Response.json(await accountPayload(customer));
    }

    throw new Error("Unknown account action.");
  } catch (error) { return apiError(error); }
}
