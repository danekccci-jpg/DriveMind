# Android native release checklist (DriveMind)

The customized Kotlin services live under `mobile/android/` locally but that folder is **gitignored**. EAS Build runs `expo prebuild`, which regenerates `android/` from templates. Use this checklist so production `.aab` builds include DriveMind ingest code.

## Source of truth

| Path | Contents |
|------|----------|
| `mobile/drivemind-native/java/com/guessxx/drivemind/*.kt` | All DriveMind Kotlin modules |
| `mobile/drivemind-native/res/xml/accessibility_service_config.xml` | Accessibility package whitelist |
| `mobile/drivemind-native/AndroidManifest.frag.xml` | Services, `PACKAGE_USAGE_STATS`, driver `<queries>` |
| `mobile/drivemind-native/proguard-rules.pro` | R8 keep rules for native services |

After editing Kotlin locally under `mobile/android/...`, sync back into `drivemind-native/`:

```powershell
Copy-Item mobile\android\app\src\main\java\com\guessxx\drivemind\*.kt mobile\drivemind-native\java\com\guessxx\drivemind\ -Force
Copy-Item mobile\android\app\src\main\res\xml\accessibility_service_config.xml mobile\drivemind-native\res\xml\ -Force
```

## Expo config plugin

`mobile/app.json` includes `./plugins/withDriveMindNative` (v2.0.0). On **prebuild** / **EAS Build**, the plugin:

1. Merges manifest entries via `withAndroidManifest` (`DriveMindScraperService`, `DriveMindNotificationService`, queries, usage stats permission)
2. Copies Kotlin + `accessibility_service_config.xml` + strings
3. Appends ProGuard keep rules
4. **Fails the build** if `AndroidManifest.xml` is missing required service entries

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

## Google Play Console — Accessibility API declaration

DriveMind is **not** an accessibility tool (`isAccessibilityTool` is not set / defaults to `false`). Before internal testing users can enable the service, complete:

1. **Play Console → App content → Sensitive app permissions** (or **Policy → App content**)
2. Open **Accessibility API** / **Accessibility Services** declaration
3. Declare app as **not** primarily for users with disabilities
4. Explain use case: read-only screen parsing of driver-app order UI (Uber/Bolt/Glovo/Wolt) for local profitability display; no automation, no ads, no external storage of scraped content
5. Attach **prominent disclosure video** showing in-app onboarding (`onboarding_disclosure_a11y_desc`) before the user is sent to system settings
6. Wait for **approval** — without it, Android 13+ may show a **gray disabled toggle** with no “Allow restricted settings” menu on Play-distributed builds

Reference: [Use of the AccessibilityService API](https://support.google.com/googleplay/android-developer/answer/10964491)

## EAS Build steps

1. Set `NODE_ENV=production` so `app.config.js` loads production env keys.
2. Run EAS with a profile that executes prebuild (default for managed workflow).
3. Confirm the build log shows the `with-drivemind-native` plugin (v2.0.0).
4. Verify the artifact manifest still lists:
   - `DriveMindNotificationService`
   - `DriveMindScraperService`
   - `SYSTEM_ALERT_WINDOW` / usage access as required

## Local release APK

```powershell
cd mobile
$env:NODE_ENV = "production"
npx expo prebuild --platform android
cd android
.\gradlew assembleRelease
```

Release builds use **R8 minify** (`minifyEnabled true` in `app/build.gradle`). ProGuard keeps for DriveMind services are merged from `drivemind-native/proguard-rules.pro`.

## Post-change smoke test (device)

1. Grant notification listener, accessibility, overlay, and usage access.
2. Tap accessibility in Permissions — app opens **DriveMind service detail** screen (not generic list).
3. Open Uber Driver / Bolt / Bolt Food / Glovo Courier — radar overlay label matches app language.
4. Accept an offer — single toast, single `activeRide`, tier overlay in PL/UA/RU/EN.
5. Switch to Google Maps — overlay hides, no sustained CPU from scraper ticks.
6. Airplane mode → 50+ notifications → relaunch — buffer capped, no ANR on buffer read.
