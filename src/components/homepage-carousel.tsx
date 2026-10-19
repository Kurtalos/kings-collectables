"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useStoreSettings } from "./store-settings-provider";
import type { CarouselSlide } from "@/lib/homepage-carousel";
export function HomepageCarousel({ slides, preview = false }: { slides: CarouselSlide[]; preview?: boolean }) {
  const settings = useStoreSettings();
  const [index, setIndex] = useState(0);
  const active = Math.min(index, slides.length - 1), hero = slides[active];
  if (!hero) return null;
  return <section className={`hero ${preview ? "carousel-preview" : ""}`} aria-label={preview ? "Slide preview" : "Featured collections"} aria-roledescription="carousel">
    <div className="hero-art" key={hero.image} style={{ backgroundImage: `url("${hero.image}")`, backgroundPosition: `${hero.focalX}% ${hero.focalY}%` }}/><div className="hero-shade"/>
    <div className="hero-content"><span className="hero-eyebrow"><Sparkles size={15}/>{hero.eyebrow || settings.storeName.toUpperCase()}</span><h1 style={{ whiteSpace: "pre-line" }}>{hero.title}</h1><p>{hero.description}</p><div className="hero-actions">
      {hero.primary && hero.href && (preview ? <span className="button hero-button">{hero.primary}<ArrowRight size={17}/></span> : <Link href={hero.href} className="button hero-button">{hero.primary}<ArrowRight size={17}/></Link>)}
      {hero.secondary && hero.secondHref && (preview ? <span className="hero-secondary">{hero.secondary}<ArrowUpRight size={14}/></span> : <Link className="hero-secondary" href={hero.secondHref}>{hero.secondary}<ArrowUpRight size={14}/></Link>)}
    </div></div>
    {!preview && slides.length > 1 && <div className="hero-slide-controls"><div className="hero-dots">{slides.map((item, i) => <button key={item.id} className={active === i ? "active" : ""} aria-label={`View promotion ${i + 1}`} aria-pressed={active === i} onClick={() => setIndex(i)}/>)}</div><span className="slide-number">{String(active + 1).padStart(2, "0")}<i>/</i>{String(slides.length).padStart(2, "0")}</span><button aria-label="Previous promotion" onClick={() => setIndex((active + slides.length - 1) % slides.length)}><ChevronLeft size={17}/></button><button aria-label="Next promotion" onClick={() => setIndex((active + 1) % slides.length)}><ChevronRight size={17}/></button></div>}
    <div className="hero-art-note">{preview ? "PREVIEW · NOT YET SAVED" : "YOUR NEXT ADVENTURE AWAITS"}<span>♔</span></div>
  </section>;
}
