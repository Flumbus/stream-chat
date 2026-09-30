# Twitch, YouTube и подключение чатов по ссылке

Инструкция для Preview 0.4.0, 30.09.2026. Ручные access token и refresh token не нужны: после настройки приложения вход выполняется в системном браузере, токены сохраняются через Electron safeStorage / Windows DPAPI.

## Что нужно получить

| Задача | Что нужно |
| --- | --- |
| Читать Twitch по ссылке | Только ссылка; гостевое IRC-подключение |
| Вход Twitch, отправка, разрешённая модерация | Client ID приложения Twitch типа Public в API |
| Читать публичный YouTube Live Chat по ссылке | API key проекта с включённым YouTube Data API v3 на API-сервере |
| Вход YouTube, отправка, разрешённая модерация | OAuth Client ID типа Desktop app и desktop client secret, если он выдан |

API key YouTube и OAuth Client ID — разные значения, они не взаимозаменяемы.

## Куда записать настройки в Preview 0.4.0

Пользователю установленного приложения ключи не нужны: достаточно «Подключить Twitch/YouTube». Владелец сервиса задаёт `TWITCH_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (если выдан) и `YOUTUBE_API_KEY` в окружении **StreamChat API / CapRover**. `/v1/config` раскрывает только два публичных ID. [Инструкция API](https://github.com/Flumbus/stream-chat-api).

Desktop `STREAMCHAT_API_URL` используется только в development; packaged build использует фиксированный `https://api-streamchat.fromflamb.ru`. Старый private `.env` поддерживается для direct development, но не включается в установщик и не загружается production main process. Не переносите секреты в frontend или `VITE_*`. Значения сессий получают через OAuth, вручную access/refresh token не нужны.

## Twitch: полноценный вход

1. Войдите в [Twitch Developer Console](https://dev.twitch.tv/console/apps). Для регистрации приложения нужны подтверждённая почта и двухфакторная аутентификация Twitch.
2. Нажмите **Register Your Application**. Укажите уникальное название, например `StreamChat Flamberor`, и подходящую категорию, например Chat Bot / Application Integration, если она есть в списке.
3. Выберите **Client Type: Public**. Для Windows это позволяет использовать Device Code Flow без Twitch Client Secret. Если форма требует OAuth Redirect URL, можно указать `http://localhost` и нажать Add; StreamChat использует device flow, а не этот callback.
4. Создайте приложение, затем откройте **Manage** и скопируйте **Client ID** в `TWITCH_CLIENT_ID`.
5. Перезапустите StreamChat. В **Аккаунты** нажмите **Подключить Twitch**. Нужные разрешения запрашиваются автоматически.
6. Завершите вход на странице Twitch в браузере. При запросе кода введите код, показанный StreamChat. Вернитесь в приложение и выберите канал.

Приложение сразу запрашивает `user:read:chat`, `user:write:chat`, а также `moderator:manage:banned_users`, `moderator:manage:chat_messages`, `user:read:moderated_channels`. Эти разрешения не назначают вас модератором чужого канала: права должны уже быть у аккаунта.

Twitch Client Secret создавать и вставлять не требуется. [Регистрация приложения](https://dev.twitch.tv/docs/authentication/register-app/), [Device Code Flow и Public client](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow), [разрешения чата](https://dev.twitch.tv/docs/chat/authenticating/).

## YouTube: API key для чтения по ссылке

1. Откройте [Google Cloud Console](https://console.cloud.google.com/) и создайте отдельный проект, например `StreamChat`.
2. В **APIs & Services → Library** найдите **YouTube Data API v3**, откройте его и нажмите **Enable**.
3. Откройте **APIs & Services → Credentials → Create credentials → API key**.
4. Откройте созданный ключ. В **API restrictions** выберите **Restrict key → YouTube Data API v3**. Не выбирайте HTTP referrer веб-сайта: запросы делает API-сервер. При стабильном внешнем IP сервера ограничьте ключ этим IP; отслеживайте квоту проекта.
5. Задайте ключ в `YOUTUBE_API_KEY` окружения API и перезапустите сервис. В Desktop включите Experimental для URL-каналов.
6. В **Аккаунты → YouTube → Дополнительный канал по ссылке** вставьте адрес и нажмите **Добавить чат**.

В packaged Preview чтение идёт через ограниченный серверный REST polling proxy; в старом direct development сохранён `streamList` с API key; разрешение владельца аккаунта через OAuth для публичного чата не требуется. [Официальный пример API-key streaming](https://developers.google.com/youtube/v3/live/streaming-live-chat). Закрытые/ограниченные чаты могут быть недоступны.

## YouTube: полноценный вход через Google

1. В том же Cloud-проекте убедитесь, что включён **YouTube Data API v3**.
2. Откройте **Google Auth Platform** (либо **APIs & Services → OAuth consent screen**). Если настройка ещё не выполнена, нажмите **Get started**: укажите название приложения, контактную почту и developer contact.
3. Для личного Google-аккаунта выберите аудиторию **External**. Оставьте приложение в режиме **Testing** и добавьте свою Google-почту в **Audience → Test users**.
4. В **Data Access** добавьте scope `https://www.googleapis.com/auth/youtube.force-ssl`. StreamChat запрашивает его для чата и модерации; это широкое разрешение YouTube.
5. Перейдите в **Clients → Create client** либо **Credentials → Create credentials → OAuth client ID**. Тип приложения — **Desktop app**. Не выбирайте Web application.
6. Скопируйте **Client ID** в `GOOGLE_CLIENT_ID`. Если созданному Desktop client выдан **Client secret**, внесите его в `GOOGLE_CLIENT_SECRET`; это значение также есть в скачанном JSON credentials. Сам JSON в проект добавлять не нужно.
7. Фиксированные redirect URLs для Desktop client настраивать не нужно: StreamChat открывает временный callback `http://127.0.0.1:<случайный порт>/`, использует PKCE и проверку state.
8. Перезапустите StreamChat, нажмите **Подключить YouTube**, войдите своим тестовым пользователем и подтвердите разрешения. Не используйте окно браузера внутри Electron — приложение само откроет системный браузер.
9. После входа нажмите **Найти каналы / трансляции** и выберите активный эфир. В текущем OAuth-режиме доступны трансляции вашего канала; для чужого публичного чата используйте добавление по ссылке.

Для внешнего приложения в Testing Google может ограничивать срок refresh token; повторный вход в этом случае ожидаем. Для распространения приложения другим пользователям может понадобиться проверка Google. [Desktop OAuth, PKCE и loopback](https://developers.google.com/identity/protocols/oauth2/native-app).

## Поддерживаемые ссылки

Twitch:

```text
https://www.twitch.tv/flamberor
https://www.twitch.tv/popout/flamberor/chat
https://www.twitch.tv/embed/flamberor/chat
```

YouTube:

```text
https://www.youtube.com/@flamberor
https://www.youtube.com/@flamberor/live
https://www.youtube.com/channel/UC…
https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://www.youtube.com/live/VIDEO_ID
https://www.youtube.com/live_chat?v=VIDEO_ID
```

`VIDEO_ID` означает реальный 11-символьный ID, а `UC…` — полный ID канала. Старые `/user/имя` также поддерживаются. Произвольные `/c/название` не разрешаются через scraping: используйте @handle, channel ID либо видео. Ссылки на replay открывают только активный live chat того же видео; воспроизведение архивного чата не реализовано.

Можно добавить до 12 дополнительных ссылок. Они сохраняются после перезапуска. Повторная канонически одинаковая ссылка отклоняется; разные формы YouTube-ссылки могут обозначать один эфир, но сообщения объединяются по ID. Ссылки не заменяют основной OAuth-аккаунт. Во всех карточках по ссылке действует **«Модерация невозможна»**, включая запрет отправки сообщений. Reconnect повторяет подключение; Disconnect останавливает его; «Удалить канал» убирает только эту ссылку.

Если на YouTube-канале нет эфира, начните эфир и нажмите Reconnect. Если эфиров несколько — добавьте прямую ссылку на нужное видео. Поиск эфира по каналу расходует квоту; прямая ссылка на видео позволяет пропустить поиск. Twitch guest IRC не проверяет, идёт ли видеотрансляция, и не гарантирует доступ к ограничениям/закрытым чатам. [Twitch IRC](https://dev.twitch.tv/docs/chat/irc), [официальный форум о guest IRC](https://discuss.dev.twitch.com/t/anonymous-connection-to-twitch-chat/20392).

## Исторические проверки до server proxy

- 37 unit/integration-тестов, включая разбор ссылок, ограничения read-only, Twitch IRC mapping/handshake, YouTube API-key transport/resume, ошибки ключа и сохранение ссылок в SQLite.
- В реальном Electron: Twitch guest подключён к публичному `twitchdev`; YouTube без ключа показывает понятную ошибку; отправка заблокирована; два канала сохраняются после перезапуска и удаляются отдельно.
- Реальный YouTube API key и полный OAuth-вход не проверены: API key не предоставлен, согласие в браузере не проходилось. Эти сценарии покрыты transport/OAuth mocks, без выдачи mock-результата за live API.

Текущие результаты Preview и границы реальных интеграций — в [VERIFICATION.md](VERIFICATION.md). Desktop client secret храните на API-сервере; шаги выше про provider registration не требуют добавлять его в распространяемое приложение.
