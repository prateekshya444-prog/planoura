#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

npm ci

rm -rf node_modules/.vite

if [[ ! -f .env ]]; then
  cat > .env << 'EOF'
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:password@localhost:5432/planora
JWT_SECRET=dev-secret-key-change-in-production
EOF
fi
