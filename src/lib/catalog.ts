import { db } from "@/db";
import { products, categories, productCategories, storeMeta, orders, orderItems, imports } from "@/db/schema";
import { eq, desc, asc, sql, inArray } from "drizzle-orm";
import seedCards from "@/data/cards.json";
import { scryfallRequest, type ScryfallCard } from "./scryfall";
import type { Card, Collection, StoreOrder, ImportLog } from "./types";

export async function ensureSeeded() {
  const marker = await db.select().from(storeMeta).where(eq(storeMeta.key, "catalogue-v1")).limit(1);
  if (marker.length) return;
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(849211)`);
    const checked = await tx.select().from(storeMeta).where(eq(storeMeta.key, "catalogue-v1")).limit(1);
    if (checked.length) return;
    const groups = [
      { name: "Commander staples", slug: "commander-staples", description: "The essentials for your favourite hundred-card format.", color: "#f26b0a" },
      { name: "Modern favourites", slug: "modern-favourites", description: "Powerful picks for competitive Modern decks.", color: "#111111" },
      { name: "Under $5", slug: "under-5", description: "Big upgrades that won't break the bank.", color: "#e8b923" },
      { name: "New arrivals", slug: "new-arrivals", description: "Fresh discoveries, just added to the shop.", color: "#d45504" },
    ];
    const savedGroups = await tx.insert(categories).values(groups).onConflictDoNothing().returning();
    const allGroups = savedGroups.length === groups.length ? savedGroups : await tx.select().from(categories);
    for (const item of seedCards) {
      const { categories: names, ...card } = item;
      const [saved] = await tx.insert(products).values(card).onConflictDoNothing().returning();
      if (saved) {
        const links = allGroups.filter(group => names.includes(group.name)).map(group => ({ productId: saved.id, categoryId: group.id }));
        if (links.length) await tx.insert(productCategories).values(links).onConflictDoNothing();
      }
    }
    await tx.insert(storeMeta).values({ key: "catalogue-v1", value: "seeded" }).onConflictDoNothing();
  });
}

export type CatalogFilterOptions = {
  q?: string;
  set?: string;
  category?: string;
  inStockOnly?: boolean;
  limit?: number;
  offset?: number;
};

export async function getCatalog(options?: CatalogFilterOptions): Promise<{ products: Card[]; collections: Collection[]; totalCount?: number }> {
  await ensureSeeded();

  const [groups, links] = await Promise.all([
    db.select().from(categories).orderBy(categories.createdAt),
    db.select().from(productCategories),
  ]);

  const collections = groups.map(group => ({
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: group.description,
    color: group.color,
    count: links.filter(link => link.categoryId === group.id).length
  }));

  const q = options?.q?.trim();
  const set = options?.set?.trim().toLowerCase();
  const categorySlug = options?.category?.trim();
  const limit = options?.limit ?? (q ? 100 : 80);
  const offset = options?.offset ?? 0;

  // 1. If searching for a specific card query (e.g. "Rhystic Study" or "Black Lotus")
  if (q) {
    const cleanQuery = q.slice(0, 100);
    const pattern = `%${cleanQuery}%`;
    const exact = cleanQuery.toLowerCase();
    const prefix = `${cleanQuery}%`;

    const res = await db.execute(sql`
      SELECT 
        id, scryfall_id as "scryfallId", name, set_name as "setName", set_code as "setCode", 
        collector_number as "collectorNumber", image_url as "imageUrl", art_url as "artUrl",
        rarity, colors, type_line as "typeLine", mana_cost as "manaCost", oracle_text as "oracleText",
        condition, finish, price, price_mode as "priceMode", usd_price as "usdPrice",
        price_updated_at as "priceUpdatedAt", quantity, featured, created_at as "createdAt"
      FROM products
      WHERE (name ILIKE ${pattern} OR set_name ILIKE ${pattern} OR set_code = ${exact})
        ${set ? sql`AND set_code = ${set}` : sql``}
      ORDER BY 
        (quantity > 0) DESC,
        (lower(name) = ${exact}) DESC,
        (name ILIKE ${prefix}) DESC,
        (featured) DESC,
        name ASC,
        set_code ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    let foundRows = (res.rows || []) as any[];

    // If no results in local database, fetch from Scryfall and auto-insert into products
    if (foundRows.length === 0) {
      try {
        const scryfallRes = await scryfallRequest(`/cards/search?q=${encodeURIComponent(cleanQuery)}&order=released&dir=desc`) as { data?: ScryfallCard[] };
        const foundCards = scryfallRes.data?.slice(0, 30) || [];

        for (const card of foundCards) {
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
            foundRows.push(inserted);
          }
        }
      } catch {
        // Scryfall search fallback is best-effort
      }
    }

    const cards: Card[] = foundRows.map(card => ({
      ...card,
      priceMode: card.priceMode === "auto" ? ("auto" as const) : ("manual" as const),
      createdAt: card.createdAt instanceof Date ? card.createdAt.toISOString() : String(card.createdAt),
      priceUpdatedAt: card.priceUpdatedAt ? (card.priceUpdatedAt instanceof Date ? card.priceUpdatedAt.toISOString() : String(card.priceUpdatedAt)) : null,
      categoryIds: links.filter(link => link.productId === card.id).map(link => link.categoryId),
    }));

    return { products: cards, collections };
  }

  // 2. If filtering by set
  if (set) {
    const res = await db.execute(sql`
      SELECT 
        id, scryfall_id as "scryfallId", name, set_name as "setName", set_code as "setCode", 
        collector_number as "collectorNumber", image_url as "imageUrl", art_url as "artUrl",
        rarity, colors, type_line as "typeLine", mana_cost as "manaCost", oracle_text as "oracleText",
        condition, finish, price, price_mode as "priceMode", usd_price as "usdPrice",
        price_updated_at as "priceUpdatedAt", quantity, featured, created_at as "createdAt"
      FROM products
      WHERE set_code = ${set}
      ORDER BY 
        (quantity > 0) DESC,
        (featured) DESC,
        name ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const cards: Card[] = ((res.rows || []) as any[]).map(card => ({
      ...card,
      priceMode: card.priceMode === "auto" ? ("auto" as const) : ("manual" as const),
      createdAt: card.createdAt instanceof Date ? card.createdAt.toISOString() : String(card.createdAt),
      priceUpdatedAt: card.priceUpdatedAt ? (card.priceUpdatedAt instanceof Date ? card.priceUpdatedAt.toISOString() : String(card.priceUpdatedAt)) : null,
      categoryIds: links.filter(link => link.productId === card.id).map(link => link.categoryId),
    }));

    return { products: cards, collections };
  }

  // 3. If filtering by category (collection slug)
  if (categorySlug) {
    const selectedGroup = groups.find(g => g.slug === categorySlug);
    if (selectedGroup) {
      const categoryProductIds = links.filter(link => link.categoryId === selectedGroup.id).map(link => link.productId);
      if (categoryProductIds.length > 0) {
        const matchingCards = await db.select().from(products).where(inArray(products.id, categoryProductIds)).limit(limit);
        const cards: Card[] = matchingCards.map(card => ({
          ...card,
          priceMode: card.priceMode === "auto" ? ("auto" as const) : ("manual" as const),
          createdAt: card.createdAt.toISOString(),
          priceUpdatedAt: card.priceUpdatedAt ? card.priceUpdatedAt.toISOString() : null,
          categoryIds: links.filter(link => link.productId === card.id).map(link => link.categoryId),
        }));
        return { products: cards, collections };
      }
    }
  }

  // 4. Default browsing (Home, /cards without query):
  // Return in-stock cards first, followed by featured cards, followed by recent additions
  const res = await db.execute(sql`
    SELECT 
      id, scryfall_id as "scryfallId", name, set_name as "setName", set_code as "setCode", 
      collector_number as "collectorNumber", image_url as "imageUrl", art_url as "artUrl",
      rarity, colors, type_line as "typeLine", mana_cost as "manaCost", oracle_text as "oracleText",
      condition, finish, price, price_mode as "priceMode", usd_price as "usdPrice",
      price_updated_at as "priceUpdatedAt", quantity, featured, created_at as "createdAt"
    FROM products
    ORDER BY 
      (quantity > 0) DESC,
      (featured) DESC,
      created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const cards: Card[] = ((res.rows || []) as any[]).map(card => ({
    ...card,
    priceMode: card.priceMode === "auto" ? ("auto" as const) : ("manual" as const),
    createdAt: card.createdAt instanceof Date ? card.createdAt.toISOString() : String(card.createdAt),
    priceUpdatedAt: card.priceUpdatedAt ? (card.priceUpdatedAt instanceof Date ? card.priceUpdatedAt.toISOString() : String(card.priceUpdatedAt)) : null,
    categoryIds: links.filter(link => link.productId === card.id).map(link => link.categoryId),
  }));

  return { products: cards, collections };
}

/** Fetch exact printings for carts and account lists, regardless of catalogue pagination. */
export async function getProductsByIds(ids: string[]): Promise<Card[]> {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return [];
  const [cards, links] = await Promise.all([
    db.select().from(products).where(inArray(products.id, uniqueIds)),
    db.select().from(productCategories).where(inArray(productCategories.productId, uniqueIds)),
  ]);
  const categoriesByProduct = new Map<string, string[]>();
  for (const link of links) categoriesByProduct.set(link.productId, [...(categoriesByProduct.get(link.productId) || []), link.categoryId]);
  const byId = new Map(cards.map(card => [card.id, {
    ...card,
    priceMode: card.priceMode === "auto" ? "auto" as const : "manual" as const,
    createdAt: card.createdAt.toISOString(),
    priceUpdatedAt: card.priceUpdatedAt?.toISOString() ?? null,
    categoryIds: categoriesByProduct.get(card.id) || [],
  }]));
  return uniqueIds.flatMap(id => { const card = byId.get(id); return card ? [card] : []; });
}

/** All printings of one card (same name, every set), used by the card detail page. */
export async function getCardPrintings(scryfallId: string): Promise<{ card: Card | null; printings: Card[]; collections: Collection[] }> {
  await ensureSeeded();
  const [found] = await db.select().from(products).where(eq(products.scryfallId, scryfallId)).limit(1);
  if (!found) return { card: null, printings: [], collections: [] };

  const [groups, links, printings] = await Promise.all([
    db.select().from(categories).orderBy(categories.createdAt),
    db.select().from(productCategories),
    // Printings of the same card share the exact name; front-face matching keeps double-sided cards together.
    db.select().from(products).where(sql`${products.name} = ${found.name}`).orderBy(asc(products.setCode), asc(products.collectorNumber)),
  ]);

  const collections = groups.map(group => ({
    id: group.id, name: group.name, slug: group.slug, description: group.description, color: group.color,
    count: links.filter(link => link.categoryId === group.id).length,
  }));
  const mapCard = (card: typeof found): Card => ({
    ...card,
    priceMode: card.priceMode === "auto" ? "auto" as const : "manual" as const,
    createdAt: card.createdAt.toISOString(),
    priceUpdatedAt: card.priceUpdatedAt?.toISOString() ?? null,
    categoryIds: links.filter(link => link.productId === card.id).map(link => link.categoryId),
  });
  return { card: mapCard(found), printings: printings.map(mapCard), collections };
}

export async function getOrders(filter?: { email?: string; orderNumber?: string; customerId?: string }): Promise<StoreOrder[]> {
  const list = filter?.customerId
    ? await db.select().from(orders).where(eq(orders.customerId, filter.customerId)).orderBy(desc(orders.createdAt)).limit(100)
    : filter?.email && filter.orderNumber
    ? await db.select().from(orders).where(sql`lower(${orders.email}) = ${filter.email.toLowerCase()} and ${orders.orderNumber} = ${filter.orderNumber.toUpperCase()}`).limit(1)
    : await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(200);
  if (!list.length) return [];
  const lines = await db.select().from(orderItems).where(inArray(orderItems.orderId, list.map(order => order.id)));
  return list.map(order => ({
    ...order,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    refundedAt: order.refundedAt ? order.refundedAt.toISOString() : null,
    items: lines.filter(line => line.orderId === order.id),
  }));
}

export async function getImportHistory(): Promise<ImportLog[]> {
  const logs = await db.select({ id: imports.id, filename: imports.filename, status: imports.status, imported: imports.imported, skipped: imports.skipped, createdAt: imports.createdAt }).from(imports).where(eq(imports.status, "completed")).orderBy(desc(imports.createdAt)).limit(20);
  return logs.map(log => ({ ...log, createdAt: log.createdAt.toISOString() }));
}

export type InventoryStats = {
  totalCards: number;
  inStockVariants: number;
  totalStock: number;
  inventoryValue: number;
  lowStock: number;
};

export async function getInventoryStats(): Promise<InventoryStats> {
  const res = await db.execute(sql`
    SELECT
      count(*)::int as "totalCards",
      count(*) FILTER (WHERE quantity > 0)::int as "inStockVariants",
      coalesce(sum(quantity) FILTER (WHERE quantity > 0), 0)::int as "totalStock",
      coalesce(sum(quantity * price) FILTER (WHERE quantity > 0), 0)::int as "inventoryValue",
      count(*) FILTER (WHERE quantity > 0 AND quantity <= 3)::int as "lowStock"
    FROM products;
  `);
  const row = (res.rows?.[0] as any) || {};
  return {
    totalCards: Number(row.totalCards || 0),
    inStockVariants: Number(row.inStockVariants || 0),
    totalStock: Number(row.totalStock || 0),
    inventoryValue: Number(row.inventoryValue || 0),
    lowStock: Number(row.lowStock || 0),
  };
}
