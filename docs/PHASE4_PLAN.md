# Текущий этап — public Preview 0.4.0

Phase 4.7/4.8 сохранены и регрессионно проверены. Новый UX + API + release pass описан в [RELEASE_PASS.md](RELEASE_PASS.md). Реализация и локальные проверки готовы; production deploy, GitHub publication, выбор лицензии, signing и live acceptance остаются владельцу.

## Исторический checkpoint

# Phase 4.7–4.8 — выполнено с дополнением, 30.09.2026

1. Изучены текущие документы, preferences, renderers, notifications, backend, platform capabilities и persistence.
2. Завершена 4.7: motion/UI feedback → отдельные проверки → документация.
3. Завершена 4.8: matcher/display/automoderation → безопасный OBS DTO и local-only original IPC → settings/context/history UI → unit/desktop/OBS проверки → документация.
4. В существующий Safe Chat pipeline встроены команды show/mask/hide, удаление URL зрителей, централизованное доверие ролям/ID, исключение пустого display из OBS, компактные настройки и совместимость старых профилей. Display policies не добавляют наказаний; оригинал доступен локально.
5. Итог: 130 unit/integration tests и шесть desktop regression scripts проходят. Проверены HTML escaping в Electron/Edge и отсутствие оригиналов/пустых строк в raw OBS WS. Реальные платформенные permissions и нативный OBS требуют ручного прогона.

Облако, web, remote, платные подписки, лицензирование и внешние донаты не добавлялись. Пользовательские данные и .env сохранены.

---

## Исходный план и история

# Phase 4 — Desktop UX & Interaction Polish

## Продолжение: 4.7 и 4.8

1. **4.7, текущая работа:** централизованные motion durations/easing; управляемые enter/exit страниц и панелей; moving indicators навигации/фильтров/меню/шрифтов; status/reconnect/copy/save feedback; accordion, toast reflow/progress, theme/controls transitions. Сохранить Reduced Motion, клавиатуру и виртуализацию. Затем полный регрессионный набор и обновление документов.
2. **4.8, после проверки 4.7:** общий кэшируемый matcher с нормализацией/границами/исключениями; отдельные detection, display policy и punishment decision; sanitized DTO до HTTP/WS; локальное раскрытие original; независимые настройки filtering/automod и платформ, словарь, наказания, экспериментальный Kind Mode. Проверить отсутствие original во всех OBS путях, capability/read-only ограничения, историю и миграцию preferences. Затем полный набор тестов и отдельное обновление документов.

Никаких Web/remote/cloud/subscription или внешних donation services. Существующие demo donations остаются.

Начато 29.09.2026. Основа: существующие ChatBackend, SQLite JSON settings, AccountService, общий ChatRenderer/OverlayRenderer и typed IPC. Web, remote backend, подписки и лицензирование не входят в работу.

Завершено 29.09.2026: все шесть итераций реализованы; результаты и ручные ограничения — [PHASE4.md](PHASE4.md) и [VERIFICATION.md](VERIFICATION.md). Command Palette оставлена как необязательная будущая задача.

1. **4.1 Simplified UX:** чат как стартовая страница и встроенный onboarding, простые аккаунты/OBS, Experimental Features с отдельными типизированными флагами, сохранение фильтров/отправителя. Advanced Appearance независимо от экспериментальных функций.
2. **4.2 Desktop shell:** frameless BrowserWindow, безопасные команды окна, собственная панель, сохранение геометрии с проверкой доступных дисплеев, shortcuts.
3. **4.3 Chat interactions:** собственное меню сообщений/зрителей, клавиатура, submenu timeout, подтверждение постоянного бана, capabilities.
4. **4.4 Motion & feedback:** единая motion system, reduced motion Windows/пользователь, уведомления, ненавязчивые звуки и громкость.
5. **4.5 Fonts:** безопасное получение списка системных шрифтов, виртуальный поиск и preview, сохранение и fallback в общем renderer.
6. **4.6 Polish:** RU/EN новых функций, доступность, адаптивность, полный регрессионный набор.

Каждая итерация проверяется отдельно с обновлением PROJECT_SUMMARY.md и VERIFICATION.md. Реальный OAuth и модерация внешних аккаунтов не считаются проверенными на основании transport mocks. Настройки .env и секреты не включаются в документацию или вывод.
