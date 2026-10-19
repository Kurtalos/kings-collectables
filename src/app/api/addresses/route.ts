import { db } from "@/db";
import { addresses } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { apiError } from "@/lib/admin-auth";
import { requireCustomer, sameOrigin } from "@/lib/customer-auth";
import { readBody, isUUID } from "@/lib/validation";
import { validateAddress, MAX_ADDRESSES, type AddressFields } from "@/lib/address";
import { limitPublicRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function serialise(row: typeof addresses.$inferSelect) {
  return {
    id: row.id, label: row.label, recipientName: row.recipientName, line1: row.line1, line2: row.line2,
    suburb: row.suburb, state: row.state, postcode: row.postcode, phone: row.phone, isDefault: row.isDefault,
  };
}
export async function listAddresses(customerId: string) {
  const rows = await db.select().from(addresses).where(eq(addresses.customerId, customerId)).orderBy(desc(addresses.isDefault), asc(addresses.createdAt));
  return rows.map(serialise);
}

export async function GET() {
  try {
    const customer = await requireCustomer();
    return Response.json({ addresses: await listAddresses(customer.id) });
  } catch (error) { return apiError(error, 401); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    // Authenticate before counting, so unauthenticated floods cannot starve real customers of quota.
    const customer = await requireCustomer();
    const limited = limitPublicRequests(request, "address-save", 30); if (limited) return limited;
    const body = await readBody(request);
    const fields = validateAddress(body);

    if (isUUID(body.id)) {
      const [existing] = await db.select().from(addresses).where(and(eq(addresses.id, String(body.id)), eq(addresses.customerId, customer.id))).limit(1);
      if (!existing) throw new Error("That address no longer exists.");
      const isDefault = body.isDefault === true || (existing.isDefault && body.isDefault !== false);
      const [updated] = await db.transaction(async tx => {
        if (isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, customer.id));
        return tx.update(addresses).set({ ...fields, isDefault }).where(eq(addresses.id, existing.id)).returning();
      });
      return Response.json({ address: serialise(updated), addresses: await listAddresses(customer.id) });
    }

    const owned = await db.select({ id: addresses.id }).from(addresses).where(eq(addresses.customerId, customer.id));
    if (owned.length >= MAX_ADDRESSES) throw new Error(`You can save up to ${MAX_ADDRESSES} addresses. Remove one first.`);
    const duplicate = await db.select({ id: addresses.id }).from(addresses).where(and(
      eq(addresses.customerId, customer.id), eq(addresses.line1, fields.line1), eq(addresses.postcode, fields.postcode), eq(addresses.recipientName, fields.recipientName),
    )).limit(1);
    if (duplicate.length) throw new Error("That delivery address is already saved.");

    const isDefault = body.isDefault === true || owned.length === 0;
    const [created] = await db.transaction(async tx => {
      if (isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, customer.id));
      return tx.insert(addresses).values({ customerId: customer.id, ...fields, isDefault }).returning();
    });
    return Response.json({ address: serialise(created), addresses: await listAddresses(customer.id) }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const customer = await requireCustomer();
    const body = await readBody(request);
    if (!isUUID(body.id)) throw new Error("Invalid address ID.");
    const [existing] = await db.select().from(addresses).where(and(eq(addresses.id, String(body.id)), eq(addresses.customerId, customer.id))).limit(1);
    if (!existing) throw new Error("That address no longer exists.");
    if (body.action === "default") {
      await db.transaction(async tx => {
        await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, customer.id));
        await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, existing.id));
      });
      return Response.json({ addresses: await listAddresses(customer.id) });
    }
    throw new Error("Unknown address action.");
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const customer = await requireCustomer();
    const body = await readBody(request);
    if (!isUUID(body.id)) throw new Error("Invalid address ID.");
    const [removed] = await db.delete(addresses).where(and(eq(addresses.id, String(body.id)), eq(addresses.customerId, customer.id))).returning();
    if (!removed) throw new Error("That address no longer exists.");
    if (removed.isDefault) {
      const [next] = await db.select().from(addresses).where(eq(addresses.customerId, customer.id)).orderBy(asc(addresses.createdAt)).limit(1);
      if (next) await db.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
    }
    return Response.json({ addresses: await listAddresses(customer.id) });
  } catch (error) { return apiError(error); }
}

export type { AddressFields };
