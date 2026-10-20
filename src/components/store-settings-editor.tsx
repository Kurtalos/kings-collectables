"use client";
import { useState, type FormEvent, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Save, Store, Truck, Palette, Check, LoaderCircle } from "lucide-react";
import { useStoreSettings } from "./store-settings-provider";
import { requestJSON, ThemeMotif } from "./ui";
import { STORE_THEMES, shippingMessage, themeVariables, type StoreSettings, type StoreTheme } from "@/lib/store-settings";

function dollars(cents: number) { return (cents / 100).toFixed(2); }
function parseDollars(value: string) {
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter AUD amounts with no more than two decimal places.");
  return Math.round(Number(value) * 100);
}
export function StoreSettingsEditor() {
  const settings = useStoreSettings(), router = useRouter();
  const [draft, setDraft] = useState({ ...settings });
  const [flat, setFlat] = useState(dollars(settings.shippingFlat));
  const [threshold, setThreshold] = useState(dollars(settings.freeShippingThreshold ?? 10000));
  const [freeEnabled, setFreeEnabled] = useState(settings.freeShippingThreshold !== null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  function field(key: keyof StoreSettings, value: string) { setDraft(current => ({ ...current, [key]: value })); setSaved(false); }
  function reset() { setDraft({ ...settings }); setFlat(dollars(settings.shippingFlat)); setThreshold(dollars(settings.freeShippingThreshold ?? 10000)); setFreeEnabled(settings.freeShippingThreshold !== null); setError(""); setSaved(false); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSaved(false);
    try {
      await requestJSON("/api/store-settings", { method: "PUT", body: JSON.stringify({ ...draft, shippingFlat: parseDollars(flat), freeShippingThreshold: freeEnabled ? parseDollars(threshold) : null }) });
      setSaved(true); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save settings."); }
    finally { setBusy(false); }
  }
  const theme = STORE_THEMES[draft.theme];
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings) || flat !== dollars(settings.shippingFlat) || freeEnabled !== (settings.freeShippingThreshold !== null) || (freeEnabled && threshold !== dollars(settings.freeShippingThreshold ?? 10000));
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
    <fieldset disabled={busy} className="settings-section"><legend><Truck size={18}/> Shipping — Australia / AUD</legend><p>Standard tracked delivery only. These rates are used by the cart and by the server when a new order is placed.</p><div className="settings-fields"><label>Flat shipping rate (AUD)<input required type="number" min="0" max="10000" step="0.01" value={flat} onChange={e => { setFlat(e.target.value); setSaved(false); }}/><small>Set to $0 for free shipping on every order.</small></label><div><label className="settings-check"><input type="checkbox" checked={freeEnabled} onChange={e => { setFreeEnabled(e.target.checked); setSaved(false); }}/> Offer free shipping above a threshold</label>{freeEnabled && <label className="settings-threshold">Free shipping threshold (AUD)<input required type="number" min="0" max="10000" step="0.01" value={threshold} onChange={e => { setThreshold(e.target.value); setSaved(false); }}/></label>}</div></div></fieldset>
    <fieldset disabled={busy} className="settings-section"><legend><Palette size={18}/> Store theme</legend><p>Choose a palette. Holiday themes are switched on manually and stay active until you change them. Previewing does not affect shoppers.</p><div className="settings-themes">{(Object.entries(STORE_THEMES) as [StoreTheme, typeof theme][]).map(([key, value]) => <label className={`settings-theme ${draft.theme === key ? "selected" : ""}`} key={key}><input type="radio" name="theme" value={key} checked={draft.theme === key} onChange={() => field("theme", key)}/><span className="settings-swatches" aria-hidden="true">{[key === "christmas" ? "#102b20" : "#111111", value.accent, value.highlight].map((color, i) => <i key={i} style={{ background: color }}/>)}</span><strong><ThemeMotif theme={key}/> {value.name}</strong><small>{value.description}</small></label>)}</div>
    <div className="settings-preview" style={themeVariables(draft.theme) as CSSProperties}><div className="settings-preview-top"><ThemeMotif theme={draft.theme}/> {draft.storeName || "Your store"}</div><div className="settings-preview-content"><span>THEME PREVIEW · {theme.name.toUpperCase()}</span><h3>Your next great find.</h3><p>{shippingMessage({ ...draft, shippingFlat: Number(flat) >= 0 ? Math.round(Number(flat) * 100) : settings.shippingFlat, freeShippingThreshold: freeEnabled ? Math.round(Number(threshold) * 100) : null })}</p><span className="settings-preview-button">Explore the cards →</span></div></div></fieldset>
    <div className="settings-save">{error && <p role="alert" className="form-error">{error}</p>}{saved && <p role="status"><Check size={17}/> Store settings saved. Refresh an already-open storefront to see the changes.</p>}<div><span>{dirty && !saved ? "You have unsaved changes" : "Settings apply to new orders only"}</span><button type="button" className="button button-outline" disabled={busy} onClick={reset}>Discard changes</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin"/> : <Save size={16}/>} {busy ? "Saving…" : "Save store settings"}</button></div></div>
  </form>;
}
