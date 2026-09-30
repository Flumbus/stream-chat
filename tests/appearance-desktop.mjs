import { _electron as electron, chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('test-results', { recursive: true });
const directory = await mkdtemp(resolve('test-results/appearance-'));
const launch = () =>
  electron.launch({
    args: ['.'],
    env: { ...process.env, STREAMCHAT_TEST_DATA: directory },
    timeout: 45000,
  });
let app;
let browser;
const errors = [];
try {
  app = await launch();
  let page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: 'Попробовать демо' }).click();
  await expect
    .poll(() => page.evaluate(async () => (await window.streamchat.snapshot()).running))
    .toBe(true);
  await page.evaluate(async () => {
    await window.streamchat.generate('twitch', 'long', 1);
    await window.streamchat.generate('youtube', 'emotes', 1);
    await window.streamchat.send('mock-twitch', 'A'.repeat(490));
    await window.streamchat.send('mock-youtube', 'https://example.test/' + 'long-path-'.repeat(40));
    await window.streamchat.setRunning(false);
  });
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  const preview = page.locator('.preview-canvas .overlay-renderer');
  await expect(preview.locator('.message').first()).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Размер аватара: режим', exact: true }),
  ).toBeHidden();
  await expect(page.getByRole('slider', { name: 'Размер текста', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Максимальная длина', exact: true })).toHaveCount(
    0,
  );
  const group = (label) => page.getByRole('group', { name: label, exact: true });
  const font = page.getByRole('slider', { name: 'Размер текста', exact: true });
  for (const [label, density] of [
    ['Компактно', 'compact'],
    ['Обычно', 'normal'],
    ['Просторно', 'spacious'],
  ]) {
    await group('Плотность сообщений').getByRole('button', { name: label, exact: true }).click();
    await expect(preview).toHaveAttribute('data-density', density);
    for (const [key, size] of [
      ['Home', 10],
      ['End', 40],
    ]) {
      await font.press(key);
      await expect(preview).toHaveCSS('font-size', `${size}px`);
      const geometry = await preview.evaluate((el) => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        avatar: el.querySelector('.avatar').getBoundingClientRect().width,
      }));
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
      expect(geometry.avatar).toBeGreaterThan(size);
      await preview.screenshot({ path: `test-results/appearance-${density}-${size}.png` });
    }
  }
  await page.locator('summary', { hasText: 'Расширенные настройки' }).click();
  await group('Размер аватара: режим')
    .getByRole('button', { name: 'Вручную', exact: true })
    .click();
  await page.getByRole('slider', { name: 'Размер аватара', exact: true }).press('End');
  await font.press('Home');
  await expect(preview.locator('.avatar').first()).toHaveCSS('width', '80px');
  await group('Размер аватара: режим').getByRole('button', { name: 'Авто', exact: true }).click();
  await expect(preview.locator('.avatar').first()).not.toHaveCSS('width', '80px');
  await group('Толщина имени').getByRole('button', { name: 'Жирная', exact: true }).click();
  await expect(preview.locator('.username').first()).toHaveCSS('font-weight', '700');
  await group('Длинные сообщения').getByRole('button', { name: '3 строки', exact: true }).click();
  await expect(preview.locator('.message-text').first()).toHaveCSS('-webkit-line-clamp', '3');
  await page.getByLabel('Аватары', { exact: true }).uncheck();
  await page.getByLabel('Значки', { exact: true }).uncheck();
  await expect(preview.locator('.avatar')).toHaveCount(0);
  await expect(preview.locator('.badge[title]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Сбросить точные настройки', exact: true }).click();
  await expect(font).toHaveValue('10');
  await expect(
    group('Плотность сообщений').getByRole('button', { name: 'Просторно' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Аватары', { exact: true })).not.toBeChecked();
  await expect(
    group('Размер аватара: режим').getByRole('button', { name: 'Авто', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(preview.locator('.message-text').first()).toHaveCSS('-webkit-line-clamp', 'none');
  await page.getByLabel('Аватары', { exact: true }).check();
  await page.getByLabel('Значки', { exact: true }).check();
  await group('Длинные сообщения').getByRole('button', { name: '5 строк', exact: true }).click();
  await group('Лимит сообщений: режим')
    .getByRole('button', { name: 'Вручную', exact: true })
    .click();
  await page.getByRole('slider', { name: 'Лимит сообщений', exact: true }).press('End');
  await page.getByRole('button', { name: 'Изменить шрифт' }).click();
  await page.getByRole('textbox', { name: 'Поиск шрифта' }).fill('Consolas');
  await page.getByRole('option', { name: 'Consolas', exact: true }).click();
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(preview).toHaveCSS('font-family', /Consolas/);
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранено', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить чат в OBS' }).click();
  const url = await page.getByLabel('Browser Source URL').inputValue();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const overlay = await browser.newPage({ viewport: { width: 500, height: 900 } });
  overlay.on('pageerror', (e) => errors.push(e.message));
  await overlay.goto(url);
  await expect(overlay.locator('.message').first()).toBeVisible();
  expect(await overlay.evaluate(() => typeof window.streamchat)).toBe('undefined');
  await expect(overlay.locator('.overlay-renderer')).toHaveAttribute('data-display-limit', '200');
  await expect(overlay.locator('.message-text').first()).toHaveCSS('-webkit-line-clamp', '5');
  // Same rendering configuration on both sides of the real HTTP/WS boundary.
  const styles = (el) => {
    const row = el.querySelector('.message');
    const style = getComputedStyle(el);
    return {
      font: style.fontSize,
      fontFamily: style.fontFamily,
      line: style.lineHeight,
      gap: style.getPropertyValue('--gap'),
      padding: getComputedStyle(row).padding,
      avatar: getComputedStyle(el.querySelector('.avatar')).width,
    };
  };
  expect(await overlay.locator('.overlay-renderer').evaluate(styles)).toEqual(
    await preview.evaluate(styles),
  );
  await group('Плотность сообщений')
    .getByRole('button', { name: 'Компактно', exact: true })
    .click();
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect(overlay.locator('.overlay-renderer')).toHaveAttribute('data-density', 'compact');
  await expect(overlay.locator('.message-text', { hasText: 'A'.repeat(490) })).toHaveCount(1);
  for (const label of ['Полностью', '3 строки', '5 строк']) {
    await group('Длинные сообщения').getByRole('button', { name: label, exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
    await expect(overlay.locator('.message-text').first()).toHaveCSS(
      '-webkit-line-clamp',
      label === 'Полностью' ? 'none' : label[0],
    );
  }
  await page.getByRole('checkbox', { name: 'Twitch', exact: true }).uncheck();
  await expect(preview.locator('svg.twitch')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Twitch', exact: true }).check();
  await page.getByRole('checkbox', { name: 'YouTube', exact: true }).uncheck();
  await expect(preview.locator('svg.youtube')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'YouTube', exact: true }).check();
  await overlay.screenshot({ path: 'test-results/appearance-browser.png', omitBackground: true });
  for (const name of [
    'Минимализм',
    'В стиле Twitch',
    'В стиле YouTube',
    'Оверлей',
    'Неон',
    'Пузырьки',
    'Современный',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(preview).toHaveCSS('font-size', '14px');
    const noOverflow = await preview.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(noOverflow).toBe(true);
  }
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect(overlay.locator('.overlay-renderer')).toHaveAttribute('data-density', 'normal');
  await expect(preview.locator('.emote')).toHaveCount(2);
  await page
    .getByRole('group', { name: 'Размер аватара: режим', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/appearance-advanced.png' });
  await page.locator('summary', { hasText: 'Расширенные настройки' }).click();
  await page.getByRole('checkbox', { name: 'Аватары', exact: true }).scrollIntoViewIfNeeded();
  for (const [width, height] of [
    [900, 640],
    [1440, 960],
    [1920, 1080],
    [3840, 2160],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
      [width, height],
    );
    await page.screenshot({ path: `test-results/appearance-editor-${width}.png` });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  const saved = await page.evaluate(async () => (await window.streamchat.snapshot()).profiles[0]);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await expect(page.locator('.app')).toBeVisible();
  await expect
    .poll(() => page.evaluate(async () => (await window.streamchat.snapshot()).profiles[0]))
    .toEqual(saved);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify(
      {
        passed: true,
        densityModes: 3,
        fontSizes: [10, 40],
        browser: 'Edge Chromium',
        manualPersistence: true,
        sharedPreviewStyles: true,
        directory,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await app?.close();
}
