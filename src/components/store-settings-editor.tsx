"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save, Store, Truck, Check, LoaderCircle } from "lucide-react";
import { useStoreSettings } from "./store-settings-provider";
import { requestJSON } from "./ui";
import { type StoreSettings } from "@/lib/store-settings";


function parseDollars(value: string) {
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter AUD amounts with no more than two decimal places.");
  return Math.round(Number(value) * 100);
}
import { deliveryOptions } from "@/lib/delivery";
import { DeliveryOptionsEditor, deliveryDraft } from "./delivery-options-editor";

export function StoreSettingsEditor() {
  const settings = useStoreSettings(), router = useRouter();
  const [draft, setDraft] = useState({ ...settings });
  const [tradePercent, setTradePercent] = useState(String(settings.tradeInPercent));
  const [delivery, setDelivery] = useState(() => deliveryOptions(settings).map(deliveryDraft));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  function field(key: keyof StoreSettings, value: string) { setDraft(current => ({ ...current, [key]: value })); setSaved(false); }
  function reset() { setDraft({ ...settings }); setTradePercent(String(settings.tradeInPercent)); setDelivery(deliveryOptions(settings).map(deliveryDraft)); setError(""); setSaved(false); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSaved(false);
    try {
      const result = await requestJSON<{settings: StoreSettings}>("/api/store-settings", { method: "PUT", body: JSON.stringify({ ...draft, tradeInPercent: Number(tradePercent), deliveryOptions: delivery.map(({rateText,thresholdText,freeEnabled,...option})=>({...option,price:parseDollars(rateText),freeAbove:freeEnabled ? parseDollars(thresholdText):null})) }) });
      setDraft({...result.settings}); setTradePercent(String(result.settings.tradeInPercent)); setDelivery(deliveryOptions(result.settings).map(deliveryDraft)); setSaved(true); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save settings."); }
    finally { setBusy(false); }
  }
  const dirty = tradePercent !== String(settings.tradeInPercent) || JSON.stringify(draft) !== JSON.stringify(settings) || JSON.stringify(delivery) !== JSON.stringify(deliveryOptions(settings).map(deliveryDraft));
  return <form className="store-settings-form" onSubmit={submit}>
    <div className="settings-intro"><Store size={24}/><div><h2>Make this store your own</h2><p>Business details are public. Changes apply when you save; existing orders and acquisition costs are never changed.</p></div></div>
    <fieldset disabled={busy} className="settings-section"><legend><Store size={18}/> Business & contact details</legend><p>Only enter an address and contact details you want shoppers to see. Leave optional fields blank to hide them.</p><div className="settings-fields">
      <label>Store name<input required maxLength={80} value={draft.storeName} onChange={e => field("storeName", e.target.value)}/></label>
      <label>Legal / business name<input maxLength={160} value={draft.legalName} onChange={e => field("legalName", e.target.value)}/></label>
      <label>ABN<input inputMode="numeric" maxLength={20} placeholder="11 digits (optional)" value={draft.abn} onChange={e => field("abn", e.target.value)}/><small>Displayed as provided; not verified with the ABR.</small></label>
      <label>Contact email<input type="email" maxLength={254} value={draft.email} onChange={e => field("email", e.target.value)}/></label>
      <label>Contact phone<input type="tel" maxLength={40} value={draft.phone} onChange={e => field("phone", e.target.value)}/></label>
      <label>Opening / contact hours<textarea maxLength={300} value={draft.openingHours} onChange={e => field("openingHours", e.target.value)}/></label>
      <label className="settings-full">Public store / postal address<textarea maxLength={500} value={draft.address} onChange={e => field("address", e.target.value)}/><small>Publishing an address does not enable click-and-collect.</small></label>
    </div></fieldset>
    <fieldset disabled={busy} className="settings-section"><legend><Store size={18}/> Admin slogans</legend><p>Personalise the two slogans in your admin workspace. Leave either field blank to hide it. These do not change storefront page content.</p><div className="settings-fields">
      <label>Header slogan<input aria-label="Header slogan" aria-describedby="header-slogan-help" maxLength={160} value={draft.headerSlogan} onChange={e => field("headerSlogan", e.target.value)}/><small id="header-slogan-help">Shown in the black banner above the workspace sections.</small></label>
      <label>Sidebar slogan<input aria-label="Sidebar slogan" aria-describedby="sidebar-slogan-help" maxLength={80} value={draft.sidebarSlogan} onChange={e => field("sidebarSlogan", e.target.value)}/><small id="sidebar-slogan-help">Shown beneath your store logo.</small></label>
    </div></fieldset>
    <fieldset disabled={busy} className="settings-section"><legend>POS trade-ins</legend><label>Default trade-in percentage<input aria-label="Default trade-in percentage" type="number" required min="0" max="100" step="1" value={tradePercent} onChange={e=>{setTradePercent(e.target.value);setSaved(false);}}/></label><p>Suggested credit per copy is this percentage of the exact printing’s current sell price, rounded to the nearest cent. POS staff can override the offer. Applies to new selections only, not existing trades or acquisition costs. A 0% setting requires a manual positive offer.</p></fieldset>
    <fieldset disabled={busy} className="settings-section"><legend><Truck size={18}/> Delivery options — Australia / AUD</legend><DeliveryOptionsEditor options={delivery} onChange={next=>{setDelivery(next);setSaved(false);}}/></fieldset>
    <div className="settings-save">{error && <p role="alert" className="form-error">{error}</p>}{saved && <p role="status"><Check size={17}/> Store settings saved. Refresh an already-open storefront to see the changes.</p>}<div><span>{dirty && !saved ? "You have unsaved changes" : "Settings apply to new orders only"}</span><button type="button" className="button button-outline" disabled={busy} onClick={reset}>Discard changes</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin"/> : <Save size={16}/>} {busy ? "Saving…" : "Save store settings"}</button></div></div>
  </form>;
}
