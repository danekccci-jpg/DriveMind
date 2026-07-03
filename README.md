# DriveMind

Mobile “operating system” for **couriers and taxi drivers** — profitability scoring, shift tracking, order history, and maps-first navigation UI. Built for the Kraków market; architecture supports multiple delivery/ride platforms.

## Highlights

- **Expo / React Native** app with native Android services (notification ingest, overlay, accessibility)
- **Profitability engine** (`packages/shared`) shared between mobile and API
- **Firebase** auth, Firestore, Cloud Functions (Google Play subscription verification)
- **Zustand** + persisted state, **i18n** (EN / PL / RU / UK), Google Maps integration

## Monorepo

| Path | Role |
|------|------|
| `mobile/` | Primary product — Expo React Native driver app |
| `packages/shared/` | `@drivemind/shared` — types + `computeProfitability` |
| `backend/` | Express API (mock-first, Postgres-ready) |
| `functions/` | Firebase Cloud Functions |
| `infra/` | Local Postgres via Docker Compose |

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment (required for mobile)

```bash
cp mobile/.env.example mobile/.env
# Fill in Google Maps, Firebase, and Google Sign-In keys — see mobile/.env.example
```

Secrets are loaded from `mobile/.env` at build time (`app.config.js`). **Never commit `.env`, keystores, or service-account JSON.**

For Cloud Functions locally, copy `functions/service-account-google-play.json.example` → `functions/service-account-google-play.json` (gitignored).

### 3. Run

```bash
# Optional: Postgres
docker compose -f infra/docker-compose.yml up -d

# Backend + mobile
npm run dev
```

## Security

- Client API keys (Firebase, Maps) belong in `.env` / EAS Secrets — restrict them in Google Cloud Console (HTTP referrer / Android app SHA-1).
- Signing keys (`*.jks`, `keystore.properties`) must stay local.
- Firestore data is protected by Security Rules on the Firebase project (not shipped in this repo).

## Notes

- MVP uses **mocked platform data** for development; production ingest targets real notification/accessibility flows on Android.
- Profitability logic is centralized in `packages/shared/` and consumed by both the app and backend.

