@echo off
chcp 65001 >nul
echo 🚀 Подготовка к отправке DriveMind V2...

:: Проверка наличия .gitignore (защита от мусора)
if not exist .gitignore (
    echo ⚠️ Внимание: .gitignore не найден! Создаю базовый...
    echo node_modules/ > .gitignore
    echo .expo/ >> .gitignore
    echo android/ >> .gitignore
    echo ios/ >> .gitignore
    echo *.apk >> .gitignore
    echo .env* >> .gitignore
)

set /p msg="Введите описание изменений (или Enter для авто-даты): "

:: Если описание пустое, ставим текущую дату и время
if "%msg%"=="" set msg=DriveMind Update: %date% %time%

echo 📦 Индексация файлов...
git add .

echo 💾 Коммит: %msg%
git -c core.hooksPath=.githooks commit -m "%msg%"

echo ⬆️ Отправка в репозиторий...
git push
if errorlevel 1 (
    echo ⚠️ Upstream не настроен, пробую git push --set-upstream origin DriveMind...
    git push --set-upstream origin DriveMind
    if errorlevel 1 (
        echo ❌ Push не удался. Проверьте git status и remote.
        pause
        exit /b 1
    )
)

echo.
echo ✅ Готово! Код отправлен на GitHub (ветка DriveMind).
pause
