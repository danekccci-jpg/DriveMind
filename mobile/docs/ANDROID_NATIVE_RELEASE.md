# Android native release checklist (DriveMind)

Custom Kotlin services, accessibility XML, and ProGuard rules live under `mobile/android/`.
EAS Build runs `expo prebuild`, which regenerates most of `android/` from templates — the
`withDriveMindNative` config plugin re-applies manifest entries, Gradle deps, and signing.

## Source of truth

| Path | Contents |
|------|----------|
| `mobile/android/app/src/main/java/com/guessxx/drivemind/*.kt` | All DriveMind Kotlin modules |
| `mobile/android/app/src/main/res/xml/accessibility_service_config.xml` | Accessibility package whitelist |
| `mobile/android/app/proguard-rules.pro` | R8 keep rules for native services |
| `mobile/assets/logo/logo-symbol-light.png` | Adaptive icon foreground — light/day |
| `mobile/assets/logo/logo-symbol-dark.png` | Adaptive icon foreground — night/dark |

Edit Kotlin and XML directly under `mobile/android/` — there is no separate native source folder.

## Expo config plugins

`mobile/app.json` includes two DriveMind plugins that run on every `expo prebuild` and every EAS Build:

### `./plugins/withDriveMindNative` (v2.1.0)

1. Merges manifest entries via `withAndroidManifest` (`DriveMindScraperService`, `DriveMindNotificationService`, queries, usage stats permission)
2. Ensures `accessibility_service_description` in `res/values/strings.xml`
3. **Pins `android.enableMinifyInReleaseBuilds=false` and `android.enableR8.fullMode=false`** in `android/gradle.properties` (see Minification section below)
4. **Wires release signing** via `android/keystore.properties` (Play upload key — fails `bundleRelease` if missing)
5. **Fails the build** if `AndroidManifest.xml` is missing required service entries

### `./plugins/withDriveMindIcons` (v1.0.0)

Regenerates all Android adaptive launcher icon mipmaps automatically from the committed
source PNGs — **no manual `npm run icons:android` step needed before a release build**.

Outputs written to `android/app/src/main/res/`:
- `mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_foreground.png` (adaptive layer)
- `mipmap-{density}/ic_launcher.png` and `ic_launcher_round.png` (legacy fallbacks)
- `mipmap-night-{density}/…` (night/dark-mode variants)
- `values/colors.xml` — `iconBackground` set to `#F5F5F7`
- `values-night/colors.xml` — `iconBackground` set to `#08101C`

The plugin requires `sharp` (devDependency). EAS Build installs devDependencies by default;
the plugin logs a warning and skips gracefully if `sharp` is unavailable.

## Minification (R8)

**Current state: `android.enableMinifyInReleaseBuilds=false`**

This is explicitly pinned by `withDriveMindNative → patchGradleProperties()` on every prebuild.
Several Expo native modules use runtime reflection patterns that R8 full mode strips even with
`-keep` rules, causing hard-to-reproduce crashes on device (observed with Firebase and Google
Maps SDK in mixed managed/bare workflow).

**ProGuard keeps** in `mobile/android/app/proguard-rules.pro` are kept comprehensive so the flag
can be flipped to `true` without extra work once validation is complete:

- `com.guessxx.drivemind.**` (all fields, methods, names)
- All individual DriveMind service classes (belt-and-suspenders)
- `android.accessibilityservice.AccessibilityService` subclasses
- `android.app.Service` subclasses
- `NotificationListenerService` subclasses
- React Native bridge reflection (`ReactPackage`, `NativeModule`, `@ReactMethod`)
- Kotlin metadata and runtime
- `androidx.dynamicanimation.**` (overlay spring animation)
- Firebase / Google Play Services (with `-dontwarn`)

**To re-enable minification when ready:**

1. In `withDriveMindNative.js → patchGradleProperties()`, change both values to `'true'`
2. Run `npm run android:release:fresh` locally
3. Smoke-test on device (grant all permissions, start a shift, confirm overlay works)
4. Inspect `.aab` with APK Analyzer for unexpected stripping

## Verify merged manifest (before Play upload)

From Play Console: **App bundle explorer → Downloads → Android manifest**.

Or locally after prebuild:

```powershell
cd mobile
$env:NODE_ENV = "production"
npx expo prebuild --platform android
Select-String -Path android\app\src\main\AndroidManifest.xml -Pattern "DriveMindScraperService|BIND_ACCESSIBILITY_SERVICE|accessibility_service_config"
```

Required tokens in the merged manifest:

- `DriveMindScraperService` with `android:exported="true"`
- `android.permission.BIND_ACCESSIBILITY_SERVICE`
- `meta-data` → `@xml/accessibility_service_config`
- `DriveMindNotificationService` with `BIND_NOTIFICATION_LISTENER_SERVICE`
- `<package android:name="com.ubercab.driver"/>` (and other driver packages)

## Verify icon generation

After prebuild, confirm the mipmap directories are populated:

```powershell
cd mobile
npx expo prebuild --platform android
Get-ChildItem android\app\src\main\res\mipmap-xxxhdpi | Select-Object Name
# Expected: ic_launcher.png, ic_launcher_foreground.png, ic_launcher_round.png
Get-ChildItem android\app\src\main\res\mipmap-night-xxxhdpi | Select-Object Name
# Expected: ic_launcher.png, ic_launcher_foreground.png, ic_launcher_round.png
```

If icons are wrong, update `mobile/assets/logo/logo-symbol-light.png` (day) or
`logo-symbol-dark.png` (night) and re-run prebuild — no manual script needed.

> **Manual override:** `npm run icons:android` still works if you need to regenerate icons
> into an already-prebuild `android/` folder without re-running full prebuild.

## Google Play Console — Accessibility API declaration

DriveMind is **not** an accessibility tool (`isAccessibilityTool` is not set / defaults to `false`). Before internal testing users can enable the service, complete:

1. **Play Console → App content → Sensitive app permissions** (or **Policy → App content**)
2. Open **Accessibility API** / **Accessibility Services** declaration
3. Declare app as **not** primarily for users with disabilities
4. Explain use case: read-only screen parsing of driver-app order UI (Uber/Bolt/Glovo/Wolt) for local profitability display; no automation, no ads, no external storage of scraped content
5. Attach **prominent disclosure video** showing in-app onboarding (`onboarding_disclosure_a11y_desc`) before the user is sent to system settings
6. Wait for **approval** — without it, Android 13+ may show a **gray disabled toggle** with no "Allow restricted settings" menu on Play-distributed builds

Reference: [Use of the AccessibilityService API](https://support.google.com/googleplay/android-developer/answer/10964491)

## EAS Build steps

1. Set `NODE_ENV=production` so `app.config.js` loads production env keys.
2. Run EAS with a profile that executes prebuild (default for managed workflow).
3. Confirm the build log shows:
   - `with-drivemind-native` plugin (v2.1.0)
   - `with-drivemind-icons` plugin (v1.0.0)
   - `[with-drivemind-icons] Done — adaptive icons written to android/app/src/main/res/`
   - `[with-drivemind-native] patched gradle.properties: minify=false, R8.fullMode=false`
4. Verify the artifact manifest still lists:
   - `DriveMindNotificationService`
   - `DriveMindScraperService`
   - `SYSTEM_ALERT_WINDOW` / usage access as required

## Play upload signing (local AAB)

Release builds must use the **Play upload key** (SHA-1 `7F:C9:1F:8A:…`), not `debug.keystore` (`5E:8F:16:06:…`).

1. Download keystore from EAS (~2 min, no cloud build):
   ```powershell
   cd mobile
   npx eas-cli credentials -p android
   ```
   → **production** → **Keystore** → **Download existing keystore**

2. Save as `mobile/android/app/upload-key.jks` (gitignored). In `keystore.properties` use `storeFile=upload-key.jks` (path is relative to `android/app/`).

3. Copy template and fill passwords:
   ```powershell
   Copy-Item docs\keystore.properties.example android\keystore.properties
   notepad android\keystore.properties
   ```

4. Verify SHA-1:
   ```powershell
   npm run android:verify-keystore
   ```

5. Build signed AAB:
   ```powershell
   npm run android:bundle:release
   ```
   Output: `android/app/build/outputs/bundle/release/app-release.aab`

Add the upload key SHA-1 to **Firebase → Project settings → Android app** so Google Sign-In works on Play builds.

## Local release APK

```powershell
cd mobile
$env:NODE_ENV = "production"
npx expo prebuild --platform android
npm run android:verify-keystore
cd android
.\gradlew assembleRelease
```

## Post-change smoke test (device)

1. Grant notification listener, accessibility, overlay, and usage access.
2. Tap accessibility in Permissions — app opens **DriveMind service detail** screen (not generic list).
3. Open Uber Driver / Bolt / Bolt Food / Glovo Courier — radar overlay label matches app language.
4. Accept an offer — single toast, single `activeRide`, tier overlay in PL/UA/RU/EN.
5. Switch to Google Maps — overlay hides, no sustained CPU from scraper ticks.
6. Airplane mode → 50+ notifications → relaunch — buffer capped, no ANR on buffer read.
