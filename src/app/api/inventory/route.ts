import { dispatchRestockEvents } from "@/lib/restock";
import { db } from "@/db";
import {
  products,
  imports,
  inventoryLots,
  inventoryReceipts,
} from "@/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  requireOwner,
  apiError,
  ownerProtectionEnabled,
} from "@/lib/admin-auth";
import { readBody, isUUID, validateVariant } from "@/lib/validation";
import { receiveLine, type ReceiveLine } from "@/lib/inventory-input";
import { receiveStock } from "@/lib/inventory";
export const dynamic = "force-dynamic";
async function authorize(request: Request) {
  if (!ownerProtectionEnabled())
    throw new Error(
      "Please sign in: configure ADMIN_PASSWORD before changing inventory.",
    );
  await requireOwner(request);
}
type PreviewLine = ReceiveLine & {
  row: number;
  name: string;
  condition: string;
  finish: string;
  existing: boolean;
  error?: string;
};
export async function GET(request: Request) {
  try {
    await authorize(request);
    const url = new URL(request.url),
      id = url.searchParams.get("productId");
    if (id) {
      if (!isUUID(id)) throw new Error("Invalid product.");
      const lots = await db
        .select()
        .from(inventoryLots)
        .where(eq(inventoryLots.productId, id))
        .orderBy(asc(inventoryLots.acquiredAt));
      return Response.json({ lots });
    }
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const page = Math.min(
      10000,
      Math.max(0, Number(url.searchParams.get("page")) || 0),
    );
    const pageSize = url.searchParams.get("limit") === "10" ? 10 : 30;
    const cards =
      await db.execute(sql`SELECT id, scryfall_id AS "scryfallId",name,set_code AS "setCode",collector_number AS "collectorNumber",condition,finish,quantity,price
   FROM products WHERE (${q}='' OR name ILIKE ${"%" + q + "%"} OR set_code=${q.toLowerCase()} OR collector_number=${q} OR scryfall_id=${q} OR set_name ILIKE ${"%" + q + "%"})
   ORDER BY name,set_code,collector_number,condition,finish,id LIMIT ${pageSize} OFFSET ${Math.floor(page) * pageSize}`);
    const totals =
      await db.execute(sql`SELECT COALESCE(sum(remaining_quantity),0)::bigint AS units,
   COALESCE(sum(remaining_quantity*unit_cost::bigint),0)::bigint AS "knownValue", COALESCE(sum(remaining_quantity) FILTER (WHERE unit_cost IS NULL),0)::bigint AS "unknownUnits" FROM inventory_lots`);
    return Response.json({
      cards: cards.rows,
      totals: totals.rows[0],
      page,
      hasMore: cards.rows.length === pageSize,
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    await authorize(request);
    const body = await readBody(request);
    if (body.action === "preview") {
      if (
        !Array.isArray(body.rows) ||
        !body.rows.length ||
        body.rows.length > 1000
      )
        throw new Error("Receive between 1 and 1,000 rows.");
      const rows: Record<string, unknown>[] = [];
      for (let index = 0; index < body.rows.length; index++) {
        const raw = body.rows[index] as Record<string, unknown>;
        try {
          if (!raw || typeof raw !== "object") throw new Error("Invalid row.");
          if (raw._csv_error) throw new Error(String(raw._csv_error));
          const conditions: Record<string, string> = {
            nm: "Near mint",
            lp: "Lightly played",
            mp: "Moderately played",
            hp: "Heavily played",
            dmg: "Damaged",
            "near mint": "Near mint",
            "lightly played": "Lightly played",
            "moderately played": "Moderately played",
            "heavily played": "Heavily played",
            damaged: "Damaged",
          };
          const finishes: Record<string, string> = {
            nonfoil: "Non-foil",
            "non-foil": "Non-foil",
            foil: "Foil",
            etched: "Etched",
          };
          const condition =
              conditions[String(raw.condition || "nm").toLowerCase()] ||
              String(raw.condition),
            finish =
              finishes[String(raw.finish || "nonfoil").toLowerCase()] ||
              String(raw.finish);
          validateVariant(condition, finish);
          const criteria = [];
          if (raw.productId) {
            if (!isUUID(raw.productId)) throw new Error("Invalid product ID.");
            criteria.push(eq(products.id, raw.productId));
          } else if (raw.scryfall_id) {
            if (!isUUID(raw.scryfall_id))
              throw new Error("Invalid Scryfall ID.");
            criteria.push(eq(products.scryfallId, raw.scryfall_id));
          } else {
            if (raw.name)
              criteria.push(
                sql`lower(${products.name})=lower(${String(raw.name)})`,
              );
            if (raw.set)
              criteria.push(
                sql`lower(${products.setCode})=lower(${String(raw.set)})`,
              );
            if (raw.collector_number)
              criteria.push(
                eq(products.collectorNumber, String(raw.collector_number)),
              );
            if (!raw.name && !(raw.set && raw.collector_number))
              throw new Error(
                "Supply a printing ID, name, or set + collector number.",
              );
          }
          const found = await db
            .select()
            .from(products)
            .where(and(...criteria))
            .limit(100);
          if (!found.length)
            throw new Error("Printing not found in catalogue.");
          if (new Set(found.map((c) => c.scryfallId)).size !== 1)
            throw new Error(
              "Ambiguous printing: specify Scryfall ID or set + collector number.",
            );
          const card =
            found.find(
              (c) => c.condition === condition && c.finish === finish,
            ) || found[0];
          const [variant] = await db
            .select({ id: products.id })
            .from(products)
            .where(
              and(
                eq(products.scryfallId, card.scryfallId),
                eq(products.condition, condition),
                eq(products.finish, finish),
              ),
            )
            .limit(1);
          const line = receiveLine({
            ...raw,
            productId: variant?.id || card.id,
          });
          rows.push({
            ...line,
            condition,
            finish,
            row: index + 2,
            name: card.name,
            existing: Boolean(variant),
          });
        } catch (error) {
          rows.push({
            row: index + 2,
            error: error instanceof Error ? error.message : "Invalid row",
            name: raw?.name || "",
          });
        }
      }
      const valid = rows.filter((r) => !r.error) as PreviewLine[];
      const trade = body.trade as
        { customerId?: string; amount?: number } | undefined;
      if (
        trade &&
        (!isUUID(trade.customerId) ||
          !Number.isInteger(trade.amount) ||
          Number(trade.amount) < 0 ||
          Number(trade.amount) > 100000000 ||
          !valid.every((l) => l.acquisitionType === "Trade-in"))
      )
        throw new Error(
          "Choose a customer and valid credit amount for a trade-in receipt.",
        );
      const [job] = await db
        .insert(imports)
        .values({
          filename: String(body.filename || "Stock receipt").slice(0, 200),
          payload: [{ receiptVersion: 1, trade }, ...rows],
        })
        .returning();
      const keys = valid.map(
        (l) => `${l.productId}:${l.condition}:${l.finish}`,
      );
      return Response.json({
        importId: job.id,
        rows,
        summary: {
          lines: valid.length,
          units: valid.reduce((s, l) => s + l.quantity, 0),
          knownCost: valid.reduce(
            (s, l) => s + (l.unitCost || 0) * l.quantity,
            0,
          ),
          unknownLines: valid.filter((l) => l.unitCost === null).length,
          duplicates: keys.length - new Set(keys).size,
          invalid: rows.length - valid.length,
          existing: valid.filter((l) => l.existing).length,
        },
      });
    }
    if (body.action === "commit") {
      if (!isUUID(body.importId)) throw new Error("Preview the receipt first.");
      const receipt = await db.transaction(async (tx) => {
        const [job] = await tx
          .select()
          .from(imports)
          .where(eq(imports.id, String(body.importId)))
          .for("update");
        if (!job) throw new Error("Receipt preview not found.");
        if (job.status === "completed") {
          const [saved] = await tx
            .select()
            .from(inventoryReceipts)
            .where(eq(inventoryReceipts.idempotencyKey, job.id));
          return saved;
        }
        if (
          job.status !== "preview" ||
          !(
            job.payload[0] &&
            typeof job.payload[0] === "object" &&
            "receiptVersion" in job.payload[0]
          )
        )
          throw new Error("Invalid receipt preview.");
        const [meta, ...raw] = job.payload as [
          { trade?: { customerId: string; amount: number } },
          ...PreviewLine[],
        ];
        const lines = raw.filter((l) => !l.error);
        if (!lines.length) throw new Error("There are no valid rows.");
        for (const line of [...lines].sort((a, b) =>
          `${a.productId}:${a.condition}:${a.finish}`.localeCompare(
            `${b.productId}:${b.condition}:${b.finish}`,
          ),
        )) {
          const [base] = await tx
            .select()
            .from(products)
            .where(eq(products.id, line.productId));
          if (!base) throw new Error("A printing was removed.");
          if (
            base.condition !== line.condition ||
            base.finish !== line.finish
          ) {
            const {
              id: _id,
              createdAt: _created,
              totalCost: _cost,
              ...metadata
            } = base;
            await tx
              .insert(products)
              .values({
                ...metadata,
                quantity: 0,
                condition: line.condition,
                finish: line.finish,
              })
              .onConflictDoNothing();
            const [variant] = await tx
              .select()
              .from(products)
              .where(
                and(
                  eq(products.scryfallId, base.scryfallId),
                  eq(products.condition, line.condition),
                  eq(products.finish, line.finish),
                ),
              );
            line.productId = variant.id;
          }
        }
        const saved = await receiveStock(tx, lines, job.id, meta.trade);
        await tx
          .update(imports)
          .set({
            status: "completed",
            imported: lines.length,
            skipped: raw.length - lines.length,
          })
          .where(eq(imports.id, job.id));
        return saved;
      });
      await dispatchRestockEvents();
      return Response.json({ receipt });
    }
    throw new Error("Choose preview or commit.");
  } catch (error) {
    return apiError(error);
  }
}
