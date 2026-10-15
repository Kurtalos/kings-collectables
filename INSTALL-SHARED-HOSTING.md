# Installing Kings Collectables on Shared Hosting

A step-by-step checklist for getting this Next.js + PostgreSQL store running on a shared hosting account (cPanel, DirectAdmin, or similar).

> ⚠️ **Read "Before you buy" first.** Most cheap shared hosting plans (the $3–6/month ones with only PHP and MySQL) **will not run this app**. You need a plan that explicitly supports Node.js and PostgreSQL. If yours doesn't, jump to "Cheaper alternatives" at the bottom.

---

## Before you buy — hosting requirements

Check your plan has **all** of these:

- [ ] **Node.js 20 or newer** (Next.js 16 needs 20+). cPanel shows this under *Setup Node.js App*. If you only see PHP, the plan won't work.
- [ ] **PostgreSQL** (not MySQL — this app uses Drizzle + pg). cPanel shows this under *PostgreSQL Databases*.
- [ ] **SSH or terminal access** (some providers hide this behind a "developer" toggle in cPanel).
- [ ] **At least 1 GB RAM and 512 MB process memory limit**. Next.js production builds are hungry.
- [ ] **Ability to run long-running processes** (the app runs `next start`, not one-shot scripts).

Providers that typically work out of the box: **A2 Hosting** (Turbo plans), **SiteGround** (Cloud/GoGeek), **Hostinger Business**, **CloudLinux** shared hosts. If your host says "PHP & MySQL only," skip ahead to the alternatives section.

---

## Step 1 — Set up your PostgreSQL database

In cPanel → **PostgreSQL Databases**:

1. Create a database called something like `kings_store`.
2. Create a database user (e.g. `kings_user`) with a strong password.
3. **Add the user to the database** with **ALL PRIVILEGES**.
4. Note the connection details cPanel shows you:
   - Host (usually `localhost` on shared hosting)
   - Port (usually `5432`)
   - Database name
   - Username
   - Password

Build a `DATABASE_URL` from those:

```
postgresql://kings_user:STRONG_PASSWORD@localhost:5432/kings_store
```

If cPanel gives you a different host like `pgsql.yourhost.com`, use that instead of `localhost`.

---

## Step 2 — Create the Node.js application

In cPanel → **Setup Node.js App**:

1. Click **CREATE APPLICATION**.
2. **Node.js version**: pick the latest available (20.x or 22.x).
3. **Application mode**: **Production** (you can change this later if you need hot-reload).
4. **Application root**: `kings-collectables` (this becomes the folder on disk).
5. **Application URL**: the domain or subdomain where you'll host the store (e.g. `shop.yourdomain.com`).
6. **Application startup file**: `server.js` (we'll create this).
7. Click **Create**.

cPanel will show you two important things:
- The physical path to your app folder (copy this).
- A **"Run NPM Script"** link — you'll use this to install packages.
- A **virtual environment command** that looks like `source /home/you/virtualenv/kings-collectables/20/bin/activate` — you'll need this for SSH.

---

## Step 3 — Upload the source code

The cleanest way is Git, but on shared hosting the File Manager works too.

### Option A — File Manager (simple)
1. Open cPanel → File Manager → the app folder from step 2.
2. Upload the entire project as a ZIP (from your local machine: `cd kings-collectables && zip -r ../kings.zip . -x 'node_modules/*' '.next/*' 'artifacts/*'`).
3. Right-click the ZIP → **Extract**.
4. Delete the ZIP.

### Option B — Git (cleaner, lets you update later)
1. SSH into your account (cPanel usually has the SSH command under *Security → SSH Access*).
2. `cd` to the app folder.
3. `git clone <your-repo-url> .`

Either way, you should now see `package.json`, `src/`, `public/`, etc. in the app folder.

---

## Step 4 — Add the production server file

Next.js needs a small wrapper so Passenger (cPanel's process manager) can start it. Create **`server.js`** in the app root with this content:

```js
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const port = process.env.PORT || 3000;
const app = next({ dev, hostname: "0.0.0.0", port: Number(port) });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res, parse(req.url, true))).listen(port, "0.0.0.0", () => {
    console.log(`> Kings Collectables listening on ${port}`);
  });
});
```

Next.js reads `PORT` from the environment; cPanel sets it automatically.

---

## Step 5 — Set environment variables

In cPanel → **Setup Node.js App** → edit your application → **Environment variables**. Add:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | the URL from step 1 |
| `NODE_ENV` | `production` |
| `ADMIN_PASSWORD` | a strong password only you know (this gates `/admin`) |
| `SESSION_SECRET` | a long random string, e.g. from `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | your Stripe key (see step 7, optional for now) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | your Stripe publishable key (same step) |
| `STRIPE_WEBHOOK_SECRET` | your Stripe webhook secret (same step) |

cPanel usually lets you add these as key/value pairs. Save.

> ⚠️ **Don't skip `SESSION_SECRET`.** Without it the app falls back to a hardcoded preview secret — anyone who knows that can forge customer sessions.

---

## Step 6 — Install dependencies and push the schema

### Install packages
In cPanel → **Setup Node.js App** → your app → **Run NPM Script** → type `install`. Wait for it to finish.

### Push the database schema
You need terminal access for this. Either:

- **SSH**: log in, `cd` into the app folder, run the virtual environment command cPanel gave you in step 2, then:
  ```
  npx drizzle-kit push
  ```
- **cPanel Terminal** (if available): click *Terminal* in cPanel, navigate to the app folder, activate the virtualenv, run the same command.

`drizzle-kit push` reads `src/db/schema.ts` and creates (or updates) every table in your PostgreSQL database. It's safe to re-run.

You can confirm it worked by opening cPanel → **phpMyAdmin** (or **pgAdmin** if your host offers it) and browsing the `kings_store` database. You should see tables like `products`, `customers`, `orders`, `payments`, etc.

---

## Step 7 — Stripe (optional but recommended)

You can run the store without Stripe (it falls back to bank transfer only), but card payments need it:

1. Sign up at [dashboard.stripe.com/register](https://dashboard.stripe.com/register).
2. In the dashboard → **Developers** → **API keys**. Copy the **publishable** (`pk_…`) and **secret** (`sk_…`) keys.
3. In **Developers** → **Webhooks** → **Add endpoint**, set the URL to `https://your-domain.com/api/payments/webhook` and listen for `payment_intent.succeeded` and `payment_intent.payment_failed`. Copy the signing secret (`whsec_…`).
4. Add all three to your environment variables (step 5). Use the **test mode** keys while you're experimenting — the store works identically with test cards.
5. Restart the app (step 9).

While you're testing, the test card number `4242 4242 4242 4242` (any future expiry, any CVC) works in Stripe.

---

## Step 8 — Build the production bundle

In cPanel → **Setup Node.js App** → your app → **Run NPM Script** → type `run build`.

This takes a few minutes. When it finishes, a `.next/` folder appears in the app directory. Don't delete it.

If the build fails on memory, some hosts let you increase the Node process limit in the same settings screen. Aim for 1 GB if you can.

---

## Step 9 — Start the application

In cPanel → **Setup Node.js App** → edit your app:

1. **Application mode**: make sure it's **Production**.
2. Click the **RESTART** button (or **Stop** then **Start** if restart isn't available).

cPanel will launch `server.js` via Passenger. Give it 30–60 seconds.

Visit your domain. You should see the storefront. Visit `/admin` — you should be prompted for the owner password you set in step 5.

---

## Step 10 — Verify the health check

Open `https://your-domain.com/api/health`. You should see:

```json
{"ok": true}
```

If you get `{"ok": false}` or a 500 error, the database connection failed. Check `DATABASE_URL` in step 5.

If you get a 404 or Passenger error page, the app didn't start. Check the error log: cPanel → **Metrics** → **Errors** (top of the file), or the **Logs** section under Node.js App.

---

## Step 11 — Domain and DNS

If you want a custom domain (you almost certainly do):

1. In cPanel → **Domains** → add the domain as an addon or subdomain.
2. Point the domain's **A record** at your host's server IP (cPanel usually shows this under *General Information*).
3. If you want the store at a subdomain like `shop.yourdomain.com`, add the subdomain in cPanel and point it to the same app.
4. Enable **SSL** (Let's Encrypt is free and built into most cPanels under *SSL/TLS Status* → *Run AutoSSL*). Stripe requires HTTPS anyway.

---

## Step 12 — First-time setup tasks

Once the store is live:

- [ ] **Replace the sample catalogue.** Either use the workspace → **Import cards** to upload your own CSV, or run `node scripts/fetch-cards.mjs` locally and push the resulting `src/data/cards.json` + card images via Git.
- [ ] **Update the bank transfer details** in `src/lib/store-config.ts` (`BANK_DETAILS` constant) to match your business account, then rebuild.
- [ ] **Update the footer/legal copy** — search the codebase for "Kings Collectables" if you rebrand.
- [ ] **Set the timezone** — if your host's database is in UTC, the date columns still work, but you may want to format dates server-side with `Intl.DateTimeFormat` and `"en-AU"` (already set).
- [ ] **Test a real purchase** — use Stripe test mode, or use the bank transfer flow and confirm the payment manually from the workspace.
- [ ] **Back up the database** — cPanel → *Backup* or *Backup Wizard* → download a full or database-only backup weekly.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Passenger error page / "Application failed to start" | `server.js` missing or has syntax error | Check step 4. Also check cPanel → Errors log. |
| `/api/health` returns `{"ok": false}` | `DATABASE_URL` wrong | Re-check step 1 and 5. Make sure the user has privileges. |
| Build runs out of memory | Shared host's memory cap too low | Increase in cPanel → Node.js App settings, or build locally and upload `.next/` |
| `npx drizzle-kit push` hangs | Host's outbound Postgres port (5432) blocked | Run the command on the host itself (not from your local machine), or ask support to open the port. |
| Stripe webhook returns 404 | App not reachable at that URL | Visit `/api/payments/webhook` manually — you should get `{"error":"Missing signature"}`. If you get 404, the domain isn't pointing at the app. |
| Card images don't load | `public/images/` not in app folder | Make sure you uploaded the `public/` folder, not just `src/`. |
| Can't sign into `/admin` | Owner session cookie blocked | Make sure you're accessing via the same domain you set up (not a `.cpanel.host.com` alias), otherwise cookies won't stick. |
| `npm install` fails on native modules | Host's Node version too old for a package | Check Node version (step 2). Upgrade if possible. |

---

## Cheaper / easier alternatives

If shared hosting turns out to be a headache, these cost about the same (or less) and are purpose-built for this stack:

| Provider | Why it works | Monthly cost |
| --- | --- | --- |
| **Railway.app** | One-click Next.js + Postgres template. Push a repo, add env vars, done. | ~$5 |
| **Render.com** | Same idea. Free tier available for tinkering, paid from $7. | $0–$7 |
| **Fly.io** | Runs anywhere, excellent for Node + Postgres. Free hobby tier. | $0–$5 |
| **DigitalOcean App Platform** | Very similar to Railway, familiar pricing. | $5 |
| **Vercel** | The Next.js specialists. Needs a separate Postgres host (Neon or Supabase, both free tier). | $0 + Postgres |

For any of these, the process is: push the repo → set the environment variables from step 5 → the provider builds and runs it for you. No SSH, no Passenger, no cPanel. If you're just "playing around" as you mentioned, I'd genuinely recommend starting on Railway or Render and moving to shared hosting only once you know you need it.

---

## Files to leave on the server vs. local only

**Keep on the server:**
- Everything in `src/`, `public/`, `scripts/` (the fetch scripts), `drizzle.config.json`, `package.json`, `.env` (server env vars), `.next/` (after build), `node_modules/` (after install)

**Only needed locally:**
- `artifacts/` (test screenshots)
- `.git/` (upload via File Manager doesn't need it)
- Any local `.env` you use while developing

The `.env` file on the server should never be committed to Git — add it to `.gitignore` if you haven't already.

---

## One last thing

Before opening the store to real customers:
- [ ] Switch Stripe from test mode to live mode (new API keys in step 7).
- [ ] Confirm your real bank details are in `src/lib/store-config.ts`.
- [ ] Set a real `ADMIN_PASSWORD` and `SESSION_SECRET` if you haven't.
- [ ] Take a database backup.
- [ ] Test a real card transaction for a few dollars, then refund it.
