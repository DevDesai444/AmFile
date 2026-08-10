#!/usr/bin/env bash
# Wipe and rebuild the demo database. Dev instance only.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Resetting AmFile demo data..."
(cd server && AMFILE_ALLOW_RESET=yes npx tsx src/reset-demo.ts > /dev/null)
for m in 001_init 002_truncate_guard 003_password_auth; do
  databricks psql amfile-dev -- -v ON_ERROR_STOP=1 -q -f "server/migrations/$m.sql" > /dev/null
  echo "  applied $m"
done
(cd server && npm run seed 2>&1 | tail -3)
echo "Restart the server (Terminal 1) so it picks up fresh sessions."
