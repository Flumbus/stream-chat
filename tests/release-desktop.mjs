import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
await mkdir('test-results', { recursive: true });
const directory = await mkdtemp(resolve('test-results/release-'));
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, STREAMCHAT_TEST_DATA: directory },
  timeout: 45000,
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Изменить шрифт' })).toHaveCount(0);
  await expect(page.getByLabel('Стиль основного чата')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toHaveAttribute('data-phase', 'exiting');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await page.screenshot({ animations: 'disabled', path: 'test-results/release-settings.png' });
  await page.getByLabel('Включить экспериментальные функции', { exact: true }).check();
  await page.getByRole('button', { name: 'Dev Tools', exact: true }).click();
  await expect(page.getByLabel('Режим разработчика', { exact: true })).toBeVisible();
  // Simulate a persisted preferences update while the developer route is open.
  await page.evaluate(async () => {
    const { settings } = await window.streamchat.snapshot();
    await window.streamchat.saveSettings({
      ...settings,
      desktop: {
        ...settings.desktop,
        experimental: { ...settings.desktop.experimental, enabled: false },
      },
    });
  });
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Настройки', exact: true })).toHaveAttribute(
    'data-current',
    'true',
  );
  await expect(
    page.getByRole('button', { name: 'Dev Tools', exact: true }),
  ).toHaveCount(0);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 640));
  await page.getByRole('heading', { name: 'Настройки', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ animations: 'disabled', path: 'test-results/release-settings-min.png' });
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  for (const name of [
    'Современный',
    'Минимализм',
    'Пузырьки',
    'В стиле Twitch',
    'В стиле YouTube',
    'Оверлей',
    'Неон',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.preview-canvas .message').first()).toBeVisible();
  }
  await page.getByLabel('Цвет имён', { exact: true }).selectOption('role');
  await expect(page.getByLabel('Создатель канала', { exact: true })).toBeVisible();
  await page.getByLabel('Цвет имён', { exact: true }).selectOption('single');
  await expect(page.getByLabel('Один цвет', { exact: true })).toBeVisible();
  await expect(page.locator('.preview-canvas .username').first()).toHaveCSS(
    'color',
    'rgb(194, 153, 255)',
  );
  await page.screenshot({ animations: 'disabled', path: 'test-results/release-appearance.png' });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByLabel('Язык интерфейса').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chat safety', exact: true })).toBeVisible();
  expect(
    (await page.locator('main h1, main h3, main p, main button').allTextContents()).join(' '),
  ).not.toMatch(/[А-Яа-яЁё]/u);
  await page.screenshot({ animations: 'disabled', path: 'test-results/release-settings-en.png' });
  await page.getByRole('button', { name: 'Configure chat safety', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Blocked words', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Interface language').selectOption('ru');
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => (await window.streamchat.snapshot()).settings.desktop.locale),
    )
    .toBe('ru');
  await page.evaluate(async () => {
    const s = await window.streamchat.snapshot();
    await window.streamchat.saveSettings({
      ...s.settings,
      desktop: {
        ...s.settings.desktop,
        feedback: { ...s.settings.desktop.feedback, reducedMotion: 'on' },
      },
    });
  });
  const fixture = await page.evaluate(() => window.streamchat.snapshot());
  fixture.accounts = ['twitch', 'youtube'].map((platform) => ({
    id: 'fixture-' + platform,
    platform,
    platformAccountId: 'fixture',
    username: 'flamberor',
    displayName: 'flamberor',
    scopes: [],
    authStatus: 'authorized',
    connectionStatus: 'connected',
    capabilities: {
      send: true,
      delete: false,
      ban: false,
      timeout: false,
      unban: false,
      readProfile: false,
    },
    channel: { id: 'fixture', channelId: 'fixture', title: 'Preview channel', live: true },
  }));
  await app.evaluate(
    ({ BrowserWindow }, snapshot) =>
      BrowserWindow.getAllWindows()[0].webContents.send('chat:event', { type: 'state', snapshot }),
    fixture,
  );
  await page.getByRole('button', { name: 'Аккаунты', exact: true }).click();
  await expect(page.locator('.connected-account')).toHaveCount(2);
  await expect(
    page.getByText('Для модерации требуется повторный вход', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/release-accounts-connected.png',
  });
  await page.clock.install();
  fixture.accounts[0].connectionStatus = 'error';
  fixture.accounts[0].lastError = 'Fixture connection unavailable';
  fixture.accounts[1].connectionStatus = 'reconnecting';
  await app.evaluate(
    ({ BrowserWindow }, snapshot) =>
      BrowserWindow.getAllWindows()[0].webContents.send('chat:event', { type: 'state', snapshot }),
    fixture,
  );
  await expect(page.locator('.account-error')).toBeVisible();
  await expect(page.locator('.feedback-toast.warning').first()).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/release-accounts-error.png',
  });
  await page.locator('.feedback-toast.warning').first().hover();
  await page.clock.runFor(8000);
  await expect(page.locator('.feedback-toast.warning').first()).toBeVisible();
  await page.mouse.move(400, 100);
  await page.clock.runFor(7100);
  await expect(page.locator('.feedback-toast.warning')).toHaveCount(0);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('chat:event', {
      type: 'error',
      message: 'Fixture error',
    }),
  );
  await expect(page.locator('.feedback-toast.error')).toBeVisible();
  await page.clock.runFor(9100);
  await expect(page.locator('.feedback-toast.error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  const states = ['checking', 'update-available', 'downloading', 'downloaded', 'error'];
  for (const phase of states) {
    await app.evaluate(
      ({ BrowserWindow }, phase) =>
        BrowserWindow.getAllWindows()[0].webContents.send('desktop:update-state', {
          enabled: true,
          installedVersion: '0.4.0',
          availableVersion: '0.4.1',
          phase,
          progress: 42,
          error: phase === 'error' ? 'UPDATE_FAILED' : undefined,
        }),
      phase,
    );
    await page.locator('.update-settings').scrollIntoViewIfNeeded();
    await page.screenshot({
      animations: 'disabled',
      path: `test-results/release-update-${phase}.png`,
    });
  }
  await expect(
    page.getByText('Не удалось обновиться. Проверьте интернет и повторите позже.', { exact: true }),
  ).toBeVisible();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('desktop:update-state', {
      enabled: true, installedVersion: '0.4.1', phase: 'error', error: 'UPDATE_NOT_PUBLISHED',
    }),
  );
  await expect(page.getByText('Обновления ещё не опубликованы. Приложением можно пользоваться.', {
    exact: true,
  })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Проверить обновления', exact: true })).toBeEnabled();
  await page.screenshot({ animations: 'disabled', path: 'test-results/release-update-not-published.png' });
  await page.locator('.workspace-label button').click();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/release-sidebar-collapsed.png',
  });
  expect(errors).toEqual([]);
  console.log(
    'Release UX, RU/EN, AccountCard fixtures, warning/error timers and updater states passed',
  );
} finally {
  await app.close();
}
