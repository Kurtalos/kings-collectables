# Header & footer WYSIWYG update

This is an incremental update after the existing Pages, Theme & branding, and delivery/tracking updates. It is not a complete application replacement. The normal delivery method is unchanged: upload the updated source files to your GitHub repository, then pull/build/reload your existing VPS app.

## Where to edit

Open **Admin → Store → Header & footer**.

This uses the **same Tiptap rich-text editor as Pages**, with a dedicated editor for the shared header/footer rather than treating them as routable content pages. It changes the full storefront layout wherever that shared header/footer is already used. The purpose-built checkout, POS and admin headers remain unchanged.

### Header

- Origin text, dashboard link label, catalogue search placeholder and decorative navigation tagline.
- Announcement mode: **Automatic**, **Custom formatted announcement**, or **Hidden**.
- Main navigation links: rename, add/remove, hide/show, reorder, and change the destination.
- An optional **Shop by set** dropdown: editable heading, entries, destinations and ordering. At most one dropdown is allowed.
- A switch to include published Pages marked for header navigation in the **More pages** menu. Links explicitly added to the main menu are not duplicated there.

The automatic announcement remains the default and retains the live store name/delivery message. Custom announcement text is manually maintained: it **does not** automatically update shipping promises when delivery options change. The custom announcement supports bold, italic, underline, strike and safe links in a single paragraph, up to **500 characters**. It does not support headings/lists so it cannot turn into a full-width content page.

### Footer

- Rich-text introduction below the logo, plus the origin text below it.
- Up to **four link columns**, with editable headings; add/remove/reorder columns and links, change destinations, hide/show links.
- Rich-text copyright and disclaimer, including safe links, headings and lists.
- An option to append other published Pages marked for footer navigation. Pages already represented by an explicit entry are not duplicated or automatically re-added when that entry is hidden.

Use **`{storeName}`** and **`{year}`** in formatted text to insert the current store name/year. Substitution is plain text, never HTML.

For destinations such as **Shipping**, **FAQs**, **Contact**, **Our story**, **Card conditions** or **Guest order tracker**, choose the corresponding **page / panel** action rather than inventing a URL. Published matching Pages are used when available; otherwise the original information panel remains functional. Custom labels are retained; unchanged default labels can follow the matching Page’s published title.

Store-path links must start with a single `/`, for example `/cards`, `/account`, `/deckbuilder` or `/pages/about-us`. External links must use HTTPS and cannot embed credentials. Arbitrary HTML, JavaScript URLs, scripts, iframes and CSS injection are not accepted. Links are not automatically checked for existence: publish a custom Page before linking to it.

## Draft → preview → publish

1. Edit either tab. The **Header** and **Footer** tabs share one draft; switching between them retains your work.
2. Click **Preview header & footer**. It renders a validated snapshot of the draft using the **actual header/footer components**, current branding, live business details, and published Page navigation in an isolated iframe.
3. Use **Mobile preview / Desktop preview**. Real iframe viewport widths activate the actual responsive CSS. Navigation dropdowns/mobile menu work; links/search/subscribe forms cannot navigate away or submit data from the preview.
4. Click Preview again after further edits; the previous preview is deliberately a snapshot, not a live view of unsaved keystrokes.
5. **Save header/footer draft** stores private work without changing the storefront. Drafts are visible only through the owner-protected API/editor; public rendering selects only the published content.
6. **Publish header & footer** confirms and publishes the **whole draft**, including both tabs, site-wide. Refresh already-open storefront tabs after publishing.

**Discard changes** restores the last saved draft, not necessarily the live published version. **Reload editor** loads the current stored record; use it after a stale-edit warning. **Restore defaults to draft** restores the built-in content/links into the local draft; it does not touch the live site until you publish it. There is no automatic multi-version history, so save your text elsewhere if you need an archive.

Unsaved edits warn before leaving the editor. Concurrent saves/publishes use a revision check and transactional lock: an older tab cannot silently overwrite a newer one. Reload and reapply your edits after a conflict.

## What remains protected

The shared logo and theme continue to come from **Theme & branding**. Public business/contact details continue to come from **Store settings**. Search behaviour, account/wishlist/cart controls, the dashboard route, currency, newsletter form and subscription semantics remain protected. This editor does not rearrange those functional widgets or change the newsletter promotion’s copy.

It also does not change product prices, acquisition costs, stock, FIFO lots, orders, delivery fees/tracking, payment amounts, refunds, newsletter consent or restock notifications. If you hide a navigation link, its route still exists; hiding a link is not an access-control setting.

## Storage / migration

No new database migration, dependencies or version upgrades are required.

The existing `store_meta` table holds a single new key, **`store.chrome.v1`**, containing `{ draft, published, revision, publishedAt }`. Preserve it in normal database backups. Missing/unpublished content uses the built-in defaults. Draft saves do not replace unrelated Store settings, Pages, branding, carousel, delivery or pricing metadata.

The isolated database’s actual columns/indexes were inspected: `store_meta` has text key/value columns with its existing primary-key index, and `products.total_cost`, `order_items.cost_basis` and `order_items.legacy_cost_basis` remain nullable integers. **Production was not accessed or modified.** No SQL commands need to be run specifically for this feature. If an inventory audit reports historical schema drift, use the previous inventory migration guide; do not reset production or run `db:push` as a shortcut.

## Install via your GitHub → VPS workflow

1. Take your normal database/source backup. Preserve `.env`, `.git`, uploaded branding/carousel/Pages images, artwork and existing runtime data.
2. Copy the **contents of `updated-files/`** in the ZIP into the matching paths in your repository. Include new files and the new API route. Do not put the outer `updated-files` folder inside the app. Upload/commit the changes to GitHub as you normally do.
3. In the existing app directory on the VPS, with your existing secured environment-loading arrangement:

   ```bash
   git pull
   npm run inventory:audit
   npx next typegen
   npm run typecheck
   npm run test:site-chrome
   npm run test:admin-workspaces
   npm run build
   pm2 list
   ```

   Dependencies/versions are unchanged. A reinstall is unnecessary if the previous update’s dependencies are already installed. Do not print or share real environment credentials.

4. After a successful build, reload **your existing PM2 app** using its actual name/ID: `pm2 reload <existing-app-name> --update-env`. Do not start a duplicate PM2 app. Inspect its logs locally.
5. Refresh Admin. Open **Store → Header & footer**. Confirm your existing branding, business details, delivery options and public Pages still work. Save a private draft, preview it on desktop/mobile, then publish when ready. Verify the live search, cart, account, dropdown links, footer information panels/Page links and guest tracker.

Rollback to your previous source/build if necessary; leave `store.chrome.v1` in the database for recovery. Older code ignores that key. Reverting source does not itself clear the saved draft/published content.

## Verification

All integration/browser/database tests used a disposable local **`inventory_test`** database. The port-3000 preview is also isolated test data, not production.

- Type generation, TypeScript checking, production build and ESLint for the new model/server/API/editor and shared rich-text/footer/provider files passed. This is not a full-repository lint cleanup; pre-existing lint findings in older header/dashboard components are outside this change.
- **28 unit tests** passed across site chrome, Pages, branding, delivery, Store settings, carousel, picklist, inventory and admin workspaces.
- New API/browser suite passed: owner/origin protection, safe rich-text/URL validation, draft privacy on public routes, preview isolation, publish/reset, concurrent revisions, rich-text bold/tokens, link CRUD/reorder, footer columns, unsaved-navigation guard, save/reload persistence, real mobile iframe preview, colour inheritance, live search/cart, mobile layouts and preservation of unrelated metadata/prices/acquisition costs.
- Existing Pages, branding, delivery/tracking, Store settings, admin workspaces, carousel, receiving/intake and inventory regression suites passed.
- FIFO/receiving database coverage passed: repeated different-cost purchases, known-zero/unknown costs, pack allocations, CSV/duplicates, trade stock + credit, POS/web consumption, exact refunds/returns, cancellation, concurrency/rollback, migration reruns and restock transitions. The **110,000-printing synthetic catalogue** search returned 30 results in **23 ms**; the real production catalogue was not replaced or reimported.

Optional development reproduction: `npm run test:site-chrome:browser` requires the app running with the existing isolated database setup. Never point browser/database regression scripts at production; they create synthetic fixtures and refuse non-`inventory_test` database names.
