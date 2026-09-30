import { externalLinks, allowedExternalUrl } from '../../shared/links';
import type { UpdateService } from '../services/UpdateService';
import { app, shell, clipboard, ipcMain, type BrowserWindow } from 'electron';
import { RELEASE_STAGE } from '../../shared/appVersion';
import { z } from 'zod';
import { listSystemFonts } from '../services/SystemFonts';
export function registerDesktopIPC(window: BrowserWindow, updater?: UpdateService) {
  const state = () => ({ maximized: window.isMaximized() });
  const send = () => {
    if (!window.webContents.isDestroyed()) window.webContents.send('desktop:state', state());
  };
  window.on('maximize', send);
  window.on('unmaximize', send);
  const handle = <T extends z.ZodType>(
    channel: string,
    schema: T,
    action: (value: z.output<T>) => unknown,
  ) =>
    ipcMain.handle(channel, (event, value: unknown) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
        throw new Error('Request denied');
      const input = schema.parse(value);
      return action(input);
    });
  handle('desktop:external', z.enum(['boosty', 'donationAlerts', 'developer']), async (link) => {
    const url = externalLinks[link];
    if (!allowedExternalUrl(url)) throw new Error('URL denied');
    await shell.openExternal(url);
  });
  handle('desktop:application-info', z.undefined(), () => ({
    version: app.getVersion(), stage: RELEASE_STAGE,
  }));
  handle(
    'desktop:update-state',
    z.undefined(),
    () => updater?.snapshot() ?? { phase: 'idle', installedVersion: 'dev', enabled: false },
  );
  handle('desktop:update-action', z.enum(['check', 'download', 'install']), (action) =>
    updater?.action(action),
  );
  handle('desktop:state', z.undefined(), state);
  handle('desktop:fonts', z.undefined(), listSystemFonts);
  handle('desktop:copy-text', z.string().max(1_000_000), async (text) => {
    await clipboard.writeText(text);
  });
  handle('desktop:action', z.enum(['minimize', 'maximize', 'close']), (action) => {
    if (action === 'minimize') window.minimize();
    if (action === 'maximize') {
      if (window.isMaximized()) window.unmaximize();
      else window.maximize();
    }
    if (action === 'close') setImmediate(() => window.close());
  });
}
