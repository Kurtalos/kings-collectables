import { db } from "@/db";
import { inquiries } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { readBody, validEmail, textField, isUUID } from "@/lib/validation";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { limitPublicRequests } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const limited = limitPublicRequests(request, "contact", 5); if (limited) return limited;
  try { const body = await readBody(request); const name = textField(body.name, "Name"), message = textField(body.message, "Message", 2000); if (!validEmail(body.email)) throw new Error("Enter a valid email address."); await db.insert(inquiries).values({ name, email: body.email.toLowerCase().trim(), message }); return Response.json({ ok: true }, { status: 201 }); } catch (error) { return apiError(error); }
}
export async function GET(request: Request) {
  try { await requireOwner(request); const messages = await db.select().from(inquiries).orderBy(desc(inquiries.createdAt)).limit(200); return Response.json({ messages }); } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  try { await requireOwner(request); const body = await readBody(request); if (!isUUID(body.id)) throw new Error("Invalid message ID."); await db.update(inquiries).set({ read: true }).where(eq(inquiries.id, body.id)); return Response.json({ ok: true }); } catch (error) { return apiError(error); }
}
