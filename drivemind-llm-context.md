# DriveMind — LLM context document

Generated snapshot of the repository for external models. Paths are relative to the repo root unless noted.

---

## 1. Project structure and architecture

### Monorepo layout (npm workspaces)

The root `package.json` declares workspaces: `mobile`, `backend`, and `packages/*`. The **canonical profitability logic** lives in `packages/shared` and is consumed by both the Expo app and the Express API.

| Area | Role |
|------|------|
| `mobile/` | Primary product: Expo / React Native driver app (navigation UI, Zustand state, sockets, native Android services). |
| `packages/shared/` | Pure TypeScript library (`@drivemind/shared`): order-related types and `computeProfitability`. Published as built `dist/` output. |
| `backend/` | Small Express MVP (`/v1/*` routes, in-memory shift state, mock orders, uses shared profitability for sorting). |
| Root | Orchestrates `dev` (parallel backend + mobile), lint, and pins some dependencies (Expo / React / RN versions) that workspaces may inherit. |

### Entry points and routing

**JavaScript entry**

- `mobile/index.js` — Registers the **Expo TaskManager** background location task (when not disabled), then `require('./index.ts')`.
- `mobile/index.ts` — `registerRootComponent(App)` from Expo.

**Root `package.json`** sets `"main": "mobile/index.js"` for tooling that resolves the repo entry from the root.

**App bootstrap (`mobile/App.tsx`)**

Flow (simplified):

1. Load fonts (Poppins).
2. If language not chosen → `LanguageSelectionScreen`.
3. If no role → `RoleSelectionScreen`.
4. If onboarding incomplete → `OnboardingScreen`.
5. On Android/iOS, wait for **auth Zustand rehydration** after Google Sign-In setup; if not authenticated → `LoginScreen`.
6. Otherwise → `MainAppWithDriverIngest` wrapping `NavigationContainer` + `RootNavigator`.

**Navigation**

- `mobile/src/navigation/RootNavigator.tsx` — Native stack: `Tabs` (main), `Notifications`, `NavigationSettings`.
- `mobile/src/navigation/AppTabs.tsx` — Bottom tabs: **Dashboard** (ride), **OrderHub**, **ShiftMode**, **Earnings**, **Profile**.

The **Dashboard** tab hosts the map-centric “Waze-like” experience (`mobile/src/screens/Dashboard/index.tsx`).

---

## 2. Tech stack and core dependencies

Exact versions can differ slightly between **root** and **`mobile/package.json`** because of hoisting; both are listed here as declared.

### Root `package.json` (workspace umbrella)

- **Expo**: `~55.0.11`
- **React**: `19.2.0`
- **React Native**: `0.83.4`
- **react-native-web**: `^0.21.0`
- **@expo/metro-runtime**: `~55.0.6`

### `mobile/package.json` (app)

- **Expo**: `~55.0.8`
- **React**: `19.2.0`
- **React Native**: `0.83.2`
- **Maps**: `react-native-maps` `1.27.2`, **Google Maps** via `provider={PROVIDER_GOOGLE}` and Android `play-services-maps` **19.1.0** (in `mobile/android/app/build.gradle`)
- **Navigation**: `@react-navigation/native` `^7.2.0`, `@react-navigation/native-stack` `^7.14.10`, `@react-navigation/bottom-tabs` `^7.15.7`, `react-native-screens` `~4.23.0`, `react-native-safe-area-context` `~5.6.2`
- **State**: **Zustand** `^5.0.12` with `persist` + **AsyncStorage** (and `localStorage` on web for some stores)
- **Location / background**: `expo-location` `~55.1.4`, `expo-task-manager` `~55.0.10`
- **Realtime**: `socket.io-client` `^4.8.3`
- **i18n**: `i18next`, `react-i18next`
- **Auth**: `@react-native-google-signin/google-signin` `^16.1.2`
- **Animation**: `react-native-reanimated` `4.2.1`, `react-native-worklets` `^0.7.2`

### `backend/package.json`

- **Express** `^4.21.2`, **@drivemind/shared** `0.0.1`, **pg** `^8.13.3` (dependency present; MVP uses in-memory state per `backend/src/index.ts` comments)

### Config surfaces for Maps API keys

- **`mobile/app.config.js`** merges env vars (`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` / `EXPO_PUBLIC_GOOGLE_MAPS_KEY`) into `android.config.googleMaps.apiKey` and `ios.config.googleMapsApiKey`, plus `extra.googleMapsApiKey`.
- **`mobile/android/app/build.gradle`** injects `com.google.android.geo.API_KEY` via `manifestPlaceholders` from `MAPS_API_KEY` (env or `gradle.properties`).
- **`mobile/android/app/src/main/AndroidManifest.xml`** references `${MAPS_API_KEY}` for the Maps meta-data entry.

---

## 3. State management (Zustand)

All stores use `create` from `zustand`; several use `persist` + `createJSONStorage`.

### Orders, shift, daily goal — `mobile/src/store/ordersStore.ts`

Persisted slice name: `drivemind-orders-v2`.

**`Order`**

```ts
export interface Order {
  id: string
  platform: string
  pickupAddress: string
  dropoffAddress: string
  earnings: number
  distanceKm: number
  durationMin: number
  deadrunKm: number
  pickupLat: number
  pickupLng: number
  dropoffLat: number
  dropoffLng: number
  profitScore: number
  profitLabel: string
  status: 'pickup' | 'dropoff' | 'completed'
}
```

**`ShiftStats`** (shift progress — not a boolean “on air” flag; “shift active” in UI is derived from `startTime !== null`)

```ts
export interface ShiftStats {
  totalEarnings: number
  totalKm: number
  totalMinutes: number
  completedOrders: number
  startTime: number | null
  lastOrderDropoffLat: number | null
  lastOrderDropoffLng: number | null
}
```

**Daily goal (PLN)**

- `dailyGoal: number` — default **500** PLN in store initial state.
- `remainingToGoal` — persisted; recomputed when earnings / goal change via `setDailyGoal` and `completeOrder`.

**Navigation / delivery state** (same store): `isNavigating`, `navigationPhase`, `deliveryPhase` (`IDLE` | `EN_ROUTE_TO_PICKUP` | `AT_PICKUP` | `EN_ROUTE_TO_DROPOFF` | `COMPLETED`), route polyline, steps, etc.

### Role & onboarding — `mobile/src/store/roleStore.ts`

```ts
type Role = 'courier' | 'taxi'
type VehicleType = 'bike' | 'moped' | 'car'

interface RoleState {
  role: Role | null
  vehicleType: VehicleType
  fuelConsumption: number
  onboardingComplete: boolean
  selectedServices: string[]
  // setters...
}
```

### Driver online / id — `mobile/src/store/driverSessionStore.ts`

```ts
interface DriverSessionState {
  driverId: string
  isOnline: boolean
  setIsOnline: (v: boolean) => void
}
```

### App / navigation settings — `mobile/src/store/navigationSettingsStore.ts`

```ts
export type MarkerStyleId = 'classic' | 'arrow3d' | 'car'
export type MapAppearance = 'auto' | 'light' | 'dark'
export type Units = 'metric' | 'imperial'
export type DirectionsMode = 'driving' | 'bicycling'

export interface NavigationSettingsState {
  directionsMode: DirectionsMode
  markerStyle: MarkerStyleId
  mapAppearance: MapAppearance
  units: Units
  avoidTolls: boolean
  trafficAware: boolean
  navMuted: boolean
  mapPerspective3d: boolean
  // setters...
}
```

### Driver ingest queue — `mobile/src/store/driverIngestStore.ts`

Holds `IngestedOffer` items from notifications or accessibility scrape (Uber/Bolt), with TTL **180s**. Only `soundEnabled` is persisted.

### Other stores (summary)

- **`authStore`** — Google user email/name, `isAuthenticated` / `isLoggedIn`.
- **`userStore`** — `displayName` (cosmetic).
- **`themeStore`** — light/dark for UI.
- **`languageStore`** — i18n language + `hasChosenLanguage`.
- **`walletStore`** — ledger of payouts when orders complete.
- **`socketConnectionStore`** — connection metadata for realtime layer.

### Shared domain types — `packages/shared/src/types.ts`

**Unified order** (backend/mock shape; not identical to mobile `Order`):

```ts
export type UnifiedOrder = {
  id: string
  platform: Platform
  kind: OrderKind
  createdAt: string
  pickup: { lat: number; lng: number; label: string }
  dropoff: { lat: number; lng: number; label: string }
  pricePLN: number
  distanceKm: number
  etaMin: number
  notes?: string
}
```

**Profitability I/O**

```ts
export type ProfitabilityInput = {
  role: Role
  pricePLN: number
  distanceKm: number
  etaMin: number
  dropoffLabel?: string
  isWeekendOrNight?: boolean
  trafficFactor?: number
  demandFactor?: number
}

export type ProfitabilityOutput = {
  plnPerKm: number
  plnPerMin: number
  estHourlyPLN: number
  score0to100: number
  recommendation: Recommendation
  reason: string
  profitTier: ProfitTier
  isOutOfCity: boolean
  zonePenaltyApplied: boolean
}
```

---

## 4. Native Android integrations (bridge)

### Implemented Kotlin modules (`mobile/android/app/src/main/java/com/guessxx/drivemind/`)

| File | Purpose |
|------|---------|
| `MainApplication.kt` | Expo `ReactHost`, registers `DriveMindPackage`, calls **`MapsInitializer.initialize(..., Renderer.LEGACY, ...)`** so **custom map JSON styles apply on Android** (comment notes LATEST ignores custom styles). |
| `DriveMindPackage.kt` | Registers `DriveMindNativeModule`. |
| `DriveMindNativeModule.kt` | React Native module **`DriveMindNative`**: sound prefs, notification buffer read/clear, scraper window extension, diagnostic/service status, deep-links to system settings (notification listener, accessibility, battery). |
| `DriveMindNotificationService.kt` | **`NotificationListenerService`**: filters **`com.ubercab.driver`** and **`com.bolt.driver`**, reads title/text, extends scraper window, buffers offline or emits **`DriveMindNotification`** to JS via `DriveMindReactBridge`. |
| `DriveMindScraperService.kt` | **`AccessibilityService`**: on Uber/Bolt window events, runs **500 ms polling** while `DriveMindScraperState.shouldScan()` is true; walks `AccessibilityNodeInfo` text, regex-extracts price/surge, picks longest line as destination; emits **`DriveMindScrape`**. |
| `DriveMindScraperState.kt` | Atomic **10s scan window** extended by notifications, accessibility events, and JS `triggerScraperWindow`. |
| `DriveMindReactBridge.kt` | Holds `ReactApplicationContext`, emits `DeviceEventEmitter` events from background services. |
| `NotificationBufferPrefs.kt` | Buffered notifications + diagnostics (read from native module). |
| `DriveMindSound.kt` | Soft click feedback when ingest events fire. |

### Notification listener (Uber/Bolt pushes)

- **Manifest**: `DriveMindNotificationService` with `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE` and exported listener intent filter.
- **Behavior**: Only packages `com.ubercab.driver` / `com.bolt.driver`. Pulls title/text from `Notification` extras, timestamps with `StatusBarNotification.postTime`, extends shared scraper deadline by10s, optionally appends to **`NotificationBufferPrefs`** when offline, otherwise **`DriveMindReactBridge.emit("DriveMindNotification", map)`**.

### “Overlay” / HUD (JavaScript vs native)

**`mobile/src/services/driverIngestBridge.ts`** types and calls native methods: `requestOverlayPermission`, `isOverlayPermissionGranted`, `isUsageAccessGranted`, `requestUsageAccess`, `setOverlayShiftActive`, `updateOverlayProfitability`.

**Current gap:** `DriveMindNativeModule.kt` in the repo **does not define** these overlay/usage-stats methods. The TypeScript bridge expects a richer native API than is implemented in Kotlin. Any overlay HUD would need matching `@ReactMethod` implementations (and likely `SYSTEM_ALERT_WINDOW` usage) to align with the JS side.

**Related manifest permissions** already declared: `SYSTEM_ALERT_WINDOW`, `PACKAGE_USAGE_STATS`, foreground service types, location, `POST_NOTIFICATIONS`, etc.

### Driver ingest hookup in React

In `mobile/App.tsx`, `MainAppWithDriverIngest` sets:

```ts
const NUCLEAR_DISABLE_GOOGLE_NATIVE_CALLS = true
useDriverIngestBridge(!NUCLEAR_DISABLE_GOOGLE_NATIVE_CALLS)
```

So **`useDriverIngestBridge` is currently invoked with `enabled: false`**, meaning notification/scrape listeners are **not** wired from JS in the default build, independent of native module completeness.

### Build / Maps / services (high level)

- **`build.gradle`**: `manifestPlaceholders = [MAPS_API_KEY: ...]`; `play-services-maps:19.1.0`; release **minify** controlled by `android.enableMinifyInReleaseBuilds`; resource shrink guarded behind a property due to past **R8 / resource stripping** issues.
- **`AndroidManifest.xml`**: Google Maps API key meta-data, `DriveMindNotificationService`, `DriveMindScraperService` + `@xml/accessibility_service_config`, activity `MainActivity`, permissions for location, foreground services, notification listener, accessibility, overlay, usage stats.

---

## 5. Business logic — profitability engine

**Source of truth:** `packages/shared/src/profitability.ts` — **`export function computeProfitability(input: ProfitabilityInput): ProfitabilityOutput`**.

### PLN/km and tiers (Kraków 2026 constants)

- **Weekday** “trash” threshold: effective PLN/km **&lt; 2.50** → tier **`TRASH`**.
- **Weekend or night** (input flag): trash threshold **&lt; 4.00** → **`TRASH`** (stricter bar when demand is expected higher).
- **Night/weekend flag** in callers: Saturday/Sunday **or** local hour **22:00–06:00** (see `mobile/src/engine/profitEngine.ts` and `driverIngestBridge.ts`).
- **OKAY vs PROFIT**: if not trash, **`effectivePlnPerKm &gt;= 3.50`** → **`PROFIT`**, else **`OKAY`**.

### Effective PLN/km and suburbs

- **`grossPlnPerKm`** = `pricePLN / distanceKm` (price may be scaled by optional `demandFactor`).
- **Out-of-city detection**: substring match on `dropoffLabel` against a fixed list (Wieliczka, Skawina, Niepołomice, Krzeszowice, Myślenice, Zabierzów, Świątniki, Kryspinów, Liszki, Mogilany, etc.).
- If out-of-city: **`effectivePricePLN = pricePLN * 0.70`** (30% penalty for empty return), tier classification uses **`effectivePlnPerKm`**.

### Time / traffic levers

- **`etaMin`** used in engine is **`max(1, input.etaMin * trafficFactor)`** — higher `trafficFactor` inflates ETA, which **lowers** `plnPerMin` and `estHourlyPLN`.
- **Mobile `calculateProfitScore`** (`mobile/src/engine/profitEngine.ts`) sets **`trafficFactor = 1.15`** during **peak hours** `[12,14)` and `[18,21)` local time before calling `computeProfitability`. Distance passed in is **`order.distanceKm + order.deadrunKm`**.

### Weekend / night (multiplier interpretation)

There is **no explicit numeric weekend multiplier** on price. Weekend/night shifts the **trash threshold** from **2.50** to **4.00** PLN/km and adjusts recommendation copy.

### Legacy 0–100 score and recommendation mapping

- Role-specific targets for hourly and PLN/km scores (`courier` vs `taxi`).
- **Time penalty** on score: courier penalizes long ETA (`etaMin` vs22 min); taxi penalizes *short* ETA (vs 10 min) — reflects different trip economics.
- **Zone penalty score**: −15 if out-of-city penalty applied.
- **`recommendation`**: `PROFIT` tier → **`TAKE`**; `TRASH` → **`SKIP`**; `OKAY` → **`WAIT`** if `score0to100 >= 55` else **`SKIP`**.

### Mobile label layer

`calculateProfitScore` maps shared output to UI labels **`GREAT` / `GOOD` / `OK` / `SKIP`** using `recommendation` and score thresholds.

### Backend usage

`backend/src/index.ts` attaches `profitability` to mock orders and sorts by **`estHourlyPLN`** by default.

---

## 6. UI/UX and navigation implementation

### Dashboard architecture**File:** `mobile/src/screens/Dashboard/index.tsx`

- **Minimal chrome** when not navigating: header with app name + role pill; **bottom sheet** with shift stats (earnings PLN, completed orders, hours online) and suggested ride card (platform icon, profit badge, accept → deep link to provider).
- **Navigating**: Waze-like **DirectionCard** overlay (maneuver icon, distance to next turn, street name), **3-layer neon polyline**, **destination marker** (pickup orange vs dropoff green), **user marker** via `PlayerNavMarker` (classic / 3D arrow / car styles from settings).
- Optional **`DASHBOARD_ISOLATION_MODE`**: replaces map with a placeholder (debug/stability).

### Map configuration

- **Component:** `MapView`, `Marker`, `Polyline`, `MarkerAnimated`, `AnimatedRegion`, `PROVIDER_GOOGLE` re-exported from **`mobile/src/components/MapViewWeb.tsx`** — on native, dynamically `require('react-native-maps')`; on web, stub container.
- **Styling:** `MAP_STYLE_LIGHT` / `MAP_STYLE_DARK` in **`mobile/src/map/mapStyles.ts`** — POI/transit mostly hidden; dark theme tuned for neon route contrast.
- **Android renderer:** `googleRenderer={Platform.OS === 'android' ? 'LEGACY' : undefined}` on `MapView` (matches `MapsInitializer` LEGACY choice).
- **Traffic:** `showsTraffic` enabled.

### Delayed mounting and style application (stability)

From Dashboard comments and effects:

1. **`isMapReady`**: `useEffect` sets `true` after **1000 ms** — defers mounting `MapView` through boot/login transitions.
2. **Theme remount:** `key={isDark ? 'map-dark' : 'map-light'}` forces full native remount on theme flip.
3. **`isMapStyleReady`:** reset when `isDark` changes; `onMapReady` schedules **`setIsMapStyleReady(true)` after 150 ms** so **`customMapStyle`** is applied after the GMS surface settles (avoids GMS overwriting JSON style during init).
4. **Navigation intro camera:** When route length crosses from &lt;2 to ≥2 points, **`navFollowReady`** is set false; **`fitToCoordinates`** then after 750 ms **`animateCamera`** to user-centric 3D pitch; follow mode enabled after **1500 ms** timer — prevents camera fighting the first route draw.
5. **Ongoing navigation:** `dynamicNavZoom` adjusts zoom by speed and distance to next maneuver; `animateCamera` on a **1s** cadence when `navFollowReady` and location available.

### Markers

- **Destination:** `NavigationMapLayers` — custom `Marker` with `tracksViewChanges={nearDestination}` for pulse animation near arrival.
- **User:** `MarkerAnimated` + **`PlayerNavMarker`** (SVG arrow / variants) with `headingDeg` smoothed via **`lowPassHeading`**; web uses static `Marker`.

### Location and background tracking

- Dashboard location `useEffect` includes a **`NUCLEAR_DISABLE_GOOGLE_LOCATION_CALLS`** flag set **`true`**, which **returns before** requesting permissions or subscriptions — so **live GPS may be inactive** in the checked-in configuration (worth verifying for production).
- **`App.tsx`**: `ENABLE_BACKGROUND_TRACKING = false` disables starting **`expo-task-manager`** background location when investigating **AppOps / MONITOR_LOCATION** crashes; `index.js` still defines the task when `NUCLEAR_DISABLE_BACKGROUND_PLUGINS` is false.

---

## 7. TODO / FIXME and technical debt markers

- **No `TODO` or `FIXME` strings** were found in scanned `*.ts/tsx/js/jsx` sources.
- **`NUCLEAR_*` flags** and comments serve as explicit kill-switches / debug notes, notably:
  - `App.tsx`: background tracking off; **driver ingest bridge disabled** in `MainAppWithDriverIngest`.
  - `Dashboard/index.tsx`: location acquisition short-circuited; map isolation flags.
  - `MapViewWeb.tsx` / `mapStyles.ts`: comments about avoiding direct `react-native-maps` imports in some builds.
- **`backend/src/index.ts`**: comments about replacing in-memory state with **Postgres** later.
- **Native/JS contract:** overlay-related methods referenced from TypeScript **are not implemented** in `DriveMindNativeModule.kt` as of this snapshot.

---

## 8. Quick reference — core profitability API

```ts
// packages/shared/src/profitability.ts
export function computeProfitability(input: ProfitabilityInput): ProfitabilityOutput
```

Consumers:

- `mobile/src/engine/profitEngine.ts` — UI scoring + peak traffic factor.
- `mobile/src/services/driverIngestBridge.ts` — overlay tier preview on notification (when bridge enabled and native supports it).
- `backend/src/index.ts` — mock order sorting.

---

*End of document.*
