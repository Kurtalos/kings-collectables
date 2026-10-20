import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireOwner,apiError } from "@/lib/admin-auth";
import { readBody,isUUID } from "@/lib/validation";
import { CONDITIONS,FINISHES } from "@/lib/types";
import { validateStocktake,type StocktakeCard } from "@/lib/stocktake";
import { applyStocktake,STOCKTAKE_PREFIX,StocktakeError } from "@/lib/stocktake-server";
import { dispatchRestockEvents } from "@/lib/restock";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request){
 try{
  await requireOwner(request);const p=new URL(request.url).searchParams;
  if(p.has("batchId")){const id=p.get("batchId");if(!isUUID(id))throw new Error("Choose a valid stocktake batch.");const r=await db.execute(sql`SELECT value::jsonb AS record FROM store_meta WHERE key=${STOCKTAKE_PREFIX+id.toLowerCase()}`);return Response.json({record:r.rows[0]?.record||null},{headers});}
  if(p.get("mode")==="history"){const rows=await db.execute(sql`SELECT value::jsonb->>'id' AS id,value::jsonb->>'createdAt' AS "createdAt",value::jsonb->>'reason' AS reason,jsonb_array_length(value::jsonb->'lines') AS rows,(SELECT coalesce(sum(greatest((l->>'delta')::int,0)),0)::int FROM jsonb_array_elements(value::jsonb->'lines') l) AS added,(SELECT coalesce(sum(greatest(-(l->>'delta')::int,0)),0)::int FROM jsonb_array_elements(value::jsonb->'lines') l) AS removed FROM store_meta WHERE key LIKE ${STOCKTAKE_PREFIX+"%"} ORDER BY value::jsonb->>'createdAt' DESC,key DESC LIMIT 20`);return Response.json({history:rows.rows},{headers});}
  const q=(p.get("q")||"").trim(),set=(p.get("set")||"").trim().toLowerCase(),condition=p.get("condition")||"",finish=p.get("finish")||"",sort=p.get("sort")||"name",zero=p.get("zero")||"0";
  if(q.length>100||set.length>20||!/^[a-z0-9-]*$/.test(set)||condition&&!CONDITIONS.includes(condition)||finish&&!FINISHES.includes(finish)||!["name","set"].includes(sort)||!["0","1"].includes(zero))throw new Error("Check stocktake search/filters.");
  const pattern=`%${q.replace(/[\\%_]/g,"\\$&")}%`;
  const filter=sql`(${zero==="1"} OR quantity>0) AND (${q===""} OR name ILIKE ${pattern} OR set_name ILIKE ${pattern} OR set_code=${q.toLowerCase()} OR collector_number=${q}) AND (${set===""} OR set_code=${set}) AND (${condition===""} OR condition=${condition}) AND (${finish===""} OR finish=${finish})`;
  const fields=sort==="set" ? sql`set_code,collector_number,name,condition,finish,id`:sql`name,set_code,collector_number,condition,finish,id`;
  let after=sql`true`;
  if(p.has("after")){const raw=p.get("after")!;if(raw.length>4000)throw new Error("Invalid stocktake cursor.");let cursor:unknown;try{cursor=JSON.parse(Buffer.from(raw,"base64url").toString());}catch{throw new Error("Invalid stocktake cursor.");}if(!Array.isArray(cursor)||cursor.length!==6||cursor.some(v=>typeof v!=="string"||v.length>1000)||!isUUID(cursor[5]))throw new Error("Invalid stocktake cursor.");after=sql`(${fields})>(${sql.join(cursor.map((v,i)=>i===5?sql`${v}::uuid`:sql`${v}`),sql`,`)})`;}
  const result=await db.transaction(async tx=>{const rows=await tx.execute(sql`SELECT id,name,set_name AS "setName",set_code AS "setCode",collector_number AS "collectorNumber",condition,finish,image_url AS "imageUrl",quantity FROM products WHERE ${filter} AND ${after} ORDER BY ${fields} LIMIT 101`);const stats=await tx.execute(sql`SELECT count(*)::int AS variants,coalesce(sum(quantity),0)::bigint AS units FROM products WHERE ${filter}`);return {rows:rows.rows as StocktakeCard[],stats:stats.rows[0]};},{isolationLevel:"repeatable read",accessMode:"read only"});
  const rows=result.rows.slice(0,100),last=rows.at(-1),keys=last&&(sort==="set"?[last.setCode,last.collectorNumber,last.name,last.condition,last.finish,last.id]:[last.name,last.setCode,last.collectorNumber,last.condition,last.finish,last.id]);
  return Response.json({cards:rows,stats:result.stats,hasMore:result.rows.length>100,next:keys?Buffer.from(JSON.stringify(keys)).toString("base64url"):null},{headers});
 }catch(e){return apiError(e);}
}
export async function POST(request:Request){
 let input;try{await requireOwner(request);input=validateStocktake(await readBody(request));}catch(e){return apiError(e);}
 try{const result=await applyStocktake(input);if(!result.replayed&&result.record.lines.some(l=>l.delta>0))await dispatchRestockEvents();return Response.json(result,{headers});}
 catch(e){if(e instanceof StocktakeError)return Response.json({error:e.message,kind:e.kind,conflicts:e.conflicts},{status:409,headers});console.error("Stocktake confirmation failed; retain request ID for safe retry.");return Response.json({error:"Unable to confirm the stocktake result. Retry the same saved batch; do not create a replacement request.",uncertain:true},{status:500,headers});}
}
