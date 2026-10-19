"use client";
import { useStoreSettings } from "./store-settings-provider";
import { shippingCost } from "@/lib/store-settings";
import Link from "next/link";
import { ArrowRight, ShoppingBag, Truck, Minus, Plus, Trash2, ShieldCheck, Check, Crown } from "lucide-react";
import { Modal, EmptyState } from "./ui";
import { money } from "@/lib/types";
import type { CartLine, Customer } from "@/lib/types";

export function CartDrawer({ cart, customer, onClose, onAdjust, onRemove }: { cart: CartLine[]; customer?: Customer | null; onClose: () => void; onAdjust: (id: string, delta: number) => void; onRemove: (id: string) => void }) {
  const settings = useStoreSettings();
  const FREE_SHIPPING_THRESHOLD = settings.freeShippingThreshold;
  const subtotal = cart.reduce((sum, line) => sum + line.quantity * line.product.price, 0);
  const shipping = shippingCost(subtotal, settings);
  return <Modal title={`Your cart (${cart.reduce((sum, line) => sum + line.quantity, 0)})`} onClose={onClose} drawer>
    {!cart.length ? <EmptyState icon={<ShoppingBag size={35}/>} title="Your next great deck is waiting" description="Add a few favourites and make a little room in your collection."><Link href="/cards" className="button button-primary" onClick={onClose}>Explore singles <ArrowRight size={16}/></Link></EmptyState>
      : <div className="cart-content">
        {(FREE_SHIPPING_THRESHOLD !== null || shipping === 0) && <div className="shipping-progress"><div><Truck size={17}/><span>{shipping === 0 ? "You've unlocked free tracked shipping!" : <>{money((FREE_SHIPPING_THRESHOLD ?? 0) - subtotal)} away from free shipping</>}</span>{shipping === 0 && <Check size={15}/>}</div><span className="progress-track"><i style={{ width: `${Math.min(100, (FREE_SHIPPING_THRESHOLD ? subtotal / FREE_SHIPPING_THRESHOLD : 1) * 100)}%` }}/></span></div>}
        <div className="cart-lines">{cart.map(line => <div className="cart-line" key={line.product.id}>
          <img src={line.product.imageUrl} alt={line.product.name}/>
          <div className="cart-line-info"><strong>{line.product.name}</strong><span>{line.product.setName}</span><small>{line.product.condition} · {line.product.finish}</small>
            <div className="cart-line-bottom"><div className="quantity-control"><button onClick={() => onAdjust(line.product.id, -1)} aria-label={`Decrease ${line.product.name} quantity`}><Minus size={13}/></button><span>{line.quantity}</span><button onClick={() => onAdjust(line.product.id, 1)} disabled={line.quantity >= line.product.quantity} aria-label={`Increase ${line.product.name} quantity`}><Plus size={13}/></button></div><b>{money(line.product.price * line.quantity)}</b></div>
          </div>
          <button className="remove-line icon-button" aria-label={`Remove ${line.product.name}`} onClick={() => onRemove(line.product.id)}><Trash2 size={15}/></button>
        </div>)}</div>
        <div className="cart-bottom">
          <div className="cart-totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Tracked shipping</span><span>{shipping ? money(shipping) : <b className="free-shipping">Free</b>}</span></div><div className="cart-total"><strong>Total</strong><strong>{money(subtotal + shipping)} <small>AUD</small></strong></div></div>
          <Link href="/checkout" className="button button-primary full-width" onClick={onClose}>Continue to checkout <ArrowRight size={17}/></Link>
          <div className="cart-reassurance-row"><span className="cart-reassurance"><ShieldCheck size={14}/> Carefully packed. Always tracked.</span>{!customer && <Link href="/account" className="cart-reassurance cart-account-hint"><Crown size={14}/> Sign in for saved addresses</Link>}</div>
        </div>
      </div>}
  </Modal>;
}
