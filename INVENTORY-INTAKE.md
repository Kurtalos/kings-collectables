# Kings Collectables: receiving and FIFO inventory

## Owner workflow

Open **Admin → Receive stock** (or the Receive stock button in inventory).
Search by name, set name/code or collector number. Results include out-of-stock printings,
30 variants per server-side page; the complete catalogue is never sent to the browser.
Click **Add stock**, enter quantity, acquisition type and optional unit acquisition cost.
Select condition/finish per line. An existing variant is reused, including quantity-zero
products. Missing condition/finish variants are copied from the selected local printing
with zero stock before receipt insertion; no Scryfall network call is needed.

- Costs are AUD, rounded/validated to integer cents. Blank means **unknown**; `0` means
  a deliberately known free acquisition. Pack opening without allocation stays unknown.
- Selling price and automatic market repricing remain completely separate.
- More details holds supplier/trader, reference, acquisition date and note.
- Repeated lines are preserved as independent lots, including different per-card costs.
- Review shows valid line count, units, known cost subtotal, unknown-cost lines,
  duplicate lines, invalid rows and existing inventory matches.
- Confirmation receives **all valid rows in one transaction**, not one transaction per row.
  Invalid rows are displayed and skipped only after explicit confirmation.
- The saved receipt UUID is shown after success. Reconfirming the same preview never
  receives or credits twice. Starting a *new* preview represents a new receipt.

### Collections and CSV

Select multiple cards in search or open **Bulk collection / CSV intake** to upload/paste
CSV. Download the sample, explicitly map columns, then preview and confirm.
Columns: `name,scryfall_id,set,collector_number,quantity,condition,finish,acquisition_type,
unit_cost_aud,supplier,reference,date,note`.

Use Scryfall printing ID, or set + collector number, for exact matching. A name alone
is accepted only when it identifies one printing; ambiguity is an error, never an
arbitrary choice. NM/LP/MP/HP/DMG, nonfoil/foil/etched aliases are supported.
UTF-8 BOM, CRLF/LF, quoted commas, doubled quotes and quoted newlines are supported.
Malformed row widths are shown as invalid rows; an unclosed quoted field cannot be
safely split and must be corrected before preview. Maximum 1,000 rows / 2 MB.

`unit_cost_aud` is **per copy**, not line total. There is no ambiguous total-cost column.
CSV selling-price fields and old replace-stock mode are not supported; the legacy
`/api/import` endpoint now returns 410 instead of silently changing selling prices.

### Trade-ins

In POS, select an exact catalogue variant and quantity, then agreed total credit.
The total must divide into whole cents per copy (split into separate lines if needed).
The completed sale receives the stock and credits the attached customer transactionally.
POS request keys prevent replaying a sale from crediting or decrementing twice.

For a standalone collection trade, Receive stock → Trade-in → optional credit details
lets you choose the customer and agreed total credit. Cost allocation remains per line;
the agreement's credit total need not imply an invented per-card cost.
If credit was already issued elsewhere, leave credit adjustment off.
If a receipt **already received and credited** the cards, enter its UUID under the POS
trade dialog's optional details. The server verifies customer/printing and does **not**
receive or credit that receipt again. Do not create a second new receipt for it.

Refunding a sale returns purchased cards and tendered store credit, **not the trade-in
cards acquired from the customer**. Reversing an acquisition requires a separate audited
business process; it must not be conflated with a sale refund.

## Accounting and integrity

`products` remain specific Scryfall ID + condition + finish variants. `quantity` is the
fast aggregate. `inventory_receipts` has a unique idempotency key; `inventory_lots`
contains acquired/remaining units, nullable unit cost and provenance. Every sale/reservation
consumes oldest acquired date, then created timestamp and lot UUID, and persists
`inventory_allocations` per order item. `order_items.cost_basis` is **total line FIFO cost**,
nullable if *any* consumed unit's cost is unknown. POS overrides cannot change this cost.
Web reservations allocate at checkout; cancellation restores their allocations.

Sales and receipts lock product rows in ascending UUID order. Returns lock the order,
products and allocations; allocation `restored_at` and closed order status prevent double
returns. A ledger mismatch stops the sale rather than manufacturing stock/cost.
Transactions roll back stock, lots, allocations and credit together on failure.

Owner-only lot details show actual remaining cost, average unit cost and estimated gross
profit/margin before fees (unknown costs are explicitly unavailable, never shown as zero).
The inventory dashboard's old value is now labelled **retail stock value**. Remaining
acquisition valuation is on Receive stock. POS takings has FIFO COGS/profit/margin, and owner
order detail shows each line's cost. Public catalogue/RSC/cart/account/order lookup output
strips legacy cost and sale cost basis. ADMIN_PASSWORD is required: unconfigured owner
access now fails closed instead of granting preview writes.

Absolute stock edits, variant mutation and catalogue deletion are disabled to protect
history. Use intake for additions and POS/web cancellation/refunds for returns. A general
shrinkage/write-off workflow is not implemented in this change.

### Restock delivery

Only a locked aggregate transition from 0 to positive creates an `inventory_restock_events`
entry; repeated lines/reconfirmations do not create duplicate events. Single/bulk/CSV/POS
trade-ins and sale returns all share this mechanism. Watch state changes in the stock
transaction; after commit the dispatcher claims pending events with `FOR UPDATE SKIP LOCKED`,
deduplicates wishlist/watch recipients and invokes the existing **logging-only** sender.
No email/SMS provider existed in this repository and none is represented as working delivery.
Logs contain IDs and recipient counts, not customer email/name. Failed dispatch leaves
pending events for retry via owner POST `/api/inventory/restock` (up to 100 per invocation).
For real email delivery, implement a provider using the event UUID as its idempotency key;
console output cannot guarantee exactly-once delivery across process crashes.

## Safe VPS rollout (existing database)

No real database connection was supplied in the implementation workspace. The **live VPS
schema must still be audited**; successful tests used a disposable local PostgreSQL database.
The Drizzle source originally had neither `products.total_cost` nor `order_items.cost_basis`.
The variant unique key is declared as `product_printing_variant` on the three columns above.

Run from the app checkout, as the normal deployment user. Never paste `.env` or connection
strings into chat or commit them. `tsx` loads the existing `.env` using dotenv.

1. Back up the database using your existing secured backup procedure; verify restore access.
2. `npm ci`
3. `npm run inventory:audit` — read-only column types/nullability/defaults and product indexes.
   Check any pre-existing total_cost/cost_basis types are compatible integer cents before
   proceeding. The script withholds connection error details to avoid credential leakage.
4. Put the store in maintenance mode and stop **all** PM2 workers and other stock writers.
   Use `pm2 stop <your-existing-app-name>`; replace the placeholder with your actual PM2 name.
5. `npm run inventory:migrate`
   This additive SQL migration locks products/order_items, creates ledger tables, preserves
   legacy product cost, and creates unknown-cost opening lots for existing positive stock
   without changing aggregate quantities or selling prices. Old cost_basis without allocation
   provenance is copied to `legacy_cost_basis` before becoming unknown. Existing defaults/
   NOT NULL are removed from cost_basis so unknown is representable. No data is dropped/reset.
   Reruns do not create duplicate opening lots. Do **not** use `drizzle-kit push` as a substitute.
6. In a secure shell with DATABASE_URL already exported, run:
   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/002-inventory-search.sql`
   This separate optional migration enables pg_trgm and builds concurrent indexes outside
   a transaction. Ask the DBA to enable pg_trgm if the app user lacks extension privileges.
7. `npx next typegen && npm run typecheck && npm run build`
8. Start/reload your existing PM2 app with its existing environment, then verify health,
   owner login, receive stock, a test sale/return and ledger parity. Keep the backup.

The base `scripts/schema.sql` remains an empty-database bootstrap, **not** a migration.
For a fresh installation apply it first, then inventory migration, **before** the app starts.
Seed catalogue entries now begin at zero stock; demonstration counts are not acquired inventory.

Do not roll back to old stock-writing application code while continuing to use the ledger.
Stop writers and restore a coordinated backup if application rollback is required.

Audit parity after rollout (read-only SQL):
```sql
SELECT p.id, p.quantity, COALESCE(sum(l.remaining_quantity),0) AS lot_quantity
FROM products p LEFT JOIN inventory_lots l ON l.product_id=p.id
GROUP BY p.id HAVING p.quantity<>COALESCE(sum(l.remaining_quantity),0);
```
Investigate mismatches; do not automatically overwrite one source with the other.

## Reproducible testing

- `npm run test:inventory` — pure validation, unknown/zero cost, pack allocation, CSV and POS input tests.
- `npm run test:inventory:database` — long-running disposable PostgreSQL on port 55432,
  under ignored `artifacts/inventory-pg`. It bootstraps schema and migrations. Stop it when done.
  To recreate, stop it first and remove **only** `artifacts/inventory-pg`, never a real DB directory.
- Set DATABASE_URL **only to that isolated `inventory_test` database**, then
  `npm run test:inventory:db`. The script refuses other database names.
- Start the app with the same isolated DATABASE_URL and a test-only ADMIN_PASSWORD.
  `TEST_BASE_URL=http://127.0.0.1:3000 TEST_ADMIN_PASSWORD=<test-password> npm run test:inventory:browser`.
  This exercises real APIs plus headless Chromium and saves desktop/mobile screenshots in artifacts.
  Browser test fixture adds 110,000 synthetic quantity-zero printings **only to inventory_test**.
  The bundled Chromium library fallback supports Linux x64; alternatively set TEST_BROWSER_EXECUTABLE.

Implementation validation covered: repeated zero-stock receiving, two-cost FIFO, pack unknown/
allocated/known-free cost, trade inventory+credit/idempotency, bulk duplicates/variants/errors,
CSV mapping/confirmation, web/POS cost allocation, exact-once refund/cancellation, concurrent
overselling, rollback, restock transitions, authorization/CSRF and public cost redaction.
Search results are capped at 30; measured search times are local benchmarks, not VPS guarantees.
