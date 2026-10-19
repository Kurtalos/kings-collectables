"use client";
import { useState, type FormEvent } from "react";
import { Search, LoaderCircle, Save, Plus, ArrowLeft, Check } from "lucide-react";
import { AcquisitionCostPanel } from "./acquisition-cost-panel";
import { Modal, requestJSON } from "./ui";
import { CONDITIONS, FINISHES, type Card, type Collection } from "@/lib/types";

type MetadataCard = Omit<Card, "id" | "createdAt" | "categoryIds" | "quantity" | "price" | "condition" | "finish" | "priceMode" | "usdPrice" | "priceUpdatedAt">;

export function InventoryEditor({ card, collections, onClose, onSaved, onViewHistory }: { card: Card | null; collections: Collection[]; onClose: () => void; onSaved: () => void; onViewHistory?: () => void }) {
  const [found, setFound] = useState<MetadataCard | null>(card);
  const [name, setName] = useState("");
  const [setCode, setSetCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [price, setPrice] = useState(card ? (card.price / 100).toFixed(2) : "");
  const [quantity, setQuantity] = useState(String(card?.quantity ?? 1));
  const [condition, setCondition] = useState(card?.condition || "Near mint");
  const [finish, setFinish] = useState(card?.finish || "Non-foil");
  const [featured, setFeatured] = useState(card?.featured || false);
  const [followMarket, setFollowMarket] = useState(card?.priceMode === "auto");
  const [groups, setGroups] = useState<string[]>(card?.categoryIds || []);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await requestJSON<{ card: any }>(`/api/cards/lookup?name=${encodeURIComponent(name)}&set=${encodeURIComponent(setCode)}`);
      setFound(result.card);
      if (!card && result.card.price) {
        setPrice((result.card.price / 100).toFixed(2));
      }
      if (!card && result.card.priceMode === "auto") {
        setFollowMarket(true);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Card not found.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!found) return;
    setBusy(true);
    setError("");
    try {
      await requestJSON(card ? `/api/cards/${card.id}` : "/api/cards", {
        method: card ? "PATCH" : "POST",
        body: JSON.stringify({
          scryfallId: found.scryfallId,
          price: Math.round(Number(price) * 100),

          condition,
          finish,
          featured,
          categoryIds: groups,
          priceMode: followMarket ? "auto" : "manual"
        })
      });
      onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save this card.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={card ? "Edit card inventory" : "Add card to inventory"} onClose={onClose}>
      <div className="editor-content">
        {!found ? (
          <>
            <p className="editor-intro">Find any card in Magic: The Gathering to add or update stock and pricing in your inventory.</p>
            <form className="stack-form" onSubmit={lookup}>
              <label>
                Exact card name
                <input value={name} onChange={event => setName(event.target.value)} required placeholder="e.g. Dovin Baan, Sol Ring, Sheoldred" maxLength={200}/>
              </label>
              <label>
                Set code <span className="field-optional">optional</span>
                <input value={setCode} onChange={event => setSetCode(event.target.value)} placeholder="e.g. KLD, CMM, MH3" maxLength={8}/>
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-primary" disabled={busy}>
                {busy ? <LoaderCircle className="spin" size={16}/> : <Search size={16}/>} {busy ? "Finding card…" : "Find card"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="editor-card-summary">
              <img src={found.imageUrl} alt={found.name}/>
              <div>
                <span className="eyebrow">CARD DETAILS</span>
                <h3>{found.name}</h3>
                <p>{found.setName}</p>
                <small>{found.setCode.toUpperCase()} · #{found.collectorNumber} · {found.rarity}</small>
                {!card && (
                  <button className="back-link" onClick={() => { setFound(null); setError(""); }}>
                    <ArrowLeft size={12}/> Choose another card
                  </button>
                )}
              </div>
            </div>

            {card && <AcquisitionCostPanel key={card.id} productId={card.id} onViewHistory={onViewHistory}/>}
            <form className="stack-form" onSubmit={save}>
              <div className="form-two-columns">
                <label>
                  Selling price (AUD)
                  <div className="price-input">
                    <span>$</span>
                    <input type="number" min="0.01" max="100000" step="0.01" required value={price} onChange={event => setPrice(event.target.value)} placeholder="0.00"/>
                  </div>
                </label>
                <label>
                  Available quantity (receive stock to increase)
                  <input disabled type="number" min="0" max="100000" step="1" required value={quantity} onChange={event => setQuantity(event.target.value)}/>
                </label>
              </div>

              <div className="form-two-columns">
                <label>
                  Condition
                  <select disabled={Boolean(card)} value={condition} onChange={event => setCondition(event.target.value)}>
                    {CONDITIONS.map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  Finish
                  <select disabled={Boolean(card)} value={finish} onChange={event => setFinish(event.target.value)}>
                    {FINISHES.map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
              </div>

              <fieldset className="collection-fieldset">
                <legend>Collections <span>choose any that fit</span></legend>
                <div className="editor-collection-options">
                  {collections.map(group => (
                    <label key={group.id}>
                      <input 
                        type="checkbox" 
                        checked={groups.includes(group.id)} 
                        onChange={() => setGroups(current => current.includes(group.id) ? current.filter(id => id !== group.id) : [...current, group.id])}
                      />
                      <i style={{ backgroundColor: group.color }}/>
                      {group.name}
                    </label>
                  ))}
                </div>
                {!collections.length && <p className="muted small">Create a collection in the Collections tab to start grouping cards.</p>}
              </fieldset>

              <label className="featured-check">
                <input type="checkbox" checked={featured} onChange={event => setFeatured(event.target.checked)}/>
                <span>
                  <strong>Feature on the storefront</strong>
                  <small>Include this card in the homepage trending / featured selection.</small>
                </span>
              </label>

              <label className="featured-check pricing-check">
                <input type="checkbox" checked={followMarket} onChange={event => setFollowMarket(event.target.checked)}/>
                <span>
                  <strong>Follow market price</strong>
                  <small>{followMarket ? "The daily sync automatically reprices this card from Scryfall/TCGplayer each morning." : "Off — this card keeps your fixed selling price."}</small>
                </span>
              </label>

              {error && <p className="form-error" role="alert">{error}</p>}

              <div className="editor-actions">
                <button className="button button-outline" type="button" onClick={onClose}>Cancel</button>
                <button className="button button-primary" disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={16}/> : card ? <Save size={16}/> : <Plus size={16}/>} 
                  {busy ? "Saving…" : card ? "Save changes" : "Add to inventory"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}

export function CollectionEditor({ collection, onClose, onSaved }: { collection: Collection | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(collection?.name || "");
  const [description, setDescription] = useState(collection?.description || "");
  const [color, setColor] = useState(collection?.color || "#f26b0a");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestJSON("/api/collections", {
        method: collection ? "PATCH" : "POST",
        body: JSON.stringify({ id: collection?.id, name, description, color })
      });
      onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save this collection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={collection ? "Edit collection" : "Create a collection"} onClose={onClose}>
      <div className="editor-content">
        <p className="editor-intro">Group cards your way. A card can belong to more than one collection, and every collection is browsable on your storefront.</p>
        <form className="stack-form" onSubmit={save}>
          <label>
            Collection name
            <input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Dragons, Budget brews, My favourites"/>
          </label>
          <label>
            A short description <span className="field-optional">optional</span>
            <textarea maxLength={400} rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Help collectors discover what’s inside."/>
          </label>
          <div className="color-field">
            <label>Accent colour</label>
            <div className="color-swatches">
              {["#f26b0a", "#111111", "#e8b923", "#d45504", "#3d2a12", "#7a4a12"].map(item => (
                <button key={item} type="button" style={{ backgroundColor: item }} className={color === item ? "selected" : ""} aria-label={`Choose ${item} accent colour`} onClick={() => setColor(item)}>
                  {color === item && <Check size={14}/>}
                </button>
              ))}
              <input aria-label="Choose a custom accent colour" type="color" value={color} onChange={event => setColor(event.target.value)}/>
            </div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="editor-actions">
            <button className="button button-outline" onClick={onClose} type="button">Cancel</button>
            <button className="button button-primary" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={16}/> : <Save size={16}/>} 
              {collection ? "Save collection" : "Create collection"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
