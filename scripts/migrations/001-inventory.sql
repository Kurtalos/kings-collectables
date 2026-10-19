BEGIN;
SELECT pg_advisory_xact_lock(72419001);
LOCK TABLE products, order_items IN SHARE ROW EXCLUSIVE MODE;
-- Preserve legacy values for audit; total_cost is not authoritative without receipt history.
ALTER TABLE products ADD COLUMN IF NOT EXISTS total_cost integer;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_basis integer;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS legacy_cost_basis integer;
ALTER TABLE order_items ALTER COLUMN cost_basis DROP DEFAULT;
ALTER TABLE order_items ALTER COLUMN cost_basis DROP NOT NULL;
CREATE TABLE IF NOT EXISTS inventory_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key text NOT NULL UNIQUE,
 customer_id uuid REFERENCES customers(id), credit_amount integer NOT NULL DEFAULT 0 CHECK(credit_amount >= 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receipt_id uuid REFERENCES inventory_receipts(id),
 product_id uuid NOT NULL REFERENCES products(id), acquired_quantity integer NOT NULL CHECK(acquired_quantity > 0),
 remaining_quantity integer NOT NULL CHECK(remaining_quantity >= 0 AND remaining_quantity <= acquired_quantity),
 unit_cost integer CHECK(unit_cost >= 0), acquisition_type text NOT NULL CHECK(acquisition_type IN ('Purchase','Trade-in','Pack opening','Opening balance','Other')),
 acquired_at timestamptz NOT NULL DEFAULT now(), supplier text, reference text, note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_lots_fifo ON inventory_lots(product_id, acquired_at, created_at, id) WHERE remaining_quantity > 0;
CREATE TABLE IF NOT EXISTS inventory_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_item_id uuid NOT NULL REFERENCES order_items(id),
 lot_id uuid NOT NULL REFERENCES inventory_lots(id), quantity integer NOT NULL CHECK(quantity > 0),
 unit_cost integer CHECK(unit_cost >= 0), restored_at timestamptz,
 UNIQUE(order_item_id, lot_id)
);
CREATE TABLE IF NOT EXISTS inventory_restock_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id),
 quantity integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
-- Existing stock has no reliable per-copy cost provenance. Never infer zero or use selling prices.
INSERT INTO inventory_lots(product_id, acquired_quantity, remaining_quantity, acquisition_type, acquired_at, note)
 SELECT id, quantity, quantity, 'Opening balance', created_at, 'Migration: legacy stock; acquisition cost unknown. Legacy total_cost retained on product for audit.'
 FROM products p WHERE quantity > 0 AND NOT EXISTS (SELECT 1 FROM inventory_lots l WHERE l.product_id=p.id);
CREATE UNIQUE INDEX IF NOT EXISTS product_printing_variant ON products(scryfall_id, condition, finish);
CREATE INDEX IF NOT EXISTS inventory_search_set_number ON products(set_code, collector_number);
CREATE INDEX IF NOT EXISTS inventory_search_name ON products(lower(name));
-- Keep historical, unproven cost values for audit without presenting them as FIFO COGS.
UPDATE order_items i SET legacy_cost_basis=COALESCE(legacy_cost_basis,cost_basis), cost_basis=NULL
 WHERE cost_basis IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inventory_allocations a WHERE a.order_item_id=i.id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS order_idempotency_key ON orders(idempotency_key);
COMMIT;
