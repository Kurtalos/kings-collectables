import { db } from "@/db";
import { products } from "@/db/schema";
import { sql } from "drizzle-orm";
import { scryfallRequest, type ScryfallCard } from "@/lib/scryfall";

export const dynamic = "force-dynamic";

type SearchResultCard = {
  id: string;
  name: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  imageUrl: string;
  price: number;
  quantity: number;
  condition: string;
  finish: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";

  if (!q || q.length < 2) {
    return Response.json({ cards: [] });
  }

  const cleanQuery = q.slice(0, 100);
  const pattern = `%${cleanQuery}%`;
  const exact = cleanQuery.toLowerCase();
  const prefix = `${cleanQuery}%`;

  try {
    // Fast trigram / ILIKE query against PostgreSQL
    const res = await db.execute(sql`
      SELECT 
        id, name, set_name as "setName", set_code as "setCode", 
        collector_number as "collectorNumber", image_url as "imageUrl", 
        price, quantity, condition, finish
      FROM products
      WHERE name ILIKE ${pattern} OR set_name ILIKE ${pattern} OR set_code = ${exact}
      ORDER BY 
        (quantity > 0) DESC,
        (lower(name) = ${exact}) DESC,
        (name ILIKE ${prefix}) DESC,
        name ASC,
        set_code ASC
      LIMIT 10
    `);

    let localCards = (res.rows || []) as SearchResultCard[];

    // If no or very few local results, try Scryfall live search as a fallback
    // and seamlessly register any newly found cards as out-of-stock products
    if (localCards.length === 0) {
      try {
        const scryfallRes = await scryfallRequest(`/cards/search?q=${encodeURIComponent(cleanQuery)}&order=released&dir=desc`) as { data?: ScryfallCard[] };
        const found = scryfallRes.data?.slice(0, 8) || [];

        for (const card of found) {
          const img = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal;
          const art = card.image_uris?.art_crop || card.card_faces?.[0]?.image_uris?.art_crop;
          if (!img || !art) continue;

          const usd = parseFloat(card.prices?.usd || card.prices?.usd_foil || "0.5");
          const estimatedAudPrice = Math.max(50, Math.round(usd * 1.5 * 100));

          const [inserted] = await db.insert(products).values({
            scryfallId: card.id,
            name: card.name,
            setName: card.set_name,
            setCode: card.set,
            collectorNumber: card.collector_number,
            imageUrl: img,
            artUrl: art,
            rarity: card.rarity,
            colors: card.colors || card.card_faces?.[0]?.colors || [],
            typeLine: card.type_line,
            manaCost: card.mana_cost || "",
            oracleText: card.oracle_text || card.card_faces?.[0]?.oracle_text || "",
            condition: "Near mint",
            finish: (card.prices?.usd_foil && !card.prices?.usd) ? "Foil" : "Non-foil",
            price: estimatedAudPrice,
            quantity: 0
          }).onConflictDoNothing().returning();

          if (inserted) {
            localCards.push({
              id: inserted.id,
              name: inserted.name,
              setName: inserted.setName,
              setCode: inserted.setCode,
              collectorNumber: inserted.collectorNumber,
              imageUrl: inserted.imageUrl,
              price: inserted.price,
              quantity: 0,
              condition: inserted.condition,
              finish: inserted.finish
            });
          }
        }
      } catch {
        // Scryfall search failure is non-fatal
      }
    }

    return Response.json({ cards: localCards });
  } catch (err) {
    console.error("Error in card search:", err);
    return Response.json({ cards: [] }, { status: 500 });
  }
}
