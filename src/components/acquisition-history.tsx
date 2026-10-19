"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, requestJSON } from "./ui";
import { money } from "@/lib/types";
type Variant = {
  id: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  condition: string;
  finish: string;
  quantity: number;
  price: number;
  lotCount: number;
  acquired: string;
  knownValue: string;
  unknownUnits: string;
};
type Lot = {
  id: string;
  productId: string;
  receiptId: string | null;
  acquiredQuantity: number;
  remainingQuantity: number;
  unitCost: number | null;
  acquisitionType: string;
  acquiredAt: string;
  supplier: string | null;
  reference: string | null;
  note: string | null;
};
type History = {
  card: { name: string; imageUrl: string };
  variants: Variant[];
  sources: {
    type: string;
    receipts: number;
    acquired: string;
    remaining: string;
  }[];
  lots: Lot[];
  hasMore: boolean;
  page: number;
};
export function AcquisitionHistory({
  productId,
  onClose,
  onEdit,
  onReceive,
}: {
  productId: string;
  onClose: () => void;
  onEdit?: () => void;
  onReceive?: () => void;
}) {
  const [data, setData] = useState<History | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(
    async (page = 0) => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      setBusy(true);
      setError("");
      try {
        const result = await requestJSON<History>(
          `/api/inventory/history?productId=${productId}&page=${page}`,
          { signal: next.signal },
        );
        if (!next.signal.aborted)
          setData((prior) =>
            page && prior
              ? { ...result, lots: [...prior.lots, ...result.lots] }
              : result,
          );
      } catch (e) {
        if (!next.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load acquisition history.",
          );
      } finally {
        if (!next.signal.aborted) setBusy(false);
      }
    },
    [productId],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      controller.current?.abort();
    };
  }, [load]);
  const units = data?.variants.reduce((s, v) => s + v.quantity, 0) || 0;
  const value =
    data?.variants.reduce((s, v) => s + Number(v.knownValue), 0) || 0;
  const unknown =
    data?.variants.reduce((s, v) => s + Number(v.unknownUnits), 0) || 0;
  return (
    <Modal
      title={data ? `${data.card.name} · stock history` : "Acquisition history"}
      wide
      onClose={onClose}
    >
      <div className="acquisition-history">
        <div className="history-intro">
          <div>
            <span className="eyebrow">
              HOW THIS CARD ENTERED YOUR COLLECTION
            </span>
            <p>
              Every printing, condition and finish with recorded stock. Each
              receipt keeps its own acquisition cost.
            </p>
          </div>
          <div className="history-actions">
            {onReceive && (
              <button className="button button-primary" onClick={onReceive}>
                Add stock
              </button>
            )}
            {onEdit && (
              <button className="button button-outline" onClick={onEdit}>
                Edit selected variant
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}{" "}
            <button onClick={() => load(data ? data.page + 1 : 0)}>
              Retry
            </button>
          </p>
        )}
        {busy && !data && <p role="status">Loading receipts and printings…</p>}
        {data && (
          <>
            <div className="history-metrics">
              <div>
                <strong>{units}</strong>
                <span>copies available</span>
              </div>
              <div>
                <strong>{data.variants.length}</strong>
                <span>versions with stock history</span>
              </div>
              <div>
                <strong>{money(value)}</strong>
                <span>known remaining cost</span>
              </div>
              <div>
                <strong>{unknown}</strong>
                <span>copies with unknown cost</span>
              </div>
            </div>
            <div className="history-sources">
              {data.sources.map((s) => (
                <div key={s.type}>
                  <span
                    className={`source-badge source-${s.type === "Pack opening" ? "pack" : "other"}`}
                  >
                    {s.type}
                  </span>
                  <strong>{s.remaining} copies remaining</strong>
                  <small>
                    {s.acquired} received across {s.receipts} cost{" "}
                    {s.receipts === 1 ? "lot" : "lots"}
                  </small>
                </div>
              ))}
            </div>
            <div className="history-section-heading">
              <h3>Printings & acquisition receipts</h3>
              <span>
                {data.lots.length} of{" "}
                {data.variants.reduce((s, v) => s + v.lotCount, 0)} lots loaded
              </span>
            </div>
            {!data.variants.length && (
              <div className="history-empty">
                <h3>No acquisitions recorded yet</h3>
                <p>
                  This catalogue card is still searchable. Receive stock to
                  record its first acquisition.
                </p>
              </div>
            )}
            {data.variants.map((v) => {
              const lots = data.lots.filter((l) => l.productId === v.id);
              return (
                <details
                  className="history-variant"
                  key={v.id}
                  open={v.id === productId ? true : undefined}
                >
                  <summary>
                    <div>
                      <strong>
                        {v.setName}{" "}
                        <span>
                          ({v.setCode.toUpperCase()} #{v.collectorNumber})
                        </span>
                      </strong>
                      <small>
                        {v.condition} · {v.finish} · {v.lotCount} acquisition{" "}
                        {v.lotCount === 1 ? "lot" : "lots"}
                      </small>
                    </div>
                    <div className="history-variant-stock">
                      <strong>{v.quantity} available</strong>
                      <small>
                        Sell {money(v.price)} · {money(Number(v.knownValue))}{" "}
                        known cost
                        {Number(v.unknownUnits) > 0
                          ? ` + ${v.unknownUnits} unknown-cost copies`
                          : ""}
                      </small>
                    </div>
                  </summary>
                  <div className="history-receipts">
                    <p className="history-value-note">
                      {Number(v.unknownUnits) > 0
                        ? "Average cost and estimated margin are unknown: some remaining copies have no allocated cost."
                        : v.quantity > 0
                          ? `Average remaining cost ${money(Math.round(Number(v.knownValue) / v.quantity))} per copy · estimated gross profit ${money(Math.round(v.price - Number(v.knownValue) / v.quantity))} per copy${v.price ? ` · margin ${((1 - Number(v.knownValue) / v.quantity / v.price) * 100).toFixed(1)}%` : ""} (before fees).`
                          : "No copies currently available. Historical receipt costs are retained below."}
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>Received / source</th>
                          <th>Acquired</th>
                          <th>Remaining</th>
                          <th>Unit cost AUD</th>
                          <th>Supplier / receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lots.map((l) => (
                          <tr key={l.id}>
                            <td>
                              <strong>
                                {new Date(l.acquiredAt).toLocaleDateString(
                                  "en-AU",
                                  { timeZone: "Australia/Perth" },
                                )}
                              </strong>
                              <span className="source-badge">
                                {l.acquisitionType}
                              </span>
                            </td>
                            <td>{l.acquiredQuantity}</td>
                            <td>{l.remainingQuantity}</td>
                            <td>
                              {l.unitCost === null ? (
                                <span className="history-unknown">Unknown</span>
                              ) : (
                                money(l.unitCost)
                              )}
                            </td>
                            <td>
                              {l.supplier || "Not recorded"}
                              {l.reference && <small>{l.reference}</small>}
                              {l.note && <small>{l.note}</small>}
                              <small className="history-receipt-id">
                                {l.receiptId
                                  ? `Receipt ${l.receiptId}`
                                  : "Opening / legacy balance"}
                              </small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {lots.length < v.lotCount && (
                      <p>
                        Older receipts for this version are not loaded yet. Use
                        “Load older receipts” below.
                      </p>
                    )}
                    {!v.lotCount && (
                      <p>No acquisition lots are recorded for this variant.</p>
                    )}
                  </div>
                </details>
              );
            })}
            {data.hasMore && (
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => load(data.page + 1)}
              >
                {busy ? "Loading…" : "Load older receipts"}
              </button>
            )}
            <p className="history-footnote">
              Known remaining cost excludes copies with unknown cost. A known $0
              acquisition is shown as $0.00. Fully sold lots remain in this
              history.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
