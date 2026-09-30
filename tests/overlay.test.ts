import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createServer, get as httpGet } from 'node:http';
import { OverlayServer } from '../src/main/local-server/OverlayServer';
import { themes } from '../src/shared/themes';
import type { ChatMessage, ChatProfile } from '../src/shared/models';
import type { OverlayPacket } from '../src/shared/overlay';
function connect(url: string, origin?: string) {
  const packets: OverlayPacket[] = [];
  const u = new URL(url);
  const ws = new WebSocket(
    `ws://${u.host}/events?profile=${u.pathname.split('/').at(-1)}&key=${u.searchParams.get('key')}`,
    origin ? { origin } : {},
  );
  const ready = new Promise<void>((resolve, reject) => {
    ws.on('message', (data) => {
      packets.push(JSON.parse(data.toString()));
      resolve();
    });
    ws.on('error', reject);
  });
  return { ws, packets, ready };
}
async function eventually(check: () => boolean) {
  const until = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > until) throw new Error('Timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}
describe('loopback overlay server', () => {
  it('authenticates HTTP/WS, snapshots two sources, publishes updates/deletes/resets and preserves keys through restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'overlay-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<html><script src="/assets/app.js"></script></html>');
    await writeFile(join(dir, 'assets/app.js'), 'document.title="Overlay"');
    const profiles: ChatProfile[] = [{ id: 'default', name: 'Default', theme: themes[0] }];
    const secrets = new Map<string, string>();
    const m: ChatMessage = {
      id: 'm',
      accountId: 'mock-twitch',
      platform: 'twitch',
      channelId: 'demo',
      user: {
        platformUserId: 'viewer',
        username: 'Viewer',
        displayName: 'Viewer',
        roles: [],
        badges: [],
      },
      text: 'Snapshot',
      createdAt: new Date().toISOString(),
      kind: 'message',
    };
    const messages = [
      m,
      {
        ...m,
        id: 'yt',
        platform: 'youtube' as const,
        accountId: 'youtube:owner',
        source: 'live' as const,
      },
    ];
    const opts = {
      directory: dir,
      profiles: () => profiles,
      messages: () => messages,
      readKey: async (id: string) => secrets.get(id),
      saveKey: async (id: string, key: string) => {
        secrets.set(id, key);
      },
      changed: () => undefined,
      error: () => undefined,
    };
    const server = new OverlayServer(opts);
    let second: OverlayServer | undefined;
    const clients: WebSocket[] = [];
    try {
      await server.start(0);
      const url = server.url('default');
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect((await fetch(url.replace(/key=.*/, 'key=bad'))).status).toBe(404);
      expect((await fetch(url, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
      expect(
        await new Promise<number>((resolve) =>
          httpGet(url, { headers: { Host: 'evil.example' } }, (res) => {
            res.resume();
            resolve(res.statusCode!);
          }),
        ),
      ).toBe(403);
      expect((await fetch(url, { method: 'POST', body: 'data' })).status).toBe(403);
      expect(
        (await fetch(url.replace(/key=.*/, `key=${encodeURIComponent('ж'.repeat(43))}`))).status,
      ).toBe(404);
      const denied = connect(url, 'https://evil.example');
      clients.push(denied.ws);
      await expect(denied.ready).rejects.toThrow();
      const a = connect(url),
        b = connect(url);
      clients.push(a.ws, b.ws);
      await Promise.all([a.ready, b.ready]);
      expect(server.status().clients).toBe(2);
      expect(a.packets[0]).toMatchObject({
        version: 1,
        type: 'overlay.ready',
        payload: {
          messages: [
            { platform: 'twitch', source: 'mock', accountId: '' },
            { platform: 'youtube', source: 'live', accountId: '' },
          ],
        },
      });
      server.publish([{ type: 'chat', message: { ...m, id: 'live', text: 'Realtime' } }]);
      await eventually(
        () =>
          a.packets.some((p) => p.type === 'chat.message') &&
          b.packets.some((p) => p.type === 'chat.message'),
      );
      profiles[0] = { ...profiles[0], theme: { ...themes[0], fontSize: 25 } };
      await server.syncProfiles();
      await eventually(() =>
        a.packets.some((p) => p.type === 'profile.updated' && p.payload.theme.fontSize === 25),
      );
      server.publish([
        {
          type: 'moderation',
          source: 'mock',
          platform: 'twitch',
          channelId: 'demo',
          targetUserId: 'viewer',
          messageId: 'live',
          action: 'delete',
        },
      ]);
      await eventually(() => a.packets.some((p) => p.type === 'chat.delete'));
      server.publish([
        {
          type: 'moderation',
          source: 'mock',
          platform: 'twitch',
          channelId: 'demo',
          targetUserId: 'viewer',
          action: 'timeout',
          duration: 10,
        },
      ]);
      await eventually(() => a.packets.some((p) => p.type === 'moderation.userTimedOut'));
      server.reset('default');
      await eventually(() => a.packets.some((p) => p.type === 'chat.clear'));
      const c = connect(url);
      clients.push(c.ws);
      await c.ready;
      expect(c.packets[0]).toMatchObject({ payload: { messages: [] } });
      const port = server.status().port;
      await server.close();
      second = new OverlayServer(opts);
      await second.start(port);
      expect(second.url('default')).toBe(url);
      const reconnected = connect(url);
      clients.push(reconnected.ws);
      await reconnected.ready;
      expect(reconnected.packets[0].type).toBe('overlay.ready');
    } finally {
      for (const ws of clients) ws.terminate();
      await server.close();
      await second?.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('falls back to an available loopback port when the configured port is occupied', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'overlay-port-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<html/>');
    const occupied = createServer();
    await new Promise<void>((r) => occupied.listen(0, '127.0.0.1', r));
    const port = (occupied.address() as { port: number }).port;
    const server = new OverlayServer({
      directory: dir,
      profiles: () => [],
      messages: () => [],
      readKey: async () => undefined,
      saveKey: async () => undefined,
      changed: () => undefined,
      error: () => undefined,
    });
    try {
      await server.start(port);
      expect(server.status().port).not.toBe(port);
      expect(server.status().running).toBe(true);
    } finally {
      await server.close();
      await new Promise<void>((r) => occupied.close(() => r()));
      await rm(dir, { recursive: true, force: true });
    }
  });
});
