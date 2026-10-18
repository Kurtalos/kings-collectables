# Deploying Kings Collectables to Your Server via GitHub

This guide takes you from your computer to a live server using GitHub, with **painless database updates** forever after.

**The key idea:** Your code lives on GitHub. Your server pulls from GitHub. Database schema and card data update separately and safely — you can re-run them anytime without losing your inventory.

---

## Part 1: One-Time Setup — Push Your Code to GitHub

Do this **once**, on your computer.

### 1.1. Create a GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. **Repository name:** `kings-collectables` (or any name)
3. **Visibility:** `Private` (recommended — it's your business)
4. Do **NOT** check "Add a README" or "Add .gitignore" (you already have them)
5. Click **Create repository**
6. Keep this page open — you'll need the commands it shows

### 1.2. Push your code

In your project folder on your computer, run these commands one at a time.

**If this is your first time using git on this project:**

```bash
git init
git add -A
git commit -m "Kings Collectables — initial release"
```

**If git is already set up (you've committed before):**

```bash
git add -A
git commit -m "Latest changes"
```

**Connect to GitHub and push** (replace `YOUR-USERNAME` and `REPO-NAME` with your actual values):

```bash
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/REPO-NAME.git
git push -u origin main
```

**Verify:** Refresh your GitHub repository page — you should see all your files. Confirm that `.env` is **NOT** there (it should be hidden — it contains your secrets).

---

## Part 2: One-Time Setup — Prepare Your Server

Do this **once**, on your server (via SSH).

### 2.1. Install prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 22, PostgreSQL, Nginx, PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs postgresql nginx
sudo npm install -g pm2

# Add swap (prevents build failures on servers with less than 4GB RAM)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify
node --version   # Should show v22.x
```

### 2.2. Create the database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER kings WITH PASSWORD 'PUT_A_LONG_RANDOM_PASSWORD_HERE';
CREATE DATABASE kings OWNER kings;
GRANT ALL PRIVILEGES ON DATABASE kings TO kings;
SQL
```

Generate a strong password with: `openssl rand -hex 24`

### 2.3. Clone your code from GitHub

```bash
# Clone into your home directory
cd ~
git clone https://github.com/YOUR-USERNAME/REPO-NAME.git kings-collectables
cd kings-collectables
```

### 2.4. Create your environment file

```bash
cp .env.example .env
nano .env
```

Set these values:

```bash
DATABASE_URL=postgresql://kings:YOUR_DB_PASSWORD@127.0.0.1:5432/kings
ADMIN_PASSWORD=your-admin-login-password
SESSION_SECRET=paste-output-of-openssl-rand-hex-32

# Optional — for daily price updates
CRON_SECRET=paste-output-of-openssl-rand-hex-16

# Optional — Stripe (leave blank for Bank Transfer only)
# STRIPE_SECRET_KEY=
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
# STRIPE_WEBHOOK_SECRET=
```

Generate secrets:
```bash
echo "SESSION_SECRET: $(openssl rand -hex 32)"
echo "CRON_SECRET: $(openssl rand -hex 16)"
```

Lock down the file:
```bash
chmod 600 .env
```

### 2.5. Install and build

```bash
npm install
npm run build
```

### 2.6. Create the database tables

```bash
npx drizzle-kit push
```

This creates all 18 tables. It's **idempotent** — safe to run again anytime.

### 2.7. Load the complete card database

```bash
node scripts/sync-all-cards.mjs
```

This loads **110,000+ card printings** from Scryfall in about 15-20 seconds. It uses `ON CONFLICT DO NOTHING`, so it **never overwrites existing inventory** — safe to re-run whenever you want the newest cards.

### 2.8. Start the application

```bash
pm2 start npm --name "kings-collectables" -- start
pm2 save
pm2 startup    # Run the command it outputs to enable auto-start on boot
```

### 2.9. Configure Nginx (so it responds to your domain)

```bash
sudo nano /etc/nginx/sites-available/kings-collectables
```

Paste this (replace `yourdomain.com`):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
        client_max_body_size 8m;
    }
}
```

Enable it:
```bash
sudo ln -s /etc/nginx/sites-available/kings-collectables /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 2.10. Add SSL (HTTPS)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Choose "redirect HTTP to HTTPS" when prompted.

**Done.** Visit `https://yourdomain.com`.

---

## Part 3: Everyday Updates (The Painless Part)

Whenever you make changes on your computer and push to GitHub, updating your server is **one command**:

```bash
cd ~/kings-collectables
./scripts/deploy.sh
```

That's it. The script automatically:
1. Pulls your latest code from GitHub
2. Installs dependencies **only if** `package.json` changed
3. Runs `drizzle-kit push` to apply any schema changes (idempotent)
4. Rebuilds the app
5. Restarts PM2

### When you also want the newest cards

Scryfall adds new printings regularly (new sets, promos, etc.). To grab them without touching your inventory:

```bash
./scripts/deploy.sh --sync-cards
```

The card sync:
- Adds **only new printings** that don't exist yet
- Uses `ON CONFLICT DO NOTHING` — **never touches your existing stock, prices, or categories**
- Safe to run as often as you like

---

## Part 4: Understanding Database Updates

This is why the system is painless. There are **two separate things**:

### Schema updates (`npx drizzle-kit push`)

- Creates new tables, columns, indexes
- **Idempotent** — running it twice changes nothing the second time
- Never deletes data
- The deploy script runs this automatically

### Card data updates (`node scripts/sync-all-cards.mjs`)

- Loads card printings from Scryfall
- **`ON CONFLICT DO NOTHING`** — if a card printing already exists (with your stock and price), it is completely untouched
- Only brand-new printings are inserted, with `quantity: 0` (out of stock)
- You control when this runs — the deploy script skips it unless you pass `--sync-cards`

### What this means for you

| Scenario | Safe? | Why |
|----------|-------|-----|
| Run `deploy.sh` twice | Yes | Schema push is idempotent |
| Run `deploy.sh --sync-cards` after adding stock | Yes | `ON CONFLICT DO NOTHING` skips existing cards |
| Add 50 cards to inventory, then sync cards | Yes | Your 50 cards keep their stock and prices |
| Change a card's price, then sync cards | Yes | Sync never updates existing rows |
| Run sync before adding any inventory | Yes | Loads all cards as out-of-stock |

**Bottom line:** Your inventory is never overwritten by a card sync. Only brand-new printings are added.

---

## Part 5: Manual Update (Without the Script)

If you prefer to run steps yourself:

```bash
cd ~/kings-collectables
git pull --ff-only                    # 1. Get latest code
npm install                           # 2. Only if package.json changed
npx drizzle-kit push                  # 3. Apply schema changes
npm run build                         # 4. Rebuild
pm2 restart kings-collectables        # 5. Restart
```

To also sync cards, add this after step 3:

```bash
node scripts/sync-all-cards.mjs       # Adds new printings, keeps your stock
```

---

## Part 6: Scheduled Price Updates (Optional)

To keep prices current automatically, add a cron job:

```bash
crontab -e
```

Add this line (replace `YOUR_CRON_SECRET`):

```cron
0 3 * * * curl -fsS "http://127.0.0.1:3000/api/cron/prices?key=YOUR_CRON_SECRET" >> /var/log/kings-pricing.log 2>&1
```

This runs every day at 3:00 AM and updates prices for cards set to "Follow market". Cards priced manually are never touched.

---

## Part 7: Backup Your Database

**Do this before any major update.**

```bash
# Manual backup
pg_dump "postgresql://kings:YOUR_DB_PASSWORD@127.0.0.1:5432/kings" -Fc -f ~/backup-$(date +%F).dump

# Restore if needed
pg_restore -d kings --clean --if-exists ~/backup-2026-10-18.dump
```

**Automated daily backup** — add to crontab:

```cron
0 2 * * * pg_dump "postgresql://kings:YOUR_DB_PASSWORD@127.0.0.1:5432/kings" -Fc -f /home/YOUR-USER/backups/kings-$(date +\%F).dump
```

Create the folder first: `mkdir -p ~/backups`

**Copy backups off your server** — a backup on the same disk isn't a backup.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `git pull` says "conflict" | You edited files on the server. Commit or stash them first: `git stash` |
| Build fails with "out of memory" | Make sure swap is active: `free -h` |
| `drizzle-kit push` fails | Check `DATABASE_URL` in `.env` is correct |
| Card sync fails | Check internet connection; Scryfall CDN is occasionally slow |
| PM2 won't start | Check logs: `pm2 logs kings-collectables` |
| Site shows 502 | App isn't running: `pm2 status` and `pm2 restart kings-collectables` |
| `.env` was committed by accident | **Change all secrets immediately**, then `git rm --cached .env` |

---

## Quick Reference

```bash
# First-time server setup
git clone https://github.com/YOUR-USERNAME/REPO-NAME.git ~/kings-collectables
cd ~/kings-collectables
cp .env.example .env && nano .env
npm install && npx drizzle-kit push && node scripts/sync-all-cards.mjs
npm run build && pm2 start npm --name "kings-collectables" -- start

# Every update after that
./scripts/deploy.sh                    # code + schema + rebuild
./scripts/deploy.sh --sync-cards       # also grab new card printings

# Backup
pg_dump "$DATABASE_URL" -Fc -f ~/backup.dump
```

---

## What Gets Committed to GitHub

- All source code (`src/`)
- Scripts (`scripts/`) including `deploy.sh` and `sync-all-cards.mjs`
- Public assets (`public/`) — images, fonts, favicon
- Configuration (`package.json`, `drizzle.config.ts`, etc.)
- Documentation (`*.md`)

## What Stays on Your Server (Never Committed)

- `.env` — your secrets
- `node_modules/` — dependencies
- `.next/` — build output
- `artifacts/` — test screenshots

These are listed in `.gitignore` and stay private.
