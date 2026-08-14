# DriveMind — Аудит проекта (для ИИ-ассистента)

> Снимок состояния репозитория на **14.08.2026**, ветка `DriveMind`.
> Документ описывает текущее состояние (включая незакоммиченные изменения), чтобы ИИ-ассистент мог работать с проектом без предварительного изучения кода.
> Пути указаны относительно корня репозитория `C:\MyApps\DriveMind\DriveMind`.

---

## 1. Что такое DriveMind

Мобильное приложение (Android-first, Expo / React Native) — «операционная система» для **курьеров и таксистов** рынка **Кракова (Польша, злотые / PLN)**. Задачи:

- **Перехват заказов** из чужих приложений (Uber, Bolt, Glovo, Wolt и др.) через Android `NotificationListenerService` + `AccessibilityService` (скрейпер экрана).
- **Оценка прибыльности** каждого заказа движком `@drivemind/shared` (`computeProfitability`) — тиры EXCELLENT / GOOD_DEAL / STANDARD / LOW_YIELD по PLN/км, с учётом поездок за город, времени суток, роли.
- **Навигация** в стиле Waze (карта Google Maps, полилиния маршрута, пошаговые подсказки, следование за пользователем).
- **Трекинг смены**: заработок, километраж, время, история заказов, аналитика, кошелёк.
- **Монетизация**: воронка «гость → 15 приветственных заказов → 7-дневный триал → Google Play подписка 8.99 PLN/неделя».

Продукт зрелый (version 1.0.57, версии 1.0.57 приложения), публикуется в Google Play (пакет `com.guessxx.drivemind`), разрабатывается одним человеком (danekccci-jpg), коммиты в стиле «DriveMind Update: <дата>».

---

## 2. Монорепозиторий (npm workspaces)

Корень: `package.json` → workspaces `["mobile", "packages/shared"]`, `postinstall` = `node mobile/scripts/patch-metro-multipart.js`.

| Путь | Роль |
|---|---|
| `mobile/` | Основной продукт — Expo / React Native приложение (SDK 55, RN 0.83, React 19.2) |
| `packages/shared/` | `@drivemind/shared@0.0.1` — чистые типы + `computeProfitability` (источник истины бизнес-логики), билдится в `dist/` |
| `backend/` | Express API (MVP, in-memory состояние, mock-заказы, готов к Postgres) |
| `functions/` | Firebase Cloud Functions — одна функция `verifySubscription` (верификация Google Play подписок) |
| `infra/` | `docker-compose.yml` — Postgres 16 (`drivemind-postgres`, 5432) |
| `hosting-public/` | Статическая страница для email-link авторизации (Firebase Hosting) |
| `docs/` | Документация (README-скриншоты, ANDROID_NATIVE_RELEASE.md, PLAY_STORE_LISTING.md, этот аудит) |
| `scripts/` | PowerShell/Node-скрипты: сборка AAB, безопасность, логирование |

**Файлы LLM-контекста в корне:** устаревший `drivemind-llm-context.md` (24.07, до подписок и до включения native-моста — **не доверять полностью**, актуально описано здесь).

---

## 3. Технологический стек

### Мобильное приложение (`mobile/package.json`, v1.0.13)
- **Expo ~55.0.27**, React Native 0.83.6, React 19.2.0, Hermes
- **Карты**: `react-native-maps` 1.27.2, Google Maps (`PROVIDER_GOOGLE`), `play-services-maps:19.1.0`, renderer **LEGACY** (для кастомных JSON-стилей карты)
- **Навигация**: `@react-navigation/native` v7 + native-stack + bottom-tabs + stack
- **Состояние**: Zustand ^5.0.12 (`persist` + AsyncStorage)
- **Realtime**: `socket.io-client` ^4.8.3 (бэкенд-заглушка)
- **Auth**: `@react-native-google-signin/google-signin` ^16.1.2, `firebase` ^11.10.0
- **Биллинг**: `react-native-iap` (алиас `npm:@iaptic/react-native-iap@13.0.2`)
- **Локализация**: `i18next` + `react-i18next` ^16.6.6 + `expo-localization`
- **Анимации**: `react-native-reanimated` 4.2.1 + worklets
- **Фон**: `expo-location`, `expo-task-manager`, `expo-notifications`, `expo-secure-store`, `expo-av`, `expo-haptics`
- **Прочее**: `react-native-permissions`, `@react-native-community/netinfo`, `react-native-calendars`, `@expo-google-fonts/poppins`

### Бэкенд (`backend/package.json`)
Express ^4.21.2, helmet, cors, `pg` ^8.13.3 (установлен, **не используется**), TypeScript ESM, запуск `tsx watch`.

### Cloud Functions (`functions/package.json`)
`firebase-admin ^13.4.0`, `firebase-functions ^6.4.0`, `googleapis ^144.0.0`, Node 20, CommonJS.

---

## 4. Архитектура мобильного приложения

### 4.1 Точки входа и bootstrap
- `mobile/index.ts` → `./registerBackgroundTasks` (TaskManager `LOCATION_TRACKING_TASK`) → `registerRootComponent(App)`.
- `mobile/App.tsx` — поток запуска:
  1. Загрузка шрифтов Poppins, сплэш ~720 мс.
  2. Гейт-цепочка экранов: `WelcomeScreen` (если `!hasSeenWelcome`) → `OnboardingScreen` (если `!onboardingComplete`) → спиннер rehydration auth → `LoginScreen` (нативно, если не аутентифицирован) → `SubscriptionProvider` + `AuthenticatedAppShell`.
  3. `AuthenticatedAppShell`: если `!hasAppAccess` (paywall-блок: триал/подписка истекли или гость заблокирован) → **`PaywallScreen`**; иначе → `MainAppWithDriverIngest` (включает `useDriverIngestBridge(true)`, permission cold-start, 3 disclosure-хоста, `NavigationContainer` + `RootNavigator`).
- **Флаги (все локальные константы, по умолчанию `false`/`true`):**
  - `App.tsx:55` `NUCLEAR_DISABLE_GOOGLE_NATIVE_CALLS = false` — Google Sign-In **включён**
  - `App.tsx:172` `ENABLE_BACKGROUND_TRACKING = true` — фоновая геолокация **включена** (комментарий: «Emergency switch: … investigating AppOps MONITOR_LOCATION crashes»)
  - `Dashboard/index.tsx` `DASHBOARD_ISOLATION_MODE = false`, `NUCLEAR_DISABLE_NATIVE_MAPS = false`, `NUCLEAR_DISABLE_GOOGLE_LOCATION_CALLS = false` — GPS и карта **активны**

### 4.2 Навигация
- `src/navigation/RootNavigator.tsx` — stack: `Tabs`, `Paywall` (modal), `NavigationSettings`, `Permissions`; кастомная interpol-анимация.
- `src/navigation/AppTabs.tsx` — 5 табов (Feather icons, haptic, badge = кол-во доступных офферов): **Dashboard** (карта), **OrderHub**, **ShiftMode**, **Earnings**, **Profile**.
- `navigationRef.ts` — глобальный ref для навигации вне компонентов.
- `navigationGeometry.ts` / `navigationFormatting.ts` — геометрия (haversine, расстояние до манёвра, сглаживание heading, трим полилинии) и форматирование.

### 4.3 Экраны (`src/screens/`)
| Экран | Файл | Назначение |
|---|---|---|
| Welcome | `Welcome/index.tsx` | Сплэш ценности, `hasSeenWelcome` |
| Onboarding | `Onboarding/index.tsx` | 3 шага: роль (courier/taxi) → ценность → prominent disclosures (a11y+overlay) + ToS/Privacy |
| Login | `Login/index.tsx` | Google / email-link / гость («Sign in later») |
| Dashboard | `Dashboard/index.tsx` (1248 строк) | Карта + live-навигация: WazeDirectionCard, NavigationMapLayers, PlayerNavMarker, DashboardBottomSheet, оффер-карточка, goal ring |
| DashboardMap | `Dashboard/DashboardMap.tsx` | Обёртка react-native-maps |
| OrderHub | `OrderHub/index.tsx` | Live-офферы, accept-flow (haptic → ingestToOrder → deep-link в приложение платформы → pendingConfirmation modal → confirmOrder/reject), история, WeekCalendar |
| ShiftMode | `ShiftMode/index.tsx` | Старт/стоп смены (a11y disclosure), таймер, платформы, goal 300/400 PLN, статистика |
| Earnings | `Earnings/index.tsx` | Статистика, кошелёк, календарь, карта архивной смены |
| Profile | `Profile/index.tsx` | Hub аккаунта: online-переключатель, роль, тема, язык, Permissions/NavigationSettings, админ-сидер, sign out, delete account, юридические ссылки |
| Permissions | `Settings/PermissionsScreen.tsx` | Аудит разрешений (runtime, overlay, a11y, usage stats, notification listener) |
| NavigationSettings | `NavigationSettings/index.tsx` | marker style (classic/arrow3d/car), map appearance, units, avoidTolls, trafficAware, directionsMode, язык |
| Paywall | `PaywallScreen/index.tsx` | Оформление подписки: CTA «Start 7-day free trial» / «Subscribe — 8.99 PLN/week» (зависит от `freeTrialAvailable`), badge «7 days free», pending-состояние оплаты |

Отдельного экрана «Notifications» нет — управление уведомлениями в PermissionsScreen; «Settings»-строки живут внутри Profile.

### 4.4 Zustand-сторы (`src/store/`, все persist в AsyncStorage)
| Стор | Ключ persist | Ключевое состояние |
|---|---|---|
| `authStore` | `drivemind-auth` | userEmail, firebaseUid, publicId, deviceFingerprint, completedOrdersCount, isSubscribed, trialEndsAt, subscriptionEndsAt, remainingTrips (default 15), paywallMode, isPaywallBlocked, isSearchBlocked, guestOrderCount, isGuestBlocked; `GUEST_EMAIL='guest@drivemind.local'`; `signOut` сохраняет fingerprint+guest-счётчики |
| `ordersStore` | `drivemind-orders-v2` | activeOrders, pendingConfirmation, orderHistory (cap 50), shiftStats (totalEarnings/Km/Minutes, startTime, completedOrders), dailyGoal (500), isNavigating, deliveryPhase (IDLE/EN_ROUTE_TO_PICKUP/AT_PICKUP/EN_ROUTE_TO_DROPOFF/COMPLETED), routePolyline/steps; `completeOrder` → payout в wallet + звук + `notifyOrderCompletedForUser` |
| `driverIngestStore` | `drivemind-driver-ingest` (только soundEnabled) | activeRide (single), backgroundOrders, TTL 180 с; селекторы `useAvailableIngestOffers` |
| `driverSessionStore` | `drivemind-driver-session` | driverId (`dm-…`), isOnline, accessibilityConsentGiven |
| `walletStore` | `drivemind-wallet` | totalBalance, transactions (cap 200), `recordOrderPayout` (идемпотентно по orderId) |
| `navigationSettingsStore` | `drivemind-navigation-settings` | directionsMode, markerStyle, mapAppearance, units, avoidTolls, trafficAware, navMuted, mapPerspective3d |
| `roleStore` | `drivemind-role` | role (courier/taxi), vehicleType (bike/moped/car), fuelConsumption, onboardingComplete, selectedServices |
| `languageStore` | `drivemind-language` | язык (init из `detectDeviceLanguage()`), `cycleDriveMindLanguage` |
| `themeStore` | `drivemind-theme` | system/dark/light, `toggleTheme` |
| `shiftBreadcrumbStore` | `drivemind-shift-breadcrumbs` | breadcrumbs (max 25k, мин. дистанция 10 м), lastArchivedShift (Douglas-Peucker simplify) |
| `permissionOnboardingStore` | `drivemind-permission-onboarding` | permissionsShownCount, appOpenCount, `MAX_PERMISSION_AUTO_PROMPTS = 3` |
| `welcomeStore` / `userStore` | `drivemind-welcome` / `drivemind-user` | hasSeenWelcome; displayName (почти не используется) |
| `socketConnectionStore` | не persist | статус socket |
| disclosure-сторы | смешанно | accessibilityDisclosureStore, a11yServiceDisclosureStore (`drivemind-a11y-service-disclosure`), backgroundLocationDisclosureStore (`drivemind-bg-location-disclosure`) — Google Play prominent disclosure |

### 4.5 Сервисы (`src/services/`)
- **`driverIngestBridge.ts`** — ядро перехвата заказов. Хук `useDriverIngestBridge(enabled)` к `NativeModules.DriveMindNative` (Kotlin). Слушает события `DriveMindNotification`, `onOrderScraped`, `onOrderAccepted`, `onOrderCompleted`, `DriveMindOverlayAccept/Dismiss`. Парсит цену/дистанцию/ETA через `orderScrapeNormalize`, считает `computeProfitability`, пушит overlay, авто-стартует смену на первом оффере, дедуп по content hash, синк буфера уведомлений.
- **`subscriptionGate.ts`** — `deriveSearchBlockedFromStore()` (гость: `guestOrderCount >= 2`; юзер: `isSearchBlocked`), `syncOrderParsingGate(user?)` (native `setOrderParsingEnabled` + overlay hide), событие `EVENT_OPEN_PAYWALL`.
- **`userFirestoreService.ts`** — Firestore `users/{uid}`: `WELCOME_TRIPS_LIMIT = 15`, `GUEST_ORDER_THRESHOLD = 2`, `TRIAL_DURATION_MS = 7d`; `evaluatePaywallState` (mode: none/onboarding/expired), `notifyOrderCompletedForUser` (push на 15-м заказе `sendTrialExhaustedNotification`), `notifyGuestOrderCompleted` (инкремент + paywall на пороге).
- **`deviceFingerprint.ts` / `deviceFingerprintFirestore.ts`** — анти-абьюз: fingerprint устройства (SecureStore `dm_device_fp_v1`), Firestore `device_fingerprints/{fp}`, `linkUidToDevice`, `isDeviceLinkedToOtherUid` (fail-closed).
- **`firebaseAuth.ts`** — Google → Firebase credential → fingerprint-проверка → `syncUserSession`; `deleteUserAccount` (обработка `auth/requires-recent-login`).
- **`emailLinkAuth.ts`** — см. §7.
- **`googleAuth.ts`** — конфигурация/логин Google Sign-In, discriminated result.
- **`socketService.ts`** — socket.io-client: `initSocket({driverId, onNewOrder})`, `emitOrderAccepted`, `emitDriverLocation` (очередь 1 сэмпла офлайн, flush при реконнекте), URL из `EXPO_PUBLIC_BACKEND_URL`.
- **`navigationEngine.ts`** — singleton: фильтр эмита локации (≥5 м / ≥10°), heartbeat 60 с; refresh маршрута (debounce 450 мс, min interval 1600 мс, min delta 0.08 км).
- **`directionsService.ts`** — `getDirections`: предпочитает `EXPO_PUBLIC_DIRECTIONS_PROXY_URL` POST, иначе Google Routes API v2 (`computeRoutes`, TRAFFIC_AWARE, field mask, avoidTolls); `decodePolyline`, `reverseGeocode`.
- **`locationTrackingService.ts` + `tasks/locationTrackingTask.ts`** — фоновая геолокация (TaskManager `LOCATION_TRACKING_TASK`), фиксы accuracy ≤50 м → `shiftBreadcrumbStore.addBreadcrumb` (только при активной смене).
- **`permissionManager.ts` / `permissionColdStart.ts`** — аудит разрешений (read-only), cold-start модалка (макс. 3 раза), `onReturnedFromSystemSettings`.
- **`accessibilityDisclosure.ts` / `backgroundLocationDisclosure.ts` / `disclosureCoordinator.ts`** — Google Play prominent disclosure gate.
- **`notificationListener.ts`** — RN-слой над NotificationListenerService; `localNotifications.ts` — `sendTrialExhaustedNotification` / `sendTrialExpiredNotification` (data.screen: 'Paywall').
- **`orderScrapeNormalize.ts`** — мультиязычные парсеры (PL/UA/RU/EN): `parsePlnAmountFromText`, `parseDistanceKmFromText`, `parseEtaMinutesForPackage` (Bolt суммирует два минуты-токена), `isValidOrderBlob`.
- **`overlayFromIngest.ts`** — push/refresh оффера в нативный overlay.
- **`analyticsService.ts`** — `computeDateRangeStats` → earnings/km/count/PLN-на-км/PLN-в-час.
- **`adminSeeder.ts`** — QA-сид 10 заказов Кракова (`EXPO_PUBLIC_ADMIN_EMAILS`/`_PUBLIC_IDS`).
- **`config/firebase.ts`** — ленивые синглтоны firebase, region `europe-central2`, эмулятор при `EXPO_PUBLIC_USE_FUNCTIONS_EMULATOR=1`, persistence через AsyncStorage.

### 4.6 Нативные Android-интеграции (Kotlin, `mobile/android/app/src/main/java/com/guessxx/drivemind/`)
| Файл | Назначение |
|---|---|
| `MainApplication.kt` | `MapsInitializer.initialize(..., Renderer.LEGACY)` — кастомные JSON-стили карты работают только в LEGACY |
| `DriveMindPackage.kt` / `DriveMindNativeModule.kt` | React Native module `DriveMindNative`: звук, буфер уведомлений, расширение окна скрейпера, диагностика, deep-links в системные настройки |
| `DriveMindNotificationService.kt` | NotificationListenerService: только `com.ubercab.driver` / `com.bolt.driver`; буфер при офлайне или эмит `DriveMindNotification` |
| `DriveMindScraperService.kt` | AccessibilityService: поллинг 500 мс в окне скана (10 с), regex-извлечение цены/суржа/адреса из AccessibilityNodeInfo, эмит `DriveMindScrape` |
| `DriveMindScraperState.kt` | Атомарное 10-сек окно скана (продлевается событиями) |
| `DriveMindReactBridge.kt` | Emit событий из фоновых сервисов |
| `NotificationBufferPrefs.kt`, `DriveMindSound.kt` | Буфер + звуковой клик |

Манифест: `SYSTEM_ALERT_WINDOW`, `PACKAGE_USAGE_STATS`, foreground service (location), notification listener, accessibility, `POST_NOTIFICATIONS`, локация. Конфиг-плагин `mobile/plugins/withDriveMindNative.js` (v2.6.0) патчит манифест, генерит `accessibility_service_config.xml`, пишет `google-services.json` из env, добавляет Gradle-зависимости, переключает на `proguard-android-optimize.txt`, патчит релизную подпись через `keystore.properties` (падает, если нет).

---

## 5. Бизнес-логика: движок прибыльности

**Источник истины:** `packages/shared/src/profitability.ts` — `computeProfitability(input): ProfitabilityOutput`. Детерминированный («no ML»), настройки под Краков 2026.

### Пороги тиров (эффективный **брутто** PLN/км, роль-зависимые — НЕДАВНЕЕ ИЗМЕНЕНИЕ)
| Тиер | Курьер | Такси |
|---|---|---|
| EXCELLENT 🟢 | ≥ 4.50 zł/km | ≥ 3.50 zł/km |
| GOOD_DEAL 🟡 | 3.00–4.49 | 2.20–3.49 |
| STANDARD ⚪ | 1.80–2.99 | 1.60–2.19 |
| LOW_YIELD 🔴 | < 1.80 | < 1.60 |

### Правила
- `grossPlnPerKm = pricePLN / distanceKm` (опц. `demandFactor` — будущий тюнинг).
- **Загородный штраф**: substring-матч dropoffLabel против списка (Wieliczka, Skawina, Niepołomice, Krzeszowice, Myślenice и др.) → `effectivePricePLN = pricePLN * 0.70`. **Исключение (недавнее): Краков-Балице** (`balice` / `lotnisko` / `airport`) — нет штрафа (высокая вероятность rematch).
- `etaMin` эффективный = `max(1, etaMin * trafficFactor)` — трафик снижает PLN/мин и PLN/час.
- Пиковые часы (mobile `profitEngine.ts`): `trafficFactor = 1.15` в [12,14) и [18,21); дистанция = `order.distanceKm + order.deadrunKm`.
- `isWeekendOrNight` (сб/вс или 22:00–06:00) — принят, пока не влияет на цену.
- **Legacy score 0–100**: ролевые цели по PLN/час и PLN/км; штраф времени: курьер — долгий ETA (>22 мин), такси — короткий (<10 мин); zone penalty −15.
- `recommendation`: EXCELLENT/GOOD_DEAL/STANDARD → `TAKE`, LOW_YIELD → `SKIP`.
- Потребители: `mobile/src/engine/profitEngine.ts` (UI-бейджи), `driverIngestBridge` (overlay), `backend/src/index.ts` (сортировка mock-заказов).

---

## 6. Монетизация: подписка и paywall

### Воронка доступа
1. **Гость** («Sign in later»): до **2 заказов** (`GUEST_ORDER_THRESHOLD`), счётчик на устройстве + remote fingerprint. По достижении → paywall.
2. **Зарегистрированный пользователь**: `welcome_trips` (15 заказов, `WELCOME_TRIPS_LIMIT`), затем **7-дневный триал** (`TRIAL_DURATION_MS`).
3. **Подписка**: Google Play `drivemind_weekly_premium` (SKU из `EXPO_PUBLIC_SUBSCRIPTION_SKU` или `mobile/src/constants/subscription.ts`), **8.99 PLN/неделю**, оффер с 7-дневным триалом.

### `SubscriptionContext` (`mobile/src/context/SubscriptionContext.tsx`)
- `isPremium` — активная серверно-верифицированная подписка (`expiresAt > now`).
- `hasAppAccess` = premium ИЛИ валидный триал (`evaluatePaywallState`), гостям — всегда false.
- **react-native-iap**: `ensureIapConnection` (однократно на процесс, никогда не роняет boot), `loadAndroidSubscriptionProduct` с retry (обход бага пустого массива: полный disconnect + re-init + sleep 1500 мс), `pickOffer` — приоритет: (1) weekly-оффер с trial-фазой → (2) любой оффер с trial → (3) weekly → (4) первый. `freeTrialAvailable` вычисляется из pricing phases (`priceAmountMicros === 0`), копия на paywall «Start 7-day free trial» показывается **только** если продукт реально даёт триал.
- **PENDING-платежи** (BLIK): `PurchaseStateAndroid.PENDING` → серверная проверка, сообщение «Payment pending — complete BLIK authorization…».
- Верификация на сервере: `httpsCallable('verifySubscription')` → при `ok` → `finishTransaction({isConsumable: false})`.
- Firestore `users/{uid}` слушается `onSnapshot`, пишется в `authStore` (`setSubscription`) + `syncOrderParsingGate(user)` — гейт и на уровне рендера (paywall), и на уровне нативного скрейпера.

### Cloud Function `verifySubscription` (`functions/src/index.ts`)
- Callable, требует `request.auth.uid`; принимает `purchaseToken`, `subscriptionId` (default weekly), `packageName`.
- Google Play API v3 (`androidpublisher`), сервис-аккаунт из env `GOOGLE_PLAY_SERVICE_ACCOUNT_PATH` (файл gitignored).
- `deriveSubscriptionStatus`: `paymentState 0` → pending; {1,2} → active; grace/hold → expired («до подтверждения Google»).
- Пишет в `users/{uid}` **транзакцией** (merge, «never wipe unrelated user fields»): `subscription{status, subscriptionId, purchaseToken, lastVerified, paymentState, autoRenewing, expiresAt?}`, `isSubscribed`, `subscriptionEndsAt`. Возвращает `{ok, status, expiresAtMs, ...}`.

### PaywallScreen
- Полноэкранный модал, гейтится в `AuthenticatedAppShell` (`!hasAppAccess` → рендер paywall) и через событие `EVENT_OPEN_PAYWALL`.
- CTA зависит от `freeTrialAvailable`: «Start 7-day free trial» / «Subscribe — 8.99 PLN / week», badge «7 days free», pending-экран оплаты.
- i18n-ключи: `paywall_checkout_cta_trial`, `paywall_trial_badge`, `paywall_trial_after` (добавлены в **незакоммиченных** изменениях).

---

## 7. Аутентификация

- **Google Sign-In**: `signInWithGoogleAndEnsureUser()` — Google → Firebase credential → fingerprint-анти-абьюз (`isDeviceLinkedToOtherUid`/`linkUidToDevice`) → `syncUserSession` (Firestore) → `syncOrderParsingGate`. Конфиг через `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, offlineAccess=false.
- **Email-link (passwordless)**: `emailLinkAuth.ts` — `sendSignInLinkToEmail` с action code settings (Android package `com.guessxx.drivemind`, deep link `https://drivemind-d4994.firebaseapp.com/login`, `handleCodeInApp: true`), email в AsyncStorage (`drivemind_email_for_signin`). Обработка deep-link в `App.tsx`. **Язык письма** = язык интерфейса (`resolveFirebaseAuthLanguage`, только en/pl/ru/uk, иначе en) — недавнее изменение. После входа: fingerprint-проверка, `syncUserSession`, paywall-состояние (`isAbuse` → mode 'expired').
- **Гость**: кнопка «Sign in later» → `authStore.setUser` с `guest@drivemind.local` + форс роли/онбординга.
- **Выход/удаление**: `signOutFirebase`, `deleteUserAccount` (требует свежего логина).
- Ошибки: `authErrorMessages.ts` — коды Firebase → i18n-ключи.

---

## 8. Локализация (i18n)

- `src/i18n/index.ts`: i18next, `compatibilityJSON: 'v4'`, fallback `en`, `supportedLngs: ['en','pl','uk','ru']`, `parseMissingKeyHandler` → en-значение.
- Локали: `locales/{en,pl,ru,uk}.json` (~430 строк каждый, **en — источник истины**; `scripts/validate-locales.mjs` проверяет идентичность ключей).
- `detectDeviceLanguage()`: `expo-localization` → первый совпадающий код из `['en','ru','pl','uk']` → иначе `en` (недавнее изменение — теперь список зеркалит полный набор UI-языков).
- Хранение: `languageStore` (persist `drivemind-language`), переключение из Profile и NavigationSettings (`cycleDriveMindLanguage`).
- Мультиязычность также в парсерах офферов (`orderScrapeNormalize`) и зеркально в Kotlin-скрейпере.

---

## 9. Бэкенд (Express MVP) — `backend/src/index.ts`

- **Все состояние in-memory** (комментарий: `// In-memory MVP state (replace with Postgres later)`); `pg` + `DATABASE_URL` уже подготовлены, Postgres 16 в docker-compose.
- Эндпоинты:
  - `GET /health`
  - `GET /v1/dashboard?role=`, `GET/POST /v1/services` (toggles uber/bolt/glovo/wolt)
  - `GET /v1/orders?role=&sort=` (mock-заказы + `computeProfitability`, сортировка по `profit_hour`/`distance`)
  - `POST /v1/orders/:id/accept?role=`, `GET/POST /v1/shift[/start|end]`
  - `GET /v1/analytics?role=` (хардкод-неделя Кракова, рекомендации bestTime 18:00–22:00, зоны Old Town/Kazimierz/Rondo Mogilskie)
- Mock-заказы: `src/mock/orders.ts` — 4 краковских заказа с реальными координатами.
- Клиент-мобайл шлёт сокеты (`socket.io`) и REST на `EXPO_PUBLIC_BACKEND_URL` — в продакшене backend не обязателен (данные от скрейпера).

---

## 10. Firebase

| Продукт | Использование |
|---|---|
| **Auth** | Google Sign-In, email-link (passwordless), эмулятор-поддержка |
| **Firestore** | `users/{uid}` (воронка: completedOrdersCount, trialEndsAt, isSubscribed, subscription{...}, publicId, deviceFingerprint), `device_fingerprints/{fp}`, `seeded_orders` (QA); Security Rules не в репо |
| **Cloud Functions** | `verifySubscription` (см. §6), region `europe-central2` |
| **Data Connect** | `mobile/dataconnect/` — Cloud SQL Postgres `fdcdb`, тип `User` (id, createdAt, isSubscribed, trialEndsAt), connector `default` → SDK `@drivemind/dataconnect`. **LEGACY**: `src/dataconnect/userOperations.ts` не используется основным auth-флоу (дублирование состояния триала с Firestore — известное расхождение) |
| **Hosting** | `hosting-public/` — страница «Open this link on your phone…» для email-link; `firebase.json` настраивает `/.well-known/assetlinks.json` (файл не закоммичен) |
| **Эмулятор** | `EXPO_PUBLIC_USE_FUNCTIONS_EMULATOR=1` |

Проект: `drivemind-d4994` (`.firebaserc`).

---

## 11. Инфраструктура, сборка, инструменты

- **EAS**: `eas.json` (root) — `appVersionSource: remote`, workingDirectory `mobile`; профили development/preview/production. `mobile/eas.json` — preview → APK, production → AAB (bundle). EAS projectId `0e7f5b9f-e8df-4452-9734-a1389b746d94`.
- **app.config.js**: env → конфиг при prebuild: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` → android/ios Maps keys + `extra`; `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` → google-signin plugin; `EXPO_PUBLIC_FIREBASE_*` → `extra.firebase`; `EXPO_PUBLIC_BACKEND_URL` → `extra.backendUrl`. **Важно: NODE_ENV должен быть production для загрузки `.env.production`** (EAS-профили ставят).
- **metro.config.js** (root → mobile): monorepo-корень, IPv4 `127.0.0.1`, Windows watcher health check; postinstall-патч `patch-metro-multipart.js` отключает Metro multipart (фикс OkHttp ProtocolException / белого экрана на Windows-эмуляторе).
- **R8/proguard**: `proguard-rules.pro` + верификация (`verify-r8-config.js`); minify для release; ресурс-стриппинг за флагом (прошлые проблемы R8).
- **Подпись**: `keystore.properties` (gitignored), `@guessxx__drivemind.jks` бэкапы ключей; `verify-upload-keystore.ps1` сверяет SHA1 с известными отпечатками.
- **Docker**: Postgres 16 для будущего бэкенда.
- **Скрипты dev**: `dev-fresh.ps1` (`npm run start:dev`), `dev:rebuild` (после нативных изменений), `dev.bat`; релиз: `build-aab-fresh.ps1` (включая пересборку `@drivemind/shared`), `android:release`, `android:bundle:release`.
- **Git**: ветка `DriveMind`, `.githooks/commit-msg` вырезает Cursor-трейлеры; pre-push `security-preflight.ps1` — скан секретов; `scripts/secret-replacements.txt` — маппинг реальных ключей → REDACTED.

---

## 12. Текущее состояние: НЕЗАКОММИЧЕННЫЕ ИЗМЕНЕНИЯ (на 14.08.2026)

9 файлов изменены, не закоммичены:

| Файл | Суть |
|---|---|
| `mobile/src/context/SubscriptionContext.tsx` | (+98) Переработка IAP-слоя: `pickOffer` с приоритетом trial-оффера, `freeTrialAvailable`, retry `getSubscriptions` (пустой массив → полный reset соединения), PENDING (BLIK) обработка, `verifyingTokensRef` дедуп, сообщения об ошибках покупки |
| `mobile/src/screens/PaywallScreen/index.tsx` | (+280/−) Копия с учётом триала («Start 7-day free trial», badge «7 days free», «then 8.99 PLN/week»), pending-экран |
| `mobile/src/services/emailLinkAuth.ts` | Язык письма = язык UI (`resolveFirebaseAuthLanguage`) |
| `mobile/src/i18n/detectDeviceLanguage.ts` | `AUTO_DETECT_LANGUAGES = ['en','ru','pl','uk']` — полный набор UI-языков |
| `mobile/src/i18n/locales/{en,pl,ru,uk}.json` | Новые paywall-ключи триала; `premiumBadge` → «DRIVEMIND PREMIUM» (убер. эмодзи) |
| `packages/shared/src/profitability.ts` | **Роль-зависимые пороги тиров** (курьер 4.50/3.00/1.80; такси 3.50/2.20/1.60 — STANDARD такси 1.60 вместо 1.50); **исключение Kraków-Balice Airport** из загородного штрафа |

---

## 13. Технический долг и известные проблемы

1. **Data Connect дублирует Firestore** по триалу/подписке — легаси-код `src/dataconnect/*` не используется основным флоу.
2. **Бэкенд in-memory** — Postgres готов (docker-compose, `pg`, `DATABASE_URL`), миграция отложена.
3. **AppOps MONITOR_LOCATION crash** в релизах — фоновая геолокация за kill-switch `ENABLE_BACKGROUND_TRACKING` (сейчас включена; комментарии «investigating»).
4. **Overlay-методы в native-модуле**: TS-мост (`driverIngestBridge`) ожидает методы overlay (`requestOverlayPermission`, `setOverlayShiftActive`, `updateOverlayProfitability` и др.) — в Kotlin реализованы не все (проверить актуальное состояние `DriveMindNativeModule.kt`).
5. **Web-поддержка частичная**: MapViewWeb-стаб, localStorage, нет Google Sign-In на web.
6. **Мёртвый/депрекейтед код**: `recordAcceptedTrip`, `requestAllPermissions`, `getTravelModeByVehicle`, `userStore.displayName` (не используется в Profile), `profitEngine.ts` (ingest-пути зовут `computeProfitability` напрямую).
7. **Секреты**: .env, jks, google-services.json, service-account, eas.json — gitignored; `security-preflight.ps1` при пре-пуше. Внимание: в `mobile/` лежат бэкапы `@guessxx__drivemind*.jks` (не в git).
8. **TODO/FIXME в коде**: не найдены (стиль проекта — комментарии-«NUCLEAR»-флаги и пояснения).

---

## 14. Быстрый старт для ИИ-ассистента

```bash
npm install                       # postinstall патчит Metro multipart
cp mobile/.env.example mobile/.env  # + заполнить ключи (Maps, Firebase, Google)
npm run dev                       # Expo (mobile)
npm run build:shared              # пересборка @drivemind/shared
npm run lint                      # eslint (mobile)
docker compose -f infra/docker-compose.yml up -d   # Postgres (опционально)
```

- **Dev-флоу Android**: `npm run start:dev`, приложение открывать с эмулятора (не жать `a`), `r` в Metro для JS-изменений, `dev:rebuild` после нативных.
- **Локали**: после правки `en.json` — `node mobile/scripts/validate-locales.mjs`.
- **Проверка подписок**: Play Console → Monetize → Subscriptions (`drivemind_weekly_premium`, оффер с P1W trial); серверный ключ — сервис-аккаунт `functions/service-account-google-play.json`.

---

## 15. Ключевые архитектурные принципы (важно для изменений)

- **Бизнес-логика только в `packages/shared`** — не дублировать расчёты в mobile/backend.
- **Воронка доступа**: все гейты идут через `hasAppAccess` (SubscriptionContext) + `syncOrderParsingGate` (native-уровень) — менять обе точки согласованно.
- **Native-мост — источник данных перехвата**: JS-обёртки тонкие; статусы/разрешения читать через native `getServiceStatuses()`/`isBridgeActive()`.
- **Paywall-копия не должна обещать триал, которого нет**: `freeTrialAvailable` приходит из реальных pricing phases Google Play.
- **Firestore-транзакции** в Cloud Function — merge, никогда не затирать поля воронки.
- **Секреты никогда в git**; env через `app.config.js` → EAS Secrets.
- **Языки**: 4 локали, ключи синхронны, en — источник истины; парсеры офферов мультиязычны на JS и Kotlin.

---

*Конец аудита. Сгенерирован автоматически по состоянию репозитория 14.08.2026.*
