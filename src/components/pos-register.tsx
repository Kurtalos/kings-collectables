"use client";
import { useStoreSettings } from "./store-settings-provider";
import { StoreBusinessDetails } from "./store-business-details";
import Link from "next/link";
import { TradePrintingPicker } from "./trade-printing-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Minus, Trash2, X, LoaderCircle, Check, Banknote, CreditCard, Wallet, Gift, ReceiptText, Printer, ArrowLeft, Users, BarChart3, RotateCcw, Crown, TriangleAlert, Percent, Package, ArrowRight, CircleDollarSign, Download } from "lucide-react";
import { Brand, requestJSON } from "./ui";
import { money, type Card, type PosCustomer, type PosSale } from "@/lib/types";
import { POS_METHODS } from "@/lib/pos";
import { downloadCSV } from "@/lib/csv";

type BasketLine = { product: Card; quantity: number; unitPrice: number | null; note: string };
type Tender = { method: string; amount: number };
type TradeIn = { receiptId?:string; productId:string; quantity:number; name: string; amount: number };
type Report = {
  costBasis: number|null; range: { from: string; to: string }; sales: number; refunds: number; gross: number; refundedTotal: number; takings: number;
  discountGiven: number; cardsSold: number; creditIssued: number; creditRedeemed: number;
  byMethod: { method: string; count: number; amount: number; refunded: number }[];
  recent: PosSale[];
};
const METHOD_ICON: Record<string, typeof Banknote> = { Cash: Banknote, Card: CreditCard, EFTPOS: CreditCard, "Store credit": Wallet, "Gift card": Gift, Other: ReceiptText };
const QUICK_CASH = [2000, 5000, 10000, 20000];

export function PosRegister({ products }: { products: Card[] }) {
  const settings = useStoreSettings();
  const saleRequestKey = useRef<string | null>(null);
  const [view, setView] = useState<"register" | "takings" | "customers">("register");
  const [stock, setStock] = useState<Map<string, number>>(() => new Map(products.map(card => [card.id, card.quantity])));
  const [query, setQuery] = useState(""), [basket, setBasket] = useState<BasketLine[]>([]);
  const [customer, setCustomer] = useState<PosCustomer | null>(null), [customerQuery, setCustomerQuery] = useState(""), [customerResults, setCustomerResults] = useState<PosCustomer[]>([]), [searchingCustomers, setSearchingCustomers] = useState(false);
  const [customerPanelOpen, setCustomerPanelOpen] = useState(true);
  const [newCustomer, setNewCustomer] = useState<{ name: string; email: string; password: string } | null>(null);
  const [tradeIns, setTradeIns] = useState<TradeIn[]>([]), [showTradeIn, setShowTradeIn] = useState(false);
  const [discount, setDiscount] = useState<{ type: "percent" | "amount"; value: string }>({ type: "percent", value: "" });
  const [tenders, setTenders] = useState<Tender[]>([{ method: "Cash", amount: 0 }]);
  const [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState<PosSale | null>(null);
  const [report, setReport] = useState<Report | null>(null), [reportBusy, setReportBusy] = useState(false), [reportError, setReportError] = useState("");
  const [range, setRange] = useState(() => new Date().toISOString().slice(0, 10));
  const [refundTarget, setRefundTarget] = useState<PosSale | null>(null), [refundReason, setRefundReason] = useState("");
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setStock(new Map(products.map(card => [card.id, card.quantity]))); }, [products]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 4000); return () => clearTimeout(timer); }, [toast]);
  const notify = (text: string, isError = false) => setToast({ text, error: isError });

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term ? products.filter(card => `${card.name} ${card.setName} ${card.setCode} ${card.collectorNumber}`.toLowerCase().includes(term)) : products.filter(card => (stock.get(card.id) || 0) > 0);
    return list.sort((a, b) => Number((stock.get(b.id) || 0) > 0) - Number((stock.get(a.id) || 0) > 0) || a.name.localeCompare(b.name)).slice(0, 24);
  }, [products, query, stock]);

  const lineTotal = basket.reduce((sum, line) => sum + (line.unitPrice ?? line.product.price) * line.quantity, 0);
  const discountValue = Math.min(lineTotal, Math.max(0, discount.type === "percent" ? Math.round(lineTotal * (Number(discount.value) || 0)) / 100 : Math.round((Number(discount.value) || 0) * 100)));
  const total = lineTotal - discountValue;
  const paid = tenders.reduce((sum, tender) => sum + tender.amount, 0);
  const change = Math.max(0, paid - total);
  const remaining = Math.max(0, total - paid);
  const creditTender = tenders.filter(tender => tender.method === "Store credit").reduce((sum, tender) => sum + tender.amount, 0);
  const unitCount = basket.reduce((sum, line) => sum + line.quantity, 0);

  function addToBasket(card: Card) {
    const available = stock.get(card.id) || 0;
    setBasket(current => {
      const existing = current.find(line => line.product.id === card.id);
      if (existing) {
        if (existing.quantity + 1 > available) { notify(`Only ${available} copies of ${card.name} are on the shelf.`, true); return current; }
        return current.map(line => line.product.id === card.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      if (available < 1) { notify(`${card.name} is out of stock.`, true); return current; }
      return [...current, { product: card, quantity: 1, unitPrice: null, note: "" }];
    });
  }
  function setQuantity(id: string, quantity: number) {
    setBasket(current => current.map(line => {
      if (line.product.id !== id) return line;
      const available = stock.get(id) || 0;
      if (quantity > available) { notify(`Only ${available} copies available.`, true); return line; }
      return { ...line, quantity: Math.max(1, quantity) };
    }));
  }
  function searchCustomers(term: string) {
    setCustomerQuery(term);
    if (term.trim().length < 2) { setCustomerResults([]); return; }
    setSearchingCustomers(true);
    requestJSON<{ customers: PosCustomer[] }>(`/api/pos?search=${encodeURIComponent(term.trim())}`)
      .then(data => setCustomerResults(data.customers))
      .catch(() => setCustomerResults([]))
      .finally(() => setSearchingCustomers(false));
  }
  async function createCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newCustomer) return;
    setBusy(true);
    try {
      const data = await requestJSON<{ customer: PosCustomer }>("/api/pos", { method: "POST", body: JSON.stringify({ action: "createCustomer", ...newCustomer }) });
      setCustomer(data.customer); setNewCustomer(null); setCustomerQuery(""); setCustomerResults([]);
      notify(`${data.customer.name} can now sign in and use store credit.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to create that profile.", true); }
    finally { setBusy(false); }
  }
  async function adjustCredit(entry: PosCustomer, amount: number, reason: string) {
    setBusy(true);
    try {
      const data = await requestJSON<{ customer: PosCustomer }>("/api/pos", { method: "POST", body: JSON.stringify({ action: "credit", customerId: entry.id, amount, reason }) });
      setCustomer(current => current?.id === data.customer.id ? data.customer : current);
      setCustomerResults(current => current.map(item => item.id === data.customer.id ? data.customer : item));
      loadReport();
      notify(`${data.customer.name} now has ${money(data.customer.creditBalance)} in store credit.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to adjust credit.", true); }
    finally { setBusy(false); }
  }
  function setMethod(method: string) {
    setTenders([{ method, amount: total }]);
  }
  function addSplit() {
    if (tenders.length >= 6) { notify("Split a sale across at most six methods.", true); return; }
    setTenders(current => [...current, { method: "Card", amount: remaining }]);
  }
  async function completeSale() {
    if (!basket.length) { notify("Add a card before completing the sale.", true); return; }
    setBusy(true); setError("");
    try {
      const data = await requestJSON<{ sale: PosSale; stock: {id:string;quantity:number}[] }>("/api/pos", {
        method: "POST",
        body: JSON.stringify({
          action: "sale",
          lines: basket.map(line => ({ productId: line.product.id, quantity: line.quantity, ...(line.unitPrice !== null ? { unitPrice: line.unitPrice } : {}), ...(line.note.trim() ? { note: line.note.trim() } : {}) })),
          discount: discountValue ? { type: discount.type, value: discount.type === "percent" ? Number(discount.value) : discountValue } : undefined,
          requestKey: (saleRequestKey.current ||= crypto.randomUUID()),
          tradeIns: tradeIns.filter(trade => trade.name.trim() && trade.amount > 0),
          payments: tenders.filter(tender => tender.amount > 0).map(tender => ({ method: tender.method, amount: tender.amount })),
          customerId: customer?.id || undefined,
          customerName: customer?.name || undefined,
          note: note.trim() || undefined,
        }),
      });
      const sale = data.sale;
      setStock(current => { const next = new Map(current); for (const card of data.stock) next.set(card.id,card.quantity); return next; });
      if (sale.customer) setCustomer(sale.customer);
      saleRequestKey.current = null;
      setReceipt(sale); setBasket([]); setTradeIns([]); setDiscount({ type: "percent", value: "" }); setNote(""); setTenders([{ method: "Cash", amount: 0 }]);
      loadReport();
    } catch (error) { const message = error instanceof Error ? error.message : "Unable to complete the sale."; setError(message); notify(message, true); }
    finally { setBusy(false); }
  }
  async function refundSale() {
    if (!refundTarget) return;
    setBusy(true);
    try {
      const data = await requestJSON<{ order: PosSale }>("/api/pos", { method: "POST", body: JSON.stringify({ action: "refund", orderId: refundTarget.id, reason: refundReason }) });
      for (const item of refundTarget.items) { const productId = item.productId; if (productId) setStock(current => new Map(current).set(productId, (current.get(productId) || 0) + item.quantity)); }
      setRefundTarget(null); setRefundReason(""); loadReport();
      notify(`${data.order.orderNumber} refunded. Stock and credit returned.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to refund that sale.", true); }
    finally { setBusy(false); }
  }
  function loadReport() {
    setReportBusy(true); setReportError("");
    const from = new Date(`${range}T00:00:00Z`).toISOString();
    const to = new Date(`${range}T23:59:59.999Z`).toISOString();
    requestJSON<Report>(`/api/pos?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(setReport)
      .catch(error => setReportError(error instanceof Error ? error.message : "Unable to load takings."))
      .finally(() => setReportBusy(false));
  }
  useEffect(() => { if (view !== "register") loadReport(); }, [view, range]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTenders(current => current.length === 1 && current[0].amount === 0 ? [{ method: current[0].method, amount: total }] : current); }, [total]); // eslint-disable-line react-hooks/exhaustive-deps
  function exportTakings() {
    if (!report) return;
    downloadCSV(`kings-pos-${range}.csv`, [
      "order_number,customer,items,cards,total,discount,payment_methods,status,date",
      ...report.recent.map(sale => [sale.orderNumber, `"${sale.customerName}"`, sale.items.length, sale.items.reduce((sum, item) => sum + item.quantity, 0), (sale.total / 100).toFixed(2), (sale.discount / 100).toFixed(2), `"${sale.tenders.map(tender => `${tender.method} ${(tender.amount / 100).toFixed(2)}`).join(" + ")}"`, sale.status, new Date(sale.createdAt).toLocaleString("en-AU")].join(",")),
    ].join("\n"));
  }

  return <div className="pos-shell">
    <header className="pos-header">
      <div className="pos-header-left"><Brand small/><span className="pos-badge"><ReceiptText size={13}/> REGISTER</span></div>
      <nav className="pos-nav">{([{ id: "register", label: "Register", icon: ReceiptText }, { id: "takings", label: "Takings", icon: BarChart3 }, { id: "customers", label: "Customers", icon: Users }] as const).map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><item.icon size={15}/>{item.label}</button>)}</nav>
      <div className="pos-header-right"><Link href="/admin" className="pos-back"><ArrowLeft size={14}/> Dashboard</Link></div>
    </header>

    {view === "register" && <main className="pos-main">
      <section className="pos-catalogue">
        <div className="pos-search"><Search size={17}/><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && results[0]) { addToBasket(results[0]); setQuery(""); } }} placeholder="Search a card, set or collector number…  (Enter adds the first result)" aria-label="Search catalogue"/></div>
        <div className="pos-results">{results.map(card => { const available = stock.get(card.id) || 0; return <button key={card.id} className={`pos-result ${available ? "" : "pos-result-empty"}`} onClick={() => addToBasket(card)} disabled={!available}><img src={card.imageUrl} alt="" loading="lazy"/><span className="pos-result-copy"><strong>{card.name}</strong><small>{card.setName} · {card.setCode.toUpperCase()} #{card.collectorNumber}</small><em>{card.condition} · {card.finish}</em></span><span className="pos-result-right"><b>{money(card.price)}</b><i className={available ? "" : "out"}>{available ? `${available} left` : "Out"}</i></span></button>; })}
        {!results.length && <div className="pos-no-results"><Search size={22}/><p>No cards match “{query}”.</p><small>Try a shorter name, a set code, or add the card to your inventory first.</small></div>}
        </div>
      </section>

      <section className="pos-basket">
        <div className="pos-basket-head"><h2>Current sale</h2><span>{unitCount} {unitCount === 1 ? "card" : "cards"} · {basket.length} {basket.length === 1 ? "line" : "lines"}</span>{basket.length > 0 && <button className="pos-clear" onClick={() => { setBasket([]); setTenders([{ method: "Cash", amount: 0 }]); }}><RotateCcw size={12}/> Clear</button>}</div>
        <div className="pos-basket-lines">{basket.length ? basket.map(line => <div className="pos-line" key={line.product.id}>
          <img src={line.product.imageUrl} alt=""/>
          <div className="pos-line-main"><strong>{line.product.name}</strong><small>{line.product.condition} · {line.product.finish} · {money(line.unitPrice ?? line.product.price)} each</small>
            <div className="pos-line-controls">
              <div className="quantity-control"><button onClick={() => setQuantity(line.product.id, line.quantity - 1)} disabled={line.quantity <= 1} aria-label={`Decrease ${line.product.name}`}><Minus size={12}/></button><span>{line.quantity}</span><button onClick={() => setQuantity(line.product.id, line.quantity + 1)} disabled={line.quantity >= (stock.get(line.product.id) || 0)} aria-label={`Increase ${line.product.name}`}><Plus size={12}/></button></div>
              <label className="pos-price-override"><span>Each $</span><input type="number" min="0" max="10000" step="0.01" value={((line.unitPrice ?? line.product.price) / 100).toFixed(2)} onChange={event => { const cents = Math.round(Number(event.target.value) * 100); setBasket(current => current.map(item => item.product.id === line.product.id ? { ...item, unitPrice: Number.isFinite(cents) && cents >= 0 ? Math.min(cents, 1000000) : null } : item)); }} aria-label={`Unit price for ${line.product.name}`}/></label>
              <button className="pos-line-remove" onClick={() => setBasket(current => current.filter(item => item.product.id !== line.product.id))} aria-label={`Remove ${line.product.name}`}><Trash2 size={13}/></button>
            </div>
            <input className="pos-line-note" value={line.note} maxLength={200} placeholder="Line note (optional)" onChange={event => setBasket(current => current.map(item => item.product.id === line.product.id ? { ...item, note: event.target.value } : item))} aria-label={`Note for ${line.product.name}`}/>
          </div>
          <b className="pos-line-total">{money((line.unitPrice ?? line.product.price) * line.quantity)}</b>
        </div>) : <div className="pos-basket-empty"><ReceiptText size={26}/><p>Nothing on the counter yet.</p><small>Search and tap a card to start a sale.</small></div>}</div>

        <div className="pos-panels">
          <details className="pos-panel pos-customer-panel" open={customerPanelOpen} onToggle={event => setCustomerPanelOpen(event.currentTarget.open)}><summary><Users size={14}/> Customer {customer ? `· ${customer.name}` : "· Walk-in"}{customer && <em>{money(customer.creditBalance)} credit</em>}</summary>
            {customer ? <div className="pos-customer-attached"><div><strong>{customer.name}</strong><small>{customer.email}</small><span className="pos-credit-pill"><CircleDollarSign size={12}/>{money(customer.creditBalance)} store credit</span></div><button className="pos-detach" onClick={() => setCustomer(null)}><X size={13}/> Detach</button></div>
              : <><div className="pos-customer-search"><Search size={14}/><input value={customerQuery} onChange={event => searchCustomers(event.target.value)} placeholder="Search by name or email…" aria-label="Search customers"/></div>
                {searchingCustomers && <p className="pos-panel-hint"><LoaderCircle size={12} className="spin"/> Searching…</p>}
                {customerResults.map(found => <button className="pos-customer-result" key={found.id} onClick={() => { setCustomer(found); setCustomerQuery(""); setCustomerResults([]); }}><span><strong>{found.name}</strong><small>{found.email}</small></span><em>{money(found.creditBalance)}</em></button>)}
                <button className="pos-link-button" onClick={() => setNewCustomer({ name: "", email: "", password: "" })}><Plus size={13}/> New customer profile</button></>}
          </details>

          <details className="pos-panel"><summary><Package size={14}/> Trade-ins {tradeIns.length > 0 && <em>{money(tradeIns.reduce((sum, trade) => sum + trade.amount, 0))}</em>}</summary>
            {!customer ? <p className="pos-panel-hint">Attach a customer first — trade-in value is stored as their store credit.</p> : <>
              {tradeIns.map((trade, index) => <div className="pos-tradein-row" key={index}><input value={trade.name} readOnly placeholder="Card name" maxLength={160} onChange={event => setTradeIns(current => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} aria-label="Trade-in card name" title={`${trade.quantity} copies received`}/><label className="pos-price-override"><span>$</span><input type="number" min="0" max="10000" step="0.01" value={(trade.amount / 100).toFixed(2)} onChange={event => setTradeIns(current => current.map((item, i) => i === index ? { ...item, amount: Math.min(1000000, Math.max(0, Math.round(Number(event.target.value) * 100))) } : item))} aria-label="Trade-in value"/><button className="pos-line-remove" onClick={() => setTradeIns(current => current.filter((_, i) => i !== index))} aria-label="Remove trade-in"><X size={13}/></button></label></div>)}
              <button className="pos-link-button" onClick={() => setShowTradeIn(true)}><Plus size={13}/> Add trade-in</button>
              <p className="pos-panel-hint">Trade-in value is added to the customer's store credit when the sale completes.</p></>}
          </details>

          <details className="pos-panel"><summary><Percent size={14}/> Discount {discountValue > 0 && <em>−{money(discountValue)}</em>}</summary>
            <div className="pos-discount-row"><div className="pos-toggle">{([["percent", "%"], ["amount", "$"]] as const).map(([type, label]) => <button key={type} className={discount.type === type ? "active" : ""} onClick={() => setDiscount(current => ({ ...current, type }))}>{label}</button>)}</div>
              <input type="number" min="0" max={discount.type === "percent" ? 100 : 10000} step={discount.type === "percent" ? "1" : "0.01"} value={discount.value} placeholder="0" onChange={event => setDiscount(current => ({ ...current, value: event.target.value }))} aria-label="Discount value"/>
              {discountValue > 0 && <button className="pos-detach" onClick={() => setDiscount({ type: "percent", value: "" })}>Clear</button>}</div>
            <p className="pos-panel-hint">{discount.type === "percent" ? "Percentage off the whole sale." : "Flat amount off the whole sale."} Recorded on the order for your books.</p>
          </details>
        </div>

        <div className="pos-totals">
          <div><span>Subtotal</span><strong>{money(lineTotal)}</strong></div>
          {discountValue > 0 && <div className="pos-discount-line"><span>Discount</span><strong>−{money(discountValue)}</strong></div>}
          <div className="pos-grand"><span>Total</span><strong>{money(total)}</strong></div>
        </div>

        <div className="pos-payment">
          <div className="pos-method-row">{POS_METHODS.filter(method => method !== "Store credit" || (customer && customer.creditBalance > 0)).map(method => { const Icon = METHOD_ICON[method] || ReceiptText; return <button key={method} className={tenders.length === 1 && tenders[0].method === method && tenders[0].amount === total ? "active" : ""} onClick={() => setMethod(method)} disabled={method === "Store credit" && (!customer || customer.creditBalance < total)}><Icon size={15}/>{method}</button>; })}</div>
          {tenders.map((tender, index) => <div className="pos-tender-row" key={index}>
            <select value={tender.method} onChange={event => setTenders(current => current.map((item, i) => i === index ? { ...item, method: event.target.value } : item))} aria-label={`Payment method ${index + 1}`}>{POS_METHODS.filter(method => method !== "Store credit" || customer).map(method => <option key={method}>{method}</option>)}</select>
            <label className="pos-price-override"><span>$</span><input type="number" min="0" max="1000000" step="0.01" value={(tender.amount / 100).toFixed(2)} onChange={event => setTenders(current => current.map((item, i) => i === index ? { ...item, amount: Math.min(100000000, Math.max(0, Math.round(Number(event.target.value) * 100))) } : item))} aria-label={`Amount for ${tender.method}`}/></label>
            {tender.method === "Store credit" && customer && <small className="pos-tender-hint">{money(customer.creditBalance)} available</small>}
            {tenders.length > 1 && <button className="pos-line-remove" onClick={() => setTenders(current => current.filter((_, i) => i !== index))} aria-label="Remove payment"><X size={13}/></button>}
          </div>)}
          {tenders.length === 1 && tenders[0].method === "Cash" && <div className="pos-cash-row"><span>Quick cash</span><div>{QUICK_CASH.map(amount => <button key={amount} onClick={() => setTenders([{ method: "Cash", amount: Math.max(amount, total) }])}>{money(amount)}</button>)}<button onClick={() => setTenders([{ method: "Cash", amount: total }])}>Exact</button></div></div>}
          {tenders.length < 6 && <button className="pos-link-button" onClick={addSplit}><Plus size={13}/> Split payment {remaining > 0 && `· ${money(remaining)} left`}</button>}
        </div>

        {error && <p className="form-error pos-error" role="alert"><TriangleAlert size={14}/>{error}</p>}
        <div className="pos-complete">
          <div className="pos-due"><span>{remaining > 0 ? "Still to collect" : change > 0 ? "Change due" : "Balanced"}</span><strong className={remaining > 0 ? "due" : change > 0 ? "change" : "balanced"}>{money(remaining > 0 ? remaining : change)}</strong></div>
          <button className="button button-primary pos-complete-button" onClick={completeSale} disabled={busy || !basket.length || remaining > 0 || (creditTender > 0 && (!customer || customer.creditBalance < creditTender))}>{busy ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} {busy ? "Completing sale…" : `Complete sale · ${money(total)}`}</button>
        </div>
      </section>
    </main>}

    {view === "takings" && <main className="pos-report">
      <div className="pos-report-head"><div><span className="eyebrow">TAKINGS</span><h1>How the counter went.</h1></div><div className="pos-report-controls"><input type="date" value={range} max={new Date().toISOString().slice(0, 10)} onChange={event => setRange(event.target.value)} aria-label="Takings date"/><button className="button button-outline" onClick={exportTakings} disabled={!report?.recent.length}><Download size={14}/> Export CSV</button></div></div>
      {reportBusy ? <div className="admin-loading"><LoaderCircle className="spin" size={24}/> Loading takings…</div> : reportError ? <p className="form-error" role="alert">{reportError}</p> : report && <>
        <div className="pos-stat-grid">
          <div className="pos-stat"><span>Gross profit / margin (before fees)</span><strong>{report.costBasis === null ? "Unknown cost" : money(report.gross - report.costBasis)}</strong><small>{report.costBasis === null ? "Some sale costs are unknown; no invented profit" : `${report.gross ? ((report.gross-report.costBasis)/report.gross*100).toFixed(1) : 0}% margin · FIFO COGS ${money(report.costBasis)}`}</small></div><div className="pos-stat"><span>Takings</span><strong>{money(report.takings)}</strong><small>{report.sales} sales · {report.refunds} refunds</small></div>
          <div className="pos-stat"><span>Gross sales</span><strong>{money(report.gross)}</strong><small>Before refunds</small></div>
          <div className="pos-stat"><span>Refunded</span><strong>{money(report.refundedTotal)}</strong><small>Returned to customers</small></div>
          <div className="pos-stat"><span>Cards sold</span><strong>{report.cardsSold}</strong><small>Across {report.sales} sales</small></div>
          <div className="pos-stat"><span>Discounts given</span><strong>{money(report.discountGiven)}</strong><small>Goodwill at the counter</small></div>
          <div className="pos-stat"><span>Credit issued</span><strong>{money(report.creditIssued)}</strong><small>Redeemed {money(report.creditRedeemed)}</small></div>
        </div>
        <section className="admin-panel pos-method-panel"><h3>By payment method</h3>{report.byMethod.length ? <div className="pos-method-grid">{report.byMethod.map(row => <div key={row.method}><span>{row.method}</span><strong>{money(row.amount)}</strong><small>{row.count} tenders{row.refunded ? ` · ${money(row.refunded)} refunded` : ""}</small></div>)}</div> : <p className="pos-panel-hint">No sales recorded for this date.</p>}</section>
        <section className="admin-panel"><div className="panel-heading"><div><h3>Register sales</h3><p>Every face-to-face sale, sharing one inventory with your online store.</p></div></div>
          {report.recent.length ? <div className="inventory-table-scroll"><table className="admin-table pos-sales-table"><thead><tr><th>RECEIPT</th><th>CUSTOMER</th><th>CARDS</th><th>TOTAL</th><th>PAID WITH</th><th>WHEN</th><th/></tr></thead><tbody>{report.recent.map(sale => <tr key={sale.id} className={sale.refundedAt ? "refunded-row" : ""}>
            <td><button className="order-number" onClick={() => setReceipt(sale)}>{sale.orderNumber}</button>{sale.discount > 0 && <small className="table-subtext">−{money(sale.discount)} discount</small>}{sale.note && <small className="table-subtext">{sale.note}</small>}</td>
            <td><strong className="customer-name">{sale.customerName}</strong></td>
            <td>{sale.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
            <td className="table-price">{money(sale.total)}</td>
            <td>{sale.tenders.map(tender => <span className="pos-tender-chip" key={tender.method}>{tender.method} {money(tender.amount)}</span>)}</td>
            <td>{new Date(sale.createdAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}</td>
            <td>{sale.refundedAt ? <span className="pos-refunded-badge">Refunded</span> : <button className="order-view-button" onClick={() => { setRefundTarget(sale); setRefundReason(""); }}><RotateCcw size={12}/> Refund</button>}</td>
          </tr>)}</tbody></table></div> : <p className="pos-panel-hint">No register sales on this date yet.</p>}</section>
      </>}
    </main>}

    {view === "customers" && <main className="pos-report">
      <div className="pos-report-head"><div><span className="eyebrow">CUSTOMERS</span><h1>Store credit & profiles.</h1></div></div>
      <section className="admin-panel"><div className="panel-heading"><div><h3>Find a customer</h3><p>Attach a profile at the register to redeem or issue store credit. Profiles share the same accounts your web customers create.</p></div></div>
        <div className="pos-customer-manager"><div className="pos-customer-search"><Search size={14}/><input value={customerQuery} onChange={event => searchCustomers(event.target.value)} placeholder="Search by name or email…" aria-label="Search customers"/></div>
          {customerResults.map(found => <div className="pos-customer-card" key={found.id}><div><strong>{found.name}</strong><small>{found.email}</small><span className="pos-credit-pill"><CircleDollarSign size={12}/>{money(found.creditBalance)} store credit</span></div>
            <div className="pos-customer-actions"><button className="button button-outline" onClick={() => adjustCredit(found, 500, "Store credit added")} disabled={busy}>+ $5</button><button className="button button-outline" onClick={() => adjustCredit(found, -500, "Store credit removed")} disabled={busy || found.creditBalance < 500}>− $5</button><button className="button button-primary" onClick={() => { setCustomer(found); setView("register"); notify(`${found.name} attached at the register.`); }} disabled={busy}>Use at register</button></div></div>)}
          {!customerResults.length && <p className="pos-panel-hint">Type at least two characters to search. Customers who register online appear here too.</p>}
          <button className="pos-link-button" onClick={() => setNewCustomer({ name: "", email: "", password: "" })}><Plus size={13}/> New customer profile</button>
        </div></section>
    </main>}

    {newCustomer && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setNewCustomer(null); }}><div className="modal-panel" role="dialog" aria-modal="true" aria-label="New customer profile"><div className="modal-heading"><h2>New customer profile</h2><button className="icon-button" aria-label="Close dialog" onClick={() => setNewCustomer(null)}><X size={21}/></button></div>
      <form className="stack-form pos-new-customer" onSubmit={createCustomer}><p className="pos-panel-hint">They can sign in with these details on the web store, track orders, and hold store credit.</p>
        <label>Full name<input value={newCustomer.name} maxLength={120} required onChange={event => setNewCustomer(current => current ? { ...current, name: event.target.value } : current)} placeholder="Alex Planeswalker"/></label>
        <label>Email address<input type="email" value={newCustomer.email} maxLength={254} required onChange={event => setNewCustomer(current => current ? { ...current, email: event.target.value } : current)} placeholder="alex@example.com"/></label>
        <label>Temporary password<input type="text" value={newCustomer.password} minLength={8} maxLength={72} required onChange={event => setNewCustomer(current => current ? { ...current, password: event.target.value } : current)} placeholder="At least 8 characters"/></label>
        <button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Crown size={16}/>} Create profile</button></form></div></div>}

    {showTradeIn && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowTradeIn(false); }}><div className="modal-panel" role="dialog" aria-modal="true" aria-label="Add trade-in"><div className="modal-heading"><h2>Add a trade-in</h2><button className="icon-button" aria-label="Close dialog" onClick={() => setShowTradeIn(false)}><X size={21}/></button></div>
      <form className="stack-form pos-new-customer" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const printing = JSON.parse(String(form.get("printing"))); const name = printing.name; const quantity = Number(form.get("quantity")); const amount = Math.round(Number(form.get("amount")) * 100); if (!name || !(amount > 0)) { notify("Enter a card name and a value above $0.", true); return; } setTradeIns(current => [...current, { name, amount, productId:printing.id, quantity, receiptId:String(form.get("receiptId") || "").trim() || undefined }]); setShowTradeIn(false); }}>
        <TradePrintingPicker/>
        <details><summary>Already received and credited?</summary><label>Existing trade receipt ID<input name="receiptId" placeholder="Optional: inventory receipt UUID"/></label><p>Linked receipts do not add stock or issue credit again.</p></details><label>Credit value (AUD)<input name="amount" type="number" min="0.01" max="10000" step="0.01" required placeholder="0.00"/></label>
        <p className="pos-panel-hint">The value is added to the customer's store credit when the sale completes. The exact printing is received into inventory with its acquisition cost in the same transaction. Do not receive these cards a second time.</p>
        <button className="button button-primary">Add trade-in</button></form></div></div>}

    {refundTarget && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setRefundTarget(null); }}><div className="modal-panel" role="dialog" aria-modal="true" aria-label={`Refund ${refundTarget.orderNumber}`}><div className="modal-heading"><h2>Refund {refundTarget.orderNumber}</h2><button className="icon-button" aria-label="Close dialog" onClick={() => setRefundTarget(null)}><X size={21}/></button></div>
      <div className="confirmation-content"><p>Refunding returns <strong>{refundTarget.items.reduce((sum, item) => sum + item.quantity, 0)} cards</strong> to inventory and reverses {money(refundTarget.total)} of takings. Store credit used on this sale goes back to the customer.</p>
        <label className="stack-form">Reason<textarea rows={3} maxLength={200} value={refundReason} onChange={event => setRefundReason(event.target.value)} placeholder="Returned unopened, wrong card supplied, customer changed their mind…"/></label>
        <div><button className="button button-outline" onClick={() => setRefundTarget(null)} disabled={busy}>Keep the sale</button><button className="button button-danger" onClick={refundSale} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15}/> : <RotateCcw size={15}/>} Refund {money(refundTarget.total)}</button></div></div></div></div>}

    {receipt && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setReceipt(null); }}><div className="modal-panel pos-receipt-panel" role="dialog" aria-modal="true" aria-label={`Receipt ${receipt.orderNumber}`}><div className="modal-heading pos-no-print"><h2>Sale complete</h2><button className="icon-button" aria-label="Close receipt" onClick={() => setReceipt(null)}><X size={21}/></button></div>
      <div className="pos-receipt" id="pos-receipt">
        <div className="pos-receipt-brand"><Crown size={20}/><strong>{settings.storeName.toUpperCase()}</strong><span>Independent Australian card store</span><StoreBusinessDetails/></div>
        <div className="pos-receipt-meta"><div><span>Receipt</span><strong>{receipt.orderNumber}</strong></div><div><span>Date</span><strong>{new Date(receipt.createdAt).toLocaleString("en-AU")}</strong></div><div><span>Customer</span><strong>{receipt.customerName}</strong></div></div>
        <table className="pos-receipt-table"><tbody>{receipt.items.map(item => <tr key={item.id}><td>{item.quantity} × {item.cardName}<small>{item.variant}</small></td><td>{money(item.unitPrice * item.quantity)}</td></tr>)}</tbody></table>
        <div className="pos-receipt-totals">{receipt.discount > 0 && <div><span>Discount</span><strong>−{money(receipt.discount)}</strong></div>}<div><span>Subtotal</span><strong>{money(receipt.subtotal)}</strong></div><div className="pos-receipt-grand"><span>Total</span><strong>{money(receipt.total)} AUD</strong></div>
          {receipt.tenders.map(tender => <div key={tender.method}><span>{tender.method}</span><strong>{money(tender.amount)}</strong></div>)}
          {receipt.change ? <div className="pos-receipt-change"><span>Change</span><strong>{money(receipt.change)}</strong></div> : null}
          {receipt.tradeTotal ? <div><span>Trade-in credit issued</span><strong>{money(receipt.tradeTotal)}</strong></div> : null}
          {receipt.customer ? <div><span>Store credit balance</span><strong>{money(receipt.customer.creditBalance)}</strong></div> : null}
        </div>
        {receipt.note && <p className="pos-receipt-note">{receipt.note}</p>}
        <p className="pos-receipt-footer">Thank you for shopping independent. ♔<br/>Keep this receipt for returns and exchanges.</p>
      </div>
      <div className="pos-receipt-actions pos-no-print"><button className="button button-outline" onClick={() => window.print()}><Printer size={15}/> Print receipt</button><button className="button button-primary" onClick={() => { setReceipt(null); searchRef.current?.focus(); }}>Next sale <ArrowRight size={15}/></button></div>
    </div></div>}

    {toast && <div className={`toast pos-no-print ${toast.error ? "toast-error" : ""}`} role="status">{toast.error ? <TriangleAlert size={17}/> : <Check size={17}/>}<span>{toast.text}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={14}/></button></div>}
  </div>;
}
