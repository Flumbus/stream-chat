import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
export type LogCategory =
  'app' | 'oauth' | 'twitch' | 'youtube' | 'websocket' | 'overlay' | 'database' | 'ipc';
const sensitive =
  /access.?token|refresh.?token|authorization|secret|cookie|password|device.?code|api.?key|^code$|^key$/i;
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sensitive.test(k) ? '[REDACTED]' : redact(v)]),
    );
  if (typeof value === 'string')
    return value
      .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
      .replace(
        /([?&](?:key|code|access_token|refresh_token|client_secret)=)[^&\s]+/gi,
        '$1[REDACTED]',
      );
  return value;
}
export class Logger {
  constructor(readonly directory: string) {}
  // Only fixed diagnostic codes are accepted; never serialize API errors, payloads or credentials.
  async write(
    level: 'debug' | 'info' | 'warn' | 'error',
    code: string,
    category: LogCategory = 'app',
    details?: Record<string, unknown>,
  ) {
    await mkdir(this.directory, { recursive: true });
    const safeCode = /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'UNCLASSIFIED_ERROR';
    await appendFile(
      join(this.directory, `${new Date().toISOString().slice(0, 10)}.log`),
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        category,
        code: safeCode,
        ...(details ? { details: redact(details) } : {}),
      }) + '\n',
    );
  }
}
