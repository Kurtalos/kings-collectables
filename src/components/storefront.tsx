"use client";
import { useStoreSettings } from "./store-settings-provider";
import { shippingMessage } from "@/lib/store-settings";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Sparkles, Truck, BadgeCheck, Package, Heart, Check, AlertCircle, X } from "lucide-react";
import { StoreHeader } from "./store-header";
import { StoreFooter } from "./store-footer";
import { ProductCard, CardQuickView } from "./product-card";
import { CartDrawer } from "./cart-drawer";
import { CatalogueView } from "./catalogue-view";
import { StoreInfo, type InfoType } from "./store-info";
import { AccountPanel } from "./account-panel";
import { DeckBuilder } from "./deck-builder";
import { CardDetail } from "./card-detail";
import { Modal, EmptyState, SectionLink, requestJSON } from "./ui";
import { type Card, type Collection, type CartLine, type AccountData } from "@/lib/types";
import { SHOP_SETS, FEATURED_ORDER } from "@/lib/store-config";
const EMPTY_FILTERS = {};
const slides = [
  { eyebrow: "KINGS COLLECTABLES", title: <>Your next great<br/>deck starts here.</>, description: "Discover the singles you need. Find the cards you love.", image: "/images/vault-hero.jpg", primary: "Shop all singles", href: "/cards", secondary: "Explore the latest sets", secondHref: "/cards?category=new-arrivals", position: "center 47%" },
  { eyebrow: "THERE'S MAGIC IN THE LITTLE THINGS.", title: <>Small heroes.<br/>Big adventures.</>, description: "Step into Bloomburrow. Your next story is waiting.", image: "/images/cards/valley-questcaller-art.jpg", primary: "Shop Bloomburrow", href: "/cards?set=blb", secondary: "Discover all sets", secondHref: "/cards", position: "center 40%" },
  { eyebrow: "YOUR NEXT BIG PLAY IS HERE.", title: <>More power.<br/>More possibilities.</>, description: "Discover the game-changers in Modern Horizons 3.", image: "/images/cards/ulamog-the-defiler-art.jpg", primary: "Shop Modern Horizons 3", href: "/cards?set=mh3", secondary: "Browse Modern staples", secondHref: "/cards?category=modern-favourites", position: "center 45%" },
];
export function Storefront({ initialProducts, collections, mode = "home", initialFilters = EMPTY_FILTERS, initialAccount, initialCard, initialPrintings }: { initialProducts: Card[]; collections: Collection[]; mode?: "home" | "catalog" | "account" | "deckbuilder" | "carddetail"; initialFilters?: { q?: string; set?: string; category?: string }; initialAccount?: AccountData; initialCard?: Card | null; initialPrintings?: Card[] }) {
  const settings = useStoreSettings();
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts), [cart, setCart] = useState<CartLine[]>([]), [saved, setSaved] = useState<string[]>(initialAccount?.wishlistIds || []), [watched, setWatched] = useState<string[]>(initialAccount?.watchlist.map(item => item.productId) || []), [watchMeta, setWatchMeta] = useState(initialAccount?.watchlist || []), [wishlistProducts, setWishlistProducts] = useState<Card[]>(initialAccount?.wishlistProducts || []), [watchProducts, setWatchProducts] = useState<Card[]>(initialAccount?.watchProducts || []), [customer, setCustomer] = useState(initialAccount?.customer || null), [orders, setOrders] = useState(initialAccount?.orders || []), [addresses, setAddresses] = useState(initialAccount?.addresses || []), [ready, setReady] = useState(false), [cartOpen, setCartOpen] = useState(false), [wishlistOpen, setWishlistOpen] = useState(false), [activeCard, setActiveCard] = useState<Card | null>(null), [info, setInfo] = useState<InfoType | null>(null), [slide, setSlide] = useState(0), [productTab, setProductTab] = useState("Trending"), [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const applyAccount = useCallback((data: AccountData) => {
    setCustomer(data.customer);
    setOrders(data.orders);
    setAddresses(data.addresses);
    setWatched(data.watchlist.map(item => item.productId));
    setWatchMeta(data.watchlist);
    setWatchProducts(data.watchProducts);
    if (data.customer) {
      setSaved(data.wishlistIds);
      setWishlistProducts(data.wishlistProducts);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
    void (async () => {
      let storedCart: { id: string; quantity: number }[] = [];
      let guestSaved: string[] = [];
      try {
        const raw = JSON.parse(localStorage.getItem("kings-cart") || localStorage.getItem("mana-cart") || "[]");
        if (Array.isArray(raw)) storedCart = raw.slice(0, 50).filter(item => item && validId(item.id) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 1000);
        const wishlist = JSON.parse(localStorage.getItem("kings-wishlist") || localStorage.getItem("mana-wishlist") || "[]");
        if (Array.isArray(wishlist)) guestSaved = [...new Set(wishlist.filter(validId))].slice(0, 200);
      } catch { /* Unreadable browser preferences must not prevent account loading. */ }

      let canPersist = true;
      try {
        const ids = [...new Set([...storedCart.map(item => item.id), ...(!initialAccount?.customer ? guestSaved : [])])];
        const missing = ids.filter(id => !initialProducts.some(product => product.id === id));
        const resolved = missing.length ? (await requestJSON<{ products: Card[] }>("/api/cards/by-ids", { method: "POST", body: JSON.stringify({ ids: missing }) })).products : [];
        if (cancelled) return;
        const byId = new Map([...initialProducts, ...resolved].map(product => [product.id, product]));
        setCart(storedCart.flatMap(item => {
          const product = byId.get(item.id);
          return product?.quantity ? [{ product, quantity: Math.min(product.quantity, item.quantity) }] : [];
        }));
        if (!initialAccount?.customer) {
          const existingGuestIds = guestSaved.filter(id => byId.has(id));
          setSaved(existingGuestIds);
          setWishlistProducts(existingGuestIds.flatMap(id => { const product = byId.get(id); return product ? [product] : []; }));
        }
      } catch {
        canPersist = false;
        if (!cancelled) setToast({ message: "Your saved cart could not be loaded. Refresh to try again.", error: true });
      }

      if (!initialAccount) {
        try { const account = await requestJSON<AccountData>("/api/account"); if (!cancelled) applyAccount(account); }
        catch { /* Guests can still browse when the account service is unavailable. */ }
      }
      if (!cancelled && canPersist) setReady(true);
    })();
    return () => { cancelled = true; };
  // Restore browser preferences once; account pages already have an authoritative server snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setProducts(initialProducts);
    setCart(current => current.flatMap(line => {
      const updated = initialProducts.find(product => product.id === line.product.id);
      if (!updated) return [line]; // Cards outside this page's catalogue remain in the cart.
      return updated.quantity ? [{ product: updated, quantity: Math.min(line.quantity, updated.quantity) }] : [];
    }));
  }, [initialProducts]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("kings-cart", JSON.stringify(cart.map(line => ({ id: line.product.id, quantity: line.quantity }))));
      if (!customer) localStorage.setItem("kings-wishlist", JSON.stringify(saved));
    } catch { /* The store still works when browser storage is unavailable. */ }
  }, [cart, saved, customer, ready]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 4200); return () => clearTimeout(timer); }, [toast]);
  const notify = useCallback((message: string, error = false) => setToast({ message, error }), []);
  async function toggleSave(card: Card) {
    const alreadySaved = saved.includes(card.id);
    setSaved(current => alreadySaved ? current.filter(id => id !== card.id) : [...current, card.id]);
    setWishlistProducts(current => alreadySaved ? current.filter(item => item.id !== card.id) : [...current.filter(item => item.id !== card.id), card]);
    if (customer) {
      try { applyAccount(await requestJSON<AccountData>("/api/account", { method: "POST", body: JSON.stringify({ action: "wishlist", productId: card.id }) })); }
      catch (error) {
        setSaved(saved);
        setWishlistProducts(current => alreadySaved ? [...current.filter(item => item.id !== card.id), card] : current.filter(item => item.id !== card.id));
        notify(error instanceof Error ? error.message : "Unable to update your wishlist.", true);
      }
    }
  }
  async function toggleWatch(card: Card) {
    if (!customer) { notify("Create an account to start a watch list."); router.push("/account"); return; }
    try { applyAccount(await requestJSON<AccountData>("/api/account", { method: "POST", body: JSON.stringify({ action: "watchlist", productId: card.id }) })); notify(watched.includes(card.id) ? `${card.name} removed from your watch list` : `Watching ${card.name} for restocks and price drops`); }
    catch (error) { notify(error instanceof Error ? error.message : "Unable to update your watch list.", true); }
  }
  async function finishSignIn(data: AccountData) {
    let account = data;
    const guestIds = [...saved];
    try {
      const stored = JSON.parse(localStorage.getItem("kings-wishlist") || localStorage.getItem("mana-wishlist") || "[]");
      if (Array.isArray(stored)) guestIds.push(...stored.filter((id): id is string => typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)));
    } catch { /* No guest wishlist to import. */ }
    const pending = [...new Set(guestIds)].filter(id => !data.wishlistIds.includes(id)).slice(0, 200);
    if (pending.length) {
      try {
        account = await requestJSON<AccountData>("/api/account", { method: "POST", body: JSON.stringify({ action: "sync", wishlistIds: pending }) });
      } catch { notify("Signed in, but your device wishlist could not be imported. You can try again later.", true); }
    }
    applyAccount(account);
    try {
      if (!pending.length || account !== data) {
        localStorage.removeItem("kings-wishlist");
        localStorage.removeItem("mana-wishlist");
      }
    } catch { /* Browser storage is optional. */ }
    notify(`Welcome, ${data.customer?.name.split(" ")[0] || "collector"}.`);
    router.refresh();
  }
  function finishSignOut() {
    setCustomer(null);
    setOrders([]);
    setAddresses([]);
    setSaved([]);
    setWishlistProducts([]);
    setWatched([]);
    setWatchMeta([]);
    setWatchProducts([]);
    try { localStorage.removeItem("kings-wishlist"); localStorage.removeItem("mana-wishlist"); }
    catch { /* Browser storage is optional. */ }
    notify("Signed out.");
    router.refresh();
  }
  function addCard(card: Card, quantity = 1) {
    const existing = cart.find(line => line.product.id === card.id);
    if (!card.quantity || (existing?.quantity || 0) + quantity > card.quantity) { notify(`Only ${card.quantity} copies are available.`, true); return; }
    setCart(current => { const found = current.find(line => line.product.id === card.id); return found ? current.map(line => line.product.id === card.id ? { ...line, quantity: line.quantity + quantity } : line) : [...current, { product: card, quantity }]; });
    notify(`${quantity > 1 ? `${quantity} × ` : ""}${card.name} added to your cart`);
  }
  function renderCard(card: Card, list = false) { return <ProductCard key={card.id} card={card} saved={saved.includes(card.id)} watching={watched.includes(card.id)} onSave={() => toggleSave(card)} onWatch={() => toggleWatch(card)} onAdd={() => addCard(card)} onView={() => setActiveCard(card)} list={list}/>; }
  const commander = collections.find(group => group.slug === "commander-staples"), arrivals = collections.find(group => group.slug === "new-arrivals");
  const featured = (productTab === "Commander staples" ? products.filter(card => commander && card.categoryIds.includes(commander.id)) : productTab === "New arrivals" ? products.filter(card => arrivals && card.categoryIds.includes(arrivals.id)) : products.filter(card => card.featured)).sort((a, b) => productTab === "Trending" ? FEATURED_ORDER.indexOf(a.name) - FEATURED_ORDER.indexOf(b.name) : b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const visibleSavedCards = saved.flatMap(id => {
    const card = wishlistProducts.find(item => item.id === id) || products.find(item => item.id === id);
    return card ? [card] : [];
  });
  const hero = slides[slide];
  return <div className="storefront"><StoreHeader products={products} cartCount={cart.reduce((sum, line) => sum + line.quantity, 0)} wishlistCount={saved.length} customerName={customer?.name} onCart={() => setCartOpen(true)} onWishlist={() => setWishlistOpen(true)} onAbout={() => setInfo("story")} initialQuery={initialFilters.q}/>
  {mode === "carddetail" && initialCard ? <CardDetail card={initialCard} printings={initialPrintings || []} saved={saved} watched={watched} onSave={toggleSave} onWatch={toggleWatch} onAdd={addCard}/>
  : mode === "deckbuilder" ? <DeckBuilder products={products} customer={customer} onAdd={addCard} onOpenCart={() => setCartOpen(true)} notify={notify}/>
   : mode === "account" ? <main className="container account-main"><AccountPanel products={products} customer={customer} orders={orders} addresses={addresses} onAddresses={setAddresses} saved={saved} watched={watched} watchMeta={watchMeta} savedProducts={wishlistProducts} watchProducts={watchProducts} onAuth={finishSignIn} onLogout={finishSignOut} onSave={toggleSave} onWatch={toggleWatch} onAdd={addCard} onView={setActiveCard}/></main>
  : mode === "catalog" ? <CatalogueView products={products} collections={collections} initialFilters={initialFilters} renderCard={renderCard}/> : <main className="container home-main"><section className="hero" aria-label="Featured collections"><div className="hero-art" key={hero.image} style={{ backgroundImage: `url('${hero.image}')`, backgroundPosition: hero.position }}/><div className="hero-shade"/><div className="hero-content"><span className="hero-eyebrow"><Sparkles size={15}/>{slide === 0 ? settings.storeName.toUpperCase() : hero.eyebrow}</span><h1>{hero.title}</h1><p>{hero.description}</p><div className="hero-actions"><Link href={hero.href} className="button hero-button">{hero.primary}<ArrowRight size={17}/></Link><Link className="hero-secondary" href={hero.secondHref}>{hero.secondary}<ArrowUpRight size={14}/></Link></div></div><div className="hero-slide-controls"><div className="hero-dots">{slides.map((_, index) => <button key={index} className={slide === index ? "active" : ""} aria-label={`View promotion ${index + 1}`} aria-pressed={slide === index} onClick={() => setSlide(index)}/>)}</div><span className="slide-number">0{slide + 1}<i>/</i>0{slides.length}</span><button aria-label="Previous promotion" onClick={() => setSlide((slide + slides.length - 1) % slides.length)}><ChevronLeft size={17}/></button><button aria-label="Next promotion" onClick={() => setSlide((slide + 1) % slides.length)}><ChevronRight size={17}/></button></div><div className="hero-art-note">YOUR NEXT ADVENTURE AWAITS <span>♔</span></div></section>
    <section className="store-benefits" aria-label={`The ${settings.storeName} difference`}><button onClick={() => setInfo("shipping")}><Truck size={24}/><span><strong>{shippingMessage(settings)}</strong><small>Tracked. From our shop to yours.</small></span></button><button onClick={() => setInfo("conditions")}><BadgeCheck size={25}/><span><strong>Condition you can trust</strong><small>Carefully checked, clearly graded.</small></span></button><button onClick={() => setInfo("shipping")}><Package size={24}/><span><strong>A little extra care</strong><small>Safely packed for every journey.</small></span></button><button onClick={() => setInfo("story")}><Heart size={24}/><span><strong>Independent & Australian</strong><small>By collectors. For collectors.</small></span></button></section>
    <section className="set-section"><div className="section-heading"><div><span className="eyebrow">EXPLORE THE MULTIVERSE</span><h2>Find your next adventure.</h2></div><SectionLink href="/cards">Explore all sets</SectionLink></div><div className="set-grid">{SHOP_SETS.map(set => <Link href={`/cards?set=${set.code}`} className={`set-card set-${set.code}`} key={set.code}><img className="set-art" src={set.image} alt={`${set.name} card artwork`}/><div className="set-card-shade"/><span className="set-card-label">{set.label}</span><img className="set-symbol" src={`/images/set-${set.code}.svg`} alt=""/><div className="set-card-copy"><h3>{set.name}</h3><span>{set.subtitle}</span></div><span className="set-card-arrow"><ArrowUpRight size={17}/></span></Link>)}</div></section>
    <section className="trending-section"><div className="section-heading trending-heading"><div><span className="eyebrow">GOOD CARDS. GREAT POSSIBILITIES.</span><h2>Fresh picks from the shop.</h2></div><SectionLink href="/cards">Shop all singles</SectionLink></div><div className="product-tabs"><div>{["Trending", "New arrivals", "Commander staples"].map(tab => <button key={tab} className={tab === productTab ? "active" : ""} onClick={() => setProductTab(tab)}>{tab}{tab === "Trending" && <span>♔</span>}</button>)}</div><span>Handpicked for your next big play.</span></div>{featured.length ? <div className="product-grid home-product-grid">{featured.map(card => renderCard(card))}</div> : <EmptyState icon={<Sparkles size={28}/>} title="Fresh picks are on their way" description="Explore the full catalogue to find something for your next deck."><Link href="/cards" className="button button-primary">Shop all singles</Link></EmptyState>}</section>
    <section className="discovery-section"><Link href="/cards?category=commander-staples" className="discovery-card commander-discovery"><div className="discovery-art" style={{ backgroundImage: "url('/images/cards/sol-ring-art.jpg')" }}/><div><span className="eyebrow">ONE HUNDRED CARDS. ENDLESS POSSIBILITIES.</span><h2>Made for your<br/>Commander table.</h2><span className="discovery-link">Find your next staple <ArrowRight size={16}/></span></div><span className="discovery-symbol">♔</span></Link><Link href="/cards?category=under-5" className="discovery-card budget-discovery"><div><span className="eyebrow">BIG PLAYS DON'T NEED BIG PRICE TAGS.</span><h2>A little change.<br/>A big deck upgrade.</h2><span className="discovery-link">Discover cards under $5 <ArrowRight size={16}/></span></div><div className="budget-card-stack"><img src="/images/cards/lightning-bolt.jpg" alt="Lightning Bolt card"/><img src="/images/cards/llanowar-elves.jpg" alt="Llanowar Elves card"/></div></Link></section>
  </main>}
  <StoreFooter onInfo={setInfo}/>
  {activeCard && <CardQuickView key={activeCard.id} card={products.find(card => card.id === activeCard.id) || activeCard} saved={saved.includes(activeCard.id)} watching={watched.includes(activeCard.id)} onClose={() => setActiveCard(null)} onSave={() => toggleSave(activeCard)} onWatch={() => toggleWatch(activeCard)} onAdd={quantity => addCard(products.find(card => card.id === activeCard.id) || activeCard, quantity)}/>}
  {cartOpen && <CartDrawer cart={cart} customer={customer} onClose={() => setCartOpen(false)} onAdjust={(id, delta) => setCart(current => current.map(line => line.product.id === id ? { ...line, quantity: Math.max(0, Math.min(line.product.quantity, line.quantity + delta)) } : line).filter(line => line.quantity > 0))} onRemove={id => setCart(current => current.filter(line => line.product.id !== id))}/>}
  {wishlistOpen && <Modal title={`Your wishlist (${saved.length})`} onClose={() => setWishlistOpen(false)} wide>{visibleSavedCards.length ? <div className="wishlist-grid product-grid">{visibleSavedCards.map(card => <ProductCard key={card.id} card={card} saved watching={watched.includes(card.id)} onSave={() => toggleSave(card)} onWatch={() => toggleWatch(card)} onAdd={() => addCard(card)} onView={() => { setWishlistOpen(false); setActiveCard(card); }}/>)}</div> : <EmptyState icon={<Heart size={34}/>} title="Keep a little magic for later" description={customer ? "Tap the heart on any card to save it to your account." : "Tap the heart on any card to save it here. Create an account to keep it on every device."}><button className="button button-primary" onClick={() => setWishlistOpen(false)}>Find your favourites <ArrowRight size={16}/></button></EmptyState>}</Modal>}
  {info && <StoreInfo key={info} type={info} onClose={() => setInfo(null)}/>}
  {toast && <div className={`toast ${toast.error ? "toast-error" : ""}`} role="status">{toast.error ? <AlertCircle size={18}/> : <Check size={18}/>}<span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15}/></button></div>}
  </div>;
}
