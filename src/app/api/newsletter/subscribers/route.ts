import { db } from "@/db";
import { newsletter } from "@/db/schema";
import { sql } from "drizzle-orm";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { readBody, validEmail } from "@/lib/validation";
import { insightPaging, insightsCSV, type Subscriber } from "@/lib/admin-insights";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const params = new URL(request.url).searchParams, paging = insightPaging(params), sort = params.get("sort") || "newest";
    if (!["newest", "oldest", "email"].includes(sort)) throw new Error("Choose a valid subscriber sort.");
    const order = sort === "email" ? sql`n.email ASC` : sort === "oldest" ? sql`n.created_at ASC,n.email ASC` : sql`n.created_at DESC,n.email ASC`;
    const result = await db.transaction(async tx => {
      const stats = await tx.execute(sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE n.created_at>=now()-interval '30 days')::int AS recent,count(*) FILTER(WHERE c.email IS NOT NULL)::int AS "withAccount" FROM newsletter n LEFT JOIN (SELECT DISTINCT lower(email) AS email FROM customers) c ON c.email=lower(n.email)`);
      const count = await tx.execute(sql`SELECT count(*)::int AS total FROM newsletter n WHERE n.email ILIKE ${paging.pattern}`);
      const rows = await tx.execute(sql`SELECT n.email,n.created_at AS "joinedAt" FROM newsletter n WHERE n.email ILIKE ${paging.pattern} ORDER BY ${order} ${paging.exportCSV ? sql`` : sql`LIMIT ${paging.size} OFFSET ${(paging.page-1)*paging.size}`}`);
      return { rows: rows.rows as Subscriber[], total: Number(count.rows[0].total), stats: stats.rows[0], page: paging.page, size: paging.size };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    if (paging.exportCSV) return new Response(insightsCSV(["email", "website_signup_at"], result.rows.map(row => [row.email, new Date(row.joinedAt).toISOString()])), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="kings-newsletter-signups.csv"' } });
    return Response.json(result, { headers });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try {
    await requireOwner(request);
    const body = await readBody(request);
    if (!validEmail(body.email)) throw new Error("Choose a valid subscriber email.");
    const rows = await db.delete(newsletter).where(sql`lower(${newsletter.email})=${body.email.toLowerCase().trim()}`).returning({ email: newsletter.email });
    return Response.json({ removed: rows.length > 0 }, { headers });
  } catch (error) { return apiError(error); }
}
