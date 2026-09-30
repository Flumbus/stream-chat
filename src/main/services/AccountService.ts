import { StreamChatApi } from './StreamChatApi';
import { BrowserWindow, safeStorage, shell } from 'electron';
import { createHash } from 'node:crypto';
import { parseChannelLink } from '../../shared/channelLinks';
import { LinkedChatAdapter, readOnlyCapabilities } from '../../platforms/common/LinkedChatAdapter';
import type { OAuthState, Platform, PlatformAccount, StreamEvent } from '../../shared/models';
import { CredentialVault, type Tokens } from '../security/CredentialVault';
import { googleOAuth, twitchOAuth, revokeTokens, type OAuthConfig } from '../security/OAuth';
import { TokenSession } from '../security/TokenSession';
import { TwitchPlatformAdapter } from '../../platforms/twitch/TwitchPlatformAdapter';
import { YouTubePlatformAdapter } from '../../platforms/youtube/YouTubePlatformAdapter';
import type { LiveAdapter } from '../../platforms/common/LiveAdapter';
import { PlatformError, readableError } from '../../platforms/common/errors';
import { jsonRequest } from '../../platforms/common/http';
import type { DatabaseClient } from '../database/client';
import type { Logger } from './logger';
export class AccountService {
  private adapters = new Map<string, LiveAdapter | LinkedChatAdapter>();
  private accounts = new Map<string, PlatformAccount>();
  private sessions = new Map<string, TokenSession>();
  private auth = new Map<Platform, AbortController>();
  private authTasks = new Map<Platform, Promise<void>>();
  private states: OAuthState[] = [
    { platform: 'twitch', state: 'idle' },
    { platform: 'youtube', state: 'idle' },
  ];
  private vault: CredentialVault;
  private pendingWrites: Promise<void> = Promise.resolve();
  private closed = false;
  private closeGooglePage?: () => void;
  constructor(
    private db: DatabaseClient,
    private config: OAuthConfig,
    private logger: Logger,
    private event: (e: StreamEvent) => void,
    private notify: () => void,
    private report: (message: string) => void,
  ) {
    this.vault = new CredentialVault(safeStorage, {
      read: (id) => db.call('credential', id),
      write: (id, payload) => db.call('saveCredential', { id, payload }),
    });
  }
  snapshot() {
    return [...this.accounts.values()];
  }
  oauth() {
    return this.states;
  }
  configured() {
    return {
      twitch: Boolean(this.config.twitchClientId),
      youtube: Boolean(this.config.googleClientId),
    };
  }
  private changed(a: PlatformAccount) {
    if (this.closed || !this.accounts.has(a.id)) return;
    this.accounts.set(a.id, a);
    this.pendingWrites = this.pendingWrites
      .then(() => this.db.call('saveAccount', a))
      .catch(() => {
        this.report('Не удалось сохранить состояние аккаунта. Проверьте локальную БД.');
      });
    if (a.errorCode) void this.logger.write('warn', a.errorCode, a.platform).catch(() => undefined);
    this.notify();
  }
  private create(account: PlatformAccount) {
    this.accounts.set(account.id, account);
    if (account.readOnlyLink) {
      const adapter = new LinkedChatAdapter(
        account,
        this.config.streamchatApiUrl ? undefined : process.env.YOUTUBE_API_KEY,
        (a) => this.changed(a),
        undefined,
        undefined,
        undefined,
        this.config.streamchatApiUrl ? new StreamChatApi(this.config.streamchatApiUrl) : undefined,
      );
      adapter.subscribe(this.event);
      this.adapters.set(account.id, adapter);
      return adapter;
    }
    const session = new TokenSession(account.id, this.vault, this.config);
    this.sessions.set(account.id, session);
    const changed = (a: PlatformAccount) => this.changed(a);
    const adapter =
      account.platform === 'twitch'
        ? new TwitchPlatformAdapter(account, session, changed)
        : new YouTubePlatformAdapter(account, session, changed, {
            get: (key) => this.db.call('ban', key),
            save: (b) => this.db.call('saveBan', b),
            remove: (key) => this.db.call('deleteBan', key),
          });
    adapter.subscribe(this.event);
    this.adapters.set(account.id, adapter);
    return adapter;
  }
  private async loadPublicConfig() {
    if (!this.config.streamchatApiUrl) return;
    const publicConfig = await new StreamChatApi(this.config.streamchatApiUrl).config();
    this.config.twitchClientId = publicConfig.twitchClientId;
    this.config.googleClientId = publicConfig.googleClientId;
  }
  async initialize() {
    void this.loadPublicConfig()
      .then(() => this.notify())
      .catch(() => this.report('StreamChat API is unavailable. Local features remain available.'));

    for (const saved of await this.db.call('accounts', undefined)) {
      const a = { ...saved, connectionStatus: 'disconnected' as const };
      const adapter = this.create(a);
      if (a.enabled !== false) await adapter.restoreSession();
    }
  }
  async addLink(platform: Platform, input: string) {
    const link = parseChannelLink(platform, input);
    const id = `link:${platform}:${createHash('sha256').update(link.url).digest('hex').slice(0, 32)}`;
    if (this.accounts.has(id))
      throw new PlatformError(
        'CHANNEL_EXISTS',
        'Этот канал уже добавлен. Используйте Reconnect в его карточке.',
      );
    if ([...this.accounts.values()].filter((a) => a.readOnlyLink).length >= 12)
      throw new PlatformError('CHANNEL_LIMIT', 'Можно добавить не более 12 каналов по ссылке.');
    const account: PlatformAccount = {
      id,
      platform,
      platformAccountId: id,
      username: link.target,
      displayName: link.target,
      scopes: [],
      authStatus: 'signed-out',
      connectionStatus: 'disconnected',
      enabled: true,
      readOnlyLink: link.url,
      capabilities: { ...readOnlyCapabilities },
    };
    await this.db.call('saveAccount', account);
    await this.create(account).connect();
    this.notify();
  }
  get(id: string) {
    const adapter = this.adapters.get(id);
    if (!adapter)
      throw new PlatformError('ACCOUNT_NOT_FOUND', 'Аккаунт не найден. Подключите его заново.');
    return adapter;
  }
  private authState(platform: Platform, patch: Partial<OAuthState>) {
    this.states = this.states.map((s) => (s.platform === platform ? { ...s, ...patch } : s));
    this.notify();
  }
  async authorize(platform: Platform, moderation: boolean, locale: 'ru' | 'en' = 'ru') {
    this.config.locale = locale;
    await this.loadPublicConfig();
    if (this.auth.has(platform))
      throw new PlatformError(
        'OAUTH_ACTIVE',
        'Авторизация уже открыта. Завершите или отмените её.',
      );
    if (!this.configured()[platform])
      throw new PlatformError(
        'CONFIG_REQUIRED',
        platform === 'twitch'
          ? 'Укажите TWITCH_CLIENT_ID публичного приложения в .env и перезапустите StreamChat.'
          : 'Укажите GOOGLE_CLIENT_ID Desktop app в .env и перезапустите StreamChat.',
      );
    if (!safeStorage.isEncryptionAvailable())
      throw new PlatformError('VAULT_UNAVAILABLE', 'Защищённое хранилище Windows недоступно.');
    const controller = new AbortController();
    this.auth.set(platform, controller);
    this.authState(platform, {
      state: 'authorizing',
      message: 'Завершите вход в системном браузере.',
      userCode: undefined,
    });
    const task = this.completeAuthorization(platform, moderation, controller)
      .catch((error) => {
        if (controller.signal.aborted) return;
        this.authState(platform, {
          state: 'error',
          message: readableError(error),
          userCode: undefined,
        });
        void this.logger
          .write('error', error instanceof PlatformError ? error.code : 'OAUTH_FAILED', 'oauth')
          .catch(() => undefined);
      })
      .finally(() => {
        if (this.auth.get(platform) === controller) {
          this.auth.delete(platform);
          this.authTasks.delete(platform);
        }
      });
    this.authTasks.set(platform, task);
  }
  private async completeAuthorization(
    platform: Platform,
    moderation: boolean,
    controller: AbortController,
  ) {
    const signal = controller.signal;
    const open = async (url: string) => {
      if (!signal.aborted) await shell.openExternal(url);
    };
    if (platform === 'youtube') {
      this.closeGooglePage?.();
      await googleOAuth(this.config, open, signal, fetch, {
        saveAccount: (tokens) => this.saveAuthorizedAccount(platform, tokens, signal),
        registerCleanup: (close) => {
          this.closeGooglePage = close;
        },
        returnToApp: () => {
          const window = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
          if (!window) throw new Error('Window closed');
          if (window.isMinimized()) window.restore();
          window.show();
          window.focus();
        },
      });
      return;
    }
    const tokens = await twitchOAuth(
      this.config.twitchClientId!,
      moderation,
      open,
      (code) => this.authState(platform, { userCode: code }),
      signal,
    );
    await this.saveAuthorizedAccount(platform, tokens, signal);
  }
  private async saveAuthorizedAccount(platform: Platform, tokens: Tokens, signal: AbortSignal) {
    if (signal.aborted) return;
    let account: PlatformAccount;
    const common = {
      platform,
      scopes: tokens.scopes,
      authStatus: 'authorized' as const,
      connectionStatus: 'disconnected' as const,
      enabled: true,
      lastValidatedAt: new Date().toISOString(),
      capabilities: {
        send: false,
        delete: false,
        timeout: false,
        ban: false,
        unban: false,
        readProfile: true,
      },
    };
    if (platform === 'twitch') {
      const r = await jsonRequest<{
        data: { id: string; login: string; display_name: string; profile_image_url: string }[];
      }>('https://api.twitch.tv/helix/users', {
        headers: { Authorization: `Bearer ${tokens.accessToken}`, 'Client-Id': tokens.clientId },
        signal,
      });
      const u = r.data[0];
      if (!u) throw new PlatformError('ACCOUNT_MISSING', 'Twitch не вернул данные аккаунта.');
      account = {
        ...common,
        id: `twitch:${u.id}`,
        platformAccountId: u.id,
        username: u.login,
        displayName: u.display_name,
        avatarUrl: u.profile_image_url,
      };
    } else {
      const r = await jsonRequest<{
        items?: {
          id: string;
          snippet: {
            title: string;
            customUrl?: string;
            thumbnails?: { default?: { url: string } };
          };
        }[];
      }>('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      });
      const u = r.items?.[0];
      if (!u)
        throw new PlatformError(
          'CHANNEL_MISSING',
          'У Google аккаунта нет YouTube-канала. Создайте канал и повторите вход.',
        );
      account = {
        ...common,
        id: `youtube:${u.id}`,
        platformAccountId: u.id,
        username: u.snippet.customUrl ?? u.snippet.title,
        displayName: u.snippet.title,
        avatarUrl: u.snippet.thumbnails?.default?.url,
      };
    }
    if (signal.aborted) return;
    const old = this.accounts.get(account.id);
    if (old?.channel) account.channel = old.channel;
    await this.adapters.get(account.id)?.disconnect();
    await this.sessions.get(account.id)?.close();
    await this.pendingWrites;
    if (signal.aborted || this.closed) return;
    const previousTokens = await this.vault.get(account.id).catch(() => undefined);
    await this.vault.set(account.id, tokens);
    await this.db.call('saveAccount', account);
    if (signal.aborted || this.closed) {
      if (previousTokens) await this.vault.set(account.id, previousTokens);
      else await this.vault.remove(account.id);
      if (old) await this.db.call('saveAccount', { ...old, connectionStatus: 'disconnected' });
      else await this.db.call('deleteAccount', account.id);
      return;
    }
    const adapter = this.create(account);
    this.authState(platform, { state: 'idle', message: undefined, userCode: undefined });
    await adapter.connect();
  }
  async cancel(platform: Platform) {
    this.auth.get(platform)?.abort();
    await this.authTasks.get(platform);
    this.auth.delete(platform);
    this.authState(platform, { state: 'idle', userCode: undefined, message: undefined });
  }
  async action(id: string, action: 'connect' | 'disconnect' | 'logout') {
    const adapter = this.get(id);
    const account = await adapter.getCurrentAccount();
    if (action === 'logout') {
      await adapter.disconnect();
      if (account.readOnlyLink) {
        await this.pendingWrites;
        this.adapters.delete(id);
        this.accounts.delete(id);
        await this.db.call('deleteAccount', id);
        this.notify();
        return;
      }
      await this.sessions.get(id)?.close();
      await this.pendingWrites;
      let revokeFailed = false;
      try {
        const t = await this.vault.get(id);
        if (t) await revokeTokens(t);
      } catch {
        revokeFailed = true;
        await this.logger.write('warn', 'TOKEN_REVOKE_FAILED', 'oauth');
      }
      this.adapters.delete(id);
      this.accounts.delete(id);
      this.sessions.delete(id);
      await this.vault.remove(id);
      await this.db.call('deleteAccount', id);
      this.notify();
      if (revokeFailed)
        this.report(
          'Локальная сессия удалена. Отзыв токена на платформе не подтверждён; при необходимости удалите доступ в настройках Twitch/Google.',
        );
      return;
    }
    account.enabled = action === 'connect';
    this.changed(account);
    await adapter.disconnect();
    if (action === 'connect') await adapter.connect();
  }
  async resume() {
    for (const a of this.adapters.values()) a.resume();
  }
  async close() {
    this.closed = true;
    this.closeGooglePage?.();
    for (const c of this.auth.values()) c.abort();
    await Promise.all(this.authTasks.values());
    for (const a of this.adapters.values()) await a.disconnect();
    for (const s of this.sessions.values()) await s.close();
    await this.pendingWrites;
  }
}
