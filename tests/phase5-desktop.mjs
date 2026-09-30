/* global fetch */
import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
await mkdir('test-results', { recursive: true });
const directory = await mkdtemp(resolve('test-results/phase5-'));
const env = { ...process.env, STREAMCHAT_TEST_DATA: directory };
const packaged = process.argv.includes('--packaged');
const app = await electron.launch({
  ...(packaged ? { executablePath: resolve('release/win-unpacked/StreamChat.exe') } : { args: ['.'] }),
  env, timeout: 45000,
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.locator('.app-version')).toHaveText('0.5.0 Alpha');
  expect(await page.title()).toBe('StreamChat 0.5.0 Alpha');
  expect(await page.evaluate(() => window.desktop.applicationInfo())).toEqual({
    version: '0.5.0', stage: 'Alpha',
  });
  await page.getByRole('button', { name: 'Попробовать демо', exact: true }).click();
  await expect(page.locator('.message').first()).toBeVisible();
  const overlayUrl = await page.evaluate(() => window.streamchat.overlayUrl('default'));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 640));
  const versionBox = await page.locator('.app-version').boundingBox();
  const connectionsBox = await page.locator('.connection-summary').boundingBox();
  expect(versionBox.x + versionBox.width).toBeLessThan(connectionsBox.x);
  await page.screenshot({ path: `test-results/phase5-titlebar${packaged ? '-packaged' : ''}.png`,
    animations: 'disabled' });

  // Capture the real Electron Tray/Menu when the locale changes. No production test hook.
  await app.evaluate(({ Tray }) => {
    globalThis.phase5Tray = { original: Tray.prototype.setContextMenu };
    Tray.prototype.setContextMenu = function (menu) {
      globalThis.phase5Tray.tray = this;
      globalThis.phase5Tray.menu = menu;
      return globalThis.phase5Tray.original.call(this, menu);
    };
  });
  await page.evaluate(async () => {
    const s = await window.streamchat.snapshot();
    await window.streamchat.saveSettings({ ...s.settings,
      desktop: { ...s.settings.desktop, locale: 'en' } });
  });
  await expect.poll(() => app.evaluate(() => Boolean(globalThis.phase5Tray.tray))).toBe(true);
  expect(await app.evaluate(() => globalThis.phase5Tray.tray.isDestroyed())).toBe(false);
  expect(await app.evaluate(() => globalThis.phase5Tray.menu.getMenuItemById('quit').label))
    .toBe('Quit StreamChat');
  await page.getByRole('button', { name: 'Hide to tray', exact: true }).click();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isDestroyed()))
    .toBe(false);
  expect((await fetch(overlayUrl)).status).toBe(200);
  await page.evaluate(() => window.streamchat.generate('twitch', 'message', 2));
  expect((await page.evaluate(() => window.streamchat.snapshot())).messages.length).toBeGreaterThan(0);
  await app.evaluate(() => globalThis.phase5Tray.tray.emit('click'));
  await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
  // Closing while minimized still permits a real second-instance launch to restore the window.
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.minimize();
    w.close();
  });
  await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
  const executable = await app.evaluate(({ app }) => app.getPath('exe'));
  const second = spawn(executable, packaged ? [] : ['.'], { env, windowsHide: true, stdio: 'ignore' });
  const exited = new Promise((resolve, reject) => {
    second.once('error', reject);
    second.once('exit', resolve);
  });
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return w.isVisible() && !w.isMinimized();
  })).toBe(true);
  expect(await exited).toBe(0);
  await page.evaluate(async () => {
    const s = await window.streamchat.snapshot();
    await window.streamchat.saveSettings({ ...s.settings,
      desktop: { ...s.settings.desktop, locale: 'ru' } });
  });
  await expect.poll(() => app.evaluate(() => globalThis.phase5Tray.menu.getMenuItemById('quit').label))
    .toBe('Выйти из StreamChat');
  await app.evaluate(({ Tray }) => { Tray.prototype.setContextMenu = globalThis.phase5Tray.original; });
  expect(errors).toEqual([]);
  // The real native menu callback must quit, rather than hide the window again.
  await Promise.all([
    app.waitForEvent('close'),
    app.evaluate(() => globalThis.phase5Tray.menu.getMenuItemById('quit').click()),
  ]);
  await expect(fetch(overlayUrl)).rejects.toThrow();
  console.log('Phase 5: version, tray hide/restore, live overlay, second instance and native menu exit passed');
} finally { await app.close(); }
