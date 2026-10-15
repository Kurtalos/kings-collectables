import { db } from "@/db";
import { decks, deckItems } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { apiError } from "@/lib/admin-auth";
import { getCustomer, requireCustomer, sameOrigin } from "@/lib/customer-auth";
import { parseDecklist, normaliseName } from "@/lib/decklist";
import { readBody, isUUID, textField } from "@/lib/validation";
import { limitPublicRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const MAX_DECKS = 25;

export async function GET() {
  try {
    const customer = await getCustomer();
    if (!customer) return Response.json({ customer: null, decks: [] });
    const saved = await db.select().from(decks).where(eq(decks.customerId, customer.id)).orderBy(desc(decks.updatedAt)).limit(MAX_DECKS);
    const items = saved.length ? await db.select().from(deckItems).where(inArray(deckItems.deckId, saved.map(deck => deck.id))) : [];
    return Response.json({
      customer,
      decks: saved.map(deck => ({
        id: deck.id, name: deck.name, format: deck.format.trim(), updatedAt: deck.updatedAt.toISOString(),
        cards: items.filter(item => item.deckId === deck.id).map(item => ({ name: item.cardName, quantity: item.quantity, section: item.section })),
        total: items.filter(item => item.deckId === deck.id).reduce((sum, item) => sum + item.quantity, 0),
      })),
    });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await readBody(request);
    const action = String(body.action || "");

    if (action === "delete") {
      const customer = await requireCustomer();
      if (!isUUID(body.id)) throw new Error("Invalid deck ID.");
      const [deck] = await db.select().from(decks).where(eq(decks.id, String(body.id))).limit(1);
      if (!deck || deck.customerId !== customer.id) throw new Error("Deck not found.");
      await db.delete(decks).where(eq(decks.id, deck.id));
      return Response.json({ ok: true });
    }

    if (action === "load") {
      const customer = await requireCustomer();
      if (!isUUID(body.id)) throw new Error("Invalid deck ID.");
      const [deck] = await db.select().from(decks).where(eq(decks.id, String(body.id))).limit(1);
      if (!deck || deck.customerId !== customer.id) throw new Error("Deck not found.");
      const items = await db.select().from(deckItems).where(eq(deckItems.deckId, deck.id));
      const text = ["Maindeck", "Sideboard", "Commander", "Maybeboard"].map(section => {
        const lines = items.filter(item => item.section === section).sort((a, b) => a.cardName.localeCompare(b.cardName));
        return lines.length ? [section === "Maindeck" ? "Deck" : section, ...lines.map(item => `${item.quantity} ${item.cardName}`)].join("\n") : "";
      }).filter(Boolean).join("\n\n");
      return Response.json({ deck: { id: deck.id, name: deck.name, format: deck.format.trim(), text, updatedAt: deck.updatedAt.toISOString() } });
    }

    if (action === "save") {
      const customer = await requireCustomer();
      const limited = limitPublicRequests(request, "deck-save", 20); if (limited) return limited;
      const name = textField(body.name, "Deck name", 90);
      const text = typeof body.text === "string" ? body.text : "";
      if (!text.trim()) throw new Error("Paste a decklist before saving.");
      const { cards } = parseDecklist(text);
      const playable = cards.filter(card => !card.error);
      if (!playable.length) throw new Error("Fix the highlighted lines before saving this deck.");

      const existing = await db.select({ id: decks.id }).from(decks).where(eq(decks.customerId, customer.id));
      const [sameName] = await db.select().from(decks).where(and(eq(decks.customerId, customer.id), eq(decks.name, name))).limit(1);
      const target = body.id && isUUID(body.id) ? (await db.select().from(decks).where(eq(decks.id, String(body.id))).limit(1))[0] : sameName;
      if (target && target.customerId !== customer.id) throw new Error("Deck not found.");
      if (!target && existing.length >= MAX_DECKS) throw new Error(`You can save up to ${MAX_DECKS} decks. Remove one first.`);

      const deckId = await db.transaction(async tx => {
        let id = target?.id;
        if (id) await tx.update(decks).set({ name, updatedAt: new Date() }).where(eq(decks.id, id));
        else id = (await tx.insert(decks).values({ customerId: customer.id, name }).returning({ id: decks.id }))[0].id;
        await tx.delete(deckItems).where(eq(deckItems.deckId, id));
        const rows = [...new Map(playable.map(card => [`${normaliseName(card.name)}|${card.section}`, card])).values()];
        for (let start = 0; start < rows.length; start += 200) {
          await tx.insert(deckItems).values(rows.slice(start, start + 200).map(card => ({
            deckId: id!, cardName: card.name, quantity: card.quantity, section: card.section,
            setCode: card.setCode || null, collectorNumber: card.collectorNumber || null,
          }))).onConflictDoNothing();
        }
        return id;
      });
      return Response.json({ ok: true, deckId, saved: playable.length }, { status: 201 });
    }

    throw new Error("Unknown deck action.");
  } catch (error) { return apiError(error); }
}
