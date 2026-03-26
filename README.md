# DriveMind (MVP)

Professional mobile “operating system” for **couriers and taxi drivers** in **Krakow, Poland**.

## Monorepo

- `mobile/`: Expo React Native app (dark-only UI)
- `backend/`: Node.js (Express) API (mock-first, Postgres-ready)
- `packages/shared/`: shared types + Profitability Engine
- `infra/`: local Postgres via Docker Compose

## Quick start (local)

### 1) Start Postgres (optional for MVP)

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 2) Install deps

```bash
npm install
```

### 3) Run backend + mobile

```bash
npm run dev
```

## Notes

- MVP uses **mocked data** (no real Uber/Bolt/Glovo/Wolt integrations yet).
- The **Profitability Engine** lives in `packages/shared/` and is used by both the API and the app.

