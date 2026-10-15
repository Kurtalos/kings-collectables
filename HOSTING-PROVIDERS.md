# Cheap Web Hosts for Kings Collectables

A practical comparison of hosting providers that can run this Next.js + PostgreSQL e-commerce app, organized by ease of use and cost.

> **TL;DR**: For tinkering, start with **Railway** or **Vercel + Neon** (free/cheap). For production, **Hetzner VPS** or **Railway** give the best value. Avoid basic cPanel shared hosting unless it explicitly supports Node.js + PostgreSQL.

---

## Quick Comparison Table

| Provider | Type | Monthly Cost | Node.js | Postgres | RAM | Best For |
|----------|------|--------------|---------|----------|-----|----------|
| **Vercel + Neon** | PaaS | $0 (free tier) | ✅ Latest | ✅ Free tier | 1GB | Prototyping, low traffic |
| **Railway.app** | PaaS | $5 | ✅ Latest | ✅ Included | 512MB+ | Easy deploy, all-in-one |
| **Render.com** | PaaS | $0-7 | ✅ Latest | ✅ $7 addon | 512MB | Free tier, simple setup |
| **Fly.io** | PaaS | $0-5 | ✅ Latest | ✅ Free tier | 256MB-1GB | Global distribution |
| **Hetzner Cloud** | VPS | $4.50 | ✅ Install yourself | ✅ Install yourself | 2GB | Best value, full control |
| **DigitalOcean App Platform** | PaaS | $12 | ✅ Latest | ✅ $7 addon | 512MB | DO ecosystem |
| **DigitalOcean Droplet** | VPS | $6 | ✅ Install yourself | ✅ Install yourself | 1GB | Familiar VPS |
| **A2 Hosting Turbo** | Shared | $12 | ✅ 20.x | ✅ Included | 1GB | cPanel lovers |
| **Linode (Akamai)** | VPS | $5 | ✅ Install yourself | ✅ Install yourself | 1GB | Solid VPS |
| **Hostinger Business** | Shared | $4 | ⚠️ Limited | ❓ Unclear | 1GB | Risky for this app |

---

## Tier 1: Easiest & Cheapest (PaaS — Platform as a Service)

These providers handle all the infrastructure. You push code, they build and run it.

### 🥇 Railway.app — $5/month

**Why it's great for this app:**
- One-click deploy from GitHub
- PostgreSQL included in the $5 plan (no separate database)
- Automatic HTTPS and custom domains
- Generous free tier ($5 credit/month)
- Scales automatically

**What you get for $5:**
- 500 MB RAM per service
- 1 GB storage
- 100 GB bandwidth
- PostgreSQL database (1 GB storage)
- Unlimited services (web app + database + background jobs)

**Setup:**
1. Sign up at railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Add a PostgreSQL plugin (one click)
4. Set environment variables in the Railway dashboard
5. Done. Railway auto-detects Next.js and builds it.

**Cons:**
- Can get expensive if you scale up (pay-per-use after $5)
- Less control than a VPS

**Best for:** Getting the store online in 10 minutes, small-to-medium traffic.

---

### 🥈 Vercel + Neon — $0 (free tier)

**Why it's great:**
- Vercel is the official Next.js host
- Neon provides serverless PostgreSQL
- Both have generous free tiers
- Global CDN for fast page loads

**What you get for free:**
- **Vercel**: Unlimited sites, 100 GB bandwidth, serverless functions
- **Neon**: 0.5 GB storage, 190 compute hours/month, auto-scaling

**Setup:**
1. Sign up at vercel.com and neon.tech
2. Create a Neon database, copy the connection string
3. Import your GitHub repo into Vercel
4. Add `DATABASE_URL` and other env vars in Vercel dashboard
5. Deploy. Vercel builds Next.js automatically.

**Free tier limits:**
- Neon: 0.5 GB storage, 190 compute hours (enough for ~1000 page views/day)
- Vercel: 100 GB bandwidth, 100k serverless invocations

**Cons:**
- Two separate services to manage
- Free tier has cold starts (first request takes 2-3 seconds)
- Neon pauses database after 7 days of inactivity (wakes on next request)

**Best for:** Prototyping, learning, very low traffic (<1000 visits/day).

---

### 🥉 Render.com — $0-7/month

**Why it's great:**
- Free tier for web services
- PostgreSQL as a paid addon ($7/month)
- Simple GitHub integration
- Good documentation

**What you get:**
- **Free web service**: 512 MB RAM, spins down after 15 min inactivity, 100 GB bandwidth
- **PostgreSQL addon** ($7): 256 MB RAM, 1 GB storage
- **Always-on web service** ($7): 512 MB RAM, no spin-down

**Setup:**
1. Sign up at render.com
2. Create a "Web Service" from your GitHub repo
3. Add a "PostgreSQL" database (paid addon)
4. Set environment variables
5. Deploy

**Cons:**
- Free tier spins down (slow first request)
- PostgreSQL costs extra ($7)
- Total cost: $7 (database) + $7 (always-on) = $14/month for production

**Best for:** Free tier for testing, $7/month for simple production.

---

### Fly.io — $0-5/month

**Why it's great:**
- Global edge deployment (fast worldwide)
- Free hobby tier
- Excellent for background jobs

**What you get:**
- **Free**: 3 shared VMs (256 MB each), 3 GB storage, 160 GB bandwidth
- **Paid**: $5 for dedicated VMs, more resources

**Setup:**
1. Install `flyctl` CLI
2. Run `fly launch` in your project
3. Add PostgreSQL: `fly postgres create`
4. Set secrets: `fly secrets set DATABASE_URL=...`
5. Deploy: `fly deploy`

**Cons:**
- More complex than Railway/Render
- Free tier has limited resources
- Steeper learning curve

**Best for:** Developers who want global distribution and don't mind CLI tools.

---

## Tier 2: Best Value (VPS — Virtual Private Server)

You get a full Linux server. More control, more work.

### 🏆 Hetzner Cloud — €4.15/month (~$4.50)

**Why it's the best value:**
- 2 GB RAM for $4.50 (double what others offer)
- Excellent performance
- European data centers (Germany, Finland)
- Hourly billing

**What you get:**
- CX22 instance: 2 vCPUs, 2 GB RAM, 40 GB SSD
- Unlimited bandwidth (fair use)
- Full root access
- Ubuntu, Debian, or other Linux distros

**Setup (requires sysadmin skills):**
1. Sign up at hetzner.com/cloud
2. Create a CX22 server with Ubuntu 22.04
3. SSH in and install:
   ```bash
   # Install Node.js 20
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PostgreSQL
   sudo apt-get install -y postgresql postgresql-contrib
   
   # Install Nginx for reverse proxy
   sudo apt-get install -y nginx
   
   # Install Certbot for HTTPS
   sudo apt-get install -y certbot python3-certbot-nginx
   ```
4. Clone your repo, install dependencies, build
5. Set up systemd service to run `next start`
6. Configure Nginx reverse proxy
7. Get SSL certificate with Certbot

**Pros:**
- Cheapest option for production
- Full control
- Excellent performance
- Can host multiple apps on one server

**Cons:**
- You're the sysadmin
- Security, backups, updates are your responsibility
- Steeper learning curve

**Best for:** Production stores, developers comfortable with Linux, best bang for buck.

---

### DigitalOcean Droplet — $6/month

**Why it's popular:**
- Well-documented
- Large community
- Reliable
- $100 free credit for new users

**What you get:**
- Basic Droplet: 1 vCPU, 1 GB RAM, 25 GB SSD
- 1 TB bandwidth
- Full root access

**Setup:**
Same as Hetzner (install Node.js, Postgres, Nginx, etc.)

**Pros:**
- Excellent documentation and tutorials
- One-click apps available (though not for this specific stack)
- Good uptime

**Cons:**
- Half the RAM of Hetzner for more money
- Bandwidth limits (1 TB vs unlimited)

**Best for:** Developers who want a well-supported VPS.

---

### Linode (Akamai) — $5/month

**Why it's good:**
- Similar to DigitalOcean
- $100 free credit for new users
- Good performance

**What you get:**
- Nanode 1 GB: 1 vCPU, 1 GB RAM, 25 GB SSD
- 1 TB bandwidth

**Setup:**
Same as DigitalOcean/Hetzner.

**Best for:** Alternative to DigitalOcean, similar pricing.

---

## Tier 3: Traditional Shared Hosting (cPanel)

Only choose this if you specifically want cPanel and your host supports Node.js + PostgreSQL.

### A2 Hosting Turbo — $12/month

**Why it might work:**
- cPanel interface (familiar)
- Node.js 20.x support
- PostgreSQL included
- "Turbo" plans have better performance

**What you get:**
- Turbo Swift plan: 1 website, unlimited storage, unlimited bandwidth
- Node.js app manager in cPanel
- PostgreSQL database (unlimited databases)
- 1 GB RAM for Node.js processes

**Setup:**
Follow the `INSTALL-SHARED-HOSTING.md` guide in this repo.

**Pros:**
- cPanel is familiar
- Includes email hosting
- Managed backups

**Cons:**
- More expensive than VPS for less performance
- Shared resources (other users can slow you down)
- Node.js support can be limited (memory caps, process limits)
- More complex than PaaS

**Best for:** Users who specifically want cPanel and don't mind paying more.

---

### Hostinger Business — $4/month (with caveats)

**Why it's risky:**
- Cheap
- cPanel-like interface (hPanel)
- Claims Node.js support

**But:**
- Node.js support is limited (unclear version)
- PostgreSQL support is unclear
- Shared resources
- Performance can be poor

**Verdict:** Not recommended for this app. Too many unknowns.

---

## My Top 3 Recommendations

### For tinkering / learning:
**Vercel + Neon (free)** or **Railway ($5/month)**
- Zero setup time
- Push code, it works
- Free or very cheap
- Easy to delete and start over

### For production (best value):
**Hetzner Cloud VPS ($4.50/month)**
- 2 GB RAM (plenty for Next.js + Postgres)
- Full control
- Excellent performance
- Cheapest option for real traffic

### For production (easiest):
**Railway ($5-10/month)**
- One-click deploy
- PostgreSQL included
- Automatic scaling
- No sysadmin work

---

## Cost Comparison for 1 Year

| Provider | Monthly | Annual | Notes |
|----------|---------|--------|-------|
| Vercel + Neon (free) | $0 | $0 | Limited to free tier |
| Railway | $5 | $60 | All-in-one |
| Hetzner VPS | $4.50 | $54 | Best value |
| DigitalOcean VPS | $6 | $72 | Well-supported |
| A2 Hosting | $12 | $144 | cPanel, shared |

---

## Migration Guide: Moving Between Hosts

Your app is designed to be portable. To move from one host to another:

### 1. Export your database
```bash
pg_dump DATABASE_URL > backup.sql
```

### 2. Commit your code to GitHub
```bash
git add .
git commit -m "Ready for migration"
git push
```

### 3. Set up the new host
- Choose a provider from this list
- Follow their setup guide

### 4. Import your database
```bash
psql NEW_DATABASE_URL < backup.sql
```

### 5. Update environment variables
Copy your `.env` values to the new host's dashboard.

### 6. Deploy
Push to GitHub or run your deploy command.

### 7. Update DNS
Point your domain to the new host.

---

## Hidden Costs to Watch For

- **Domain name**: $10-15/year (Namecheap, Cloudflare)
- **SSL certificate**: Free with Let's Encrypt (most hosts include this)
- **Email hosting**: $0-5/month (Zoho Mail free tier, or included with A2 Hosting)
- **Backups**: $0-5/month (many hosts include this, or use free tools like `restic`)
- **Monitoring**: $0 (Uptime Kuma self-hosted, or free tier of UptimeRobot)

---

## Final Recommendation

**Start with Railway ($5/month)** if you want to get online quickly and focus on the app, not infrastructure.

**Switch to Hetzner VPS ($4.50/month)** once you have real traffic and want to optimize costs.

**Use Vercel + Neon (free)** if you're just experimenting and don't expect real customers yet.

Avoid shared hosting unless you have a specific reason to use cPanel. For modern Node.js apps, PaaS or VPS is almost always better.
