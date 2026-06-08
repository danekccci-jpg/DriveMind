# Clear device logcat before reproducing a crash.
# Usage: npm run android:logcat-clear
. "$PSScriptRoot\resolve-adb.ps1"
$adbPath = Get-DriveMindAdb
$deviceArgs = Get-AdbDeviceArgs -AdbPath $adbPath

& $adbPath @deviceArgs logcat -c
& $adbPath @deviceArgs logcat -b crash -c 2>$null
Write-Host "[DriveMind] logcat cleared (main + crash buffer)"
