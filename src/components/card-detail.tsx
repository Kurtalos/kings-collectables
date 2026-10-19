"use client";
import { useState } from "react";
import Link from "next/link";
import { Heart, Bell, Plus, ShoppingBag, Check, ChevronRight, Layers } from "lucide-react";
import { CardQuickView } from "./product-card";
import { EmptyState } from "./ui";
import { money, type Card } from "@/lib/types";

const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

export function CardDetail({ card, printings, saved, watched, onSave, onWatch, onAdd }: {
  card: Card; printings: Card[]; saved: string[]; watched: string[];
  onSave: (card: Card) => void; onWatch: (card: Card) => void; onAdd: (card: Card, quantity?: number) => void;
}) {
  const [quickView, setQuickView] = useState<Card | null>(null);
  // Show an in-stock printing first so the hero is something customers can actually buy.
  const hero = printings.find(printing => printing.quantity > 0) || printings[0] || card;

  const grouped: [string, Card[]][] = [];
  for (const printing of printings) {
    const last = grouped[grouped.length - 1];
    if (last && last[0] === printing.setName) last[1].push(printing);
    else grouped.push([printing.setName, [printing]]);
  }

  const inStockCount = printings.filter(printing => printing.quantity > 0).length;
  const priced = printings.filter(printing => printing.quantity > 0 && printing.price > 0);
  const lowest = priced.length ? Math.min(...priced.map(printing => printing.price)) : 0;

  if (!printings.length) {
    return <main className="container card-detail"><EmptyState icon={<Layers size={32}/>} title="No printings found" description="This card isn't in our catalogue yet."><Link href="/cards" className="button button-primary">Browse singles</Link></EmptyState></main>;
  }

  return (
    <main className="container card-detail">
      <div className="breadcrumbs">
        <Link href="/">Home</Link>
        <ChevronRight size={12}/>
        <Link href="/cards">Shop singles</Link>
        <ChevronRight size={12}/>
        <span>{card.name}</span>
      </div>

      <section className="card-detail-hero">
        <button className="card-detail-image" onClick={() => setQuickView(hero)} aria-label={`View ${hero.name} up close`}>
          <img src={hero.imageUrl} alt={`${hero.name} — ${hero.setName}`}/>
          <span className="card-detail-image-hint"><ShoppingBag size={13}/> A closer look</span>
        </button>
        <div className="card-detail-info">
          <span className="eyebrow">MAGIC: THE GATHERING</span>
          <h1>{card.name}</h1>
          <p className="card-detail-type">{hero.typeLine}</p>
          {hero.manaCost && <p className="card-detail-mana">{hero.manaCost}</p>}
          {hero.colors.length > 0 && (
            <div className="card-detail-colors">
              {hero.colors.map(color => <span key={color} className={`mana-dot mana-${color}`} title={COLOR_NAMES[color] || color}>{color}</span>)}
            </div>
          )}
          {hero.oracleText && <div className="card-detail-text"><p>{hero.oracleText}</p></div>}
          <div className="card-detail-meta">
            <div><span>Rarity</span><strong className="capitalize">{hero.rarity}</strong></div>
            <div><span>Printings</span><strong>{printings.length}</strong></div>
            <div><span>In stock</span><strong>{inStockCount}</strong></div>
            {lowest > 0 && <div><span>From</span><strong>{money(lowest)}</strong></div>}
          </div>
          <div className="card-detail-actions">
            <button className="button button-primary" onClick={() => setQuickView(hero)}><ShoppingBag size={16}/> View & add to cart</button>
          </div>
        </div>
      </section>

      <section className="card-printings">
        <div className="section-heading">
          <div><span className="eyebrow">EVERY PRINTING</span><h2>All printings of {card.name}</h2></div>
          <span className="catalogue-total">{printings.length} printings <span>✧</span></span>
        </div>
        {grouped.map(([setName, items]) => (
          <div className="printing-set" key={setName}>
            <h3>{setName} <span>{items.length} {items.length === 1 ? "printing" : "printings"}</span></h3>
            <div className="printing-rows">
              {items.map(printing => (
                <div className={`printing-row ${printing.quantity > 0 ? "" : "printing-out"}`} key={printing.id}>
                  <button className="printing-thumb" onClick={() => setQuickView(printing)} aria-label={`View ${printing.name} from ${printing.setName} up close`}>
                    <img src={printing.imageUrl} alt={printing.name} loading="lazy"/>
                  </button>
                  <div className="printing-info">
                    <strong>{printing.setName}</strong>
                    <small>#{printing.collectorNumber} · {printing.condition} · {printing.finish}</small>
                  </div>
                  <div className="printing-price">{printing.quantity > 0 ? money(printing.price) : "—"}</div>
                  <div className={`printing-stock ${printing.quantity > 0 ? "in" : "out"}`}>{printing.quantity > 0 ? `${printing.quantity} in stock` : "Out of stock"}</div>
                  <div className="printing-actions">
                    <button className={`save-card ${saved.includes(printing.id) ? "is-saved" : ""}`} onClick={() => onSave(printing)} aria-label={`${saved.includes(printing.id) ? "Remove" : "Save"} ${printing.name} ${saved.includes(printing.id) ? "from" : "to"} wishlist`}><Heart size={14} fill={saved.includes(printing.id) ? "currentColor" : "none"}/></button>
                    <button className={`save-card watch-card ${watched.includes(printing.id) ? "is-saved" : ""}`} onClick={() => onWatch(printing)} aria-label={`${watched.includes(printing.id) ? "Stop watching" : "Watch"} ${printing.name}`}><Bell size={13} fill={watched.includes(printing.id) ? "currentColor" : "none"}/></button>
                    <button className="add-card-button" onClick={() => onAdd(printing)} disabled={!printing.quantity}><Plus size={14}/> Add</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {quickView && (
        <CardQuickView
          card={resolveCard(quickView, printings)}
          saved={saved.includes(quickView.id)}
          watching={watched.includes(quickView.id)}
          onClose={() => setQuickView(null)}
          onSave={() => onSave(quickView)}
          onWatch={() => onWatch(quickView)}
          onAdd={quantity => { onAdd(quickView, quantity); setQuickView(null); }}
        />
      )}
    </main>
  );
}

function resolveCard(card: Card, printings: Card[]): Card {
  return printings.find(printing => printing.id === card.id) || card;
}
