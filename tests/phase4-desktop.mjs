import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
await mkdir('test-results', { recursive: true });
const directory = await mkdtemp(resolve('test-results/phase4-'));
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByRole('heading', { name: 'Добро пожаловать в StreamChat' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Capture native writes without reading or replacing the user's system clipboard.
  await app.evaluate(({ clipboard }) => {
    clipboard.writeText = async (text) => {
      globalThis.phase4CopiedText = text;
    };
  });
  await page.screenshot({ path: 'test-results/phase4-start.png' });
  await page.getByRole('button', { name: 'Аккаунты', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ссылка Twitch' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByLabel('Режим разработчика', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Порт оверлея')).toHaveCount(0);
  await expect(page.getByLabel('Скрывать ссылки зрителей', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Команды', { exact: true })).toHaveValue('mask');
  await page.getByLabel('Команды', { exact: true }).selectOption('show');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.streamchat.snapshot())).settings.safeChat
          .commandDisplayMode,
    )
    .toBe('show');
  await page.getByLabel('Команды', { exact: true }).selectOption('mask');
  await page.getByLabel('Включить экспериментальные функции', { exact: true }).check();
  await page.getByRole('button', { name: 'Dev Tools', exact: true }).click();
  await expect(page.getByLabel('Режим разработчика', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Аккаунты', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ссылка Twitch' })).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByLabel('Включить экспериментальные функции', { exact: true }).uncheck();
  await expect(page.getByLabel('Режим разработчика', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  await page.locator('summary', { hasText: 'Расширенные настройки' }).click();
  await expect(
    page.getByRole('group', { name: 'Размер аватара: режим', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Browser Source URL')).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить чат в OBS' }).click();
  await expect(page.getByLabel('Browser Source URL')).toBeVisible();
  const obsUrl = await page.getByLabel('Browser Source URL').inputValue();
  await page.getByRole('button', { name: 'Копировать ссылку', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.phase4CopiedText)).toBe(obsUrl);
  await page.getByRole('button', { name: 'Чат', exact: true }).click();
  await page.getByRole('button', { name: 'Попробовать демо' }).click();
  await expect(page.locator('.message').first()).toBeVisible();
  await page.evaluate(() => window.streamchat.send('mock-twitch', 'Phase 4 context target'));
  const target = page.locator('.message').filter({ hasText: 'Phase 4 context target' });
  await target.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Копировать текст', exact: true }).click();
  await expect
    .poll(() => app.evaluate(() => globalThis.phase4CopiedText))
    .toBe('Phase 4 context target');
  await expect(page.getByRole('menu')).toHaveCount(0);
  const username = await page.evaluate(
    async () =>
      (await window.streamchat.snapshot()).messages.find((m) => m.text === 'Phase 4 context target')
        .user.username,
  );
  await target.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Копировать имя', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.phase4CopiedText)).toBe(username);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.evaluate(() => window.streamchat.setRunning(false));
  await target.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Удалить сообщение/ })).toBeDisabled();
  await expect(
    page.getByText('Источник отключён. Подключите его снова.', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.evaluate(() => window.streamchat.setRunning(true));
  await target.click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Копировать текст', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await target.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Таймаут', exact: true }).click();
  await page.getByRole('menuitem', { name: '1 мин', exact: true }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.streamchat.getModerationHistory())).length)
    .toBe(1);
  await target.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Разбанить пользователя', exact: true }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.streamchat.getModerationHistory())).length)
    .toBe(2);
  await target.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Забанить пользователя', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await page.evaluate(() => window.streamchat.getModerationHistory())).length).toBe(2);
  await page.getByRole('button', { name: 'Подтвердить постоянный бан', exact: true }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.streamchat.getModerationHistory())).length)
    .toBe(3);
  await target.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Удалить сообщение', exact: true }).click();
  await expect(target).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Действие модерации выполнено' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByLabel('Звуки интерфейса', { exact: true }).uncheck();
  await page.getByLabel('Громкость', { exact: true }).fill('45');
  await page.getByLabel('Уменьшить анимацию', { exact: true }).selectOption('on');
  await expect(page.locator('.app')).toHaveAttribute('data-reduced-motion', 'true');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.streamchat.snapshot())).settings.desktop.feedback,
    )
    .toEqual({ sounds: false, volume: 0.45, reducedMotion: 'on' });
  const fonts = await page.evaluate(() => window.desktop.listFonts());
  expect(fonts.fallback).toBe(false);
  expect(fonts.families.length).toBeGreaterThan(10);
  await expect(page.getByRole('button', { name: 'Изменить шрифт' })).toHaveCount(0);
  await page.evaluate(async () => {
    const s = await window.streamchat.snapshot();
    await window.streamchat.saveSettings({
      ...s.settings,
      desktop: {
        ...s.settings.desktop,
        chat: { ...s.settings.desktop.chat, fontFamily: 'Consolas' },
      },
    });
  });
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить шрифт' }).click();
  await page.getByRole('textbox', { name: 'Поиск шрифта' }).fill('Consolas');
  await page.getByRole('option', { name: 'Consolas', exact: true }).click();
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.streamchat.snapshot())).settings.desktop.chat.fontFamily,
    )
    .toBe('Consolas');
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByLabel('Язык интерфейса').selectOption('en');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Change font', exact: true }).click();
  await expect(page.getByText('The quick brown fox jumps over the lazy dog').first()).toBeVisible();
  expect(
    await page.getByRole('listbox', { name: 'System fonts' }).getByRole('option').count(),
  ).toBeLessThan(20);
  await page.getByRole('button', { name: 'Restore default', exact: true }).click();
  const modalBounds = await page.getByRole('dialog').boundingBox();
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(Math.abs(modalBounds.x + modalBounds.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(modalBounds.y + modalBounds.height / 2 - viewport.height / 2)).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/phase4-fonts.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    (await page.evaluate(() => window.streamchat.snapshot())).settings.desktop.chat.fontFamily,
  ).toBe('Consolas');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Interface language').selectOption('ru');
  await page.screenshot({ path: 'test-results/phase4-settings.png' });
  await page.getByRole('button', { name: 'Чат', exact: true }).click();
  await page.getByRole('button', { name: 'YouTube', exact: true }).click();
  await page
    .getByRole('group', { name: 'Тип событий' })
    .getByRole('button', { name: 'Подписчики' })
    .click();
  await page.getByLabel('Отправить от имени').selectOption('mock-youtube');
  await expect
    .poll(
      async () => (await page.evaluate(() => window.streamchat.snapshot())).settings.desktop.chat,
    )
    .toEqual({
      platform: 'youtube',
      category: 'members',
      senderId: 'mock-youtube',
      fontFamily: 'Consolas',
    });
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await expect(
    page.getByRole('group', { name: 'Тип событий' }).getByRole('button', { name: 'Подписчики' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Отправить от имени')).toHaveValue('mock-youtube');
  const preferences = (await page.evaluate(() => window.streamchat.snapshot())).settings.desktop;
  expect(preferences.feedback).toEqual({ sounds: false, volume: 0.45, reducedMotion: 'on' });
  expect(preferences.chat.fontFamily).toBe('Consolas');
  await page.getByRole('button', { name: 'Развернуть окно', exact: true }).click();
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()))
    .toBe(true);
  await page.getByRole('button', { name: 'Восстановить окно', exact: true }).click();
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()))
    .toBe(false);
  await page.getByRole('button', { name: 'Свернуть окно', exact: true }).click();
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()))
    .toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
  expect(
    await page
      .locator('.titlebar')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region')),
  ).toBe('drag');
  expect(
    await page
      .locator('.window-controls')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region')),
  ).toBe('no-drag');
  await page.locator('body').click({ position: { x: 240, y: 70 } });
  await page.keyboard.press('Control+,');
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
  const bounds = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setBounds({ x: 40, y: 40, width: 1100, height: 720 });
    return win.getBounds();
  });
  await page.getByRole('button', { name: 'Скрыть в трей', exact: true }).click();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds()),
  ).toEqual(bounds);
  await expect(
    page.getByRole('group', { name: 'Тип событий' }).getByRole('button', { name: 'Подписчики' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      passed: true,
      simpleDefault: true,
      advancedPreserved: true,
      filtersPersisted: true,
      directory,
    }),
  );
} finally {
  await app?.close();
}
