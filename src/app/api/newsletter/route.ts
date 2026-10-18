import { db } from "@/db";
import { newsletter } from "@/db/schema";
import { readBody, validEmail } from "@/lib/validation";
import { apiError } from "@/lib/admin-auth";
import { limitPublicRequests } from "@/lib/rate-limit";
export async function POST(request: Request) {
  const limited = limitPublicRequests(request, "newsletter", 20); if (limited) return limited;
  try { const body = await readBody(request); if (!validEmail(body.email)) throw new Error("Please enter a valid email address."); await db.insert(newsletter).values({ email: body.email.toLowerCase().trim() }).onConflictDoNothing(); return Response.json({ ok: true }); } catch (error) { return apiError(error); }
}
