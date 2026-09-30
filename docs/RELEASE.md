# Windows Preview: сборка и публикация

Версия: **0.4.0**. Origin Desktop: `https://github.com/Flumbus/stream-chat.git`. API — независимый origin `https://github.com/Flumbus/stream-chat-api.git`.

## Локальная сборка

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run package:win
node scripts/artifact-scan.mjs
```

Результаты: `release/StreamChat-Setup-0.4.0.exe`, `release/StreamChat-Setup-0.4.0.exe.blockmap`, `release/latest.yml`. Не коммитьте `release/`.

NSIS устанавливает для текущего пользователя, предлагает каталог, создаёт ярлыки; пользовательская БД при удалении не удаляется. `build/installer.nsh` создаёт marker в resources только во время установки. Updater требует этот marker, Windows packaged build, metadata и отсутствие portable environment. Распакованная сборка не получает updater даже при наличии `app-update.yml`.

`build/icon.ico` содержит размеры 16/24/32/48/64/128/256 px, полученные из существующего `assets/branding/streamchat-logo.svg`. Значок используется приложением, установщиком и деинсталлятором. Это прежний логотип, без редизайна.

## Первый GitHub Release — выполняет владелец

1. Выберите лицензию и окончательный адрес ссылки `by fromflamb` (сейчас GitHub-профиль Flumbus).
2. Проверьте подготовленные локальные commits, `.gitignore`, secret scan. При существующей remote history сначала выполните `git fetch origin` и согласуйте историю; не делайте force push.
3. Авторизуйте GitHub и опубликуйте main обоих репозиториев отдельно. Вложенная API-папка не является submodule и не попадёт в Desktop commit.
4. Разверните API и пройдите реальные входы Twitch/Google, включая пользователя Google Test users. Проверьте модерацию на собственном тестовом канале.
5. При наличии сертификата добавьте Desktop Actions secrets `WINDOWS_CSC_LINK` и `WINDOWS_CSC_KEY_PASSWORD`. Это optional: без них сборка остаётся unsigned Preview.
6. Убедитесь, что `package.json` и lockfile содержат 0.4.0. Создайте тег `v0.4.0` на проверенном commit и отправьте тег в Desktop origin. Это запускает `.github/workflows/release.yml`.
7. Workflow проверяет соответствие тега версии, typecheck/lint/tests/build, собирает NSIS и публикует Release assets. `GH_TOKEN` берётся только из `${{ secrets.GITHUB_TOKEN }}`, permission `contents: write`. Локальные `.env` в workflow не нужны.
8. Проверьте, что GitHub Release опубликован и содержит `.exe`, `.blockmap`, `latest.yml`. Для следующего релиза увеличьте версию вместе с lockfile, создайте соответствующий тег.
9. Установите Preview на тестовой Windows, проверьте запуск/ярлыки/сохранность профилей после повторной установки. Для updater нужен второй опубликованный номер версии: дождитесь загрузки, проверьте, что выход не устанавливает обновление, затем нажмите «Установить и перезапустить».

## Обновления

Main process обслуживает electron-updater; renderer видит только типизированный status/progress и check/download/install. Проверка запускается спустя 15 секунд. Автозагрузка включена по умолчанию и сохраняется в preferences. Установка — только по кнопке, после закрытия backend. Download failure остаётся inline в Settings. Dev/portable/unpacked не проверяют updates.

У API отдельный workflow CI: typecheck, compiler lint, tests, build; автоматического deploy нет. Desktop workflow здесь подготовлен, но на GitHub не запускался. Реальный установщик не подписан; предупреждение Windows ожидаемо для Preview. Подробности механизма: [electron-builder Auto Update](https://www.electron.build/v26/docs/features/auto-update/).
