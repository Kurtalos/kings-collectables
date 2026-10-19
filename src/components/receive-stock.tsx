"use client";
import { useEffect, useState } from "react";
import { requestJSON } from "./ui";
import { AcquisitionHistory } from "./acquisition-history";
import { ACQUISITION_TYPES } from "@/lib/inventory-input";
import { CONDITIONS, FINISHES, money } from "@/lib/types";
import { parseCSV, downloadCSV } from "@/lib/csv";

type Card = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  quantity: number;
  price: number;
  condition: string;
  finish: string;
};
type Row = Record<string, string>;
const fields = [
  "name",
  "scryfall_id",
  "set",
  "collector_number",
  "quantity",
  "condition",
  "finish",
  "acquisition_type",
  "unit_cost_aud",
  "supplier",
  "reference",
  "date",
  "note",
];
const template =
  fields.join(",") +
  '\nSol Ring,,cmm,396,2,Near mint,Non-foil,Purchase,1.50,Local collection,RCPT-001,2026-10-19,"Example only; confirm printing"\n';
export function ReceiveStock({
  onComplete = () => {},
  initialQuery = "",
}: {
  initialQuery?: string;
  onComplete?: () => void;
}) {
  const [q, setQ] = useState(initialQuery),
    [page, setPage] = useState(0),
    [cards, setCards] = useState<Card[]>([]),
    [hasMore, setHasMore] = useState(false);
  const [rows, setRows] = useState<Row[]>([]),
    [type, setType] = useState("Purchase"),
    [cost, setCost] = useState(""),
    [supplier, setSupplier] = useState(""),
    [reference, setReference] = useState(""),
    [date, setDate] = useState(""),
    [note, setNote] = useState("");
  const [csv, setCSV] = useState<{
      headers: string[];
      rows: string[][];
      errors: Record<number, string>;
    } | null>(null),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [paste, setPaste] = useState("");
  const [preview, setPreview] = useState<{
    importId: string;
    rows: { row: number; name: string; error?: string; existing?: boolean }[];
    summary: {
      lines: number;
      units: number;
      knownCost: number;
      unknownLines: number;
      duplicates: number;
      invalid: number;
      existing: number;
    };
  } | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [totals, setTotals] = useState<{
      units: string;
      knownValue: string;
      unknownUnits: string;
    } | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(""),
    [credit, setCredit] = useState("");
  const [customerQuery, setCustomerQuery] = useState(""),
    [customers, setCustomers] = useState<
      { id: string; name: string; email: string }[]
    >([]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      requestJSON<{
        cards: Card[];
        hasMore: boolean;
        totals: NonNullable<typeof totals>;
      }>(`/api/inventory?q=${encodeURIComponent(q)}&page=${page}`, {
        signal: controller.signal,
      })
        .then((r) => {
          setCards(r.cards);
          setHasMore(r.hasMore);
          setTotals(r.totals);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, page, message]);
  async function review(inputs: Row[]) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await requestJSON<NonNullable<typeof preview>>(
        "/api/inventory",
        {
          method: "POST",
          body: JSON.stringify({
            action: "preview",
            rows: inputs.map((r) => ({
              acquisition_type: type,
              unit_cost_aud: cost,
              supplier,
              reference,
              date,
              note,
              ...r,
            })),
            ...(customerId
              ? {
                  trade: {
                    customerId,
                    amount: Math.round(Number(credit) * 100),
                  },
                }
              : {}),
          }),
        },
      );
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to preview.");
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setError("");
    try {
      const saved = await requestJSON<{ receipt: { id: string } }>(
        "/api/inventory",
        {
          method: "POST",
          body: JSON.stringify({
            action: "commit",
            importId: preview?.importId,
          }),
        },
      );
      setPreview(null);
      setRows([]);
      setCSV(null);
      setMessage(
        `Stock received. Receipt ${saved.receipt.id}. Lots and available quantities saved together.`,
      );
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  function loadCSV(text: string) {
    try {
      const parsed = parseCSV(text, true);
      setCSV(parsed);
      setMapping(
        Object.fromEntries(
          fields.map((f) => [
            f,
            parsed.headers.find((h) => h.toLowerCase() === f) || "",
          ]),
        ),
      );
      setPreview(null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid CSV");
    }
  }
  const defaults = (
    <div className="stack-form">
      <div className="form-two-columns">
        <label>
          Acquisition type
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              if (e.target.value !== "Trade-in") setCustomerId("");
              setPreview(null);
            }}
          >
            {ACQUISITION_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Default cost for new cards (AUD)
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            placeholder="Blank = unknown, 0 = known free"
            onChange={(e) => {
              setCost(e.target.value);
              setPreview(null);
            }}
          />
        </label>
      </div>
      <details>
        <summary>More details — supplier, date, receipt and note</summary>
        <div className="form-two-columns">
          <label>
            Supplier / trader
            <input
              value={supplier}
              maxLength={500}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </label>
          <label>
            Receipt / reference
            <input
              value={reference}
              maxLength={500}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <label>
            Acquisition date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Note
            <input
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
      </details>
      {type === "Trade-in" && (
        <details>
          <summary>
            Issue agreed store credit with this receipt (optional)
          </summary>
          <p>
            Do not use this if credit was already issued at the register. Credit
            and inventory are saved once per confirmed receipt.
          </p>
          <label>
            Find customer
            <input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
            />
          </label>
          <button
            className="button button-outline"
            onClick={async () => {
              try {
                const r = await requestJSON<{ customers: typeof customers }>(
                  `/api/customers?search=${encodeURIComponent(customerQuery)}`,
                );
                setCustomers(r.customers);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Find customer
          </button>
          <label>
            Customer
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">No credit adjustment</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Agreed total credit (AUD)
            <input
              type="number"
              min="0"
              step="0.01"
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
            />
          </label>
        </details>
      )}
    </div>
  );
  return (
    <section className="receive-workspace">
      <header>
        <span className="eyebrow">INVENTORY INTAKE</span>
        <h2>Receive stock</h2>
        <p>
          Find your cards, build a receipt, and receive everything together.
          Your selling prices stay unchanged.
        </p>
        <ol className="receive-steps" aria-label="Receiving steps">
          <li className={!preview ? "current" : "complete"}>
            <span>1</span> Find cards
          </li>
          <li className={rows.length && !preview ? "current" : ""}>
            <span>2</span> Build receipt
          </li>
          <li className={preview ? "current" : ""}>
            <span>3</span> Review & receive
          </li>
        </ol>
      </header>
      {totals && (
        <details className="receive-snapshot">
          <summary>Inventory snapshot</summary>
          <div className="receive-stats">
            <span>
              <strong>{Number(totals.units).toLocaleString()}</strong> available
              units
            </span>
            <span>
              <strong>{money(Number(totals.knownValue))}</strong> known
              remaining cost
            </span>
            <span>
              <strong>{Number(totals.unknownUnits).toLocaleString()}</strong>{" "}
              units with unknown cost
            </span>
          </div>
        </details>
      )}
      {historyId && (
        <AcquisitionHistory
          key={historyId}
          productId={historyId}
          onClose={() => setHistoryId(null)}
        />
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {preview ? (
        <div className="stack-form">
          <h3>Review receipt</h3>
          <p>
            {preview.summary.lines} valid lines · {preview.summary.units} units
            · {money(preview.summary.knownCost)} known cost ·{" "}
            {preview.summary.unknownLines} unknown-cost lines
          </p>
          <p>
            {preview.summary.existing} existing variants ·{" "}
            {preview.summary.duplicates} duplicate lines (retained as separate
            cost lots) · {preview.summary.invalid} invalid rows (will not be
            saved)
          </p>
          <div className="receive-scroll">
            {preview.rows.map((r) => (
              <p key={r.row}>
                Line {r.row}: {r.name} —{" "}
                {r.error ||
                  (r.existing
                    ? "Matched existing inventory"
                    : "New condition / finish variant")}
              </p>
            ))}
          </div>
          <p>Only valid rows will be received, together in one transaction.</p>
          <div>
            <button
              className="button button-outline"
              onClick={() => setPreview(null)}
              disabled={busy}
            >
              Back to editing
            </button>{" "}
            <button
              className="button button-primary"
              disabled={busy || !preview.summary.lines}
              onClick={commit}
            >
              {busy ? "Saving…" : "Confirm and add stock"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="receive-builder">
            <div className="receive-search">
              <div className="receive-panel-title">
                <span className="receive-step-number">1</span>
                <div>
                  <h3>Find a printing</h3>
                  <p>Search any card, even when it’s out of stock.</p>
                </div>
              </div>
              <label>
                Search the complete catalogue
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Card name, printing, set or collector number"
                />
              </label>
              <div className="receive-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Printing / variant</th>
                      <th>Available</th>
                      <th>Selling price</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!cards.length && (
                      <tr>
                        <td colSpan={4}>
                          No matching printings. Try a card name, set code or
                          collector number.
                        </td>
                      </tr>
                    )}
                    {cards.map((c) => (
                      <tr key={c.id}>
                        <td>
                          {c.name}
                          <small>
                            {c.setCode.toUpperCase()} #{c.collectorNumber} ·{" "}
                            {c.condition} · {c.finish}
                          </small>
                        </td>
                        <td>{c.quantity}</td>
                        <td>{money(c.price)}</td>
                        <td>
                          <button
                            className="button button-outline"
                            onClick={() =>
                              setRows((r) => [
                                ...r,
                                {
                                  productId: c.id,
                                  name: c.name,
                                  printing: `${c.setCode.toUpperCase()} #${c.collectorNumber}`,
                                  acquisition_type: type,
                                  quantity: "1",
                                  condition: c.condition,
                                  finish: c.finish,
                                  unit_cost_aud: cost,
                                },
                              ])
                            }
                          >
                            Add stock
                          </button>{" "}
                          <button
                            onClick={() => setHistoryId(c.id)}
                            aria-label={`View stock history for ${c.name}`}
                          >
                            History
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>{" "}
              <span>Page {page + 1}</span>{" "}
              <button disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
            <aside className="receive-receipt">
              <div className="receive-panel-title">
                <span className="receive-step-number">2</span>
                <div>
                  <h3>
                    Your receipt <em>{rows.length}</em>
                  </h3>
                  <p>Add as many cards as you need before saving.</p>
                </div>
              </div>
              <div className="receive-defaults">
                {defaults}
                <small>
                  Defaults apply to cards you add next. Each line can have its
                  own source and cost. Blank cost means unknown.
                </small>
              </div>
              {!rows.length && (
                <div className="receive-empty">
                  <span aria-hidden="true">＋</span>
                  <h4>Start with a card</h4>
                  <p>
                    Use “Add stock” in search. Your cards will appear here,
                    ready for quantities and costs.
                  </p>
                </div>
              )}
              {rows.length > 0 && (
                <div className="stack-form">
                  <h4 className="receipt-lines-heading">
                    Receipt lines ({rows.length})
                  </h4>
                  <div className="receive-scroll">
                    {rows.map((r, i) => (
                      <div className="receive-line" key={i}>
                        <div className="receive-line-title">
                          <div>
                            <strong>{r.name}</strong>
                            <small>{r.printing}</small>
                          </div>
                          <button
                            aria-label={`Remove ${r.name} receipt line ${i + 1}`}
                            onClick={() =>
                              setRows((a) => a.filter((_, j) => j !== i))
                            }
                          >
                            Remove
                          </button>
                        </div>
                        <div className="receive-line-fields">
                          <label>
                            Quantity
                            <input
                              type="number"
                              min="1"
                              max="100000"
                              value={r.quantity}
                              onChange={(e) =>
                                setRows((a) =>
                                  a.map((v, j) =>
                                    j === i
                                      ? { ...v, quantity: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            Condition
                            <select
                              aria-label="Condition"
                              value={r.condition}
                              onChange={(e) =>
                                setRows((a) =>
                                  a.map((v, j) =>
                                    j === i
                                      ? { ...v, condition: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            >
                              {CONDITIONS.map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Finish
                            <select
                              aria-label="Finish"
                              value={r.finish}
                              onChange={(e) =>
                                setRows((a) =>
                                  a.map((v, j) =>
                                    j === i
                                      ? { ...v, finish: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            >
                              {FINISHES.map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Unit cost AUD
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={r.unit_cost_aud}
                              placeholder="Unknown"
                              onChange={(e) =>
                                setRows((a) =>
                                  a.map((v, j) =>
                                    j === i
                                      ? { ...v, unit_cost_aud: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            Source
                            <select
                              aria-label="Source"
                              value={r.acquisition_type || type}
                              onChange={(e) =>
                                setRows((a) =>
                                  a.map((v, j) =>
                                    j === i
                                      ? {
                                          ...v,
                                          acquisition_type: e.target.value,
                                        }
                                      : v,
                                  ),
                                )
                              }
                            >
                              {ACQUISITION_TYPES.map((t) => (
                                <option key={t}>{t}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="receive-receipt-total">
                    <span>
                      {rows.reduce(
                        (sum, r) => sum + Number(r.quantity || 0),
                        0,
                      )}{" "}
                      copies to receive
                    </span>
                    <strong>
                      {money(
                        rows.reduce(
                          (sum, r) =>
                            sum +
                            Math.round(Number(r.unit_cost_aud || 0) * 100) *
                              Number(r.quantity || 0),
                          0,
                        ),
                      )}{" "}
                      known cost
                    </strong>
                    <small>
                      {rows.filter((r) => !r.unit_cost_aud?.trim()).length}{" "}
                      lines with unknown cost
                    </small>
                  </div>
                  <button
                    className="button button-primary receive-review-button"
                    disabled={busy}
                    onClick={() => review(rows)}
                  >
                    Review receipt
                  </button>
                </div>
              )}
            </aside>
          </div>
          <details className="receive-csv">
            <summary>
              <span>Bulk collection / CSV intake</span>
              <small>
                Have a list already? Upload or paste your collection.
              </small>
            </summary>
            <p>
              Upload or paste CSV, map columns, then preview exact printing
              matches. Blank costs remain unknown. Duplicate lines retain their
              own costs. Selling prices are never imported.
            </p>
            <button
              className="button button-outline"
              onClick={() =>
                downloadCSV("kings-inventory-intake.csv", template)
              }
            >
              Download sample template
            </button>
            <label>
              CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 2000000) {
                      setError("File must be under 2 MB.");
                      return;
                    }
                    loadCSV(await file.text());
                  }
                }}
              />
            </label>
            <label>
              Or paste a CSV list
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={5}
                placeholder="name,set,collector_number,quantity"
              />
            </label>
            <button onClick={() => loadCSV(paste)}>Read pasted list</button>
            {csv && (
              <div className="stack-form">
                <h3>Map columns — {csv.rows.length} rows</h3>
                <div className="form-two-columns">
                  {fields.map((f) => (
                    <label key={f}>
                      {f}
                      <select
                        value={mapping[f] || ""}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [f]: e.target.value }))
                        }
                      >
                        <option value="">Use default / blank</option>
                        {csv.headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={() =>
                    review(
                      csv.rows.map((values, index) => ({
                        ...Object.fromEntries(
                          fields
                            .filter((f) => mapping[f])
                            .map((f) => [
                              f,
                              values[csv.headers.indexOf(mapping[f])],
                            ]),
                        ),
                        ...(csv.errors[index]
                          ? { _csv_error: csv.errors[index] }
                          : {}),
                      })),
                    )
                  }
                >
                  Preview CSV intake
                </button>
              </div>
            )}
          </details>
        </>
      )}
    </section>
  );
}
