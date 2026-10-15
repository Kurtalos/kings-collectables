"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Wand2, LoaderCircle, ShoppingBag, AlertCircle, Check, Save, Trash2, FolderOpen, CircleAlert, Crown, Plus, Download, RotateCcw } from "lucide-react";
import { EmptyState, requestJSON } from "./ui";
import { money, type Card, type Customer } from "@/lib/types";
import { downloadCSV } from "@/lib/csv";

type DeckVariant = { id: string; condition: string; finish: string; price: number; quantity: number };
type DeckRow = {
  line: number; requested: string; quantity: number; section: string;
  status: "instock" | "partial" | "outofstock" | "notstocked" | "invalid";
  scryfallId: string | null; canonicalName: string | null; setName: string | null; imageUrl: string | null;
  variants: DeckVariant[]; available: number; unitPrice: number; error?: string;
};
type DeckSummary = { lines: number; matched: number; shoppable: number; missing: number; invalid: number; totalCards: number; availableCards: number; total: number };
type SavedDeck = { id: string; name: string; format: string; updatedAt: string; total: number; cards: { name: string; quantity: number; section: string }[] };

const SAMPLE = `Deck
4 Lightning Bolt
2 Sol Ring
1 The One Ring (LTR) 241
3 Orcish Bowmasters
2 Sheoldred, the Apocalypse
4 Llanowar Elves
4 Esper Sentinel

Sideboard
2 Cyclonic Rift
2 Swords to Plowshares`;
const STATUS_LABEL: Record<DeckRow["status"], string> = { instock: "In stock", partial: "Partial stock", outofstock: "Out of stock", notstocked: "Not stocked", invalid: "Check line" };
const SECTION_ORDER = ["Maindeck", "Commander", "Sideboard", "Maybeboard"];

export function DeckBuilder({ products, customer, onAdd, onOpenCart, notify }: {
  products: Card[]; customer: Customer | null; onAdd: (card: Card, quantity: number) => void; onOpenCart: () => void; notify: (message: string, error?: boolean) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState(""), [rows, setRows] = useState<DeckRow[]>([]), [summary, setSummary] = useState<DeckSummary | null>(null), [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [picked, setPicked] = useState<Record<string, string>>({}), [showMissing, setShowMissing] = useState(false);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]), [deckName, setDeckName] = useState(""), [saving, setSaving] = useState(false), [activeDeck, setActiveDeck] = useState<string | null>(null);

  useEffect(() => { requestJSON<{ customer: Customer | null; decks: SavedDeck[] }>("/api/decks").then(data => setSavedDecks(data.decks)).catch(() => {}); }, []);
  useEffect(() => { setPicked(current => { const next = { ...current }; for (const row of rows) if (row.variants.length && !next[row.requested]) next[row.requested] = row.variants[0].id; return next; }); }, [rows]);

  async function search() {
    setBusy(true); setError("");
    try {
      const result = await requestJSON<{ rows: DeckRow[]; warnings: string[]; summary: DeckSummary }>("/api/decklist", { method: "POST", body: JSON.stringify({ text }) });
      setRows(result.rows); setSummary(result.summary); setWarnings(result.warnings);
      if (!result.summary.lines) setError("No cards were found in that list.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to read that decklist."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!customer) { notify("Create an account to save your decks."); router.push("/account"); return; }
    setSaving(true);
    try {
      await requestJSON("/api/decks", { method: "POST", body: JSON.stringify({ action: "save", id: activeDeck, name: deckName.trim() || `Deck ${new Date().toLocaleDateString("en-AU")}`, text }) });
      const list = await requestJSON<{ decks: SavedDeck[] }>("/api/decks"); setSavedDecks(list.decks);
      notify(`Deck saved. You now have ${list.decks.length} saved ${list.decks.length === 1 ? "deck" : "decks"}.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to save this deck.", true); }
    finally { setSaving(false); }
  }
  async function load(deck: SavedDeck) {
    try {
      const result = await requestJSON<{ deck: { id: string; name: string; text: string } }>("/api/decks", { method: "POST", body: JSON.stringify({ action: "load", id: deck.id }) });
      setText(result.deck.text); setDeckName(result.deck.name); setActiveDeck(result.deck.id);
      const matched = await requestJSON<{ rows: DeckRow[]; summary: DeckSummary }>("/api/decklist", { method: "POST", body: JSON.stringify({ text: result.deck.text }) });
      setRows(matched.rows); setSummary(matched.summary);
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to load that deck.", true); }
  }
  async function remove(deck: SavedDeck) {
    try { await requestJSON("/api/decks", { method: "POST", body: JSON.stringify({ action: "delete", id: deck.id }) }); setSavedDecks(current => current.filter(item => item.id !== deck.id)); if (activeDeck === deck.id) setActiveDeck(null); notify(`Deleted ${deck.name}.`); }
    catch (error) { notify(error instanceof Error ? error.message : "Unable to delete that deck.", true); }
  }
  function cardFor(variantId: string) { return products.find(card => card.id === variantId); }
  function addRow(row: DeckRow) {
    const variantId = picked[row.requested] || row.variants[0]?.id;
    const card = cardFor(variantId);
    if (!card || !card.quantity) { notify(`${row.canonicalName || row.requested} is out of stock.`, true); return; }
    onAdd(card, Math.min(row.quantity, card.quantity));
  }
  function addAll() {
    const shoppable = rows.filter(row => row.status === "instock" || row.status === "partial");
    let added = 0, units = 0;
    for (const row of shoppable) {
      const card = cardFor(picked[row.requested] || row.variants[0]?.id);
      if (!card?.quantity) continue;
      const quantity = Math.min(row.quantity, card.quantity);
      if (quantity < 1) continue;
      onAdd(card, quantity); added++; units += quantity;
    }
    if (!added) notify("Nothing from this list is in stock right now.", true);
    else notify(`${units} cards from ${added} deck lines added to your cart.`);
  }
  function exportList() { downloadCSV("decklist.csv", ["name,quantity,section,status,price", ...rows.map(row => `"${row.canonicalName || row.requested}",${row.quantity},${row.section},${STATUS_LABEL[row.status]},${(row.unitPrice / 100).toFixed(2)}`)].join("\n")); }

  function reset() { setText(""); setRows([]); setSummary(null); setError(""); setActiveDeck(null); setDeckName(""); }
  const visible = showMissing ? rows : rows.filter(row => row.status !== "notstocked");
  const grouped = SECTION_ORDER.map(section => ({ section, items: visible.filter(row => row.section === section) })).filter(group => group.items.length);
  const orphans = visible.filter(row => !SECTION_ORDER.includes(row.section));
  const addedCost = rows.filter(row => row.status === "instock" || row.status === "partial").reduce((sum, row) => sum + Math.min(row.quantity, row.available) * row.unitPrice, 0);

  return <main className="container deck-main">
    <div className="deck-hero"><span className="eyebrow">DECK BUILDER</span><h1>Paste your list.<br/>We'll find the cards.</h1><p>Drop in a list from Arena, Moxfield, Archidekt or a text file. We'll match every line against live stock and add what's available to your cart in one click.</p></div>
    <div className="deck-layout">
      <section className="deck-input-panel">
        <label className="deck-label" htmlFor="deck-text">Your decklist</label>
        <textarea id="deck-text" value={text} onChange={event => setText(event.target.value)} rows={16} spellCheck={false} placeholder={SAMPLE} aria-label="Paste your decklist"/>
        <div className="deck-input-actions">
          <button className="button button-primary" onClick={search} disabled={busy || !text.trim()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Wand2 size={16}/>} {busy ? "Matching your cards…" : "Find my cards"}</button>
          <button className="button button-outline" onClick={() => { setText(SAMPLE); setRows([]); setSummary(null); }}><RotateCcw size={15}/> Sample list</button>
          <button className="button button-outline" onClick={reset} disabled={!text && !rows.length}>Clear</button>
        </div>
        <details className="deck-format-help"><summary>Formats we understand</summary><ul><li><strong>4 Lightning Bolt</strong> — plain text</li><li><strong>4x Sol Ring</strong> — with an x</li><li><strong>1 The One Ring (LTR) 241</strong> — set and collector number</li><li><strong>SB: 2 Cyclonic Rift</strong> — sideboard line</li><li><strong>Sideboard</strong> — section headings</li></ul><p>One card per line, up to 400 lines and 200 different cards. Duplicate lines are merged automatically.</p></details>
        {savedDecks.length > 0 && <div className="deck-saved"><h3><FolderOpen size={15}/> Saved decks</h3>{savedDecks.map(deck => <div className="deck-saved-row" key={deck.id}><button className="deck-saved-open" onClick={() => load(deck)}><strong>{deck.name}</strong><small>{deck.total} cards · {new Date(deck.updatedAt).toLocaleDateString("en-AU")}</small></button><button className="icon-button" aria-label={`Delete ${deck.name}`} onClick={() => remove(deck)}><Trash2 size={14}/></button></div>)}</div>}
      </section>
      <section className="deck-results">
        {!rows.length ? (error ? <EmptyState icon={<CircleAlert size={32}/>} title="We couldn't read that list" description={error}/> : <EmptyState icon={<Wand2 size={32}/>} title="Your deck, matched in seconds" description="Paste a list on the left and we'll show you exactly what's on our shelves, what's sold out, and what we'd need to order."><button className="button button-outline" onClick={() => setText(SAMPLE)}>Try a sample list</button></EmptyState>)
        : <>
          <div className="deck-summary">
            <div><strong>{summary?.totalCards ?? 0}</strong><span>cards in list</span></div>
            <div><strong>{summary?.matched ?? 0}</strong><span>recognised</span></div>
            <div className="good"><strong>{summary?.shoppable ?? 0}</strong><span>ready to buy</span></div>
            <div className={summary?.missing ? "warn" : ""}><strong>{summary?.missing ?? 0}</strong><span>unavailable</span></div>
            <div className="deck-summary-total"><span>Cost of what we have</span><strong>{money(addedCost)}</strong></div>
          </div>
          {warnings.length > 0 && <div className="deck-warnings"><AlertCircle size={14}/><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
          <div className="deck-toolbar">
            <button className="button button-primary" onClick={addAll}><ShoppingBag size={16}/> Add all in-stock cards</button>
            <button className="button button-outline" onClick={() => onOpenCart()}>Review cart</button>
            <button className="button button-outline" onClick={exportList}><Download size={15}/> Export CSV</button>
            <div className="deck-save-row">
              <input aria-label="Deck name" placeholder="Name this deck…" value={deckName} maxLength={90} onChange={event => setDeckName(event.target.value)}/>
              <button className="button button-outline" onClick={save} disabled={saving || !text.trim()}>{saving ? <LoaderCircle className="spin" size={14}/> : customer ? <Save size={14}/> : <Crown size={14}/>} {customer ? "Save" : "Sign in to save"}</button>
            </div>
          </div>
          {grouped.map(group => <div className="deck-group" key={group.section}><h3>{group.section === "Maindeck" ? "Maindeck" : group.section} <span>{group.items.length}</span></h3><div className="deck-table-wrap"><table className="deck-table"><thead><tr><th/> <th>Card</th><th>Need</th><th>Have</th><th>Price</th><th>Status</th><th/></tr></thead><tbody>{group.items.map(row => <tr key={`${row.requested}-${row.line}`} className={`deck-row status-${row.status}`}>
            <td className="deck-thumb">{row.imageUrl ? <img src={row.imageUrl} alt="" loading="lazy"/> : <span/>}</td>
            <td className="deck-name"><strong>{row.canonicalName || row.requested}</strong>{row.setName && <small>{row.setName}</small>}{row.error && <small className="deck-error">{row.error}</small>}</td>
            <td>{row.quantity}</td>
            <td className={row.available ? "good-text" : "warn-text"}>{row.available || "—"}</td>
            <td>{row.unitPrice ? money(row.unitPrice) : "—"}</td>
            <td><span className={`deck-badge badge-${row.status}`}>{row.status === "invalid" ? <CircleAlert size={11}/> : row.available ? <Check size={11}/> : null} {STATUS_LABEL[row.status]}</span></td>
            <td className="deck-row-actions">{row.variants.length > 1 ? <select aria-label={`Choose printing of ${row.requested}`} value={picked[row.requested] || row.variants[0].id} onChange={event => setPicked(current => ({ ...current, [row.requested]: event.target.value }))}>{row.variants.map(variant => <option key={variant.id} value={variant.id} disabled={!variant.quantity}>{variant.condition} · {variant.finish}{variant.quantity ? ` · ${variant.quantity} left` : " · sold out"}</option>)}</select> : null}{row.available > 0 && <button className="deck-add" onClick={() => addRow(row)}><Plus size={14}/> Add</button>}</td>
          </tr>)}</tbody></table></div></div>)}
          {orphans.length > 0 && <div className="deck-group"><h3>Other <span>{orphans.length}</span></h3><div className="deck-table-wrap"><table className="deck-table"><thead><tr><th/> <th>Card</th><th>Need</th><th>Have</th><th>Price</th><th>Status</th><th/></tr></thead><tbody>{orphans.map(row => <tr key={`${row.requested}-${row.line}`} className={`deck-row status-${row.status}`}><td className="deck-thumb">{row.imageUrl ? <img src={row.imageUrl} alt="" loading="lazy"/> : <span/>}</td><td className="deck-name"><strong>{row.canonicalName || row.requested}</strong>{row.setName && <small>{row.setName}</small>}</td><td>{row.quantity}</td><td className={row.available ? "good-text" : "warn-text"}>{row.available || "—"}</td><td>{row.unitPrice ? money(row.unitPrice) : "—"}</td><td><span className={`deck-badge badge-${row.status}`}>{STATUS_LABEL[row.status]}</span></td><td className="deck-row-actions">{row.available > 0 && <button className="deck-add" onClick={() => addRow(row)}><Plus size={14}/> Add</button>}</td></tr>)}</tbody></table></div></div>}
          <div className="deck-missing-toggle">{rows.some(row => row.status === "notstocked") && <button className="deck-toggle" onClick={() => setShowMissing(!showMissing)}>{showMissing ? "Hide" : "Show"} cards we don't stock ({rows.filter(row => row.status === "notstocked").length})</button>}</div>
        </>}
      </section>
    </div>
  </main>;
}
