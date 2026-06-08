# Capture logcat after reproducing a release crash.
# Reads MAIN + CRASH buffers (FATAL lives in crash on API 29+).
# Usage:
#   npm run android:logcat-clear
#   # reproduce crash on emulator/device
#   npm run android:crash-log
. "$PSScriptRoot\resolve-adb.ps1"

$ErrorActionPreference = "Continue"
$mobileRoot = Split-Path $PSScriptRoot -Parent
$packageId = "com.guessxx.drivemind"
$outDir = Join-Path $mobileRoot "android\app\build\outputs\logs"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $outDir "crash-$stamp.log"
$crashPath = Join-Path $outDir "crash-$stamp-crash-buffer.log"
$filteredPath = Join-Path $outDir "crash-$stamp-drivemind.log"
$mappingSrc = Join-Path $mobileRoot "android\app\build\outputs\mapping\release\mapping.txt"
$mappingDst = Join-Path $outDir "mapping-release.txt"

$adbPath = Get-DriveMindAdb
$deviceArgs = Get-AdbDeviceArgs -AdbPath $adbPath
Write-Host "[DriveMind] Using adb: $adbPath"

# Last N lines from main buffer (avoid multi-MB emulator boot dumps)
& $adbPath @deviceArgs logcat -d -t 8000 | Out-File -FilePath $logPath -Encoding utf8
Write-Host "[DriveMind] Wrote main logcat (last 8000 lines) -> $logPath"

# CRASH buffer — FATAL EXCEPTION is here on modern Android
& $adbPath @deviceArgs logcat -d -b crash | Out-File -FilePath $crashPath -Encoding utf8
Write-Host "[DriveMind] Wrote crash buffer -> $crashPath"

if (Test-Path $mappingSrc) {
  Copy-Item $mappingSrc $mappingDst -Force
  Write-Host "[DriveMind] Copied mapping.txt -> $mappingDst"
} else {
  Write-Host "[DriveMind] mapping.txt not found (minify off or no mapping yet)"
}

$driveMindPattern = "$packageId|DriveMind|FATAL EXCEPTION|AndroidRuntime|SoLoader|ReactNative"
$allLines = @()
foreach ($file in @($crashPath, $logPath)) {
  if (Test-Path $file) {
    $hits = Select-String -Path $file -Pattern $driveMindPattern -ErrorAction SilentlyContinue
    if ($hits) { $allLines += $hits }
  }
}

if ($allLines.Count -gt 0) {
  $allLines | ForEach-Object { $_.Line } | Out-File -FilePath $filteredPath -Encoding utf8
  Write-Host "[DriveMind] Filtered $($allLines.Count) lines -> $filteredPath"
  Write-Host ""
  Write-Host "--- DriveMind / FATAL (last 50) ---"
  $allLines | Select-Object -Last 50 | ForEach-Object { $_.Line }
} else {
  Write-Host ""
  Write-Host "[DriveMind] No DriveMind/FATAL lines found."
  Write-Host "[DriveMind] Steps:"
  Write-Host "  1. npm run android:logcat-clear"
  Write-Host "  2. Launch DriveMind and reproduce the issue"
  Write-Host "  3. npm run android:crash-log"
  Write-Host ""
  $installed = & $adbPath @deviceArgs shell pm path $packageId 2>$null
  if (-not $installed) {
    Write-Host "[DriveMind] Package $packageId is NOT installed on this emulator."
    Write-Host "[DriveMind] Install: adb install -r mobile\android\app\build\outputs\apk\release\app-release.apk"
  } else {
    Write-Host "[DriveMind] Package is installed: $installed"
  }
}
