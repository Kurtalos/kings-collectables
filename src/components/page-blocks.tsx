"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Truck, BadgeCheck, Heart, Package } from "lucide-react";
import { type ContentPage, type RichNode } from "@/lib/pages";
import { SHOP_SETS } from "@/lib/store-config";
import { money, type Card, type Collection } from "@/lib/types";
import { shippingMessage } from "@/lib/store-settings";
import { ProductCard } from "./product-card";
import { HomepageCarousel } from "./homepage-carousel";
import { StoreBusinessDetails } from "./store-business-details";
import { useStoreSettings, useHomepageCarousel } from "./store-settings-provider";
export function RichContent({ doc }: { doc: RichNode }) {
  function node(value: RichNode, key: number): ReactNode {
    const children = value.content?.map(node);
    if (value.type === "text") {
      let text: ReactNode = value.text;
      value.marks?.forEach(mark => { text = mark.type === "bold" ? <strong>{text}</strong> : mark.type === "italic" ? <em>{text}</em> : mark.type === "underline" ? <u>{text}</u> : mark.type === "strike" ? <s>{text}</s> : mark.type === "link" ? <a href={mark.attrs?.href} rel="noopener noreferrer">{text}</a> : text; });
      return <span key={key}>{text}</span>;
    }
    switch (value.type) {
      case "doc": return <div key={key}>{children}</div>;
      case "heading": return value.attrs?.level === 3 ? <h3 key={key}>{children}</h3> : <h2 key={key}>{children}</h2>;
      case "paragraph": return <p key={key}>{children?.length ? children : <br/>}</p>;
      case "bulletList": return <ul key={key}>{children}</ul>;
      case "orderedList": return <ol key={key}>{children}</ol>;
      case "listItem": return <li key={key}>{children}</li>;
      case "blockquote": return <blockquote key={key}>{children}</blockquote>;
      case "hardBreak": return <br key={key}/>;
      case "horizontalRule": return <hr key={key}/>;
      default: return null;
    }
  }
  return <div className="page-rich-content">{node(doc, 0)}</div>;
}
export function PageBlocks({ page, products, collections, renderCard, onContact, preview = false }: { page: ContentPage; products: Card[]; collections: Collection[]; renderCard?: (card: Card) => ReactNode; onContact?: () => void; preview?: boolean }) {
  const settings = useStoreSettings(), slides = useHomepageCarousel();
  return <div className={`content-page ${preview ? "content-page-preview" : ""}`} onClickCapture={preview ? e => { e.preventDefault(); e.stopPropagation(); } : undefined}>
    {page.slug !== "home" && <header className="content-page-title"><h1>{page.title}</h1></header>}
    {page.blocks.filter(block => block.enabled).map(block => {
      const heading = block.title && <h2>{block.title}</h2>;
      const body = <RichContent doc={block.body}/>;
      const button = block.button && block.href && <Link className="button button-primary" href={block.href}>{block.button}<ArrowRight size={16}/></Link>;
      switch (block.type) {
        case "carousel": return <HomepageCarousel key={block.id} slides={slides} preview={preview}/>;
        case "rich": return <section key={block.id} className="page-section page-text">{heading}{body}{button}</section>;
        case "banner": return <section key={block.id} className="page-section page-banner">{heading}{body}{button}</section>;
        case "image": return <section key={block.id} className={`page-section page-image-text image-${block.alignment}`}><img loading="lazy" src={block.image} alt={block.alt}/><div>{heading}{body}{button}</div></section>;
        case "contact": return <section key={block.id} className="page-section page-contact">{heading}<StoreBusinessDetails/><button type="button" className="button button-primary" onClick={onContact}>Send the store a message</button></section>;
        case "shipping": return <section key={block.id} className="page-section page-text">{heading}<p>Standard tracked delivery within Australia: <strong>{settings.shippingFlat === 0 ? "Free" : money(settings.shippingFlat)}</strong>.</p><p>{shippingMessage(settings)}.</p></section>;
        case "benefits": return <section key={block.id} className="store-benefits page-section"><span><Truck size={24}/>{shippingMessage(settings)}</span><span><BadgeCheck size={24}/>Condition you can trust</span><span><Package size={24}/>Carefully packed</span><span><Heart size={24}/>Independent & Australian</span></section>;
        case "collections": {
          const groups = collections.filter(c => ["all", "featured"].includes(block.source) || c.slug === block.source).slice(0, block.limit);
          return <section key={block.id} className="page-section">{heading}<div className="page-collections">{groups.map(group => <Link key={group.id} href={`/cards?category=${group.slug}`}><h3>{group.name}</h3><p>{group.description}</p><span>{group.count} printings →</span></Link>)}</div></section>;
        }
        case "products": {
          const group = collections.find(c => c.slug === block.source);
          const cards = products.filter(card => block.source === "featured" ? card.featured : block.source === "newest" ? true : group && card.categoryIds.includes(group.id)).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, block.limit);
          return <section key={block.id} className="page-section">{heading}{cards.length ? <div className="product-grid home-product-grid">{cards.map(card => renderCard ? renderCard(card) : <ProductCard key={card.id} card={card} saved={false} watching={false} onSave={() => {}} onWatch={() => {}} onAdd={() => {}} onView={() => {}}/>)}</div> : <p className="muted">No cards are currently available in this selection.</p>}</section>;
        }
        case "sets": return <section key={block.id} className="page-section">{heading}<div className="set-grid">{SHOP_SETS.map(set => <Link className={`set-card set-${set.code}`} key={set.code} href={`/cards?set=${set.code}`}><img className="set-art" src={set.image} alt=""/><div className="set-card-shade"/><div className="set-card-copy"><h3>{set.name}</h3><span>{set.subtitle}</span></div></Link>)}</div></section>;
        case "discovery": return <section key={block.id} className="page-section page-collections"><Link href="/cards?category=commander-staples"><h2>Made for your Commander table.</h2><p>Find your next staple →</p></Link><Link href="/cards?category=under-5"><h2>A little change. A big deck upgrade.</h2><p>Discover cards under $5 →</p></Link></section>;
      }
    })}
  </div>;
}
