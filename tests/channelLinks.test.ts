import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { parseChannelLink } from '../src/shared/channelLinks';
import { LinkedChatAdapter, readOnlyCapabilities } from '../src/platforms/common/LinkedChatAdapter';
import { ircEvent } from '../src/platforms/twitch/guestIrc';
import type { PlatformAccount, StreamEvent } from '../src/shared/models';
import type { PlatformAdapter } from '../src/shared/contracts';
import type { YouTubeStream } from '../src/platforms/youtube/stream';
import { Store } from '../src/main/database/store';
import { PlatformError } from '../src/platforms/common/errors';

const account = (platform: 'twitch' | 'youtube', readOnlyLink: string): PlatformAccount => ({
  id: `link:${platform}:test`,
  platform,
  platformAccountId: `link:${platform}:test`,
  username: 'test',
  displayName: 'test',
  authStatus: 'signed-out',
  connectionStatus: 'disconnected',
  scopes: [],
  capabilities: { ...readOnlyCapabilities },
  readOnlyLink,
  enabled: true,
});
describe('channel links', () => {
  it('normalizes channel and popout URLs, removes irrelevant query values', () => {
    for (const url of [
      'https://twitch.tv/Flamberor',
      'https://www.twitch.tv/popout/flamberor/chat?popout=',
      'https://www.twitch.tv/embed/flamberor/chat',
    ])
      expect(parseChannelLink('twitch', url).url).toBe('https://www.twitch.tv/flamberor');
    for (const url of [
      'https://youtu.be/abcdefghijk',
      'https://youtube.com/watch?v=abcdefghijk',
      'https://youtube.com/live_chat?v=abcdefghijk',
      'https://youtube.com/live/abcdefghijk',
    ])
      expect(parseChannelLink('youtube', url)).toMatchObject({
        kind: 'video',
        target: 'abcdefghijk',
      });
    expect(parseChannelLink('youtube', 'youtube.com/@flamberor/live')).toMatchObject({
      kind: 'handle',
      target: '@flamberor',
    });
    expect(parseChannelLink('youtube', 'youtube.com/channel/UC' + 'a'.repeat(22))).toMatchObject({
      kind: 'channel',
    });
  });
  it('rejects lookalike hosts, URL credentials, ports and unsupported paths', () => {
    for (const url of [
      'https://twitch.tv.evil.test/a',
      'https://127.0.0.1/a',
      'https://x@twitch.tv/a',
      'https://twitch.tv:123/a',
      'https://twitch.tv/directory',
      'file:///a',
      'https://twitch.tv/a%0d%0aJOIN%20b',
    ])
      expect(() => parseChannelLink('twitch', url)).toThrow();
    expect(() => parseChannelLink('youtube', 'youtube.com/watch?v=bad')).toThrow();
    expect(() => parseChannelLink('youtube', 'youtube.com/c/ambiguous')).toThrow();
  });
  it('maps Twitch identities, badges, fragments, clears and deletion', () => {
    const e = ircEvent(
      '@id=m1;room-id=42;user-id=9;display-name=Flamberor;badges=moderator/1;emotes=25:0-4;tmi-sent-ts=1700000000000 :flamberor!u@host PRIVMSG #flamberor :Kappa привет',
      'link:twitch:test',
      'flamberor',
    );
    expect(e).toMatchObject({
      type: 'chat',
      message: {
        channelId: '42',
        source: 'live',
        user: { platformUserId: '9', displayName: 'Flamberor', roles: ['moderator'] },
        fragments: [
          { type: 'emote', text: 'Kappa' },
          { type: 'text', text: ' привет' },
        ],
      },
    });
    expect(
      ircEvent(
        '@room-id=42;target-msg-id=m1 :tmi.twitch.tv CLEARMSG #flamberor :text',
        'a',
        'flamberor',
      ),
    ).toMatchObject({ type: 'moderation', action: 'delete', messageId: 'm1' });
    expect(
      ircEvent(
        '@room-id=42;target-user-id=9 :tmi.twitch.tv CLEARCHAT #flamberor :flamberor',
        'a',
        'flamberor',
      ),
    ).toMatchObject({ type: 'moderation', action: 'purge', targetUserId: '9' });
  });
  it('uses separate IRC frames, joins once, responds to ping, deduplicates and stops', async () => {
    class Socket extends EventEmitter {
      send = vi.fn();
      terminate = vi.fn();
    }
    const socket = new Socket();
    const states: PlatformAccount[] = [];
    const events: StreamEvent[] = [];
    const adapter = new LinkedChatAdapter(
      account('twitch', 'https://twitch.tv/flamberor'),
      undefined,
      (a) => states.push(a),
      undefined,
      undefined,
      () => socket as unknown as WebSocket,
    );
    adapter.subscribe((e) => events.push(e));
    try {
      await adapter.connect();
      await adapter.connect();
      socket.emit('open');
      expect(socket.send.mock.calls).toHaveLength(3);
      expect(socket.send.mock.calls[2][0]).toMatch(/^NICK justinfan\d+$/);
      socket.emit('message', Buffer.from(':tmi.twitch.tv 001 guest :Welcome\r\n'));
      expect(socket.send).toHaveBeenCalledWith('JOIN #flamberor\r\n');
      socket.emit(
        'message',
        Buffer.from('@room-id=42 :tmi.twitch.tv ROOMSTATE #flamberor\r\nPING :tmi.twitch.tv\r\n'),
      );
      expect(states.at(-1)?.connectionStatus).toBe('connected');
      expect(socket.send).toHaveBeenCalledWith('PONG :tmi.twitch.tv\r\n');
      const line = '@id=one;user-id=9;room-id=42 :f!f@host PRIVMSG #flamberor :hello\r\n';
      socket.emit('message', Buffer.from(line + line));
      expect(events).toHaveLength(1);
      const api: PlatformAdapter = adapter;
      await expect(api.sendMessage('forbidden')).rejects.toThrow(/невозможны/);
      await expect(api.banUser('9')).rejects.toThrow(/невозможны/);
      expect(states.at(-1)?.capabilities).toEqual(readOnlyCapabilities);
    } finally {
      await adapter.disconnect();
    }
    expect(socket.terminate).toHaveBeenCalledOnce();
  });
  it('resolves YouTube handles, uses API key header and streams with a resume token', async () => {
    const http = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('X-Goog-Api-Key')).toBe('test-key');
      const url = new URL(String(input));
      expect(url.searchParams.has('key')).toBe(false);
      return new Response(
        JSON.stringify({
          items: url.pathname.endsWith('channels')
            ? [{ id: 'UC1' }]
            : url.pathname.endsWith('search')
              ? [{ id: { videoId: 'abcdefghijk' } }]
              : [
                  {
                    id: 'abcdefghijk',
                    snippet: { title: 'Test broadcast', channelId: 'UC1' },
                    liveStreamingDetails: { activeLiveChatId: 'chat' },
                  },
                ],
        }),
      );
    });
    const stream = vi.fn<YouTubeStream>(async (_id, _page, key, signal, batch, ready, auth) => {
      expect(key).toBe('test-key');
      expect(auth).toBe('api-key');
      ready();
      batch({
        nextPageToken: 'next',
        items: [
          {
            id: 'message1',
            snippet: {
              type: 'textMessageEvent',
              publishedAt: new Date().toISOString(),
              displayMessage: 'hello',
            },
            authorDetails: { channelId: 'viewer', displayName: 'Test' },
          },
        ],
      });
      await new Promise<void>((r) => signal.addEventListener('abort', () => r(), { once: true }));
    });
    const a = new LinkedChatAdapter(
      account('youtube', 'https://youtube.com/@flamberor'),
      'test-key',
      () => undefined,
      http as typeof fetch,
      stream,
    );
    const events: StreamEvent[] = [];
    a.subscribe((e) => events.push(e));
    try {
      await a.connect();
      await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
      expect(events).toHaveLength(1);
      expect((await a.getCurrentAccount()).displayName).toBe('Test broadcast');
      await a.disconnect();
      await a.connect();
      await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
      expect(stream.mock.calls[1][1]).toBe('next');
      expect(events).toHaveLength(1);
    } finally {
      await a.disconnect();
    }
  });
  it('explains API-key failures from the YouTube stream without asking for OAuth', async () => {
    const http = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'abcdefghijk',
                snippet: { title: 'Test', channelId: 'UC1' },
                liveStreamingDetails: { activeLiveChatId: 'chat' },
              },
            ],
          }),
        ),
    );
    const stream = vi.fn<YouTubeStream>(async () => {
      throw new PlatformError('AUTH_REQUIRED', 'OAuth error');
    });
    const a = new LinkedChatAdapter(
      account('youtube', 'https://youtu.be/abcdefghijk'),
      'test-key',
      () => undefined,
      http,
      stream,
    );
    try {
      await a.connect();
      await vi.waitFor(async () =>
        expect((await a.getCurrentAccount()).errorCode).toBe('YOUTUBE_LINK_ACCESS'),
      );
      expect((await a.getCurrentAccount()).lastError).toContain('YOUTUBE_API_KEY');
    } finally {
      await a.disconnect();
    }
  });
  it('reports a missing YouTube key without making network requests', async () => {
    const http = vi.fn();
    const a = new LinkedChatAdapter(
      account('youtube', 'https://youtu.be/abcdefghijk'),
      undefined,
      () => undefined,
      http,
    );
    await a.connect();
    await vi.waitFor(async () =>
      expect((await a.getCurrentAccount()).errorCode).toBe('CONFIG_REQUIRED'),
    );
    expect(http).not.toHaveBeenCalled();
    await a.disconnect();
  });
  it('preserves independent link records next to OAuth accounts', () => {
    const store = new Store(':memory:');
    try {
      const link = account('twitch', 'https://twitch.tv/flamberor');
      store.accounts.save(link);
      store.accounts.save({
        ...link,
        id: 'twitch:42',
        platformAccountId: '42',
        readOnlyLink: undefined,
        authStatus: 'authorized',
      });
      expect(store.accounts.accounts()).toHaveLength(2);
      expect(store.accounts.accounts().find((a) => a.readOnlyLink)).toEqual(link);
      store.accounts.remove(link.id);
      expect(store.accounts.accounts()[0].id).toBe('twitch:42');
    } finally {
      store.close();
    }
  });
});
