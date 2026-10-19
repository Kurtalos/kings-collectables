export const ACQUISITION_TYPES = [
  "Purchase",
  "Trade-in",
  "Pack opening",
  "Opening balance",
  "Other",
] as const;
export type ReceiveLine = {
  productId: string;
  quantity: number;
  unitCost: number | null;
  acquisitionType: string;
  date?: string;
  supplier?: string;
  reference?: string;
  note?: string;
};
export function audCost(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value)
    .trim()
    .replace(/^AUD\s*|^\$/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error(
      "Unit cost must be AUD with at most two decimal places, or blank for unknown.",
    );
  const cents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(cents) || cents > 100000000)
    throw new Error("Unit cost is too large.");
  return cents;
}
export function receiveLine(raw: Record<string, unknown>): ReceiveLine {
  if (
    typeof raw.productId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(raw.productId)
  )
    throw new Error("Select an existing printing.");
  const quantity = Number(raw.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000)
    throw new Error("Quantity must be between 1 and 100,000.");
  const suppliedType = String(raw.acquisition_type || "Purchase");
  const acquisitionType =
    ACQUISITION_TYPES.find(
      (t) => t.toLowerCase() === suppliedType.toLowerCase(),
    ) || suppliedType;
  if (!(ACQUISITION_TYPES as readonly string[]).includes(acquisitionType))
    throw new Error("Invalid acquisition type.");
  const details: Record<string, string> = {};
  for (const field of ["supplier", "reference", "note", "date"]) {
    const value = String(raw[field] || "").trim();
    if (value.length > 500) throw new Error(`${field} is too long.`);
    if (value) details[field] = value;
  }
  if (
    details.date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(details.date) ||
      !Number.isFinite(Date.parse(details.date)) ||
      new Date(details.date).toISOString().slice(0, 10) !== details.date)
  )
    throw new Error("Use a valid YYYY-MM-DD date.");
  return {
    productId: raw.productId,
    quantity,
    unitCost: audCost(raw.unit_cost_aud),
    acquisitionType,
    ...details,
  };
}
