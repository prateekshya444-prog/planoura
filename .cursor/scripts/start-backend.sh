#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

for _ in $(seq 1 60); do
  if pg_isready -q 2>/dev/null; then
    exec npm start
  fi
  sleep 1
done

echo "PostgreSQL not ready; backend cannot start" >&2
exit 1
