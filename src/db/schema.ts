import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  scryfallId: text("scryfall_id").notNull(),
  name: text("name").notNull(),
  setName: text("set_name").notNull(),
  setCode: text("set_code").notNull(),
  collectorNumber: text("collector_number").notNull(),
  imageUrl: text("image_url").notNull(),
  artUrl: text("art_url").notNull(),
  rarity: text("rarity").notNull(),
  colors: jsonb("colors").$type<string[]>().notNull().default([]),
  typeLine: text("type_line").notNull(),
  manaCost: text("mana_cost").notNull().default(""),
  oracleText: text("oracle_text").notNull().default(""),
  condition: text("condition").notNull().default("Near mint"),
  finish: text("finish").notNull().default("Non-foil"),
  price: integer("price").notNull(),
  priceMode: text("price_mode").notNull().default("manual"),
  usdPrice: integer("usd_price"),
  priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }),
  totalCost: integer("total_cost"), // Legacy audit only; valuation uses remaining lots.
  quantity: integer("quantity").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("product_printing_variant").on(table.scryfallId, table.condition, table.finish)]);

export const priceEvents = pgTable("price_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  oldPrice: integer("old_price").notNull(),
  newPrice: integer("new_price").notNull(),
  usdPrice: integer("usd_price").notNull(),
  rate: integer("rate").notNull(),
  source: text("source").notNull().default("daily"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#f26b0a"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productCategories = pgTable("product_categories", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.productId, table.categoryId] })]);

export const imports = pgTable("imports", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: text("filename").notNull(),
  status: text("status").notNull().default("preview"),
  imported: integer("imported").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  payload: jsonb("payload").$type<unknown[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  creditBalance: integer("credit_balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const addresses = pgTable("addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Home"),
  recipientName: text("recipient_name").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2"),
  suburb: text("suburb").notNull(),
  state: text("state").notNull(),
  postcode: text("postcode").notNull(),
  phone: text("phone"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  idempotencyKey: text("idempotency_key").unique(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  email: text("email").notNull(),
  shippingAddress: text("shipping_address").notNull(),
  status: text("status").notNull().default("Awaiting payment"),
  paymentMethod: text("payment_method"),
  paymentReceipt: text("payment_receipt"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  channel: text("channel").notNull().default("web"),
  addressId: uuid("address_id").references(() => addresses.id, { onDelete: "set null" }),
  recipientPhone: text("recipient_phone"),
  discount: integer("discount").notNull().default(0),
  note: text("note"),
  refundedAmount: integer("refunded_amount").notNull().default(0),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  refundReason: text("refund_reason"),
  subtotal: integer("subtotal").notNull(),
  shipping: integer("shipping").notNull(),
  total: integer("total").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull().default("Trade-in"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  method: text("method").notNull(),
  providerReference: text("provider_reference"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("aud"),
  status: text("status").notNull().default("pending"),
  clientSecret: text("client_secret"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decks = pgTable("decks", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  format: text("format").notNull().default(" Casual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("deck_customer_name").on(table.customerId, table.name)]);

export const deckItems = pgTable("deck_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  deckId: uuid("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
  cardName: text("card_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  section: text("section").notNull().default("Maindeck"),
  setCode: text("set_code"),
  collectorNumber: text("collector_number"),
}, (table) => [uniqueIndex("deck_item_unique").on(table.deckId, table.cardName, table.section)]);

export const wishlists = pgTable("wishlists", {
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.customerId, table.productId] })]);

export const watchlists = pgTable("watchlists", {
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  lastSeenQuantity: integer("last_seen_quantity").notNull().default(0),
  lastSeenPrice: integer("last_seen_price").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.customerId, table.productId] })]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  cardName: text("card_name").notNull(),
  variant: text("variant").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  legacyCostBasis: integer("legacy_cost_basis"),
  costBasis: integer("cost_basis"), // Total FIFO COGS; null if any allocated cost is unknown.
});

export const newsletter = pgTable("newsletter", {
  email: text("email").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storeMeta = pgTable("store_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const inquiries = pgTable("inquiries", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Nullable costs distinguish unknown provenance from a known free acquisition.
export const inventoryReceipts = pgTable("inventory_receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  customerId: uuid("customer_id").references(() => customers.id),
  creditAmount: integer("credit_amount").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const inventoryLots = pgTable("inventory_lots", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptId: uuid("receipt_id").references(() => inventoryReceipts.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  acquiredQuantity: integer("acquired_quantity").notNull(),
  remainingQuantity: integer("remaining_quantity").notNull(),
  unitCost: integer("unit_cost"),
  acquisitionType: text("acquisition_type").notNull(),
  acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  supplier: text("supplier"), reference: text("reference"), note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const inventoryAllocations = pgTable("inventory_allocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id),
  lotId: uuid("lot_id").notNull().references(() => inventoryLots.id),
  quantity: integer("quantity").notNull(), unitCost: integer("unit_cost"),
  restoredAt: timestamp("restored_at", { withTimezone: true }),
}, t => [uniqueIndex("inventory_allocation_line_lot").on(t.orderItemId, t.lotId)]);
export const inventoryRestockEvents = pgTable("inventory_restock_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});
