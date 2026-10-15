"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { CreditCard, LoaderCircle, Check, AlertCircle, ShieldCheck } from "lucide-react";
import { requestJSON } from "./ui";
import { money } from "@/lib/types";

const stripeInstances = new Map<string, Promise<Stripe | null>>();
function loadStripeClient(publishableKey: string) {
  let promise = stripeInstances.get(publishableKey);
  if (!promise) { promise = loadStripe(publishableKey); stripeInstances.set(publishableKey, promise); }
  return promise;
}

export function StripePaymentForm({ publishableKey, order, onPaid, onError }: { publishableKey: string; order: { id: string; orderNumber: string; total: number }; onPaid: (receipt: string) => void; onError: (message: string) => void }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState(false), [lastReceipt, setLastReceipt] = useState<string | null>(null), [mounted, setMounted] = useState(false);
  const stripeRef = useRef<Stripe | null>(null), elementsRef = useRef<StripeElements | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBusy(true); setError(""); setMounted(false);
    (async () => {
      try {
        const stripe = await loadStripeClient(publishableKey);
        if (!stripe) throw new Error("Stripe could not be loaded. Please try Bank Transfer.");
        stripeRef.current = stripe;
        const result = await requestJSON<{ clientSecret: string }>(`/api/payments/stripe`, { method: "POST", body: JSON.stringify({ orderId: order.id }) });
        if (cancelled) return;
        setClientSecret(result.clientSecret);
        const elements = stripe.elements({ clientSecret: result.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#f26b0a", colorText: "#141414", colorBackground: "#ffffff", colorDanger: "#d45504", fontFamily: "Manrope, system-ui, sans-serif", spacingUnit: "3px", borderRadius: "6px" }, rules: { ".Input": { border: "1px solid #e4ddd3", boxShadow: "none" }, ".Input:focus": { border: "1px solid #f26b0a", boxShadow: "0 0 0 3px rgba(242,107,10,0.12)" }, ".Tab": { border: "1px solid #e4ddd3" }, ".Tab--selected": { background: "#fff8f1", border: "1px solid #f26b0a" } } } });
        elementsRef.current = elements;
        if (mountRef.current) { const payment = elements.create("payment"); payment.mount(mountRef.current); setMounted(true); }
      } catch (error) {
        if (!cancelled) onError(error instanceof Error ? error.message : "Unable to start card payment. Please choose Bank Transfer.");
      } finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  // Stripe instance is created once per order; subsequent renders reuse it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, publishableKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const stripe = stripeRef.current, elements = elementsRef.current;
    if (!stripe || !elements || !clientSecret) return;
    setBusy(true); setError("");
    try {
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: typeof window !== "undefined" ? `${window.location.origin}/account` : "" }, redirect: "if_required" });
      if (result.error) { setError(result.error.message || "Payment was declined. Please try another card."); return; }
      const intent = result.paymentIntent;
      if (!intent) { setError("Payment could not be confirmed. Please contact the store."); return; }
      if (intent.status === "succeeded" || intent.status === "processing") { setSuccess(true); setLastReceipt(intent.id); onPaid(intent.id); }
      else setError("Payment did not complete. Please try again.");
    } catch (error) { setError(error instanceof Error ? error.message : "Payment failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <form className="stripe-form" onSubmit={submit}>
    <div className="stripe-element"><CreditCard size={16}/><span>Card details are handled securely by Stripe.</span></div>
    <div ref={mountRef} className="stripe-element-host">{busy && !mounted && <div className="stripe-loading"><LoaderCircle className="spin" size={16}/> Preparing secure checkout…</div>}</div>
    {error && <p className="form-error" role="alert"><AlertCircle size={14}/>{error}</p>}
    {success && <p className="form-success"><Check size={14}/> Payment received. Your cards are on their way.{lastReceipt && <small>Reference {lastReceipt}</small>}</p>}
    <button className="button button-primary full-width" disabled={busy || success || !mounted}>{busy ? <LoaderCircle className="spin" size={17}/> : success ? <Check size={17}/> : <CreditCard size={17}/>} {busy ? "Processing…" : success ? "Payment complete" : `Pay ${money(order.total)} AUD`}</button>
    <p className="stripe-fineprint"><ShieldCheck size={11}/> 3D Secure verified · Encrypted by Stripe · You never share your card with us.</p>
  </form>;
}
