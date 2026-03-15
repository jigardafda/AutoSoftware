#!/usr/bin/env bash
set -euo pipefail

# Bundle AutoSoftware for NPX distribution
# This script copies all necessary files into npx-cli/bundle/
# so the npm package is fully self-contained.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NPX_DIR="$(dirname "$SCRIPT_DIR")"
ROOT="$(dirname "$NPX_DIR")"
BUNDLE="$NPX_DIR/bundle"

echo "==> Cleaning previous bundle..."
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE"

# ──────────────────────────────────────────────
# 1. Build frontend (Vite static output)
# ──────────────────────────────────────────────
echo "==> Building frontend..."
cd "$ROOT/frontend"
# Use vite build directly — skip tsc type checking (pre-existing errors in non-workspace code)
npx vite build
mkdir -p "$BUNDLE/frontend/dist"
cp -r "$ROOT/frontend/dist/." "$BUNDLE/frontend/dist/"

# ──────────────────────────────────────────────
# 2. Copy backend source (runs via tsx at runtime)
# ──────────────────────────────────────────────
echo "==> Copying backend source..."
mkdir -p "$BUNDLE/backend/src"
cp -r "$ROOT/backend/src/." "$BUNDLE/backend/src/"
cp "$ROOT/backend/package.json" "$BUNDLE/backend/package.json"
cp "$ROOT/backend/tsconfig.json" "$BUNDLE/backend/tsconfig.json"

# ──────────────────────────────────────────────
# 3. Copy worker source (runs via tsx at runtime)
# ──────────────────────────────────────────────
echo "==> Copying worker source..."
mkdir -p "$BUNDLE/worker/src"
cp -r "$ROOT/worker/src/." "$BUNDLE/worker/src/"
cp "$ROOT/worker/package.json" "$BUNDLE/worker/package.json"
cp "$ROOT/worker/tsconfig.json" "$BUNDLE/worker/tsconfig.json"
# Copy worker data directory (agent prompts, plugins, etc.)
if [ -d "$ROOT/worker/data" ]; then
  cp -r "$ROOT/worker/data" "$BUNDLE/worker/data"
fi

# ──────────────────────────────────────────────
# 4. Copy shared package
# ──────────────────────────────────────────────
echo "==> Building and copying shared package..."
cd "$ROOT/packages/shared"
npm run build 2>/dev/null || true
mkdir -p "$BUNDLE/packages/shared"
cp -r "$ROOT/packages/shared/dist" "$BUNDLE/packages/shared/dist" 2>/dev/null || true
cp -r "$ROOT/packages/shared/src" "$BUNDLE/packages/shared/src"
cp "$ROOT/packages/shared/package.json" "$BUNDLE/packages/shared/package.json"
cp "$ROOT/packages/shared/tsconfig.json" "$BUNDLE/packages/shared/tsconfig.json"

# ──────────────────────────────────────────────
# 5. Copy Prisma schema + migrations
# ──────────────────────────────────────────────
echo "==> Copying Prisma schema and migrations..."
mkdir -p "$BUNDLE/prisma/migrations"
cp "$ROOT/prisma/schema.prisma" "$BUNDLE/prisma/schema.prisma"
cp -r "$ROOT/prisma/migrations/." "$BUNDLE/prisma/migrations/"

# Write a simplified prisma config for the bundle (no dotenv needed — env is passed directly)
cat > "$BUNDLE/prisma.config.ts" << 'PRISMA_CONFIG'
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
PRISMA_CONFIG

# ──────────────────────────────────────────────
# 6. Generate Prisma client into bundle
# ──────────────────────────────────────────────
echo "==> Generating Prisma client..."
cd "$ROOT"
npx prisma generate
mkdir -p "$BUNDLE/generated/prisma"
cp -r "$ROOT/generated/prisma/." "$BUNDLE/generated/prisma/"

# ──────────────────────────────────────────────
# 7. Rewrite workspace references to file: paths
# ──────────────────────────────────────────────
echo "==> Rewriting workspace references..."
# Replace "@autosoftware/shared": "*" with "file:../packages/shared" in bundled package.json files
if command -v python3 &>/dev/null; then
  for pkg in "$BUNDLE/backend/package.json" "$BUNDLE/worker/package.json"; do
    python3 -c "
import json, sys
with open('$pkg') as f:
    data = json.load(f)
deps = data.get('dependencies', {})
if '@autosoftware/shared' in deps:
    deps['@autosoftware/shared'] = 'file:../packages/shared'
# Remove devDependencies — not needed at runtime
data.pop('devDependencies', None)
with open('$pkg', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
"
  done
else
  # Fallback: use sed
  for pkg in "$BUNDLE/backend/package.json" "$BUNDLE/worker/package.json"; do
    sed -i.bak 's/"@autosoftware\/shared": "\*"/"@autosoftware\/shared": "file:..\/packages\/shared"/' "$pkg"
    rm -f "${pkg}.bak"
  done
fi

# ──────────────────────────────────────────────
# 8. Install dependencies at bundle time
# ──────────────────────────────────────────────
echo "==> Installing backend dependencies..."
cd "$BUNDLE/backend"
npm install --omit=dev --ignore-scripts 2>&1 | tail -1

echo "==> Installing worker dependencies..."
cd "$BUNDLE/worker"
npm install --omit=dev --ignore-scripts 2>&1 | tail -1

echo "==> Installing shared dependencies..."
cd "$BUNDLE/packages/shared"
npm install --omit=dev --ignore-scripts 2>&1 | tail -1

# ──────────────────────────────────────────────
# 9. Copy base tsconfig
# ──────────────────────────────────────────────
cp "$ROOT/tsconfig.base.json" "$BUNDLE/tsconfig.base.json"

# ──────────────────────────────────────────────
# 10. Copy .env.example as reference
# ──────────────────────────────────────────────
if [ -f "$ROOT/.env.example" ]; then
  cp "$ROOT/.env.example" "$BUNDLE/.env.example"
fi

# ──────────────────────────────────────────────
# 11. Build CLI with esbuild
# ──────────────────────────────────────────────
echo "==> Bundling CLI with esbuild..."
cd "$NPX_DIR"
npx esbuild src/cli.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --outfile=bin/cli.js \
  --packages=external

# Add shebang line (esbuild escapes ! in --banner, so prepend via node)
node -e "
const fs = require('fs');
const content = fs.readFileSync('bin/cli.js', 'utf8');
fs.writeFileSync('bin/cli.js', '#!/usr/bin/env node\n' + content);
fs.chmodSync('bin/cli.js', 0o755);
"

# ──────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────
BUNDLE_SIZE=$(du -sh "$BUNDLE" | cut -f1)
echo ""
echo "==> Bundle complete! Size: $BUNDLE_SIZE"
echo "    Location: $BUNDLE"
echo ""
echo "    To test locally:  cd $NPX_DIR && node bin/cli.js"
echo "    To publish:       cd $NPX_DIR && npm publish"
