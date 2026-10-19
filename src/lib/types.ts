export type Card = {
  id: string;
  scryfallId: string;
  name: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  imageUrl: string;
  artUrl: string;
  rarity: string;
  colors: string[];
  typeLine: string;
  manaCost: string;
  oracleText: string;
  condition: string;
  finish: string;
  price: number;
  priceMode: "auto" | "manual";
  usdPrice: number | null;
  priceUpdatedAt: string | null;
  quantity: number;
  featured: boolean;
  createdAt: string;
  categoryIds: string[];
};
export type Collection = { id: string; name: string; slug: string; description: string; color: string; count: number };
export type CartLine = { product: Card; quantity: number };
export type Customer = { id: string; name: string; email: string };
export type SavedAddress = { id: string; label: string; recipientName: string; line1: string; line2: string | null; suburb: string; state: string; postcode: string; phone: string | null; isDefault: boolean };
export type WatchItem = { productId: string; lastSeenQuantity: number; lastSeenPrice: number; createdAt: string };
/** Account data shared by server rendering and the customer API. Saved cards are fetched by ID, not from a paginated catalogue. */
export type AccountData = {
  customer: Customer | null;
  orders: StoreOrder[];
  addresses: SavedAddress[];
  wishlistIds: string[];
  watchlist: WatchItem[];
  wishlistProducts: Card[];
  watchProducts: Card[];
};
export type StoreOrder = {
  id: string; orderNumber: string; customerId: string | null; customerName: string; email: string; shippingAddress: string;
  status: string; paymentMethod: string | null; paymentReceipt: string | null; paidAt: string | null;
  channel: string; addressId: string | null; recipientPhone: string | null; discount: number; note: string | null;
  refundedAmount: number; refundedAt: string | null; refundReason: string | null;
  subtotal: number; shipping: number; total: number; createdAt: string;
  items: { id: string; productId: string | null; cardName: string; variant: string; quantity: number; unitPrice: number; costBasis?: number | null }[];
};
export type PosCustomer = { id: string; name: string; email: string; creditBalance: number };
export type PosSale = StoreOrder & { tenders: { method: string; amount: number }[]; change?: number; tradeTotal?: number; customer?: PosCustomer | null };
export type ImportLog = { id: string; filename: string; status: string; imported: number; skipped: number; createdAt: string };
export type ImportInput = { name?: string; set?: string; collector_number?: string; scryfall_id?: string; quantity?: string; price?: string; condition?: string; finish?: string; category?: string };
export type ImportRow = {
  row: number; name: string; set: string; quantity: number; price: number; condition: string; finish: string;
  category: string; error?: string; existing?: boolean;
  card?: import("./scryfall").CardMetadata;
};
export type PricingSettings = {
  autoFx: boolean;
  rate: number;
  markupPct: number;
  roundingCents: number;
  conditionMultipliers: Record<string, number>;
  priceSource: "auto" | "tcgplayer" | "scryfall";
};
export type FxRate = { rate: number; date: string; source: string };
export type PriceRun = {
  ranAt: string; source: "daily" | "manual"; following: number;
  updated: number; unchanged: number; failed: number;
  priceSource: "tcgplayer" | "scryfall"; fallbacks: number; fx: FxRate;
};
export type PriceEvent = {
  id: string; productId: string; cardName: string; variant: string;
  oldPrice: number; newPrice: number; usdPrice: number; rate: number;
  source: string; createdAt: string;
};
export const CONDITIONS = ["Near mint", "Lightly played", "Moderately played", "Heavily played", "Damaged"];
export const FINISHES = ["Non-foil", "Foil", "Etched"];
export const money = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
export const FREE_SHIPPING_THRESHOLD = 10000;
export const SHIPPING_FLAT = 895;
export const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
