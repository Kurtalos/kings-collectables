/** Prices/credits are whole AUD cents. Round per copy before multiplying quantities. */
export function tradeUnitValue(sellPrice: number, percent: number) {
  if (!Number.isSafeInteger(sellPrice) || sellPrice < 0 || !Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error("Check the sell price and trade percentage.");
  return Math.round(sellPrice * percent / 100);
}
export function tradeOfferTotal(unitText: string, quantityText: string) {
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(unitText)) throw new Error("Enter the offer per copy with up to two decimal places.");
  const quantity = Number(quantityText), unit = Math.round(Number(unitText) * 100);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error("Quantity must be between 1 and 999.");
  const amount = unit * quantity;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) throw new Error("Total trade credit must be above $0 and at most $10,000. Adjust the offer or split the trade.");
  return { quantity, amount, unit };
}
