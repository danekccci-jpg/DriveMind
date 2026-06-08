function Resolve-AdbPath {
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $env:LOCALAPPDATA "Android\Sdk"),
    (Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk")
  ) | Where-Object { $_ -and (Test-Path $_) }

  foreach ($sdk in $candidates) {
    $adbExe = Join-Path $sdk "platform-tools\adb.exe"
    if (Test-Path $adbExe) { return $adbExe }
  }
  return $null
}

function Get-DriveMindAdb {
  $adbPath = Resolve-AdbPath
  if (-not $adbPath) {
    Write-Host "[DriveMind] adb not found. Add platform-tools to PATH or set ANDROID_HOME."
    Write-Host "[DriveMind] Example: `$env:Path += ';$env:LOCALAPPDATA\Android\Sdk\platform-tools'"
    exit 1
  }
  return $adbPath
}

function Get-AdbDeviceArgs {
  param([string]$AdbPath)

  if ($env:ANDROID_SERIAL) {
    return @("-s", $env:ANDROID_SERIAL)
  }

  $lines = & $AdbPath devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" -or $_ -match "device\s" }
  $serials = @()
  foreach ($line in $lines) {
    $serial = ($line -split "\s+")[0]
    if ($serial) { $serials += $serial }
  }

  if ($serials.Count -eq 0) {
    Write-Host "[DriveMind] No adb device/emulator connected. Start the Android Studio AVD first."
    exit 1
  }

  if ($serials.Count -gt 1) {
    Write-Host "[DriveMind] Multiple devices: $($serials -join ', '). Using first. Set ANDROID_SERIAL to pick one."
  }

  $chosen = $serials[0]
  Write-Host "[DriveMind] Target device: $chosen"
  return @("-s", $chosen)
}
