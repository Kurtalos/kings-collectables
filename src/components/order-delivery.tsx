"use client";
import { useState, type FormEvent } from "react";
import { requestJSON } from "./ui";
import type { DeliverySnapshot } from "@/lib/delivery";
import type { StoreOrder } from "@/lib/types";
export function DeliverySummary({ order }: { order: StoreOrder }) {
  const delivery=order.delivery;
  if (!delivery) return null;
  return <div className="order-delivery-summary"><strong>{delivery.name}</strong>{delivery.description && <p>{delivery.description}</p>}{order.status==="Shipped" && delivery.trackingNumber && <p>{delivery.carrier && <span>{delivery.carrier} · </span>}Tracking: <strong>{delivery.trackingNumber}</strong>{delivery.trackingUrl && <a href={delivery.trackingUrl} target="_blank" rel="noopener noreferrer">Track delivery ↗</a>}</p>}</div>;
}
export function OrderDeliveryEditor({ order, onSaved }: { order: StoreOrder; onSaved: (delivery: DeliverySnapshot) => void }) {
  const delivery=order.delivery;
  const [number,setNumber]=useState(delivery?.trackingNumber ?? ""),[url,setUrl]=useState(delivery?.trackingUrl ?? ""),[carrier,setCarrier]=useState(delivery?.carrier ?? ""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  async function save(event:FormEvent){event.preventDefault();setBusy(true);setError("");setMessage("");try{const result=await requestJSON<{delivery:DeliverySnapshot}>("/api/orders",{method:"PATCH",body:JSON.stringify({id:order.id,action:"tracking",trackingNumber:number,trackingUrl:url,carrier})});setMessage("Tracking saved. Customers see it when the order is Shipped. No automatic email is sent.");onSaved(result.delivery);}catch(e){setError(e instanceof Error ? e.message:"Unable to save tracking.");}finally{setBusy(false);}}
  if(!delivery)return null;
  return <section className="order-delivery-editor"><DeliverySummary order={order}/>{!delivery.trackingEnabled ? <p>Tracking numbers are not enabled for this order’s saved delivery option.</p>:!["Paid","Packing","Shipped"].includes(order.status)?<p>Tracking can be edited once the order is paid or packing, and remains editable after shipping.</p>:<form onSubmit={save}><fieldset disabled={busy}><legend>Delivery tracking</legend><label>Carrier<input aria-label="Tracking carrier" maxLength={80} value={carrier} onChange={e=>setCarrier(e.target.value)}/></label><label>Tracking number<input aria-label="Tracking number" maxLength={120} value={number} onChange={e=>setNumber(e.target.value)}/></label><label>Tracking link (optional HTTPS URL)<input aria-label="Tracking link" type="url" maxLength={1000} value={url} onChange={e=>setUrl(e.target.value)}/></label><p>To clear tracking, leave both number and link blank, then save.</p><button className="button button-outline">{busy ? "Saving…":"Save tracking"}</button></fieldset>{message && <p role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}</form>}</section>;
}
