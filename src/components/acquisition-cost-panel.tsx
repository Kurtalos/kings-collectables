"use client";
import { useEffect, useState } from "react";
import { requestJSON } from "./ui";
import { money } from "@/lib/types";
type Variant = {
  id: string;
  quantity: number;
  lotCount: number;
  knownValue: string;
  unknownUnits: string;
};
type Lot = {
  id: string;
  unitCost: number | null;
  acquiredQuantity: number;
  remainingQuantity: number;
  acquisitionType: string;
  acquiredAt: string;
  reference: string | null;
};
type CostData = {
  variants: Variant[];
  lots: Lot[];
  hasMore: boolean;
  page: number;
};
/** Owner-only costs are fetched independently, never attached to public catalogue cards. */
export function AcquisitionCostPanel({
  productId,
  onViewHistory,
}: {
  productId: string;
  onViewHistory?: () => void;
}) {
  const [data, setData] = useState<CostData | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [expanded, setExpanded] = useState(false),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    requestJSON<CostData>(
      `/api/inventory/history?productId=${productId}&scope=variant`,
      { signal: abort.signal },
    )
      .then((result) => {
        if (!abort.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load acquisition costs.",
          );
      });
    return () => abort.abort();
  }, [productId, attempt]);
  async function loadOlder() {
    if (!data || loading) return;
    setLoading(true);
    try {
      const next = await requestJSON<CostData>(
        `/api/inventory/history?productId=${productId}&scope=variant&page=${data.page + 1}`,
      );
      setData((prior) =>
        prior ? { ...next, lots: [...prior.lots, ...next.lots] } : next,
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load older costs.");
    } finally {
      setLoading(false);
    }
  }
  const variant = data?.variants.find((v) => v.id === productId);
  const known = Number(variant?.knownValue || 0),
    unknown = Number(variant?.unknownUnits || 0),
    units = variant?.quantity || 0;
  const visible = expanded ? data?.lots : data?.lots.slice(0, 3);
  return (
    <section
      className="card-paid-panel"
      aria-label="What you paid for this variant"
    >
      <div className="card-paid-heading">
        <div>
          <span className="eyebrow">OWNER ONLY · ACQUISITION COST</span>
          <h3>What you paid</h3>
        </div>
        {onViewHistory && (
          <button type="button" onClick={onViewHistory}>
            All versions & receipts →
          </button>
        )}
      </div>
      <p className="card-paid-intro">
        For this exact printing, condition and finish—not the selling price.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              setAttempt((a) => a + 1);
            }}
          >
            Retry
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Loading acquisition costs…</p>}
      {data && (
        <>
          {!data.lots.length ? (
            <p className="card-paid-empty">
              No acquisition receipts for this variant yet. A selling price is
              not an acquisition cost. Use Receive stock to record what you
              paid.
            </p>
          ) : (
            <>
              <div className="card-paid-metrics">
                <div>
                  <small>Average cost / available copy</small>
                  <strong>
                    {unknown
                      ? "Unknown"
                      : units
                        ? money(Math.round(known / units))
                        : "No stock"}
                  </strong>
                </div>
                <div>
                  <small>
                    {unknown
                      ? "Known portion of remaining cost"
                      : "Total remaining acquisition cost"}
                  </small>
                  <strong>{money(known)}</strong>
                </div>
              </div>
              {unknown > 0 && (
                <p className="card-paid-unknown">
                  {unknown} of {units} available copies have unknown cost. These
                  are not counted as free.
                </p>
              )}
              <div className="card-paid-table">
                <table>
                  <thead>
                    <tr>
                      <th>Received / source</th>
                      <th>Copies</th>
                      <th>Paid / copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible?.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <strong>{l.acquisitionType}</strong>
                          <small>
                            {new Date(l.acquiredAt).toLocaleDateString(
                              "en-AU",
                              { timeZone: "Australia/Perth" },
                            )}
                            {l.reference ? ` · ${l.reference}` : ""}
                          </small>
                        </td>
                        <td>
                          {l.acquiredQuantity}
                          <small>{l.remainingQuantity} left</small>
                        </td>
                        <td className="card-paid-cost">
                          {l.unitCost === null ? "Unknown" : money(l.unitCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(data.lots.length > 3 || data.hasMore) && (
                <button
                  type="button"
                  className="card-paid-toggle"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded
                    ? "Show fewer receipts"
                    : `Show receipt history (${variant?.lotCount || data.lots.length} lots)`}
                </button>
              )}
              {expanded && data.hasMore && (
                <button type="button" disabled={loading} onClick={loadOlder}>
                  {loading ? "Loading…" : "Load older receipts"}
                </button>
              )}
              <small className="card-paid-footnote">
                Costs are in AUD per copy. Multiple receipts may have different
                costs. $0.00 means a known free acquisition; Unknown means no
                cost was recorded.
              </small>
            </>
          )}
        </>
      )}
    </section>
  );
}
