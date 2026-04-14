# DriveMind Project Structure

DriveMind is a monorepo for a courier/taxi driver MVP centered on the mobile client. The repository is organized so that the app code lives in `mobile/`, while `backend/` provides a mock-first Node API and `packages/shared/` contains cross-cutting types and scoring logic.

## 1. Общая архитектура и файловая структура

### Верхнеуровневая схема

```text
/
|-- package.json
|-- app.json
|-- index.js
|-- metro.config.js
|-- eas.json
|-- README.md
|-- android/
|-- backend/
|-- infra/
|-- mobile/
|-- packages/
`-- .vscode/
```

### Что где лежит

- `mobile/` - основной продукт: Expo React Native приложение.
- `android/` - сгенерированный native Android-проект для Expo prebuild / `expo run:android`.
- `backend/` - Express API для MVP, mock-first, с подготовкой к Postgres.
- `packages/shared/` - общий TypeScript-пакет с типами и profitability engine.
- `infra/` - локальная инфраструктура, включая Docker Compose для Postgres.
- `mobile/assets/` - статические ассеты приложения: иконки, splash, звуки.
- `mobile/src/` - весь прикладной код мобильного клиента.
- `.vscode/` - пользовательские настройки редактора.

### Внутренняя структура `mobile/src`

- `mobile/src/navigation/` - стек и табы навигации, а также геометрия/форматирование навигации.
- `mobile/src/screens/` - экраны приложения.
- `mobile/src/components/` - переиспользуемые UI-компоненты.
- `mobile/src/components/navigation/` - навигационные слои карты, HUD, маркер игрока.
- `mobile/src/components/map/` - контролы карты.
- `mobile/src/services/` - сеть, directions, location tracking, Google auth, звуки.
- `mobile/src/store/` - `zustand`-stores для состояния приложения.
- `mobile/src/tasks/` - фоновые задачи Expo Task Manager.
- `mobile/src/data/` - mock orders и mock shift history.
- `mobile/src/theme/` - палитры и типографика.
- `mobile/src/utils/` - утилиты для deep link, Google Maps key, форматирования и маппинга payloads.
- `mobile/src/map/` - стили карты.
- `mobile/src/i18n/` - инициализация переводов и локали.
- `mobile/src/engine/` - локальный profitability engine.

### Текущая схема запуска

Реально исполняемый путь приложения сейчас находится в `mobile/`, а не в корне репозитория:

1. `npm run dev` в корне запускает `npm --workspace mobile run start` и `npm --workspace backend run dev`.
2. В `mobile/` стартует `expo start`.
3. Точка входа клиента - `mobile/index.js`, который регистрирует `mobile/App.tsx` через `registerRootComponent`.
4. `mobile/index.ts` дополнительно подключает `mobile/src/tasks/locationTrackingTask`, чтобы background location task был зарегистрирован до запуска UI.
5. `mobile/metro.config.js` и корневой `metro.config.js` обеспечивают корректное разрешение monorepo-путей и shared package.

#### Важная оговорка про корневые прокси

- Корневой `app.json` содержит только минимальные метаданные (`android.package` и `extra.eas.projectId`).
- Полная Expo-конфигурация живет в `mobile/app.json` и дополняется через `mobile/app.config.js`.
- Корневой `index.js` выглядит как legacy/bootstrap file и сейчас не является надёжной точкой запуска для рабочего mobile-потока; фактический рабочий bootstrap находится в `mobile/`.

## 2. Технологический стек

### Root workspace

- `expo` `~55.0.11`
- `react` `19.2.0`
- `react-dom` `19.2.0`
- `react-native` `0.83.4`
- `react-native-web` `^0.21.0`
- `@expo/metro-runtime` `~55.0.6`
- `@react-native-community/cli` `^20.1.3`
- `@react-native/metro-config` `^0.84.1`
- `eslint` `^10.1.0`
- `npm-run-all` `^4.1.5`

### Mobile runtime

- `expo` `~55.0.8`
- `react` `19.2.0`
- `react-native` `0.83.2`
- `@expo-google-fonts/poppins` `^0.4.1`
- `@expo/vector-icons` `^15.0.2`
- `@react-native-async-storage/async-storage` `2.2.0`
- `@react-native-community/netinfo` `^11.5.2`
- `@react-native-google-signin/google-signin` `^16.1.2`
- `@react-navigation/native` `^7.2.0`
- `@react-navigation/native-stack` `^7.14.10`
- `@react-navigation/bottom-tabs` `^7.15.7`
- `expo-av` `^16.0.8`
- `expo-blur` `~55.0.10`
- `expo-font` `~55.0.4`
- `expo-haptics` `~55.0.9`
- `expo-location` `~55.1.4`
- `expo-status-bar` `~55.0.4`
- `expo-task-manager` `~55.0.10`
- `i18next` `^25.10.9`
- `react-i18next` `^16.6.6`
- `react-native-gesture-handler` `~2.30.0`
- `react-native-maps` `1.27.2`
- `react-native-reanimated` `4.2.1`
- `react-native-safe-area-context` `~5.6.2`
- `react-native-screens` `~4.23.0`
- `react-native-svg` `15.15.3`
- `react-native-worklets` `^0.7.2`
- `socket.io-client` `^4.8.3`
- `zustand` `^5.0.12`
- `cross-env` `^7.0.3`
- `typescript` `~5.9.2`

### Backend / shared

- `@drivemind/backend`: `express`, `helmet`, `cors`, `dotenv`, `pg`, `tsx`
- `@drivemind/shared`: shared TS package, exported via `dist/index.js`

### Build / tooling assumptions

- Expo prebuild is used for Android native integration.
- Metro is configured for monorepo resolution.
- TypeScript strict mode is enabled in `mobile/tsconfig.json`.

## 3. Детальный разбор модулей (Feature Map)

### Navigation

The navigation tree is split into a root stack plus a bottom tab bar:

- `mobile/src/navigation/RootNavigator.tsx`
  - Native stack navigator.
  - Screens:
    - `Tabs` - main app shell, header hidden.
    - `Notifications` - notification preferences.
    - `NavigationSettings` - navigation and map settings.
- `mobile/src/navigation/AppTabs.tsx`
  - Bottom tabs:
    - `Dashboard`
    - `OrderHub`
    - `ShiftMode`
    - `Earnings`
    - `Profile`
  - Tab press triggers light haptic feedback.
  - `OrderHub` tab badge is derived from `useDriverIngestStore().backgroundOrders.length`.

### App shell / onboarding flow

`mobile/App.tsx` gates the UI in this order:

1. Font load.
2. Language selection.
3. Role selection.
4. Onboarding.
5. Native Google auth on iOS/Android.
6. `NavigationContainer` + `RootNavigator`.

Stores involved:

- `useLanguageStore`
- `useRoleStore`
- `useAuthStore`
- `useOrdersStore`
- `useDriverSessionStore`

This makes the app stateful before the main navigation tree is rendered.

### Ride Module (Waze Clone)

Main ride/navigation surface is `mobile/src/screens/Dashboard/index.tsx`.

#### Map stack

- `react-native-maps` is the map engine.
- Native map provider is Google Maps (`PROVIDER_GOOGLE`).
- `mobile/src/components/MapViewWeb.tsx` provides a web stub; on web the map is a placeholder, not a full map experience.
- `mobile/src/map/mapStyles.ts` defines dark/light custom map styles.
- `mobile/src/components/navigation/NavigationMapLayers.tsx` renders:
  - route polyline with glow,
  - pickup/dropoff destination marker,
  - pulsing destination state near arrival.
- `mobile/src/components/navigation/PlayerNavMarker.tsx` renders the moving driver marker in 3 styles:
  - `classic`
  - `arrow3d`
  - `car`
- `mobile/src/components/map/MapControls.tsx` provides:
  - zoom in/out,
  - recenter,
  - 2D/3D toggle,
  - compass-style heading control.

#### Location and movement

- `expo-location` is used for:
  - foreground permissions,
  - background permissions on Android,
  - live location watch,
  - heading updates when available.
- `mobile/src/services/locationTrackingService.ts` starts/stops background updates.
- `mobile/src/tasks/locationTrackingTask.ts` registers a Task Manager background task that forwards the latest fix to the navigation engine.
- `useOrdersStore` turns tracking on when navigation or online shift state is active.
- `navigationEngine.reportDriverLocation()` throttles location broadcasts to avoid spam:
  - movement threshold,
  - heading threshold,
  - heartbeat fallback.

#### Route engine

- `mobile/src/services/navigationEngine.ts` is the central routing orchestrator.
- It debounces route refreshes and ignores stale results via request sequence numbers.
- It trims origin jitter to avoid unnecessary refreshes.
- It can:
  - schedule route refresh,
  - force refresh when off-route,
  - cancel pending requests,
  - emit driver location over socket.
- `mobile/src/services/directionsService.ts` resolves directions via:
  - optional proxy (`EXPO_PUBLIC_DIRECTIONS_PROXY_URL`),
  - fallback to Google Routes API,
  - geocoding fallback for addresses.
- The current Routes API field mask is intentionally minimal, so the UI often gets a synthetic one-step route summary rather than full turn-by-turn instructions.
- `mobile/src/navigation/navigationGeometry.ts` adds:
  - polyline trimming,
  - off-route distance calculation,
  - remaining distance to next maneuver,
  - bearing and heading smoothing.
- `mobile/src/navigation/navigationFormatting.ts` formats distances for metric/imperial HUD display.

#### Ride state machine

`useOrdersStore` drives the navigation lifecycle with:

- `isNavigating`
- `navigationPhase`
- `deliveryPhase`
- `navigationOrderId`
- `routePolyline`
- `routeSteps`
- `routeDurationSeconds`

The delivery states are:

- `IDLE`
- `EN_ROUTE_TO_PICKUP`
- `AT_PICKUP`
- `EN_ROUTE_TO_DROPOFF`
- `COMPLETED`

The Dashboard screen:

- fetches/maintains foreground GPS,
- computes nearest route target,
- auto-refits map on route start,
- switches to user-centric follow mode after intro animation,
- re-routes when off-route,
- changes the HUD CTA depending on phase,
- completes orders and credits the wallet on dropoff.

### Multi-service Logic

This project models two service families:

- courier mode: `glovo`, `uber`, `bolt`, `wolt`
- taxi mode: `uber`, `bolt`

#### Data contracts

- Shared package (`packages/shared`) defines:
  - `Role`
  - `Platform`
  - `UnifiedOrder`
  - `ProfitabilityInput`
  - `ProfitabilityOutput`
- Mobile runtime uses a flatter `Order` model in `mobile/src/store/ordersStore.ts`.
- `mobile/src/utils/orderPayloadMapping.ts` normalizes backend / socket payloads from either camelCase or snake_case into that mobile `Order` shape.

#### Order sources

- `mobile/src/data/mockOrders.ts` provides the current in-app order feed.
- `backend/src/mock/orders.ts` provides API-side mock orders.
- `mobile/src/screens/OrderHub/index.tsx` still renders from `MOCK_ORDERS`, so the feed is not yet fully backend-driven.

#### State model

- `useOrdersStore` stores:
  - active orders,
  - pending confirmation modal,
  - completed history,
  - shift stats,
  - daily goal,
  - last platform activity,
  - route/nav state.
- `useDriverSessionStore` stores:
  - stable `driverId`,
  - `isOnline`.
- `useDriverIngestStore` stores:
  - active ride offer,
  - queued background offers,
  - temporary ingest toast state,
  - sound flag.

#### Deep linking / switching between apps

- `mobile/src/utils/platformDeepLink.ts` opens:
  - `glovo://`
  - `uber://`
  - `bolt://`
  - `wolt://`
- If the native app is unavailable, it falls back to the relevant App Store / Play Store URL.
- The accept flow is intentionally split:
  1. Tap accept in DriveMind.
  2. On Android, trigger a short scraper window.
  3. Open the platform app via deep link.
  4. Return to DriveMind and confirm the order in a modal.

#### Android ingest bridge

- `mobile/src/services/driverIngestBridge.ts` listens to native Android events:
  - notification ingest,
  - scrape ingest,
  - NetInfo sync for buffered notifications.
- `mobile/src/store/driverIngestStore.ts` uses a TTL queue (3 minutes) for captured offers.
- `mobile/src/components/DriverIngestToast.tsx` shows a short confirmation toast after scrape success.
- `mobile/src/components/IntegrationHealthCard.tsx` displays Android-native service health and diagnostic events.

#### Platform switching / service preferences

- `mobile/src/screens/Onboarding/index.tsx` captures role, services, and vehicle type.
- `mobile/src/screens/ShiftMode/index.tsx` exposes service toggles and an auto mode switch.
- These toggles are currently mostly local UI state; they are not yet a fully enforced server-side dispatch policy.

## 4. Состояние API и Native-слоя

### Backend API

The backend is a lightweight Express service with in-memory MVP state.

Endpoints currently present in `backend/src/index.ts`:

- `GET /health`
- `GET /v1/dashboard`
- `GET /v1/services`
- `POST /v1/services`
- `GET /v1/orders`
- `POST /v1/orders/:id/accept`
- `GET /v1/shift`
- `POST /v1/shift/start`
- `POST /v1/shift/end`
- `GET /v1/analytics`

Characteristics:

- mock-first data model,
- in-memory shift/service state,
- uses `@drivemind/shared` profitability engine,
- Postgres-ready but not yet fully wired to persistent storage.

### Socket / realtime

- `mobile/src/services/socketService.ts` connects to `backendUrl`.
- URL resolution order:
  1. `Constants.expoConfig.extra.backendUrl`
  2. `EXPO_PUBLIC_BACKEND_URL`
- Events used by the client:
  - `driver_auth`
  - `new_order`
  - `order_accepted`
  - `update_location`
- If backend URL is empty, realtime is explicitly disabled.

### Expo / app config

- `mobile/app.json` holds the base Expo app metadata:
  - name, slug, icon, splash, package name, permissions, plugin list.
- `mobile/app.config.js` merges runtime environment variables into Expo config:
  - `EXPO_PUBLIC_BACKEND_URL` / `BACKEND_URL`
  - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` / legacy `EXPO_PUBLIC_GOOGLE_MAPS_KEY`
- `mobile/app.config.js` injects the resolved Google Maps key into both:
  - iOS `googleMapsApiKey`
  - Android `googleMaps.apiKey`

### Android configuration

`android/app/build.gradle`:

- `namespace` and `applicationId` are both `com.guessxx.drivemind`.
- React Native entry is resolved through Expo's app-entry resolver.
- Release build currently reuses the debug signing config.
- Hermes is enabled when available; otherwise it falls back to JSC.
- Packaging options are exposed through Gradle properties.

`android/app/src/main/AndroidManifest.xml`:

- `INTERNET`
- `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion=32`
- `SYSTEM_ALERT_WINDOW`
- `VIBRATE`
- launch intent filter only; no deep-link intent filters are defined here yet
- Expo updates are disabled via manifest metadata

### Google Maps API usage

- `mobile/src/utils/googleMapsConfig.ts` centralizes API key lookup.
- The app uses Google Maps in two places:
  - Map rendering via `react-native-maps`
  - Directions / geocoding via Google APIs in `directionsService.ts`
- If neither proxy nor API key is configured, directions fail explicitly rather than silently.

### Windows build notes

Because the repo is used on Windows, Gradle builds are expected to be run with:

- `.\gradlew` from the `android/` directory for raw Android tasks.

Typical examples:

- `.\gradlew assembleRelease`
- `.\gradlew installDebug`

In the repo itself, the higher-level mobile scripts are:

- `npm run android`
- `npm run android:release`
- `npm run android:release:fresh`

These wrap `expo run:android` and, for release builds, set `NODE_ENV=production` via `cross-env`.

## 5. Текущие задачи и "Болевые точки"

### Что уже работает

- Monorepo structure with separate `mobile`, `backend`, and `packages/shared`.
- Expo app bootstrapping inside `mobile/`.
- Language choice, role selection, onboarding, guest fallback, and Google sign-in on native.
- Bottom-tab navigation plus additional stack screens.
- Mock order feed, profit badges, shift history, and wallet payout accumulation.
- Live map tracking, route rendering, custom map controls, and navigation HUD.
- Background location task registration on Android.
- Socket-based realtime driver auth / location / order acknowledgement.
- Deep links to external service apps with store fallbacks.
- Android ingest pipeline scaffolding for notification and scrape events.
- Persisted state with `zustand + AsyncStorage`.
- Shared profitability engine reused by backend and app.

### Что находится в разработке или частично реализовано

- Real Uber / Bolt / Glovo / Wolt dispatch integration is still deep-link based, not SDK/API based.
- `OrderHub` and `Dashboard` still use mock order data instead of a fully live backend feed.
- Route fidelity is partial when the app falls back to Google Routes API with a minimal field mask; turn-by-turn steps are synthetic in that mode.
- `MapViewWeb` is only a placeholder on web.
- `ShiftMode` toggles are UI-level state and are not yet a complete server-enforced service policy.
- The root-level `index.js` appears stale relative to the current `mobile/` bootstrap.
- Release signing in `android/app/build.gradle` still points at the debug keystore.
- `app.config.js` depends on env injection for backend URL and Google Maps key; without env, realtime/directions degrade or fail.

### Practical reading of the current product state

The app already behaves like a working driver console for demos and internal testing, but several production pieces are still simulation layers:

- orders are mocked or bridged,
- navigation is real enough for route visualization and location streaming,
- external platforms are opened via deep link rather than integrated natively,
- Android-native automation exists, but it still needs hardening and production wiring.

