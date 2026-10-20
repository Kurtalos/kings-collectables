import { isUUID } from "./validation";
export const STOCKTAKE_LIMIT=500;
export type StocktakeCard={id:string;name:string;setName:string;setCode:string;collectorNumber:string;condition:string;finish:string;imageUrl:string;quantity:number};
export type StocktakeLine={productId:string;expected:number;counted:number};
export type StocktakeInput={requestId:string;reason:string;lines:StocktakeLine[]};
export type StocktakeAuditLine=StocktakeLine & {name:string;variant:string;delta:number;removedLots:{lotId:string;quantity:number;unitCost:number|null}[]};
export type StocktakeBatch={id:string;createdAt:string;reason:string;fingerprint:string;receiptId:string|null;lines:StocktakeAuditLine[]};
export type StocktakeSummary={id:string;createdAt:string;reason:string;rows:number;added:number;removed:number};
export type StocktakeConflict={productId:string;name:string;expected:number;current:number|null};
export type CountDraft={card:StocktakeCard;count:string};
export const stockQuantity=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0&&n<=1000000;
export function validateStocktake(input:unknown):StocktakeInput{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Send a stocktake batch.");
 const p=input as StocktakeInput;
 if(!isUUID(p.requestId))throw new Error("Choose a valid stocktake request ID.");
 if(typeof p.reason!=="string"||!p.reason.trim()||p.reason.length>300||/[\u0000-\u001f]/.test(p.reason))throw new Error("Enter a stocktake reason (up to 300 characters).");
 if(!Array.isArray(p.lines)||!p.lines.length||p.lines.length>STOCKTAKE_LIMIT)throw new Error(`Save between 1 and ${STOCKTAKE_LIMIT} counts per batch.`);
 const seen=new Set<string>();const lines=p.lines.map(l=>{if(!l||!isUUID(l.productId)||seen.has(l.productId.toLowerCase())||!stockQuantity(l.expected)||!stockQuantity(l.counted))throw new Error("Each printing needs a unique ID and whole counts between 0 and 1,000,000.");seen.add(l.productId.toLowerCase());return {productId:l.productId.toLowerCase(),expected:l.expected,counted:l.counted};}).sort((a,b)=>a.productId.localeCompare(b.productId));
 return {requestId:p.requestId.toLowerCase(),reason:p.reason.trim(),lines};
}
export function stocktakeLines(draft:Record<string,CountDraft>):StocktakeLine[]{return Object.values(draft).map(d=>{if(!/^\d+$/.test(d.count)||!stockQuantity(Number(d.count)))throw new Error(`Check the counted quantity for ${d.card.name}.`);return {productId:d.card.id,expected:d.card.quantity,counted:Number(d.count)};});}
export function parseStocktakeDraft(raw:string){
 if(raw.length>4000000)throw new Error("Local stocktake draft is too large. Export/clear browser progress before continuing.");
 const p=JSON.parse(raw);if(p.version!==1||!p.draft||typeof p.draft!=="object"||Array.isArray(p.draft)||Object.keys(p.draft).length>STOCKTAKE_LIMIT)throw new Error("Cannot read this local stocktake draft.");
 for(const [id,d] of Object.entries(p.draft) as [string,CountDraft][]){if(!d?.card||!isUUID(id)||d.card.id!==id||!stockQuantity(d.card.quantity)||typeof d.count!=="string"||d.count.length>30)throw new Error("Invalid saved stocktake count.");for(const k of ["name","setName","setCode","collectorNumber","condition","finish","imageUrl"] as const)if(typeof d.card[k]!=="string"||d.card[k].length>1000)throw new Error("Invalid saved stocktake printing.");}
 const checked:Record<string,number>={};if(p.checked&&typeof p.checked==="object")for(const [id,n]of Object.entries(p.checked))if(isUUID(id)&&stockQuantity(n))checked[id]=n;
 return {draft:p.draft as Record<string,CountDraft>,reason:typeof p.reason==="string" ? p.reason.slice(0,300):"Physical stocktake",checked,attempt:p.attempt ? validateStocktake(p.attempt):null};
}
