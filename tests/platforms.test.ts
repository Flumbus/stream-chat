import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import type { PlatformAccount, StreamEvent } from '../src/shared/models';
import type { TokenSession } from '../src/main/security/TokenSession';
import { TwitchPlatformAdapter } from '../src/platforms/twitch/TwitchPlatformAdapter';
import { normalizeTwitch } from '../src/platforms/twitch/normalize';
import { YouTubePlatformAdapter } from '../src/platforms/youtube/YouTubePlatformAdapter';
import { normalizeYouTube } from '../src/platforms/youtube/normalize';
import { youtubeProtoDefinition } from '../src/platforms/youtube/stream';
import type { ServiceDefinition } from '@grpc/grpc-js';
import { Store } from '../src/main/database/store';
const account = (platform: 'twitch' | 'youtube'): PlatformAccount => ({
  id: `${platform}:owner`,
  platform,
  platformAccountId: 'owner',
  username: 'Owner',
  displayName: 'Owner',
  authStatus: 'authorized',
  connectionStatus: 'disconnected',
  scopes: [
    'user:read:chat',
    'user:write:chat',
    'moderator:manage:banned_users',
    'moderator:manage:chat_messages',
  ],
  capabilities: { send: true, ban: true, timeout: true, unban: true, delete: true },
});
const twitchEvent = {
  broadcaster_user_id: 'owner',
  chatter_user_id: 'viewer',
  chatter_user_login: 'viewer',
  chatter_user_name: 'Viewer',
  message_id: 'msg',
  message: {
    text: 'Hi Pog',
    fragments: [
      { type: 'text', text: 'Hi ' },
      { type: 'emote', text: 'Pog', emote: { id: '123' } },
    ],
  },
  badges: [{ set_id: 'moderator', id: '1', info: '' }],
  color: '#123456',
};
describe('normalization', () => {
  it('preserves Twitch roles, fragments, reply and server message ID', () => {
    const e = normalizeTwitch(
      'channel.chat.message',
      {
        ...twitchEvent,
        reply: {
          parent_message_id: 'parent',
          parent_user_name: 'Other',
          parent_message_body: 'Question',
        },
      },
      'twitch:owner',
      '2026-09-28T00:00:00Z',
    );
    expect(e).toMatchObject({
      type: 'chat',
      message: {
        id: 'msg',
        source: 'live',
        user: { roles: ['moderator'], color: '#123456' },
        reply: { messageId: 'parent' },
        fragments: [{ type: 'text' }, { type: 'emote' }],
      },
    });
  });
  it('maps YouTube members, Super Chat, tombstones and temporary bans', () => {
    const snippet = {
      type: 'SUPER_CHAT_EVENT',
      publishedAt: '2026-09-28T00:00:00Z',
      displayMessage: 'Thanks',
      superChatDetails: { amountDisplayString: '$5' },
    };
    expect(
      normalizeYouTube(
        {
          id: 'a',
          snippet,
          authorDetails: { channelId: 'viewer', displayName: 'Viewer', isChatSponsor: true },
        },
        'youtube:owner',
        'chat',
      ),
    ).toMatchObject({
      type: 'donation',
      message: { metadata: { amount: '$5' }, user: { roles: ['member'] } },
    });
    expect(
      normalizeYouTube(
        { id: 'a', snippet: { ...snippet, type: 'TOMBSTONE' } },
        'youtube:owner',
        'chat',
      ),
    ).toMatchObject({ type: 'moderation', action: 'delete', messageId: 'a' });
    expect(
      normalizeYouTube(
        {
          id: 'b',
          snippet: {
            ...snippet,
            type: 'USER_BANNED_EVENT',
            userBannedDetails: {
              banType: 'TEMPORARY',
              banDurationSeconds: '30',
              bannedUserDetails: { channelId: 'viewer' },
            },
          },
        },
        'youtube:owner',
        'chat',
      ),
    ).toMatchObject({ action: 'timeout', duration: 30, targetUserId: 'viewer' });
  });
  it('loads the official protobuf and uses the documented gRPC method/field numbers', () => {
    const service = youtubeProtoDefinition[
      'youtube.api.v3.V3DataLiveChatMessageService'
    ] as ServiceDefinition;
    expect(service.StreamList.path).toBe('/youtube.api.v3.V3DataLiveChatMessageService/StreamList');
    const encoded = service.StreamList.requestSerialize({
      liveChatId: 'chat',
      part: ['snippet'],
      pageToken: 'resume',
    });
    expect(service.StreamList.requestDeserialize(encoded)).toMatchObject({
      liveChatId: 'chat',
      pageToken: 'resume',
      part: ['snippet'],
    });
  });
});
describe('Twitch production adapter with fake transports', () => {
  it('subscribes, deduplicates, sends, moderates and migrates reconnect URL without resubscribing', async () => {
    class Socket extends EventEmitter {
      closed = false;
      close() {
        this.closed = true;
        this.emit('close');
      }
    }
    const sockets: Socket[] = [];
    const urls: string[] = [];
    const requests: { url: string; init: RequestInit }[] = [];
    const a = account('twitch');
    const session = {
      validateTwitch: async () => ({ user_id: 'owner', client_id: 'client', scopes: a.scopes }),
      request: async (url: string, init: RequestInit = {}) => {
        requests.push({ url, init });
        return url.includes('/streams?')
          ? { data: [] }
          : url.endsWith('/chat/messages')
            ? { data: [{ is_sent: true }] }
            : { data: [] };
      },
    } as unknown as TokenSession;
    const adapter = new TwitchPlatformAdapter(
      a,
      session,
      () => undefined,
      (url) => {
        urls.push(url);
        const s = new Socket();
        sockets.push(s);
        return s as unknown as WebSocket;
      },
    );
    const events: StreamEvent[] = [];
    adapter.subscribe((e) => events.push(e));
    await adapter.connect();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const packet = (type: string, payload: unknown, id = 'event') =>
      JSON.stringify({
        metadata: {
          message_type: type,
          message_id: id,
          message_timestamp: new Date().toISOString(),
          subscription_type: 'channel.chat.message',
        },
        payload,
      });
    sockets[0].emit(
      'message',
      packet('session_welcome', { session: { id: 'first', keepalive_timeout_seconds: 30 } }),
    );
    await vi.waitFor(async () =>
      expect((await adapter.getCurrentAccount()).connectionStatus).toBe('connected'),
    );
    expect(requests.filter((r) => r.url.endsWith('eventsub/subscriptions'))).toHaveLength(5);
    sockets[0].emit('message', packet('notification', { event: twitchEvent }, 'same'));
    sockets[0].emit('message', packet('notification', { event: twitchEvent }, 'same'));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    await adapter.sendMessage('outgoing');
    expect(events).toHaveLength(1);
    await adapter.timeoutUser('viewer', 30, 'reason');
    expect(
      JSON.parse(requests.find((r) => r.url.includes('moderation/bans'))!.init.body as string),
    ).toEqual({ data: { user_id: 'viewer', duration: 30, reason: 'reason' } });
    sockets[0].emit(
      'message',
      packet('session_reconnect', {
        session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?reconnect=opaque' },
      }),
    );
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1].emit(
      'message',
      packet('session_welcome', { session: { id: 'second', keepalive_timeout_seconds: 30 } }),
    );
    await vi.waitFor(() => expect(sockets[0].closed).toBe(true));
    expect(requests.filter((r) => r.url.endsWith('eventsub/subscriptions'))).toHaveLength(5);
    expect(urls[1]).toContain('reconnect=');
    await adapter.disconnect();
    expect(sockets[1].closed).toBe(true);
  });
});
describe('YouTube production adapter with fake transports', () => {
  it('discovers one active broadcast, resumes tokens, persists ban IDs and unbans by resource ID', async () => {
    const store = new Store(':memory:');
    const a = account('youtube');
    store.accounts.save(a);
    const requests: { url: string; init: RequestInit }[] = [];
    const session = {
      get: async () => ({ accessToken: 'test-token' }),
      request: async (url: string, init: RequestInit = {}) => {
        requests.push({ url, init });
        if (url.includes('liveBroadcasts'))
          return {
            items: [
              {
                id: 'video',
                snippet: { title: 'Live', channelId: 'owner', liveChatId: 'chat' },
                status: { lifeCycleStatus: 'live' },
              },
            ],
          };
        return { id: 'ban-123' };
      },
    } as unknown as TokenSession;
    const stream = vi.fn(
      async (
        _chat: string,
        _page: string | undefined,
        _token: string,
        signal: AbortSignal,
        batch: (v: object) => void,
        ready: () => void,
      ) => {
        ready();
        batch({
          nextPageToken: 'resume',
          items: [
            {
              id: 'message',
              snippet: {
                type: 'TEXT_MESSAGE_EVENT',
                publishedAt: new Date().toISOString(),
                displayMessage: 'hello',
              },
              authorDetails: { channelId: 'viewer', displayName: 'Viewer' },
            },
          ],
        });
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
      },
    );
    const adapter = new YouTubePlatformAdapter(
      a,
      session,
      () => undefined,
      {
        get: async (key) => store.accounts.ban(key),
        save: async (b) => store.accounts.saveBan(b),
        remove: async (key) => store.accounts.deleteBan(key),
      },
      stream,
    );
    const events: StreamEvent[] = [];
    adapter.subscribe((e) => events.push(e));
    await adapter.connect();
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect((await adapter.getCurrentAccount()).channel?.title).toBe('Live');
    await adapter.banUser('viewer');
    expect(
      store.accounts.ban({ accountId: a.id, liveChatId: 'chat', userId: 'viewer' })?.banId,
    ).toBe('ban-123');
    await adapter.unbanUser('viewer');
    expect(requests.at(-1)?.url).toContain('liveChat/bans?id=ban-123');
    await expect(adapter.unbanUser('missing')).rejects.toThrow(/ID бана/);
    await adapter.disconnect();
    await adapter.connect();
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
    expect(stream.mock.calls[1][1]).toBe('resume');
    expect(events.filter((e) => 'message' in e)).toHaveLength(1);
    await adapter.disconnect();
    store.close();
  });
});
