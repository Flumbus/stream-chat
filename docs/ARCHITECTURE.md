# StreamChat — архитектура и границы Phase 1

## Актуальные дополнения 0.4.0

Desktop остаётся локальным: renderer → typed preload → main → SQLite/platform adapters/loopback OBS. Новый `StreamChatApi` доступен только main process и обслуживает public config, Google token broker и публичные YouTube URL-чаты. Отдельный API не хранит чат/аккаунты и не вводит subscriptions. Updater и external links — ограниченный DesktopBridge. Общий i18n словарь доступен renderer и OAuth callback; nickname role parsing общий с Safe Chat. Подробности и trust boundaries: [RELEASE_PASS.md](RELEASE_PASS.md), [SECURITY.md](../SECURITY.md).

## Исходная архитектура и решения

Проверено по официальной документации 27 сентября 2026. Сейчас реализуется Phase 1: desktop shell, SQLite, migrations, typed IPC, unified event layer, темы, mock provider и developer tools. OAuth и реальные платформы относятся к Phase 2/3, HTTP/WS overlay к Phase 4, installer/tray к Phase 5. Кнопки будущих возможностей не имитируют успешную интеграцию.

## Структура

```text
src/
  shared/                 сериализуемые модели, схемы валидации, контракты, темы
  platforms/
    mock/                 полноценный адаптер тестовых событий
    twitch/               Phase 2: Auth, Chat, Moderation, Adapter
    youtube/              Phase 3: Auth, Chat, Moderation, Adapter
  main/
    database/migrations/  последовательные транзакционные миграции SQLite
    services/             LocalChatBackend, persistence, logging
    security/             safeStorage vault (Phase 2)
    local-server/         read-only HTTP/WS overlay (Phase 4)
    ipc/                  фиксированные каналы и runtime validation
    index.ts              lifecycle и создание безопасного окна
  preload/                ограниченный API; никаких generic invoke
  renderer/
    components/           единый ChatRenderer и виртуальная лента
    features/             chat, accounts, overlays, users, settings
    stores/               Zustand: UI state и ограниченный event buffer
tests/                    persistence, migration, adapter, Electron smoke
docs/                     решения и протоколы будущих этапов
```

Renderer → ChatBackend → preload IPC → LocalChatBackend → PlatformAdapter. В main процессах находятся network/auth и сервисы. SQLite worker владеет единственным соединением; UI и main не блокируются SQL. Модель аккаунта содержит instance ID: несколько аккаунтов одной платформы не требуют нового UI контракта. RemoteChatBackend впоследствии реализует тот же интерфейс, но сейчас отсутствует.

## Shared contracts

PlatformAccount: id, platform, platformAccountId, username, displayName, avatarUrl, scopes, authStatus, connectionStatus, lastValidatedAt. Секреты никогда не входят в DTO.

ChatMessage: id, accountId, platform, channelId, user (platformUserId, username, displayName, roles, badges, color, avatarUrl), text, fragments, createdAt (ISO UTC), kind, metadata. Identity всегда (platform, platformUserId); автоматического объединения нет.

StreamEvent — discriminated union: chat/message, subscription, membership, donation, raid, follow, moderation, system. Provider отдаёт нормализованные события. Capability flags отражают возможности конкретного аккаунта/канала; moderation API дополнительно проверяет права. Возможность unban YouTube зависит от сохранённого ban ID, а не только user ID.

PlatformAdapter: connect/disconnect, getCurrentAccount, startChat/stopChat, sendMessage, timeoutUser, banUser, unbanUser, deleteMessage, subscribe. Backend: snapshot, subscribe, send, moderate, settings, profiles, users. Runtime-валидация IPC независима от TypeScript.

## SQLite

Миграции с user_version, каждая в транзакции; более новая неизвестная версия отклоняется. WAL, foreign_keys, busy_timeout. SQL только параметризованный.

1. connected_accounts: id PK, platform, platform_account_id, username, display_name, avatar_url, created_at, last_login_at, enabled, scopes_json, last_validated_at. UNIQUE(platform, platform_account_id).
2. chat_users: id PK, platform, platform_user_id, username, display_name, avatar_url, first_seen_at, last_seen_at, message_count. UNIQUE(platform, platform_user_id).
3. moderation_actions: id PK, account_id, platform, channel_id, target_user_id, target_username, action, duration, reason, created_at, success, error, external_ban_id. Индекс по target и created_at.
4. chat_profiles: id PK, name, theme_json, created_at, updated_at.
5. settings: key PK, value_json.

Phase 1 не сохраняет историю текста сообщений: только ограниченный буфер 2 000 событий и агрегаты пользователей. Mock пользователи хранятся в отдельной demo.sqlite; реальные аккаунты не смешиваются с тестовыми. Настройки и темы сохраняются в основной streamchat.sqlite. Запись пользователей пакетами; graceful shutdown ждёт flush.

## OAuth и API (решения для Phase 2/3)

### Twitch

Public application + Device Code Flow: POST /oauth2/device, открыть verification_uri в системном браузере, polling /oauth2/token с interval/expiry; без client secret. Refresh token одноразовый: single-flight refresh и атомарное сохранение новой пары. /validate при старте и периодически согласно документации. Logout — revoke и удаление vault записи. [OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/).

Базовые scopes: user:read:chat и user:write:chat; опциональная модерация: moderator:manage:banned_users, moderator:manage:chat_messages. Scopes не заменяют moderator/broadcaster права. Не запрашивать email, follower/subscriber списки для отображения badges в сообщении. [Chat authorization](https://dev.twitch.tv/docs/chat/authenticating/), [scopes](https://dev.twitch.tv/docs/authentication/scopes/).

EventSub WebSocket channel.chat.message, нормализация fragments/badges/color. Helix Send Chat Message, Ban User (duration для timeout), Unban User и Delete Chat Messages. EventSub session_welcome → подписки; keepalive watchdog; session_reconnect → переход на reconnect_url; revocation → действие пользователя. Дедупликация message_id, backoff с jitter и отменой при logout. Rate limits брать из headers/API responses; 429 не повторять в tight loop. [EventSub](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [Helix reference](https://dev.twitch.tv/docs/api/reference/).

### YouTube

Google Cloud: включить YouTube Data API v3, OAuth consent screen + test users, Desktop app client. Authorization code с PKCE S256 и random state; системный браузер; одноразовый HTTP callback http://127.0.0.1:{ephemeral-port}/; listener привязан только к loopback. Запрет embedded login. Запрос offline access, сохранение refresh token. В Preview 0.4.0 Google client secret хранится только на API-сервере; main отправляет code/verifier либо refresh token в специализированный HTTPS broker. В старом direct development поддержана private .env конфигурация. [Installed apps OAuth](https://developers.google.com/youtube/v3/live/guides/auth/installed-apps).

Один scope https://www.googleapis.com/auth/youtube.force-ssl покрывает чтение/отправку/модерацию; отдельные identity/email scopes не нужны для channels.list(mine=true). Он широкий, более узкого write-chat scope нет. Для публичного распространения возможна OAuth verification; testing mode ограничивает пользователей/срок refresh token.

liveBroadcasts.list для доступных трансляций, snippet.liveChatId; показывать выбор и состояние «нет активной трансляции». liveChatMessages.streamList — server streaming, предпочтительно gRPC по официальному proto/demo, resume через nextPageToken. Не трактовать как WebSocket/SSE. Polling fallback только с pollingIntervalMillis. Остановка на ended/disabled, квоты и permission errors отличаются от сетевых обрывов. [Broadcasts](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/list), [streamList](https://developers.google.com/youtube/v3/live/docs/liveChatMessages/streamList).

Отправка: liveChatMessages.insert; удаление: liveChatMessages.delete. Бан: liveChatBans.insert с temporary/permanent, liveChatId, bannedUserDetails.channelId и optional banDurationSeconds. Сохранить returned ban ID для liveChatBans.delete. Не обещать unban произвольного внешнего бана без ID. Причина может оставаться локальной: API платформ не эквивалентны. [Send](https://developers.google.com/youtube/v3/live/docs/liveChatMessages/insert), [Delete message](https://developers.google.com/youtube/v3/live/docs/liveChatMessages/delete), [Ban](https://developers.google.com/youtube/v3/live/docs/liveChatBans/insert), [Unban](https://developers.google.com/youtube/v3/live/docs/liveChatBans/delete).

## Local Web Overlay — Phase 4

HTTP 127.0.0.1:17832, /overlay/{opaque-profile-id}, отдельный read-only WebSocket. Статика локальная, никакого OAuth/IPC или управляющего API. Сервер проверяет Host/Origin, ограничивает размер и частоту; случайный read token в URL профиля. Начальный snapshot, затем batched events с sequence, profile updates и delete/moderation events. Reconnect с backoff и snapshot resync. Медленные клиенты отключаются по bufferedAmount. Один ChatRenderer + ThemeConfig для preview и OBS; никаких семи копий компонента. Локальный URL OBS реализован и доступен в Appearance.

## Безопасность и производительность

contextIsolation=true, nodeIntegration=false, sandbox=true, CSP, запрет navigation/window.open, проверка senderFrame и payload. safeStorage шифрует access/refresh tokens в отдельном vault; при недоступном шифровании — отказ от сохранения. Логирование только безопасных кодов ошибок, без request bodies/headers/OAuth URLs. Virtualized list, bounded event buffer, batch delivery и запись в worker. ThemeConfig валидируется диапазонами и enum; никакого произвольного CSS/HTML.
