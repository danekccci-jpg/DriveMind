# Verifies EXPO_PUBLIC_* keys required for Firebase Auth / Google Sign-In in release bundles.
# Run before `npm run android:bundle:release:fresh` with NODE_ENV=production.
$ErrorActionPreference = "Stop"

$mobileRoot = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $mobileRoot ".env"
$envProduction = Join-Path $mobileRoot ".env.production"

function Read-DotEnvFile([string]$path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $map[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
  return $map
}

$vars = Read-DotEnvFile $envFile
if ($env:NODE_ENV -eq 'production' -and (Test-Path $envProduction)) {
  foreach ($entry in (Read-DotEnvFile $envProduction).GetEnumerator()) {
    $vars[$entry.Key] = $entry.Value
  }
}

$required = @(
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'
)

$missing = @()
foreach ($key in $required) {
  $value = [Environment]::GetEnvironmentVariable($key)
  if (-not $value -and $vars.ContainsKey($key)) { $value = $vars[$key] }
  if (-not $value) { $missing += $key }
}

if ($missing.Count -gt 0) {
  Write-Host "[DriveMind] Missing release env keys:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Write-Host ""
  Write-Host "Set them in mobile/.env (or .env.production) and rebuild with NODE_ENV=production." -ForegroundColor Yellow
  Write-Host "EAS builds: add the same keys as EAS Secrets." -ForegroundColor Yellow
  exit 1
}

Write-Host "[DriveMind] Release auth env OK ($($required.Count) keys present)." -ForegroundColor Green
Write-Host "[DriveMind] Reminder: Play internal testing uses the Play App signing SHA-1, not only the upload key." -ForegroundColor Cyan
Write-Host "  Play Console -> App integrity -> App signing -> App signing key certificate -> SHA-1" -ForegroundColor Cyan
Write-Host "  Firebase -> Project settings -> Your apps -> Android -> Add fingerprint" -ForegroundColor Cyan
exit 0
