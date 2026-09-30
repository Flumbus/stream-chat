import { ipcMain, type BrowserWindow } from 'electron';
import { z } from 'zod';
import {
  moderationSchema,
  platformSchema,
  profileSchema,
  settingsSchema,
} from '../../shared/validation';
import type { LocalChatBackend } from '../services/LocalChatBackend';
import { PlatformError, readableError } from '../../platforms/common/errors';
export function registerIPC(window: BrowserWindow, backend: LocalChatBackend) {
  const handle = <S extends z.ZodType>(
    channel: string,
    schema: S,
    handler: (input: z.output<S>) => Promise<unknown>,
  ) => {
    ipcMain.handle(channel, async (event, input: unknown) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
        return { ok: false, error: 'Запрос отклонён.' };
      const parsed = schema.safeParse(input);
      if (!parsed.success) return { ok: false, error: 'Некорректные параметры запроса.' };
      try {
        return { ok: true, value: await handler(parsed.data) };
      } catch (error) {
        await backend.logger.write(
          'error',
          error instanceof PlatformError ? error.code : 'IPC_OPERATION_FAILED',
          'ipc',
        );
        return {
          ok: false,
          error: readableError(error),
        };
      }
    });
  };
  handle('chat:original', z.string().min(1).max(500), (key) => backend.originalMessage(key));
  handle('chat:snapshot', z.undefined(), () => backend.snapshot());
  handle('chat:running', z.boolean(), (v) => backend.setRunning(v));
  handle(
    'chat:send',
    z
      .object({ accountId: z.string().max(100), message: z.string().trim().min(1).max(500) })
      .strict(),
    (v) => backend.send(v.accountId, v.message),
  );
  handle('chat:moderate', moderationSchema, (v) => backend.moderate(v));
  handle('chat:users', z.undefined(), () => backend.getUsers());
  handle('chat:history', z.undefined(), () => backend.getModerationHistory());
  handle('chat:settings', settingsSchema, (v) => backend.saveSettings(v));
  handle('chat:profile', profileSchema, (v) => backend.saveProfile(v));
  handle(
    'chat:generate',
    z
      .object({
        platform: platformSchema,
        scenario: z.enum([
          'message',
          'member',
          'donation',
          'long',
          'emotes',
          'moderator',
          'banned',
        ]),
        count: z.number().int().min(1).max(1000),
      })
      .strict(),
    (v) => backend.generate(v.platform, v.scenario, v.count),
  );
  handle('chat:logs', z.undefined(), () => backend.openLogs());
  const id = z.string().min(1).max(100);
  handle(
    'account:authorize',
    z.object({ platform: platformSchema, moderation: z.boolean() }).strict(),
    (v) => backend.authorize(v.platform, v.moderation),
  );
  handle('account:cancel', platformSchema, (v) => backend.cancelAuthorization(v));
  handle(
    'account:action',
    z.object({ id, action: z.enum(['connect', 'disconnect', 'logout']) }).strict(),
    (v) => backend.accountAction(v.id, v.action),
  );
  handle(
    'account:link',
    z.object({ platform: platformSchema, url: z.string().trim().min(1).max(2048) }).strict(),
    (v) => backend.addChannelLink(v.platform, v.url),
  );
  handle('account:channels', id, (v) => backend.listChannels(v));
  handle('account:select', z.object({ id, target: z.string().min(1).max(200) }).strict(), (v) =>
    backend.selectChannel(v.id, v.target),
  );
  handle('account:user', z.object({ accountId: id, userId: id }).strict(), (v) =>
    backend.getUserCard(v),
  );
  const profileId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
  handle('overlay:url', profileId, (v) => backend.overlayUrl(v));
  handle('overlay:open', profileId, (v) => backend.openOverlay(v));
  handle('overlay:reset', profileId, (v) => backend.resetOverlay(v));
  return backend.subscribe((event) => {
    if (window.isDestroyed()) return;
    if (event.type === 'state')
      window.webContents.setZoomFactor(event.snapshot.settings.uiScale / 100);
    window.webContents.send('chat:event', event);
  });
}
