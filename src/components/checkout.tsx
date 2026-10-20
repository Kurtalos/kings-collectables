"use client";
import { useStoreSettings } from "./store-settings-provider";
import { enabledDeliveryOptions, deliveryCost, deliveryQuote, type DeliverySnapshot } from "@/lib/delivery";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Check, ChevronRight, Landmark, CreditCard, LoaderCircle, Lock, MapPin, Plus, Pencil, Trash2, ShieldCheck, ShoppingBag, PackageCheck, Crown, AlertCircle, Minus, Truck, X } from "lucide-react";
import { Brand, EmptyState, requestJSON } from "./ui";
import { StripePaymentForm } from "./payment-form";
import { AU_STATES, describeAddress, type AddressFields } from "@/lib/address";
import { BANK_DETAILS } from "@/lib/store-config";
import { money, type Card, type Customer, type SavedAddress, type CartLine } from "@/lib/types";

type Step = "details" | "delivery" | "payment";
const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: "details", label: "Your details", hint: "Who's ordering" },
  { id: "delivery", label: "Delivery", hint: "Where it's going" },
  { id: "payment", label: "Payment", hint: "How you'll pay" },
];
type PlacedOrder = { id: string; orderNumber: string; total: number; status: string; delivery?: DeliverySnapshot };
const BLANK: AddressFields = { label: "Home", recipientName: "", line1: "", line2: "", suburb: "", state: "VIC", postcode: "", phone: "" };

export function Checkout({ initialProducts, customer, addresses: initialAddresses, cardAvailable, publishableKey }: {
  initialProducts: Card[]; customer: Customer | null; addresses: SavedAddress[]; cardAvailable: boolean; publishableKey: string;
}) {
  const settings = useStoreSettings();
  const availableDelivery = enabledDeliveryOptions(settings);
  const [deliveryId, setDeliveryId] = useState(availableDelivery[0]?.id ?? "");
  const deliveryOption = availableDelivery.find(option=>option.id===deliveryId);
  const FREE_SHIPPING_THRESHOLD = deliveryOption?.freeAbove ?? null;
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]), [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>("details"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [details, setDetails] = useState({ name: customer?.name || "", email: customer?.email || "" });
  const [addresses, setAddresses] = useState<SavedAddress[]>(initialAddresses);
  const [addressMode, setAddressMode] = useState<"saved" | "new">(initialAddresses.length ? "saved" : "new");
  const [selectedId, setSelectedId] = useState<string | null>(initialAddresses.find(address => address.isDefault)?.id || initialAddresses[0]?.id || null);
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [draft, setDraft] = useState<AddressFields>(BLANK), [saveAddress, setSaveAddress] = useState(Boolean(customer));
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank">(cardAvailable && customer ? "card" : "bank");
  const [order, setOrder] = useState<PlacedOrder | null>(null), [paid, setPaid] = useState(false);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("kings-cart") || localStorage.getItem("mana-cart") || "[]");
      if (Array.isArray(raw)) {
        setCart(raw.map(item => {
          const product = initialProducts.find(card => card.id === item.id);
          return product && Number.isInteger(item.quantity) && item.quantity > 0 && product.quantity > 0 ? { product, quantity: Math.min(product.quantity, item.quantity) } : null;
        }).filter(Boolean) as CartLine[]);
      }
    } catch { /* An unreadable cart simply starts empty. */ }
    setReady(true);
    // The cart is hydrated once from browser storage, then kept in sync locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (!ready) return; try { localStorage.setItem("kings-cart", JSON.stringify(cart.map(line => ({ id: line.product.id, quantity: line.quantity })))); } catch { /* Checkout still works without browser storage. */ } }, [cart, ready]);

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0), [cart]);
  const shipping = deliveryOption ? deliveryCost(subtotal, deliveryOption) : 0;
  const total = subtotal + shipping;
  const units = cart.reduce((sum, line) => sum + line.quantity, 0);
  const selected = addresses.find(address => address.id === selectedId) || null;
  const addressReady = addressMode === "saved" ? Boolean(selected) : draft.recipientName.trim().length >= 2 && draft.line1.trim().length >= 4 && draft.suburb.trim().length >= 2 && /^\d{4}$/.test(draft.postcode.trim()) && (AU_STATES as readonly string[]).includes(draft.state);
  const deliveryReady = addressReady && !!deliveryOption;
  const detailsReady = details.name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim());
  const stepIndex = STEPS.findIndex(entry => entry.id === step);

  function adjust(id: string, delta: number) {
    setCart(current => current.map(line => line.product.id === id ? { ...line, quantity: Math.max(0, Math.min(line.product.quantity, line.quantity + delta)) } : line).filter(line => line.quantity > 0));
  }
  function openNew(existing?: SavedAddress) {
    setEditing(existing || null);
    setDraft(existing ? { label: existing.label, recipientName: existing.recipientName, line1: existing.line1, line2: existing.line2 || "", suburb: existing.suburb, state: existing.state, postcode: existing.postcode, phone: existing.phone || "" } : { ...BLANK, recipientName: details.name || customer?.name || "" });
    setAddressMode("new");
  }
  async function saveDraftAddress() {
    setBusy(true); setError("");
    try {
      const result = await requestJSON<{ addresses: SavedAddress[]; address: SavedAddress }>("/api/addresses", {
        method: "POST",
        body: JSON.stringify({ ...draft, id: editing?.id, isDefault: editing?.isDefault || addresses.length === 0 }),
      });
      setAddresses(result.addresses); setSelectedId(result.address.id); setAddressMode("saved"); setEditing(null); setDraft(BLANK);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save that address."); }
    finally { setBusy(false); }
  }
  async function removeAddress(entry: SavedAddress) {
    try { const result = await requestJSON<{ addresses: SavedAddress[] }>("/api/addresses", { method: "DELETE", body: JSON.stringify({ id: entry.id }) }); setAddresses(result.addresses); if (selectedId === entry.id) setSelectedId(result.addresses[0]?.id || null); if (!result.addresses.length) openNew(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to remove that address."); }
  }
  async function makeDefault(entry: SavedAddress) {
    try { const result = await requestJSON<{ addresses: SavedAddress[] }>("/api/addresses", { method: "PATCH", body: JSON.stringify({ id: entry.id, action: "default" }) }); setAddresses(result.addresses); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to update that address."); }
  }
  async function placeOrder() {
    setBusy(true); setError("");
    try {
      if (!deliveryOption || !deliveryReady || !detailsReady) throw new Error("Check your contact, delivery address and delivery option.");
      const payload: Record<string, unknown> = {
        customerName: details.name.trim(), email: details.email.trim(), expectedShipping: shipping, deliveryOptionId: deliveryOption.id, expectedDeliveryQuote: deliveryQuote(deliveryOption, subtotal),
        items: cart.map(line => ({ productId: line.product.id, quantity: line.quantity })),
      };
      if (addressMode === "saved" && selected) payload.addressId = selected.id;
      else { Object.assign(payload, draft); if (customer && saveAddress) payload.saveAddress = true; }
      const result = await requestJSON<{ order: PlacedOrder }>("/api/orders", { method: "POST", body: JSON.stringify(payload) });
      setOrder(result.order); setPaid(false); setCart([]);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to place this order. Please try again."); }
    finally { setBusy(false); }
  }

  if (!ready) return <main className="checkout-page"><div className="container checkout-loading"><LoaderCircle className="spin" size={26}/> Loading your cart…</div></main>;

  if (order) return <main className="checkout-page"><div className="container">
    <header className="checkout-header"><Brand surface="light"/><span className="checkout-secure"><Lock size={13}/> Secure checkout</span></header>
    <div className="checkout-success-wrap">
      <div className="order-success checkout-success"><div className="success-icon"><PackageCheck size={37}/></div>
        <span className="eyebrow">{paid ? "PAID AND PACKING SOON" : "YOUR CARDS ARE RESERVED"}</span>
        <h2>{paid ? "Payment received." : "Great cards. Great choice."}</h2>
        <p>{paid ? "We're getting your cards ready. A receipt is on its way to " : "We've reserved your cards. "}{details.email}{paid ? "." : " — choose how you'd like to pay below."}</p>
        <div className="order-confirmation"><span>Order number</span><strong>{order.orderNumber}</strong><span>Delivery service</span><strong>{order.delivery?.name ?? "Delivery"}</strong><span>Total including shipping</span><strong>{money(order.total)} AUD</strong><span className={`status-pill ${paid ? "paid-pill" : ""}`}>{paid ? "Paid" : "Awaiting payment"}</span></div>
        <div className="checkout-success-address"><MapPin size={17}/><div><span>Delivering to</span><p>{addressMode === "saved" && selected ? `${selected.recipientName}\n${describeAddress(selected)}` : `${draft.recipientName}\n${describeAddress(draft)}`}</p></div></div>
        {paid ? <div className="checkout-success-actions"><Link href={customer ? "/account" : "/cards"} className="button button-primary">{customer ? "View your orders" : "Keep exploring"} <ArrowRight size={16}/></Link><button className="button button-outline" onClick={() => window.print()}>Print receipt</button></div>
          : paymentMethod === "card" && cardAvailable && customer ? <div className="checkout-pay-now"><StripePaymentForm publishableKey={publishableKey} order={order} onPaid={() => { setPaid(true); router.refresh(); }} onError={setError}/></div>
          : <div className="bank-details checkout-bank"><div className="bank-details-intro"><Landmark size={20}/><div><strong>Send {money(order.total)} AUD to our business account.</strong><p>Include your order number <strong>{order.orderNumber}</strong> as the reference so we can match your payment.</p></div></div>
            <dl className="bank-details-grid"><div><dt>Account name</dt><dd>{BANK_DETAILS.accountName}</dd></div><div><dt>BSB</dt><dd>{BANK_DETAILS.bsb}</dd></div><div><dt>Account number</dt><dd>{BANK_DETAILS.accountNumber}</dd></div><div><dt>Reference</dt><dd><strong>{order.orderNumber}</strong></dd></div></dl>
            <p className="bank-details-note">Once payment clears your order moves to <strong>Paid</strong> and we start packing. Most Osko transfers arrive within minutes.</p>
            <div className="checkout-success-actions">{customer ? <Link href="/account" className="button button-primary">Track this order <ArrowRight size={16}/></Link> : <Link href="/account" className="button button-primary">Create an account to track it <ArrowRight size={16}/></Link>}<Link href="/cards" className="button button-outline">Keep exploring</Link></div>
            {cardAvailable && !customer && <p className="checkout-card-hint"><CreditCard size={13}/> Want to pay by card next time? <Link href="/account">Create a free account</Link> — it takes ten seconds.</p>}</div>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  </div></main>;

  if (!cart.length) return <main className="checkout-page"><div className="container">
    <header className="checkout-header"><Brand surface="light"/><Link href="/cards" className="checkout-back-link"><ArrowLeft size={14}/> Back to the shop</Link></header>
    <div className="admin-panel checkout-empty"><EmptyState icon={<ShoppingBag size={34}/>} title="Your cart is empty" description="Add a few cards and they'll be waiting for you here. Your cart is saved on this device."><Link href="/cards" className="button button-primary">Browse singles <ArrowRight size={16}/></Link></EmptyState></div>
  </div></main>;

  return <main className="checkout-page">
    <div className="container">
      <header className="checkout-header"><Brand surface="light"/><Link href="/cards" className="checkout-back-link"><ArrowLeft size={14}/> Continue shopping</Link><span className="checkout-secure"><Lock size={13}/> Secure checkout</span></header>

      <ol className="checkout-steps">{STEPS.map((entry, index) => <li key={entry.id}>
        <button className={index === stepIndex ? "current" : index < stepIndex ? "done" : ""} onClick={() => { if (index < stepIndex) { setStep(entry.id); setError(""); } }} disabled={index > stepIndex}>
          <span className="checkout-step-marker">{index < stepIndex ? <Check size={13}/> : index + 1}</span>
          <span className="checkout-step-copy"><strong>{entry.label}</strong><small>{entry.hint}</small></span>
        </button>{index < STEPS.length - 1 && <ChevronRight size={14} className="checkout-step-arrow"/>}
      </li>)}</ol>

      <div className="checkout-layout">
        <div className="checkout-flow">
          {step === "details" && <section className="checkout-card">
            <h2>Your details</h2>
            {customer ? <div className="checkout-account-note"><Crown size={18}/><div><strong>Signed in as {customer.name}</strong><p>We've filled these in for you. Saved addresses and card payment are ready to go.</p></div><Link href="/account">Manage account</Link></div>
              : <div className="checkout-account-note guest"><UserIcon/><div><strong>Checking out as a guest</strong><p>Create a free account to save addresses, pay by card, and track every order in one place.</p></div><Link href="/account">Sign in or register</Link></div>}
            <div className="checkout-fields">
              <label className="checkout-field"><span>Full name</span><input value={details.name} onChange={event => setDetails(current => ({ ...current, name: event.target.value }))} autoComplete="name" maxLength={120} placeholder="Alex Planeswalker" required/></label>
              <label className="checkout-field"><span>Email address</span><input value={details.email} type="email" onChange={event => setDetails(current => ({ ...current, email: event.target.value }))} autoComplete="email" maxLength={254} placeholder="you@example.com" required/><small>Order updates and your receipt go here.</small></label>
            </div>
            <div className="checkout-actions"><span className="checkout-step-count">Step 1 of 3</span><button className="button button-primary" disabled={!detailsReady} onClick={() => { setStep("delivery"); setError(""); }}>Continue to delivery <ArrowRight size={16}/></button></div>
          </section>}

          {step === "delivery" && <section className="checkout-card">
            <h2>Where should we send it?</h2>
            {addresses.length > 0 && <div className="checkout-address-tabs">{([{ id: "saved", label: `Saved addresses (${addresses.length})`, icon: MapPin }, { id: "new", label: editing ? "Edit address" : "Use a new address", icon: Plus }] as const).map(entry => <button key={entry.id} className={addressMode === entry.id ? "active" : ""} onClick={() => { if (entry.id === "new" && addressMode === "saved") openNew(); else { setAddressMode("saved"); setEditing(null); } }}><entry.icon size={14}/>{entry.label}</button>)}</div>}
            {addressMode === "saved" && addresses.length > 0 ? <div className="address-list">{addresses.map(entry => <label className={`address-option ${selectedId === entry.id ? "selected" : ""}`} key={entry.id}>
              <input type="radio" name="delivery-address" checked={selectedId === entry.id} onChange={() => setSelectedId(entry.id)}/>
              <span className="address-radio"/>
              <span className="address-body"><span className="address-top"><strong>{entry.label}</strong>{entry.isDefault && <em>Default</em>}</span><span className="address-lines">{entry.recipientName}<br/>{entry.line1}{entry.line2 && <>{entry.line2}<br/></>}{entry.suburb} {entry.state} {entry.postcode}{entry.phone && <> · {entry.phone}</>}</span></span>
              <span className="address-tools"><button type="button" aria-label={`Edit ${entry.label} address`} onClick={event => { event.preventDefault(); openNew(entry); }}><Pencil size={13}/></button>{!entry.isDefault && <button type="button" aria-label={`Make ${entry.label} the default address`} onClick={event => { event.preventDefault(); void makeDefault(entry); }}>Set default</button>}<button type="button" aria-label={`Remove ${entry.label} address`} onClick={event => { event.preventDefault(); void removeAddress(entry); }}><Trash2 size={13}/></button></span>
            </label>)}</div>
              : <div className="checkout-fields address-form">
                <div className="checkout-field-row"><label className="checkout-field"><span>Address label</span><input value={draft.label} maxLength={40} onChange={event => setDraft(current => ({ ...current, label: event.target.value }))} placeholder="Home, Work, Local game store…"/></label>
                  <label className="checkout-field"><span>Contact number <em>optional</em></span><input value={draft.phone || ""} maxLength={30} onChange={event => setDraft(current => ({ ...current, phone: event.target.value }))} autoComplete="tel" placeholder="04xx xxx xxx"/></label></div>
                <label className="checkout-field"><span>Recipient name</span><input value={draft.recipientName} maxLength={120} onChange={event => setDraft(current => ({ ...current, recipientName: event.target.value }))} autoComplete="name" placeholder="Who's receiving this?" required/></label>
                <label className="checkout-field"><span>Street address</span><input value={draft.line1} maxLength={160} onChange={event => setDraft(current => ({ ...current, line1: event.target.value }))} autoComplete="address-line1" placeholder="12 Collector Street" required/></label>
                <label className="checkout-field"><span>Apartment, unit, building <em>optional</em></span><input value={draft.line2 || ""} maxLength={160} onChange={event => setDraft(current => ({ ...current, line2: event.target.value }))} autoComplete="address-line2" placeholder="Unit 3"/></label>
                <div className="checkout-field-row three"><label className="checkout-field"><span>Suburb / town</span><input value={draft.suburb} maxLength={90} onChange={event => setDraft(current => ({ ...current, suburb: event.target.value }))} autoComplete="address-level2" placeholder="Melbourne" required/></label>
                  <label className="checkout-field"><span>State</span><select value={draft.state} onChange={event => setDraft(current => ({ ...current, state: event.target.value }))} autoComplete="address-level1">{AU_STATES.map(state => <option key={state}>{state}</option>)}</select></label>
                  <label className="checkout-field"><span>Postcode</span><input value={draft.postcode} inputMode="numeric" maxLength={4} onChange={event => setDraft(current => ({ ...current, postcode: event.target.value.replace(/\D/g, "").slice(0, 4) }))} autoComplete="postal-code" placeholder="3000" required/></label></div>
                {customer && <label className="checkout-checkbox"><input type="checkbox" checked={saveAddress} onChange={event => setSaveAddress(event.target.checked)}/><span><strong>{editing ? "Update this saved address" : "Save this address for next time"}</strong><small>You can manage saved addresses any time in your account.</small></span></label>}
                <div className="checkout-address-actions">{editing && <button className="button button-outline" onClick={() => { setEditing(null); setDraft(BLANK); setAddressMode(addresses.length ? "saved" : "new"); }}>Cancel edit</button>}<button className="button button-primary" disabled={busy || !deliveryReady} onClick={saveDraftAddress}>{busy ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>} {editing ? "Update address" : "Save & use this address"}</button></div>
              </div>}
            <fieldset className="checkout-delivery-options"><legend>Choose delivery</legend>{availableDelivery.length ? availableDelivery.map(option=><label key={option.id} className={`checkout-delivery-option ${deliveryId===option.id ? "selected" : ""}`}><input type="radio" name="delivery-option" value={option.id} checked={deliveryId===option.id} onChange={()=>setDeliveryId(option.id)}/><span><strong>{option.name}</strong>{option.description && <small>{option.description}</small>}{option.freeAbove!==null && option.price>0 && <small>Free on orders of {money(option.freeAbove)} or more</small>}</span><b>{deliveryCost(subtotal,option)===0 ? "Free":money(deliveryCost(subtotal,option))}</b></label>):<p role="alert">Delivery is currently unavailable. Please contact the store before ordering.</p>}</fieldset>
            {deliveryOption && <div className="checkout-shipping-note"><Truck size={16}/><span>{deliveryOption.name}. {shipping===0 ? "No delivery charge for this option.":FREE_SHIPPING_THRESHOLD!==null ? `${money(Math.max(0,FREE_SHIPPING_THRESHOLD-subtotal))} more for free delivery with this option.`:`Delivery ${money(shipping)}.`}</span></div>}
            <div className="checkout-actions"><button className="button button-ghost" onClick={() => setStep("details")}><ArrowLeft size={15}/> Back</button><span className="checkout-step-count">Step 2 of 3</span><button className="button button-primary" disabled={!deliveryReady} onClick={() => { setStep("payment"); setError(""); }}>Continue to payment <ArrowRight size={16}/></button></div>
          </section>}

          {step === "payment" && <section className="checkout-card">
            <h2>How would you like to pay?</h2>
            <div className="checkout-pay-options">
              <button className={`checkout-pay-option ${paymentMethod === "card" ? "active" : ""}`} disabled={!cardAvailable || !customer} onClick={() => setPaymentMethod("card")}>
                <CreditCard size={19}/><span className="checkout-pay-copy"><strong>Pay by card</strong><small>Visa, Mastercard, Amex · 3D Secure · Instant confirmation</small></span>
                {!cardAvailable ? <em className="soon">Coming soon</em> : !customer ? <em className="soon">Account required</em> : <em className="recommended">Recommended</em>}
              </button>
              <button className={`checkout-pay-option ${paymentMethod === "bank" ? "active" : ""}`} onClick={() => setPaymentMethod("bank")}>
                <Landmark size={19}/><span className="checkout-pay-copy"><strong>Bank transfer</strong><small>BPay / Osko · No card fees · Pay after you reserve</small></span><em className="free">Fee-free</em>
              </button>
            </div>
            {paymentMethod === "card" && customer && <div className="checkout-card-note"><ShieldCheck size={16}/><p>Your cards are reserved first, then you'll complete a secure Stripe payment on the next screen. We never see or store your card details.</p></div>}
            {paymentMethod === "bank" && <div className="checkout-card-note"><Landmark size={16}/><p>Place your order to reserve these cards. You'll get our account details and your order number to use as the reference — most Osko transfers clear within minutes.</p></div>}
            <div className="checkout-review">
              <h3>Review your order</h3>
              <div className="checkout-review-grid">
                <div><span>Contact</span><strong>{details.name}</strong><small>{details.email}</small></div>
                <div><span>Delivering to</span><strong>{addressMode === "saved" && selected ? selected.recipientName : draft.recipientName}</strong><small>{addressMode === "saved" && selected ? describeAddress(selected) : describeAddress(draft)}</small></div>
                <div><span>Cards</span><strong>{units} across {cart.length} {cart.length === 1 ? "line" : "lines"}</strong><small>{deliveryOption ? `${deliveryOption.name} · ${shipping === 0 ? "Free" : money(shipping)}` : "Choose delivery"}</small></div>
                <div><span>Total</span><strong className="checkout-review-total">{money(total)}</strong><small>AUD, including shipping</small></div>
              </div>
              <div className="checkout-review-actions"><button className="checkout-edit-link" onClick={() => setStep("details")}><Pencil size={12}/> Edit details</button><button className="checkout-edit-link" onClick={() => setStep("delivery")}><Pencil size={12}/> Edit delivery</button></div>
            </div>
            {error && <p className="form-error" role="alert"><AlertCircle size={14}/>{error}</p>}
            <div className="checkout-actions"><button className="button button-ghost" onClick={() => setStep("delivery")}><ArrowLeft size={15}/> Back</button><span className="checkout-step-count">Step 3 of 3</span><button className="button button-primary checkout-place" disabled={busy || !deliveryReady || !detailsReady} onClick={placeOrder}>{busy ? <LoaderCircle className="spin" size={17}/> : <Lock size={16}/>} {busy ? "Reserving your cards…" : `Place order · ${money(total)}`}</button></div>
          </section>}
        </div>

        <aside className="checkout-summary">
          <h3>Order summary <span>{units} {units === 1 ? "card" : "cards"}</span></h3>
          <div className="checkout-summary-lines">{cart.map(line => <div className="checkout-summary-line" key={line.product.id}>
            <img src={line.product.imageUrl} alt=""/>
            <div><strong>{line.product.name}</strong><small>{line.product.condition} · {line.product.finish}</small>
              <div className="checkout-line-controls"><button onClick={() => adjust(line.product.id, -1)} aria-label={`Decrease ${line.product.name}`}><Minus size={11}/></button><span>{line.quantity}</span><button onClick={() => adjust(line.product.id, 1)} disabled={line.quantity >= line.product.quantity} aria-label={`Increase ${line.product.name}`}><Plus size={11}/></button><button className="checkout-line-remove" onClick={() => adjust(line.product.id, -line.quantity)} aria-label={`Remove ${line.product.name}`}><X size={11}/></button></div>
            </div><b>{money(line.product.price * line.quantity)}</b></div>)}</div>
          <div className="checkout-summary-totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>{deliveryOption?.name ?? "Delivery"}</span><strong>{!deliveryOption ? "Unavailable" : shipping ? money(shipping) : <em>Free</em>}</strong></div>{shipping > 0 && FREE_SHIPPING_THRESHOLD !== null && <small className="checkout-progress-hint">{money((FREE_SHIPPING_THRESHOLD ?? 0) - subtotal)} more for free shipping</small>}<div className="checkout-summary-total"><span>Total</span><strong>{money(total)} <i>AUD</i></strong></div></div>
          <div className="checkout-trust"><span><ShieldCheck size={13}/> Condition graded honestly</span><span><Truck size={13}/> Australian delivery options</span><span><Lock size={13}/> We never store card details</span></div>
        </aside>
      </div>
    </div>
  </main>;
}
function UserIcon() { return <Crown size={18}/>; }
