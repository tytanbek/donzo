# DONZO backend — Dockerfile (Render deploy)
# Build context: repo root (root'dagi .dockerignore kichik kontekst beradi).
# Konteyner ichida hamma narsa: daphne (API+WS) + bot + user_client,
# ularni cloud_launcher.py boshqaradi.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Sistem kutubxonalari (Pillow uchun)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libjpeg62-turbo-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

ENV DJANGO_SETTINGS_MODULE=config.settings

EXPOSE 8000

# Migratsiya + statik; keyin cloud_launcher (daphne + bot + user_client).
# Render $PORT env'ini beradi — cloud_launcher uni ishlatadi.
# Migration retry: Neon DB uyqudan uyg'onishi uchun vaqt kerak.
CMD ["sh", "-c", "for i in 1 2 3 4 5; do echo \"Migrate attempt $i...\" && python manage.py migrate --noinput && break || { echo \"Migrate failed, retrying in 10s...\"; sleep 10; }; done && python manage.py collectstatic --noinput 2>/dev/null && echo \"Starting cloud_launcher...\" && exec python cloud_launcher.py"]
