# Pre-push secret scan — run from repo root: powershell -File scripts/security-preflight.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$fail = $false

function Fail($msg) {
    Write-Host "FAIL: $msg" -ForegroundColor Red
    $script:fail = $true
}

function Ok($msg) {
    Write-Host "OK:   $msg" -ForegroundColor Green
}

$forbiddenTracked = @(
    'mobile/.env',
    '@guessxx__drivemind.jks',
    'mobile/android/keystore.properties',
    'functions/service-account-google-play.json',
    'mobile/android/app/google-services.json',
    'scripts/secret-replacements.txt'
)

$ErrorActionPreference = 'Continue'

foreach ($path in $forbiddenTracked) {
    $tracked = & git ls-files --error-unmatch $path 2>$null
    if ($LASTEXITCODE -eq 0 -and $tracked) {
        Fail "Tracked secret file: $path (run: git rm --cached $path)"
    }
}

$ErrorActionPreference = 'Stop'

$adminSrc = Get-Content 'mobile/src/services/adminSeeder.ts' -Raw
if ($adminSrc -match '@gmail\.com') {
    Fail 'Personal email still hardcoded in adminSeeder.ts'
}

$trackedFiles = git ls-files
foreach ($f in $trackedFiles) {
    if ($f -match '\.example$' -or $f -match 'package-lock\.json') { continue }
    if ($f -match 'security-preflight\.ps1$') { continue }
    if (Test-Path $f) {
        $content = Get-Content $f -Raw -ErrorAction SilentlyContinue
        if ($content -match 'AIza[0-9A-Za-z_-]{20,}') {
            Fail "Google API key pattern in tracked file: $f"
        }
        if ($content -match 'BEGIN PRIVATE KEY') {
            Fail "Private key in tracked file: $f"
        }
    }
}

git check-ignore -v mobile/.env 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Fail 'mobile/.env is not gitignored'
} else {
    Ok 'mobile/.env is gitignored'
}

if (-not $fail) {
    Ok 'No obvious secret leaks in tracked files'
} else {
    Write-Host ''
    Write-Host 'Fix the issues above before pushing.' -ForegroundColor Red
    exit 1
}

$cursorHits = git log -10 --format='%B' 2>$null | Select-String -Pattern 'cursoragent@cursor.com|Made-with: Cursor|Co-authored-by: Cursor'
if ($cursorHits) {
    Fail 'Cursor agent mention in recent commit messages — amend or rewrite history'
}

if (-not $fail) {
    Write-Host ''
    Write-Host 'Reminder: rotate keys if they were ever pushed to a public remote.' -ForegroundColor Yellow
    exit 0
}

Write-Host ''
Write-Host 'Fix the issues above before pushing.' -ForegroundColor Red
exit 1
