"use client";
import Link from "next/link";
import { Heart, Plus, Check, Minus, ShoppingBag, ArrowUpRight, Bell } from "lucide-react";
import { useState } from "react";
import { Modal } from "./ui";
import { money, type Card } from "@/lib/types";

/** Card title links to the full card page; the image opens the quick-view dialog. */
export function ProductCard({ card, saved, watching = false, onSave, onWatch, onAdd, onView, list = false }: { card: Card; saved: boolean; watching?: boolean; onSave: () => void; onWatch?: () => void; onAdd: () => void; onView: () => void; list?: boolean }) {
  return (
    <article className={`product-card ${list ? "product-list-card" : ""}`}>
      <div className="product-image-area">
        <button className="product-image-button" onClick={onView} aria-label={`View ${card.name} up close`}>
          <img src={card.imageUrl} alt={`${card.name} — ${card.setName}`} loading="lazy"/>
        </button>
        {card.finish !== "Non-foil" && <span className="product-tag foil-tag">✧ {card.finish}</span>}
        {card.finish === "Non-foil" && card.featured && <span className="product-tag">KING'S PICK</span>}
        <div className="card-flags">
          <button className={`save-card ${saved ? "is-saved" : ""}`} onClick={onSave} aria-label={`${saved ? "Remove" : "Save"} ${card.name} ${saved ? "from" : "to"} wishlist`}>
            <Heart size={16} fill={saved ? "currentColor" : "none"}/>
          </button>
          {onWatch && (
            <button className={`save-card watch-card ${watching ? "is-saved" : ""}`} onClick={onWatch} aria-label={`${watching ? "Stop watching" : "Watch"} ${card.name}`}>
              <Bell size={15} fill={watching ? "currentColor" : "none"}/>
            </button>
          )}
        </div>
      </div>
      <div className="product-details">
        <Link className="product-title" href={`/cards/${card.scryfallId}`}>{card.name}</Link>
        <p className="product-set">{card.setName}</p>
        <div className="product-variant">
          <span>{card.condition === "Near mint" ? "Near Mint" : card.condition}</span>
          <span className="variant-dot">·</span>
          <span>{card.finish}</span>
        </div>
        <div className="product-price-row">
          <strong>{money(card.price)}</strong>
          <span className={card.quantity ? "stock-label" : "stock-label sold-out"}><i/>{card.quantity ? `${card.quantity} in stock` : "Out of stock"}</span>
        </div>
        <button className="add-card-button" onClick={onAdd} disabled={!card.quantity}>
          <Plus size={15}/>{card.quantity ? "Add to cart" : "Sold out"}
        </button>
      </div>
    </article>
  );
}

export function CardQuickView({ card, saved, watching = false, onClose, onSave, onWatch, onAdd }: { card: Card; saved: boolean; watching?: boolean; onClose: () => void; onSave: () => void; onWatch?: () => void; onAdd: (quantity: number) => void }) {
  const [quantity, setQuantity] = useState(1), [added, setAdded] = useState(false);
  return (
    <Modal title="A closer look" onClose={onClose} wide>
      <div className="quickview">
        <div className="quickview-image">
          <img src={card.imageUrl} alt={card.name}/>
          <span>#{card.collectorNumber} · {card.setCode.toUpperCase()}</span>
        </div>
        <div className="quickview-details">
          <span className="eyebrow">MAGIC: THE GATHERING</span>
          <h2>{card.name}</h2>
          <p className="quickview-set">{card.setName}</p>
          <div className="quickview-price">{money(card.price)} <small>AUD</small></div>
          <div className="quickview-attributes">
            <div><span>Condition</span><strong>{card.condition}</strong></div>
            <div><span>Finish</span><strong>{card.finish}</strong></div>
            <div><span>Rarity</span><strong className="capitalize">{card.rarity}</strong></div>
            <div><span>Availability</span><strong className="stock-label">{card.quantity ? `${card.quantity} in stock` : "Sold out"}</strong></div>
          </div>
          <div className="card-rules">
            <strong>{card.typeLine}</strong>
            <p>{card.oracleText}</p>
          </div>
          <div className="quickview-buy">
            <div className="quantity-control">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1} aria-label="Decrease quantity"><Minus size={14}/></button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity(Math.min(card.quantity, quantity + 1))} disabled={quantity >= card.quantity} aria-label="Increase quantity"><Plus size={14}/></button>
            </div>
            <button className="button button-primary" disabled={!card.quantity} onClick={() => { onAdd(quantity); setAdded(true); setTimeout(() => setAdded(false), 1800); }}>
              {added ? <Check size={17}/> : <ShoppingBag size={17}/>} {added ? "Added to cart" : "Add to cart"}
            </button>
          </div>
          <div className="quickview-list-actions">
            <button className="quickview-wishlist" onClick={onSave}>
              <Heart size={15} fill={saved ? "currentColor" : "none"}/>{saved ? "Saved to your wishlist" : "Save to wishlist"}
            </button>
            {onWatch && (
              <button className="quickview-wishlist" onClick={onWatch}>
                <Bell size={15} fill={watching ? "currentColor" : "none"}/>{watching ? "Watching this card" : "Watch for restock"}
              </button>
            )}
          </div>
          <p className="quickview-note">Carefully checked. Securely packed. Sent from Australia.</p>
          <Link className="section-link" href={`/cards/${card.scryfallId}`}>See all printings of this card <ArrowUpRight size={13}/></Link>
        </div>
      </div>
    </Modal>
  );
}
