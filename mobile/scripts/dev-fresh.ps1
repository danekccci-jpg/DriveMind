# DriveMind - stable Metro dev session with Fast Refresh.
#
#   .\scripts\dev-fresh.ps1 -Start              # daily (keep Metro cache)
#   .\scripts\dev-fresh.ps1 -Start -Fresh       # clear Metro cache (HMR stuck)
#   .\scripts\dev-fresh.ps1 -Start -Rebuild     # native APK rebuild + Metro
#   .\scripts\dev-fresh.ps1 -CleanOnly          # wipe caches only
#
param(
  [switch]$Start,
  [switch]$Fresh,
  [switch]$Rebuild,
  [switch]$CleanOnly,
  [switch]$ResetApp
)

$ErrorActionPreference = 'Stop'

$MobileRoot = Split-Path $PSScriptRoot -Parent
$RepoRoot = Split-Path $MobileRoot -Parent
$Port = 8081
$PackageId = 'com.guessxx.drivemind'

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Adb([string[]]$AdbArgs) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  try {
    $output = & adb @AdbArgs 2>&1
    return @{ ExitCode = $LASTEXITCODE; Output = $output }
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Stop-ListenerOnPort([int]$ListenPort) {
  $connections = Get-NetTCPConnection -LocalPort $ListenPort -ErrorAction SilentlyContinue
  if (-not $connections) { return }
  $connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    if ($_ -le 0) { return }
    try {
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
      Write-Host "    stopped PID $_ on port $ListenPort"
    } catch {}
  }
}

function Remove-DirIfExists([string]$Path, [string]$Label) {
  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "    removed $Label"
  }
}

function Set-DevPackagerEnv {
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = '127.0.0.1'
  if ($env:OS -match 'Windows') {
    $env:CHOKIDAR_USEPOLLING = '1'
    $env:CHOKIDAR_INTERVAL = '300'
  }
}

function Test-EmulatorConnected {
  $result = Invoke-Adb @('devices')
  return ($result.Output -match 'device\s*$' -and $result.Output -notmatch 'emulator-\d+\s+offline')
}

function Ensure-AdbReverse {
  if (-not $adb) { return $false }
  $result = Invoke-Adb @('reverse', "tcp:$Port", "tcp:$Port")
  return $result.ExitCode -eq 0
}

function Clear-AppDevSettings {
  if (-not $adb) { return }
  $result = Invoke-Adb @('shell', 'pm', 'clear', $PackageId)
  if ($result.ExitCode -eq 0) {
    Write-Host "    cleared app data (removes stale dev-server URL)"
  } else {
    Write-Host "    skipped app data clear (app not installed or emulator busy)" -ForegroundColor Yellow
  }
}

function Test-MetroPatch {
  & node "$MobileRoot\scripts\patch-metro-multipart.js" --check
  if ($LASTEXITCODE -ne 0) {
    & node "$MobileRoot\scripts\patch-metro-multipart.js"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
}

Set-Location $MobileRoot
Set-DevPackagerEnv

$shouldClearCaches = $Fresh -or $CleanOnly -or $Rebuild

if ($Start -or $shouldClearCaches) {
  Write-Step "Stopping Metro (port $Port)"
  Stop-ListenerOnPort -ListenPort $Port
}

if ($shouldClearCaches -and (Test-Path "$MobileRoot\android\gradlew.bat")) {
  Push-Location "$MobileRoot\android"
  & .\gradlew.bat --stop 2>$null | Out-Null
  Pop-Location
  Write-Host "    gradlew --stop"
}

if ($Rebuild) {
  Write-Step "Clearing Android build artifacts (rebuild only)"
  node "$MobileRoot\scripts\clean-android-artifacts.js"
}

if ($shouldClearCaches) {
  Write-Step "Clearing Expo / Metro / RN caches"
  Remove-DirIfExists "$MobileRoot\.expo" ".expo/"
  Remove-DirIfExists "$MobileRoot\node_modules\.cache" "mobile/node_modules/.cache"
  Remove-DirIfExists "$RepoRoot\node_modules\.cache" "root node_modules/.cache"
  Remove-DirIfExists "$env:TEMP\metro-cache" "TEMP/metro-cache"
  Remove-DirIfExists "$env:LOCALAPPDATA\Temp\metro-cache" "LocalAppData/Temp/metro-cache"
}

Write-Step "Preflight (adb + Metro patch)"
$adb = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adb) {
  Write-Host "    WARNING: adb not in PATH - install Android platform-tools" -ForegroundColor Yellow
} elseif (-not (Test-EmulatorConnected)) {
  Write-Host "    WARNING: no emulator/device online - start the emulator before opening the app" -ForegroundColor Yellow
} else {
  if (Ensure-AdbReverse) {
    Write-Host "    adb reverse tcp:$Port tcp:$Port OK"
  } else {
    Write-Host "    adb reverse failed" -ForegroundColor Yellow
  }
}

Test-MetroPatch

if ($ResetApp -and $adb) {
  Write-Step "Removing app from device/emulator"
  Invoke-Adb @('uninstall', $PackageId) | Out-Null
  Write-Host "    uninstalled $PackageId (ignore message if not installed)"
}

if ($Rebuild -and $adb) {
  Write-Step "Resetting cached dev-server URL in app"
  Clear-AppDevSettings
}

if ($Start -or $Rebuild) {
  Write-Step "Verifying monorepo entry"
  node "$MobileRoot\scripts\verify-metro-entry.js"
}

if ($CleanOnly) {
  Write-Host ""
  Write-Host "Clean complete. Next: npm run start:dev" -ForegroundColor Green
  exit 0
}

if ($Rebuild) {
  Write-Step "Building debug APK (Gradle, no auto-launch)"
  Write-Host "    Takes 2-5 min. Open the app after Metro shows Waiting on localhost:8081." -ForegroundColor DarkGray
  Set-DevPackagerEnv
  Push-Location "$MobileRoot\android"
  & .\gradlew.bat assembleDebug
  $gradleExit = $LASTEXITCODE
  Pop-Location
  if ($gradleExit -ne 0) { exit $gradleExit }

  $apk = Join-Path $MobileRoot "android\app\build\outputs\apk\debug\app-debug.apk"
  if (-not (Test-Path $apk)) {
    Write-Host "    APK not found at $apk" -ForegroundColor Red
    exit 1
  }

  if ($adb) {
    Write-Step "Installing APK on device/emulator"
    $install = Invoke-Adb @('install', '-r', $apk)
    if ($install.ExitCode -eq 0) {
      Write-Host "    installed app-debug.apk"
    } else {
      Write-Host "    adb install failed (is the emulator running?)" -ForegroundColor Yellow
    }
  }

  Ensure-AdbReverse | Out-Null
  $Fresh = $true
}

if ($Start) {
  Write-Step "Starting Metro (Fast Refresh)"
  Write-Host ""
  Write-Host "  WORKFLOW" -ForegroundColor Green
  Write-Host "  1. Wait for 'Waiting on http://localhost:8081' below"
  Write-Host "  2. Open DriveMind once from the emulator icon (do NOT press 'a' here)"
  Write-Host "  3. Edit .tsx files -> save -> see 'Android Bundled XXms' -> UI updates"
  Write-Host "  4. Stores/services/App.tsx -> press 'r' in this terminal to reload"
  Write-Host ""
  Set-DevPackagerEnv
  Ensure-AdbReverse | Out-Null
  $env:EXPO_NO_TYPESCRIPT_SETUP = '1'

  $metroArgs = @('expo', 'start', '--dev-client')
  if ($Fresh) {
    $metroArgs += '--clear'
    Write-Host "    Metro cache cleared (-Fresh)" -ForegroundColor DarkGray
  }

  & npx @metroArgs
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  npm run start:dev     # daily Metro"
Write-Host "  npm run start:fresh   # Metro + clear cache"
Write-Host "  npm run dev:rebuild   # native rebuild + Metro"
