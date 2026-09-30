import { StreamChatApi } from '../../main/services/StreamChatApi';
import { youtubeResponses } from '../../main/services/YouTubeApiSchema';
import { delay } from './http';
import WebSocket from 'ws';
import type { PlatformAdapter } from '../../shared/contracts';
import type { ChannelTarget, ChatUser, PlatformAccount, StreamEvent } from '../../shared/models';
import { parseChannelLink } from '../../shared/channelLinks';
import { Deduplicator } from '../../shared/events';
import { ConnectionManager } from '../../main/services/ConnectionManager';
import { asPlatformError, PlatformError } from './errors';
import { jsonRequest, type Fetch } from './http';
import { parseIrc, ircEvent } from '../twitch/guestIrc';
import { normalizeYouTube } from '../youtube/normalize';
import { youtubeStream, type YouTubeStream } from '../youtube/stream';
export const readOnlyCapabilities = {
  send: false,
  delete: false,
  ban: false,
  timeout: false,
  unban: false,
  readProfile: false,
};
export class LinkedChatAdapter implements PlatformAdapter {
  private manager: ConnectionManager;
  private listeners = new Set<(e: StreamEvent) => void>();
  private dedup = new Deduplicator();
  private pageToken?: string;
  constructor(
    private account: PlatformAccount,
    private key: string | undefined,
    private changed: (a: PlatformAccount) => void,
    private http: Fetch = fetch,
    private stream: YouTubeStream = youtubeStream,
    private socket: (url: string) => WebSocket = (url) =>
      new WebSocket(url, { handshakeTimeout: 20000, maxPayload: 1024 * 1024 }),
    private api?: StreamChatApi,
  ) {
    this.manager = new ConnectionManager(
      (signal, ready) => this.run(signal, ready),
      (connectionStatus, error) => {
        const e = error ? asPlatformError(error) : undefined;
        this.update({
          connectionStatus,
          lastError: e?.message,
          errorCode: e?.code,
          lastReconnectAt:
            connectionStatus === 'reconnecting'
              ? new Date().toISOString()
              : this.account.lastReconnectAt,
        });
      },
    );
  }
  private update(patch: Partial<PlatformAccount>) {
    this.account = { ...this.account, ...patch, capabilities: { ...readOnlyCapabilities } };
    this.changed(this.account);
  }
  private emit(e: StreamEvent) {
    if ('message' in e && !this.dedup.accept(e.message.id)) return;
    for (const fn of this.listeners) fn(e);
  }
  subscribe(fn: (e: StreamEvent) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  async getCurrentAccount() {
    return this.account;
  }
  async connect() {
    this.manager.start();
  }
  async restoreSession() {
    await this.connect();
  }
  async startChat() {
    await this.connect();
  }
  async disconnect() {
    this.manager.stop();
  }
  async stopChat() {
    await this.disconnect();
  }
  resume() {
    this.manager.resume();
  }
  async getUser(): Promise<ChatUser | undefined> {
    return undefined;
  }
  async listChannels(): Promise<ChannelTarget[]> {
    return this.account.channel ? [this.account.channel] : [];
  }
  async selectChannel() {
    throw new PlatformError(
      'READ_ONLY',
      'Чтобы изменить канал, удалите эту ссылку и добавьте новую.',
    );
  }
  private denied(): Promise<void> {
    return Promise.reject(
      new PlatformError(
        'READ_ONLY',
        'Канал подключён по ссылке: отправка сообщений и модерация невозможны.',
      ),
    );
  }
  sendMessage() {
    return this.denied();
  }
  timeoutUser() {
    return this.denied();
  }
  banUser() {
    return this.denied();
  }
  unbanUser() {
    return this.denied();
  }
  deleteMessage() {
    return this.denied();
  }
  private async run(signal: AbortSignal, ready: () => void) {
    const link = parseChannelLink(this.account.platform, this.account.readOnlyLink!);
    if (link.platform === 'twitch') return this.twitch(link.target, signal, ready);
    if (!this.key && !this.api)
      throw new PlatformError(
        'CONFIG_REQUIRED',
        'Для YouTube по ссылке укажите YOUTUBE_API_KEY в .env и перезапустите приложение. OAuth для чтения публичного чата не нужен.',
      );
    const request = async <T>(path: string, params: Record<string, string>): Promise<T> => {
      try {
        if (this.api) {
          const operation = path as keyof typeof youtubeResponses;
          if (!Object.hasOwn(youtubeResponses, operation))
            throw new Error('Invalid YouTube operation');
          return (await this.api.request<unknown>(
            `/v1/youtube/${path}?${new URLSearchParams(params)}`,
            youtubeResponses[operation],
            undefined,
            signal,
          )) as T;
        }
        return await jsonRequest<T>(
          `https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams(params)}`,
          {
            headers: { 'X-Goog-Api-Key': this.key! },
            signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
          },
          this.http,
        );
      } catch (error) {
        if (
          error instanceof PlatformError &&
          ['FORBIDDEN', 'AUTH_REQUIRED', 'REQUEST_REJECTED'].includes(error.code)
        )
          throw new PlatformError(
            'YOUTUBE_LINK_ACCESS',
            'YouTube отклонил чтение. Проверьте YOUTUBE_API_KEY, включённый YouTube Data API v3 и доступность публичного чата.',
          );
        throw error;
      }
    };
    let video = link.kind === 'video' ? link.target : undefined;
    if (!video) {
      let channelId = link.target;
      if (link.kind !== 'channel') {
        const c = await request<{ items?: { id: string }[] }>('channels', {
          part: 'id',
          [link.kind === 'handle' ? 'forHandle' : 'forUsername']: link.target,
        });
        if (!c.items?.[0])
          throw new PlatformError(
            'CHANNEL_NOT_FOUND',
            'YouTube-канал не найден. Попробуйте прямую ссылку на трансляцию.',
          );
        channelId = c.items[0].id;
      }
      const found = await request<{ items?: { id: { videoId: string } }[] }>('search', {
        part: 'id',
        channelId,
        eventType: 'live',
        type: 'video',
        maxResults: '5',
      });
      if (!found.items?.length)
        throw new PlatformError(
          'CHAT_OFFLINE',
          'На этом YouTube-канале нет доступного прямого эфира. Нажмите Reconnect, когда эфир начнётся.',
        );
      if (found.items.length > 1)
        throw new PlatformError(
          'CHOOSE_BROADCAST',
          'На канале несколько эфиров. Добавьте прямую ссылку на нужное видео или его чат.',
        );
      video = found.items[0].id.videoId;
    }
    const result = await request<{
      items?: {
        id: string;
        snippet: { title: string; channelId: string };
        liveStreamingDetails?: { activeLiveChatId?: string };
      }[];
    }>('videos', { part: 'snippet,liveStreamingDetails', id: video });
    const item = result.items?.[0];
    const chatId = item?.liveStreamingDetails?.activeLiveChatId;
    if (!item || !chatId)
      throw new PlatformError(
        'CHAT_OFFLINE',
        'Активный чат не найден: эфир ещё не начался, завершён или чат отключён.',
      );
    if (signal.aborted) return;
    if (this.account.channel?.liveChatId !== chatId) this.pageToken = undefined;
    this.update({
      displayName: item.snippet.title,
      channel: {
        id: item.id,
        title: item.snippet.title,
        channelId: item.snippet.channelId,
        liveChatId: chatId,
        live: true,
      },
      transportState: 'YouTube: streamList · только чтение',
    });
    if (this.api) {
      this.update({ transportState: 'StreamChat API · YouTube' });
      let connected = false;
      while (!signal.aborted) {
        const params = new URLSearchParams({
          liveChatId: chatId,
          ...(this.pageToken ? { pageToken: this.pageToken } : {}),
        });
        const data = await this.api.request(
          '/v1/youtube/liveChatMessages?' + params,
          youtubeResponses.liveChatMessages,
          undefined,
          signal,
        );
        if (signal.aborted) return;
        if (!connected) {
          ready();
          connected = true;
        }
        for (const message of data.items) {
          const event = normalizeYouTube(message, this.account.id, chatId);
          if (event) this.emit(event);
        }
        this.pageToken = data.nextPageToken;
        if (data.offlineAt) {
          this.update({ channel: { ...this.account.channel!, live: false } });
          return;
        }
        await delay(Math.max(5000, data.pollingIntervalMillis), signal);
      }
      return;
    }
    await this.stream(
      chatId,
      this.pageToken,
      this.key!,
      signal,
      (data) => {
        if (signal.aborted) return;
        for (const m of data.items ?? []) {
          const e = normalizeYouTube(m, this.account.id, chatId);
          if (e) this.emit(e);
        }
        if (data.nextPageToken) this.pageToken = data.nextPageToken;
      },
      ready,
      'api-key',
    ).catch((error: unknown) => {
      if (error instanceof PlatformError && ['AUTH_REQUIRED', 'FORBIDDEN'].includes(error.code))
        throw new PlatformError(
          'YOUTUBE_LINK_ACCESS',
          'YouTube отклонил чтение. Проверьте YOUTUBE_API_KEY, включённый YouTube Data API v3 и доступность публичного чата.',
        );
      throw error;
    });
    if (!signal.aborted) this.update({ channel: { ...this.account.channel!, live: false } });
  }
  private async twitch(login: string, signal: AbortSignal, ready: () => void) {
    if (signal.aborted) return;
    this.update({ transportState: 'Twitch: гостевой IRC · только чтение' });
    await new Promise<void>((resolve, reject) => {
      const ws = this.socket('wss://irc-ws.chat.twitch.tv:443');
      let done = false,
        joined = false;
      let buffer = '';
      const finish = (error?: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(watchdog);
        signal.removeEventListener('abort', cancel);
        ws.removeAllListeners();
        ws.on('error', () => undefined);
        ws.terminate();
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => finish();
      let watchdog = setTimeout(
        () =>
          finish(
            new PlatformError(
              'CHAT_TIMEOUT',
              'Twitch не подтвердил подключение. Проверьте ссылку и сеть.',
              true,
            ),
          ),
        30000,
      );
      signal.addEventListener('abort', cancel, { once: true });
      ws.on('open', () => {
        // Twitch WebSocket expects each client command in its own frame.
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        ws.send('PASS SCHMOOPIIE');
        ws.send(`NICK justinfan${Math.floor(100000 + Math.random() * 900000)}`);
      });
      ws.on('error', () =>
        finish(
          new PlatformError(
            'NETWORK_ERROR',
            'Гостевое соединение Twitch недоступно. Проверьте сеть.',
            true,
          ),
        ),
      );
      ws.on('close', () =>
        finish(new PlatformError('WEBSOCKET_CLOSED', 'Twitch закрыл чат. Переподключаемся.', true)),
      );
      ws.on('message', (raw) => {
        if (done || signal.aborted) return;
        buffer += raw.toString();
        if (buffer.length > 1024 * 1024)
          return finish(
            new PlatformError('IRC_SIZE', 'Twitch прислал слишком большой пакет.', true),
          );
        const lines = buffer.split('\r\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const p = parseIrc(line);
          if (!p) continue;
          if (p.command === 'PING') {
            ws.send(`PONG :${p.text}\r\n`);
          } else if (p.command === '001') ws.send(`JOIN #${login}\r\n`);
          else if (p.command === 'RECONNECT')
            return finish(
              new PlatformError('IRC_RECONNECT', 'Twitch запросил переподключение.', true),
            );
          else if (
            p.command === 'NOTICE' &&
            (/auth|login|suspended|banned|unavailable/i.test(p.text) || p.tags['msg-id'])
          )
            return finish(
              new PlatformError(
                'GUEST_UNAVAILABLE',
                'Гостевой чат недоступен для этого канала. Проверьте ссылку или используйте вход Twitch.',
              ),
            );
          if (!joined && (p.command === 'ROOMSTATE' || p.command === '366')) {
            joined = true;
            this.update({
              channel: {
                id: p.tags['room-id'] || login,
                channelId: p.tags['room-id'] || login,
                title: login,
                live: false,
              },
            });
            ready();
          }
          if (p.tags['room-id'] && this.account.channel?.id !== p.tags['room-id'])
            this.update({
              channel: {
                id: p.tags['room-id'],
                channelId: p.tags['room-id'],
                title: login,
                live: false,
              },
            });
          const e = ircEvent(line, this.account.id, this.account.channel?.id ?? login);
          if (e) this.emit(e);
          if (joined) {
            clearTimeout(watchdog);
            watchdog = setTimeout(
              () => finish(new PlatformError('IRC_TIMEOUT', 'Twitch перестал отвечать.', true)),
              300000,
            );
          }
        }
      });
    });
  }
}
