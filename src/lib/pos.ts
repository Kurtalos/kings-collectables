export const POS_METHODS = ["Cash", "Card", "EFTPOS", "Store credit", "Gift card", "Other"] as const;
export type PosMethod = (typeof POS_METHODS)[number];
export const MAX_POS_LINES = 200;
export const MAX_POS_QTY = 999;
export const MAX_LINE_PRICE = 1000000;
export const MAX_DISCOUNT_PERCENT = 100;

export type PosLineInput = { productId: string; quantity: number; unitPrice?: number; note?: string };
export type PosTradeIn = { name: string; amount: number; note?: string };
export type PosPaymentInput = { method: string; amount: number };

export function isPosMethod(value: unknown): value is PosMethod {
  return typeof value === "string" && (POS_METHODS as readonly string[]).includes(value);
}
export function assertPosLines(lines: unknown): PosLineInput[] {
  if (!Array.isArray(lines) || !lines.length) throw new Error("Add at least one card to the sale.");
  if (lines.length > MAX_POS_LINES) throw new Error(`A single sale can hold up to ${MAX_POS_LINES} lines.`);
  return lines.map(line => {
    if (!line || typeof line !== "object") throw new Error("Invalid sale line.");
    const entry = line as Record<string, unknown>;
    if (typeof entry.productId !== "string") throw new Error("Invalid card reference.");
    if (!Number.isInteger(entry.quantity) || Number(entry.quantity) < 1 || Number(entry.quantity) > MAX_POS_QTY) throw new Error("Each line needs a quantity between 1 and 999.");
    if (entry.unitPrice !== undefined && (!Number.isInteger(entry.unitPrice) || Number(entry.unitPrice) < 0 || Number(entry.unitPrice) > MAX_LINE_PRICE)) throw new Error("A line price must be between $0.00 and $10,000.");
    if (entry.note !== undefined && (typeof entry.note !== "string" || entry.note.length > 200)) throw new Error("Line notes must be 200 characters or fewer.");
    return { productId: entry.productId, quantity: Number(entry.quantity), unitPrice: entry.unitPrice as number | undefined, note: entry.note as string | undefined };
  });
}
export function assertDiscount(value: unknown): { type: "percent" | "amount"; value: number } {
  if (value === undefined || value === null) return { type: "amount", value: 0 };
  const entry = value as Record<string, unknown>;
  const type = entry.type === "percent" ? "percent" : "amount";
  const amount = Number(entry.value || 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Discounts cannot be negative.");
  if (type === "percent" && amount > MAX_DISCOUNT_PERCENT) throw new Error(`Discounts can be at most ${MAX_DISCOUNT_PERCENT}%.`);
  if (type === "amount" && amount > MAX_LINE_PRICE * 10) throw new Error("That discount is too large.");
  return { type, value: amount };
}
export function assertTradeIns(value: unknown): PosTradeIn[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("Trade-ins must be a list.");
  if (value.length > 100) throw new Error("A single sale can hold up to 100 trade-in lines.");
  return value.map(entry => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid trade-in.");
    const trade = entry as Record<string, unknown>;
    if (typeof trade.name !== "string" || !trade.name.trim() || trade.name.trim().length > 160) throw new Error("Each trade-in needs a card name.");
    if (!Number.isInteger(trade.amount) || Number(trade.amount) < 0 || Number(trade.amount) > MAX_LINE_PRICE) throw new Error("Trade-in values must be between $0.00 and $10,000.");
    return { name: trade.name.trim(), amount: Number(trade.amount), note: typeof trade.note === "string" ? trade.note.slice(0, 200) : undefined };
  });
}
export function assertPayments(value: unknown): PosPaymentInput[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Record how this sale was paid.");
  if (value.length > 6) throw new Error("Split a sale across at most six payment methods.");
  return value.map(entry => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid payment entry.");
    const payment = entry as Record<string, unknown>;
    if (!isPosMethod(payment.method)) throw new Error(`Choose a payment method: ${POS_METHODS.join(", ")}.`);
    if (!Number.isInteger(payment.amount) || Number(payment.amount) < 0 || Number(payment.amount) > 100000000) throw new Error("Each payment must be between $0.00 and $1,000,000.");
    return { method: payment.method, amount: Number(payment.amount) };
  }).filter(payment => payment.amount > 0);
}
/** Rounds a percentage discount the same way on the server and the register. */
export function discountAmount(lineTotal: number, discount: { type: "percent" | "amount"; value: number }) {
  const raw = discount.type === "percent" ? Math.round(lineTotal * discount.value) / 100 : discount.value;
  return Math.min(lineTotal, Math.max(0, Math.round(raw)));
}
