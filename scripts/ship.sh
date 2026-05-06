#!/bin/sh
# ship.sh — test, build, push to GitHub (Railway), deploy to Vercel
# Usage: npm run ship
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── 1. TypeScript check ───────────────────────────────────────────────────────
echo ""
echo "▶  Checking TypeScript..."
./api/node_modules/.bin/tsc --noEmit --project api/tsconfig.json
./web/node_modules/.bin/tsc --noEmit --project web/tsconfig.json
echo "   ✓ TypeScript clean"

# ── 2. Build web ──────────────────────────────────────────────────────────────
echo ""
echo "▶  Building web..."
npm run build --prefix web
echo "   ✓ Build done"

# ── 3. Stage everything (source + dist) ──────────────────────────────────────
echo ""
echo "▶  Staging changes..."
git add -A

# Check if there is anything to commit
if git diff --staged --quiet; then
  echo "   No changes to commit — already up to date"
else
  # Use last commit message as base, or prompt
  echo "   Enter commit message (or press Enter for 'build: ship changes'):"
  read MSG
  MSG="${MSG:-build: ship changes}"
  git commit -m "$MSG

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  echo "   ✓ Committed"
fi

# ── 4. Push to GitHub (triggers Railway redeploy) ────────────────────────────
echo ""
echo "▶  Pushing to GitHub → Railway will redeploy API..."
git push origin main
echo "   ✓ Pushed"

# ── 5. Deploy web to Vercel ───────────────────────────────────────────────────
echo ""
echo "▶  Deploying web to Vercel..."
npx vercel --prod
echo "   ✓ Vercel deployed"

echo ""
echo "✅  All done!"
echo "   Web  → https://logisticbay.com (live now)"
echo "   API  → Railway is rebuilding (takes ~2 min)"
echo ""
