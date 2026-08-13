#!/usr/bin/env bash
set -euo pipefail

if ! command -v pg_isready >/dev/null 2>&1; then
  echo "PostgreSQL client not found; installing PostgreSQL..."
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi

if ! pg_isready -q 2>/dev/null; then
  sudo service postgresql start
fi

for _ in $(seq 1 30); do
  if pg_isready -q 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! pg_isready -q 2>/dev/null; then
  echo "PostgreSQL failed to start" >&2
  exit 1
fi

if ! sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='planora'" | grep -q 1; then
  sudo -u postgres createdb planora
fi

sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'password';" >/dev/null 2>&1 || true

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='planora'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE USER planora WITH PASSWORD 'planora';"
fi
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE planora TO planora;"
sudo -u postgres psql -d planora -c "GRANT ALL ON SCHEMA public TO planora;"
sudo -u postgres psql -d planora -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO planora;"
sudo -u postgres psql -d planora -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO planora;"
sudo -u postgres psql -d planora -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO planora;"

echo "PostgreSQL ready (database: planora)"
