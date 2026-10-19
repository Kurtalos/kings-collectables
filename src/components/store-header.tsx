"use client";
import { useStoreSettings, usePageNavigation } from "./store-settings-provider";
import { shippingMessage } from "@/lib/store-settings";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { Search, Heart, ShoppingBag, UserRound, ChevronDown, ArrowUpRight, ArrowRight, Sparkles, Flame, Menu, X, Settings2, Wand2, LoaderCircle } from "lucide-react";
import { Brand, ThemeMotif } from "./ui";
import { SHOP_SETS } from "@/lib/store-config";
import { money, type Card } from "@/lib/types";

export function StoreHeader({ products, cartCount, wishlistCount, customerName, onCart, onWishlist, onAbout, initialQuery = "" }: { products: Card[]; cartCount: number; wishlistCount: number; customerName?: string; onCart: () => void; onWishlist: () => void; onAbout: () => void; initialQuery?: string }) {
  const router = useRouter(), path = usePathname();
  const settings = useStoreSettings();
  const pageLinks = usePageNavigation().filter(page => page.inHeader);
  const [query, setQuery] = useState(initialQuery), [focused, setFocused] = useState(false), [setMenu, setSetMenu] = useState(false), [mobileNav, setMobileNav] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(initialQuery); }, [initialQuery]);

  useEffect(() => {
    function outside(event: MouseEvent) { 
      if (!menuRef.current?.contains(event.target as Node)) setSetMenu(false); 
      if (!searchRef.current?.contains(event.target as Node)) setFocused(false); 
    }
    document.addEventListener("mousedown", outside); 
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  // Live database search across all 110,000+ cards
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    // Quick instant local match while network loads
    const instantLocal = products.filter(card => 
      `${card.name} ${card.setName} ${card.setCode}`.toLowerCase().includes(trimmed.toLowerCase())
    ).slice(0, 6);
    if (instantLocal.length > 0) {
      setSuggestions(instantLocal);
    }

    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.cards) && data.cards.length > 0) {
            setSuggestions(data.cards);
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Search fetch error:", err);
        }
      } finally {
        setSearching(false);
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, products]);

  function submit(event: FormEvent) {
    event.preventDefault(); 
    setFocused(false); 
    if (query.trim()) {
      router.push(`/cards?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push("/cards");
    }
  }

  return <>
    <div className="announcement"><div className="container announcement-inner"><span className="announcement-origin"><span>🇦🇺</span> Independent & Australian</span><span className="announcement-message"><Sparkles size={13}/> <ThemeMotif theme={settings.theme}/> {settings.storeName}. {shippingMessage(settings)} <ArrowRight size={13}/></span><Link href="/admin" className="announcement-admin"><Settings2 size={12}/> Store dashboard <ArrowUpRight size={12}/></Link></div></div>
    <header className="store-header"><div className="container header-main"><button className="mobile-menu icon-button" aria-label={mobileNav ? "Close navigation" : "Open navigation"} onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? <X/> : <Menu/>}</button><Brand/>
      <div ref={searchRef} className="header-search">
        <form onSubmit={submit} className={`search-field ${focused ? "search-focused" : ""}`}>
          <Search size={19}/>
          <input 
            aria-label="Search cards, sets, and more" 
            placeholder="Search any Magic card, set, printing…" 
            value={query} 
            onChange={event => { setQuery(event.target.value); setFocused(true); }} 
            onFocus={() => setFocused(true)} 
            autoComplete="off"
          />
          {searching ? <LoaderCircle size={15} className="spin text-orange-400"/> : <span className="search-shortcut">↵</span>}
          <button className="sr-only" type="submit">Search catalogue</button>
        </form>
        {focused && query.trim().length >= 2 && (
          <div className="search-suggestions">
            <div className="suggestion-label flex justify-between items-center">
              <span>CARD SEARCH RESULTS</span>
              {searching && <span className="text-xs normal-case opacity-70">Searching all cards…</span>}
            </div>
            {suggestions.length > 0 ? (
              suggestions.map(card => (
                <Link 
                  key={card.id} 
                  href={`/cards?q=${encodeURIComponent(card.name)}`} 
                  onClick={() => setFocused(false)} 
                  className="search-suggestion"
                >
                  <img src={card.imageUrl} alt="" loading="lazy"/>
                  <span>
                    <strong>{card.name}</strong>
                    <small>{card.setName} ({card.setCode?.toUpperCase()})</small>
                  </span>
                  <div className="text-right">
                    <b>{money(card.price)}</b>
                    <div className="text-[10px] opacity-75">
                      {card.quantity > 0 ? (
                        <span className="text-green-500 font-semibold">{card.quantity} in stock</span>
                      ) : (
                        <span className="text-amber-500">Out of stock</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            ) : !searching ? (
              <p className="no-suggestions">Press Enter to search the full library of all Magic cards.</p>
            ) : null}
            <button 
              onClick={() => { 
                setFocused(false); 
                router.push(`/cards?q=${encodeURIComponent(query.trim())}`); 
              }} 
              className="all-results"
            >
              View all matching printings & cards <ArrowRight size={15}/>
            </button>
          </div>
        )}
      </div>
      <div className="header-actions">
        <span className="currency">AUD $</span>
        <button onClick={onWishlist} className="header-action" aria-label={`Wishlist, ${wishlistCount} saved cards`}>
          <span className="header-icon"><Heart size={21}/>{wishlistCount > 0 && <i>{wishlistCount}</i>}</span>
          <span>Wishlist</span>
        </button>
        <Link href="/account" className="header-action account-action" aria-label={customerName ? `Account, signed in as ${customerName}` : "Sign in or create an account"}>
          <UserRound size={21}/><span>{customerName ? customerName.split(" ")[0] : "Account"}</span>
        </Link>
        <span className="header-action-divider"/>
        <button onClick={onCart} className="header-action" aria-label={`Open cart, ${cartCount} cards`}>
          <span className="header-icon"><ShoppingBag size={21}/><i className="cart-count">{cartCount}</i></span>
          <span>Cart</span>
        </button>
      </div>
    </div></header>
    <nav className={`store-nav ${mobileNav ? "nav-open" : ""}`} aria-label="Main navigation"><div className="container nav-inner"><Link href="/cards" className={`nav-link nav-featured ${path === "/cards" ? "nav-active" : ""}`} onClick={() => setMobileNav(false)}><Flame size={17}/> Shop all singles</Link><div ref={menuRef} className="set-nav-wrap"><button className={`nav-link ${setMenu ? "nav-active" : ""}`} onClick={() => setSetMenu(!setMenu)} aria-expanded={setMenu}>Shop by set <ChevronDown size={13}/></button>{setMenu && <div className="set-dropdown"><span className="suggestion-label">EXPLORE THE MULTIVERSE</span>{SHOP_SETS.map(set => <Link key={set.code} href={`/cards?set=${set.code}`} onClick={() => { setSetMenu(false); setMobileNav(false); }}><img src={set.image} alt=""/><span><strong>{set.name}</strong><small>{set.subtitle}</small></span><ArrowUpRight size={16}/></Link>)}<Link href="/cards" className="dropdown-all" onClick={() => setSetMenu(false)}>Browse every set <ArrowRight size={15}/></Link></div>}</div><Link className="nav-link" href="/cards?category=commander-staples" onClick={() => setMobileNav(false)}>Commander staples</Link><Link className="nav-link" href="/cards?category=new-arrivals" onClick={() => setMobileNav(false)}>New arrivals <span className="tiny-dot"/></Link><Link className={`nav-link nav-featured ${path === "/deckbuilder" ? "nav-active" : ""}`} href="/deckbuilder" onClick={() => setMobileNav(false)}><Wand2 size={17}/> Deck builder</Link><Link className={`nav-link ${path === "/account" ? "nav-active" : ""}`} href="/account" onClick={() => setMobileNav(false)}>My account</Link><button className="nav-link" onClick={() => { onAbout(); setMobileNav(false); }}>Our story</button>{pageLinks.length > 0 && <details className="page-nav-menu"><summary className="nav-link">More pages <ChevronDown size={13}/></summary><div>{pageLinks.map(page => <Link key={page.slug} href={`/pages/${page.slug}`} onClick={() => setMobileNav(false)}>{page.title}</Link>)}</div></details>}<span className="nav-end"><span className="tiny-diamond">♔</span> Collect with confidence.</span></div></nav>
  </>;
}
