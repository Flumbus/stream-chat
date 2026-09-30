import { LiveAdapter } from '../common/LiveAdapter';
import { PlatformError } from '../common/errors';
import { Deduplicator } from '../../shared/events';
import type { ChannelTarget, ChatUser, PlatformAccount } from '../../shared/models';
import type { TokenSession } from '../../main/security/TokenSession';
import type { BanRecord } from '../../main/database/accounts';
import { normalizeYouTube, type YouTubeMessage } from './normalize';
import { youtubeStream, type YouTubeStream } from './stream';
export interface BanRepository {
  get(key: Omit<BanRecord, 'banId' | 'expiresAt'>): Promise<BanRecord | undefined>;
  save(ban: BanRecord): Promise<void>;
  remove(key: Omit<BanRecord, 'banId' | 'expiresAt'>): Promise<void>;
}
interface Broadcast {
  id: string;
  snippet: { title: string; channelId: string; liveChatId?: string };
  status: { lifeCycleStatus: string };
}
const base = 'https://www.googleapis.com/youtube/v3/';
export class YouTubePlatformAdapter extends LiveAdapter {
  private dedup = new Deduplicator();
  private pageToken?: string;
  constructor(
    account: PlatformAccount,
    session: TokenSession,
    changed: (a: PlatformAccount) => void,
    private bans: BanRepository,
    private stream: YouTubeStream = youtubeStream,
  ) {
    super(account, session, changed);
  }
  private api<T>(path: string, init: RequestInit = {}) {
    return this.session.request<T>(base + path, init);
  }
  async listChannels(): Promise<ChannelTarget[]> {
    const result: ChannelTarget[] = [];
    let cursor = '';
    do {
      const r = await this.api<{ items: Broadcast[]; nextPageToken?: string }>(
        `liveBroadcasts?part=id,snippet,status&broadcastStatus=active&broadcastType=all&maxResults=50${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ''}`,
      );
      result.push(
        ...r.items
          .filter(
            (b) => b.snippet.channelId === this.account.platformAccountId && b.snippet.liveChatId,
          )
          .map((b) => ({
            id: b.id,
            title: b.snippet.title,
            channelId: b.snippet.channelId,
            liveChatId: b.snippet.liveChatId,
            live: b.status.lifeCycleStatus === 'live',
          })),
      );
      cursor = r.nextPageToken ?? '';
    } while (cursor);
    return result;
  }
  async selectChannel(id: string) {
    const channel = (await this.listChannels()).find((c) => c.id === id);
    if (!channel)
      throw new PlatformError('CHAT_OFFLINE', 'Активная трансляция не найдена. Обновите список.');
    await this.disconnect();
    this.pageToken = undefined;
    this.update({ channel });
    await this.connect();
  }
  protected async run(signal: AbortSignal, ready: () => void) {
    const channels = await this.listChannels();
    if (signal.aborted) return;
    const previous = this.account.channel;
    const channel =
      channels.find((c) => c.id === previous?.id) ??
      (channels.length === 1 ? channels[0] : undefined);
    if (!channel) {
      this.update({
        channel: undefined,
        transportState: channels.length ? 'Выберите трансляцию' : 'Нет активной трансляции',
      });
      return;
    }
    if (previous?.liveChatId !== channel.liveChatId) this.pageToken = undefined;
    this.update({
      channel,
      authStatus: 'authorized',
      lastValidatedAt: new Date().toISOString(),
      capabilities: {
        send: true,
        delete: true,
        ban: true,
        timeout: true,
        unban: true,
        readProfile: true,
      },
      transportState: 'YouTube: streamList',
    });
    let refreshed = false;
    while (!signal.aborted) {
      const token = await this.session.get(refreshed);
      if (signal.aborted) return;
      try {
        await this.stream(
          channel.liveChatId!,
          this.pageToken,
          token.accessToken,
          signal,
          (data) => {
            for (const item of data.items ?? []) {
              // Tombstones reuse the deleted message ID and must bypass message dedup.
              const tombstone = item.snippet.type.toLowerCase() === 'tombstone';
              if (tombstone || this.dedup.accept(item.id)) {
                const e = normalizeYouTube(item, this.account.id, channel.liveChatId!);
                if (e) this.emit(e);
              }
            }
            if (data.nextPageToken) this.pageToken = data.nextPageToken;
          },
          ready,
        );
        return;
      } catch (e) {
        if (e instanceof PlatformError && e.code === 'AUTH_REQUIRED' && !refreshed) {
          refreshed = true;
          continue;
        }
        throw e;
      }
    }
  }
  private chatId() {
    const id = this.account.channel?.liveChatId;
    if (!id)
      throw new PlatformError('CHAT_OFFLINE', 'Нет активного Live Chat. Выберите трансляцию.');
    return id;
  }
  async sendMessage(message: string) {
    this.require('send');
    await this.api<YouTubeMessage>('liveChat/messages?part=snippet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: {
          liveChatId: this.chatId(),
          type: 'textMessageEvent',
          textMessageDetails: { messageText: message },
        },
      }),
    });
  }
  private banKey(userId: string) {
    return { accountId: this.account.id, liveChatId: this.chatId(), userId };
  }
  private async ban(userId: string, duration?: number) {
    this.require(duration ? 'timeout' : 'ban');
    const key = this.banKey(userId);
    const result = await this.api<{ id: string }>('liveChat/bans?part=snippet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: {
          liveChatId: key.liveChatId,
          type: duration ? 'temporary' : 'permanent',
          bannedUserDetails: { channelId: userId },
          banDurationSeconds: duration,
        },
      }),
    });
    if (!result.id)
      throw new PlatformError(
        'BAN_ID_MISSING',
        'YouTube не вернул ID бана. Обновите состояние трансляции.',
      );
    await this.bans.save({
      ...key,
      banId: result.id,
      expiresAt: duration ? new Date(Date.now() + duration * 1000).toISOString() : undefined,
    });
    this.emit({
      type: 'moderation',
      platform: 'youtube',
      channelId: key.liveChatId,
      targetUserId: userId,
      source: 'live',
      action: duration ? 'timeout' : 'ban',
      duration,
      occurredAt: new Date().toISOString(),
    });
  }
  async banUser(userId: string) {
    await this.ban(userId);
  }
  async timeoutUser(userId: string, duration: number) {
    await this.ban(userId, duration);
  }
  async unbanUser(userId: string) {
    this.require('unban');
    const key = this.banKey(userId);
    const ban = await this.bans.get(key);
    if (!ban)
      throw new PlatformError(
        'BAN_ID_MISSING',
        'ID бана неизвестен: снять через API можно только сохранённый StreamChat бан этого Live Chat.',
      );
    await this.api(`liveChat/bans?id=${encodeURIComponent(ban.banId)}`, { method: 'DELETE' });
    await this.bans.remove(key);
    this.emit({
      type: 'moderation',
      platform: 'youtube',
      channelId: key.liveChatId,
      source: 'live',
      targetUserId: userId,
      action: 'unban',
    });
  }
  async deleteMessage(messageId: string) {
    this.require('delete');
    await this.api(`liveChat/messages?id=${encodeURIComponent(messageId)}`, { method: 'DELETE' });
    this.emit({
      type: 'moderation',
      platform: 'youtube',
      channelId: this.chatId(),
      source: 'live',
      targetUserId: '',
      action: 'delete',
      messageId,
    });
  }
  async getUser(id: string): Promise<ChatUser | undefined> {
    const r = await this.api<{
      items: {
        id: string;
        snippet: { title: string; customUrl?: string; thumbnails: { default: { url: string } } };
      }[];
    }>(`channels?part=snippet&id=${encodeURIComponent(id)}`);
    const u = r.items[0];
    return u
      ? {
          platformUserId: u.id,
          username: u.snippet.customUrl ?? u.snippet.title,
          displayName: u.snippet.title,
          avatarUrl: u.snippet.thumbnails.default.url,
          roles: [],
          badges: [],
        }
      : undefined;
  }
}
