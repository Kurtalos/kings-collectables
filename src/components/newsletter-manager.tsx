"use client";
import { useEffect, useState } from "react";
import { Search, Download, Trash2, Mail, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { requestJSON } from "./ui";
import { downloadCSV } from "@/lib/csv";
import type { SubscriberData } from "@/lib/admin-insights";
export function NewsletterManager() {
  const [query, setQuery] = useState(""), [sort, setSort] = useState("newest"), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<SubscriberData | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const params = new URLSearchParams({ q: query, sort, page: String(page) }).toString();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      requestJSON<SubscriberData>(`/api/newsletter/subscribers?${params}`, { cache: "no-store", signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result); }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load sign-ups."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [params, refresh]);
  function reload() { setLoading(true); setData(null); setRefresh(value => value+1); }
  async function exportRows() {
    setBusy(true); setError("");
    try { const response = await fetch(`/api/newsletter/subscribers?${params}&format=csv`, { cache: "no-store" }); if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Export failed."); } downloadCSV("kings-newsletter-signups.csv", await response.text()); setMessage("Website sign-ups exported. Apply your email provider’s consent and suppression rules before sending."); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to export sign-ups."); }
    finally { setBusy(false); }
  }
  async function remove(email: string) {
    if (!window.confirm(`Remove ${email} from this website’s newsletter list? Also remove/suppress this address in any external email service you use; this does not sync with that service.`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await requestJSON("/api/newsletter/subscribers", { method: "DELETE", body: JSON.stringify({ email }) }); setMessage("Removed from the website list. Update any external email provider separately."); setPage(1); reload(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to remove subscriber."); }
    finally { setBusy(false); }
  }
  return <div className="admin-insights"><div className="insight-notice"><Mail size={23}/><div><strong>Build an audience without mixing up consent</strong><p>These are website newsletter sign-ups only. Creating an account, placing an order or watching a card does not add someone to this list. Sign-ups are not double-opt-in verified.</p></div></div><div className="insight-stats" aria-label="All website newsletter sign-ups"><div><span>Website sign-ups</span><strong>{data?.stats.total ?? "—"}</strong></div><div><span>Signed up in last 30 days</span><strong>{data?.stats.recent ?? "—"}</strong></div><div><span>Also have a customer account</span><strong>{data?.stats.withAccount ?? "—"}</strong></div></div>
    <section className="admin-panel"><div className="insight-toolbar"><label className="inventory-search"><Search size={16}/><input aria-label="Search newsletter sign-ups" maxLength={120} placeholder="Search email addresses…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); setData(null); setLoading(true); }}/></label><select aria-label="Newsletter sort" value={sort} onChange={e => { setSort(e.target.value); setPage(1); setData(null); setLoading(true); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="email">Email A–Z</option></select><button type="button" className="button button-outline" disabled={busy} onClick={reload}><RefreshCw size={15}/> Refresh</button><button type="button" className="button button-outline" disabled={busy} onClick={() => void exportRows()}><Download size={15}/>{busy ? "Working…" : "Export sign-ups CSV"}</button></div>{message && <p role="status" className="pages-status">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}{loading ? <p role="status" className="insight-empty">Loading newsletter sign-ups…</p> : !data?.rows.length ? <div className="insight-empty"><h3>No sign-ups match this search.</h3><p>Customers can sign up using the form in the storefront footer.</p></div> : <div className="inventory-table-scroll"><table className="admin-table newsletter-table"><thead><tr><th>Email</th><th>Website sign-up date</th><th>Actions</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.email}><td>{row.email}</td><td>{new Date(row.joinedAt).toLocaleDateString("en-AU")}</td><td><button type="button" className="button button-outline" disabled={busy} aria-label={`Remove subscriber ${row.email}`} onClick={() => void remove(row.email)}><Trash2 size={14}/> Remove</button></td></tr>)}</tbody></table></div>}
      <div className="table-pagination"><span>{data?.total ?? 0} matching sign-ups · export includes all matching pages</span><div><button type="button" aria-label="Previous newsletter page" disabled={loading || page<=1} onClick={() => { setPage(page-1); setData(null); setLoading(true); }}><ChevronLeft size={16}/></button><span>{page} / {Math.max(1, Math.ceil((data?.total ?? 0)/25))}</span><button type="button" aria-label="Next newsletter page" disabled={loading || !data || page*data.size>=data.total} onClick={() => { setPage(page+1); setData(null); setLoading(true); }}><ChevronRight size={16}/></button></div></div>
    </section><section className="insight-next-steps"><h2>Customer tools, in the right place</h2><div><article><h3>Customer directory</h3><p>Review order history, saved addresses, wishlists and watchlists. Manage store credit with an audit reason in the existing customer profile.</p></article><article><h3>Inbox</h3><p>Handle website enquiries and reply individually. Keep order support separate from promotional messaging.</p></article><article><h3>Campaigns — next step</h3><p>No promotional email is sent from here. Choose an email provider with unsubscribe links, suppression/bounce handling and consent management before enabling newsletters, offers or automated campaigns.</p></article></div></section>
  </div>;
}
