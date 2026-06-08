@echo off
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo [1/5] Killing stuck Java and Node processes...
taskkill /F /IM java.exe /T >nul 2>&1
taskkill /F /IM node.exe /T >nul 2>&1

echo [2/5] Removing stale root android folder (if any)...
if exist "android" rd /s /q "android"

echo [3/5] Removing mobile build and cache folders...
if exist "mobile\android\app\build" rd /s /q "mobile\android\app\build"
if exist "mobile\android\app\.cxx" rd /s /q "mobile\android\app\.cxx"
if exist "mobile\android\build" rd /s /q "mobile\android\build"
if exist "mobile\android\.gradle" rd /s /q "mobile\android\.gradle"

echo [4/5] Resetting Expo prebuild in mobile/ (Fixing Autolinking)...
cd /d "%ROOT%mobile"
call npx expo prebuild --platform android --clean

echo [5/5] Done! System is ready.
echo Moving to mobile/android directory...

cd /d "%ROOT%mobile\android"

echo.
echo Current directory: %cd%
echo Now just type: ./gradlew assembleRelease
