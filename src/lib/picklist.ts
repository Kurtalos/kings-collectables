export type PickLine = {
  orderNumber: string;
  customerName: string;
  productId: string | null;
  cardName: string;
  variant: string;
  setCode: string | null;
  collectorNumber: string | null;
  condition: string | null;
  finish: string | null;
  quantity: number;
};

/** Quote every cell and neutralise spreadsheet formulas from names/references. */
export function csvCell(value: string | number | null): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
export function picklistCSV(lines: PickLine[]): string {
  const columns = [
    "section",
    "card",
    "set",
    "collector_number",
    "condition",
    "finish",
    "variant",
    "quantity",
    "order_number",
    "customer",
  ];
  const combined = new Map<string, PickLine & { orderNumbers: Set<string> }>();
  for (const line of lines) {
    const key = JSON.stringify([
      line.productId,
      line.cardName,
      line.variant,
      line.setCode,
      line.collectorNumber,
      line.condition,
      line.finish,
    ]);
    const prior = combined.get(key);
    if (prior) {
      prior.quantity += line.quantity;
      prior.orderNumbers.add(line.orderNumber);
    } else
      combined.set(key, { ...line, orderNumbers: new Set([line.orderNumber]) });
  }
  const sorted = [...combined.values()].sort(
    (a, b) =>
      a.cardName.localeCompare(b.cardName) ||
      (a.setCode || "").localeCompare(b.setCode || "") ||
      (a.collectorNumber || "").localeCompare(b.collectorNumber || "") ||
      a.variant.localeCompare(b.variant),
  );
  const row = (
    section: string,
    line: PickLine,
    orders: string,
    customer: string,
  ) =>
    [
      section,
      line.cardName,
      line.setCode,
      line.collectorNumber,
      line.condition,
      line.finish,
      line.variant,
      line.quantity,
      orders,
      customer,
    ]
      .map(csvCell)
      .join(",");
  return (
    "\uFEFF" +
    [
      columns.map(csvCell).join(","),
      ...sorted.map((l) =>
        row(
          "COMBINED PICKING TOTAL",
          l,
          [...l.orderNumbers].sort().join(" | "),
          "",
        ),
      ),
      ...lines.map((l) =>
        row("ORDER BREAKDOWN", l, l.orderNumber, l.customerName),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
