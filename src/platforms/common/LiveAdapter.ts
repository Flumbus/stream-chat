import type { PlatformAdapter } from '../../shared/contracts';
import type { ChatUser, PlatformAccount, StreamEvent, ChannelTarget } from '../../shared/models';
import type { TokenSession } from '../../main/security/TokenSession';
import { ConnectionManager } from '../../main/services/ConnectionManager';
import { asPlatformError, PlatformError } from './errors';
export abstract class LiveAdapter implements PlatformAdapter {
  protected listeners = new Set<(event: StreamEvent) => void>();
  protected manager: ConnectionManager;
  constructor(
    protected account: PlatformAccount,
    protected session: TokenSession,
    protected changed: (account: PlatformAccount) => void,
  ) {
    this.manager = new ConnectionManager(
      (signal, ready) => this.run(signal, ready),
      (state, error) => {
        const e = error ? asPlatformError(error) : undefined;
        this.account = {
          ...this.account,
          connectionStatus: state,
          lastError: e?.message,
          errorCode: e?.code,
          authStatus: e?.code === 'AUTH_REQUIRED' ? 'expired' : this.account.authStatus,
          lastReconnectAt:
            state === 'reconnecting' ? new Date().toISOString() : this.account.lastReconnectAt,
        };
        this.changed(this.account);
      },
    );
  }
  protected abstract run(signal: AbortSignal, ready: () => void): Promise<void>;
  protected emit(e: StreamEvent) {
    for (const listener of this.listeners) listener(e);
  }
  protected update(patch: Partial<PlatformAccount>) {
    this.account = { ...this.account, ...patch };
    this.changed(this.account);
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
  subscribe(listener: (event: StreamEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  protected require(capability: keyof PlatformAccount['capabilities']) {
    if (this.account.connectionStatus !== 'connected')
      throw new PlatformError('DISCONNECTED', 'Канал не подключён. Восстановите соединение.');
    if (!this.account.capabilities[capability])
      throw new PlatformError(
        'FORBIDDEN',
        'Недостаточно прав для этого действия в выбранном канале.',
      );
  }
  abstract sendMessage(message: string): Promise<void>;
  abstract timeoutUser(userId: string, duration: number, reason?: string): Promise<void>;
  abstract banUser(userId: string, reason?: string): Promise<void>;
  abstract unbanUser(userId: string): Promise<void>;
  abstract deleteMessage(messageId: string): Promise<void>;
  abstract getUser(userId: string): Promise<ChatUser | undefined>;
  abstract listChannels(): Promise<ChannelTarget[]>;
  abstract selectChannel(target: string): Promise<void>;
}
