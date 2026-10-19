"use client";
import { useStoreSettings } from "./store-settings-provider";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Heart, Bell, PackageSearch, LogOut, LoaderCircle, Check, Eye, ShoppingBag, Crown, MapPin, Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import { EmptyState, requestJSON } from "./ui";
import { ProductCard } from "./product-card";
import { AU_STATES, type AddressFields } from "@/lib/address";
import { money, type Card, type Customer, type StoreOrder, type WatchItem, type SavedAddress, type AccountData } from "@/lib/types";
type Tab = "orders" | "wishlist" | "watchlist" | "addresses";
const BLANK: AddressFields = { label: "Home", recipientName: "", line1: "", line2: "", suburb: "", state: "VIC", postcode: "", phone: "" };

export function AccountPanel({ products, customer, orders, addresses, onAddresses, saved, watched, watchMeta, savedProducts, watchProducts, onAuth, onLogout, onSave, onWatch, onAdd, onView }: {
  products: Card[]; customer: Customer | null; orders: StoreOrder[]; addresses: SavedAddress[]; onAddresses: (next: SavedAddress[]) => void;
  saved: string[]; watched: string[]; watchMeta: WatchItem[]; savedProducts: Card[]; watchProducts: Card[];
  onAuth: (data: AccountData) => void | Promise<void>; onLogout: () => void; onSave: (card: Card) => void; onWatch: (card: Card) => void; onAdd: (card: Card) => void; onView: (card: Card) => void;
}) {
  const settings = useStoreSettings();
  const [mode, setMode] = useState<"login" | "register">("login"), [tab, setTab] = useState<Tab>("orders"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [draft, setDraft] = useState<AddressFields | null>(null), [editingId, setEditingId] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const fields = new FormData(event.currentTarget);
    try { await onAuth(await requestJSON<AccountData>("/api/account", { method: "POST", body: JSON.stringify({ action: mode, name: fields.get("name"), email: fields.get("email"), password: fields.get("password") }) })); }
    catch (error) { setError(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }
  async function logout() { setBusy(true); try { await requestJSON("/api/account", { method: "DELETE" }); onLogout(); } catch (error) { setError(error instanceof Error ? error.message : "Please try again."); } finally { setBusy(false); } }
  async function saveAddress() {
    if (!draft) return;
    setBusy(true); setError("");
    try {
      const result = await requestJSON<{ addresses: SavedAddress[] }>("/api/addresses", { method: "POST", body: JSON.stringify({ ...draft, id: editingId || undefined, isDefault: editingId ? addresses.find(entry => entry.id === editingId)?.isDefault : addresses.length === 0 }) });
      onAddresses(result.addresses); setDraft(null); setEditingId(null);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save that address."); }
    finally { setBusy(false); }
  }
  async function removeAddress(entry: SavedAddress) {
    setBusy(true); setError("");
    try { const result = await requestJSON<{ addresses: SavedAddress[] }>("/api/addresses", { method: "DELETE", body: JSON.stringify({ id: entry.id }) }); onAddresses(result.addresses); if (draft && editingId === entry.id) { setDraft(null); setEditingId(null); } }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to remove that address."); }
    finally { setBusy(false); }
  }
  async function makeDefault(entry: SavedAddress) {
    setBusy(true); setError("");
    try { const result = await requestJSON<{ addresses: SavedAddress[] }>("/api/addresses", { method: "PATCH", body: JSON.stringify({ id: entry.id, action: "default" }) }); onAddresses(result.addresses); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to update that address."); }
    finally { setBusy(false); }
  }
  if (!customer) return <div className="account-auth"><div className="account-auth-intro"><span className="account-crown"><Crown size={28}/></span><span className="eyebrow">YOUR COLLECTION, YOUR ACCOUNT</span><h1>Join {settings.storeName}.</h1><p>Create a free account to track orders, save delivery addresses, keep a wishlist, and watch cards for restocks and price drops.</p></div><div className="account-auth-card"><div className="account-tabs">{[{ id: "login" as const, label: "Sign in" }, { id: "register" as const, label: "Create account" }].map(item => <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => { setMode(item.id); setError(""); }}>{item.label}</button>)}</div><form className="stack-form" onSubmit={submit}>{mode === "register" && <label>Full name<input name="name" required maxLength={120} autoComplete="name" placeholder="Alex Planeswalker"/></label>}<label>Email address<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com"/></label><label>Password<input name="password" type="password" required minLength={8} maxLength={72} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="At least 8 characters"/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : mode === "register" ? <Crown size={16}/> : <Check size={16}/>} {busy ? "Please wait…" : mode === "register" ? "Create my account" : "Sign in"}<ArrowRight size={16}/></button></form><p className="muted small">Passwords are stored securely. Guest checkout still works if you prefer not to register.</p></div></div>;
  const available = new Map([...products, ...savedProducts, ...watchProducts].map(card => [card.id, card]));
  const wishCards = saved.flatMap(id => { const card = available.get(id); return card ? [card] : []; });
  const watchCards = watched.flatMap(id => { const card = available.get(id); return card ? [card] : []; });
  return <div className="account-hub"><div className="account-hub-heading"><div><span className="eyebrow">WELCOME BACK</span><h1>Hey {customer.name.split(" ")[0]}.</h1><p>Your orders, addresses, saved cards and watch list live here.</p></div><button className="button button-outline" onClick={logout} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15}/> : <LogOut size={15}/>} Sign out</button></div>
    <div className="account-stats">{([{ id: "orders" as Tab, icon: PackageSearch, count: orders.length, label: "Orders" }, { id: "addresses" as Tab, icon: MapPin, count: addresses.length, label: "Addresses" }, { id: "wishlist" as Tab, icon: Heart, count: saved.length, label: "Wishlist" }, { id: "watchlist" as Tab, icon: Bell, count: watched.length, label: "Watch list" }]).map(item => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><item.icon size={18}/><strong>{item.count}</strong><span>{item.label}</span></button>)}</div>
    {error && tab === "addresses" && <p className="form-error" role="alert"><AlertCircle size={14}/>{error}</p>}
    {tab === "orders" && (orders.length ? <div className="account-orders">{orders.map(order => <article className="account-order" key={order.id}><div className="tracked-order-top"><strong>{order.orderNumber}</strong><span className="status-pill">{order.status}</span></div><p>Placed {new Date(order.createdAt).toLocaleDateString("en-AU")} · {order.channel === "pos" ? "In store" : "Online"}</p><div className="account-order-address"><MapPin size={13}/><span>{order.shippingAddress.replace(/\n/g, ", ")}</span></div>{order.items.map(item => <div className="tracked-line" key={item.id}><span>{item.quantity} × {item.cardName}<small>{item.variant}</small></span><strong>{money(item.unitPrice * item.quantity)}</strong></div>)}<div className="tracked-total"><span>Total, including shipping</span><strong>{money(order.total)} AUD</strong></div></article>)}</div> : <EmptyState icon={<ShoppingBag size={34}/>} title="No orders yet" description="When you reserve cards, they’ll appear here automatically."><Link href="/cards" className="button button-primary">Shop singles <ArrowRight size={16}/></Link></EmptyState>)}
    {tab === "addresses" && <div className="account-addresses">
      <div className="account-addresses-head"><div><h2>Delivery addresses</h2><p>Save them once and checkout fills itself in. You can keep up to ten.</p></div>{!draft && <button className="button button-primary" onClick={() => { setDraft({ ...BLANK, recipientName: customer.name }); setEditingId(null); setError(""); }}><Plus size={15}/> Add address</button>}</div>
      {draft && <div className="address-editor"><h3>{editingId ? "Edit address" : "New address"}</h3>
        <div className="checkout-fields">
          <div className="checkout-field-row"><label className="checkout-field"><span>Label</span><input value={draft.label} maxLength={40} onChange={event => setDraft(current => current ? { ...current, label: event.target.value } : current)} placeholder="Home, Work…"/></label><label className="checkout-field"><span>Contact number <em>optional</em></span><input value={draft.phone || ""} maxLength={30} onChange={event => setDraft(current => current ? { ...current, phone: event.target.value } : current)} placeholder="04xx xxx xxx"/></label></div>
          <label className="checkout-field"><span>Recipient name</span><input value={draft.recipientName} maxLength={120} onChange={event => setDraft(current => current ? { ...current, recipientName: event.target.value } : current)} required/></label>
          <label className="checkout-field"><span>Street address</span><input value={draft.line1} maxLength={160} onChange={event => setDraft(current => current ? { ...current, line1: event.target.value } : current)} placeholder="12 Collector Street" required/></label>
          <label className="checkout-field"><span>Apartment, unit, building <em>optional</em></span><input value={draft.line2 || ""} maxLength={160} onChange={event => setDraft(current => current ? { ...current, line2: event.target.value } : current)}/></label>
          <div className="checkout-field-row three"><label className="checkout-field"><span>Suburb / town</span><input value={draft.suburb} maxLength={90} onChange={event => setDraft(current => current ? { ...current, suburb: event.target.value } : current)} required/></label><label className="checkout-field"><span>State</span><select value={draft.state} onChange={event => setDraft(current => current ? { ...current, state: event.target.value } : current)}>{AU_STATES.map(state => <option key={state}>{state}</option>)}</select></label><label className="checkout-field"><span>Postcode</span><input value={draft.postcode} inputMode="numeric" maxLength={4} onChange={event => setDraft(current => current ? { ...current, postcode: event.target.value.replace(/\D/g, "").slice(0, 4) } : current)} required/></label></div>
        </div>
        <div className="address-editor-actions"><button className="button button-outline" onClick={() => { setDraft(null); setEditingId(null); }} disabled={busy}>Cancel</button><button className="button button-primary" onClick={saveAddress} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>} {editingId ? "Update address" : "Save address"}</button></div>
      </div>}
      {addresses.length ? <div className="address-list account-address-list">{addresses.map(entry => <div className={`address-card ${entry.isDefault ? "selected" : ""}`} key={entry.id}>
        <span className="address-top"><strong>{entry.label}</strong>{entry.isDefault && <em>Default</em>}</span>
        <p className="address-lines">{entry.recipientName}<br/>{entry.line1}{entry.line2 && <>{entry.line2}<br/></>}{entry.suburb} {entry.state} {entry.postcode}{entry.phone && <> · {entry.phone}</>}</p>
        <div className="address-card-actions"><button onClick={() => { setDraft({ label: entry.label, recipientName: entry.recipientName, line1: entry.line1, line2: entry.line2 || "", suburb: entry.suburb, state: entry.state, postcode: entry.postcode, phone: entry.phone || "" }); setEditingId(entry.id); setError(""); }}><Pencil size={12}/> Edit</button>{!entry.isDefault && <button onClick={() => makeDefault(entry)} disabled={busy}>Set default</button>}<button className="danger" onClick={() => removeAddress(entry)} disabled={busy}><Trash2 size={12}/> Remove</button></div>
      </div>)}</div> : !draft && <EmptyState icon={<MapPin size={33}/>} title="No saved addresses yet" description="Add one and checkout will fill itself in next time — no retyping, no mistakes."><button className="button button-primary" onClick={() => setDraft({ ...BLANK, recipientName: customer.name })}>Add your first address <Plus size={15}/></button></EmptyState>}
    </div>}
    {tab === "wishlist" && (wishCards.length ? <div className="product-grid catalogue-grid account-grid">{wishCards.map(card => <ProductCard key={card.id} card={card} saved watching={watched.includes(card.id)} onSave={() => onSave(card)} onWatch={() => onWatch(card)} onAdd={() => onAdd(card)} onView={() => onView(card)}/>)}</div> : <EmptyState icon={<Heart size={34}/>} title="Your wishlist is waiting" description="Tap the heart on any card. Saved cards stay with your account on every device."><Link href="/cards" className="button button-primary">Find favourites <ArrowRight size={16}/></Link></EmptyState>)}
    {tab === "watchlist" && (watchCards.length ? <div className="watch-list">{watchCards.map(card => { const meta = watchMeta.find(item => item.productId === card.id); const restock = (meta?.lastSeenQuantity || 0) === 0 && card.quantity > 0; const drop = meta ? card.price < meta.lastSeenPrice : false; return <article className="watch-card" key={card.id}><img src={card.imageUrl} alt={card.name}/><div><h3>{card.name}</h3><p>{card.setName} · {card.condition} · {card.finish}</p><strong>{money(card.price)}</strong><div className="watch-flags">{restock && <span className="watch-flag restock">Back in stock</span>}{drop && <span className="watch-flag drop">Price drop</span>}{!card.quantity && <span className="watch-flag waiting">Watching for restock</span>}{card.quantity > 0 && !restock && <span className="watch-flag ready">{card.quantity} in stock</span>}</div></div><div className="watch-actions"><button className="button button-primary" disabled={!card.quantity} onClick={() => onAdd(card)}>Add to cart</button><button className="button button-outline" onClick={() => onWatch(card)}><Eye size={14}/> Stop watching</button></div></article>; })}</div> : <EmptyState icon={<Bell size={34}/>} title="Nothing on the watch list" description="Watch a card to keep an eye on restocks and price drops. Perfect for sold-out singles."><Link href="/cards" className="button button-primary">Browse singles <ArrowRight size={16}/></Link></EmptyState>)}
  </div>;
}
