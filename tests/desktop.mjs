import { _electron as electron, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('test-results', { recursive: true });
const directory = await mkdtemp(resolve('test-results/session-'));
const errors = [];
const launch = () =>
  electron.launch({
    args: ['.'],
    env: { ...process.env, STREAMCHAT_TEST_DATA: directory },
    timeout: 45000,
  });
let app;
try {
  app = await launch();
  let page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Попробовать демо' }).click();
  await expect(page.locator('.message').first()).toBeVisible();
  await page.evaluate(() => window.streamchat.setRunning(false));
  const security = await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      sandbox: p.sandbox,
    };
  });
  expect(security).toEqual({ contextIsolation: true, nodeIntegration: false, sandbox: true });
  expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
  await page.screenshot({ path: 'test-results/chat-1440.png' });
  await page.evaluate(() => window.streamchat.setRunning(true));
  await page
    .getByRole('textbox', { name: 'Сообщение', exact: true })
    .fill('Проверка отправки из Electron');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByText('Проверка отправки из Electron', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Вы', exact: true }).last().click();
  await page.getByRole('button', { name: 'Заблокировать пользователя', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Подтвердить постоянный бан' })).toBeVisible();
  await page.getByRole('button', { name: 'Подтвердить постоянный бан' }).click();
  await expect(page.getByRole('button', { name: 'Снять блокировку' })).toBeVisible();
  await page.getByRole('button', { name: 'Снять блокировку' }).click();
  await expect(
    page.getByRole('button', { name: 'Заблокировать пользователя', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Удалить сообщение', exact: true }).click();
  await expect(page.getByText('Проверка отправки из Electron', { exact: true })).toHaveCount(0);
  const history = await page.evaluate(() => window.streamchat.getModerationHistory());
  expect(history).toHaveLength(3);
  await page.evaluate(async () => {
    await window.streamchat.generate('twitch', 'message', 1000);
    await window.streamchat.generate('youtube', 'message', 1000);
    await window.streamchat.generate('twitch', 'long', 1);
  });
  await expect
    .poll(() => page.evaluate(async () => (await window.streamchat.snapshot()).messages.length))
    .toBe(2000);
  expect(await page.locator('.message').count()).toBeLessThan(60);
  await page.evaluate(() => window.streamchat.setRunning(false));
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  for (const [width, height] of [
    [900, 640],
    [1280, 720],
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
      [width, height],
    );
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/chat-${width}.png` });
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  await page.getByRole('button', { name: 'Пузырьки', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название профиля' }).fill('Сохранённая тема');
  await page.getByRole('button', { name: 'Сохранить профиль' }).click();
  await expect(page.getByRole('button', { name: 'Сохранено', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/designer.png' });
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByLabel('Тема приложения', { exact: true }).selectOption('light');
  await expect(page.locator('.app')).toHaveClass(/theme-light/);
  for (const scale of ['100', '125', '150']) {
    await page.getByLabel('Масштаб интерфейса', { exact: true }).selectOption(scale);
    await expect
      .poll(() => page.evaluate(async () => (await window.streamchat.snapshot()).settings.uiScale))
      .toBe(Number(scale));
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
      ),
    ).toBe(Number(scale) / 100);
  }
  const nativeScreenshot = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
  );
  await writeFile('test-results/settings-light.png', Buffer.from(nativeScreenshot, 'base64'));
  const users = await page.evaluate(() => window.streamchat.getUsers());
  expect(users.length).toBeGreaterThan(10);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await expect(page.locator('.app')).toHaveClass(/theme-light/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const persisted = await page.evaluate(async () => ({
    state: await window.streamchat.snapshot(),
    users: await window.streamchat.getUsers(),
    history: await window.streamchat.getModerationHistory(),
  }));
  expect(persisted.state.profiles[0].name).toBe('Сохранённая тема');
  expect(persisted.state.settings.uiScale).toBe(150);
  expect(persisted.users.length).toBeGreaterThan(10);
  expect(persisted.history).toHaveLength(3);
  const invalid = await page.evaluate(async () => {
    try {
      await window.streamchat.generate('invalid', 'message', 1);
      return false;
    } catch {
      return true;
    }
  });
  expect(invalid).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify(
      {
        passed: true,
        security,
        boundedMessages: 2000,
        persistedUsers: persisted.users.length,
        moderationRecords: persisted.history.length,
        screenshots: 'test-results/',
        directory,
      },
      null,
      2,
    ),
  );
} finally {
  if (app) await app.close();
}
