# Admin workspaces

This incremental update applies **on top of the previously supplied Visual Pages, carousel, store-settings, receiving/FIFO and PDF updates**. It is not a full repository. No new dependencies or database migration are required. Both root package manifests are supplied as a matching pair.

## Where everything lives

| Workspace | Tools |
| --- | --- |
| **Store** | Store settings, Pages, Homepage carousel |
| **Inventory** | Card inventory, Receive stock, Collections, Pricing, Restock demand |
| **Customers** | Customer directory, Inbox, Newsletter & engagement |
| **Orders** | All orders, Picklist generator, Register (POS) |

Only the active workspace's tools are displayed. Selecting another workspace opens its default tool. Clicking the already-selected workspace leaves its current tool open; use the subnavigation to change tools. Admin initially opens Card inventory. The POS shortcut remains in the top bar. Export Picklist PDF is now limited to All orders and Picklist generator rather than appearing globally. Existing low-stock and awaiting-payment shortcuts still open their relevant tools.

The previous Pages/carousel/settings documentation paths are now under **Admin → Store**. These editors retain their explicit Save/Publish controls: save your edits before navigating away. This update does not add autosave.

## Restock demand

Open **Inventory → Restock demand**. This reads existing customer **watchlists**, not wishlists. Existing watchlists cover restock and price-drop interest; they are not an explicit commitment to buy.

- Rank exact product variants (printing, condition and finish) by interested customers. Each customer counts once per variant, not once per requested copy.
- Default: sold-out variants. Other filters: low stock (0–3) or all watched variants.
- Search card names, set names/codes and collector numbers; sort by demand, oldest watch, stock or name.
- Summary customer counts are distinct people across the current filters; they are not the sum of each row's count.
- View watchers to see names, email addresses and watch dates. This is owner-only customer information, **not promotional email consent**.
- Find in receiving searches by card name; deliberately select the correct printing, condition and finish before adding stock. It does not automatically purchase, reserve or receive that variant.
- Results paginate at 25 variants. CSV exports every matching page with variant details, stock, customer counts and watch dates. It excludes watcher email addresses and acquisition costs. Spreadsheet-formula cells are neutralised.
- Refresh to see changes from receiving, customer watchlist changes or other admin sessions. Ranking is not a purchase recommendation, sales forecast, reserved quantity or requested-copy count. An old watch date does not prove uninterrupted sold-out time.

Existing restock dispatch remains a logging-only outbox; **receiving stock does not send an email**. No automated restock or marketing sender is added.

## Customer tools and newsletter audience

The existing Customer directory retains order history, addresses, wishlists/watchlists and store-credit tools. Inbox retains website enquiries and individual replies.

**Customers → Newsletter & engagement** adds:

- The existing website newsletter signup list only: search, newest/oldest/email sorting, 25-row pagination, total signups, last-30-day signups and matching-account count.
- An all-matching-pages CSV export containing email and website signup timestamp. The statistics cover the whole list; search narrows the table/export, not the headline statistics. Exported CSVs contain personal information: store and share them securely.
- Confirmed removal from the website newsletter list. This does not delete a customer account, orders or watchlists. It does not remove the address from an external email service. If already exported/imported there, update that service separately.

Accounts, purchases, store credit and watching cards do **not** subscribe anyone. The existing signup table has email and signup time, not double-opt-in verification or a full consent audit. Do not describe this export as verified/double-opt-in consent. Website removal is not a persistent suppression record: the existing public signup form can add an address again.

No promotional email is sent here. Before enabling newsletters/offers, integrate a provider with unsubscribe links, durable suppression, bounce/complaint handling and suitable consent management. Do not treat the customer-directory/watchlist email addresses as a campaign audience.

## Security and storage

New APIs `/api/inventory/demand` and `/api/newsletter/subscribers` require the existing owner session. Newsletter removal also uses the existing same-origin protection. Successful API responses are private/no-store. Reads use repeatable-read, read-only transactions for consistent counts and exports; search values are parameterised and wildcard characters treated literally.

Uses existing `watchlists`, `newsletter`, `products` and `customers` tables. No table creation, column changes, migration, price update, acquisition-cost rewrite or payment change is involved. All work and tests were local against an isolated database; production was not accessed or altered. Local schema inspection confirmed nullable integer `products.total_cost` and `order_items.cost_basis`/`legacy_cost_basis`, quantity defaults and existing variant/search indexes. This does not establish the state of your production schema.

## Install

1. Back up your database and existing application files/artwork using your normal process.
2. Extract the ZIP locally. Copy the **contents** of `updated-files/` into your repository root, preserving paths. Do not upload the wrapper folder as a nested app. Include **both** `package.json` and `package-lock.json` from this ZIP. Upload these changes to your GitHub as usual; keep the prior updates in place.
3. On the VPS, from your existing app root:

   ```sh
   git pull
   test -f package.json && test -f package-lock.json
   npm ci --include=dev
   npx next typegen
   npm run typecheck
   npm run test:admin-workspaces
   npm run build
   pm2 list
   pm2 reload YOUR_EXISTING_APP_NAME --update-env
   ```

   Replace the PM2 placeholder with the existing app name. The build uses your existing server environment. Do not overwrite `.env`, `.git`, uploaded artwork or runtime upload directories. If npm reports EUSAGE, confirm you are at the app root and that **both matching manifests actually reached that root**; do not delete the lockfile or reset your repository.
4. No migration command is needed for **this** update. Do not run a destructive schema push/reset. Any earlier receiving migration still follows that update's own documented installation process.
5. Refresh Admin; check all four groups, restock demand, newsletter list and the Orders picklist export. Check your actual list/stock before placing purchases or exporting an audience.

## Verification performed

- Production build, Next route generation and TypeScript: pass.
- Targeted ESLint for the new modules, components, APIs and tests: pass. Diff whitespace check: pass.
- Unit suites: admin workspaces, inventory, picklist PDF/CSV, Pages, carousel, store settings (17 tests total): pass.
- Chromium/API tests: grouped sections, scoped picklist, owner/CSRF protection, exact-variant demand counts, filtering, pagination, all-page exports, watcher details, receiving refresh, newsletter/account consent separation, formula-safe export and removal without account deletion: pass.
- Existing Pages, carousel, store-settings, admin-inventory and inventory-browser regressions: pass, including desktop/mobile layouts and absence of page errors.
- Existing inventory database regressions: pass for receiving, FIFO, idempotent refunds, trade credit, unknown/zero costs, rollback/concurrency, restock transitions, migration rerun and ledger parity. Synthetic 110,000-printing catalogue search also passed.

Integration/browser scripts are **not deployment commands**. Run only with a separately provisioned isolated `inventory_test` database and test owner/server, never the production environment. The new browser test removes its synthetic customers/newsletter records, but retains isolated product/receipt fixtures referenced by immutable inventory lots. Screenshots and dependencies/build outputs are not part of this source ZIP.
