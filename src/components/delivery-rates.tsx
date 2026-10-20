"use client";
import { enabledDeliveryOptions } from "@/lib/delivery";
import { useStoreSettings } from "./store-settings-provider";
import { money } from "@/lib/types";
export function DeliveryRates() {
  const options=enabledDeliveryOptions(useStoreSettings());
  return <div className="shipping-options">{options.length ? options.map(option=><div key={option.id}><strong>{option.name}</strong><span>{option.price===0 ? "Free":money(option.price)}{option.freeAbove!==null && option.price>0 ? ` · free on orders of ${money(option.freeAbove)}+`:""}</span>{option.description && <p>{option.description}</p>}</div>):<p>Online delivery is currently unavailable. Please contact the store.</p>}</div>;
}
