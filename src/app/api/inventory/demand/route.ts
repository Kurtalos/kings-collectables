import { db } from "@/db";
import { sql } from "drizzle-orm";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { isUUID } from "@/lib/validation";
import { insightPaging, demandCSV, type DemandRow } from "@/lib/admin-insights";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const params = new URL(request.url).searchParams, paging = insightPaging(params);
    const productId = params.get("productId");
    if (productId !== null) {
      if (!isUUID(productId)) throw new Error("Choose a valid card variant.");
      const result = await db.transaction(async tx => {
        const people = await tx.execute(sql`SELECT c.id, c.name, c.email, w.created_at AS "addedAt" FROM watchlists w JOIN customers c ON c.id=w.customer_id WHERE w.product_id=${productId} ORDER BY w.created_at,c.id LIMIT ${paging.size} OFFSET ${(paging.page-1)*paging.size}`);
        const total = await tx.execute(sql`SELECT count(*)::int AS total FROM watchlists WHERE product_id=${productId}`);
        return { rows: people.rows, total: Number(total.rows[0].total), page: paging.page, size: paging.size };
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
      return Response.json(result, { headers });
    }
    const stock = params.get("stock") || "out", sort = params.get("sort") || "demand";
    if (!["out", "low", "all"].includes(stock) || !["demand", "oldest", "stock", "name"].includes(sort)) throw new Error("Choose valid demand filters.");
    const stockFilter = stock === "out" ? sql`p.quantity=0` : stock === "low" ? sql`p.quantity<=3` : sql`true`;
    const where = sql`${stockFilter} AND (p.name ILIKE ${paging.pattern} OR p.set_name ILIKE ${paging.pattern} OR p.set_code ILIKE ${paging.pattern} OR p.collector_number ILIKE ${paging.pattern})`;
    const order = sort === "oldest" ? sql`min(w.created_at) ASC, count(*) DESC` : sort === "stock" ? sql`p.quantity ASC, count(*) DESC` : sort === "name" ? sql`p.name ASC, count(*) DESC` : sql`count(*) DESC, p.quantity ASC, min(w.created_at) ASC`;
    const result = await db.transaction(async tx => {
      const stats = await tx.execute(sql`SELECT count(DISTINCT p.id)::int AS variants,count(DISTINCT w.customer_id)::int AS customers,count(*)::int AS interests,count(DISTINCT p.id) FILTER(WHERE p.quantity=0)::int AS "outOfStock" FROM watchlists w JOIN products p ON p.id=w.product_id WHERE ${where}`);
      const rows = await tx.execute(sql`SELECT p.id AS "productId",p.name,p.set_name AS "setName",p.set_code AS "setCode",p.collector_number AS "collectorNumber",p.condition,p.finish,p.quantity,count(*)::int AS interested,min(w.created_at) AS oldest,max(w.created_at) AS newest FROM watchlists w JOIN products p ON p.id=w.product_id WHERE ${where} GROUP BY p.id ORDER BY ${order},p.name,p.set_code,p.collector_number,p.id ${paging.exportCSV ? sql`` : sql`LIMIT ${paging.size} OFFSET ${(paging.page-1)*paging.size}`}`);
      return { rows: rows.rows as DemandRow[], stats: stats.rows[0], total: Number(stats.rows[0].variants), page: paging.page, size: paging.size };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    if (paging.exportCSV) return new Response(demandCSV(result.rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="kings-restock-demand.csv"' } });
    return Response.json(result, { headers });
  } catch (error) { return apiError(error); }
}
