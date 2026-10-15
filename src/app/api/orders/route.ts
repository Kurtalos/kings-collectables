import { db } from "@/db";
import { products, orders, orderItems, addresses } from "@/db/schema";
import { and, eq, inArray, sql, asc } from "drizzle-orm";
import { validateAddress, composeAddress, MAX_ADDRESSES } from "@/lib/address";
import { randomBytes } from "node:crypto";
import { getOrders, ensureSeeded } from "@/lib/catalog";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { getCustomer } from "@/lib/customer-auth";
import { readBody, isUUID, validEmail, textField } from "@/lib/validation";
import { limitPublicRequests } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const email = params.get("email"), orderNumber = params.get("orderNumber");
    if (email && orderNumber) {
      const limited = limitPublicRequests(request, "order-lookup", 20); if (limited) return limited;
      if (!validEmail(email) || orderNumber.length > 50) throw new Error("Enter a valid email and order number.");
      return Response.json({ orders: await getOrders({ email, orderNumber }) });
    }
    await requireOwner(request); return Response.json({ orders: await getOrders() });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  const limited = limitPublicRequests(request, "checkout", 20); if (limited) return limited;
  try {
    await ensureSeeded();
    const body = await readBody(request);
    const customerName = textField(body.customerName, "Name");
    if (!validEmail(body.email)) throw new Error("Enter a valid email address.");
    const email = body.email.toLowerCase().trim();
    const shopper = await getCustomer();

    // A saved address is re-read and re-composed server-side so the order always matches the stored record.
    let shippingAddress = "", addressId: string | null = null, recipientPhone: string | null = null;
    if (isUUID(body.addressId)) {
      if (!shopper) throw new Error("Sign in to use a saved address, or enter your delivery details.");
      const [saved] = await db.select().from(addresses).where(and(eq(addresses.id, String(body.addressId)), eq(addresses.customerId, shopper.id))).limit(1);
      if (!saved) throw new Error("That saved address is no longer available. Choose another.");
      addressId = saved.id;
      recipientPhone = saved.phone;
      shippingAddress = composeAddress({ recipientName: saved.recipientName, line1: saved.line1, line2: saved.line2, suburb: saved.suburb, state: saved.state, postcode: saved.postcode });
      if (customerName !== saved.recipientName && !shopper) throw new Error("The delivery name must match the saved address.");
    } else {
      const fields = validateAddress(body);
      shippingAddress = composeAddress(fields);
      recipientPhone = fields.phone || null;
      if (shopper && body.saveAddress === true) {
        const owned = await db.select({ id: addresses.id }).from(addresses).where(eq(addresses.customerId, shopper.id));
        if (owned.length < MAX_ADDRESSES) {
          const [created] = await db.insert(addresses).values({ customerId: shopper.id, ...fields, isDefault: owned.length === 0 }).onConflictDoNothing().returning();
          addressId = created?.id || null;
        }
      }
    }
    if (shippingAddress.length > 600) throw new Error("That delivery address is too long.");
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) throw new Error("Add at least one card to your cart (maximum 50 different cards).");
    const requested = new Map<string, number>();
    for (const line of body.items) {
      if (!line || typeof line !== "object" || !isUUID(line.productId) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000) throw new Error("Check the quantities in your cart.");
      const quantity = (requested.get(line.productId) || 0) + line.quantity;
      if (quantity > 1000) throw new Error("Please order up to 1,000 copies of each card at a time.");
      requested.set(line.productId, quantity);
    }
    const order = await db.transaction(async tx => {
      const stock = await tx.select().from(products).where(inArray(products.id, [...requested.keys()])).orderBy(asc(products.id)).for("update");
      if (stock.length !== requested.size) throw new Error("A card in your cart is no longer available. Please refresh your cart.");
      let subtotal = 0;
      for (const card of stock) { const quantity = requested.get(card.id)!; if (card.quantity < quantity) throw new Error(`Only ${card.quantity} copies of ${card.name} are currently available.`); subtotal += card.price * quantity; }
      if (!Number.isSafeInteger(subtotal) || subtotal > 100000000) throw new Error("This order is too large for online reservation. Please contact the store.");
      const shipping = subtotal >= 10000 ? 0 : 895;
      const orderNumber = `KC-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
      const [saved] = await tx.insert(orders).values({ orderNumber, customerId: shopper?.id || null, customerName: shopper?.name || customerName, email: shopper?.email || email, shippingAddress, addressId, recipientPhone, subtotal, shipping, total: subtotal + shipping }).returning();
      for (const card of stock) await tx.update(products).set({ quantity: sql`${products.quantity} - ${requested.get(card.id)!}` }).where(eq(products.id, card.id));
      await tx.insert(orderItems).values(stock.map(card => ({ orderId: saved.id, productId: card.id, cardName: card.name, variant: `${card.setCode.toUpperCase()} · ${card.condition} · ${card.finish}`, quantity: requested.get(card.id)!, unitPrice: card.price })));
      return saved;
    });
    return Response.json({ order: { id: order.id, orderNumber: order.orderNumber, total: order.total, status: order.status, addressId } }, { status: 201 });
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  try {
    await requireOwner(request);
    const body = await readBody(request);
    if (!isUUID(body.id) || !["Awaiting payment", "Paid", "Packing", "Shipped", "Cancelled"].includes(String(body.status))) throw new Error("Choose a valid order and status.");
    if (String(body.status) === "Paid") throw new Error("Confirm the payment through the payments endpoint, not this one.");
    await db.transaction(async tx => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, String(body.id))).for("update");
      if (!order) throw new Error("Order not found.");
      if (order.status === "Cancelled" && body.status !== "Cancelled") throw new Error("Cancelled orders cannot be reopened. Stock has already been returned.");
      if (order.status === "Refunded") throw new Error("Refunded sales are closed. Stock and credit have already been returned.");
      if (order.status === "Shipped" && body.status === "Cancelled") throw new Error("A shipped order cannot be cancelled here. Arrange a return with the customer first.");
      if (body.status === "Cancelled" && order.status !== "Cancelled" && order.channel !== "pos") {
        const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        for (const line of lines.sort((a, b) => (a.productId || "").localeCompare(b.productId || ""))) if (line.productId) await tx.update(products).set({ quantity: sql`${products.quantity} + ${line.quantity}` }).where(eq(products.id, line.productId));
      }
      if (body.status === "Cancelled" && order.channel === "pos") throw new Error("Register sales are refunded at the register, not cancelled here.");
      await tx.update(orders).set({ status: String(body.status) }).where(eq(orders.id, order.id));
    });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
