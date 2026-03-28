# signal-not-noise

## Run with Docker

This repository includes a full Docker setup for:
- frontend (served by Nginx)
- backend API (Node.js/Express)
- PostgreSQL database

### 1) Create environment file

From the project root:

```bash
cp .env.docker.example .env
```

Then edit `.env` and set at least:
- `POSTGRES_PASSWORD`
- `FRONTEND_URL` (use your public URL in production)
- `VITE_API_URL` (leave blank for Docker/Nginx same-origin setup)
- `OPENAI_API_KEY` (optional, required for AI enrichment endpoints)
- `SERPAPI_API_KEY` (optional, required for external news search endpoints)

### 2) Build and start

```bash
docker compose up -d --build
```

### 3) Access the app

- Frontend: `http://localhost`
- Backend health check: `http://localhost/api/health`

### 4) Logs and lifecycle

```bash
docker compose logs -f
docker compose down
```

If you want to wipe database data too:

```bash
docker compose down -v
```