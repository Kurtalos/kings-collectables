# POS interactive trade-in update

Incremental update **after the Header & footer editor update**, delivery/tracking, Theme & branding and earlier inventory changes. Apply those first if not already installed. This is not a complete repository replacement.

## What changed

The POS **Add a trade-in** popup is retained, with a wider, readable layout and interactive exact-printing search instead of the old select dropdown.

- Search the existing local catalogue by card name, set name/code, collector number or Scryfall printing ID. No blank catalogue request is made; enter at least two characters.
- Results show images, exact set/collector number, condition, finish, current **sell price per copy** and stock status. Out-of-stock printings are included and can be received.
- Results are paginated (20 at a time); use Previous/Next for other printings. Search is debounced, previous requests are cancelled, and errors have a Retry control.
- Selecting a printing re-reads its current sell price and configured trade rate from the server. Results then collapse to keep the selected card, quantity and offer visible. Use **Change printing / browse results** or edit the search to choose another printing.
- A suggested **trade offer per copy** is populated automatically, with a clearly displayed **total credit** for the quantity received.
- Staff can override the per-copy offer. Manual per-copy values remain unchanged when quantity changes. A new printing selection or **Refresh sell price & reset offer** restores the current default.
- Popup heading/text contrast is corrected; the form is usable on mobile with normal modal scrolling.

This is based on your stored selling price for that exact printing/condition/finish — not an external market quote and not the card’s previous acquisition cost. The existing real catalogue is used; searching does not import Scryfall cards or create new products.

## Set the default percentage

Open **Admin → Store → Store settings → POS trade-ins → Default trade-in percentage**.

The initial default is **50%**. Enter a whole number between **0 and 100**, then click **Save store settings**. Older installations/settings automatically receive the 50% default. An older API client omitting the field cannot accidentally reset a configured rate.

Example: at **50%**, a card currently selling for **$20.00** suggests **$10.00 per copy**, or **$30.00 total** for three copies.

Offers are rounded to the nearest cent **per copy before multiplying by quantity**. For example, 50% of $9.99 becomes $5.00 per copy; three copies receive $15.00. This keeps the receipt’s per-copy acquisition cost in whole cents and compatible with the existing FIFO ledger.

A 0% setting produces a $0 suggestion and requires a manual positive offer; it does not disable trade-ins. Quantity remains 1–999 and total credit per trade line must be above $0 and no more than $10,000, matching the existing popup’s operational limits. Larger trades must be adjusted/split rather than silently capped.

The percentage is a **suggestion, not a forced purchase price**. Refresh/reset explicitly discards the current per-copy override. Changes apply to new selections/resets, not to trades already added to the current basket or completed transactions. A price or rate change elsewhere does not silently reprice an agreed pending trade.

## Receive a trade

1. Attach the customer at the register; trade credit belongs to their account.
2. Open Trade-ins → Add trade-in.
3. Search and choose the exact printing. Confirm set, collector number, condition and finish.
4. Review the sell price/default calculation, enter quantity and adjust the **per-copy** offer if needed.
5. Confirm the displayed **total credit**, then click Add trade-in. The basket’s existing editable trade value remains the **total for that trade line**, not the per-copy rate.
6. Complete the POS sale through the existing payment workflow.

Adding a popup trade to the basket does **not** receive stock or issue credit. Only a successful completed sale atomically receives the exact stock with the agreed acquisition cost and issues customer credit. No cards should be received a second time through Inventory receiving.

The existing **Already received and credited?** receipt-link workflow remains available. Enter the existing receipt ID only for a matching customer/printing receipt. Linked receipts do not receive stock or issue credit again; the suggestion is not a lookup of that receipt’s historical credit. Enter a reference value manually if required. Existing server checks and idempotency still apply.

The register continues to require at least one sale item to complete a POS sale. For standalone trade intake, use the existing Inventory receiving / trade-credit workflow. This update does not add standalone POS trades or cash-buyout functionality.

## Safety and storage

- No new schema migration, dependency or version upgrade.
- `tradeInPercent` is saved in the existing `store_meta` record `store.settings.v1`. Delivery services and other settings remain intact. Back up the whole record normally.
- The actual configured rate is returned only to signed-in owner clients. Public storefront props substitute the neutral built-in default rather than exposing the configured staff rate. The search/detail endpoint is owner/origin protected and sends private/no-store responses.
- The new `/api/pos/trade-search` endpoint is a bounded, read-only local query. It does not request full-catalogue stock-cost totals, expose acquisition costs, call Scryfall, or mutate products.
- The selection refresh reads the latest stored price/rate at that moment, not continuously while negotiating. Use Refresh when you want to update the quote.
- Selling prices and historical acquisition costs/lots are not rewritten by rate changes or popup edits. The existing POS sale, receipt linking, FIFO, refunds, customer-credit and restock logic remains unchanged.
- Actual isolated-database columns/indexes were inspected, including nullable integer `products.total_cost`, `order_items.cost_basis` and `order_items.legacy_cost_basis`, catalogue indexes, and text key/value `store_meta` with its existing primary key. Production was not accessed or changed.

## Install: your GitHub → VPS workflow

1. Take your normal database/source backup. Keep `.env`, `.git`, runtime uploads, artwork and existing data intact.
2. Copy the **contents of `updated-files/`** in the ZIP into the matching paths in your repository. Include the new helper, API route and tests. Do not add the outer `updated-files` folder to the application.
3. Upload/commit to GitHub using your normal workflow. Nothing has been pushed or deployed for you.
4. From the existing VPS application directory, using your existing secured environment-loading arrangement:

   ```bash
   git pull
   npm run inventory:audit
   npx next typegen
   npm run typecheck
   npm run test:trade-value
   npm run test:store-settings
   npm run build
   pm2 list
   ```

   Dependencies/versions are unchanged; no reinstall is necessary if the previous update is installed. Do not print or share real environment credentials.

5. After a successful build, reload the **existing** PM2 app using its real name/ID: `pm2 reload <existing-app-name> --update-env`. Do not start a duplicate process. Review logs locally.
6. Refresh Store settings and the POS. Set the desired percentage, save, attach a test customer and review a trade suggestion against an exact printing’s sell price. Check quantity changes, manual override, variant selection and mobile layout before completing a real transaction.

There are **no additional SQL migration commands** for this update. If the inventory audit reports historical schema drift, stop and use the previously supplied inventory migration guide; do not reset production or run `db:push` as a shortcut. Rolling back source ignores the new setting but does not undo real completed sales/trades or their credit/stock transactions.

## Verification

All tests used a disposable local **inventory_test** database, never production. Port 3000 is running the isolated preview build.

- Type generation, TypeScript checking and production build passed.
- Targeted ESLint passed with zero errors and two standard raw-image optimisation warnings in the printing picker. This is not a repository-wide lint cleanup.
- **31 unit tests** passed across trade values/settings, inventory, delivery, Pages, branding, header/footer, carousel, picklist and admin workspaces.
- New API/Chromium suite passed: rate save/reload/legacy preservation and bounds; configured-rate privacy; owner/origin restrictions; read-only paginated local search and wildcard escaping; no blank queries; out-of-stock variants; fresh sell price and rate on selection; per-copy/quantity calculations; manual overrides; switching variants; refresh/reset; a zero-rate requiring a manual offer; desktop/mobile popup layouts and no browser errors.
- A real test POS sale confirmed no stock/credit changes while merely adding the popup trade, then exactly three copies received at a $6.00 unit acquisition cost and $18.00 customer credit on completion. Existing unrelated acquisition costs remained unchanged.
- Receiving/FIFO regressions passed: zero-stock re-receipts, repeated different-cost purchases, known-zero/unknown costs, pack allocations, CSV/duplicate handling, trade stock/credit idempotency, linked receipts, POS/web consumption, refunds, cancellation, concurrent oversell, rollback, migration reruns and restock transitions.
- Store settings, delivery/tracking, branding, header/footer, Pages, carousel, inventory intake, picklist, newsletter/demand separation and admin-workspace regression suites passed.
- The existing catalogue-search regression returned 30 results from **110,000 synthetic printings in 31 ms**. The new trade suite also passed against the populated large test database. The real production catalogue was not replaced or reimported.

Optional development reproduction: `npm run test:trade-value:browser` requires the running isolated application/database setup. Browser/database scripts create synthetic fixtures and must never target production; the new suite refuses non-`inventory_test` database names.
