# Install release APK on connected emulator/device (adb not required in PATH).
# Usage: npm run android:install-release
. "$PSScriptRoot\resolve-adb.ps1"

$mobileRoot = Split-Path $PSScriptRoot -Parent
$apkPath = Join-Path $mobileRoot "android\app\build\outputs\apk\release\app-release.apk"

if (-not (Test-Path $apkPath)) {
  Write-Host "[DriveMind] APK not found: $apkPath"
  Write-Host "[DriveMind] Build first: npm run android:release"
  exit 1
}

$adbPath = Get-DriveMindAdb
$deviceArgs = Get-AdbDeviceArgs -AdbPath $adbPath
Write-Host "[DriveMind] Using adb: $adbPath"
Write-Host "[DriveMind] Installing: $apkPath"

& $adbPath @deviceArgs install -r $apkPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "[DriveMind] Install OK"
