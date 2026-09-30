# Security and privacy — Preview

## Boundaries

Electron renderer has sandbox + contextIsolation, no Node integration. Typed preload exposes explicit operations; IPC validates sender and payload. External navigation is a main-process HTTPS allowlist. Production ignores local `.env` and uses the fixed StreamChat API origin. OBS binds loopback; public message DTOs exclude OAuth credentials and original Safe Chat content.

OAuth sessions are encrypted locally with Electron safeStorage. Google code/PKCE verifier and refresh token are sent over HTTPS to the API token broker, then to Google's fixed token endpoint. They are never persisted by that server. This means the API operator is inside the OAuth trust boundary. PKCE and loopback state validation remain in Desktop; the broker is not a generic forwarding service. Twitch remains a public client.

The API restricts endpoints, fields, body size, response size, duration and rate. Logs contain only fixed route name, status and random request ID. Never enable request-body, Authorization-header or token logging in CapRover, reverse proxies or monitoring. API credentials are runtime environment values; no Docker build arguments carry secrets. Trust forwarded IPs only behind a controlled proxy that appends the real client IP.

## Before publishing

Run `node scripts/secret-scan.mjs` independently in both repositories, and `node scripts/artifact-scan.mjs` after packaging. `.env`, DBs, logs, credentials and release outputs are ignored. The scanner detects known token patterns and local secret values; it is a bounded check, not a guarantee against all credentials or an independent security audit.

Public Client IDs and the API base URL are safe configuration. Google client secret, YouTube API key, access/refresh tokens, signing certificates/passwords and GitHub publication tokens are private. Never put secrets into source, `VITE_*`, issues, screenshots or build artifacts.

## Preview limitations

The API has no product account/authentication layer. Its public YouTube quota can be consumed by anonymous callers; per-IP/global limits, bounded cache and an in-memory daily budget reduce abuse but do not provide distributed protection. Run one API replica initially, configure external rate protection, monitor provider quota, and request sufficient quota before scaling. Counters reset when the process restarts. OAuth is not verified against live production credentials by automated fixtures.

The current Windows artifact is unsigned. TLS and update hashes check transport/artifact integrity but do not replace Authenticode publisher verification. Configure a signing certificate before a signed public release. Automatic installation and downgrade are disabled.

If a credential is exposed, revoke/rotate it at its provider, replace the private environment value, and invalidate affected sessions. Removing the visible file does not remove a leaked credential from Git history. No private reporting contact has been designated yet; do not post exploit details or tokens in public issues.
