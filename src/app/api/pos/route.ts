import { dispatchRestockEvents } from "@/lib/restock";
import { consumeItem, restoreItem, receiveStock } from "@/lib/inventory";
import { db } from "@/db";
import { products, orders, orderItems, payments, customers, creditTransactions, inventoryReceipts, inventoryLots } from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { readBody, isUUID, validEmail, textField } from "@/lib/validation";
import { hashPassword, validatePassword } from "@/lib/customer-auth";
import { POS_METHODS, assertPosLines, assertDiscount, assertTradeIns, assertPayments, discountAmount } from "@/lib/pos";
import { money, type StoreOrder } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const orderRef = (order: typeof orders.$inferSelect) => ({
  ...order,
  createdAt: order.createdAt.toISOString(),
  paidAt: order.paidAt ? order.paidAt.toISOString() : null,
  refundedAt: order.refundedAt ? order.refundedAt.toISOString() : null,
});
const startOfToday = () => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); };

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const params = new URL(request.url).searchParams;

    const search = params.get("search")?.trim();
    if (search) {
      if (search.length < 2) throw new Error("Type at least two characters to search customers.");
      const pattern = `%${search.toLowerCase().replace(/[%_]/g, "")}%`;
      const found = await db.select({ id: customers.id, name: customers.name, email: customers.email, creditBalance: customers.creditBalance }).from(customers)
        .where(sql`lower(${customers.email}) like ${pattern} or lower(${customers.name}) like ${pattern}`).orderBy(desc(customers.createdAt)).limit(10);
      return Response.json({ customers: found });
    }

    const from = params.get("from") ? new Date(params.get("from")!) : startOfToday();
    const to = params.get("to") ? new Date(params.get("to")!) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new Error("Choose a valid date range.");
    if (to.getTime() - from.getTime() > 1000 * 60 * 60 * 24 * 366) throw new Error("Please query a range of one year or less.");

    const posOrders = await db.select().from(orders).where(and(eq(orders.channel, "pos"), gte(orders.createdAt, from), lte(orders.createdAt, to))).orderBy(desc(orders.createdAt)).limit(501);
    if (posOrders.length > 500) throw new Error("More than 500 sales match this report. Choose a narrower date range to avoid incomplete totals.");
    const ids = posOrders.map(order => order.id);
    const tenders = ids.length ? await db.select().from(payments).where(inArray(payments.orderId, ids)) : [];
    const credits = await db.select().from(creditTransactions).where(and(gte(creditTransactions.createdAt, from), lte(creditTransactions.createdAt, to)));
    const items = ids.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : [];

    const succeeded = tenders.filter(row => row.status === "succeeded");
    const refundedRows = tenders.filter(row => row.status === "refunded");
    const kept = posOrders.filter(order => !order.refundedAt);
    const returned = posOrders.filter(order => Boolean(order.refundedAt));
    const gross = kept.reduce((sum, order) => sum + order.total, 0);
    const refundedTotal = returned.reduce((sum, order) => sum + order.refundedAmount, 0);
    const byMethod = POS_METHODS.map(method => ({
      method,
      count: succeeded.filter(row => row.method === method).length,
      amount: succeeded.filter(row => row.method === method).reduce((sum, row) => sum + row.amount, 0),
      refunded: Math.abs(refundedRows.filter(row => row.method === method).reduce((sum, row) => sum + row.amount, 0)),
    })).filter(row => row.count || row.refunded);

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      sales: kept.length,
      refunds: returned.length,
      costBasis: items.filter(i => kept.some(o => o.id === i.orderId)).some(i => i.costBasis === null) ? null : items.filter(i => kept.some(o => o.id === i.orderId)).reduce((s,i)=>s+(i.costBasis || 0),0),
      gross, refundedTotal, takings: gross,
      discountGiven: posOrders.reduce((sum, order) => sum + order.discount, 0),
      cardsSold: items.filter(item => kept.some(order => order.id === item.orderId)).reduce((sum, item) => sum + item.quantity, 0),
      creditIssued: credits.filter(row => row.amount > 0).reduce((sum, row) => sum + row.amount, 0),
      creditRedeemed: Math.abs(credits.filter(row => row.amount < 0).reduce((sum, row) => sum + row.amount, 0)),
      byMethod,
      recent: posOrders.slice(0, 60).map(order => ({
        ...orderRef(order),
        items: items.filter(item => item.orderId === order.id).map(item => ({ id: item.id, productId: item.productId, cardName: item.cardName, variant: item.variant, quantity: item.quantity, unitPrice: item.unitPrice, costBasis: item.costBasis })),
        tenders: succeeded.filter(row => row.orderId === order.id).map(row => ({ method: row.method, amount: row.amount })),
      })) as (StoreOrder & { tenders: { method: string; amount: number }[] })[],
    });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    await requireOwner(request);
    const body = await readBody(request);
    const action = String(body.action || "sale");

    if (action === "createCustomer") {
      const name = textField(body.name, "Customer name");
      if (!validEmail(body.email)) throw new Error("Enter a valid email address.");
      const email = body.email.toLowerCase().trim();
      const password = validatePassword(body.password);
      const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
      if (existing) throw new Error("That email already has an account. Search for it instead.");
      const [created] = await db.insert(customers).values({ name, email, passwordHash: await hashPassword(password) }).returning({ id: customers.id, name: customers.name, email: customers.email, creditBalance: customers.creditBalance });
      return Response.json({ customer: created }, { status: 201 });
    }

    if (action === "credit") {
      if (!isUUID(body.customerId)) throw new Error("Choose a customer.");
      const amount = Number(body.amount);
      if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1000000) throw new Error("Enter an adjustment between -$10,000 and $10,000.");
      const reason = textField(body.reason || (amount > 0 ? "Store credit added" : "Store credit removed"), "Reason", 80);
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : null;
      const updated = await db.transaction(async tx => {
        const [customer] = await tx.select().from(customers).where(eq(customers.id, String(body.customerId))).for("update");
        if (!customer) throw new Error("Customer not found.");
        const balance = customer.creditBalance + amount;
        if (balance < 0) throw new Error(`${customer.name} only has ${money(customer.creditBalance)} in store credit.`);
        await tx.update(customers).set({ creditBalance: balance }).where(eq(customers.id, customer.id));
        await tx.insert(creditTransactions).values({ customerId: customer.id, amount, reason, note });
        return { id: customer.id, name: customer.name, email: customer.email, creditBalance: balance };
      });
      return Response.json({ customer: updated });
    }

    if (action === "refund") {
      if (!isUUID(body.orderId)) throw new Error("Choose a sale to refund.");
      const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : "Refunded at the register";
      const refunded = await db.transaction(async tx => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, String(body.orderId))).for("update");
        if (!order) throw new Error("Sale not found.");
        if (order.channel !== "pos") throw new Error("Only register sales can be refunded here. Contact the customer for online orders.");
        if (order.refundedAt) throw new Error("This sale has already been refunded.");
        if (order.status === "Cancelled") throw new Error("This sale was cancelled and its stock already returned.");

        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        for (const item of items.sort((a, b) => (a.productId || "").localeCompare(b.productId || ""))) {
          await restoreItem(tx, item);
        }

        const tenders = await tx.select().from(payments).where(and(eq(payments.orderId, order.id), eq(payments.status, "succeeded")));
        for (const tender of tenders) {
          await tx.insert(payments).values({ orderId: order.id, method: tender.method, amount: -tender.amount, status: "refunded", providerReference: `refund-of-${tender.providerReference || tender.id}` });
          if (tender.method === "Store credit" && order.customerId) {
            const [customer] = await tx.select().from(customers).where(eq(customers.id, order.customerId)).for("update");
            if (customer) {
              await tx.update(customers).set({ creditBalance: sql`${customers.creditBalance} + ${tender.amount}` }).where(eq(customers.id, customer.id));
              await tx.insert(creditTransactions).values({ customerId: customer.id, orderId: order.id, amount: tender.amount, reason: "Refund", note: `Refund of ${order.orderNumber}` });
            }
          }
        }

        const [updated] = await tx.update(orders).set({ status: "Refunded", refundedAmount: order.total, refundedAt: sql`now()`, refundReason: reason }).where(eq(orders.id, order.id)).returning();
        return updated;
      });
      await dispatchRestockEvents();
      return Response.json({ order: orderRef(refunded) });
    }

    if (action === "sale") {
      if (!isUUID(body.requestKey)) throw new Error("Refresh the register before completing this sale.");
      const requestKey = String(body.requestKey);
      const lines = assertPosLines(body.lines);
      const discount = assertDiscount(body.discount);
      const tradeIns = assertTradeIns(body.tradeIns);
      const tenders = assertPayments(body.payments);
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 400) || null : null;
      const customerEmail = typeof body.customerEmail === "string" && body.customerEmail.trim() ? body.customerEmail.trim().toLowerCase() : null;
      if (customerEmail && !validEmail(customerEmail)) throw new Error("Enter a valid customer email.");
      const customerName = typeof body.customerName === "string" && body.customerName.trim() ? body.customerName.trim().slice(0, 120) : "Walk-in customer";

      const wanted = new Map<string, { quantity: number; unitPrice?: number; note?: string }>();
      for (const line of lines) {
        if (!isUUID(line.productId)) throw new Error("Invalid card reference.");
        const prior = wanted.get(line.productId);
        if (prior) throw new Error("The same card variant appears twice. Combine the quantities.");
        wanted.set(line.productId, { quantity: line.quantity, unitPrice: line.unitPrice, note: line.note });
      }

      const sale = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestKey}, 0))`);
        const [prior] = await tx.select().from(orders).where(eq(orders.idempotencyKey, requestKey));
        if (prior) throw new Error(`Sale already saved as ${prior.orderNumber}. Check recent sales; no stock or credit was applied twice.`);
        const stock = await tx.select().from(products).where(inArray(products.id, [...new Set([...wanted.keys(), ...tradeIns.map(t => t.productId)])])).orderBy(asc(products.id)).for("update");
        if (stock.length !== new Set([...wanted.keys(), ...tradeIns.map(t => t.productId)]).size) throw new Error("One or more cards are no longer in the catalogue. Refresh the register.");

        let customer = null as (typeof customers.$inferSelect) | null;
        if (customerEmail) {
          const [found] = await tx.select().from(customers).where(eq(customers.email, customerEmail)).for("update");
          customer = found || null;
        }
        if (body.customerId && isUUID(body.customerId)) {
          const [found] = await tx.select().from(customers).where(eq(customers.id, String(body.customerId))).for("update");
          if (!found) throw new Error("That customer account no longer exists.");
          customer = found;
        }

        const priced = stock.filter(card => wanted.has(card.id)).map(card => {
          const entry = wanted.get(card.id)!;
          const unitPrice = entry.unitPrice === undefined ? card.price : entry.unitPrice;
          if (card.quantity < entry.quantity) throw new Error(`Only ${card.quantity} copies of ${card.name} are available.`);
          return { card, quantity: entry.quantity, unitPrice, note: entry.note };
        }).sort((a, b) => a.card.id.localeCompare(b.card.id));

        const lineTotal = priced.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0);
        const discountValue = discountAmount(lineTotal, discount);
        const subtotal = lineTotal - discountValue;
        const total = subtotal;
        if (total > 100000000) throw new Error("This sale is too large for the register.");

        const paid = tenders.reduce((sum, tender) => sum + tender.amount, 0);
        const creditTender = tenders.filter(tender => tender.method === "Store credit").reduce((sum, tender) => sum + tender.amount, 0);
        if (paid < total) throw new Error(`The sale total is ${money(total)} but only ${money(paid)} was recorded.`);
        if (creditTender > 0) {
          if (!customer) throw new Error("Attach a customer before taking store credit.");
          if (customer.creditBalance < creditTender) throw new Error(`${customer.name} has ${money(customer.creditBalance)} in store credit.`);
        }
        const change = paid - total;
        const cashTenders = tenders.filter(tender => tender.method === "Cash");
        if (change > 0 && cashTenders.length !== 1) throw new Error("Overpayment can only be given as change on a single cash tender.");

        let remaining = total;
        const applied = tenders.map(tender => {
          const amount = Math.min(tender.amount, remaining);
          remaining -= amount;
          return { method: tender.method, amount };
        }).filter(tender => tender.amount > 0);
        if (remaining > 0) throw new Error("The recorded payments do not cover the sale total.");

        const orderNumber = `POS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const methodSummary = [...new Set(applied.map(tender => tender.method))].join(" + ");
        const [order] = await tx.insert(orders).values({
          orderNumber, idempotencyKey: requestKey, channel: "pos", customerId: customer?.id || null,
          customerName: customer?.name || customerName, email: customer?.email || customerEmail || "walk-in@kingscollectables.local",
          shippingAddress: "Collected in store", status: "Paid", paidAt: sql`now()`,
          paymentMethod: methodSummary, paymentReceipt: `pos-${orderNumber}`,
          subtotal, shipping: 0, discount: discountValue, note, total,
        }).returning();

        const savedItems = await tx.insert(orderItems).values(priced.map(row => ({
          orderId: order.id, productId: row.card.id, cardName: row.card.name,
          variant: [row.card.setCode.toUpperCase(), row.card.condition, row.card.finish, row.note].filter(Boolean).join(" · "),
          quantity: row.quantity, unitPrice: row.unitPrice,
        }))).returning();
        for (const item of savedItems) await consumeItem(tx, item);
        await tx.insert(payments).values(applied.map(tender => ({ orderId: order.id, method: tender.method, amount: tender.amount, status: "succeeded", providerReference: `${orderNumber}-${tender.method.toLowerCase().replace(/\s+/g, "-")}` })));

        const newTrades=tradeIns.filter(t=>!t.receiptId);
        if (tradeIns.length && !customer) throw new Error("Attach a customer before receiving trade-ins.");
        for (const trade of tradeIns.filter(t=>t.receiptId)) {
          const [receipt]=await tx.select().from(inventoryReceipts).where(eq(inventoryReceipts.id,trade.receiptId!));
          const received=await tx.select().from(inventoryLots).where(and(eq(inventoryLots.receiptId,trade.receiptId!),eq(inventoryLots.productId,trade.productId)));
          if(!receipt || receipt.customerId!==customer!.id || received.reduce((s,l)=>s+l.acquiredQuantity,0)<trade.quantity || !received.every(l=>l.acquisitionType==='Trade-in')) throw new Error("Existing trade receipt does not match this customer and printing.");
        }
        const tradeTotal = newTrades.reduce((sum, trade) => sum + trade.amount, 0);
        if(newTrades.length) {
          const receipt=await receiveStock(tx,newTrades.map(t=>({productId:t.productId,quantity:t.quantity,unitCost:t.amount/t.quantity,acquisitionType:'Trade-in',supplier:customer!.name,reference:orderNumber,note:t.note})),`pos-trade-${order.id}`);
          await tx.update(inventoryReceipts).set({customerId:customer!.id,creditAmount:tradeTotal}).where(eq(inventoryReceipts.id,receipt.id));
        }
        let creditBalance = customer?.creditBalance ?? 0;
        if (customer && (tradeTotal > 0 || creditTender > 0)) {
          if (creditTender > 0) {
            creditBalance -= creditTender;
            await tx.insert(creditTransactions).values({ customerId: customer.id, orderId: order.id, amount: -creditTender, reason: "Credit redeemed", note: `Used on ${orderNumber}` });
          }
          for (const trade of newTrades) {
            creditBalance += trade.amount;
            await tx.insert(creditTransactions).values({ customerId: customer.id, orderId: order.id, amount: trade.amount, reason: "Trade-in", note: [trade.name, trade.note].filter(Boolean).join(" — ").slice(0, 200) });
          }
          await tx.update(customers).set({ creditBalance }).where(eq(customers.id, customer.id));
        } else if (tradeTotal > 0) {
          throw new Error("Attach a customer before issuing store credit for trade-ins.");
        }

        return { order, applied, change, creditBalance, customer, tradeTotal, discountValue, lineTotal, total };
      });

      await dispatchRestockEvents();
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, sale.order.id));
      const stockSnapshot = await db.select({id:products.id,quantity:products.quantity}).from(products).where(inArray(products.id,[...new Set([...lines.map(l=>l.productId),...tradeIns.map(t=>t.productId)])]));
      return Response.json({
        stock: stockSnapshot,
        sale: {
          ...orderRef(sale.order),
          items: items.map(item => ({ id: item.id, productId: item.productId, cardName: item.cardName, variant: item.variant, quantity: item.quantity, unitPrice: item.unitPrice, costBasis: item.costBasis })),
          tenders: sale.applied, change: sale.change, tradeTotal: sale.tradeTotal,
          customer: sale.customer ? { id: sale.customer.id, name: sale.customer.name, email: sale.customer.email, creditBalance: sale.creditBalance } : null,
        },
      }, { status: 201 });
    }

    throw new Error("Unknown register action.");
  } catch (error) { return apiError(error); }
}
