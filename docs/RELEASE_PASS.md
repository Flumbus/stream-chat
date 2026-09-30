# StreamChat — public Preview 0.4.0: итоговый отчёт

Дата: 30.09.2026. Этап продолжает завершённые Phase 4.7 (motion) и 4.8 (Safe Chat); добавлены UX-полировка, отдельный API, подготовка публичных репозиториев и Windows packaging. Это локально проверенный Preview, а не подтверждение production deployment. `.env` и пользовательская БД не сбрасывались.

## 1. Интерфейс

Главная страница — чат с onboarding без подключений. Тёмный интерфейс, фиолетовый accent по умолчанию (существующий пользовательский цвет сохранён), прежняя типографика и контуры. Settings стали одной колонкой с одинаковыми отступами; Interface, Feedback, Safe Chat, Updates, Experimental. FontPicker и стили чата находятся в Appearance. Experimental раскрывает отдельную навигацию Developer tools и технические URL-подключения. Выключение режима скрывает инструменты без удаления данных.

В Appearance — семь карточек с мини-сообщением, общий Live Preview, режим цвета имён, шрифт, плотность, Auto/Manual и Advanced. ПКМ остаётся основным способом модерации. Внизу sidebar — Boosty и DonationAlerts, в узкой/свёрнутой панели только значки с подсказками. Footer содержит `by fromflamb` и понятный статус OBS. Новые controls, ошибки, подтверждения и callback Google локализованы.

Toast исчезает через 4.5 / 5 / 7 / 9 секунд (success/info/warning/error), время приостанавливается при hover/focus; progress и Reduced Motion сохранены. Ошибки подключения и обновлений также доступны inline.

## 2. Desktop: основные добавленные/изменённые файлы

| Группа          | Файлы                                                                                                                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared model    | `src/shared/nicknameColors.ts`, `twitchPermissions.ts`, `notifications.ts`, `updater.ts`, `links.ts`, `i18n.ts` — новые модули; `models.ts`, `validation.ts`, `themes.ts`, `displayPolicy.ts`, `desktop.ts`, `moderationHistory.ts`, `events.ts` — интеграция                                                              |
| Main / OAuth    | `src/main/services/StreamChatApi.ts`, `YouTubeApiSchema.ts`, `UpdateService.ts` — новые; `AccountService.ts`, `LocalChatBackend.ts`, `src/main/security/OAuth.ts`, `OAuthCallbackPage.ts`, `OAuthCallbackServer.ts`, `src/main/index.ts`                                                                                   |
| Platform bridge | `src/platforms/common/LinkedChatAdapter.ts`, `src/main/ipc/desktop.ts`, `src/preload/index.ts`                                                                                                                                                                                                                             |
| UI              | `src/renderer/App.tsx`, `i18n.ts`, `styles.css`, `components/ChatRenderer.tsx`, `Feedback.tsx`, `FeedbackSettings.tsx`, `ConnectionFeedback.tsx`, `FontPicker.tsx`; новые `SupportLinks.tsx`, `UpdateStatus.tsx`                                                                                                           |
| Features        | `features/settings/SettingsPage.tsx`, `SafeChatSettings.tsx`; `features/accounts/AccountManager.tsx`; `features/chat/ChatPage.tsx`, `UserCard.tsx`, `MessageActions.tsx`, `SafeMessageNotice.tsx`; `features/users/UsersPage.tsx`; `features/overlays/OverlaysPage.tsx`, новые `NicknameControls.tsx`, `PresetPreview.tsx` |
| Release         | `package.json`, `package-lock.json`, `build/icon.ico`, `build/installer.nsh`, `.github/workflows/release.yml`, `.env.example`, `.gitignore`, `eslint.config.mjs`                                                                                                                                                           |
| Checks/docs     | новые `tests/release-ux.test.ts`, `api-client.test.ts`, `updater.test.ts`, `release-desktop.mjs`, `packaged-desktop.mjs`, `scripts/secret-scan.mjs`, `artifact-scan.mjs`; обновлены desktop selectors, README и документы                                                                                                  |

В таблице пути внутри `features` относительны к `src/renderer/`; внутри Shared/Main — к указанной папке. Поскольку Git до этого этапа отсутствовал, initial commit включает весь существующий проект, а не только перечисленные изменения. Полный файловый состав проверяется `git ls-files`.

## 3. API: созданные файлы

Отдельный `stream-chat-api/`: `src/config.ts`, `src/index.ts`, `src/schemas.ts`, `src/server.ts`, `tests/api.test.ts`, `scripts/secret-scan.mjs`, `package.json`, `package-lock.json`, `tsconfig.json`, `Dockerfile`, `captain-definition`, `.dockerignore`, `.gitignore`, `.env.example`, `.github/workflows/ci.yml`, `README.md`. Свой `.git`, без `.gitmodules`/submodule; родитель исключает весь API-каталог.

## 4. Preferences и миграции

`nicknameColors` типизирован как platform/random/role/single; отсутствующий блок старого профиля получает legacy platform для сохранения явного цвета платформы. Новые presets используют deterministic random. `autoDownloadUpdates` по умолчанию true. Старые `twitch`/`youtube` IDs сохранены; aliases `twitch-like`/`youtube-like` принимаются при validation и нормализуются для layout/activeTheme. Locale не меняет IDs. Legacy main chat font/style остаются читаемыми в данных; controls убраны из Settings. Auto/Manual appearance, Safe Chat и глобальный буфер 2000 сохранены. Миграции выполняются schema defaults при чтении JSON; разрушительной SQL-миграции не было.

## 5. Цвет имён

Random использует FNV-1a от platform + стабильного user ID и палитру из восьми мягких цветов, без мерцания при новом сообщении/изменении displayName. Role использует приоритет owner → moderator → bot → viewer; тот же `normalizedViewerRoles`, что и Safe Chat. Single применяет выбранный общий цвет. Legacy platform уважает сохранённый цвет пользователя. Результат общий для main chat, preview и OBS.

## 6. Семь presets

| Preset       | Отличие                                                           |
| ------------ | ----------------------------------------------------------------- |
| Modern       | Спокойная карточка, аватар, сбалансированные интервалы            |
| Minimal      | Плотная строка, минимум метаданных, без аватара и фона            |
| Bubble       | Сообщение в скруглённом пузырьке, аватар отдельно                 |
| Twitch-like  | Плотная лента, badges перед ником, двоеточие и inline message     |
| YouTube-like | Круглый аватар слева, имя/время и текст ниже, просторнее          |
| Overlay      | Прозрачная основа, floating messages, тень для чтения поверх игры |
| Neon         | Умеренная фиолетовая полоса/glow, без тяжёлого RGB эффекта        |

Mini-preview использует существующий MessageRow в декоративном режиме; отдельных семи renderer нет. Старые профили не заменяются presets автоматически.

## 7. Карточки аккаунтов

Одинаковые header/identity/status/channel/actions/errors/advanced для Twitch/YouTube и demo. При недостатке scopes Twitch видны причина и повторный вход. Длинные имена переносятся; на узком окне карточки идут одной колонкой. При недоступном API остаётся понятный статус, авторизация повторяется кнопкой подключения. Ссылочные аккаунты явно read-only.

## 8. Twitch permissions

При входе всегда запрашиваются `user:read:chat`, `user:write:chat`, `moderator:manage:banned_users`, `moderator:manage:chat_messages`, `user:read:moderated_channels`. Старый checkbox удалён. Scopes не назначают пользователя модератором: фактические capabilities канала всё равно проверяются. Старые сессии без scopes не считаются готовыми к модерации.

## 9. RU/EN

Общий словарь перенесён в `src/shared/i18n.ts`; renderer hook и callback используют его. Локализованы presets, Settings, Accounts, Safe Chat editor, context menus, viewer/history, ошибки и updater. Сообщения и имена зрителей, названия сохранённых профилей/правил не переводятся и не переписываются. Неизвестная русская backend-ошибка в EN получает безопасное общее пояснение: полная специфичная каталогизация всех ошибок провайдеров пока не сделана.

## 10. StreamChat API

Небольшой Node/TypeScript HTTP сервис: health, public config, четыре фиксированных YouTube операции, Google code exchange/refresh. Strict request schemas, минимальные response DTO, rate limits, cache/coalescing, request/response size limits, timeout, безопасные логи, никакого произвольного URL proxy. OAuth tokens обрабатываются только в памяти; сервер входит в доверенную границу авторизации. Server/client схемы разделены между независимыми репозиториями и проверяются на каждой границе.

## 11–13. ENV: назначение, public и secret

| ENV                                                        | Где                                      | Видимость                               |
| ---------------------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| `STREAMCHAT_API_URL`                                       | Desktop development override             | Public; packaged URL фиксирован         |
| `TWITCH_CLIENT_ID`, `GOOGLE_CLIENT_ID`                     | API, optional direct Desktop development | Public; только они выходят через config |
| `PORT`, `TRUST_PROXY`, `YOUTUBE_DAILY_BUDGET`              | API                                      | Настройки сервиса, не credentials       |
| `GOOGLE_CLIENT_SECRET`, `YOUTUBE_API_KEY`                  | API runtime                              | Secret; не renderer/installer/Git       |
| access/refresh tokens                                      | Desktop vault, временно Google broker    | Secret; не logs/public DTO              |
| `GH_TOKEN`, `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD` | Release CI                               | Secret; только Actions environment      |

Пользовательский старый `.env` сохранён. API `.env.example` содержит пустые secret-поля. Никакие значения secrets в документации не приведены.

## 14. Desktop ↔ API

Только main process через `StreamChatApi`; HTTPS, фиксированные операции, отсутствие redirects, timeout 12 секунд, лимит ответа 4 MiB и schema validation. Production не читает dotenv. Public config загружается без блокировки локального интерфейса и обновляется при попытке входа. YouTube URL-чат идёт через proxy; существующий OAuth platform adapter остаётся прямым. PKCE/state/loopback не ослаблены. В callback кнопка возвращает окно приложения и вызывает window.close; обычная вручную открытая вкладка может не закрыться из-за политики браузера — показана подсказка.

## 15. CapRover

Создать app, указать Container HTTP Port 3000, задать runtime ENV, подключить `api-streamchat.fromflamb.ru`, включить и принудить HTTPS; deploy корня API по `captain-definition`. Контейнер non-root, multi-stage, healthcheck, SIGTERM. Подробная последовательность и ограничения доверия reverse proxy — в `stream-chat-api/README.md`. Deploy не выполнялся.

## 16–19. Windows installer, путь, версия, логотип

**0.4.0**, x64 NSIS, установка для текущего пользователя, выбор папки, ярлыки, сохранение appData при uninstall. Файл: `release/StreamChat-Setup-0.4.0.exe` (**114780498 bytes**). Дополнительно `.blockmap`, `latest.yml` и `win-unpacked/StreamChat.exe`.

SHA256 installer: `b341033636f7ef1da35f61892133cb645e01770a424feaed852424455208d038`.

`Get-AuthenticodeSignature`: **NotSigned**. Существующий SVG StreamChat преобразован в ICO 16/24/32/48/64/128/256; используется для приложения/installer/uninstaller. Источник SVG/PNG и Lucide notice сохранены. Установщик собран; интерактивная установка/удаление Windows ещё не проходились.

## 20. Auto-update

Main-only electron-updater, GitHub Releases. Проверка спустя 15 секунд, автозагрузка по умолчанию ON, установка только кнопкой; при обычном выходе не устанавливает. UI показывает установленную/доступную версии, checking/downloading/progress/ready/error. Dev, portable, unpacked выключены; NSIS marker + release metadata включают updater. События очищаются при завершении. Ошибки остаются inline.

## 21–22. Первый Release и workflows

Desktop `.github/workflows/release.yml`: tag `v*`, Windows/Node24, соответствие package version, проверки, NSIS и публикация `.exe`/`.blockmap`/`latest.yml`. `GITHUB_TOKEN` предоставляется Actions, optional certificate secrets для подписи. API `.github/workflows/ci.yml`: typecheck/compiler lint/tests/build без deploy. Пошаговая инструкция — [RELEASE.md](RELEASE.md). Workflow на GitHub не запускался этой работой.

## 23–27. Git

Два отдельных локальных репозитория main. Desktop origin — `https://github.com/Flumbus/stream-chat.git`; API origin — `https://github.com/Flumbus/stream-chat-api.git`. Secrets/данные/артефакты исключены. Перед initial commits выполнены отдельные scans. API initial commit: `55b1ed67559ae716722f3ff84ce1f5081d77ebef`. Точные SHA Desktop и итоговый status выдаются в сообщении завершения; также доступны через `git log -1 --format=%H` и `git status --short` в каждом корне. Push, force push и изменение remote history не выполнялись.

## 28. Проверки

- Desktop typecheck, build, lint: PASS.
- Desktop unit/integration: **145 tests / 20 files, PASS**.
- API typecheck, compiler lint, build: PASS; **10 HTTP/unit tests, PASS**.
- `test:desktop`, `test:appearance`, `test:oauth`, `test:phase4`, `test:motion`, `test:safechat`, `test:release`: PASS.
- `test:packaged`: PASS — реальный packaged EXE, startup/bridge/preview/unpacked updater gate, отдельная БД.
- `package:win`: PASS. Signature: NotSigned.
- Secret scans обоих working trees: PASS. `artifact-scan` прочитал **3910 файлов app.asar**, private-file/credential-pattern/local-secret matches: 0.
- Скриншоты Settings RU/EN/min-size, Appearance, Account fixtures, updater states, collapsed sidebar и packaged preview в `test-results/`; не включены в Git. Просмотрены settings, minimum window, appearance, accounts и update-ready. Тесты не равны live-подключению к платформам.

## 29. Что не проверено в реальной среде

Production API/DNS/TLS/CapRover Docker runtime; реальный OAuth/Google consent, refresh через production API; модерация настоящего канала; нативный OBS; чистая Windows install/uninstall; реальные GitHub Actions/Release/update между двумя версиями; Authenticode/SmartScreen; аппаратные multi-monitor/DPI/звук. Локальный Docker build не выполнялся. API polling имеет общий дневной бюджет в памяти, сбрасываемый при restart; для масштабирования нужны квота, мониторинг и внешняя защита. Лицензия не выбрана; ссылка fromflamb пока ведёт на GitHub-профиль Flumbus.

## 30. Что остаётся владельцу

1. Выбрать лицензию Desktop/API и подтвердить либо заменить URL подписи fromflamb.
2. Создать/проверить два GitHub remote repository, авторизовать публикацию и отправить подготовленные commits без force push.
3. Развернуть API в CapRover, внести private runtime ENV, настроить DNS/HTTPS и проверить health/config. Не пересылать секреты в чат.
4. Проверить реальные Twitch/Google входы и разрешения на собственном тестовом канале. При Google Testing добавить нужных test users; для публичной аудитории завершить необходимые процедуры Google.
5. Пройти installer/uninstaller на тестовой Windows. При наличии сертификата настроить CI signing secrets; иначе обозначать сборку unsigned Preview.
6. Опубликовать первый Release и затем проверить реальное обновление на следующую версию. Подписки, web/remote, tray и autostart не добавлены в этот этап.
