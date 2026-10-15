import { db } from "@/db";
import { products } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { apiError } from "@/lib/admin-auth";
import { getCustomer } from "@/lib/customer-auth";
import { scryfallRequest, type ScryfallCard } from "@/lib/scryfall";
import { parseDecklist, normaliseName, frontFace, MAX_UNIQUE_CARDS } from "@/lib/decklist";
import { readBody } from "@/lib/validation";
import { limitPublicRequests } from "@/lib/rate-limit";
import type { Card } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type InventoryPrint = Pick<Card, "id" | "scryfallId" | "name" | "setName" | "setCode" | "imageUrl" | "condition" | "finish" | "price" | "quantity">;
export type DeckVariant = { id: string; condition: string; finish: string; price: number; quantity: number };
export type DeckRow = {
  line: number; requested: string; quantity: number; section: string;
  status: "instock" | "partial" | "outofstock" | "notstocked" | "invalid";
  scryfallId: string | null; canonicalName: string | null; setName: string | null; imageUrl: string | null;
  variants: DeckVariant[]; available: number; unitPrice: number; error?: string;
};

function variantSort(a: DeckVariant, b: DeckVariant) {
  if (a.quantity > 0 !== b.quantity > 0) return a.quantity > 0 ? -1 : 1;
  if (a.price !== b.price) return a.price - b.price;
  return a.condition.localeCompare(b.condition);
}

export async function POST(request: Request) {
  const limited = limitPublicRequests(request, "decklist", 12); if (limited) return limited;
  try {
    const body = await readBody(request);
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) throw new Error("Paste a decklist to search.");
    if (text.length > 60000) throw new Error("That list is too long. Please paste up to 60,000 characters.");
    const { cards, warnings } = parseDecklist(text);

    const catalogue = await db.select().from(products);
    const exact = new Map<string, InventoryPrint[]>();
    const faces = new Map<string, InventoryPrint[]>();
    for (const card of catalogue) {
      const key = normaliseName(card.name);
      exact.set(key, [...(exact.get(key) || []), card]);
      const face = normaliseName(frontFace(card.name));
      if (face !== key) faces.set(face, [...(faces.get(face) || []), card]);
    }

    function localMatches(name: string, setCode?: string) {
      const key = normaliseName(name);
      const found = exact.get(key) || faces.get(key) || [];
      if (setCode) {
        const preferred = found.filter(card => card.setCode === setCode);
        if (preferred.length) return preferred;
      }
      return found;
    }

    function toRow(entry: (typeof cards)[number], variants: DeckVariant[], meta: { scryfallId: string | null; canonicalName: string | null; setName: string | null; imageUrl: string | null }, error?: string): DeckRow {
      const inStock = variants.filter(variant => variant.quantity > 0);
      const available = inStock.reduce((sum, variant) => sum + variant.quantity, 0);
      const status: DeckRow["status"] = error ? "invalid" : available === 0 ? (variants.length ? "outofstock" : "notstocked") : available >= entry.quantity ? "instock" : "partial";
      return {
        line: entry.line, requested: entry.name, quantity: entry.quantity, section: entry.section,
        status, ...meta, variants: [...variants].sort(variantSort),
        available, unitPrice: inStock.length ? Math.min(...inStock.map(variant => variant.price)) : 0, error,
      };
    }

    const rows: DeckRow[] = [];
    const unresolved: { entry: (typeof cards)[number]; index: number }[] = [];
    const seenNames = new Set<string>();

    for (const entry of cards) {
      if (entry.error) { rows.push(toRow(entry, [], { scryfallId: null, canonicalName: entry.name, setName: null, imageUrl: null }, entry.error)); continue; }
      const found = localMatches(entry.name, entry.setCode);
      if (found.length) {
        const variants: DeckVariant[] = found.map(card => ({ id: card.id, condition: card.condition, finish: card.finish, price: card.price, quantity: card.quantity }));
        rows.push(toRow(entry, variants, { scryfallId: found[0].scryfallId, canonicalName: found[0].name, setName: found[0].setName, imageUrl: found[0].imageUrl }));
      } else {
        const key = normaliseName(entry.name);
        if (!seenNames.has(key)) { seenNames.add(key); unresolved.push({ entry, index: rows.length }); }
        rows.push(toRow(entry, [], { scryfallId: null, canonicalName: entry.name, setName: null, imageUrl: null }));
      }
    }

    const uniqueNames = [...seenNames];
    if (uniqueNames.length > MAX_UNIQUE_CARDS) throw new Error(`Too many different cards to look up (${uniqueNames.length}).`);
    const scryfall = new Map<string, ScryfallCard>();
    for (let start = 0; start < uniqueNames.length; start += 75) {
      const batch = uniqueNames.slice(start, start + 75);
      try {
        const response = await scryfallRequest("/cards/collection", { identifiers: batch.map(name => ({ name })) }) as { data?: ScryfallCard[]; not_found?: unknown[] };
        for (const card of response.data || []) scryfall.set(normaliseName(card.name), card);
      } catch { /* Scryfall lookups are best-effort; unmatched names still return as not stocked. */ }
    }

    if (scryfall.size) {
      const wanted = [...scryfall.values()].map(card => card.id);
      const prints = wanted.length ? await db.select().from(products).where(inArray(products.scryfallId, wanted)) : [];
      const byScryfall = new Map<string, InventoryPrint[]>();
      for (const card of prints) byScryfall.set(card.scryfallId, [...(byScryfall.get(card.scryfallId) || []), card]);
      const faceIndex = new Map<string, InventoryPrint[]>();
      for (const card of prints) { const face = normaliseName(frontFace(card.name)); faceIndex.set(face, [...(faceIndex.get(face) || []), card]); }

      for (const { entry, index } of unresolved) {
        const card = scryfall.get(normaliseName(entry.name));
        if (!card) continue;
        let found = byScryfall.get(card.id) || [];
        if (!found.length) found = faceIndex.get(normaliseName(card.name)) || [];
        if (!found.length && entry.setCode) found = prints.filter(print => normaliseName(frontFace(print.name)) === normaliseName(card.name));
        const variants: DeckVariant[] = found.map(print => ({ id: print.id, condition: print.condition, finish: print.finish, price: print.price, quantity: print.quantity }));
        const images = card.image_uris || card.card_faces?.[0]?.image_uris;
        rows[index] = toRow(entry, variants, { scryfallId: card.id, canonicalName: card.name, setName: card.set_name, imageUrl: images?.normal || null });
      }
    }

    const shoppable = rows.filter(row => row.status === "instock" || row.status === "partial");
    const total = shoppable.reduce((sum, row) => sum + Math.min(row.quantity, row.available) * row.unitPrice, 0);
    const customer = await getCustomer();
    return Response.json({
      rows, warnings,
      summary: {
        lines: rows.length,
        matched: rows.filter(row => row.status !== "invalid" && row.status !== "notstocked").length,
        shoppable: shoppable.length,
        missing: rows.filter(row => row.status === "notstocked" || row.status === "outofstock").length,
        invalid: rows.filter(row => row.status === "invalid").length,
        totalCards: rows.reduce((sum, row) => sum + (row.status === "invalid" ? 0 : row.quantity), 0),
        availableCards: shoppable.reduce((sum, row) => sum + Math.min(row.quantity, row.available), 0),
        total,
      },
      customer,
    });
  } catch (error) { return apiError(error); }
}
