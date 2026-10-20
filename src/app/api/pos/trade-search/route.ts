import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { getStoreSettings } from "@/lib/store-settings-server";
import { isUUID } from "@/lib/validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const params = new URL(request.url).searchParams, id = params.get("productId"), q = (params.get("q") || "").trim();
    if (id && !isUUID(id)) throw new Error("Choose a valid printing.");
    if (q.length > 100) throw new Error("Keep the search below 100 characters.");
    const pageText = params.get("page") || "0";
    if (!/^\d+$/.test(pageText) || Number(pageText) > 10000) throw new Error("Choose a valid search page.");
    const page = Number(pageText), { tradeInPercent } = await getStoreSettings();
    if (!id && q.length < 2) return Response.json({ cards: [], hasMore: false, tradeInPercent }, { headers: { "Cache-Control": "private, no-store" } });
    const escaped = q.replace(/[\\%_]/g, "\\$&"), pattern = `%${escaped}%`, prefix = `${escaped}%`, exact = q.toLowerCase();
    const filter = id ? sql`id=${id}::uuid` : sql`(name ILIKE ${pattern} OR set_name ILIKE ${pattern} OR set_code=${exact} OR collector_number=${q} OR scryfall_id=${q})`;
    const rows = await db.execute(sql`SELECT id,name,set_name AS "setName",set_code AS "setCode",collector_number AS "collectorNumber",condition,finish,image_url AS "imageUrl",price,quantity FROM products WHERE ${filter}
      ORDER BY (lower(name)=${exact}) DESC,(name ILIKE ${prefix}) DESC,name,set_code,collector_number,condition,finish,id LIMIT 21 OFFSET ${id ? 0 : page * 20}`);
    return Response.json({ cards: rows.rows.slice(0,20), hasMore: rows.rows.length > 20, tradeInPercent }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
