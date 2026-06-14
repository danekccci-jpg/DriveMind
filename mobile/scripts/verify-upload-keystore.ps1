# Verifies that android/keystore.properties points to the Play upload key.
$ErrorActionPreference = "Stop"

$mobileRoot = Split-Path $PSScriptRoot -Parent
$propsPath = Join-Path $mobileRoot "android\keystore.properties"
$playUploadSha1 = "7F:C9:1F:8A:B7:4B:89:6E:7D:55:BD:28:91:05:15:39:EE:2F:EC:69"
$easKeystoreSha1 = "34:1E:CE:65:E3:D9:19:03:20:80:56:E9:65:F3:75:75:C5:FE:5C:AE"
$debugSha1 = "5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25"

$keytool = $null
if (Get-Command keytool -ErrorAction SilentlyContinue) { $keytool = "keytool" }
elseif ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\keytool.exe"))) {
    $keytool = Join-Path $env:JAVA_HOME "bin\keytool.exe"
} else {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Eclipse Adoptium\*\bin\keytool.exe",
        "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe",
        "C:\Program Files\Java\*\bin\keytool.exe"
    )
    foreach ($pattern in $candidates) {
        $hit = Get-ChildItem $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { $keytool = $hit.FullName; break }
    }
}
if (-not $keytool) { Write-Error "keytool not found. Set JAVA_HOME or install JDK." }

if (-not (Test-Path $propsPath)) {
    Write-Host "MISSING: android\keystore.properties" -ForegroundColor Red
    Write-Host "Copy android\keystore.properties.example → keystore.properties and fill in passwords."
    Write-Host "Download upload keystore: npx eas-cli credentials -p android"
    exit 1
}

$props = @{}
Get-Content $propsPath | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        $props[$matches[1].Trim()] = $matches[2].Trim()
    }
}

$storeFile = $props["storeFile"]
$storePassword = $props["storePassword"]
$keyAlias = $props["keyAlias"]

if (-not $storeFile -or -not $storePassword -or -not $keyAlias) {
    Write-Error "keystore.properties must set storeFile, storePassword, keyAlias"
}

$ksPath = Join-Path (Join-Path $mobileRoot "android\app") $storeFile
if (-not (Test-Path $ksPath)) {
    Write-Error "Keystore file not found: $ksPath"
}

Write-Host "Checking: $ksPath" -ForegroundColor Cyan
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$out = (& $keytool -list -v -keystore $ksPath -alias $keyAlias -storepass $storePassword 2>&1 | ForEach-Object { "$_" }) -join "`n"
$ErrorActionPreference = $prevEap
$shaLine = ($out -split "`n" | Where-Object { $_ -match "SHA1:" } | Select-Object -First 1)
if (-not $shaLine) {
    Write-Error "Could not read SHA1. Wrong password or alias?"
}

$sha1 = ($shaLine -replace ".*SHA1:\s*", "").Trim()
Write-Host "SHA1: $sha1"

if ($sha1 -eq $playUploadSha1) {
    Write-Host 'OK - matches Play Console upload key (7F:C9:1F:8A).' -ForegroundColor Green
    exit 0
}

if ($sha1 -eq $easKeystoreSha1) {
    Write-Host 'EAS keystore (34:1E:CE:65) - NOT the key Play expects (7F:C9:1F:8A).' -ForegroundColor Yellow
    Write-Host "Options:"
    Write-Host "  1) Find the original upload keystore (SHA-1 7F:C9:1F:8A...)"
    Write-Host "  2) Play Console → App integrity → App signing → Request upload key reset"
    Write-Host "     then register this EAS certificate (export PEM with keytool -export -rfc)"
    exit 2
}

if ($sha1 -eq $debugSha1) {
    Write-Host 'WRONG - debug keystore (5E:8F:16:06). Play will reject the AAB.' -ForegroundColor Red
} else {
    Write-Host 'Unknown keystore - does not match Play (7F:C9), EAS (34:1E), or debug (5E:8F).' -ForegroundColor Red
}
Write-Host "Play expects:  $playUploadSha1"
Write-Host "EAS keystore:  $easKeystoreSha1"
exit 1
