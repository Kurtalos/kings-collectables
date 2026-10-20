# Theme & branding

Open **Admin → Store → Theme & branding**. This is a dedicated editor for palette, identity and a few finishing touches, separate from business/shipping settings and from the Pages/carousel editors.

This is an incremental update on top of the previous **Admin Workspaces + horizontal navigation/editable slogans** updates. No new dependency or database migration is required. The supplied matching package manifests add test scripts only; their dependency requirements are unchanged.

## Colours

Choose a built-in preset, or **Follow Store settings** to retain the original Store settings theme as the source of truth. The original basic preset controls remain in Store settings for compatibility. If this editor selects its own preset or custom colours, an explanatory notice appears there; change/reset the overrides here to follow those basic controls again.

Enable **Use custom colours** to start with the currently selected preset's colours. Six tokens are editable:

- Accent and accent hover
- Highlight
- Soft panels
- Page background
- Header/footer background

Select a token's swatch, then drag the colour wheel to choose hue/saturation, adjust brightness, use the system colour picker or enter a six-digit HEX value. Wheel arrow keys adjust hue; Shift uses larger steps. Saturation and brightness sliders are keyboard-accessible. Invalid HEX input is not applied to the preview and cannot be saved. **Copy preset colours** replaces the draft colours with that preset's values.

Turning custom colours off uses the preset again; enabling them again starts from the preset rather than restoring an older custom selection. The preset also controls existing seasonal motifs. No arbitrary CSS, remote fonts, scripts or executable image formats are accepted.

Custom buttons automatically use black/white text for the accent and hover backgrounds. Sampled contrast warnings flag potentially hard-to-read combinations; they do not block creative choices. Prefer a light page background: much of the existing store uses dark body text and fixed white panels. This is a palette editor, **not a full dark-mode or every-component styling system**. Illustrations, product images, status colours, some component surfaces and some fixed copy colours retain their existing styling. Review the actual homepage, catalogue, product pages and checkout before sharing a new palette. Sampled contrast checks are not whole-site accessibility certification.

The admin workspace keeps its readable black/orange control palette so an experimental storefront palette does not make the editor unusable.

## Logos and favicon

Upload PNG, JPEG or WebP, up to **4 MB** each and under 40 megapixels. SVG, GIF, ICO, animated, corrupt and oversized inputs are rejected. Files are decoded/re-encoded, rather than serving uploaded source bytes, and original metadata is stripped.

- **Main logo:** used on light surfaces, including checkout and the owner login card. Also reused on dark surfaces when no alternate logo is supplied.
- **Dark-background logo:** used on the storefront header/footer, admin sidebar and register. Supply a variant with suitable contrast for those backgrounds. The header/footer background is customisable; review the preview if you choose a lighter background.
- **Favicon / browser icon:** upload a square image at least 64 × 64 pixels; 512 × 512 is recommended. The server generates a 512 × 512 PNG used for the browser icon and Apple touch-icon metadata. ICO generation, a PWA/install manifest and social-share artwork are not included.

Transparent PNG is recommended for logos. Logos are resized inside 1200 × 600 without enlargement and saved as WebP, preserving alpha where present. Choose image-only or image plus the real saved store name, and an 80–220px target width. Responsive size caps protect mobile headers and sidebars; this is a maximum layout target, not a forced crop. There is no image cropper or vector-logo editor.

Removing a draft logo/icon clears its assignment only. With no configured main/alternate logo, the existing crown/name is retained. Removing the favicon restores `/favicon.svg`. This fallback refers to unassigned images, not missing files on disk. Browsers sometimes cache favicons aggressively even after saving; refresh/reopen the site or check a private window.

## Additional controls

- **Display font:** Instrument Serif or Manrope, both already installed locally. This changes display text using the existing serif token; it does not replace all body/headline styles or add external font services.
- **Button shape:** sharp, soft or rounded corners for standard `.button` controls, not every icon, input or third-party payment control.
- **Browser title tagline:** changes the site's default title after the store name. Explicit page titles still take priority. Blank restores the original tagline.
- **Default site description:** default metadata, not visible homepage text. Blank restores the original description. Page-specific metadata may override it; search-engine wording/ranking is not guaranteed.

Admin header/sidebar slogans remain in **Store settings → Admin slogans**. Business/contact details, shipping and store name remain there too.

## Preview, saving and recovery

The representative desktop/mobile preview uses the actual Brand component plus sample store controls. Shopping/navigation are inert. It is not a full storefront rendering and contains no live customer/order data.

- Nothing changes live while typing. There is **no autosave and no server-side private draft**.
- **Save branding** applies only the branding record; it does not submit the Store settings form or modify shipping, prices, payments, inventory or acquisition costs.
- **Discard changes** restores the last loaded/saved values after confirmation.
- **Reload branding** fetches the current server record; unsaved changes prompt before discarding.
- **Reset to defaults** resets the draft to the built-in logo/favicon, original typography/button shape and **Follow Store settings**. It does not change the live site until Save branding is pressed. Following Store settings retains its current preset, which need not be Kings classic.
- Workspace section/tool navigation prompts before discarding dirty branding. A browser unload/reload also warns where supported. Do not rely on autosave: save/discard before using other top-bar links or leaving the app.
- An optimistic revision check prevents another admin tab from silently overwriting newer branding. On conflict, copy any values you want to retain, reload and reapply/review before saving.

Already-open storefront tabs need a refresh. The root layout reads saved branding server-side, avoiding a client-only theme flash. Other than owner-only editing endpoints, saved branding and its image assets are public. **Uploaded images are public at random URLs even before Save**, just as carousel artwork is; do not upload confidential material.

## Storage and deployment

Branding is stored as `{ settings, revision }` in the existing `public.store_meta` row **`store.branding.v1`**. Existing stores without the row retain their current palette and built-in branding by default. No DDL or migration is involved. Owner session and same-origin checks protect configuration and uploads. Concurrent writes are transactionally serialised and revision-checked.

Images are persisted in **`<app root>/data/uploads/branding`** by default, or the server environment variable **`BRANDING_UPLOAD_DIR`**. The PM2 app user must be able to read/write it. Custom storage paths must survive deployments; multiple app instances need shared persistent storage. Back up both the database **and the branding upload directory**, alongside the existing carousel uploads. Never overwrite/delete runtime uploads when deploying code.

Files are served through `/api/branding-images/<random-id>.webp` or `.png`, with immutable cache headers, strict filename checks and nosniff. Replacing images creates new URLs. Replaced, removed and abandoned draft uploads are retained because another configuration/export may reuse them. No automatic image garbage collection or full branding revision-history browser is added. Keep backups; losing saved image files requires re-uploading or clearing their assignments.

If the reverse proxy reports **413**, configure an appropriate body limit for the existing application server block (for example `client_max_body_size 5m;`, or keep the existing carousel's larger 9m limit), then `sudo nginx -t` before reloading Nginx. The application still enforces its own 4 MB upload limit.

## Install this incremental ZIP

1. Back up the application, database and existing uploads using your normal process.
2. Copy the **contents** of `updated-files/` into your existing repository root, preserving paths. Include both supplied `package.json` and `package-lock.json`. Do not create a nested application directory. Upload to your GitHub as usual.
3. In the existing app directory on the VPS, run one command at a time and stop on any failure:

   ```sh
   git pull
   npx next typegen
   npm run typecheck
   npm run test:branding
   npm run test:admin-workspaces
   npm run build
   pm2 list
   pm2 reload YOUR_EXISTING_APP_NAME --update-env
   ```

   Replace the PM2 placeholder with your actual existing app name. Only reload after a successful build. No new dependencies are added, so another `npm ci` is not necessary if the previous install completed and the existing build dependencies remain installed. If missing, install from the supplied matching manifest pair with `npm ci --include=dev --no-audit --no-fund`; keep your VPS swap enabled. The existing Chromium engine warning relates to browser tests, not a newly added runtime requirement. Do not run browser/integration tests on production.
4. Refresh Admin, open Theme & branding, review the inherited appearance, then test your own uploads/palette in preview before saving. Check the real storefront and checkout on desktop/mobile after saving.

Do not reset/push the database schema. Preserve `.env`, `.git`, runtime directories and artwork. Production was not accessed or changed during development.

## Verification performed

- Production build, route generation, TypeScript and diff whitespace checks passed.
- Targeted lint of new modules/routes/editor/tests: zero errors, two advisory Next image warnings for bounded local upload previews.
- Branding unit tests (4) passed: legacy/preset inheritance, allowlisted validation, HSV round-trips, contrast/text selection, image decode/re-encode, transparency, dimensions/size/type restrictions, missing-image handling and traversal rejection.
- Branding Chromium/API checks passed: owner/CSRF protection, streamed upload bounds, concurrent revision conflict, wheel/HEX/font controls, logo/icon uploads, preview isolation, unsaved tab guard, save/reload, desktop/mobile and tablet layouts, correct light/dark logo assignment, public metadata/icon serving, removal/discard, default reset, all other metadata/cost preservation and no page errors.
- Existing store-settings, admin-workspaces/demand/newsletter, Pages, carousel, inventory/admin acquisition-history and PDF-picklist browser regressions passed.
- Existing inventory API/database regressions passed for repeated receipts/costs, FIFO checkout/POS, refunds/cancellation, trade credit, CSV/duplicates, transactional rollback/concurrency, restock transitions, migration rerun and ledger parity; 110,000 synthetic printing search passed.
- Existing inventory, picklist, Pages, carousel and store-settings unit suites passed. Including admin-workspaces and branding, 22 unit tests passed.
- Isolated schema audit confirmed nullable integer `products.total_cost` and `order_items.cost_basis`/`legacy_cost_basis`, quantity defaults and existing variant/search indexes. This does not assert the state of your production schema.

Browser/integration scripts require an explicitly provisioned isolated `inventory_test` database/test owner/server, never production. Their generated fixtures/screenshots, dependency directories, upload files and build output are not included in this source ZIP.
