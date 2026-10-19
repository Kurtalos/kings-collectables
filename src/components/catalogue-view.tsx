"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo, type ReactNode, type FormEvent } from "react";
import { ChevronRight, SlidersHorizontal, LayoutGrid, List, Search, X, RotateCcw, ArrowDown } from "lucide-react";
import { EmptyState } from "./ui";
import { money, type Card, type Collection } from "@/lib/types";
import { FEATURED_ORDER } from "@/lib/store-config";

export function CatalogueView({ products, collections, initialFilters, renderCard }: { products: Card[]; collections: Collection[]; initialFilters: { q?: string; set?: string; category?: string }; renderCard: (card: Card, list: boolean) => ReactNode }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialFilters.q || "");
  const [setCode, setSetCode] = useState(initialFilters.set || "");
  const [category, setCategory] = useState(initialFilters.category || "");
  const [rarities, setRarities] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [onlyStock, setOnlyStock] = useState(false);
  const [onlyFoil, setOnlyFoil] = useState(false);
  const [maxPrice, setMaxPrice] = useState(Number.MAX_SAFE_INTEGER);
  const [sort, setSort] = useState("recommended");
  const [list, setList] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(24);

  useEffect(() => { 
    setQuery(initialFilters.q || ""); 
    setSetCode(initialFilters.set || ""); 
    setCategory(initialFilters.category || ""); 
    setLimit(24); 
  }, [initialFilters.q, initialFilters.set, initialFilters.category]);

  const selectedGroup = collections.find(group => group.slug === category);
  const sets = [...new Map(products.map(card => [card.setCode, card.setName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const priceCeiling = Math.max(10000, Math.ceil(Math.max(0, ...products.map(card => card.price)) / 1000) * 1000);

  function reset() { 
    setQuery(""); 
    setSetCode(""); 
    setCategory(""); 
    setRarities([]); 
    setColors([]); 
    setOnlyStock(false); 
    setOnlyFoil(false); 
    setMaxPrice(Number.MAX_SAFE_INTEGER); 
    setLimit(24);
    if (initialFilters.q || initialFilters.set || initialFilters.category) {
      router.push("/cards");
    }
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) {
      router.push(`/cards?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push("/cards");
    }
  }

  function toggle(array: string[], value: string, setter: (value: string[]) => void) { 
    setter(array.includes(value) ? array.filter(item => item !== value) : [...array, value]); 
    setLimit(24); 
  }

  const results = useMemo(() => {
    const filtered = products.filter(card =>
      (!query || `${card.name} ${card.setName} ${card.setCode} ${card.typeLine}`.toLowerCase().includes(query.toLowerCase())) &&
      (!setCode || card.setCode === setCode) &&
      (!category || (selectedGroup && card.categoryIds.includes(selectedGroup.id))) &&
      (!rarities.length || rarities.includes(card.rarity)) &&
      (!colors.length || colors.some(color => color === "C" ? !card.colors.length : card.colors.includes(color))) &&
      (!onlyStock || card.quantity > 0) &&
      (!onlyFoil || card.finish !== "Non-foil") &&
      card.price <= maxPrice
    );

    // "Recommended" preserves the server ordering, which already ranks in-stock and exact-name matches first.
    if (sort === "price-low") return [...filtered].sort((a, b) => a.price - b.price);
    if (sort === "price-high") return [...filtered].sort((a, b) => b.price - a.price);
    if (sort === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "newest") return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filtered;
  }, [products, query, setCode, category, selectedGroup, rarities, colors, onlyStock, onlyFoil, maxPrice, sort]);

  const title = query ? `Results for “${query}”` : selectedGroup?.name || sets.find(([code]) => code === setCode)?.[1] || "Magic singles";
  const activeCount = Number(Boolean(query)) + Number(Boolean(setCode)) + Number(Boolean(category)) + rarities.length + colors.length + Number(onlyStock) + Number(onlyFoil) + Number(maxPrice < priceCeiling);

  return (
    <main className="container catalogue-main">
      <div className="breadcrumbs">
        <Link href="/">Home</Link>
        <ChevronRight size={12}/>
        <Link href="/cards">Shop singles</Link>
        {(query || category || setCode) && <><ChevronRight size={12}/><span>{title}</span></>}
      </div>

      <div className="catalogue-page-heading">
        <div>
          <span className="eyebrow">MAGIC: THE GATHERING CARD CATALOGUE</span>
          <h1>{title}</h1>
          <p>{selectedGroup?.description || "Browse any card in Magic's history. View in-stock singles or wishlist and watch out-of-stock printings for restock notifications."}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="catalogue-total">{results.length} printings shown <span>✧</span></span>
          <span className="text-[11px] text-zinc-500">
            {results.filter(c => c.quantity > 0).length} in stock · {results.filter(c => c.quantity === 0).length} out of stock
          </span>
        </div>
      </div>

      <div className="catalogue-layout">
        <aside className={`catalogue-filters ${showFilters ? "filters-visible" : ""}`}>
          <div className="filter-heading">
            <h3><SlidersHorizontal size={16}/> Refine your search</h3>
            <button className="filter-reset" onClick={reset}>Reset</button>
          </div>

          <div className="filter-block">
            <label className="filter-label" htmlFor="catalog-query">Card name or text</label>
            <form onSubmit={handleSearchSubmit} className="small-search">
              <Search size={15}/>
              <input 
                id="catalog-query" 
                value={query} 
                onChange={event => { setQuery(event.target.value); setLimit(24); }} 
                placeholder="Type and press Enter…"
              />
            </form>
          </div>

          <div className="filter-block">
            <h4>Availability</h4>
            <label className="check-label">
              <input type="checkbox" checked={onlyStock} onChange={event => setOnlyStock(event.target.checked)}/> 
              <span>In stock only ({products.filter(c => c.quantity > 0).length})</span>
            </label>
          </div>

          <div className="filter-block">
            <h4>Collections</h4>
            <button className={`collection-filter ${!category ? "selected" : ""}`} onClick={() => { setCategory(""); setLimit(24); }}>
              <span>All cards</span>
              <small>{products.length}</small>
            </button>
            {collections.map(group => (
              <button key={group.id} className={`collection-filter ${category === group.slug ? "selected" : ""}`} onClick={() => { setCategory(group.slug); setLimit(24); }}>
                <span>{group.name}</span>
                <small>{group.count}</small>
              </button>
            ))}
          </div>

          <div className="filter-block">
            <label className="filter-label" htmlFor="set-filter">Set / expansion</label>
            <select id="set-filter" value={setCode} onChange={event => { setSetCode(event.target.value); setLimit(24); }}>
              <option value="">All sets ({sets.length})</option>
              {sets.map(([code, name]) => <option key={code} value={code}>{name} ({code.toUpperCase()})</option>)}
            </select>
          </div>

          <div className="filter-block">
            <h4>Colour</h4>
            <div className="colour-filters">
              {[
                { code: "W", name: "White" },
                { code: "U", name: "Blue" },
                { code: "B", name: "Black" },
                { code: "R", name: "Red" },
                { code: "G", name: "Green" },
                { code: "C", name: "Colourless" },
              ].map(color => (
                <button
                  key={color.code}
                  type="button"
                  title={color.name}
                  aria-label={`Filter ${color.name} cards`}
                  aria-pressed={colors.includes(color.code)}
                  className={`mana-color mana-${color.code} ${colors.includes(color.code) ? "mana-selected" : ""}`}
                  onClick={() => toggle(colors, color.code, setColors)}
                >
                  <img src={`/images/mana/${color.code}.svg`} alt="" width={26} height={26} loading="lazy"/>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-block">
            <h4>Rarity</h4>
            {["common", "uncommon", "rare", "mythic"].map(rarity => (
              <label className="check-label" key={rarity}>
                <input type="checkbox" checked={rarities.includes(rarity)} onChange={() => toggle(rarities, rarity, setRarities)}/>
                <span className={`rarity-dot rarity-${rarity}`}/>
                <span className="capitalize">{rarity}</span>
              </label>
            ))}
          </div>

          <div className="filter-block">
            <h4>Price range</h4>
            <input 
              className="price-range" 
              type="range" 
              min={0} 
              max={priceCeiling} 
              step={100} 
              value={Math.min(maxPrice, priceCeiling)} 
              onChange={event => setMaxPrice(Number(event.target.value))} 
              aria-label="Maximum card price"
            />
            <div className="range-labels">
              <span>$0</span>
              <strong>Up to {money(Math.min(maxPrice, priceCeiling))}</strong>
            </div>
          </div>

          <div className="filter-block last-filter">
            <label className="check-label">
              <input type="checkbox" checked={onlyFoil} onChange={event => setOnlyFoil(event.target.checked)}/> 
              Foil & etched only
            </label>
          </div>

          <button className="button button-primary mobile-apply" onClick={() => setShowFilters(false)}>
            Show {results.length} cards
          </button>
        </aside>

        <section className="catalogue-results">
          <div className="catalogue-toolbar">
            <button className="mobile-filter-button button button-outline" onClick={() => setShowFilters(!showFilters)}>
              <SlidersHorizontal size={15}/> Filters {activeCount ? `(${activeCount})` : ""}
            </button>
            <span className="results-count">
              {results.length} {results.length === 1 ? "card printing" : "card printings"}
              {query ? ` matching “${query}”` : " found"}
            </span>

            <div className="sort-control">
              <label htmlFor="sort-cards">Sort by</label>
              <select id="sort-cards" value={sort} onChange={event => setSort(event.target.value)}>
                <option value="recommended">Recommended (In stock first)</option>
                <option value="newest">Newest additions</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
                <option value="name">Name: A–Z</option>
              </select>
            </div>

            <div className="view-toggle">
              <button aria-label="Grid view" aria-pressed={!list} className={!list ? "selected" : ""} onClick={() => setList(false)}>
                <LayoutGrid size={16}/>
              </button>
              <button aria-label="List view" aria-pressed={list} className={list ? "selected" : ""} onClick={() => setList(true)}>
                <List size={17}/>
              </button>
            </div>
          </div>

          {activeCount > 0 && (
            <div className="active-filters">
              {query && <button onClick={() => { setQuery(""); router.push("/cards"); }}>{query}<X size={11}/></button>}
              {setCode && <button onClick={() => setSetCode("")}>{setCode.toUpperCase()}<X size={11}/></button>}
              {category && <button onClick={() => setCategory("")}>{selectedGroup?.name || category}<X size={11}/></button>}
              {onlyStock && <button onClick={() => setOnlyStock(false)}>In stock only<X size={11}/></button>}
              <button className="clear-all" onClick={reset}>Clear all <RotateCcw size={11}/></button>
            </div>
          )}

          {results.length ? (
            <>
              <div className={`product-grid catalogue-grid ${list ? "list-view" : ""}`}>
                {results.slice(0, limit).map(card => renderCard(card, list))}
              </div>
              {results.length > limit && (
                <div className="load-more">
                  <p>You've explored {limit} of {results.length} cards</p>
                  <button className="button button-outline" onClick={() => setLimit(limit + 36)}>
                    Discover more cards <ArrowDown size={15}/>
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState 
              icon={<Search size={33}/>} 
              title="Nothing in this corner of the shop" 
              description={query ? `No cards found matching “${query}”. Try a broader search or check your spelling.` : "Try a different search or loosen a few filters."}
            >
              <button className="button button-primary" onClick={reset}>
                Clear filters <RotateCcw size={15}/>
              </button>
            </EmptyState>
          )}
        </section>
      </div>
    </main>
  );
}
