#!/usr/bin/env bash
set -euo pipefail

# Optionally run migrations on boot. For a single instance this is convenient;
# for multiple instances, set RUN_MIGRATIONS=0 and run `alembic upgrade head`
# as a dedicated release/pre-deploy step so migrations execute exactly once.
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "[entrypoint] Applying database migrations (alembic upgrade head)..."
  alembic upgrade head
fi

# Hosts inject $PORT; default to 8000 locally. WEB_CONCURRENCY tunes worker count.
exec uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}"
