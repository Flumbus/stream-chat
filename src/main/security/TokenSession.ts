import type { CredentialVault, Tokens } from './CredentialVault';
import { refreshTokens, type OAuthConfig } from './OAuth';
import { jsonRequest, type Fetch } from '../../platforms/common/http';
import { PlatformError } from '../../platforms/common/errors';
export class TokenSession {
  private flight?: Promise<Tokens>;
  private tokens?: Tokens;
  private closed = false;
  constructor(
    readonly id: string,
    private vault: CredentialVault,
    private config: OAuthConfig,
    private transport: Fetch = fetch,
  ) {}
  async get(force = false): Promise<Tokens> {
    if (this.closed) throw new PlatformError('AUTH_REQUIRED', 'Сессия закрыта. Войдите снова.');
    try {
      this.tokens ??= await this.vault.get(this.id);
    } catch {
      throw new PlatformError(
        'AUTH_REQUIRED',
        'Не удалось восстановить защищённую сессию. Войдите заново.',
      );
    }
    if (!this.tokens)
      throw new PlatformError('AUTH_REQUIRED', 'Токен отсутствует. Войдите в аккаунт.');
    if (!force && this.tokens.expiresAt > Date.now() + 60_000) return this.tokens;
    if (!this.flight) {
      this.flight = refreshTokens(this.tokens, this.config, this.transport)
        .then(async (value) => {
          if (this.closed) throw new PlatformError('AUTH_REQUIRED', 'Сессия закрыта.');
          await this.vault.set(this.id, value);
          this.tokens = value;
          return value;
        })
        .finally(() => {
          this.flight = undefined;
        });
    }
    return this.flight;
  }
  async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const send = async (force = false) => {
      const t = await this.get(force);
      return jsonRequest<T>(
        url,
        {
          ...init,
          headers: {
            ...init.headers,
            Authorization: `Bearer ${t.accessToken}`,
            ...(t.platform === 'twitch' ? { 'Client-Id': t.clientId } : {}),
          },
        },
        this.transport,
      );
    };
    try {
      return await send();
    } catch (e) {
      if (e instanceof PlatformError && e.code === 'AUTH_REQUIRED') return send(true);
      throw e;
    }
  }
  async validateTwitch() {
    const validate = async (force = false) => {
      const t = await this.get(force);
      return jsonRequest<{ user_id: string; client_id: string; scopes: string[] }>(
        'https://id.twitch.tv/oauth2/validate',
        { headers: { Authorization: `OAuth ${t.accessToken}` } },
        this.transport,
      );
    };
    let result;
    try {
      result = await validate();
    } catch (e) {
      if (!(e instanceof PlatformError) || e.code !== 'AUTH_REQUIRED') throw e;
      result = await validate(true);
    }
    const t = await this.get();
    if (result.client_id !== t.clientId)
      throw new PlatformError('AUTH_REQUIRED', 'Токен принадлежит другому приложению.');
    return result;
  }
  async close() {
    this.closed = true;
    await this.flight?.catch(() => undefined);
    this.tokens = undefined;
  }
}
