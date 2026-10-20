"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Search, Check, RefreshCw } from "lucide-react";
import { useStoreSettings } from "./store-settings-provider";
import { money } from "@/lib/types";
import { isUUID } from "@/lib/validation";
import { tradeUnitValue, tradeOfferTotal } from "@/lib/trade-value";
export type TradeSelection = { receiptId?: string; productId: string; quantity: number; name: string; amount: number };
type Printing = { id:string; name:string; setName:string; setCode:string; collectorNumber:string; condition:string; finish:string; imageUrl:string; price:number; quantity:number };
type Results = { cards:Printing[]; hasMore:boolean; tradeInPercent:number };
export function TradePrintingPicker({ onAdd }: { onAdd:(trade:TradeSelection)=>void }) {
  const settings=useStoreSettings();
  const [q,setQ]=useState(""),[page,setPage]=useState(0),[retry,setRetry]=useState(0),[results,setResults]=useState<Results & {query:string;page:number}|null>(null),[loading,setLoading]=useState(false),[browsing,setBrowsing]=useState(true),[searchError,setSearchError]=useState("");
  const [selected,setSelected]=useState<Printing|null>(null),[percent,setPercent]=useState(settings.tradeInPercent),[quantity,setQuantity]=useState("1"),[offer,setOffer]=useState(""),[manual,setManual]=useState(false),[receiptId,setReceiptId]=useState(""),[error,setError]=useState(""),[choosing,setChoosing]=useState(false);
  const selectionRequest=useRef<AbortController|null>(null), query=q.trim();
  useEffect(()=>()=>selectionRequest.current?.abort(),[]);
  useEffect(()=>{
    if(query.length<2)return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{setLoading(true);setSearchError("");try{const response=await fetch(`/api/pos/trade-search?q=${encodeURIComponent(query)}&page=${page}`,{signal:controller.signal,cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Unable to search catalogue.");if(!controller.signal.aborted)setResults({...data,query,page});}catch(e){if(!controller.signal.aborted)setSearchError(e instanceof Error ? e.message:"Unable to search catalogue.");}finally{if(!controller.signal.aborted)setLoading(false);}},200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,page,retry]);
  async function choose(card:Printing){
    selectionRequest.current?.abort();const controller=new AbortController();selectionRequest.current=controller;setChoosing(true);setSelected(null);setOffer("");setError("");
    try{const response=await fetch(`/api/pos/trade-search?productId=${card.id}`,{signal:controller.signal,cache:"no-store"}),data=await response.json() as Results & {error?:string};if(!response.ok)throw new Error(data.error||"Unable to load printing.");if(!data.cards[0])throw new Error("This printing is no longer in the catalogue.");if(controller.signal.aborted)return;const current=data.cards[0];setSelected(current);setPercent(data.tradeInPercent);setOffer((tradeUnitValue(current.price,data.tradeInPercent)/100).toFixed(2));setManual(false);setBrowsing(false);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error ? e.message:"Unable to load printing.");}finally{if(!controller.signal.aborted)setChoosing(false);}
  }
  let total=0,validOffer=false;try{total=tradeOfferTotal(offer,quantity).amount;validOffer=true;}catch{/* Incomplete inputs stay editable. */}
  function submit(event:FormEvent){event.preventDefault();if(!selected||choosing)return;try{const values=tradeOfferTotal(offer,quantity);if(receiptId.trim() && !isUUID(receiptId.trim()))throw new Error("Enter a valid existing receipt UUID.");onAdd({productId:selected.id,name:`${selected.name} — ${selected.setCode.toUpperCase()} #${selected.collectorNumber} · ${selected.condition} · ${selected.finish}`.slice(0,160),quantity:values.quantity,amount:values.amount,...(receiptId.trim() ? {receiptId:receiptId.trim()}: {})});}catch(e){setError(e instanceof Error ? e.message:"Check the trade offer.");}}
  const currentResults=results?.query===query&&results.page===page ? results:null;
  return <form className="stack-form pos-new-customer pos-trade-form" onSubmit={submit}>
    <label>Find catalogue printing<div className="trade-search-input"><Search size={17}/><input autoFocus aria-label="Find catalogue printing" value={q} maxLength={100} placeholder="Search card name, set, collector number or printing ID" onChange={e=>{setQ(e.target.value);setPage(0);setBrowsing(true);setSearchError("");setLoading(false);}}/></div></label>
    {query.length<2 ? <p className="trade-search-hint">Type at least 2 characters to search the full catalogue, including out-of-stock printings.</p>:selected&&!browsing ? <button type="button" className="pos-link-button" onClick={()=>setBrowsing(true)}>Change printing / browse results</button>:<>
      <div className="trade-search-status" role="status">{loading||!currentResults&&!searchError ? <><LoaderCircle size={15} className="spin"/> Searching catalogue…</>:searchError ? null:currentResults?.cards.length ? `${page*20+1}–${page*20+currentResults.cards.length} results · select an exact printing` : "No printings found. Try a card name, set code or collector number."}</div>
      {searchError && <div role="alert">{searchError}<button type="button" className="pos-link-button" onClick={()=>setRetry(n=>n+1)}>Retry search</button></div>}
      <div className="trade-results" aria-label="Catalogue printing results">{currentResults?.cards.map(card=><button type="button" className={`trade-result ${selected?.id===card.id ? "selected":""}`} key={card.id} onClick={()=>choose(card)} aria-pressed={selected?.id===card.id}><img src={card.imageUrl||"/favicon.svg"} alt="" loading="lazy"/><span><strong>{card.name}</strong><small>{card.setName} ({card.setCode.toUpperCase()}) #{card.collectorNumber}</small><small>{card.condition} · {card.finish} · {card.quantity ? `${card.quantity} in stock`:"Out of stock — can receive"}</small></span><span className="trade-result-price"><b>{money(card.price)}</b><small>sell / copy</small>{selected?.id===card.id && <Check size={15}/>}</span></button>)}</div>
      <div className="trade-pagination"><button type="button" disabled={!page||loading} onClick={()=>setPage(n=>n-1)}>Previous results</button><button type="button" disabled={!currentResults?.hasMore||loading} onClick={()=>setPage(n=>n+1)}>Next results</button></div>
    </>}
    {choosing && <p role="status">Loading current sell price and trade rate…</p>}
    {selected && <section className="trade-selected" aria-label="Selected trade printing"><div><img src={selected.imageUrl||"/favicon.svg"} alt=""/><span><strong>{selected.name}</strong><small>{selected.setCode.toUpperCase()} #{selected.collectorNumber} · {selected.condition} · {selected.finish}</small><small>Sell price: <b>{money(selected.price)} per copy</b></small><small>Default: {percent}% = {money(tradeUnitValue(selected.price,percent))} trade credit per copy</small></span></div><button className="pos-link-button" type="button" disabled={choosing} onClick={()=>choose(selected)}><RefreshCw size={13}/> Refresh sell price & reset offer</button><p>Price checked when selected/refreshed. This is a suggested offer, not a live market quote.</p></section>}
    <div className="trade-offer-fields"><label>Quantity received<input aria-label="Quantity received" type="number" required min="1" max="999" step="1" value={quantity} onChange={e=>{setQuantity(e.target.value);setError("");}}/></label><label>Trade offer per copy (AUD)<input aria-label="Trade offer per copy (AUD)" type="number" min="0.01" max="10000" step="0.01" required disabled={!selected||choosing} value={offer} onChange={e=>{setOffer(e.target.value);setManual(true);setError("");}}/></label></div>
    {selected && <div className="trade-total" role="status"><span>{manual ? "Manual offer":"Suggested offer"} · {quantity||"0"} copies</span><strong>{money(total)} total credit</strong>{!validOffer && <small>Enter a positive offer with total credit no more than $10,000.</small>}{manual && <small>Your per-copy override is kept when quantity changes. Select another printing or reset to use the default again.</small>}</div>}
    <details><summary>Already received and credited?</summary><label>Existing trade receipt ID<input value={receiptId} onChange={e=>setReceiptId(e.target.value)} placeholder="Optional: inventory receipt UUID"/></label><p>Linked receipts do not add stock or issue credit again. Enter the reference value manually if different from the suggestion.</p></details>
    <p className="pos-panel-hint">New trades add the agreed total to the customer’s store credit when the sale completes, and receive this exact printing with that acquisition cost in the same transaction. Do not receive these cards a second time. Adding to the basket alone does not change stock or credit.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="button button-primary" disabled={!selected||choosing||!validOffer}>Add trade-in</button>
  </form>;
}
