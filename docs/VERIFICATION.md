# Проверки StreamChat

## Phase 5, Alpha 0.5.0 — 30.09.2026

Typecheck/build/lint и сборка NSIS: PASS. Unit/integration: **166 tests / 23 files, PASS**. `test:phase4`, `test:phase5`, `test:release`, `test:packaged`: PASS. Phase 5 повторён непосредственно в новом packaged exe командой `node tests/phase5-desktop.mjs --packaged`: PASS. Дополнительный тест проверяет согласованность версии, имени, размера и SHA-512 релизного установщика с `latest.yml`, включая повреждённые файлы.

Проверены версия из main process в верхней панели при ширине 900 px, скрытие крестиком, восстановление через настоящий объект Electron Tray, сохранение работающего overlay в фоне, повторный запуск из свёрнутого/скрытого состояния, смена RU/EN меню и настоящий выход через callback нативного меню. Backend прекращает обслуживать overlay после выхода. Значок/меню проверены через API Electron; физические клики по области уведомлений Windows не автоматизировались.

Установщик: `release/StreamChat-Setup-0.5.0.exe`; `latest.yml` содержит 0.5.0. Скан app.asar: 3910 файлов, private-file/local-secret/credential-pattern совпадений нет. Не выполнялись установка/удаление на чистой Windows, завершение пользовательской сессии Windows, реальная установка обновления между двумя опубликованными релизами и публикация GitHub Release.

## Public Preview 0.4.0 — 30.09.2026

| Проверка | Результат |
| --- | --- |
| Desktop typecheck / lint / build | PASS |
| Desktop unit/integration | PASS: 145 tests / 20 files |
| API typecheck / compiler lint / build | PASS |
| API tests | PASS: 10 |
| Desktop / Appearance / OAuth / Phase4 / Motion / SafeChat / Release UX | Все 7 scripts PASS |
| Packaged EXE smoke | PASS: startup, bridge, preview, updater disabled in unpacked |
| NSIS package:win | PASS, 0.4.0 x64, unsigned |
| Working-tree secret scans | Desktop + API PASS |
| app.asar scan | PASS: 3910 files, no matching private files / local secret values |

Скриншоты в `test-results/release-*.png`, `packaged-preview.png` и предыдущих suites. API тесты используют настоящие локальные HTTP sockets с подменённым upstream. OAuth desktop fixture проверяет сохранение аккаунта и фокус возврата; браузер блокирует закрытие обычной вкладки, но вкладка, открытая скриптом, закрывается. Unit/fixture results не подтверждают реальный Google/Twitch login.

В текущем прогоне исправлены race тестового переключения locale, устаревший selector Timeout → Таймаут, узкая sidebar support-разметка и proxy path YouTube liveChat/messages. Проверки повторены после соответствующих исправлений. API тесты дополнены всеми fixed endpoint paths, opaque page tokens, production PORT и malformed token responses.

Нативный OBS, живые аккаунты, install/uninstall, CapRover/Docker runtime, GitHub Release/update, code signing и аппаратные DPI/мониторы не проверены. См. [полный отчёт](RELEASE_PASS.md).

---

## История проверок

## Дополнение Phase 4.8: команды и ссылки — 30.09.2026

| Проверка | Результат |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS: main, preload, desktop и OBS |
| `npm run lint` | PASS |
| `npm test` | PASS: 130 tests / 17 files |
| `npm run test:safechat` | PASS: Electron + Edge OBS, команды, ссылки, local original, доверие через ПКМ, отсутствие лишних наказаний, raw WS, HTML escaping |
| `npm run test:phase4` | PASS: регрессия Phase 4, defaults ссылок/команд и сохранение выбора |
| `npm run test:appearance` | PASS: плотности, размеры, Auto/Manual, emotes, preview/OBS |
| `npm run test:desktop` | PASS: IPC, чат, модерация, буфер, виртуализация, persistence |
| `npm run test:motion` | PASS: motion и Reduced Motion |
| `npm run test:oauth` | PASS: mock provider, сохранение аккаунта и возврат в приложение |

Unit-тесты дополнены случаями command show/mask/hide, префиксами, обычным `!` в конце, всеми нужными формами URL, несколькими ссылками, whitespace, link-only, ролями и реальными normalizer outputs Twitch/YouTube. Проверены subscriber opt-in, platform-scoped ID trust, отсутствие доверия по имени/подписи значка, сохранение emotes, разбитые/несогласованные fragments, email/version/obfuscation, reply, независимость настроек, defaults/migration и отсутствие наказания только за команду/URL. Нежелательное слово в оригинале по-прежнему обнаруживается независимо от маскирования.

Настоящий loopback WebSocket проверяет начальный snapshot, обновление настроек, reconnect и два одновременно подключённых клиента. Пустое сообщение не создаёт incremental packet, исходные команды/URL и локальные annotations отсутствуют в public JSON. Отдельная регрессия: 250 скрытых ссылок не вытесняют видимое сообщение при применении display limit.

В Electron и Edge проверено, что `<img onerror>` и `<script>` при выключенных текстовых фильтрах остаются текстом: соответствующих DOM-элементов и выполнения скрипта нет. Поиск `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML` в renderer/overlay не обнаружил совпадений.

После последней правки порядка sanitize/filter/limit повторно прошли typecheck, build, lint, весь набор из 130 тестов (включая новую WS-регрессию), motion и OAuth. Остальные desktop-сценарии прошли до этой локальной правки. Реальные аккаунты и нативный OBS этим не проверены; тестовые данные изолированы. Детектор намеренно не обещает распознавание замаскированных пробелами доменов.

Ниже сохранены исторические результаты предыдущих checkpoint.

## Итог Phase 4.7–4.8 — 29.09.2026

| Проверка | Результат |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS: main, preload, desktop renderer, OBS renderer |
| `npm run lint` | PASS |
| `npm test` | PASS: 100 tests / 17 files |
| `npm run test:desktop` | PASS: IPC isolation, модерация, окно, буфер 2000, виртуализация, persistence |
| `npm run test:appearance` | PASS: 3 densities, 10/40 px, Auto/Manual, темы/шрифты, shared preview/OBS, Edge Chromium |
| `npm run test:oauth` | PASS на mock provider: ошибки, сохранение канала, focus return, script-opened tab close |
| `npm run test:phase4` | PASS: Simple/Experimental, native clipboard, context menu/keyboard/moderation, filters/fonts/window |
| `npm run test:motion` | PASS: moving indicator, sidebar, Reduced Motion, theme switch, accordion, dirty/save, inline copy, selection/panel |
| `npm run test:safechat` | PASS: defaults, dictionary editor, custom timeout, platform flags, local original/button/ПКМ, backend timeout+history, sanitized OBS frames, restart |

Новые unit-тесты проверяют варианты Unicode/регистра/разделителей/транслитерации/смешанных алфавитов/leet/repeats, фразы, boundaries/allowlist, отсутствие fuzzy, literal dictionary input, compatibility defaults, soft/blocked, fragments/reply/metadata, Kind Mode, cache invalidation, независимость фильтрации/наказаний, все четыре наказания, timeout 3600/custom 47, обе платформы, read-only/capability/offline/protected guards, дедупликацию/cooldown и API errors. `safeChat-overlay.test.ts` поднимает настоящий loopback WebSocket server и проверяет raw JSON начального snapshot, incremental donation, settings refresh и reconnect: оригинала и локальных ruleIds нет.

Визуально проверены `test-results/safechat-settings.png`, `safechat-chat.png`, `motion-chat.png`. Проверка выполнялась в изолированных test data directories, без использования `.env` для входа в реальные аккаунты. Unit-предупреждение Node об experimental SQLite не является падением теста.

Реальные Twitch/YouTube OAuth/scopes/role permissions, rate/quota responses и нативный OBS остаются ручной проверкой; mock/Edge не выдаются за реальную платформенную валидацию. Стандартная вкладка OAuth может не закрываться из-за политики браузера, script-opened закрывается; предусмотрен возврат в приложение.

Ниже — предыдущие проверки и отдельный checkpoint 4.7, сохранённые как история.

---


## Исправление Clipboard и видимости удаления — 29.09.2026

- Все шесть вызовов браузерного `navigator.clipboard.writeText` заменены на узкий `DesktopBridge.copyText`. Main вызывает Electron clipboard; общий запрет browser permissions сохранён. Чтение системного буфера renderer не предоставляется. IPC проверяет окно/main frame, строковый payload и лимит 1 000 000 символов.
- Пункт «Удалить сообщение» больше не исчезает при отсутствии доступа: disabled-пункт поясняет read-only канал, отключение, отсутствие прав или защищённого пользователя. Реальные права и проверки backend не ослаблены.
- Typecheck, build, lint и 54 unit-теста прошли. Дополнен test:phase4: копирование OBS URL, текста и имени, недоступное удаление при отключении и остальной сценарий — exit code 0.
- В clipboard-тестах конечная запись Electron подменяется для проверки аргументов, ошибок, чужого окна/subframe и некорректного payload. Содержимое пользовательского системного буфера не читается и не перезаписывается тестами. Это проверка UI → preload → IPC → native API call, не физического содержимого буфера Windows.

## Phase 4.2–4.6 — 29.09.2026

Подробности реализации и ручные ограничения: [PHASE4.md](PHASE4.md).

| Команда                 | Результат                                                                                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run typecheck       | Пройдено отдельно и в составе build                                                                                                                                                                                                          |
| npm run build           | Main, preload, desktop renderer и Browser Source собраны                                                                                                                                                                                     |
| npm run lint            | Пройдено после исправления browser globals в тесте                                                                                                                                                                                           |
| npm test                | 13 файлов, 52 теста                                                                                                                                                                                                                          |
| npm run test:desktop    | Пройдено: безопасный preload, demo send/moderation, буфер 2 000, DOM < 60, 900–3840 px, масштаб, persistence                                                                                                                                 |
| npm run test:oauth      | Пройдено: имитация Google API, ошибка/успех, сохранение канала, возврат и восстановление окна, browser-close fallback                                                                                                                        |
| npm run test:appearance | Пройдено: 3 плотности, 10/40 px, Manual, длинные сообщения/emotes, общий preview/OBS стиль, системный Consolas через HTTP/WS                                                                                                                 |
| npm run test:phase4     | Пройдено: simple default/Experimental, Advanced, меню ПКМ и клавиатура, timeout/ban/unban/delete, звуки/громкость/motion, реальные системные шрифты, поиск/RU/EN/отмена/сохранение, центрирование, controls окна/фактический close/геометрия |

Новые unit-тесты проверяют defaults старых DesktopPreferences, независимые experimental flags, сохранение профилей, геометрию исчезнувшего/отрицательного монитора, capabilities demo/read-only/protected user, валидацию и fallback шрифтов. SoundService проверен с заменой AudioContext: mute не создаёт звук, громкость меняет envelope, повторные сигналы подавляются, test sound работает отдельно.

Визуально просмотрены `test-results/phase4-fonts.png` и `phase4-settings.png`; найденное смещение font modal исправлено portal-рендерингом. Центрирование теперь проверяется по координатам. Другие снимки: `phase4-start.png`, `chat-*.png`, `designer.png`, `appearance-*.png`, `oauth-*.png`.

Обнаружено и исправлено незавершение теста из-за закрытия последнего окна до загрузки страницы: тест ждёт готовности, main не показывает startup-error при уже начатом выходе. Финальные процессы всех четырёх Electron suites завершились с exit code 0; тест кнопки Close вызывает настоящее закрытие.

Что не подтверждается этими тестами: реальный OAuth/модерация аккаунтов, нативный OBS, аппаратный drag/snap/multi-monitor DPI, субъективное качество звука. Windows fonts перечислены на реальной машине, но полнота glyph coverage каждого семейства не гарантируется. Playwright OAuth проверяет заглушки API, а не учётную запись пользователя. Старые тексты backend/части чата всё ещё RU; новые controls поддерживают RU/EN.

## Phase 4.1 — упрощённый интерфейс

- Простой режим по умолчанию, переключение Experimental, доступность Advanced без Experimental, сохранение фильтров и отправителя проверены новым `test:phase4` в Electron.
- Старые настройки получают defaults без удаления developerMode/профилей. Введён сериализованный optimistic settings update; исправлена задержка checkbox после асинхронного сохранения.
- Build/typecheck, lint, 44 unit-теста, существующие desktop и OAuth тесты прошли. Onboarding больше не модальное окно; тесты адаптированы к входу непосредственно из чата. Успешный OAuth автоматически открывает чат.
- Живые внешние аккаунты не подключались; контроль URL-каналов при выключенном Experimental оставлен в UI. Автоматизированные проверки не подтверждают live OAuth.

## Возврат из Google OAuth — 29.09.2026

- Страница callback оформлена в тёмной теме; отображает ожидание, успешное сохранение аккаунта либо безопасный текст ошибки. Код авторизации удаляется из адреса, токены не передаются странице.
- Успех показывается после получения канала и записи аккаунта в SQLite / токенов в safeStorage. Обработаны отсутствие Client secret, неверные OAuth credentials, выключенный YouTube Data API и отсутствие канала/аватара.
- Кнопка через защищённый локальный POST восстанавливает и фокусирует окно Electron, затем вызывает window.close(). Браузер может запретить закрытие обычной вкладки; предусмотрена подсказка для ручного закрытия.
- Тесты проверяют state, PKCE, повторный callback, срок жизни локальной страницы, ожидание сохранения, ошибки и отсутствие утечки credentials.
- Новый `npm run test:oauth`: реальный Electron + Edge, имитация Google API, ошибка обмена кода, успешная запись канала без аватара/эфира, перезапуск, возврат в свёрнутое приложение и закрытие вкладки при разрешении браузера. Снимки `test-results/oauth-*.png`.
- В пользовательском `.env` проверено наличие Google Client Secret без вывода его значения. Реальную авторизацию после изменения должен завершить пользователь в браузере.
- `npm run typecheck`, `npm run build`, `npm run lint`, `npm test` (41 тест), `npm run test:oauth`, `npm run test:desktop`: успешно. Edge подтвердил закрытие вкладки, открытой скриптом, и fallback для обычной вкладки с историей.

## Подключение по ссылкам — 29.09.2026

- 37 unit/integration-тестов; новые проверки URL allowlist/canonicalization, IRC identities/emotes/delete/clear, single connection, read-only enforcement, API-key YouTube streamList/resume, понятных ошибок ключа и repository persistence.
- `npm run typecheck` (также внутри build), `npm run build`, `npm run lint`, `npm test`, `npm run test:desktop`, `npm run test:appearance`: успешно.
- Реальный Twitch guest handshake и JOIN подтверждены. WebSocket-команды отправляются отдельными фреймами.
- Electron smoke: UI добавления Twitch/YouTube, connected Twitch, ошибка отсутствующего YouTube API key, запрет send, сохранение двух отключённых ссылок после restart, удаление. Снимок `test-results/channel-links.png`.
- Присланные Client ID Twitch и Google записаны в локальный `.env`; значения не включены в исходники и документацию. Реальный YouTube чат и полный OAuth-вход не проверены: API key не предоставлен, согласие в браузере не проходилось; mocks не обозначаются как live API.

## Дополнительная проверка UX отображения — 28.09.2026

- `npm run typecheck`, `npm run build`, `npm run lint`: успешно.
- `npm test`: 29 тестов, включая 7 новых для автоматических расчётов, миграции JSON, ручных значений, лимита и точечного сброса.
- `npm run test:desktop`: прежняя проверка Electron проходит; глобальный буфер 2000, DOM меньше 60 строк, persistence и zoom 100/125/150% сохранены.
- `npm run test:appearance`: настоящий Electron и Edge Chromium; три плотности, минимальный/максимальный текст, ручной аватар и возврат Auto, ограничения строк, фильтры, reset, общие CSS-значения preview/OBS, обновление профиля по WebSocket и повторный запуск.
- Редактор проверен при размерах окна 900×640, 1440×960, 1920×1080 и 3840×2160; снимки `test-results/appearance-*.png`. Горизонтального overflow нет. Визуально просмотрены редактор на 900/1440 и preview при крайних размерах текста.
- Live OAuth и нативный OBS в этой UX-итерации не проверялись. [Описание расчётов и ограничений](CHAT_APPEARANCE.md).

## Предыдущая проверка базовой версии

Проверено 27.09.2026 на Windows x64 / Node 24.12.0 / Electron 44.4.5.

- `npm run build`: TypeScript и production bundles main / preload / renderer / SQLite worker.
- `npm run lint`: ESLint.
- `npm test`: 4 теста; upgrade schema, rollback, future version rejection, local persistence, identity separation, mock lifecycle и IPC validation.
- `npm run test:desktop`: реальный Electron с отдельным профилем, onboarding, отправка, подтверждение ban, unban, удаление, запись истории и повторный запуск.
- Два пакета по 1 000 сообщений: память ограничена 2 000, в DOM менее 60 message rows.
- После перезапуска: сохранён профиль Bubble с новым названием, Light theme, масштаб 150%, 17 тестовых зрителей и 3 moderation records.
- Проверены размеры окна 900×640, 1280×720, 1440×960, 1920×1080, 2560×1440, 3840×2160. Снимки — `test-results/`. Это программные размеры окна, не лабораторная проверка разных физических дисплеев.
- Проверены Electron zoom 100%, 125%, 150%; это не смена системного DPI Windows.
- Проверены contextIsolation=true, nodeIntegration=false, sandbox=true и отсутствие window.require.
- Визуально просмотрены чат на минимальном/обычном размере, редактор Bubble с длинным сообщением и светлая тема.

Ограничения: не проверялись реальные API, OAuth, восстановление внешних сетевых соединений, OBS, installer, signing или tray — эти функции не входят в текущую Phase 1. `node:sqlite` в используемом Node выводит ExperimentalWarning; SQLite интеграционные проверки прошли, runtime зафиксирован lockfile.

## Phase 4.7 — Motion & Microinteractions (2026-09-29)

Реализованы единые интервалы 90/140/190/240 ms и enter/exit/move easing; двухфазный переход страниц; перемещаемые индикаторы навигации, платформ, событий, профилей, шрифтов и контекстного меню. Sidebar согласует ширину и подписи; карточка зрителя закрывается с exit и меняет содержимое без закрытия. Новые видимые строки чата анимируются один раз, возврат виртуальных строк не повторяет анимацию. Сохраняется виртуализация и лимит 2000.

Добавлены статусы подключения и spinner, подсветка выбора, направление перехода submenu, анимированные checkbox/slider и Advanced/diagnostics accordion, ограниченный stagger Experimental, короткая смена preview только в desktop. Копирование через защищённый native clipboard показывает inline Check на 1,4 секунды; профиль показывает dirty и временное «Сохранено» без отдельного toast. Toast имеет сворачивание занимаемой высоты, приостановку таймера и progress только для auto-dismiss. Error/warning не исчезают автоматически. Reduced Motion отключает движение, циклические анимации и переходы; системное изменение отслеживается.

Проверено: typecheck, build, lint, 54 unit tests, test:desktop, test:appearance, test:oauth (mock provider), test:phase4 и новый test:motion — PASS. Визуально проверен test-results/motion-chat.png. Новые тесты проверяют состояние навигации, Reduced Motion, accordion, dirty/save, copy и открытие/закрытие панели; существующий Phase 4 покрывает keyboard submenu, sidebar/window и сохранение настроек. Покадровые эталоны анимаций не используются. Реальные OAuth/permissions остаются отдельной ручной проверкой.

Следующий этап: 4.8 Safe Chat; web/cloud/remote/subscriptions не входят в текущую работу.
