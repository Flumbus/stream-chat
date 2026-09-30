import { SafeChatEngine, safeChatDefaults } from '../../shared/safeChat';
import { Automoderator } from './Automoderator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { shell, app } from 'electron';
import { STREAMCHAT_API_URL } from '../../shared/links';
import type { ChatBackend } from '../../shared/contracts';
import type {
  BackendEvent,
  ChatMessage,
  ChatProfile,
  DemoScenario,
  ModerationRequest,
  Platform,
  Settings,
  Snapshot,
  StreamEvent,
} from '../../shared/models';
import { defaultSettings } from '../../shared/themes';
import { DatabaseClient } from '../database/client';
import { MockPlatformAdapter } from '../../platforms/mock/MockPlatformAdapter';
import { Logger } from './logger';
import { AccountService } from './AccountService';
import { OverlayServer } from '../local-server/OverlayServer';
import { applyEvents, Deduplicator, messageKey, sourceOf } from '../../shared/events';
import { PlatformError, readableError } from '../../platforms/common/errors';
import type { PlatformAdapter } from '../../shared/contracts';
import type { UserCard } from '../../shared/models';
export class LocalChatBackend implements ChatBackend {
  private adapters = [new MockPlatformAdapter('twitch'), new MockPlatformAdapter('youtube')];
  private messages: ChatMessage[] = [];
  private safety = new SafeChatEngine();
  private automoderator = new Automoderator({
    engine: this.safety,
    account: async (id) => this.adapter(id).getCurrentAccount(),
    moderate: (request) => this.moderate(request, false),
    record: (record) => this.db.call('moderation', record),
    update: (key, info) => {
      this.messages = this.messages.map((m) =>
        messageKey(m) === key ? { ...m, safeChat: info } : m,
      );
      void this.broadcast();
    },
  });
  private settings = { ...defaultSettings };
  private profiles: ChatProfile[] = [];
  private listeners = new Set<(event: BackendEvent) => void>();
  private events: StreamEvent[] = [];
  private writes: ChatMessage[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private flushing: Promise<void> = Promise.resolve();
  private db: DatabaseClient;
  readonly logger: Logger;
  private accounts: AccountService;
  private overlay: OverlayServer;
  private dedup = new Deduplicator();
  private overlayError?: string;
  constructor(private directory: string) {
    this.db = new DatabaseClient(directory);
    this.logger = new Logger(join(directory, 'logs'));
    const report = (message: string) => this.emit({ type: 'error', message });
    this.accounts = new AccountService(
      this.db,
      {
        streamchatApiUrl: app?.isPackaged ? STREAMCHAT_API_URL : process.env.STREAMCHAT_API_URL,
        twitchClientId: app?.isPackaged ? undefined : process.env.TWITCH_CLIENT_ID,
        googleClientId: app?.isPackaged ? undefined : process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: app?.isPackaged ? undefined : process.env.GOOGLE_CLIENT_SECRET,
      },
      this.logger,
      (e) => this.receive(e),
      () => {
        void this.broadcast();
      },
      report,
    );
    this.overlay = new OverlayServer({
      directory: join(__dirname, '../overlay'),
      profiles: () => this.profiles,
      messages: () => this.messages,
      sanitize: (message) => this.safety.display(message),
      readKey: (id) => this.db.call('overlayKey', id),
      saveKey: (id, secret) => this.db.call('saveOverlayKey', { id, secret }),
      changed: () => {
        void this.broadcast();
      },
      error: (code) => {
        void this.logger.write('error', code, 'overlay');
      },
    });
    for (const adapter of this.adapters) adapter.subscribe((event) => this.receive(event));
  }
  async initialize() {
    const data = await this.db.call('init', undefined);
    this.settings = data.settings;
    this.configureSafety();
    this.profiles = data.profiles;
    this.timer = setInterval(() => {
      void this.flush().catch(() => {
        this.emit({
          type: 'error',
          message: 'Не удалось сохранить сообщения в SQLite. Проверьте доступ к папке данных.',
        });
        void this.logger.write('error', 'DATABASE_FLUSH_FAILED', 'database');
      });
    }, 100);
    await this.logger.write('info', 'APPLICATION_STARTED');
    if (this.settings.developerMode) await this.setRunning(true);
    await this.accounts.initialize();
    try {
      await this.overlay.start(this.settings.overlayPort ?? 17832);
    } catch {
      this.overlayError = 'Не удалось запустить OBS сервер. Проверьте порт и файлы сборки.';
      await this.logger.write('error', 'OVERLAY_START_FAILED', 'overlay');
    }
  }
  private configureSafety() {
    const settings = this.settings.safeChat ?? safeChatDefaults();
    this.safety.configure({
      ...settings,
      kindMode: {
        ...settings.kindMode,
        enabled: settings.kindMode.enabled && !!this.settings.desktop?.experimental.enabled,
      },
    });
  }
  private receive(event: StreamEvent) {
    if ('message' in event) {
      if (!this.dedup.accept(messageKey(event.message))) return;
      this.writes.push(event.message);
    }
    this.messages = applyEvents(this.messages, [event]);
    this.events.push(event);
    if ('message' in event) this.automoderator.submit(event.message);
  }
  private async flush() {
    if (this.events.length) {
      const events = this.events.splice(0);
      this.emit({
        type: 'events',
        events: events.map((e) =>
          'message' in e ? { ...e, message: this.safety.display(e.message) } : e,
        ),
      });
      this.overlay.publish(events);
    }
    if (this.writes.length) {
      const batch = this.writes.splice(0);
      this.flushing = this.flushing
        .catch(() => undefined)
        .then(() => this.db.call('messages', batch));
    }
    await this.flushing;
  }
  private emit(event: BackendEvent) {
    for (const listener of this.listeners) listener(event);
  }
  subscribe(listener: (event: BackendEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async snapshot(): Promise<Snapshot> {
    return {
      messages: this.messages.map((m) => this.safety.display(m)),
      accounts: [
        ...this.accounts.snapshot(),
        ...(this.settings.developerMode
          ? await Promise.all(this.adapters.map((a) => a.getCurrentAccount()))
          : []),
      ],
      settings: this.settings,
      profiles: this.profiles,
      running: this.running,
      databasePath: join(this.directory, 'streamchat.sqlite'),
      oauth: this.accounts.oauth(),
      configured: this.accounts.configured(),
      overlay: { ...this.overlay.status(), error: this.overlayError },
    };
  }
  private async broadcast() {
    this.emit({ type: 'state', snapshot: await this.snapshot() });
  }
  async setRunning(running: boolean) {
    if (running && !this.settings.developerMode)
      throw new Error('Включите режим разработчика, чтобы запустить тестовый чат.');
    for (const a of this.adapters) {
      if (running) {
        await a.connect();
        await a.startChat();
      } else await a.disconnect();
    }
    this.running = running;
    if (running && !this.messages.length)
      for (let i = 0; i < 14; i++)
        this.adapters[i % 2].generate(
          i === 8 ? 'donation' : i === 4 ? 'member' : i === 2 ? 'moderator' : 'message',
        );
    await this.flush();
    await this.broadcast();
  }
  private adapter(id: string): PlatformAdapter {
    if (!id.startsWith('mock-')) return this.accounts.get(id);
    if (!this.settings.developerMode || !this.running)
      throw new Error('Демочат остановлен. Нажмите «Запустить».');
    const adapter = this.adapters.find((a) => `mock-${a.platform}` === id);
    if (!adapter) throw new Error('Аккаунт не найден.');
    return adapter;
  }
  async originalMessage(key: string) {
    const message = this.messages.find((m) => messageKey(m) === key);
    if (!message) throw new Error('Сообщение уже отсутствует в локальном буфере.');
    return message.text;
  }
  async send(accountId: string, message: string) {
    await this.adapter(accountId).sendMessage(message);
  }
  async moderate(request: ModerationRequest, recordHistory = true) {
    const a = this.adapter(request.accountId);
    const account = await a.getCurrentAccount();
    const record = {
      ...request,
      id: randomUUID(),
      platform: account.platform,
      createdAt: new Date().toISOString(),
      success: false,
    };
    try {
      const channel = account.channel?.liveChatId ?? account.channel?.id ?? 'demo-channel';
      if (request.channelId !== channel)
        throw new PlatformError(
          'CHANNEL_MISMATCH',
          'Выбран другой канал. Откройте сообщение текущего канала.',
        );
      if (
        account.readOnlyLink ||
        account.connectionStatus !== 'connected' ||
        !account.capabilities[request.action]
      )
        throw new PlatformError('FORBIDDEN', 'Недостаточно прав для этого действия.');
      const target = this.messages.find(
        (m) =>
          m.platform === account.platform &&
          m.channelId === channel &&
          m.user.platformUserId === request.targetUserId &&
          sourceOf(m) === (request.accountId.startsWith('mock-') ? 'mock' : 'live'),
      );
      if (
        account.authStatus !== 'demo' &&
        request.action !== 'unban' &&
        (request.targetUserId === account.platformAccountId ||
          target?.user.roles.some((r) => ['broadcaster', 'moderator'].includes(r)))
      )
        throw new PlatformError(
          'PROTECTED_USER',
          'Действие недоступно для владельца канала или модератора.',
        );

      if (request.action === 'ban') await a.banUser(request.targetUserId, request.reason);
      if (request.action === 'unban') await a.unbanUser(request.targetUserId);
      if (request.action === 'timeout')
        await a.timeoutUser(request.targetUserId, request.duration!, request.reason);
      if (request.action === 'delete') await a.deleteMessage(request.messageId!);
      const ban =
        account.platform === 'youtube' && !request.accountId.startsWith('mock-')
          ? await this.db.call('ban', {
              accountId: account.id,
              liveChatId: channel,
              userId: request.targetUserId,
            })
          : undefined;
      if (recordHistory)
        await this.db.call('moderation', { ...record, success: true, externalBanId: ban?.banId });
    } catch (error) {
      if (recordHistory)
        await this.db.call('moderation', { ...record, error: readableError(error) });
      throw error;
    }
  }
  async getUsers() {
    await this.flush();
    return this.db.call('users', undefined);
  }
  async getModerationHistory() {
    return this.db.call('history', undefined);
  }
  async saveSettings(settings: Settings) {
    const portChanged = (settings.overlayPort ?? 17832) !== (this.settings.overlayPort ?? 17832);
    await this.db.call('settings', settings);
    this.settings = settings;
    this.configureSafety();
    this.overlay.refreshMessages();
    if (!settings.developerMode) {
      await this.setRunning(false);
      this.messages = this.messages.filter((m) => sourceOf(m) === 'live');
      this.receive({ type: 'clear', source: 'mock' });
    }
    if (portChanged) {
      await this.overlay.close();
      try {
        await this.overlay.start(settings.overlayPort ?? 17832);
        this.overlayError = undefined;
      } catch {
        this.overlayError = 'Не удалось запустить сервер на выбранном порту.';
      }
    }
    await this.broadcast();
  }
  async saveProfile(profile: ChatProfile) {
    await this.db.call('profile', profile);
    this.profiles = [...this.profiles.filter((p) => p.id !== profile.id), profile];
    await this.overlay.syncProfiles();
    await this.broadcast();
  }
  async generate(platform: Platform, scenario: DemoScenario, count: number) {
    this.adapter(`mock-${platform}`);
    const a = this.adapters.find((a) => a.platform === platform)!;
    for (let i = 0; i < count; i++) a.generate(scenario);
  }
  async openLogs() {
    await this.logger.write('info', 'LOG_FOLDER_OPENED');
    const error = await shell.openPath(this.logger.directory);
    if (error) throw new Error('Не удалось открыть папку логов.');
  }
  async close() {
    clearInterval(this.timer);
    await this.automoderator.close();
    for (const a of this.adapters) await a.disconnect();
    await this.accounts.close();
    await this.flush();
    await this.overlay.close();
    await this.db.close();
  }
  async authorize(platform: Platform, moderation: boolean) {
    await this.accounts.authorize(platform, moderation, this.settings.desktop?.locale);
  }
  async addChannelLink(platform: Platform, url: string) {
    await this.accounts.addLink(platform, url);
  }
  async cancelAuthorization(platform: Platform) {
    await this.accounts.cancel(platform);
  }
  async accountAction(id: string, action: 'connect' | 'disconnect' | 'logout') {
    await this.accounts.action(id, action);
  }
  async listChannels(id: string) {
    return this.accounts.get(id).listChannels();
  }
  async selectChannel(id: string, target: string) {
    await this.accounts.get(id).selectChannel(target);
  }
  async overlayUrl(id: string) {
    return this.overlay.url(id);
  }
  async openOverlay(id: string) {
    await shell.openExternal(this.overlay.url(id));
  }
  async resetOverlay(id: string) {
    this.overlay.reset(id);
  }
  async resume() {
    await this.accounts.resume();
  }
  async getUserCard(input: { accountId: string; userId: string }): Promise<UserCard> {
    const adapter: PlatformAdapter | undefined = input.accountId.startsWith('mock-')
      ? this.adapters.find((a) => `mock-${a.platform}` === input.accountId)
      : this.accounts.get(input.accountId);
    if (!adapter) throw new PlatformError('ACCOUNT_NOT_FOUND', 'Аккаунт не найден.');
    const account = await adapter.getCurrentAccount();
    const source = input.accountId.startsWith('mock-') ? 'mock' : 'live';
    const channel = account.channel?.liveChatId ?? account.channel?.id ?? 'demo-channel';
    const users = await this.getUsers();
    const history = (await this.getModerationHistory()).filter(
      (h) =>
        h.accountId === input.accountId &&
        h.targetUserId === input.userId &&
        h.channelId === channel,
    );
    const last = history.find((h) => h.success && h.action !== 'delete');
    const expires =
      last?.action === 'timeout'
        ? new Date(Date.parse(last.createdAt) + (last.duration ?? 0) * 1000).toISOString()
        : undefined;
    const storedBan =
      source === 'live' && account.platform === 'youtube'
        ? await this.db.call('ban', {
            accountId: account.id,
            liveChatId: channel,
            userId: input.userId,
          })
        : undefined;
    const message = this.messages.findLast(
      (m) =>
        m.platform === account.platform &&
        sourceOf(m) === source &&
        m.channelId === channel &&
        m.user.platformUserId === input.userId,
    );
    let profile = message?.user;
    if (adapter.getUser)
      try {
        const remote = await adapter.getUser(input.userId);
        if (remote)
          profile = {
            ...remote,
            roles: profile?.roles ?? remote.roles,
            badges: profile?.badges ?? remote.badges,
          };
      } catch (error) {
        await this.logger.write('warn', 'USER_PROFILE_FAILED', account.platform);
        this.emit({ type: 'error', message: readableError(error) });
      }
    const canUnban = Boolean(
      account.capabilities.unban &&
      (source === 'mock' || account.platform === 'twitch' || storedBan),
    );
    return {
      user: users.find(
        (u) =>
          u.source === source &&
          u.platform === account.platform &&
          u.platform_user_id === input.userId,
      ),
      profile,
      history,
      canUnban,
      banReason:
        !canUnban && account.platform === 'youtube'
          ? 'ID бана неизвестен. Для YouTube нужен бан, сохранённый StreamChat в этом Live Chat.'
          : undefined,
      banned: storedBan
        ? !storedBan.expiresAt
        : last
          ? last.action === 'ban'
          : Boolean(message?.metadata?.banned),
      timeoutUntil:
        storedBan?.expiresAt ??
        (expires && Date.parse(expires) > Date.now() ? expires : message?.metadata?.timeoutUntil),
    };
  }
}
