import WebSocket from 'ws';
import { LiveAdapter } from '../common/LiveAdapter';
import { PlatformError } from '../common/errors';
import { Deduplicator } from '../../shared/events';
import type { ChannelTarget, ChatUser, PlatformAccount } from '../../shared/models';
import type { TokenSession } from '../../main/security/TokenSession';
import { normalizeTwitch, type TwitchEvent } from './normalize';
interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}
interface Envelope {
  metadata: {
    message_type: string;
    message_id: string;
    message_timestamp: string;
    subscription_type?: string;
  };
  payload: {
    session?: { id: string; keepalive_timeout_seconds: number; reconnect_url?: string };
    subscription?: { type: string; status: string };
    event?: TwitchEvent;
  };
}
export type SocketFactory = (url: string) => WebSocket;
const endpoint = 'https://api.twitch.tv/helix/';
export class TwitchPlatformAdapter extends LiveAdapter {
  private dedup = new Deduplicator();
  constructor(
    account: PlatformAccount,
    session: TokenSession,
    changed: (a: PlatformAccount) => void,
    private socket: SocketFactory = (url) =>
      new WebSocket(url, { maxPayload: 1024 * 1024, handshakeTimeout: 20_000 }),
  ) {
    super(account, session, changed);
  }
  private api<T>(path: string, init: RequestInit = {}) {
    return this.session.request<T>(endpoint + path, init);
  }
  async listChannels(): Promise<ChannelTarget[]> {
    const own: ChannelTarget = {
      id: this.account.platformAccountId,
      channelId: this.account.platformAccountId,
      title: this.account.displayName,
      live: false,
    };
    const channels = [own];
    let cursor = '';
    if (this.account.scopes.includes('user:read:moderated_channels'))
      do {
        const result = await this.api<{
          data: { broadcaster_id: string; broadcaster_name: string }[];
          pagination: { cursor?: string };
        }>(
          `moderation/channels?user_id=${encodeURIComponent(this.account.platformAccountId)}&first=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`,
        );
        channels.push(
          ...result.data.map((c) => ({
            id: c.broadcaster_id,
            channelId: c.broadcaster_id,
            title: c.broadcaster_name,
            live: false,
          })),
        );
        cursor = result.pagination.cursor ?? '';
      } while (cursor);
    return channels;
  }
  async selectChannel(target: string) {
    let channel = (await this.listChannels()).find((c) => c.id === target);
    if (!channel) {
      const r = await this.api<{ data: TwitchUser[] }>(`users?login=${encodeURIComponent(target)}`);
      if (!r.data[0]) throw new PlatformError('CHANNEL_NOT_FOUND', 'Канал Twitch не найден.');
      channel = {
        id: r.data[0].id,
        channelId: r.data[0].id,
        title: r.data[0].display_name,
        live: false,
      };
    }
    await this.disconnect();
    this.update({ channel });
    await this.connect();
  }
  protected async run(signal: AbortSignal, ready: () => void) {
    const validation = await this.session.validateTwitch();
    if (signal.aborted) return;
    if (validation.user_id !== this.account.platformAccountId)
      throw new PlatformError('AUTH_REQUIRED', 'Сессия принадлежит другому Twitch аккаунту.');
    this.update({
      scopes: validation.scopes,
      authStatus: 'authorized',
      lastValidatedAt: new Date().toISOString(),
    });
    const choices = await this.listChannels();
    if (signal.aborted) return;
    const channel = this.account.channel ?? choices[0];
    const mod = choices.some((c) => c.id === channel.id);
    const streams = await this.api<{ data: unknown[] }>(
      `streams?user_id=${encodeURIComponent(channel.id)}`,
    );
    if (signal.aborted) return;
    this.update({
      channel: { ...channel, live: streams.data.length > 0 },
      capabilities: {
        send: validation.scopes.includes('user:write:chat'),
        delete: mod && validation.scopes.includes('moderator:manage:chat_messages'),
        ban: mod && validation.scopes.includes('moderator:manage:banned_users'),
        timeout: mod && validation.scopes.includes('moderator:manage:banned_users'),
        unban: mod && validation.scopes.includes('moderator:manage:banned_users'),
        readProfile: true,
      },
    });
    await new Promise<void>((resolve, reject) => {
      const sockets = new Set<WebSocket>();
      let active: WebSocket | undefined;
      let watchdog: ReturnType<typeof setTimeout>;
      let finished = false;
      const cleanup = () => {
        clearTimeout(watchdog);
        clearInterval(validationTimer);
        signal.removeEventListener('abort', cancel);
        for (const ws of sockets) {
          ws.removeAllListeners();
          ws.on('error', () => undefined);
          ws.close();
        }
        sockets.clear();
      };
      const finish = (error?: unknown) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => finish();
      signal.addEventListener('abort', cancel, { once: true });
      const validationTimer = setInterval(() => {
        void this.session
          .validateTwitch()
          .then((v) => {
            if (!signal.aborted)
              this.update({ scopes: v.scopes, lastValidatedAt: new Date().toISOString() });
          })
          .catch(finish);
      }, 55 * 60_000);
      let timeout = 30_000;
      const touch = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(
          () =>
            finish(
              new PlatformError(
                'KEEPALIVE_TIMEOUT',
                'Twitch не отвечает. Восстанавливаем соединение.',
                true,
              ),
            ),
          timeout + 1000,
        );
      };
      const connect = (url: string, migrate = false) => {
        const ws = this.socket(url);
        sockets.add(ws);
        let welcomed = false;
        ws.on('error', () =>
          finish(new PlatformError('WEBSOCKET_ERROR', 'Соединение Twitch прервано.', true)),
        );
        ws.on('close', () => {
          sockets.delete(ws);
          if (ws === active || !welcomed)
            finish(
              new PlatformError(
                'WEBSOCKET_CLOSED',
                'Twitch закрыл соединение. Переподключаемся.',
                true,
              ),
            );
        });
        ws.on('message', (raw) => {
          void (async () => {
            const packet = JSON.parse(raw.toString()) as Envelope;
            const kind = packet.metadata?.message_type;
            if (!kind) return;
            if (kind === 'session_welcome') {
              if (welcomed) return;
              welcomed = true;
              const session = packet.payload.session!;
              timeout = (session.keepalive_timeout_seconds || 30) * 1000;
              if (!migrate) {
                for (const type of [
                  'channel.chat.message',
                  'channel.chat.message_delete',
                  'channel.chat.clear',
                  'channel.chat.clear_user_messages',
                  'channel.chat.notification',
                ]) {
                  if (signal.aborted) return;
                  await this.api('eventsub/subscriptions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      type,
                      version: '1',
                      condition: {
                        broadcaster_user_id: channel.id,
                        user_id: this.account.platformAccountId,
                      },
                      transport: { method: 'websocket', session_id: session.id },
                    }),
                  });
                }
              }
              if (signal.aborted || finished) return;
              const previous = active;
              active = ws;
              if (previous && previous !== ws) {
                previous.removeAllListeners();
                previous.on('error', () => undefined);
                previous.close();
                sockets.delete(previous);
              }
              touch();
              this.update({ transportState: 'EventSub: subscribed' });
              ready();
            } else if (kind === 'session_reconnect') {
              const next = new URL(packet.payload.session?.reconnect_url ?? '');
              if (next.protocol !== 'wss:' || next.hostname !== 'eventsub.wss.twitch.tv')
                throw new PlatformError(
                  'RECONNECT_URL',
                  'Twitch прислал недопустимый адрес переподключения.',
                );
              if (sockets.size === 1) {
                this.update({
                  connectionStatus: 'reconnecting',
                  transportState: 'EventSub: migrating',
                  lastReconnectAt: new Date().toISOString(),
                });
                connect(next.href, true);
              }
            } else if (kind === 'revocation')
              throw new PlatformError(
                'AUTH_REQUIRED',
                'Подписка Twitch отозвана. Войдите заново и проверьте разрешения.',
              );
            else {
              if (ws === active) touch();
              if (kind === 'notification' && this.dedup.accept(packet.metadata.message_id)) {
                const e = normalizeTwitch(
                  packet.metadata.subscription_type ?? packet.payload.subscription?.type ?? '',
                  packet.payload.event!,
                  this.account.id,
                  packet.metadata.message_timestamp,
                );
                if (e) this.emit(e);
              }
            }
          })().catch(finish);
        });
      };
      touch();
      connect('wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30');
    });
  }
  async sendMessage(message: string) {
    this.require('send');
    const r = await this.api<{ data: { is_sent: boolean; drop_reason?: { code: string } }[] }>(
      'chat/messages',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broadcaster_id: this.account.channel!.id,
          sender_id: this.account.platformAccountId,
          message,
        }),
      },
    );
    if (!r.data[0]?.is_sent)
      throw new PlatformError(
        'MESSAGE_DROPPED',
        'Twitch не принял сообщение. Проверьте slow mode, ограничения чата и текст.',
      );
  }
  private query() {
    return `broadcaster_id=${encodeURIComponent(this.account.channel!.id)}&moderator_id=${encodeURIComponent(this.account.platformAccountId)}`;
  }
  private async ban(userId: string, duration?: number, reason?: string) {
    this.require(duration ? 'timeout' : 'ban');
    await this.api(`moderation/bans?${this.query()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { user_id: userId, duration, reason } }),
    });
    this.emit({
      type: 'moderation',
      platform: 'twitch',
      channelId: this.account.channel!.id,
      source: 'live',
      targetUserId: userId,
      action: duration ? 'timeout' : 'ban',
      duration,
      occurredAt: new Date().toISOString(),
    });
  }
  async banUser(userId: string, reason?: string) {
    await this.ban(userId, undefined, reason);
  }
  async timeoutUser(userId: string, duration: number, reason?: string) {
    await this.ban(userId, duration, reason);
  }
  async unbanUser(userId: string) {
    this.require('unban');
    await this.api(`moderation/bans?${this.query()}&user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    this.emit({
      type: 'moderation',
      platform: 'twitch',
      channelId: this.account.channel!.id,
      source: 'live',
      targetUserId: userId,
      action: 'unban',
    });
  }
  async deleteMessage(messageId: string) {
    this.require('delete');
    await this.api(`moderation/chat?${this.query()}&message_id=${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
    this.emit({
      type: 'moderation',
      platform: 'twitch',
      channelId: this.account.channel!.id,
      source: 'live',
      targetUserId: '',
      action: 'delete',
      messageId,
    });
  }
  async getUser(userId: string): Promise<ChatUser | undefined> {
    const r = await this.api<{ data: TwitchUser[] }>(`users?id=${encodeURIComponent(userId)}`);
    const u = r.data[0];
    return u
      ? {
          platformUserId: u.id,
          username: u.login,
          displayName: u.display_name,
          avatarUrl: u.profile_image_url,
          roles: [],
          badges: [],
        }
      : undefined;
  }
}
