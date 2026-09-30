import { randomUUID } from 'node:crypto';
import type { PlatformAdapter } from '../../shared/contracts';
import type {
  ChatMessage,
  DemoScenario,
  Platform,
  PlatformAccount,
  StreamEvent,
} from '../../shared/models';
const names = [
  'ItsFLamb',
  'moonwalker',
  'Соня',
  'pixelpilot',
  'Alex',
  'nightshift',
  'чай_с_мятой',
  'luna',
];
const texts = [
  'Всем привет! Как настроение? 👋',
  'Сегодня очень уютный стрим',
  'That transition was so clean!',
  'Можно название трека? 🎧',
  'Погнали! Этот момент был невероятный',
  'Звук отличный, картинка тоже',
  'First time here. Love the atmosphere.',
  'Чат, всем хорошего вечера ✨',
];
export class MockPlatformAdapter implements PlatformAdapter {
  private listeners = new Set<(event: StreamEvent) => void>();
  private timer?: ReturnType<typeof setInterval>;
  private connected = false;
  private sequence = 0;
  readonly bans = new Map<string, number>();
  constructor(readonly platform: Platform) {}
  subscribe(listener: (event: StreamEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(event: StreamEvent) {
    for (const listener of this.listeners) listener(event);
  }
  async connect() {
    this.connected = true;
  }
  async disconnect() {
    await this.stopChat();
    this.connected = false;
  }
  async getCurrentAccount(): Promise<PlatformAccount> {
    return {
      id: `mock-${this.platform}`,
      platform: this.platform,
      platformAccountId: 'demo-owner',
      username: 'streamer',
      displayName: 'Demo streamer',
      scopes: [],
      authStatus: 'demo',
      connectionStatus: this.connected ? 'connected' : 'disconnected',
      capabilities: { send: true, timeout: true, ban: true, unban: true, delete: true },
    };
  }
  async startChat() {
    this.assertConnected();
    if (this.timer) return;
    this.timer = setInterval(
      () => this.generate('message'),
      this.platform === 'twitch' ? 2600 : 4100,
    );
  }
  async stopChat() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
  private assertConnected() {
    if (!this.connected) throw new Error('Сначала запустите демочат.');
  }
  generate(scenario: DemoScenario, custom?: string): ChatMessage {
    this.assertConnected();
    const n = this.sequence++;
    const userId = custom ? 'demo-owner' : `demo-${n % names.length}`;
    const name = custom
      ? 'Вы'
      : scenario === 'long'
        ? 'ОченьДлинноеИмяПользователя_ДляПроверкиИнтерфейса_2026'
        : names[n % names.length];
    const kind =
      scenario === 'donation'
        ? 'donation'
        : scenario === 'member'
          ? this.platform === 'twitch'
            ? 'subscription'
            : 'membership'
          : 'message';
    const roles =
      scenario === 'moderator' ? ['moderator'] : scenario === 'member' ? ['subscriber'] : [];
    const m: ChatMessage = {
      id: randomUUID(),
      accountId: `mock-${this.platform}`,
      platform: this.platform,
      channelId: 'demo-channel',
      user: {
        platformUserId: userId,
        username: name,
        displayName: name,
        color: ['#b7d7ff', '#dfb4fb', '#b9e3a6', '#ffd598'][n % 4],
        roles,
        badges: roles.map((role) => ({
          id: role,
          label: role === 'moderator' ? 'Модератор' : 'Подписчик',
        })),
      },
      text:
        custom ??
        (scenario === 'long'
          ? 'Длинное сообщение проверяет перенос строк и виртуальную высоту. '.repeat(12)
          : scenario === 'donation'
            ? 'Спасибо за классный стрим! 💛'
            : scenario === 'member'
              ? 'Теперь в команде. Рады быть здесь!'
              : scenario === 'emotes'
                ? 'Pog ✨ GG 🎮'
                : texts[n % texts.length]),
      createdAt: new Date().toISOString(),
      kind,
      metadata: {
        amount: scenario === 'donation' ? '$ 10.00' : undefined,
        banned: scenario === 'banned',
      },
      fragments:
        scenario === 'emotes'
          ? [
              { type: 'emote', text: '✨' },
              { type: 'text', text: ' GG ' },
              { type: 'emote', text: '🎮' },
            ]
          : undefined,
    };
    if (scenario === 'banned') this.bans.set(userId, Infinity);
    this.emit({ type: kind === 'message' ? 'chat' : kind, message: m });
    return m;
  }
  async sendMessage(message: string) {
    this.generate('message', message);
  }
  async timeoutUser(userId: string, duration: number) {
    this.assertConnected();
    this.bans.set(userId, Date.now() + duration * 1000);
    this.emit({
      type: 'moderation',
      platform: this.platform,
      channelId: 'demo-channel',
      targetUserId: userId,
      action: 'timeout',
      duration,
    });
  }
  async banUser(userId: string) {
    this.assertConnected();
    this.bans.set(userId, Infinity);
    this.emit({
      type: 'moderation',
      platform: this.platform,
      channelId: 'demo-channel',
      targetUserId: userId,
      action: 'ban',
    });
  }
  async unbanUser(userId: string) {
    this.assertConnected();
    this.bans.delete(userId);
    this.emit({
      type: 'moderation',
      platform: this.platform,
      channelId: 'demo-channel',
      targetUserId: userId,
      action: 'unban',
    });
  }
  async deleteMessage(messageId: string) {
    this.assertConnected();
    this.emit({
      type: 'moderation',
      platform: this.platform,
      channelId: 'demo-channel',
      targetUserId: '',
      action: 'delete',
      messageId,
    });
  }
}
