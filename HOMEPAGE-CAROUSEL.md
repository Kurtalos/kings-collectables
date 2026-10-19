# Homepage carousel editor

Open **Admin → Homepage carousel** while signed in as the store owner.

## Using the editor

- Add up to 12 slides; at least one must remain visible.
- Select a slide to change its small heading, multiline title, description, and two optional button labels/links. A blank small heading uses the saved store name.
- Links must be paths within the store, e.g. `/cards`, `/cards?set=blb` or `/cards?category=new-arrivals`. To hide a button, clear both its label and its link. HTML is not accepted as formatting; text is rendered safely by React.
- Upload JPEG, PNG or WebP artwork, up to 8 MB and 40 megapixels. SVG, GIF, animated and corrupt images are rejected. Images are decoded, auto-oriented, stripped of metadata, resized within 2400 × 1600 and re-encoded as WebP.
- Wide artwork around 1920 × 900 is recommended. Use the horizontal/vertical focus sliders to adjust cropping. Cropping differs with the screen shape; the image is a decorative background and the title carries the promotion's meaning.
- Choose the existing built-in artwork instead of uploading if desired. Built-in paths preserve the previous app's imagery; those files must exist in your deployment. If an old image is missing, upload a replacement.
- Move slides up/down using the arrows. This is their display order.
- Uncheck visibility to hide a slide without deleting it, or remove it from the list. The last slide cannot be removed, and saving all slides hidden is rejected.
- The selected-slide preview uses the same component as the live homepage, with links disabled. Text/order/visibility changes are not published until **Save carousel** succeeds. **Discard changes** restores the last saved list. Leaving the page without saving discards the browser draft.
- Homepage controls are manual next/previous/dots, as before. With one visible slide, controls are hidden. This update does not introduce autoplay.

Hidden slides are available only through the owner-authorised configuration API; the public page receives only visible slide data. Uploaded images themselves are public, randomly named assets, including an uploaded image that has not yet been published. Do not upload private or sensitive documents.

## Storage and persistence

Slide configuration uses the existing `public.store_meta(key text primary key, value text not null)` table, under a separate key `homepage.carousel.v1`. No new migration is required. Missing configuration preserves the three previous promotions. Store details, pricing configuration, inventory, costs and orders are not modified.

Images are stored on persistent disk, **not in `.next` or a generated `public` directory**. The app serves them through `/api/carousel-images/<uuid>.webp` with the correct image type, immutable caching and nosniff protection. A new upload always gets a new filename. File paths are constrained to UUID filenames; client file names are never used for disk access. Only the owner can upload or save slides; uploads and writes use the existing same-origin protection.

By default images go into `<app root>/data/uploads/carousel`. This directory is ignored by Git. Existing `git pull`, `npm ci` and app builds do not remove it. Do not use deployment tools that delete untracked runtime data.

**Recommended for VPS/PM2 releases:** use a dedicated directory outside the checkout/release tree. As the same Unix account that runs PM2, for example:

```bash
mkdir -p /home/kingsuser/kings-uploads/carousel
chmod 750 /home/kingsuser/kings-uploads/carousel
```

Add this to your existing `.env` (do not replace the file):

```text
CAROUSEL_UPLOAD_DIR=/home/kingsuser/kings-uploads/carousel
```

Adjust the account/path for your server. The PM2 app user must be able to write there; no world-writable permissions are necessary. Do this before the first upload. If changing the path after uploads exist, copy your existing image files into the new directory before reloading the app. Back up BOTH the database and image directory. Multiple app servers must share the same image storage; this implementation targets the existing single Ubuntu VPS.

Replacing/removing a slide does **not** delete its image file: this prevents breaking another slide or an already-open/cached page. Unused uploads are retained, including discarded drafts. There is no automatic garbage collector in this update; include this directory in your storage monitoring and backup policy.

### Reverse proxy upload limit

The application limit is 8 MB. Nginx commonly defaults to a smaller limit. If uploads return a proxy `413 Request Entity Too Large`, configure an appropriate limit in the existing store server/location configuration, for example:

```nginx
client_max_body_size 9m;
```

Validate your Nginx configuration with `sudo nginx -t` before reloading it. Do not overwrite the rest of your server configuration. This is only needed if your current proxy limit is too small.

## Install this incremental update

This ZIP applies on top of the previous Store Settings / receiving / PDF updates; it is not a full application snapshot.

1. Back up the app/database. Extract separately and compare custom edits.
2. Copy the **CONTENTS** of `updated-files/` into your app root, merging folders. Do not create an `updated-files` subfolder in the app. Preserve your `.env`, `.git`, existing assets and uploaded images. Merge `.gitignore` entries if you have custom rules.
3. Copy **both** `package.json` and `package-lock.json` together. They add the production `sharp` image-processing dependency.
4. If uploading the update to GitHub yourself, upload the files at those same repository-root paths, including the lockfile, then pull the same branch on your VPS. This session does not publish changes to GitHub.
5. In the app root, with your usual environment configured:

```bash
npm ci --include=dev
npx next typegen
npm run typecheck
npm run test:carousel
npm run build
```

Reload your existing PM2 process with its normal environment and refresh the browser. Configure `CAROUSEL_UPLOAD_DIR` as described above if you want storage outside the checkout. There is no schema migration and no reason to reset your database or run the empty schema dump.

## Tests

- `npm run test:carousel`: configuration validation, safe links, required visible slide, size/count bounds, image decoding/resizing/metadata stripping, unsafe types and path traversal.
- `npm run test:carousel:browser`: isolated `inventory_test` database only, production app running on port 3000 or `TEST_BASE_URL`. Tests owner/same-origin checks, corrupt/oversized uploads, public WebP delivery, hidden-slide privacy, missing-file validation, GUI upload/edit/order/add/remove/discard/save/reload, draft isolation, homepage controls, one-slide behaviour and responsive desktop/mobile views. It restores its own settings row; test uploads remain in the isolated server's upload directory.

Production data was not accessed or changed. Development uses synthetic inventory in the isolated local PostgreSQL database. The existing metadata schema, primary index and acquisition-cost columns were previously inspected there; no schema drift is required for this feature.
