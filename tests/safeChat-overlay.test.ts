import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { OverlayServer } from '../src/main/local-server/OverlayServer';
import { SafeChatEngine, safeChatDefaults } from '../src/shared/safeChat';
import { themes } from '../src/shared/themes';
import type { ChatMessage } from '../src/shared/models';
it('never serializes originals in initial, incremental, refreshed or reconnect OBS packets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'streamchat-safe-'));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<html></html>');
  const engine = new SafeChatEngine();
  engine.configure({
    ...safeChatDefaults(),
    dictionary: [{ id: 'rule', text: 'hiddentoken', category: 'blocked' }],
  });
  const message: ChatMessage = {
    id: 'one',
    accountId: 'account',
    platform: 'youtube',
    channelId: 'channel',
    user: { platformUserId: 'u', username: 'Viewer', displayName: 'Viewer', roles: [], badges: [] },
    text: 'hiddentoken',
    fragments: [{ type: 'emote', text: 'hiddentoken' }],
    reply: { messageId: 'x', username: 'Viewer', text: 'hiddentoken' },
    createdAt: new Date().toISOString(),
    kind: 'donation',
    metadata: { amount: 'hiddentoken' },
  };
  const messages = [
    message,
    {
      ...message,
      id: 'command-source',
      text: '!discord',
      fragments: undefined,
      reply: undefined,
      metadata: undefined,
    },
    {
      ...message,
      id: 'link-source',
      text: 'hello example.com world',
      fragments: [{ type: 'text' as const, text: 'hello example.com world' }],
      reply: { messageId: 'r', username: 'V', text: 't.me/example' },
      metadata: undefined,
    },
    {
      ...message,
      id: 'empty-source',
      text: 'https://example.com',
      fragments: undefined,
      reply: undefined,
      metadata: undefined,
    },
  ];
  const profile = { id: 'default', name: 'Default', theme: themes[0] };
  const server = new OverlayServer({
    directory,
    profiles: () => [profile],
    messages: () => messages,
    sanitize: (m) => engine.display(m),
    readKey: async () => undefined,
    saveKey: async () => {},
    changed: () => {},
    error: () => {},
  });
  const clients: WebSocket[] = [],
    frames: string[] = [];
  const connect = async () => {
    const url = new URL(server.url('default'));
    const socket = new WebSocket(
      `ws://${url.host}/events?profile=default&key=${url.searchParams.get('key')}`,
    );
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('message', (data) => {
        frames.push(data.toString());
        resolve();
      });
      socket.on('error', reject);
    });
  };
  try {
    await server.start(0);
    await connect();
    server.publish([{ type: 'donation', message: { ...message, id: 'two' } }]);
    await expect.poll(() => frames.length).toBe(2);
    engine.configure({ ...engine.settings, kindMode: { enabled: true, replacement: 'котик' } });
    server.refreshMessages();
    await expect.poll(() => frames.length).toBe(3);
    await connect();
    expect(frames).toHaveLength(4);
    for (const frame of frames) {
      expect(frame).not.toContain('hiddentoken');
      expect(frame).not.toContain('ruleIds');
      expect(frame).not.toContain('safeChat');
      expect(frame).not.toContain('displayPolicy');
      expect(frame).not.toContain('!discord');
      expect(frame).not.toContain('example.com');
      expect(frame).not.toContain('t.me/example');
      expect(frame).not.toContain('empty-source');
    }
    expect(frames[3]).toContain('котик');
    expect(frames[0]).toContain('hello world');
    expect(frames[0]).toContain('***');
    const before = frames.length;
    server.publish([
      { type: 'chat', message: messages[1] },
      { type: 'chat', message: messages[3] },
    ]);
    await expect.poll(() => frames.length).toBe(before + 2);
    expect(
      frames
        .slice(before)
        .every((raw) => !raw.includes('!discord') && !raw.includes('empty-source')),
    ).toBe(true);
    messages.push(
      ...Array.from({ length: 250 }, (_, i) => ({ ...messages[3], id: `empty-flood-${i}` })),
    );
    engine.configure({ ...engine.settings, commandDisplayMode: 'hide' });
    server.refreshMessages();
    await expect.poll(() => frames.length).toBe(before + 4);
    expect(frames.at(-1)).toContain('hello world');
    expect(frames.at(-1)).not.toContain('empty-flood-');
    expect(
      frames
        .slice(-2)
        .every((raw) => !raw.includes('command-source') && !raw.includes('empty-source')),
    ).toBe(true);
  } finally {
    for (const socket of clients) socket.terminate();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
