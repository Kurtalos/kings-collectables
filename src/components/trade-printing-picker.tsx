"use client";
import { useEffect, useState } from "react";
import { requestJSON } from "./ui";
type Printing = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  condition: string;
  finish: string;
};
export function TradePrintingPicker() {
  const [q, setQ] = useState(""),
    [cards, setCards] = useState<Printing[]>([]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      requestJSON<{ cards: Printing[] }>(
        `/api/inventory?q=${encodeURIComponent(q)}`,
      )
        .then((r) => {
          if (!cancelled) setCards(r.cards);
        })
        .catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);
  return (
    <>
      <label>
        Find catalogue printing
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, set or collector number"
        />
      </label>
      <label>
        Exact printing / condition / finish
        <select required name="printing">
          <option value="">Select a printing</option>
          {cards.map((c) => (
            <option
              key={c.id}
              value={JSON.stringify({ id: c.id, name: c.name })}
            >
              {c.name} — {c.setCode} #{c.collectorNumber} · {c.condition} ·{" "}
              {c.finish}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quantity received
        <input
          name="quantity"
          type="number"
          required
          defaultValue="1"
          min="1"
          max="999"
        />
      </label>
    </>
  );
}
