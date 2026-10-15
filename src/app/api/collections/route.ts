import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCatalog } from "@/lib/catalog";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { readBody, isUUID, textField } from "@/lib/validation";
import { slugify } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json({ collections: (await getCatalog()).collections }); }
async function save(request: Request, update: boolean) {
  try {
    await requireOwner(request);
    const body = await readBody(request);
    const name = textField(body.name, "Collection name", 80), slug = slugify(name);
    if (!slug) throw new Error("Please use at least one letter or number in the collection name.");
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 400) : "";
    const color = typeof body.color === "string" && /^#[a-f0-9]{6}$/i.test(body.color) ? body.color : "#69404d";
    const [duplicate] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    if (duplicate && duplicate.id !== body.id) throw new Error("A collection with this name already exists.");
    if (update) { if (!isUUID(body.id)) throw new Error("Invalid collection ID."); const [collection] = await db.update(categories).set({ name, slug, description, color }).where(eq(categories.id, body.id)).returning(); if (!collection) throw new Error("Collection not found."); return Response.json({ collection }); }
    const [collection] = await db.insert(categories).values({ name, slug, description, color }).returning();
    return Response.json({ collection }, { status: 201 });
  } catch (error) { return apiError(error); }
}
export const POST = (request: Request) => save(request, false);
export const PATCH = (request: Request) => save(request, true);
export async function DELETE(request: Request) {
  try { await requireOwner(request); const body = await readBody(request); if (!isUUID(body.id)) throw new Error("Invalid collection ID."); await db.delete(categories).where(eq(categories.id, body.id)); return Response.json({ ok: true }); } catch (error) { return apiError(error); }
}
