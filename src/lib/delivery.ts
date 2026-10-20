export type DeliveryOption = { id: string; name: string; description: string; enabled: boolean; price: number; freeAbove: number | null; trackingEnabled: boolean; carrier: string };
export type DeliverySnapshot = DeliveryOption & { charged: number; trackingNumber: string; trackingUrl: string; trackingUpdatedAt: string | null };
type Settings = { shippingFlat: number; freeShippingThreshold: number | null; deliveryOptions?: DeliveryOption[] };
export const DELIVERY_KEY = (id: string) => `order.delivery.${id}`;
export function deliveryOptions(settings: Settings): DeliveryOption[] {
  return settings.deliveryOptions ?? [{ id: "standard-tracked", name: "Standard tracked delivery", description: "Delivery within Australia", enabled: true, price: settings.shippingFlat, freeAbove: settings.freeShippingThreshold, trackingEnabled: true, carrier: "" }];
}
export const enabledDeliveryOptions = (settings: Settings) => deliveryOptions(settings).filter(o => o.enabled);
export const deliveryCost = (subtotal: number, option: DeliveryOption) => option.freeAbove !== null && subtotal >= option.freeAbove ? 0 : option.price;
export function chooseDelivery(settings: Settings, id: unknown) {
  const options = enabledDeliveryOptions(settings);
  if (!options.length) throw new Error("Delivery is currently unavailable. Please contact the store.");
  if (id === undefined && options.length === 1) return options[0];
  const option = options.find(o => o.id === id);
  if (!option) throw new Error("Choose an available delivery option. Refresh checkout if options have changed.");
  return option;
}
export const deliveryQuote = (option: DeliveryOption, subtotal: number) => JSON.stringify([option.id, option.name, option.description, option.price, option.freeAbove, option.trackingEnabled, option.carrier, deliveryCost(subtotal, option)]);
export function validateDeliveryOptions(input: unknown): DeliveryOption[] {
  if (!Array.isArray(input) || input.length > 12) throw new Error("Configure up to 12 delivery options.");
  const seen = new Set<string>();
  return input.map(o => {
    if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("Check delivery options.");
    const text = (key: string, max: number, required = false) => { if (typeof o[key] !== "string" || o[key].length > max || /[\u0000-\u001f]/.test(o[key]) || (required && !o[key].trim())) throw new Error(`Check delivery ${key} (maximum ${max} characters).`); return o[key].trim(); };
    const id = text("id", 60, true);
    if (!/^[a-zA-Z0-9-]+$/.test(id) || seen.has(id)) throw new Error("Delivery option IDs must be unique.");
    seen.add(id);
    const cents = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1000000;
    if (!cents(o.price) || (o.freeAbove !== null && !cents(o.freeAbove))) throw new Error("Delivery rates/thresholds must be whole cents between $0 and $10,000 AUD.");
    if (typeof o.enabled !== "boolean" || typeof o.trackingEnabled !== "boolean") throw new Error("Check delivery switches.");
    return { id, name: text("name", 80, true), description: text("description", 240), enabled: o.enabled, price: o.price, freeAbove: o.freeAbove, trackingEnabled: o.trackingEnabled, carrier: text("carrier", 80) };
  });
}
export function trackingFields(body: Record<string, unknown>) {
  const text = (key: string, max: number) => { if (typeof body[key] !== "string" || body[key].length > max || /[\u0000-\u001f]/.test(body[key])) throw new Error(`Check ${key}.`); return body[key].trim(); };
  const trackingNumber = text("trackingNumber", 120), trackingUrl = text("trackingUrl", 1000), carrier = text("carrier", 80);
  if (trackingUrl) { let url: URL; try { url = new URL(trackingUrl); } catch { throw new Error("Use a full HTTPS tracking link."); } if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use a full HTTPS tracking link without login details."); if (!trackingNumber) throw new Error("Enter a tracking number before adding a link."); }
  return { trackingNumber, trackingUrl, carrier, trackingUpdatedAt: new Date().toISOString() };
}
export function legacyDelivery(shipping: number): DeliverySnapshot {
  return { id: "legacy", name: "Delivery (legacy order)", description: "", enabled: true, price: shipping, freeAbove: null, trackingEnabled: true, carrier: "", charged: shipping, trackingNumber: "", trackingUrl: "", trackingUpdatedAt: null };
}
