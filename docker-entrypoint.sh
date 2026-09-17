#!/usr/bin/env bash
set -euo pipefail

# Optionally run migrations on boot. For a single instance this is convenient;
# for multiple instances, set RUN_MIGRATIONS=0 and run `alembic upgrade head`
# as a dedicated release/pre-deploy step so migrations execute exactly once.
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "[entrypoint] Applying database migrations (alembic upgrade head)..."
  alembic upgrade head
fi

# Seed the shared problem catalog. Idempotent + non-destructive (insert-missing-only),
# so it is safe to run every boot. SEED_SKIP_GITHUB=1 keeps it fast/network-free.
if [ "${SEED_ON_START:-1}" = "1" ]; then
  echo "[entrypoint] Seeding problem catalog..."
  python -c "from backend.seed import seed_db; seed_db()" || echo "[entrypoint] seed step failed (non-fatal), continuing"
fi

# Hosts inject $PORT; default to 8000 locally. WEB_CONCURRENCY tunes worker count.
exec uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}"
