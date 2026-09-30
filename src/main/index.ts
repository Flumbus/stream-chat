import { updatesEnabled } from '../shared/updater';
import { existsSync } from 'node:fs';
import { autoUpdater } from 'electron-updater';
import { UpdateService } from './services/UpdateService';
import { app, BrowserWindow, dialog, session, powerMonitor } from 'electron';
import { config } from 'dotenv';
if (!app.isPackaged) config({ quiet: true });
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { LocalChatBackend } from './services/LocalChatBackend';
import { registerIPC } from './ipc/register';
import { registerDesktopIPC } from './ipc/desktop';
import { loadWindowPreferences, trackWindow } from './services/WindowPreferences';
let backend: LocalChatBackend | undefined;
let quitting = false;
let updates: UpdateService | undefined;
if (process.env.STREAMCHAT_TEST_DATA) app.setPath('userData', process.env.STREAMCHAT_TEST_DATA);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.show();
    w?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      const directory = app.getPath('userData');
      await mkdir(directory, { recursive: true });
      backend = new LocalChatBackend(directory);
      await backend.initialize();
      powerMonitor.on('resume', () => {
        void backend?.resume();
      });
      session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
      );
      const geometry = loadWindowPreferences(directory);
      const window = new BrowserWindow({
        ...geometry.bounds,
        minWidth: Math.min(900, geometry.bounds.width),
        minHeight: Math.min(640, geometry.bounds.height),
        frame: false,
        backgroundColor: '#101213',
        title: 'StreamChat',
        icon: app.isPackaged
          ? join(process.resourcesPath, 'icon.ico')
          : join(app.getAppPath(), 'build/icon.ico'),
        autoHideMenuBar: true,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      if (geometry.maximized) window.maximize();
      trackWindow(window, directory);
      updates = new UpdateService(
        autoUpdater,
        app.getVersion(),
        updatesEnabled({
          packaged: app.isPackaged,
          platform: process.platform,
          portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR),
          installed: existsSync(join(process.resourcesPath, 'installed')),
          metadata: existsSync(join(process.resourcesPath, 'app-update.yml')),
        }),
        (state) => {
          if (!window.webContents.isDestroyed())
            window.webContents.send('desktop:update-state', state);
        },
        async () => {
          await backend?.close();
          quitting = true;
        },
        (await backend.snapshot()).settings.autoDownloadUpdates ?? true,
      );
      backend.subscribe((event) => {
        if (event.type === 'state')
          updates?.configure(event.snapshot.settings.autoDownloadUpdates ?? true);
      });
      registerDesktopIPC(window, updates);
      updates.start();
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      registerIPC(window, backend);
      if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged)
        await window.loadURL(process.env.ELECTRON_RENDERER_URL);
      else await window.loadFile(join(__dirname, '../renderer/index.html'));
      window.webContents.setZoomFactor((await backend.snapshot()).settings.uiScale / 100);
    })
    .catch(() => {
      if (quitting) return;
      dialog.showErrorBox(
        'StreamChat',
        'Не удалось запустить приложение. Проверьте доступ к папке локальных данных.',
      );
      app.exit(1);
    });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    updates?.close();
    if (quitting || !backend) return;
    event.preventDefault();
    quitting = true;
    void backend
      .close()
      .catch(() => undefined)
      .finally(() => app.quit());
  });
}
