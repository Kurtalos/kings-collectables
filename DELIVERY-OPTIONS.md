# Delivery options and order tracking update

This incremental update follows the previously supplied **Theme & branding update**. Apply that and the earlier inventory/workspace/Pages/carousel updates first if they are not already installed. It is an updated-files package, not a replacement repository.

## What changed

- **Store → Store settings** now contains business details, admin slogans and configurable delivery options. The duplicate theme controls and basic theme preview have been removed. All theme, colour, logo, icon, font and button-shape controls remain under **Store → Theme & branding**.
- Add, edit, enable, disable, reorder or remove up to **12 Australia-wide postal services**.
- Each service has a name, optional description/estimated timing, AUD rate, optional free-delivery threshold, optional carrier, and **Allow tracking numbers on these orders** switch.
- Customers choose an enabled service during checkout. Delivery totals are calculated again on the server, not trusted from the browser. Disabled/removed services and stale prices/configurations are rejected before stock is reserved.
- New orders retain a snapshot of their chosen service, charged shipping and tracking eligibility. Later edits/removal of the service do not rewrite existing orders or fees.
- Storefront delivery information lists the currently enabled services. Cart totals use the **first enabled service as an estimate**, not the cheapest service. Checkout is the final choice.

This does **not** implement international shipping, collection, weight/postcode rates, shipping-label purchasing, live carrier quotes, carrier-status integration or tracking emails.

## Configure services

1. Sign into Admin and open **Store → Store settings → Delivery options — Australia / AUD**.
2. The existing single delivery fee/free-shipping threshold becomes the initial **Standard tracked delivery** option. There is no automatic rate change on installation.
3. Add a service, give it a clear name such as “Express tracked”, enter its price and optional description/carrier.
4. If wanted, enable a free-delivery threshold. It applies to that service only and is reached when the merchandise subtotal is **at least** the threshold. A zero threshold makes that service free; switching the threshold off always charges its configured rate.
5. Enable **Allow tracking numbers on these orders** for services you can track. Tracking is supported, not mandatory, for these services.
6. Enable the service. **New services start disabled** so an incomplete/free draft is not accidentally offered to customers.
7. Move services up/down to set checkout order and the initially selected service. Click **Save store settings**. Draft changes do not affect customers until saved; Discard restores the last saved settings.

Disabling keeps a service available for later editing/re-enabling. Removing deletes it from future checkout choices but not historical orders. If every service is disabled or removed, **online checkout is blocked** until a service is enabled; the editor warns about this.

For untracked/uninsured postal services, enter accurate descriptions and policies yourself. The software does not infer insurance, guarantees or delivery times from a name.

## Add tracking to an order

1. Open **Orders → All orders**, then the order number.
2. Confirm payment using the existing payment workflow. Tracking can be edited on eligible website orders in **Paid, Packing or Shipped** status.
3. In **Delivery tracking**, enter the tracking number, optional carrier and optional **HTTPS** tracking URL. The URL is entered manually; it is not generated from the number.
4. Click **Save tracking**. Existing tracking can be corrected later. To clear it, leave both number and URL blank and save.
5. Mark the order **Shipped** using the existing order workflow. Saving tracking does not change the order status.

Customers see the tracking number/link in their account orders and guest order tracker **only when the order is Shipped**. You can prepare tracking while packing without exposing it early. No email is sent by this feature.

POS orders, cancelled/refunded orders and new orders placed with an untracked service do not accept tracking. Eligibility follows the service snapshot from the time of ordering, not its current settings. Older website orders without a snapshot are identified as **Delivery (legacy order)** and permit manual tracking, matching the old tracked-delivery-only setup; their fees are never recalculated.

## Data safety and schema

No new migration, table, column, dependency or automatic data reset is needed for this update.

- Configured services are stored in the existing `store_meta` record `store.settings.v1`, as `deliveryOptions`.
- Per-order delivery snapshots/tracking are stored in existing `store_meta`, using `order.delivery.<order UUID>` keys. Include the entire table in normal database backups; do not delete these records when changing delivery settings.
- A snapshot is inserted in the **same transaction** as order creation and stock/FIFO allocation. Tracking updates take the existing order row lock.
- Settings without a service list continue to use the old fee/threshold. An older API client omitting `deliveryOptions` cannot silently erase an explicitly configured list. Old checkout tabs should be refreshed after a deployment/settings change.
- No order totals, selling prices, acquisition costs, FIFO lots, payments, refunds, newsletter consent or restock-demand semantics are migrated or rewritten.
- Actual columns/indexes were inspected on the isolated test database, including nullable integer `products.total_cost`, `order_items.cost_basis` and `order_items.legacy_cost_basis`, and the existing `store_meta` primary key. **Production was not accessed or changed.**

If your VPS audit reports old inventory-schema drift, stop and use the previously supplied inventory migration guide. Do not run `db:push`, a database reset or a test-database setup against production to fix this feature.

## Install: your GitHub → VPS workflow

1. Take your normal database backup, including `store_meta`. Keep a copy of your currently deployed source. Preserve `.env`, `.git`, uploaded branding/carousel/Pages images and local artwork.
2. Unzip the package and copy the **contents of `updated-files/`** into the same relative paths in your local repository/GitHub upload. Include the new source and test files, not just replacements. The outer `updated-files` folder itself does not belong in the app.
3. Commit/upload the files to GitHub using your usual process. This delivery has not pushed or deployed anything for you.
4. On the VPS, from the existing app directory:

   ```bash
   git pull
   npm run inventory:audit
   npx next typegen
   npm run typecheck
   npm run test:delivery
   npm run test:store-settings
   npm run build
   pm2 list
   ```

   Use your existing secured environment-loading arrangement for commands that need `DATABASE_URL`; do not paste credentials into chat, terminal history or GitHub. Dependencies and versions are unchanged, so no reinstall is needed if the previous branding build is already installed.

5. Only after the build succeeds, reload **the existing app process** using its real name/ID from `pm2 list`: `pm2 reload <existing-app-name> --update-env`. Do not create a duplicate PM2 application. Check `pm2 logs <existing-app-name> --lines 30` locally; do not share secret-bearing logs.
6. Refresh Admin and storefront. Check that Theme & branding still has your saved design; Store settings no longer has theme controls; the existing delivery price is preserved. Add/configure your additional delivery services, save, and check checkout on mobile and desktop. Review an existing order to confirm its original fee remains unchanged.

There are **no additional manual SQL commands** to run for delivery/tracking. Avoid rolling back to pre-delivery code once multiple services are in use: old code does not understand the service list and could quote the legacy fee. If rollback is unavoidable, pause online checkout and review the operational impact first; keep the new metadata records.

## Verification performed

All tests ran against a disposable local `inventory_test` database, never production:

- Type generation, TypeScript checking, ESLint for the new delivery modules/API/settings editor, and production build passed. A broader lint run still reports existing React effect/unescaped-apostrophe issues in older dashboard/checkout/storefront components and existing image-optimisation warnings; this is not a repository-wide lint cleanup.
- Delivery model validation, price/threshold boundaries, disabled-service selection, stale quotes, unsafe tracking links and field bounds passed.
- API and Chromium: add/edit/remove/toggle/reorder services, checkout selection and authoritative totals, blocked checkout when no service is enabled, free threshold, historical snapshot/eligibility, clearing/correcting tracking, owner/origin/status restrictions, tracking redaction until Shipped, account display, desktop/mobile layouts and no browser errors passed.
- Inventory regression: repeated different-cost purchases, known-zero/unknown costs, pack allocation, CSV/duplicate handling, trade credit + stock, POS/web FIFO, refunds, cancellation, concurrent oversell, rollback, migration reruns and restock transitions passed.
- Search returned 30 results from a **110,000-printing synthetic test catalogue in 32 ms**. The existing real catalogue was not reimported or replaced.
- Store settings, branding, navigation/workspaces, newsletter/demand separation, Pages, carousel and picklist regression suites passed.

Browser/database regression scripts create synthetic transactional fixtures and deliberately refuse non-`inventory_test` databases. Do not point them at production. Use the existing `npm run test:inventory:database` setup in an isolated development environment if reproducing them.
