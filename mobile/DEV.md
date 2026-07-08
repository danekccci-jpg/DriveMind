# DriveMind — разработка (Android + Metro)

## Каждый день

```powershell
cd mobile
npm run start:dev
```

1. Дождаться `Waiting on http://localhost:8081`
2. Открыть DriveMind **с иконки эмулятора** (не нажимать `a` в терминале)
3. Сохранять `.tsx` — в терминале появится `Android Bundled XXms`
4. Stores / `App.tsx` / i18n — нажать `r` в терминале Metro

Или: `dev.bat` (двойной клик в папке `mobile/`)

## Первый раз / нативные изменения

```powershell
npm run dev:rebuild
```

Дождаться `Waiting on http://localhost:8081`, затем открыть приложение с иконки эмулятора
(или `npm run dev:open`). APK ставится без автозапуска — так не будет красного экрана.

## Команды

| Команда | Когда |
|---------|-------|
| `npm run start:dev` | Ежедневно |
| `npm run start:fresh` | HMR застрял |
| `npm run dev:rebuild` | Первый раз, нативные изменения |
| `npm run dev:open` | Открыть приложение (Metro уже запущен) |
| `npm run dev:clean` | Только очистить кэши |

## Правила

- Один терминал Metro, не закрывать во время работы
- Не нажимать `a` в терминале Expo
- Эмулятор запущен до `start:dev`
- `dev:rebuild` — только при нативных изменениях (2–5 мин)

## После `npm install` в корне репо

```powershell
cd mobile
npm run start:dev
```

Патч Metro (`patch-metro-multipart.js`) применяется через `postinstall`.
