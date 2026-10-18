import { db } from "@/db";
import { imports, products, categories, productCategories } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { getCatalog } from "@/lib/catalog";
import { readBody, isUUID, validateStock, validatePrice } from "@/lib/validation";
import { identifier, matchesCard, cardMetadata, scryfallRequest, type ScryfallCard } from "@/lib/scryfall";
import { CONDITIONS, FINISHES, slugify, type ImportInput, type ImportRow } from "@/lib/types";
import { checkAndNotifyRestock } from "@/lib/restock";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const conditionAliases: Record<string, string> = { nm: "Near mint", lp: "Lightly played", mp: "Moderately played", hp: "Heavily played", dmg: "Damaged" };
export async function POST(request: Request) {
  try {
    await requireOwner(request);
    const body = await readBody(request);
    if (body.action === "preview") {
      if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 1000) throw new Error("Upload between 1 and 1,000 card rows.");
      const catalog = await getCatalog();
      const defaultCategory = catalog.collections.find(group => group.id === body.defaultCategory)?.name || "";
      const inputs: ImportInput[] = body.rows.map(raw => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid import row.");
        const normalized: Record<string, string> = {};
        for (const key of ["name", "set", "collector_number", "scryfall_id", "quantity", "price", "condition", "finish", "category"]) {
          const value = raw[key];
          if (value !== undefined && typeof value !== "string") throw new Error("CSV values must be text.");
          if (typeof value === "string" && value.length > 500) throw new Error("A CSV value is too long (maximum 500 characters).");
          normalized[key] = typeof value === "string" ? value.trim() : "";
        }
        return normalized;
      });
      const rows: ImportRow[] = inputs.map((input, index) => {
        const local = catalog.products.find(card => matchesCard(input, card));
        const condition = conditionAliases[input.condition?.toLowerCase() || ""] || CONDITIONS.find(c => c.toLowerCase() === input.condition?.toLowerCase()) || (input.condition ? input.condition : "Near mint");
        const finish = FINISHES.find(f => f.toLowerCase() === input.finish?.toLowerCase()) || (!input.finish || input.finish.toLowerCase() === "nonfoil" ? "Non-foil" : input.finish);
        const row: ImportRow = { row: index + 2, name: input.name || local?.name || "Unknown card", set: input.set || local?.setCode || "", quantity: 0, price: 0, condition, finish, category: input.category || defaultCategory };
        try {
          if (!input.name && !input.scryfall_id && !(input.set && input.collector_number)) throw new Error("Add a name, Scryfall ID, or set and collector number.");
          if (input.scryfall_id && !isUUID(input.scryfall_id)) throw new Error("Invalid Scryfall ID.");
          if (input.set && !/^[a-z0-9]{2,8}$/i.test(input.set)) throw new Error("Invalid set code.");
          const rawQuantity = input.quantity || "1";
          if (!/^\d+$/.test(rawQuantity)) throw new Error("Quantity must be a whole, non-negative number.");
          row.quantity = validateStock(Number(rawQuantity));
          const existing = catalog.products.find(card => local && card.scryfallId === local.scryfallId && card.condition === condition && card.finish === finish);
          const rawPrice = input.price?.replace(/AUD|\$|,|\s/gi, "") || (existing ? String(existing.price / 100) : "");
          if (!/^\d+(\.\d{1,2})?$/.test(rawPrice)) throw new Error("Add a valid AUD selling price (up to two decimal places).");
          row.price = validatePrice(Math.round(Number(rawPrice) * 100));
          if (!CONDITIONS.includes(condition)) throw new Error("Invalid condition. Use NM, LP, MP, HP, or Damaged.");
          if (!FINISHES.includes(finish)) throw new Error("Invalid finish. Use Non-foil, Foil, or Etched.");
          if (row.category.split("|").some(name => name.trim().length > 80 || (name.trim() && !slugify(name)))) throw new Error("Collection names need letters or numbers and must be under 80 characters.");
          if (local) {
            const { id: _id, createdAt: _date, categoryIds: _groups, price: _price, quantity: _quantity, condition: _condition, finish: _finish, ...metadata } = local;
            row.card = metadata; row.name = local.name; row.set = local.setCode; row.existing = Boolean(existing);
          }
        } catch (error) { row.error = error instanceof Error ? error.message : "Invalid row."; }
        return row;
      });
      const unresolved = inputs.filter((_, index) => !rows[index].error && !rows[index].card);
      const unique = [...new Map(unresolved.map(input => { const id = identifier(input); return [JSON.stringify(id), id] as const; })).values()];
      const resolved: ScryfallCard[] = [];
      for (let start = 0; start < unique.length; start += 75) {
        const response = await scryfallRequest("/cards/collection", { identifiers: unique.slice(start, start + 75) }) as { data: ScryfallCard[] };
        resolved.push(...response.data);
      }
      rows.forEach((row, index) => {
        if (row.error || row.card) return;
        const found = resolved.find(card => matchesCard(inputs[index], { scryfallId: card.id, name: card.name, setCode: card.set, collectorNumber: card.collector_number }));
        if (!found) { row.error = "Card or printing not found. Check the card name and set code."; return; }
        try { row.card = cardMetadata(found); row.name = found.name; row.set = found.set; row.existing = catalog.products.some(card => card.scryfallId === found.id && card.condition === row.condition && card.finish === row.finish); } catch (error) { row.error = error instanceof Error ? error.message : "Unable to read card data."; }
      });
      const duplicateGroups = new Map<string, ImportRow[]>();
      for (const row of rows) if (row.card && !row.error) { const key = `${row.card.scryfallId}:${row.condition}:${row.finish}`; duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), row]); }
      for (const group of duplicateGroups.values()) {
        if (new Set(group.map(row => row.price)).size > 1) group.forEach(row => row.error = "This variant has conflicting prices in the file. Use one selling price.");
        if (group.reduce((sum, row) => sum + row.quantity, 0) > 100000) group.forEach(row => row.error = "Combined quantity exceeds 100,000 for this variant.");
      }
      const filename = typeof body.filename === "string" ? body.filename.slice(0, 200) : "inventory.csv";
      const [preview] = await db.insert(imports).values({ filename, payload: rows, skipped: rows.filter(row => row.error).length }).returning({ id: imports.id });
      return Response.json({ importId: preview.id, rows });
    }
    if (body.action === "commit") {
      if (!isUUID(body.importId) || !["add", "replace"].includes(String(body.mode))) throw new Error("Review the import before committing it.");
      const result = await db.transaction(async tx => {
        const [job] = await tx.select().from(imports).where(eq(imports.id, String(body.importId))).for("update");
        if (!job || job.status !== "preview") throw new Error("This import was already completed or is no longer available.");
        const rows = job.payload as ImportRow[];
        const valid = rows.filter(row => row.card && !row.error);
        if (!valid.length) throw new Error("No valid cards to import. Fix the highlighted rows and upload again.");
        const grouped = new Map<string, ImportRow>();
        for (const row of valid) {
          const key = `${row.card!.scryfallId}:${row.condition}:${row.finish}`;
          const prior = grouped.get(key);
          if (prior) { prior.quantity += row.quantity; prior.category = [...new Set([...prior.category.split("|"), ...row.category.split("|")])].join("|"); }
          else grouped.set(key, { ...row });
        }
        for (const row of [...grouped.values()].sort((a, b) => a.card!.scryfallId.localeCompare(b.card!.scryfallId))) {
          const [existing] = await tx.select().from(products).where(and(eq(products.scryfallId, row.card!.scryfallId), eq(products.condition, row.condition), eq(products.finish, row.finish))).for("update");
          const oldQuantity = existing?.quantity || 0;
          if (body.mode === "add" && oldQuantity + row.quantity > 100000) throw new Error(`${row.name} would exceed 100,000 copies. Choose replace quantities or reduce the quantity.`);
          const [card] = await tx.insert(products).values({ ...row.card!, quantity: row.quantity, price: row.price, condition: row.condition, finish: row.finish }).onConflictDoUpdate({ target: [products.scryfallId, products.condition, products.finish], set: { price: row.price, quantity: body.mode === "replace" ? row.quantity : sql`${products.quantity} + ${row.quantity}` } }).returning();
          // Notify watchers if this variant came back in stock
          if (oldQuantity === 0 && row.quantity > 0) {
            await checkAndNotifyRestock(card.id, oldQuantity, row.quantity);
          }
          for (const name of [...new Set(row.category.split("|").map(name => name.trim()).filter(Boolean))]) {
            const slug = slugify(name);
            const [created] = await tx.insert(categories).values({ name, slug }).onConflictDoNothing().returning();
            const category = created || (await tx.select().from(categories).where(eq(categories.slug, slug)).limit(1))[0];
            await tx.insert(productCategories).values({ productId: card.id, categoryId: category.id }).onConflictDoNothing();
          }
        }
        await tx.update(imports).set({ status: "completed", imported: valid.length, skipped: rows.length - valid.length }).where(eq(imports.id, job.id));
        return { imported: valid.length, variants: grouped.size, skipped: rows.length - valid.length };
      });
      return Response.json(result);
    }
    throw new Error("Choose preview or commit.");
  } catch (error) { return apiError(error); }
}
