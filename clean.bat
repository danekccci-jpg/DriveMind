@echo off
echo [1/4] Killing stuck Java and Node processes...
taskkill /F /IM java.exe /T >nul 2>&1
taskkill /F /IM node.exe /T >nul 2>&1

echo [2/4] Removing build and cache folders...
if exist "mobile\android\app\build" rd /s /q "mobile\android\app\build"
if exist "mobile\android\app\.cxx" rd /s /q "mobile\android\app\.cxx"
if exist "mobile\android\.gradle" rd /s /q "mobile\android\.gradle"

echo [3/4] Resetting Expo prebuild (Fixing Autolinking)...
call npx expo prebuild --platform android --clean

echo [4/4] Done! System is ready. 
echo Moving to android directory...

:: Переходим в папку, где лежит gradlew
cd /d "mobile/android"

echo.
echo Current directory: %cd%
echo Now just type: ./gradlew assembleRelease