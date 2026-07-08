@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  DriveMind dev - Metro + Fast Refresh
echo  ---------------------------------
echo  Daily:     dev.bat
echo  Fresh:     dev.bat fresh
echo  Rebuild:   dev.bat rebuild
echo.
if /I "%~1"=="fresh" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-fresh.ps1" -Start -Fresh
) else if /I "%~1"=="rebuild" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-fresh.ps1" -Start -Rebuild
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-fresh.ps1" -Start
)
