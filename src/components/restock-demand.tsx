"use client";
import { useEffect, useState } from "react";
import { Search, Download, RefreshCw, ChevronLeft, ChevronRight, Users, PackagePlus } from "lucide-react";
import { requestJSON, Modal } from "./ui";
import { downloadCSV } from "@/lib/csv";
import type { DemandData, DemandRow } from "@/lib/admin-insights";
type People = { rows: { id: string; name: string; email: string; addedAt: string }[]; total: number; page: number; size: number };
export function RestockDemand({ onReceive }: { onReceive: (name: string) => void }) {
  const [query, setQuery] = useState(""), [stock, setStock] = useState("out"), [sort, setSort] = useState("demand"), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<DemandData | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<DemandRow | null>(null), [peoplePage, setPeoplePage] = useState(1), [people, setPeople] = useState<People | null>(null), [peopleError, setPeopleError] = useState("");
  const params = new URLSearchParams({ q: query, stock, sort, page: String(page) }).toString();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      requestJSON<DemandData>(`/api/inventory/demand?${params}`, { signal: controller.signal, cache: "no-store" }).then(result => { if (!controller.signal.aborted) setData(result); }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load demand."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [params, refresh]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    requestJSON<People>(`/api/inventory/demand?productId=${selected.productId}&page=${peoplePage}`, { signal: controller.signal, cache: "no-store" }).then(result => { if (!controller.signal.aborted) setPeople(result); }).catch(error => { if (!controller.signal.aborted) setPeopleError(error instanceof Error ? error.message : "Unable to load customers."); });
    return () => controller.abort();
  }, [selected, peoplePage]);
  function reset() { setPage(1); setData(null); setLoading(true); }
  async function exportRows() {
    setExporting(true); setError("");
    try { const response = await fetch(`/api/inventory/demand?${params}&format=csv`, { cache: "no-store" }); if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Export failed."); } downloadCSV("kings-restock-demand.csv", await response.text()); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to export demand."); }
    finally { setExporting(false); }
  }
  return <div className="admin-insights"><div className="insight-notice"><Users size={22}/><div><strong>Buy where there is real interest</strong><p>Rank exact printings, conditions and finishes by the number of customers watching them. Watchlists cover restocks and price drops: these are interested people, not reserved orders or requested copies. Watchers are not automatically newsletter subscribers.</p></div></div>
    <div className="insight-stats" aria-label="Matching watchlist demand"><div><span>Matching variants</span><strong>{data?.stats.variants ?? "—"}</strong></div><div><span>Interested customers</span><strong>{data?.stats.customers ?? "—"}</strong></div><div><span>Sold-out variants</span><strong>{data?.stats.outOfStock ?? "—"}</strong></div></div>
    <section className="admin-panel"><div className="insight-toolbar"><label className="inventory-search"><Search size={16}/><input aria-label="Search restock demand" value={query} maxLength={120} placeholder="Card, set or collector number…" onChange={e => { setQuery(e.target.value); reset(); }}/></label><select aria-label="Demand stock filter" value={stock} onChange={e => { setStock(e.target.value); reset(); }}><option value="out">Sold out</option><option value="low">Low stock (0–3)</option><option value="all">All watched variants</option></select><select aria-label="Demand sort" value={sort} onChange={e => { setSort(e.target.value); reset(); }}><option value="demand">Most interested customers</option><option value="oldest">Oldest watch first</option><option value="stock">Lowest stock</option><option value="name">Card name</option></select><button type="button" className="button button-outline" onClick={() => { setData(null); setLoading(true); setRefresh(value => value + 1); }}><RefreshCw size={15}/> Refresh</button><button type="button" className="button button-outline" disabled={exporting} onClick={() => void exportRows()}><Download size={15}/>{exporting ? "Exporting…" : "Export demand CSV"}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}{loading ? <p className="insight-empty" role="status">Loading restock demand…</p> : !data?.rows.length ? <div className="insight-empty"><h3>No watched variants match these filters.</h3><p>Try all watched variants or a broader search. Wishlists are not counted as restock requests.</p></div> : <div className="inventory-table-scroll"><table className="admin-table restock-demand-table"><thead><tr><th>Card / printing</th><th>Condition / finish</th><th>Available</th><th>Interested customers</th><th>First watched</th><th>Actions</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.productId}><td><strong>{row.name}</strong><small className="table-subtext">{row.setCode.toUpperCase()} · #{row.collectorNumber} · {row.setName}</small></td><td>{row.condition}<small className="table-subtext">{row.finish}</small></td><td>{row.quantity}</td><td><button type="button" className="demand-count" aria-label={`View watchers for ${row.name} ${row.setCode} ${row.collectorNumber} ${row.condition} ${row.finish}`} onClick={() => { setSelected(row); setPeople(null); setPeoplePage(1); setPeopleError(""); }}>{row.interested} <Users size={13}/></button></td><td>{new Date(row.oldest).toLocaleDateString("en-AU")}</td><td><button type="button" className="button button-outline" onClick={() => onReceive(row.name)}><PackagePlus size={14}/> Find in receiving</button></td></tr>)}</tbody></table></div>}
      <div className="table-pagination"><span>{data?.total ?? 0} matching variants · export includes all matching pages</span><div><button type="button" aria-label="Previous demand page" disabled={page <= 1 || loading} onClick={() => { setPage(page-1); setData(null); setLoading(true); }}><ChevronLeft size={16}/></button><span>{page} / {Math.max(1, Math.ceil((data?.total ?? 0)/25))}</span><button type="button" aria-label="Next demand page" disabled={loading || !data || page*data.size>=data.total} onClick={() => { setPage(page+1); setData(null); setLoading(true); }}><ChevronRight size={16}/></button></div></div>
    </section><p className="insight-footnote">Restock delivery is not configured: receiving stock does not currently send an email. Demand updates from the live watchlist when you refresh.</p>
    {selected && <Modal title={`Customers watching ${selected.name}`} onClose={() => setSelected(null)}><div className="insight-detail"><p>{selected.setCode.toUpperCase()} · #{selected.collectorNumber} · {selected.condition} · {selected.finish}</p><p>Restock/price-watch interest is not promotional email consent.</p>{peopleError ? <p className="form-error" role="alert">{peopleError}</p> : !people ? <p role="status">Loading interested customers…</p> : <><ul>{people.rows.map(person => <li key={person.id}><strong>{person.name}</strong><span>{person.email}</span><small>Watching since {new Date(person.addedAt).toLocaleDateString("en-AU")}</small></li>)}</ul><div className="insight-people-pages"><button type="button" disabled={peoplePage===1} onClick={() => { setPeoplePage(value => value-1); setPeople(null); }}>Previous</button><span>{people.total} customers · page {peoplePage}</span><button type="button" disabled={peoplePage*people.size>=people.total} onClick={() => { setPeoplePage(value => value+1); setPeople(null); }}>Next</button></div></>}</div></Modal>}
  </div>;
}
