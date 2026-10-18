import { db } from "@/db";
import { products } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { lookupCard } from "@/lib/scryfall";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const params = new URL(request.url).searchParams;
    const name = params.get("name")?.trim() || "";
    const set = params.get("set")?.trim().toLowerCase();
    if (!name || name.length > 200 || (set && !/^[a-z0-9]{2,8}$/.test(set))) {
      throw new Error("Enter a card name and, optionally, a set code.");
    }

    const clean = name.toLowerCase();

    // Query PostgreSQL directly
    const [local] = await db.select().from(products).where(
      set 
        ? and(sql`lower(${products.name}) = ${clean}`, eq(products.setCode, set))
        : sql`lower(${products.name}) = ${clean}`
    ).limit(1);

    if (local) {
      return Response.json({ card: local });
    }

    // If not found in local db, search Scryfall directly
    const card = await lookupCard(name, set);
    return Response.json({ card });
  } catch (error) { 
    return apiError(error); 
  }
}
