# Kings Collectables

## Complete Magic Card Database (110,000+ Printings)

The store is powered by a complete database containing every single Magic: The Gathering card and printing across the game's entire history (110,000+ card printings):
- **Universal search**: Anyone can search for ANY card (e.g. Black Lotus, Rhystic Study, Force of Will, Dual Lands, etc.) in the search bar or on `/cards`.
- **Out of stock display**: Cards that the store has not entered inventory for yet display as "Out of stock" with full high-resolution Scryfall card scans, set information, rarity, and oracle rules text.
- **Wishlists & restock notifications**: Customers can add out-of-stock cards to their Wishlist or click the Bell icon to "Watch for restock".
- **Automatic restock tracking**: When the store later enters stock (via CSV import, POS, or Add Card), watchers are automatically flagged and notified!
- **Database sync script**: Run `node scripts/sync-all-cards.mjs` on your server at any time to sync all 110,000+ printings directly from Scryfall in ~15-20 seconds.

## Point of sale (register)

Open **Register (POS)** in the workspace sidebar, or **Open register** in the top bar (`/admin/pos`). It is owner-gated by the same session as the rest of the workspace.

The register is not a separate system. It reads and writes the **same `products` inventory** and creates rows in the **same `orders` / `order_items` / `payments`** tables as the web store, with `channel = "pos"`. A card sold over the counter immediately disappears from the online shelf, and a sale attached to a customer profile appears in that customer's account order history.

### Selling
- Search by card name, set, set code or collector number; **Enter** adds the first result.
- Tap a result to add, or use the basket steppers. Out-of-stock variants cannot be added.
- **Per-line price override** for haggling, plus an optional line note printed on the receipt.
- Whole-sale discount as a **percentage or flat amount**, recorded on the order.
- Attach a customer (search by name/email) or sell to a walk-in.
- **Trade-ins** issue store credit to the attached customer when the sale completes.
- Payment methods: Cash, Card, EFTPOS, Store credit, Gift card, Other — with **split payments** across up to six tenders.
- Quick-cash buttons and automatic **change calculation** (overpayment is only accepted on a single cash tender).
- Completing a sale locks the product rows, re-checks stock, decrements inventory, and writes the order as **Paid** in one transaction.

### Receipts and refunds
A printable receipt appears after each sale (browser print styles hide the rest of the app). Refund a sale from **Takings** or from the order detail in the dashboard: stock is returned to the shelf, tenders are reversed, any store credit used is credited back, and the order becomes **Refunded**. Refunds are idempotent — a second attempt is rejected. Refunded and cancelled register sales cannot be reopened.

### Takings
The **Takings** view reports a chosen date: takings, gross, refunds, cards sold, discounts given, credit issued/redeemed, a breakdown by payment method, and every register sale. Export the day to CSV for your bookkeeper.

### Customers and store credit
The **Customers** view searches profiles, adjusts credit with a recorded reason, and attaches a profile to the register. POS-created profiles use the same `customers` table as web registrations, so the person can sign in online and see their in-store purchases.

Credit movements are append-only in `credit_transactions` (trade-in, redemption, refund, manual adjustment), and `customers.credit_balance` is the running total — updated inside the same transaction as the sale, with row locking so concurrent sales cannot overdraw a balance.

### Register limits
200 lines per sale, 999 units per line, $10,000 maximum per line price, six tenders, 100 trade-in lines, 500 sales per report query.

## Deck builder

Customers can paste an entire decklist at `/deckbuilder` instead of searching for cards one at a time.

### Importing from Moxfield (and other deck sites)

Paste a **Moxfield URL** straight into the decklist box and press **Find my cards** — the shop recognises the link, shows the four-click path to Moxfield's *Export → Plain Text*, and gives you a box to paste the result into. **Archidekt**, **TappedOut** and **MTGGoldfish** links work the same way.

**Why not fetch the URL directly?** Moxfield has no public API and blocks server-side reads with Cloudflare (every endpoint returns 403, with no CORS headers for browsers either). Rather than build something that breaks the day they change their config, the shop detects the link and walks you through the text export — which is also the *only* method that works for private decks. The existing parser handles Moxfield's export format natively: set codes and collector numbers in parentheses, `Deck` / `Commander` / `Sideboard` / `Maybeboard` sections, `SB:` prefixes, and foil markers.

**Accepted formats**

```
4 Lightning Bolt                      plain
4x Sol Ring                           with x
1 The One Ring (LTR) 241              set + collector number
2 Sol Ring *F*                        foil marker
2 Lightning Bolt *M11*                set tag
SB: 2 Cyclonic Rift                   sideboard prefix
1 Brisela, Voice of Nightmares // Briseole   double-faced
Ragavan, Nimble Pilferer              bare name defaults to 1
```

Section headings (`Deck`, `Commander`, `Sideboard`, `Maybeboard`) group the results. `//` comments and export headers are skipped. Duplicate lines in the same section are merged; the same card in different sections stays separate.

Limits: 400 lines, 200 different cards, 999 copies per line.

Customers can paste an entire decklist at `/deckbuilder` instead of searching for cards one at a time. Paste a list, press **Find my cards**, and every line is matched against live inventory.

### Accepted formats
One card per line. All of these work:

```
4 Lightning Bolt                 plain quantity
4x Sol Ring                      trailing x
1 The One Ring (LTR) 241         set code and collector number
2 Sol Ring *FOIL*                foil marker
2 Lightning Bolt *M11*           set tag
2 Sol Ring [3:4]                 MTGA/Arena export
SB: 2 Cyclonic Rift              sideboard prefix
1 Brisela, Voice of Nightmares // Briseole   double-faced card
Ragavan, Nimble Pilferer         bare name defaults to 1
```

Section headings (`Deck`, `Commander`, `Sideboard`, `Maybeboard`) group the results. `//` comments and `decklist`/`created by`/`about` header lines are ignored. Duplicate lines in the same section are merged; the same card in different sections stays separate.

Limits: 400 lines, 200 different cards, 999 copies per line. Requests are rate-limited to 12 per minute per IP.

### Matching behaviour
Names are matched case-insensitively against inventory, including the front face of double-faced cards. Unknown names are resolved against Scryfall in batches of 75 (respecting its rate limits) so customers see the correct card image and set even when you don't stock that printing.

Each row reports **In stock**, **Partial stock**, **Out of stock**, **Not stocked**, or **Check line**, plus live price and available quantity. Where a card has multiple condition/finish variants, customers pick one from a dropdown. **Add all in-stock cards** fills the cart in one action, respecting available quantities. Results can be exported as CSV.

### Saved decks
Signed-in customers can save up to 25 named decks (`decks` and `deck_items` tables) and reload them later. Saving with the same name updates the existing deck; deleting a deck cascades to its items.

## Daily price updates

The shop can follow live market prices from Scryfall every day — the whole point of opting in is that your prices never go stale.

**How it works.** Every printing starts out **manually priced** (nothing ever changes without you opting in). In Inventory, flip individual cards to **Follow market** — the toggle sits next to the edit/delete buttons, and following cards show a blue AUTO badge. The edit-card dialog has the same checkbox; select multiple rows and use the **Follow market / Set manual** bulk buttons for the whole set. Once a day, a scheduled job fetches market prices for just the following cards from Scryfall in batches of 75, then reprices them:

```
AUD price = market USD × exchange rate × (1 + store margin %) × condition multiplier, rounded UP
```

- **Exchange rate** defaults to the ECB USD→AUD rate fetched daily from Frankfurter (cached as fallback in the database). Switching off the auto rate lets you set a fixed manual rate instead.
- **Store margin** is your markup on top of market — default 15%, adjustable from -50% to +200%.
- **Rounding** always rounds up so you never undercut yourself — default 50¢ increments, adjustable from exact cents up to $10 steps.
- **Condition multipliers** price play-wear off Near Mint automatically: LP 0.85, MP 0.70, HP 0.50, Damaged 0.35 by default. All editable in the Pricing tab.

### Choosing a price source

The sync always resolves each card's market price through two feeds, with a clean fallback chain:

- **TCGplayer (official API)** — the freshest market price available, fetched from `api.tcgplayer.com` with a free approved developer key pair (`TCGPLAYER_PUBLIC_KEY` + `TCGPLAYER_PRIVATE_KEY` in the server `.env`). Scryfall supplies each card's TCGplayer productId, so no extra mapping work is needed; finish matches price from the right `subTypeName` row (Normal versus Foil).
- **Scryfall (default)** — kept in Scryfall's complete database. It's not a stub: Scryfall's USD price at `usd` is itself TCGplayer's market price, scored once a day. When a card has no TCGplayer mapping or its price row is missing, the sync falls back to it automatically, with the fallback count shown against every run.

The Pricing tab's **Market price source** selector offers `Automatic` (TCGplayer when keys are configured, Scryfall otherwise), `TCGplayer`, and `Scryfall`. Without keys the selector explains what to configure and stays on Scryfall.

**The Pricing tab** in the workspace (`/admin → Pricing`) shows the rules, how many cards follow versus stay manual, the last run's outcome (changes made, already-up-to-date, prints missing prices), and an **Update prices now** button for instant refreshes. Every price change is written to the `price_events` log with the old price, new price, the market USD price and the exchange rate used, so you can see exactly why any price moved — and undo it by editing the card again.

**Scheduling on the VPS.** Set `CRON_SECRET` in `.env`, then add one line to the crontab:

```cron
0 3 * * * curl -fsS "http://127.0.0.1:3000/api/cron/prices?key=YOUR_CRON_SECRET" >> /var/log/kings-pricing.log 2>&1
```

That calls `/api/cron/prices`, which validates the secret, runs the same sync the button calls, and records the summary. Run results stay readable in the Pricing tab. Without `CRON_SECRET` the endpoint stays disabled and only manual runs work.

Cards without a market price on Scryfall (old promos are the usual culprits) keep their current price and show up as failures in the run summary rather than being zeroed.

## Payments

The store supports two payment methods: **Stripe** for cards and **Bank Transfer** for fee-free BPay / Osko payments. Stripe is the recommended gateway — reliable, trusted, and low-fee for Australian cards.

### Stripe fees (AUD)
- **1.75% + A$0.30** for domestic cards (Amex: 2.25% + A$0.30)
- **2.9% + A$0.30** for international cards
- No monthly fees, no setup fees, no PCI-DSS compliance burden

### Enabling Stripe
Create a Stripe account at <https://dashboard.stripe.com/register> and add these environment variables:

```bash
# Your Stripe API keys from https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_live_...              # Use sk_test_... for testing
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Webhook secret from https://dashboard.stripe.com/webhooks
# Point the webhook at: https://your-domain.com/api/payments/webhook
# Listen for: payment_intent.succeeded, payment_intent.payment_failed
STRIPE_WEBHOOK_SECRET=whsec_...
```

Without these keys, the store falls back to Bank Transfer only. Customers can always reserve cards and pay later.

### Bank Transfer
Edit the bank details in `src/components/cart-drawer.tsx` (the `bank-details-grid` section) to match your business account. The store displays these instructions to customers after they reserve their cards. Owners confirm bank transfers in the admin workspace — once confirmed, orders automatically move to **Paid**.

### Payment flow
1. Customer reserves cards → Order is created in **Awaiting payment** status
2. Customer chooses payment method:
   - **Card**: Stripe PaymentIntent is created, customer completes 3D Secure checkout, webhook marks order **Paid**
   - **Bank Transfer**: Customer sends payment, owner confirms in admin, order marked **Paid**
3. Owner packs and ships → Order moves to **Packing** then **Shipped**
4. Cancellations return stock automatically

All payment attempts are recorded in the `payments` table for audit. Failed payments can be retried — the store creates a fresh PaymentIntent each time.

### Testing Stripe
Use Stripe's test card numbers from <https://docs.stripe.com/testing#cards>. With test keys, the `payment_intent.succeeded` webhook fires automatically and orders transition to **Paid** without a real charge.


An independent Australian Magic: The Gathering store built with Next.js App Router, PostgreSQL and Drizzle. No Shopify or eBay account is required.

## What is included

- Responsive storefront with genuine card scans, a promotional carousel, set browsing and curated selections.
- Search, collection, set, colour, rarity, price, foil and stock filters; sorting and grid/list views.
- Dedicated card pages at `/cards/[scryfallId]` listing every printing of a card, grouped by set, each with its own price, stock, condition and finish.
- Card quick views, device-local wishlists and persistent carts.
- Stock-aware order reservations with server-calculated AUD prices and shipping.
- Owner workspace at `/admin`: inventory editing, CSV export, bulk collection assignment, imports, collections, orders and messages.
- CSV column mapping, exact Scryfall printing matching, validation preview, add/replace stock modes and transactional import history.
- Signed, HTTP-only owner sessions when owner protection is configured.

## Local setup

The runtime needs `DATABASE_URL` pointing to PostgreSQL. Install dependencies, apply the schema using `npx drizzle-kit push`, then use `npm run dev`. The platform preview handles its own database bootstrap and production start.

The first catalogue request seeds 18 sample printings and four collections. The seed is idempotent: a database marker prevents deleted stock from being recreated. Replace these sample prices and quantities with your actual inventory before publishing.

## Owner protection

The preview workspace is intentionally accessible when `ADMIN_PASSWORD` is not set, so you can try all management features. **Set a strong `ADMIN_PASSWORD` and an independent, random `SESSION_SECRET` in server environment variables before publishing.** Do not prefix either secret with `NEXT_PUBLIC_`.

When configured, `/admin` shows an owner login and management API writes require an authenticated session. Owner cookies are HTTP-only, same-site strict, expire after twelve hours, and are secure in production. The sign-in endpoint limits repeated failed attempts per process.

## Importing inventory

Download the CSV template from **Workspace → Import cards**. CSV files may contain up to 1,000 rows and be up to 2 MB. UTF-8 BOMs, quoted commas, escaped quotes and quoted newlines are supported. Headers are mapped explicitly, with common aliases suggested automatically.

| Field | Meaning |
| --- | --- |
| `name` | Exact Magic card name. Quote names containing commas. |
| `set` | Scryfall expansion code, such as `mh3` or `cmm`. |
| `collector_number` | With `set`, identifies an exact printing. |
| `scryfall_id` | Optional exact printing UUID; takes priority over other identifiers. |
| `quantity` | Whole number from 0 to 100,000; defaults to 1. |
| `price` | Your AUD selling price, with up to two decimal places. Required for a new variant; existing variants can retain their current price. |
| `condition` | Near mint / NM, Lightly played / LP, Moderately played / MP, Heavily played / HP, or Damaged. Defaults to Near mint. |
| `finish` | Non-foil, Foil, or Etched. Boolean foil columns are accepted by the mapper. Defaults to Non-foil. |
| `category` | Custom collection name; use `|` between multiple collection names. New names create new collections. |

Use a name plus set, set plus collector number, or Scryfall ID for deterministic printing matching. A name alone resolves a Scryfall preferred printing. Every Scryfall printing + condition + finish has a unique inventory record.

Review the preview before committing. Invalid rows are highlighted and skipping them requires confirmation. Duplicate rows for the same variant are combined; conflicting prices are rejected. **Add stock** increases existing quantities; **Replace stock** replaces quantities for the variants in the file. Neither mode deletes unrelated inventory.

Scryfall requests identify the application and are queued at least 550 ms apart. Collection lookups use batches of at most 75 identifiers. Sample card images and fonts are locally hosted; imported imagery uses the URLs supplied by Scryfall.

## Collections

One card may belong to multiple collections. Sets, colours and rarities come from card metadata automatically. Select inventory rows and choose **Add to collection** to bulk-group cards. Deleting a collection removes only its associations, never the underlying card inventory.

## Checkout

Checkout lives on its own page at `/checkout` (the cart drawer hands off to it). It runs as three steps with a persistent order summary, and progress is blocked until each step is valid.

1. **Your details** — name and email. Signed-in customers see both prefilled from their account, plus a note confirming which account is in use. Guests see a prompt to register.
2. **Delivery** — saved-address selector for customers, or a structured Australian address form (recipient, street, unit, suburb, state, postcode, optional contact number). Customers can add, edit, remove and re-default an address without leaving checkout, and tick **Save this address for next time**.
3. **Payment** — card (Stripe) or bank transfer, then a review block summarising contact, delivery address, card count and total with edit shortcuts.

The summary sidebar allows quantity changes and removals; the cart is written back to browser storage so the storefront stays in sync.

### Saved addresses

Stored in the `addresses` table, scoped to a customer, capped at ten. Exactly one address is the default: saving the first address promotes it, setting a new default demotes the previous one, and deleting the default promotes the oldest remaining address. Exact duplicates (same recipient, street and postcode) are rejected.

Validation is shared by the client and server (`src/lib/address.ts`): state must be one of NSW, VIC, QLD, WA, SA, TAS, ACT, NT; postcode must be four digits; phone, if present, must look like a number.

When an order is placed with `addressId`, the server **re-reads that address and composes the delivery block itself** — client-supplied address text is ignored, and an address belonging to another customer is rejected. Orders store `addressId` (nullable, `ON DELETE SET NULL`) alongside the composed `shippingAddress` text and `recipientPhone`, so historical orders keep their delivery details even if the address is later deleted.

Guests may send structured address fields; they cannot use or create saved addresses. A signed-in customer can opt to save the address entered at checkout.

### Fulfilment

Placing an order locks inventory rows, re-verifies stock, and calculates totals from database prices. Shipping is $8.95 within Australia and free at a $100 card subtotal. Card payments are confirmed by Stripe webhook and move the order to **Paid**; bank transfers are confirmed by the owner in the workspace. Then move the order to Packing and Shipped. Cancelling an unshipped web order returns stock once; cancelled and refunded orders cannot be reopened. Customers can look up an order with both its order number and email address, and signed-in customers see every order — including in-store register sales — in their account.

Contact messages are saved to the owner Inbox. Newsletter signups are saved to PostgreSQL. **Transactional email delivery, marketing campaigns, tax calculation, shipping-label integrations and backups are not configured.** Connect the services appropriate to your business before opening a paid public store.

## Validation

- `npx next typegen`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`
- `npx tsx scripts/smoke-test.ts` against a running app: catalogue, CSV import, decklist parsing and matching, saved decks, accounts, wishlists and watch lists, payments, POS sales and refunds, saved addresses, and checkout with saved, inline and guest addresses. Cleans up its own temporary data.
- `node scripts/browser-check.mjs` against a running app: desktop and mobile storefront, search, sorting, cart, the three-step checkout (validation gating, address entry, review, success), signed-in autofill and address selection, account address management, admin, CSV import review, deck builder and POS register. Requires Playwright Chromium.
- `npx tsx scripts/clean-browser-data.ts`: removes the customers and orders created by the browser suite and returns their cards to stock. Real customer records are left untouched.

The browser suite leaves a small amount of data behind by design (it exercises real registration and checkout); run the cleanup script afterwards. Rate limits are per-process and per-IP, so restarting the app clears them between test runs.

Use `TEST_BASE_URL` to point these checks at a non-default URL. API health is available at `/api/health`.

Magic: The Gathering and its card imagery belong to their respective rights holders. Card metadata and scans are supplied by Scryfall. Kings Collectables is not affiliated with Wizards of the Coast.

## Inventory intake and FIFO costs

See [INVENTORY-INTAKE.md](INVENTORY-INTAKE.md) for the Receive stock workflow, CSV format,
POS trade-in/return behaviour, safe VPS migration commands and test setup. Apply the
additive inventory migration before running this version against an existing database.
