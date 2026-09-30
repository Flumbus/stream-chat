import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('test-results', { recursive: true });
const directory = await mkdtemp(resolve('test-results/packaged-'));
const app = await electron.launch({
  executablePath: resolve('release/win-unpacked/StreamChat.exe'),
  env: { ...process.env, STREAMCHAT_TEST_DATA: directory },
  timeout: 45000,
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обновления', exact: true })).toBeVisible();
  expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
  expect(await page.evaluate(() => window.desktop.updateState())).toMatchObject({
    installedVersion: '0.4.0',
    enabled: false,
    phase: 'idle',
  });
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  await expect(page.locator('.preview-canvas .message')).toHaveCount(2);
  await page.screenshot({ animations: 'disabled', path: 'test-results/packaged-preview.png' });
  expect(errors).toEqual([]);
  console.log('Packaged EXE: startup, typed bridge, preview and unpacked updater gate passed');
} finally {
  await app.close();
}
