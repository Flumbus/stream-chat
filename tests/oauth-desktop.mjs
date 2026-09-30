/* global Response, URLSearchParams */
import { _electron as electron, chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('test-results', { recursive: true });
const directory = await mkdtemp(resolve('test-results/oauth-'));
const launch = () =>
  electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STREAMCHAT_TEST_DATA: directory,
      GOOGLE_CLIENT_ID: 'test-desktop',
      GOOGLE_CLIENT_SECRET: 'test-secret',
    },
    timeout: 45000,
  });
let app, browser;
try {
  app = await launch();
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Аккаунты', exact: true }).click();
  // Only this isolated test process receives provider stubs. No real login or tokens.
  await app.evaluate(({ shell }) => {
    globalThis.oauthTest = { mode: 'missing-secret', url: '', calls: 0 };
    shell.openExternal = async (url) => {
      globalThis.oauthTest.url = url;
    };
    globalThis.fetch = async (url, init) => {
      const state = globalThis.oauthTest;
      if (String(url) === 'https://oauth2.googleapis.com/token') {
        state.calls++;
        if (state.mode === 'missing-secret')
          return new Response(
            JSON.stringify({
              error: 'invalid_request',
              error_description: 'client_secret is missing.',
            }),
            { status: 400 },
          );
        if (new URLSearchParams(String(init.body)).get('client_secret') !== 'test-secret')
          throw Error('Missing secret in exchange');
        return new Response(
          JSON.stringify({
            access_token: 'test-access',
            refresh_token: 'test-refresh',
            expires_in: 3600,
          }),
        );
      }
      if (String(url).startsWith('https://www.googleapis.com/youtube/v3/channels?')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'test-owner',
                snippet: { title: 'flamberor — OAuth test', customUrl: '@flamberor' },
              },
            ],
          }),
        );
      }
      if (String(url).startsWith('https://www.googleapis.com/youtube/v3/liveBroadcasts?'))
        return new Response(JSON.stringify({ items: [] }));
      throw Error('Unexpected test request');
    };
  });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const callbackPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  callbackPage.on('pageerror', (error) => errors.push(error.message));
  const authorize = async () => {
    await page.getByRole('button', { name: 'Подключить YouTube', exact: true }).click();
    await expect.poll(() => app.evaluate(() => globalThis.oauthTest.url)).not.toBe('');
    const u = new URL(await app.evaluate(() => globalThis.oauthTest.url));
    await callbackPage.goto(
      `${u.searchParams.get('redirect_uri')}?state=${u.searchParams.get('state')}&code=test-code`,
    );
  };
  await authorize();
  await expect(
    callbackPage.getByRole('heading', { name: 'Подключение не завершено' }),
  ).toBeVisible();
  await expect(callbackPage.locator('#message')).toContainText('GOOGLE_CLIENT_SECRET');
  await page.locator('.auth-state summary').click();
  await expect(page.getByText('Google требует Client secret.', { exact: false })).toBeVisible();
  expect(
    (await page.evaluate(() => window.streamchat.snapshot())).accounts.filter(
      (a) => a.platform === 'youtube' && a.authStatus !== 'demo',
    ),
  ).toHaveLength(0);
  await callbackPage.screenshot({ path: 'test-results/oauth-error.png' });
  await app.evaluate(() => {
    globalThis.oauthTest.mode = 'success';
    globalThis.oauthTest.url = '';
  });
  await authorize();
  await expect(callbackPage.getByRole('heading', { name: 'YouTube подключён' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ждём первое сообщение' })).toBeVisible();
  await page.getByRole('button', { name: 'Аккаунты', exact: true }).click();
  await expect(page.getByText('flamberor — OAuth test', { exact: true })).toBeVisible();
  const snapshot = await page.evaluate(() => window.streamchat.snapshot());
  expect(snapshot.accounts.find((a) => a.id === 'youtube:test-owner')).toMatchObject({
    authStatus: 'authorized',
    displayName: 'flamberor — OAuth test',
  });
  expect(await callbackPage.locator('body').innerText()).not.toContain('test-secret');
  expect(callbackPage.url()).not.toContain('code=');
  for (const width of [1280, 390]) {
    await callbackPage.setViewportSize({ width, height: 800 });
    expect(
      await callbackPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await callbackPage.screenshot({ path: `test-results/oauth-success-${width}.png` });
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await callbackPage.getByRole('button', { name: 'Вернуться в StreamChat' }).click();
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()))
    .toBe(false);
  if (!callbackPage.isClosed())
    await expect(callbackPage.locator('#hint')).toContainText('закройте её вручную');
  const tabClosed = callbackPage.isClosed();
  expect(errors).toEqual([]);
  await app.evaluate(() => {
    globalThis.oauthTest.url = '';
  });
  await page.getByRole('button', { name: 'Подключить YouTube', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.oauthTest.url)).not.toBe('');
  const nextAuth = new URL(await app.evaluate(() => globalThis.oauthTest.url));
  const nextCallback = `${nextAuth.searchParams.get('redirect_uri')}?state=${nextAuth.searchParams.get('state')}&code=test-code`;
  const opener = await browser.newPage();
  const popupPromise = opener.waitForEvent('popup');
  await opener.evaluate((url) => {
    window.open(url);
  }, nextCallback);
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'YouTube подключён' })).toBeVisible();
  await Promise.all([
    popup.waitForEvent('close'),
    popup.getByRole('button', { name: 'Вернуться в StreamChat' }).click(),
  ]);
  await page.evaluate(() => window.streamchat.accountAction('youtube:test-owner', 'disconnect'));
  await app.close();
  app = await launch();
  const restored = await app.firstWindow();
  await expect
    .poll(async () =>
      (await restored.evaluate(() => window.streamchat.snapshot())).accounts.some(
        (a) => a.id === 'youtube:test-owner' && a.authStatus === 'authorized',
      ),
    )
    .toBe(true);
  console.log(
    JSON.stringify(
      {
        passed: true,
        tokenErrorShown: true,
        channelSaved: true,
        accountPersisted: true,
        returnRestoresWindow: true,
        tabClosed,
        scriptOpenedTabClosed: popup.isClosed(),
        provider: 'mock',
        screenshots: 'test-results/oauth-*.png',
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await app?.close();
}
