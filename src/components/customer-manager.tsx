"use client";
import { useState, useEffect, useCallback } from "react";
import { Search, Users, ShoppingBag, Heart, Bell, MapPin, CircleDollarSign, Crown, ArrowLeft, LoaderCircle, Mail, Package, TrendingUp, X, Check, Plus, Minus, CalendarDays } from "lucide-react";
import { EmptyState, requestJSON } from "./ui";
import { money } from "@/lib/types";
import type { Card } from "@/lib/types";

type CustomerSummary = {
  id: string; name: string; email: string; creditBalance: number; joinedAt: string;
  orderCount: number; totalSpent: number; lastOrderAt: string | null;
  wishlistCount: number; watchlistCount: number; addressCount: number;
};
type Detail = {
  customer: { id: string; name: string; email: string; creditBalance: number; joinedAt: string };
  orders: { id: string; orderNumber: string; channel: string; status: string; total: number; createdAt: string; paymentMethod: string | null; items: { id: string; cardName: string; variant: string; quantity: number; unitPrice: number }[] }[];
  wishlist: { productId: string; addedAt: string; card: { id: string; name: string; setName: string; imageUrl: string; price: number; quantity: number; condition: string; finish: string } | null }[];
  watchlist: { productId: string; addedAt: string; lastSeenQuantity: number; lastSeenPrice: number; restocked: boolean; priceDrop: boolean; card: { id: string; name: string; setName: string; imageUrl: string; price: number; quantity: number; condition: string; finish: string } | null }[];
  addresses: { id: string; label: string; recipientName: string; line1: string; line2: string | null; suburb: string; state: string; postcode: string; phone: string | null; isDefault: boolean }[];
  credits: { id: string; amount: number; reason: string; note: string | null; orderNumber: string | null; createdAt: string }[];
};

const SORTS = [["recent", "Newest first"], ["spend", "Highest spend"], ["orders", "Most orders"], ["name", "Name A–Z"]] as const;
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("en-AU") : "—";

export function CustomerManager({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const [query, setQuery] = useState(""), [sort, setSort] = useState<string>("recent"), [page, setPage] = useState(1);
  const [data, setData] = useState<{ customers: CustomerSummary[]; total: number; page: number; size: number; totals: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null), [detail, setDetail] = useState<Detail | null>(null), [detailBusy, setDetailBusy] = useState(false);
  const [creditDraft, setCreditDraft] = useState(""), [creditReason, setCreditReason] = useState(""), [creditBusy, setCreditBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await requestJSON<{ customers: CustomerSummary[]; total: number; page: number; size: number; totals: Record<string, number> }>(`/api/customers?search=${encodeURIComponent(query)}&sort=${sort}&page=${page}`);
      setData(result);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to load customers."); }
    finally { setLoading(false); }
  }, [query, sort, page]);

  useEffect(() => { const timer = setTimeout(() => void load(), query ? 250 : 0); return () => clearTimeout(timer); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open(id: string) {
    setActiveId(id); setDetail(null); setDetailBusy(true); setCreditDraft(""); setCreditReason("");
    try { setDetail(await requestJSON<Detail>(`/api/customers?id=${id}`)); }
    catch (error) { notify(error instanceof Error ? error.message : "Unable to load that customer.", true); setActiveId(null); }
    finally { setDetailBusy(false); }
  }

  async function adjustCredit(entry: Detail["customer"], amount: number) {
    setCreditBusy(true);
    try {
      const result = await requestJSON<{ customer: { id: string; creditBalance: number } }>("/api/customers", { method: "PATCH", body: JSON.stringify({ id: entry.id, amount, reason: creditReason.trim() || undefined }) });
      setDetail(current => current ? { ...current, customer: { ...current.customer, creditBalance: result.customer.creditBalance } } : current);
      setCreditDraft(""); setCreditReason(""); await load();
      notify(`${entry.name} now has ${money(result.customer.creditBalance)} in store credit.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to adjust store credit.", true); }
    finally { setCreditBusy(false); }
  }

  if (activeId) return (
    <div className="customer-detail">
      <button className="back-link" onClick={() => { setActiveId(null); setDetail(null); }}><ArrowLeft size={14}/> All customers</button>
      {detailBusy || !detail ? <div className="admin-loading"><LoaderCircle className="spin" size={24}/>Loading customer…</div> : <>
        <div className="customer-detail-head">
          <div className="customer-avatar">{detail.customer.name.charAt(0).toUpperCase()}</div>
          <div className="customer-detail-title"><span className="eyebrow">CUSTOMER</span><h1>{detail.customer.name}</h1><div className="customer-detail-meta"><span><Mail size={13}/>{detail.customer.email}</span><span><CalendarDays size={13}/>Joined {date(detail.customer.joinedAt)}</span><span className="customer-credit-chip"><CircleDollarSign size={13}/>{money(detail.customer.creditBalance)} credit</span></div></div>
          <div className="customer-detail-actions"><a className="button button-outline" href={`mailto:${detail.customer.email}`}><Mail size={14}/> Email</a></div>
        </div>

        <div className="customer-stat-row">
          <div className="customer-stat"><Package size={17}/><strong>{detail.orders.length}</strong><span>Orders</span></div>
          <div className="customer-stat"><CircleDollarSign size={17}/><strong>{money(detail.orders.filter(order => !["Cancelled", "Refunded"].includes(order.status)).reduce((sum, order) => sum + order.total, 0))}</strong><span>Lifetime spend</span></div>
          <div className="customer-stat"><Heart size={17}/><strong>{detail.wishlist.length}</strong><span>Wishlist</span></div>
          <div className="customer-stat"><Bell size={17}/><strong>{detail.watchlist.length}</strong><span>Watch list</span></div>
          <div className="customer-stat"><MapPin size={17}/><strong>{detail.addresses.length}</strong><span>Addresses</span></div>
        </div>

        <div className="customer-detail-grid">
          <section className="admin-panel customer-panel"><div className="panel-heading"><div><h3>Order history</h3><p>Every online and in-store order on this account.</p></div></div>
            {detail.orders.length ? <div className="inventory-table-scroll"><table className="admin-table"><thead><tr><th>ORDER</th><th>PLACED</th><th>CARDS</th><th>TOTAL</th><th>STATUS</th></tr></thead><tbody>
              {detail.orders.map(order => <tr key={order.id}><td><strong className="customer-name">{order.orderNumber}</strong><small className="table-subtext">{order.channel === "pos" ? "In store" : "Online"}{order.paymentMethod ? ` · ${order.paymentMethod}` : ""}</small></td><td>{date(order.createdAt)}</td><td>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td><td className="table-price">{money(order.total)}</td><td><span className={`order-status-select status-${order.status.toLowerCase().replace(/ /g, "-")}`}>{order.status}</span></td></tr>)}
            </tbody></table></div> : <p className="customer-panel-note">No orders yet.</p>}
          </section>

          <div className="customer-side">
            <section className="admin-panel customer-panel"><div className="panel-heading"><div><h3>Store credit</h3><p>Adjust the balance and record why.</p></div></div>
              <div className="customer-credit-current"><span>Current balance</span><strong>{money(detail.customer.creditBalance)}</strong></div>
              <div className="customer-credit-form">
                <label><span>Amount (AUD)</span><div className="price-input"><span>$</span><input type="number" step="0.01" value={creditDraft} onChange={event => setCreditDraft(event.target.value)} placeholder="0.00"/></div></label>
                <label><span>Reason <em>optional</em></span><input value={creditReason} maxLength={80} onChange={event => setCreditReason(event.target.value)} placeholder="Goodwill, correction, trade-in…"/></label>
                <div className="customer-credit-buttons">
                  <button className="button button-outline" disabled={creditBusy || !creditDraft} onClick={() => adjustCredit(detail.customer, Math.round(Number(creditDraft) * 100))}><Plus size={14}/> Add</button>
                  <button className="button button-outline" disabled={creditBusy || !creditDraft} onClick={() => adjustCredit(detail.customer, -Math.round(Number(creditDraft) * 100))}><Minus size={14}/> Deduct</button>
                </div>
              </div>
              {detail.credits.length ? <div className="customer-credit-log"><h4>Recent activity</h4>{detail.credits.map(entry => <div className="customer-credit-row" key={entry.id}><span className={entry.amount > 0 ? "delta-up" : "delta-down"}>{entry.amount > 0 ? "+" : "−"}{money(Math.abs(entry.amount))}</span><div><strong>{entry.reason}</strong><small>{entry.note || (entry.orderNumber ? `Order ${entry.orderNumber}` : "Manual adjustment")} · {date(entry.createdAt)}</small></div></div>)}</div> : <p className="customer-panel-note">No credit activity yet.</p>}
            </section>

            <section className="admin-panel customer-panel"><div className="panel-heading"><div><h3>Saved addresses</h3></div></div>
              {detail.addresses.length ? detail.addresses.map(address => <div className="customer-address" key={address.id}><span className="address-top"><strong>{address.label}</strong>{address.isDefault && <em>Default</em>}</span><p>{address.recipientName}<br/>{address.line1}{address.line2 && <>{address.line2}<br/></>}{address.suburb} {address.state} {address.postcode}{address.phone && <> · {address.phone}</>}</p></div>) : <p className="customer-panel-note">No saved addresses.</p>}
            </section>
          </div>
        </div>

        <section className="admin-panel customer-panel"><div className="panel-heading"><div><h3>Wishlist & watch list</h3><p>What they're saving and waiting on.</p></div></div>
          {detail.wishlist.length || detail.watchlist.length ? <div className="customer-cards">
            {detail.wishlist.map(entry => <article className="customer-card" key={`w-${entry.productId}`}><img src={entry.card?.imageUrl || ""} alt=""/><div><strong>{entry.card?.name || "Removed card"}</strong><small>{entry.card ? `${entry.card.setName} · ${money(entry.card.price)}` : "No longer in the catalogue"}</small><div className="customer-card-flags"><span className="customer-flag wishlist"><Heart size={11}/> Wishlist</span>{entry.card && entry.card.quantity === 0 && <span className="customer-flag out">Out of stock</span>}</div></div></article>)}
            {detail.watchlist.map(entry => <article className="customer-card" key={`a-${entry.productId}`}><img src={entry.card?.imageUrl || ""} alt=""/><div><strong>{entry.card?.name || "Removed card"}</strong><small>{entry.card ? `${entry.card.setName} · ${money(entry.card.price)}` : "No longer in the catalogue"}</small><div className="customer-card-flags"><span className="customer-flag watch"><Bell size={11}/> Watching</span>{entry.restocked && <span className="customer-flag restock">Back in stock</span>}{entry.priceDrop && <span className="customer-flag drop">Price drop</span>}</div></div></article>)}
          </div> : <p className="customer-panel-note">No saved cards yet.</p>}
        </section>
      </>}
    </div>
  );

  return (
    <div className="customer-manager">
      <div className="customer-toolbar">
        <div className="inventory-search"><Search size={16}/><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search by name or email…" aria-label="Search customers"/></div>
        <select aria-label="Sort customers" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}>{SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        {data && <span className="small-counter">{data.total} {data.total === 1 ? "customer" : "customers"}</span>}
      </div>

      {data && <div className="customer-summary-row">
        <div><Users size={15}/><strong>{data.totals.customers}</strong><span>Registered</span></div>
        <div><ShoppingBag size={15}/><strong>{data.totals.withOrders}</strong><span>Have ordered</span></div>
        <div><CircleDollarSign size={15}/><strong>{money(data.totals.totalSpent)}</strong><span>Lifetime spend</span></div>
        <div><CircleDollarSign size={15}/><strong>{money(data.totals.creditOutstanding)}</strong><span>Credit owed</span></div>
        <div><Heart size={15}/><strong>{data.totals.wishlistItems}</strong><span>Wishlist items</span></div>
        <div><Bell size={15}/><strong>{data.totals.watchlistItems}</strong><span>Watch items</span></div>
      </div>}

      {loading ? <div className="admin-loading"><LoaderCircle size={24} className="spin"/>Loading customers…</div>
        : error ? <p className="form-error" role="alert">{error}</p>
        : !data?.customers.length ? <div className="admin-panel"><EmptyState icon={<Users size={33}/>} title={query ? "No customers match that search" : "No registered customers yet"} description={query ? "Try a shorter name or a different email." : "When someone creates an account — online or at the register — they'll appear here with their orders, wishlist and store credit."}/></div>
        : <>
          <section className="admin-panel"><div className="inventory-table-scroll"><table className="admin-table customer-table"><thead><tr><th>CUSTOMER</th><th>JOINED</th><th>ORDERS</th><th>SPEND</th><th>CREDIT</th><th>SAVED</th><th>LAST ORDER</th><th/></tr></thead><tbody>
            {data.customers.map(entry => <tr key={entry.id}><td><div className="customer-cell"><span className="customer-avatar small">{entry.name.charAt(0).toUpperCase()}</span><div><strong className="customer-name">{entry.name}</strong><small className="table-subtext">{entry.email}</small></div></div></td><td>{date(entry.joinedAt)}</td><td>{entry.orderCount || "—"}</td><td className="table-price">{entry.totalSpent ? money(entry.totalSpent) : "—"}</td><td>{entry.creditBalance ? <span className="customer-credit-chip">{money(entry.creditBalance)}</span> : "—"}</td><td><span className="customer-saved-counts">{entry.wishlistCount ? <span title="Wishlist"><Heart size={11}/>{entry.wishlistCount}</span> : null}{entry.watchlistCount ? <span title="Watch list"><Bell size={11}/>{entry.watchlistCount}</span> : null}{entry.addressCount ? <span title="Addresses"><MapPin size={11}/>{entry.addressCount}</span> : null}{!entry.wishlistCount && !entry.watchlistCount && !entry.addressCount ? "—" : null}</span></td><td>{date(entry.lastOrderAt)}</td><td><button className="order-view-button" onClick={() => void open(entry.id)}>View <Crown size={12}/></button></td></tr>)}
          </tbody></table></div>
            {data.total > data.size && <div className="table-pagination"><span>Showing {(data.page - 1) * data.size + 1}–{Math.min(data.page * data.size, data.total)} of {data.total}</span><div><button disabled={data.page <= 1} aria-label="Previous page" onClick={() => setPage(data.page - 1)}>‹</button><span>{data.page} / {Math.ceil(data.total / data.size)}</span><button disabled={data.page * data.size >= data.total} aria-label="Next page" onClick={() => setPage(data.page + 1)}>›</button></div></div>}
          </section>
        </>}
    </div>
  );
}
