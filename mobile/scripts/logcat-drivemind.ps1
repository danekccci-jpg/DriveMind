# Tail DriveMind native + JS logs via adb (no PATH setup required).

$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"

if (-not (Test-Path $adb)) {

    Write-Error "adb not found at $adb — install Android SDK Platform-Tools."

    exit 1

}



$listener = "com.guessxx.drivemind/com.guessxx.drivemind.DriveMindNotificationService"



Write-Host "Devices:" -ForegroundColor Cyan

& $adb devices



Write-Host ""

Write-Host "Binding NotificationListener (required on API 30+)..." -ForegroundColor Cyan

& $adb shell cmd notification allow_listener $listener 2>&1 | Out-Null



Write-Host "Tailing DriveMind tags (Ctrl+C to stop)..." -ForegroundColor Cyan

Write-Host @"



IMPORTANT: Do NOT filter by package name only — native logs use TAGs, not com.guessxx.drivemind.



Checklist:

  1. allow_listener ran above (Settings toggle alone is NOT enough on API 30+)

  2. Restart DriveMind after enabling Notification access

  3. Enable Order Reader (Accessibility) in Profile -> System permissions

  4. Post a NEW notification from mock app (old ones do not replay)



Expected log lines when healthy:

  I DriveMindScraper: NotificationListener connected

  D DriveMindScraper: onNotificationPosted pkg=...

  E DriveMindScraper: Route success: Brand=...

  (no W DriveMindBridge: emitImmediate(...) dropped)



Test push:

  adb shell cmd notification post -S bigtext -t "Uber test" tag "45.50 zł 8.2 km 12 min" com.ubercab.driver



"@ -ForegroundColor DarkGray



& $adb logcat -c

& $adb logcat -s `

  DriveMindScraper:I `

  DriveMindScraper:D `

  DriveMindScraper:W `

  DriveMindScraper:E `

  DriveMindBridge:W `

  DriveMindBridge:E `

  DriveMindNative:W `

  DriveMindNative:E `

  DriveMindApp:W `

  DriveMindApp:E `

  ReactNativeJS:W `

  ReactNativeJS:E `

  AndroidRuntime:E `

  ExpoLocation:W `

  ExpoLocation:E

