import { _electron as electron, chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WebSocket } from 'ws';
await mkdir('test-results', { recursive: true });
const directory = await mkdtemp(resolve('test-results/safechat-'));
const launch = () =>
  electron.launch({
    args: ['.'],
    env: { ...process.env, STREAMCHAT_TEST_DATA: directory },
    timeout: 45000,
  });
let app = await launch();
let socket;
try {
  let page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByLabel('Фильтрация нежелательных слов', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Автомодерация', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Настроить безопасность чата' }).click();
  for (const [word, category] of [
    ['blockedtoken', 'blocked'],
    ['softtoken', 'soft'],
  ]) {
    await page.getByLabel('Слово или фраза', { exact: true }).fill(word);
    await page.getByLabel('Добавить в категорию').selectOption(category);
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.locator('.dictionary-row').filter({ hasText: word })).toBeVisible();
  }
  await page.locator('summary', { hasText: 'Наказания' }).click();
  await page.getByLabel('Длительность: Запрещённые слова', { exact: true }).selectOption('custom');
  await page.getByLabel('Таймаут в секундах: Запрещённые слова', { exact: true }).fill('47');
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.streamchat.snapshot())).settings.safeChat.punishments
          .blocked.duration,
    )
    .toBe(47);
  await page.getByLabel('Длительность: Запрещённые слова', { exact: true }).selectOption('3600');
  await expect(
    page.getByLabel('Таймаут в секундах: Запрещённые слова', { exact: true }),
  ).toHaveCount(0);
  await page.locator('summary', { hasText: 'Наказания' }).click();
  await page.locator('summary', { hasText: 'Правила платформ' }).click();
  await page.getByLabel('Общие правила для всех платформ', { exact: true }).uncheck();
  await page.getByLabel('Фильтрация · youtube', { exact: true }).uncheck();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.streamchat.snapshot())).settings.safeChat.platforms
          .youtube.filtering,
    )
    .toBe(false);
  await page.getByLabel('Общие правила для всех платформ', { exact: true }).check();
  await page.locator('summary', { hasText: 'Правила платформ' }).click();
  await expect(page.locator('summary', { hasText: 'Добрый чат' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/safechat-settings.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Чат', exact: true }).click();
  await page.getByRole('button', { name: 'Попробовать демо' }).click();
  await expect(page.locator('.message').first()).toBeVisible();
  const url = new URL(await page.evaluate(() => window.streamchat.overlayUrl('default')));
  const packets = [];
  socket = new WebSocket(
    `ws://${url.host}/events?profile=default&key=${url.searchParams.get('key')}`,
  );
  socket.on('message', (buffer) => packets.push(buffer.toString()));
  await expect.poll(() => packets.length).toBeGreaterThan(0);
  await page.evaluate(async () => {
    await window.streamchat.send('mock-twitch', 'hello blockedtoken world');
    await window.streamchat.send('mock-youtube', 'hello softtoken world');
  });
  await expect(
    page.locator('.message').filter({ hasText: '[Сообщение скрыто]' }).first(),
  ).toBeVisible();
  await expect(page.locator('.message-text').filter({ hasText: 'hello **** world' })).toBeVisible();
  const snap = await page.evaluate(() => window.streamchat.snapshot());
  expect(JSON.stringify(snap.messages)).not.toContain('blockedtoken');
  expect(JSON.stringify(snap.messages)).not.toContain('softtoken');
  const filtered = page.locator('.message').filter({ hasText: '[Сообщение скрыто]' }).first();
  await filtered.getByRole('button', { name: 'Показать оригинал' }).click();
  await expect(
    page.getByRole('dialog').getByText('hello blockedtoken world', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await filtered.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Показать оригинал', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('hello blockedtoken world', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The real backend moderates a generated viewer, rather than the protected local sender.
  await page.evaluate(async () => {
    const s = await window.streamchat.snapshot();
    await window.streamchat.saveSettings({
      ...s.settings,
      safeChat: {
        ...s.settings.safeChat,
        dictionary: [
          ...s.settings.safeChat.dictionary,
          { id: 'long-rule', text: 'Длинное сообщение', category: 'blocked' },
        ],
      },
    });
    await window.streamchat.generate('twitch', 'long', 1);
  });
  await expect
    .poll(async () => {
      const h = await page.evaluate(() => window.streamchat.getModerationHistory());
      return h.some(
        (r) =>
          r.reason?.includes('long-rule') &&
          r.action === 'timeout' &&
          r.duration === 3600 &&
          r.success,
      );
    })
    .toBe(true);
  // Updating filtering pushes a new, sanitized overlay snapshot; reconnect sends safe data too.
  const count = packets.length;
  await page.evaluate(async () => {
    const s = await window.streamchat.snapshot();
    await window.streamchat.saveSettings({
      ...s.settings,
      safeChat: {
        ...s.settings.safeChat,
        punishments: {
          ...s.settings.safeChat.punishments,
          blocked: { action: 'none', duration: 3600 },
        },
      },
    });
  });
  await expect.poll(() => packets.length).toBeGreaterThan(count);
  expect(
    packets.every(
      (raw) =>
        !raw.includes('blockedtoken') &&
        !raw.includes('softtoken') &&
        !raw.includes('Длинное сообщение'),
    ),
  ).toBe(true);
  expect(packets.every((raw) => !raw.includes('ruleIds') && !raw.includes('safeChat'))).toBe(true);
  // Commands and URLs use the same protected stream, without moderation side effects.
  const historyBefore = (await page.evaluate(() => window.streamchat.getModerationHistory()))
    .length;
  const policyStart = packets.length;
  await page.evaluate(async () => {
    await window.streamchat.send('mock-twitch', '!discord');
    await window.streamchat.send('mock-twitch', 'hello example.com world');
    await window.streamchat.send('mock-twitch', 'https://onlylink.example.com');
  });
  await expect(page.locator('.message-text').filter({ hasText: /^hello world$/ })).toBeVisible();
  await expect(page.locator('.message-text').filter({ hasText: /^\*\*\*$/ })).toBeVisible();
  const local = await page.evaluate(() => window.streamchat.snapshot());
  expect(
    local.messages.some(
      (m) => m.displayPolicy?.hidden && m.displayPolicy.linksRemoved && m.text === '',
    ),
  ).toBe(true);
  expect((await page.evaluate(() => window.streamchat.getModerationHistory())).length).toBe(
    historyBefore,
  );
  await page
    .locator('.message')
    .filter({ hasText: 'hello world' })
    .first()
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Показать оригинал', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('hello example.com world', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const obs = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const overlay = await obs.newPage();
    await overlay.goto(url.toString());
    await expect(
      overlay.locator('.message-text').filter({ hasText: /^hello world$/ }),
    ).toBeVisible();
    expect(await overlay.locator('.message-text').allTextContents()).not.toContain('');
    await page.evaluate(async () => {
      const s = await window.streamchat.snapshot();
      await window.streamchat.saveSettings({
        ...s.settings,
        safeChat: { ...s.settings.safeChat, commandDisplayMode: 'hide' },
      });
    });
    await expect(overlay.locator('.message-text').filter({ hasText: /^\*\*\*$/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Оформление', exact: true }).click();
    await expect(
      page.locator('.preview-canvas .message-text').filter({ hasText: /^hello world$/ }),
    ).toBeVisible();
    expect(await page.locator('.preview-canvas .message-text').allTextContents()).not.toContain('');
    await page.getByRole('button', { name: 'Чат', exact: true }).click();
    expect(
      packets
        .slice(policyStart)
        .every((raw) => !raw.includes('!discord') && !raw.includes('example.com')),
    ).toBe(true);
    await page
      .locator('.message')
      .filter({ hasText: 'hello world' })
      .first()
      .click({ button: 'right' });
    await page
      .getByRole('menuitem', { name: 'Разрешить ссылки этому пользователю', exact: true })
      .click();
    await expect(
      overlay.locator('.message-text').filter({ hasText: /^hello example.com world$/ }),
    ).toBeVisible();
    // All display filters off: text still goes through React escaping, in both renderers.
    await page.evaluate(async () => {
      const s = await window.streamchat.snapshot();
      await window.streamchat.saveSettings({
        ...s.settings,
        safeChat: {
          ...s.settings.safeChat,
          filtering: false,
          hideViewerLinks: false,
          commandDisplayMode: 'show',
        },
      });
      await window.streamchat.send(
        'mock-twitch',
        '<img src=x onerror="window.unsafeText=1"><script>window.unsafeText=1</script>',
      );
    });
    await expect(page.locator('.message-text').filter({ hasText: '<img src=x' })).toBeVisible();
    await expect(overlay.locator('.message-text').filter({ hasText: '<img src=x' })).toBeVisible();
    for (const view of [page, overlay]) {
      await expect(view.locator('.message-text img[src=x],.message-text script')).toHaveCount(0);
      expect(await view.evaluate(() => window.unsafeText)).toBeUndefined();
    }
    await page.evaluate(async () => {
      const s = await window.streamchat.snapshot();
      await window.streamchat.saveSettings({
        ...s.settings,
        safeChat: {
          ...s.settings.safeChat,
          filtering: true,
          hideViewerLinks: true,
          commandDisplayMode: 'mask',
        },
      });
    });
  } finally {
    await obs.close();
  }
  await page.screenshot({ path: 'test-results/safechat-chat.png', animations: 'disabled' });
  socket.close();
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: /Единый чат/ })).toBeVisible();
  const restored = await page.evaluate(() => window.streamchat.snapshot());
  expect(restored.settings.safeChat.dictionary.some((r) => r.text === 'blockedtoken')).toBe(true);
  expect(restored.settings.safeChat.punishments.blocked.action).toBe('none');
  expect(errors).toEqual([]);
  console.log(
    'Safe Chat: defaults, dictionary UI, local original, real backend timeout/history, sanitized WS frames and persistence passed.',
  );
} finally {
  socket?.terminate();
  await app.close();
}
