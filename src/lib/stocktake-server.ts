import { createHash } from "node:crypto";
import { and,asc,eq,gt,inArray,sql } from "drizzle-orm";
import { db } from "@/db";
import { products,inventoryLots,storeMeta } from "@/db/schema";
import { receiveStock } from "./inventory";
import type { StocktakeBatch,StocktakeInput,StocktakeConflict } from "./stocktake";
export const STOCKTAKE_PREFIX="inventory.stocktake.";
export class StocktakeError extends Error{constructor(message:string,public kind:"conflict"|"ledger"|"idempotency",public conflicts:StocktakeConflict[]=[]){super(message);}}
export async function applyStocktake(input:StocktakeInput){
 const key=STOCKTAKE_PREFIX+input.requestId,fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
 return db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  const [saved]=await tx.select().from(storeMeta).where(eq(storeMeta.key,key));
  if(saved){const record=JSON.parse(saved.value) as StocktakeBatch;if(record.fingerprint!==fingerprint)throw new StocktakeError("This request ID was already used with different counts. Review its saved audit record.","idempotency");return {record,replayed:true};}
  const ids=input.lines.map(l=>l.productId).sort(),cards=await tx.select().from(products).where(inArray(products.id,ids)).orderBy(asc(products.id)).for("update"),byId=new Map(cards.map(c=>[c.id,c]));
  const conflicts=input.lines.flatMap(l=>{const c=byId.get(l.productId);return !c||c.quantity!==l.expected ? [{productId:l.productId,name:c?.name||"Deleted printing",expected:l.expected,current:c?.quantity??null}]:[];});
  if(conflicts.length)throw new StocktakeError("Stock changed while you were counting. Nothing was applied. Discard the affected counts and recount them.","conflict",conflicts);
  const balances=await tx.execute(sql`SELECT product_id AS id,sum(remaining_quantity)::bigint AS quantity FROM inventory_lots WHERE product_id IN (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`,`)}) GROUP BY product_id`);
  const balance=new Map(balances.rows.map(r=>[r.id,Number(r.quantity)]));
  for(const c of cards)if((balance.get(c.id)||0)!==c.quantity)throw new StocktakeError(`The FIFO ledger does not match stock for ${c.name}. No counts were applied. Inspect inventory history/audit before continuing.`,"ledger");
  const record:StocktakeBatch={id:input.requestId,createdAt:new Date().toISOString(),reason:input.reason,fingerprint,receiptId:null,lines:[]};let touchedLots=0;
  for(const line of input.lines){
   const c=byId.get(line.productId)!,delta=line.counted-line.expected,removedLots:StocktakeBatch["lines"][number]["removedLots"]=[];
   if(delta<0){
    const available=await tx.select().from(inventoryLots).where(and(eq(inventoryLots.productId,c.id),gt(inventoryLots.remainingQuantity,0))).orderBy(asc(inventoryLots.acquiredAt),asc(inventoryLots.createdAt),asc(inventoryLots.id)).limit(10001).for("update");
    let needed=-delta;for(const lot of available){if(!needed)break;if(++touchedLots>10000)throw new StocktakeError("This batch touches too many FIFO lots. Split it into smaller batches; nothing was applied.","ledger");const quantity=Math.min(needed,lot.remainingQuantity);needed-=quantity;removedLots.push({lotId:lot.id,quantity,unitCost:lot.unitCost});await tx.update(inventoryLots).set({remainingQuantity:lot.remainingQuantity-quantity}).where(eq(inventoryLots.id,lot.id));}
    if(needed)throw new StocktakeError("Unable to reconcile FIFO lots. Split/check the batch; nothing was applied.","ledger");
    await tx.update(products).set({quantity:line.counted}).where(eq(products.id,c.id));
   }
   record.lines.push({...line,name:c.name,variant:`${c.setCode.toUpperCase()} #${c.collectorNumber} · ${c.condition} · ${c.finish}`,delta,removedLots});
  }
  const additions=record.lines.filter(l=>l.delta>0);
  if(additions.length){const receipt=await receiveStock(tx,additions.map(l=>({productId:l.productId,quantity:l.delta,unitCost:null,acquisitionType:"Other",reference:`Stocktake ${record.id}`,note:`Count correction: ${input.reason}. Cost unknown; not a purchase or trade.`})),`stocktake-${record.id}`);record.receiptId=receipt.id;}
  const value=JSON.stringify(record);if(value.length>1500000)throw new StocktakeError("This audit is too large. Split the batch; nothing was applied.","ledger");
  await tx.insert(storeMeta).values({key,value});return {record,replayed:false};
 });
}
