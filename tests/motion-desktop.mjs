import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
await mkdir('test-results', { recursive: true });
const directory = await mkdtemp(resolve('test-results/motion-'));
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, STREAMCHAT_TEST_DATA: directory },
  timeout: 45000,
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByRole('button', { name: 'Попробовать демо' })).toBeVisible();
  const navigation = page.locator('.workspace-label button');
  await navigation.click();
  await expect(navigation).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.app')).toHaveClass(/collapsed/);
  await navigation.click();
  await expect(navigation).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'entering');
  await expect(page.locator('.sidebar .moving-indicator')).toHaveAttribute('data-visible', 'true');
  const before = await page.locator('.sidebar .moving-indicator').getAttribute('style');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect
    .poll(() => page.locator('.sidebar .moving-indicator').getAttribute('style'))
    .not.toBe(before);
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
  await expect(page.locator('.app')).toHaveAttribute('data-reduced-motion', 'true');
  await page.evaluate(async () => {
    const s = await window.streamchat.snapshot();
    await window.streamchat.saveSettings({ ...s.settings, theme: 'light' });
  });
  await expect(page.locator('.app')).toHaveClass(/theme-light/);
  await page.evaluate(async () => {
    const s = await window.streamchat.snapshot();
    await window.streamchat.saveSettings({ ...s.settings, theme: 'dark' });
  });
  await expect(page.locator('.app')).toHaveClass(/theme-dark/);

  expect(
    await page
      .locator('.sidebar .moving-indicator')
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe('0s');
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  const summary = page.locator('summary', { hasText: 'Расширенные настройки' });
  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await page.getByLabel('Название профиля', { exact: true }).fill('Motion test');
  await expect(page.locator('[data-dirty=true]')).toBeEnabled();
  await page.getByRole('button', { name: 'Сохранить профиль' }).click();
  await expect(page.getByRole('button', { name: 'Сохранено', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить профиль' })).toBeDisabled();
  await app.evaluate(({ clipboard }) => {
    clipboard.writeText = async () => {};
  });
  await page.getByRole('button', { name: 'Добавить чат в OBS' }).click();
  await page.getByRole('button', { name: 'Копировать ссылку', exact: true }).click();
  await expect(page.locator('.copy-feedback')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('.copy-feedback')).toHaveAttribute('data-state', 'idle');
  await page.getByRole('button', { name: 'Чат', exact: true }).click();
  await page.getByRole('button', { name: 'Попробовать демо' }).click();
  await expect(page.locator('.message').first()).toBeVisible();
  await page.locator('.message .username').first().click();
  await expect(page.locator('.user-panel-presence')).toHaveAttribute('data-state', 'open');
  await expect(page.locator('.message[data-selected=true]')).toHaveCount(1);
  await page.getByTitle('Показать или скрыть панель').click();
  await expect(page.locator('.user-panel-presence')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/motion-chat.png' });
  expect(errors).toEqual([]);
  console.log(
    'Motion: navigation indicator, reduced motion, accordion, dirty/save, inline copy, selection/panel passed.',
  );
} finally {
  await app.close();
}
