# Updating Kings Collectables via GitHub & Ingesting All MTG Cards

This guide walks you through pulling the latest updates to your Ubuntu VPS via Git and populating your PostgreSQL database with every Magic: The Gathering card and printing (110,000+ cards) in ~15–20 seconds.

---

## ⚡ Quick 5-Step Summary

On your VPS console (`kingsuser@hosttest:~/kings-collectables`):

```bash
cd ~/kings-collectables
git pull origin main
npm install
npx drizzle-kit push
node scripts/sync-all-cards.mjs
npm run build
pm2 restart kings-collectables
```

---

## 📖 Detailed Step-by-Step Instructions

### Step 1: Push from your local computer to GitHub (if not already done)
If you manage your code via a local Git repository:
```bash
git add .
git commit -m "Add 110k MTG card database, universal search and restock notifications"
git push origin main
```

---

### Step 2: Pull the updates on your VPS
SSH into your VPS and navigate to the project folder:
```bash
cd ~/kings-collectables
git pull
```

---

### Step 3: Install any new dependencies
Ensure all packages are up to date:
```bash
npm install
```

---

### Step 4: Update the Database Schema
Apply any schema additions (indexes, stock alert tables, etc.):
```bash
npx drizzle-kit push
```
You should see:
```text
[✓] Pulling schema from database...
[✓] Changes applied
```

---

### Step 5: Ingest All 110,000+ Magic Cards into PostgreSQL
Run the high-speed streaming ingestion script:
```bash
node scripts/sync-all-cards.mjs
```

**What this script does:**
1. Enables `pg_trgm` (PostgreSQL Trigram Extension) and builds fast GIN search indexes on card names.
2. Streams Scryfall's official compressed bulk dataset (`default_cards.jsonl.gz`) directly into PostgreSQL in 2,500-card batches.
3. Automatically computes estimated AUD prices based on USD market prices and sets starting quantity to `0` (Out of stock).
4. Takes only **~15 to 20 seconds** total and uses minimal RAM (~75 MB total table size in Postgres).
5. Existing in-stock cards and custom prices are preserved (`ON CONFLICT DO NOTHING`).

You will see live progress in your terminal:
```text
=== Kings Collectables: Complete MTG Card Database Sync ===
Ensuring database indexes exist...
Fetching latest Scryfall bulk data URL...
Downloading stream from: https://data.scryfall.io/default-cards/...
Synced 15000 printings (2.1s elapsed)...
Synced 30000 printings (4.4s elapsed)...
Synced 45000 printings (6.5s elapsed)...
Synced 60000 printings (8.6s elapsed)...
Synced 75000 printings (10.7s elapsed)...
Synced 90000 printings (12.8s elapsed)...
Synced 105000 printings (14.9s elapsed)...
=== Sync Complete! ===
Total time: 15.6 seconds.
Database Stats: { total_cards: '110049', in_stock: '18', out_of_stock: '110031', table_size: '75 MB' }
```

---

### Step 6: Rebuild Next.js for Production
Compile the optimized production build:
```bash
npm run build
```

---

### Step 7: Restart the App with PM2
Restart your PM2 process to serve the new build:
```bash
pm2 restart kings-collectables
```

---

## 🧪 Verification

Test that everything is working:

1. **Check health endpoint**:
   ```bash
   curl http://localhost:3000/api/health
   ```
   Should output: `{"ok":true}`

2. **Test real-time search API for unstocked cards**:
   ```bash
   curl -s "http://localhost:3000/api/cards/search?q=Black+Lotus" | head -c 300
   ```
   Should immediately return Black Lotus printings (Alpha, Beta, Unlimited, Collectors Edition, etc.) with `quantity: 0` and high-res image scans.

3. **Visit your website in your browser**:
   Go to `https://kings.therobinsonfamily.com.au/cards` or use the top search bar.
   - Search for **"Black Lotus"**, **"Rhystic Study"**, **"Mox Diamond"**, **"Underground Sea"**, etc.
   - Any card in Magic's history will show up with its authentic card scan and set details.
   - Out-of-stock cards will show an **"Out of stock"** badge.
   - Customers can click the **Heart** icon (Wishlist) or **Bell** icon (Watch for restock).
   - When you later add inventory (via CSV import, Add Card, or POS), watchers are automatically tracked and notified!
