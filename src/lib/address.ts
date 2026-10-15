export const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;
export type AddressFields = { label?: string; recipientName: string; line1: string; line2?: string | null; suburb: string; state: string; postcode: string; phone?: string | null };
export type SavedAddress = AddressFields & { id: string; isDefault: boolean };
export const MAX_ADDRESSES = 10;

/** Builds the delivery block stored on the order and printed on the packing slip. */
export function composeAddress(fields: AddressFields) {
  const lines = [fields.recipientName, fields.line1, fields.line2, `${fields.suburb} ${fields.state} ${fields.postcode}`];
  return lines.filter(Boolean).join("\n");
}
/** One-line summary using Australian convention: "12 Collector St, Melbourne VIC 3000". */
export function describeAddress(fields: AddressFields) {
  return [fields.line1, fields.line2, `${fields.suburb} ${fields.state} ${fields.postcode}`.trim()].filter(Boolean).join(", ");
}
function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}
export function validateAddress(body: Record<string, unknown>): AddressFields {
  const recipientName = clean(body.recipientName, 120);
  const line1 = clean(body.line1, 160);
  const line2 = clean(body.line2, 160) || null;
  const suburb = clean(body.suburb, 90);
  const state = clean(body.state, 3).toUpperCase();
  const postcode = clean(body.postcode, 4);
  const phone = clean(body.phone, 30) || null;
  const label = clean(body.label, 40) || "Home";

  if (recipientName.length < 2) throw new Error("Enter the name for this delivery.");
  if (line1.length < 4) throw new Error("Enter a street address (at least 4 characters).");
  if (suburb.length < 2) throw new Error("Enter a suburb or town.");
  if (!(AU_STATES as readonly string[]).includes(state)) throw new Error(`Choose an Australian state or territory: ${AU_STATES.join(", ")}.`);
  if (!/^\d{4}$/.test(postcode)) throw new Error("Australian postcodes are four digits.");
  if (phone && !/^[0-9+()\- ]{6,30}$/.test(phone)) throw new Error("Enter a valid contact number, or leave it blank.");
  return { label, recipientName, line1, line2, suburb, state, postcode, phone };
}
