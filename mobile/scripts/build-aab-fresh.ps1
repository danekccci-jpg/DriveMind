# Fresh AAB Build Script for DriveMind (Windows PowerShell)
# Usage: npm run android:bundle:release:fresh  (from mobile/)
$ErrorActionPreference = "Stop"

$mobileRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $mobileRoot -Parent

Write-Host "Starting fresh production AAB build pipeline..." -ForegroundColor Cyan
Write-Host "[DriveMind] mobile: $mobileRoot" -ForegroundColor DarkGray
Write-Host "[DriveMind] repo:   $repoRoot" -ForegroundColor DarkGray

# 1. Ensure we are in the mobile workspace
Set-Location $mobileRoot

# 2. Rebuild shared monorepo package
Write-Host "Rebuilding shared package..." -ForegroundColor Yellow
Set-Location $repoRoot
npm run build:shared
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location $mobileRoot

# 3. Clear Metro / Expo caches
Write-Host "Clearing Expo and Metro caches..." -ForegroundColor Yellow
if (Test-Path (Join-Path $mobileRoot ".expo")) {
    Remove-Item -Recurse -Force (Join-Path $mobileRoot ".expo")
}
if (Test-Path (Join-Path $mobileRoot "node_modules\.cache")) {
    Remove-Item -Recurse -Force (Join-Path $mobileRoot "node_modules\.cache")
}

# 4. Clean Android artifacts
Write-Host "Cleaning Android artifacts..." -ForegroundColor Yellow
npm run android:clean:artifacts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 5. Stop Gradle Daemon to flush in-memory cache
Write-Host "Stopping Gradle Daemon..." -ForegroundColor Yellow
Set-Location (Join-Path $mobileRoot "android")
.\gradlew --stop
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location $mobileRoot

# 6. Build production AAB forcing re-run of tasks
Write-Host "Verifying release auth env..." -ForegroundColor Yellow
npm run android:verify-release-env
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building fresh production AAB..." -ForegroundColor Green
$env:NODE_ENV = "production"
Set-Location (Join-Path $mobileRoot "android")
.\gradlew bundleRelease --no-build-cache --rerun-tasks
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location $mobileRoot

$aabPath = Join-Path $mobileRoot "android\app\build\outputs\bundle\release\app-release.aab"
Write-Host "Pipeline finished!" -ForegroundColor Green
if (Test-Path $aabPath) {
    $info = Get-Item $aabPath
    Write-Host "[DriveMind] AAB: $aabPath" -ForegroundColor Green
    Write-Host "[DriveMind] Size: $([math]::Round($info.Length / 1MB, 2)) MB | Built: $($info.LastWriteTime)" -ForegroundColor Green
} else {
    Write-Host "[DriveMind] Expected AAB not found at: $aabPath" -ForegroundColor Red
    exit 1
}
