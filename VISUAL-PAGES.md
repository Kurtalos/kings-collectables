# Visual page editor

Open **Admin → Pages**. This is a block-based WYSIWYG content editor, not an arbitrary HTML/CSS/theme-code editor. No paid editor service is required.

## Workflow

1. Choose **Home**, one of the information-page starters (About us, Shipping, Returns, FAQs, Contact), or create a new page with a title and URL slug.
2. Change page details and arrange sections with the up/down controls. Remove or hide sections you do not want. At least one section must remain visible.
3. Format text using the visual toolbar: paragraph, heading 2/3, bold, italic, underline, strikethrough, bullets, numbered lists, quotes, text links, undo and redo. Select text before applying a link. Links may be store paths or HTTPS URLs; scripts, embedded HTML, arbitrary styles, iframes and insecure external links are not accepted.
4. Add images as image/text sections. Upload JPEG/PNG/WebP up to 8 MB, give each image a descriptive alt text, and choose left/right alignment. Images reuse the carousel's persistent, validated WebP storage and upload protections.
5. **Preview page** opens an owner-only, unsaved preview of the page body using the shared live renderer. Choose desktop/mobile width. Links, contact and shopping actions are disabled in this preview. Product data is loaded from the current catalogue when preview is opened. Header/footer are not shown in the page-body preview.
6. **Save draft** retains changes privately without changing the published page. There is no automatic save. Leaving the Pages tab or reloading loses unsaved changes. Switching pages and discarding edits warn when local edits would be lost.
7. **Publish page** validates and saves the current editor content as both the draft and the live version. A previously saved draft is not required. Always review your preview and policy wording first.
8. **Unpublish** removes the public page and its navigation links but keeps the last saved draft. Unsaved browser edits are discarded after confirmation. Unpublishing Home restores the previous built-in homepage.
9. Custom pages can be deleted after confirmation. Starter pages cannot be deleted; leave them unpublished instead. Deleting a custom page removes its draft, live content and automatic navigation links; existing external/manual links will return 404.

New pages and starters are not public until explicitly published. Information-page starter text is only guidance: replace it with your real policies/content before publishing. The app does not create a returns policy, tax/legal advice or contact hours for you.

## Sections

- **Formatted text**: rich text, optional section heading and button.
- **Image & text**: accessible image, rich text, heading/button and left/right image alignment.
- **Promotion banner**: theme-aware contrast panel, text and optional button.
- **Collections**: all collections or one selected collection, with links to the real catalogue.
- **Product grid**: featured/newest cards or a selected collection, up to 12. Public grids use the existing product-card/cart/wishlist functionality; prices and stock are live application data, never editable text.
- **Homepage carousel**: uses the existing saved carousel. Edit slide images/text/order in the separate Homepage carousel section.
- **Store benefits**, **Featured sets**, **Discovery links**: reusable sections based on the previous homepage.
- **Live contact details** and **Live shipping rates**: use the actual saved Store Settings. The contact block opens the existing contact-message form, so messages still reach the admin inbox. These blocks do not change prices, payment accounts, dispatch rules or SMTP delivery.

Up to 30 sections per page, 50 saved page records and 20,000 rich-text characters per section. Rich text is stored as a validated structured document and rendered through allowlisted React elements, never injected as raw HTML. Formatted text sections are theme-aware; there are no arbitrary font/colour/code controls that can break the store layout.

## Homepage behaviour

The current homepage stays untouched until Home is published. Its starting draft offers the carousel, benefits, featured sets, product grid and discovery sections. These are reusable blocks, not a pixel-for-pixel import of the old homepage (for example, the product grid does not include the old product-tab switcher). Preview this draft and adjust titles/sections before publishing.

Published Home replaces the homepage's main content while retaining the real header, footer, cart, wishlist, quick view and store theme. Carousel slides remain independently configurable. Unpublish Home to return to the previous built-in homepage.

## URLs and navigation

Home is served at `/`. Other pages use `/pages/<slug>` (for example `/pages/returns`). Choose a lowercase slug of letters, digits and hyphens when creating a page. URLs are fixed after creation to avoid silently breaking links; create a new page to change a URL. There is no automatic redirect manager.

The `/pages/` namespace deliberately cannot override `/checkout`, `/account`, `/admin`, APIs or inventory/catalogue routes. Header and footer checkboxes only take effect on publication. Header pages appear in a **More pages** menu to prevent long page lists overflowing the navbar.

Published About us, Shipping, FAQs and Contact pages are also opened by the store's existing information links where applicable. Before these pages are published, the previous information modals remain available. The Contact page's live contact block can still open the existing contact form directly. Returns and other custom pages get additional footer links when enabled.

Already-open storefront tabs need a refresh after publication/navigation changes. Metadata titles/descriptions come from the published page, never the draft.

## Storage, permissions and conflicts

Uses the existing `public.store_meta` table with keys `content.page.<slug>`. Each page stores one last-saved draft, one published snapshot, an update revision and the publication timestamp. There is no full revision-history browser or automated rollback archive in this update; keep database backups.

Writes use the existing owner session and same-origin checks. Saves/publication are transactional, and an expected revision prevents a stale editor tab from overwriting newer work on the same page. If a conflict is reported, copy any unsaved wording you need, choose Reload Pages and review the current version before retrying. Drafts and hidden sections are never sent in public page props/navigation. Images themselves are public files at random URLs, including draft uploads; never upload sensitive documents.

No database migration is required. Store settings, carousel configuration, acquisition costs, price automation, existing order totals and payment/account behaviour are not modified. The production database was not accessed or altered. The existing metadata schema and acquisition-cost columns/indexes were inspected on the isolated test database.

Images use `CAROUSEL_UPLOAD_DIR` or the previous `<app root>/data/uploads/carousel` default. The directory must remain writable by the PM2 app user and must be backed up with the database. Removing a page/section does not delete image files because they may still be used elsewhere. See `HOMEPAGE-CAROUSEL.md` for persistent storage and Nginx upload limits (a proxy 413 may require `client_max_body_size 9m;`).

## Install the incremental update

Apply on top of the prior carousel, store-settings, receiving and PDF updates. This is not a full repository snapshot.

1. Back up the app and database; extract separately and compare any custom code before replacing it.
2. Copy the **contents** of `updated-files/` into your app root, merging directories. Keep `.env`, `.git`, existing artwork and runtime upload directories.
3. If uploading to GitHub yourself, use those repository-root paths, not a nested `updated-files` folder. Include **both `package.json` and `package-lock.json`**. They add the Tiptap rich-text editor dependencies. Pull the same branch on your VPS afterwards.
4. In the application root with your normal environment configured:

```bash
npm ci --include=dev
npx next typegen
npm run typecheck
npm run test:pages
npm run build
```

Reload your existing PM2 application and refresh the browser. No migration, schema reset, new payment credentials or new upload-storage service is needed. Do not run `drizzle-kit push` or the empty database schema dump.

## Tests

- `npm run test:pages`: structured-content validation, safe links, accessible image requirements, section bounds, rich-text sanitisation and protected route namespace.
- `npm run test:pages:browser`: isolated `inventory_test` database and local app only. Tests owner/same-origin checks, draft/preview privacy, publish/save/unpublish/delete behaviour, homepage fallback, stale revision rejection, invalid rich text, GUI creation/formatting/upload/reordering/preview/publishing, navigation, responsive layouts and browser errors. Restores its own Home record and removes only its uniquely named test pages.
- Existing inventory/FIFO/refund/trade, settings, carousel and PDF tests remain available. Never run integration/browser suites against production.
