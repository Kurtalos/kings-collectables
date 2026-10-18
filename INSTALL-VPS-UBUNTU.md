# Installing Kings Collectables on Ubuntu VPS (Console Only)

A complete guide to installing this Next.js + PostgreSQL e-commerce app on an Ubuntu 24.04 VPS with 2GB RAM using only the command line.

> **Prerequisites:**
> - Ubuntu 24.04 LTS (or 22.04/20.04)
> - 2GB RAM (minimum)
> - Root or sudo access
> - A domain name pointed to your VPS IP address (for SSL)
> - Basic familiarity with the Linux command line

---

## Step 1: System Preparation

### Update the system
```bash
sudo apt update && sudo apt upgrade -y
```

### Install essential tools
```bash
sudo apt install -y curl wget git nano ufw software-properties-common apt-transport-https ca-certificates gnupg lsb-release
```

### Set up a non-root user (recommended)
If you're logged in as root, create a regular user:
```bash
adduser kingsuser
usermod -aG sudo kingsuser
su - kingsuser
```
From now on, use this user and prefix commands with `sudo` when needed.

### Configure firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

You should see SSH and Nginx allowed.

---

## Step 2: Install Node.js 20

### Add NodeSource repository
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
```

### Install Node.js
```bash
sudo apt install -y nodejs
```

### Verify installation
```bash
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### Install PM2 (process manager)
```bash
sudo npm install -g pm2
```

---

## Step 3: Install PostgreSQL

### Install PostgreSQL
```bash
sudo apt install -y postgresql postgresql-contrib
```

### Start and enable PostgreSQL
```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo systemctl status postgresql
```

### Create database and user
```bash
sudo -u postgres psql
```

You're now in the PostgreSQL prompt. Run these SQL commands:
```sql
CREATE DATABASE kings_store;
CREATE USER kings_user WITH ENCRYPTED PASSWORD 'ChangeThisToAStrongPassword123!';
GRANT ALL PRIVILEGES ON DATABASE kings_store TO kings_user;
ALTER DATABASE kings_store OWNER TO kings_user;
\q
```

> ⚠️ **Change the password** to something strong. Remember it for later.

### Test the connection
```bash
psql -h localhost -U kings_user -d kings_store -W
```
Enter the password you set. If you get a `kings_store=>` prompt, it works. Type `\q` to exit.

---

## Step 4: Install Nginx

### Install Nginx
```bash
sudo apt install -y nginx
```

### Start and enable Nginx
```bash
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl status nginx
```

### Test Nginx
Open your browser and visit `http://your-vps-ip-address`. You should see the Nginx welcome page.

---

## Step 5: Upload Your Application

You have two options:

### Option A: Clone from Git (recommended)
If your code is in a Git repository:
```bash
cd ~
git clone https://github.com/yourusername/kings-collectables.git
cd kings-collectables
```

### Option B: Upload via SCP
If the code is on your local machine:

**On your local machine:**
```bash
scp -r /path/to/kings-collectables kingsuser@your-vps-ip:~/
```

**Back on the VPS:**
```bash
cd ~/kings-collectables
```

---

## Step 6: Set Up the Application

### Install dependencies
```bash
npm install
```
This will take a few minutes. On 2GB RAM, it might use a lot of memory. If it runs out:
```bash
# Create swap space if needed
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Create environment file
```bash
nano .env
```

Add these lines (replace with your actual values):
```bash
# Database
DATABASE_URL=postgresql://kings_user:ChangeThisToAStrongPassword123!@localhost:5432/kings_store

# Application
NODE_ENV=production
PORT=3000

# Security (generate these with: openssl rand -hex 32)
ADMIN_PASSWORD=YourStrongAdminPasswordHere
SESSION_SECRET=GenerateARandomStringHere64CharactersLong1234567890abcdef

# Stripe (optional, leave blank for now)
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

Save and exit (Ctrl+X, then Y, then Enter).

### Generate secure secrets
```bash
openssl rand -hex 32
```
Copy the output and paste it as `SESSION_SECRET` in your `.env` file.

### Push database schema
```bash
npx drizzle-kit push
```
This creates all the tables in your PostgreSQL database.

### Populate the complete MTG Card Database (110,000+ printings)
```bash
node scripts/sync-all-cards.mjs
```
This streams Scryfall's bulk data and populates every English Magic: The Gathering card printing into your PostgreSQL database in about 15-20 seconds.
- Every card and printing in Magic's history is registered.
- Cards start as "Out of stock" (`quantity: 0`) with Scryfall high-res image scans and oracle text.
- Customers can search for ANY card on the storefront, view it, add it to their wishlist, and click "Watch for restock".
- When you later add stock or import cards, watchers are automatically notified!

### Build the production bundle
```bash
npm run build
```
This takes 2-5 minutes. If it fails with "out of memory," make sure you created swap space (see above).

---

## Step 7: Start the Application with PM2

### Start the app
```bash
pm2 start npm --name "kings-collectables" -- start
```

### Check status
```bash
pm2 status
```
You should see `kings-collectables` with status `online`.

### View logs
```bash
pm2 logs kings-collectables
```
Press Ctrl+C to exit logs.

### Set up PM2 to start on boot
```bash
pm2 startup
```
Copy and run the command it outputs (it will look like `sudo env PATH=...`).

```bash
pm2 save
```

### Test the app locally
```bash
curl http://localhost:3000/api/health
```
You should see: `{"ok":true}`

---

## Step 8: Configure Nginx Reverse Proxy

### Create Nginx configuration
```bash
sudo nano /etc/nginx/sites-available/kings-collectables
```

Paste this configuration (replace `yourdomain.com` with your actual domain):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect HTTP to HTTPS (we'll set up SSL next)
    # Comment this out for now, uncomment after SSL is working
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Increase timeout for slow connections
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

Save and exit.

### Enable the site
```bash
sudo ln -s /etc/nginx/sites-available/kings-collectables /etc/nginx/sites-enabled/
sudo nginx -t
```

If the test passes, reload Nginx:
```bash
sudo systemctl reload nginx
```

### Test in browser
Visit `http://yourdomain.com`. You should see the store (without HTTPS for now).

---

## Step 9: Set Up SSL with Let's Encrypt

### Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Get SSL certificate
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts:
- Enter your email
- Agree to terms
- Choose whether to redirect HTTP to HTTPS (choose **2: Redirect**)

### Verify auto-renewal
```bash
sudo certbot renew --dry-run
```

### Update Nginx configuration
Certbot should have automatically updated your config. Check it:
```bash
sudo nano /etc/nginx/sites-available/kings-collectables
```

It should now have SSL configuration. If not, Certbot will tell you.

### Restart Nginx
```bash
sudo systemctl restart nginx
```

### Test HTTPS
Visit `https://yourdomain.com`. You should see the store with a padlock icon.

If HTTPS shows a **404** while `curl http://127.0.0.1:3000/api/health` returns `{"ok":true}`, Certbot created a certificate server block that is not proxying to Next.js. Replace `/etc/nginx/sites-available/kings-collectables` with a block that listens on 443, uses the existing certificate, and `proxy_pass`es to `http://127.0.0.1:3000`. Confirm the certificate directory with `sudo ls /etc/letsencrypt/live`. Then `sudo nginx -t && sudo systemctl reload nginx`.

---

## Step 10: Set Up Stripe (Optional)

If you want to accept card payments:

1. Sign up at [dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Get your API keys from **Developers → API keys**
3. Create a webhook at **Developers → Webhooks → Add endpoint**:
   - URL: `https://yourdomain.com/api/payments/webhook`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copy the webhook signing secret

Update your `.env` file:
```bash
nano .env
```

Add:
```bash
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart the app:
```bash
pm2 restart kings-collectables
```

---

## Step 10a: Schedule Daily Price Updates (Recommended)

The shop can reprice cards from live Scryfall market prices every day. Any card set to **Follow market** in Inventory gets repriced each morning; manually priced cards are never touched.

**1. Generate the cron secret:**
```bash
openssl rand -hex 16
```

**2. Add it to `.env`:**
```bash
nano .env
```
```bash
CRON_SECRET=paste-the-16-byte-hex-here
```

**3. Restart the app:**
```bash
pm2 restart kings-collectables
```

**4. Add the cron job:**
```bash
crontab -e
```
Add this line (replace the key):
```cron
0 3 * * * curl -fsS "http://127.0.0.1:3000/api/cron/prices?key=YOUR_CRON_SECRET" >> /var/log/kings-pricing.log 2>&1
```

That runs the sync every day at 3:00 AM server time. The update runs like a normal web request, so it works safely alongside the store; results are written to `/var/log/kings-pricing.log` and readable in **/admin → Pricing**.

**5. Verify it end-to-end (don't wait for tomorrow):**
```bash
curl -fsS "http://127.0.0.1:3000/api/cron/prices?key=YOUR_CRON_SECRET"
```
Expected output: `{"ok":true,"run":{…}}` after a few seconds. Wrong or missing key returns 401; if it says "Set CRON_SECRET…" the variable hasn't loaded (restart step 3).

**6.(Recommended) First sync from the workspace:** open **/admin → Inventory → Pricing**, review the exchange rate, margin, rounding and condition multipliers, then flip some cards to **Follow market** and hit **Update prices now**. Every price change is recorded in Recent price changes.

**7. (Optional) Price from TCGplayer directly.** The sync defaults to Scryfall prices (which themselves are TCGplayer's market price, refreshed daily). To price straight from TCGplayer's official API instead, request a free developer key pair at [developer.tcgplayer.com](https://developer.tcgplayer.com) (under **My Apps → Create Application**; approval can take a few days). Add both to `.env`:

```bash
TCGPLAYER_PUBLIC_KEY=your-public-key
TCGPLAYER_PRIVATE_KEY=your-private-key
```

`pm2 restart kings-collectables`, then in **Pricing → Market price source**, choose **Automatic** (or **TCGplayer** to require it). Cards missing from TCGplayer still fall back to Scryfall, with the count shown in each run summary. Nothing else changes — Scryfall's complete databases provide the productId mapping, so the same cards stay followable.

---

## Step 11: Security Hardening

### Configure automatic security updates
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```
Choose "Yes" when prompted.

### Set up fail2ban (protects against brute force)
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Check firewall status
```bash
sudo ufw status verbose
```

You should see:
- 22/tcp (SSH) ALLOW
- 80/tcp (HTTP) ALLOW
- 443/tcp (HTTPS) ALLOW

---

## Step 12: Final Testing

### Test the health endpoint
```bash
curl https://yourdomain.com/api/health
```
Should return: `{"ok":true}`

### Test the admin panel
Visit `https://yourdomain.com/admin` and enter the `ADMIN_PASSWORD` you set in `.env`.

### Test a purchase
1. Add a card to cart
2. Go through checkout
3. Use Stripe test mode (card: `4242 4242 4242 4242`) or bank transfer

### Check logs
```bash
pm2 logs kings-collectables --lines 50
```

---

## Troubleshooting

### App won't start
```bash
pm2 logs kings-collectables
```
Check for errors. Common issues:
- Database connection failed → Check `DATABASE_URL` in `.env`
- Port 3000 already in use → `sudo lsof -i :3000` and kill the process
- Out of memory → Check swap space

### Nginx 502 Bad Gateway
```bash
sudo systemctl status nginx
pm2 status
```
Make sure the app is running and Nginx config is correct.

### SSL certificate errors
```bash
sudo certbot renew --dry-run
sudo systemctl restart nginx
```

### Database connection issues
```bash
sudo systemctl status postgresql
psql -h localhost -U kings_user -d kings_store -W
```

### Can't access site from browser
```bash
sudo ufw status
curl http://localhost:3000
```
Make sure firewall allows traffic and app is running.

---

## Useful Commands

### Restart the app
```bash
pm2 restart kings-collectables
```

### View app logs
```bash
pm2 logs kings-collectables
```

### Stop the app
```bash
pm2 stop kings-collectables
```

### Update the app (after git pull)
```bash
cd ~/kings-collectables
git pull
npm install
npm run build
pm2 restart kings-collectables
```

### Check system resources
```bash
htop  # Install with: sudo apt install htop
df -h  # Disk usage
free -h  # Memory usage
```

### Backup database
```bash
pg_dump -h localhost -U kings_user kings_store > backup_$(date +%Y%m%d).sql
```

### Restore database
```bash
psql -h localhost -U kings_user kings_store < backup_20260115.sql
```

---

## Maintenance

### Update system packages (monthly)
```bash
sudo apt update && sudo apt upgrade -y
sudo systemctl restart nginx
pm2 restart kings-collectables
```

### Renew SSL certificate (automatic)
Certbot handles this automatically. Check with:
```bash
sudo certbot certificates
```

### Monitor logs
```bash
pm2 logs kings-collectables --lines 100
sudo tail -f /var/log/nginx/error.log
```

---

## You're Done! 🎉

Your Kings Collectables store is now live at `https://yourdomain.com`.

**Next steps:**
1. Replace the sample catalogue with your real inventory
2. Update bank transfer details in `src/lib/store-config.ts`
3. Set up Stripe for card payments
4. Test a real purchase
5. Set up regular database backups

Good luck with your store!
