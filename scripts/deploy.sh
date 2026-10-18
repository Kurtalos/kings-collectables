#!/bin/bash
# ============================================================================
# Kings Collectables — One-command server update
#
# Usage on your server:
#   ./scripts/deploy.sh              # Pull code, update schema, rebuild, restart
#   ./scripts/deploy.sh --sync-cards # Also sync new card printings from Scryfall
#
# This script is SAFE to run repeatedly:
#   - git pull only brings new code
#   - drizzle-kit push is idempotent (only applies schema changes)
#   - sync-all-cards.mjs uses ON CONFLICT DO NOTHING (never touches your stock)
# ============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

SYNC_CARDS=false
for arg in "$@"; do
  if [ "$arg" = "--sync-cards" ]; then SYNC_CARDS=true; fi
done

echo "=== Kings Collectables — Deploy ==="
echo "Directory: $APP_DIR"
echo ""

# 1. Pull latest code from GitHub
echo "[1/5] Pulling latest code from GitHub..."
git pull --ff-only

# 2. Install dependencies (only if package.json or lockfile changed)
echo "[2/5] Checking dependencies..."
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -qE '^(package\.json|package-lock\.json)$' || [ ! -d "node_modules" ]; then
  echo "  package.json changed — running npm install..."
  npm install --production=false
else
  echo "  Dependencies unchanged — skipping npm install."
fi

# 3. Update database schema (idempotent — only applies changes)
echo "[3/5] Updating database schema..."
npx drizzle-kit push

# 4. Optionally sync new card printings from Scryfall
if [ "$SYNC_CARDS" = true ]; then
  echo "[4/5] Syncing card printings from Scryfall (existing stock is never touched)..."
  node scripts/sync-all-cards.mjs
else
  echo "[4/5] Skipping card sync (pass --sync-cards to update the card database)."
fi

# 5. Rebuild and restart
echo "[5/5] Building and restarting..."
npm run build

if command -v pm2 &> /dev/null; then
  if pm2 list 2>/dev/null | grep -q "kings-collectables"; then
    pm2 restart kings-collectables
    echo ""
    echo "=== Deploy complete! ==="
    pm2 status kings-collectables
  else
    echo ""
    echo "=== Build complete! ==="
    echo "PM2 process 'kings-collectables' not found. Start it with:"
    echo "  pm2 start npm --name 'kings-collectables' -- start"
    echo "  pm2 save"
  fi
else
  echo ""
  echo "=== Build complete! ==="
  echo "PM2 not found. Start the app with: npm run start"
fi
