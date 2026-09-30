# Phase 2–3 implementation plan

Продолжение: [Phase 4 — план](PHASE4_PLAN.md), [реализованный desktop UX](PHASE4.md). Phase 4 завершена в коде и автоматизированных проверках; реальные внешние интеграции проверяются отдельно.

Новая нумерация задания: Phase 2 = Twitch + YouTube; Phase 3 = локальный OBS. Старые SQL migrations 001–003 неизменны.

1. Расширить общие DTO без секретов, capabilities, account/session/ban/overlay migrations.
2. SafeStorage vault, OAuth device/PKCE, single-flight refresh, persisted account repository.
3. Twitch Helix + EventSub lifecycle, normalization/dedup, permissions.
4. YouTube gRPC streamList по официальному proto, выбор live broadcast, write/moderation API, persisted ban IDs.
5. ConnectionManager: отмена, single-flight start, capped backoff+jitter, resume после sleep.
6. Loopback HTTP/WS server с persistent random profile keys, versioned snapshot/deltas и ограничениями.
7. Общий overlay renderer, lifetime/animations, Accounts/Chat/Overlays/diagnostics UI.
8. Transport-mock и integration tests, regression Phase 1, Electron + browser verification.
9. Обновить README, architecture, verification; добавить OAuth/OBS setup.

API проверены 27.09.2026: Twitch public DCF без secret; EventSub WebSocket с user token; Google installed-app PKCE loopback; YouTube streamList = gRPC (не SSE/WS). YouTube unban требует ban resource ID. Credentials не запрашиваются токенами вручную: при отсутствии client configuration live-login отмечается непроверенным, production transport проверяется mocks.
