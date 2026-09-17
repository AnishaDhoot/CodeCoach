# CodeCoach backend — FastAPI + Postgres (hosted, multi-tenant).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first for layer caching.
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# App code + migration config.
COPY backend ./backend
COPY alembic.ini ./alembic.ini
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Documented default; hosts (Render/Fly) inject their own $PORT.
EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
