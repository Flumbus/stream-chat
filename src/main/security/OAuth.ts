import { twitchScopes, twitchModScopes } from '../../shared/twitchPermissions';
import { StreamChatApi } from '../services/StreamChatApi';
import { OAuthCallbackServer } from './OAuthCallbackServer';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import type { Tokens } from './CredentialVault';
import type { Platform } from '../../shared/models';
import { delay, form, jsonRequest, type Fetch } from '../../platforms/common/http';
import { apiError, PlatformError } from '../../platforms/common/errors';
export interface OAuthConfig {
  locale?: 'ru' | 'en';
  streamchatApiUrl?: string;
  twitchClientId?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}
export { twitchScopes, twitchModScopes } from '../../shared/twitchPermissions';
export const youtubeScopes = ['https://www.googleapis.com/auth/youtube.force-ssl'];
const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  scope: z.union([z.string(), z.array(z.string())]).optional(),
});
export function tokensFromResponse(
  raw: unknown,
  platform: Platform,
  clientId: string,
  scopes: string[],
  previous?: Tokens,
): Tokens {
  const data = tokenResponse.parse(raw);
  const refreshToken = data.refresh_token ?? previous?.refreshToken;
  if (!refreshToken)
    throw new PlatformError(
      'REFRESH_MISSING',
      'Платформа не выдала refresh token. Повторите вход с подтверждением разрешений.',
    );
  return {
    platform,
    clientId,
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: typeof data.scope === 'string' ? data.scope.split(' ') : (data.scope ?? scopes),
  };
}
export async function twitchOAuth(
  clientId: string,
  moderation: boolean,
  open: (url: string) => Promise<void>,
  progress: (code: string) => void,
  signal: AbortSignal,
  transport: Fetch = fetch,
): Promise<Tokens> {
  // Kept for typed IPC compatibility; supported moderation always requests its required scopes.
  void moderation;
  const scopes = [...twitchScopes, ...twitchModScopes];
  const device = await jsonRequest<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  }>(
    'https://id.twitch.tv/oauth2/device',
    { ...form({ client_id: clientId, scopes: scopes.join(' ') }), signal },
    transport,
  );
  const url = new URL(device.verification_uri);
  if (url.protocol !== 'https:' || url.hostname !== 'www.twitch.tv' || url.pathname !== '/activate')
    throw new PlatformError('OAUTH_RESPONSE', 'Некорректный адрес авторизации Twitch.');
  progress(device.user_code);
  await open(url.href);
  const deadline = Date.now() + device.expires_in * 1000;
  let interval = Math.max(1000, device.interval * 1000);
  while (Date.now() < deadline) {
    await delay(interval, signal);
    const response = await transport('https://id.twitch.tv/oauth2/token', {
      ...form({
        client_id: clientId,
        device_code: device.device_code,
        scopes: scopes.join(' '),
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    });
    const data = await response.json();
    if (response.ok) return tokensFromResponse(data, 'twitch', clientId, scopes);
    const reason = String(data.message ?? data.error ?? '');
    if (reason === 'authorization_pending') continue;
    if (reason === 'slow_down' || response.status === 429) {
      interval += 5000;
      continue;
    }
    throw new PlatformError(
      'OAUTH_DENIED',
      'Вход в Twitch отменён или код истёк. Начните авторизацию заново.',
    );
  }
  throw new PlatformError('OAUTH_EXPIRED', 'Время ожидания входа в Twitch истекло.');
}
export interface GoogleOAuthCompletion {
  saveAccount(tokens: Tokens): Promise<void>;
  returnToApp(): void;
  registerCleanup?(close: () => void): void;
}
export async function googleOAuth(
  config: OAuthConfig,
  open: (url: string) => Promise<void>,
  signal: AbortSignal,
  transport: Fetch = fetch,
  completion?: GoogleOAuthCompletion,
): Promise<Tokens> {
  const clientId = config.googleClientId!;
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const callback = new OAuthCallbackServer(state, () => completion?.returnToApp(), config.locale);
  const redirect = await callback.listen();
  completion?.registerCleanup?.(() => callback.close());
  const cancel = () => {
    callback.fail(
      new PlatformError('OAUTH_CANCELLED', 'Авторизация отменена. Повторите вход в StreamChat.'),
    );
    callback.close();
  };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timeout = setTimeout(
    () =>
      callback.fail(
        new PlatformError(
          'OAUTH_EXPIRED',
          'Время ожидания входа истекло. Повторите подключение в StreamChat.',
        ),
      ),
    5 * 60_000,
  );
  try {
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: youtubeScopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
    });
    if (signal.aborted) throw new PlatformError('OAUTH_CANCELLED', 'Авторизация отменена.');
    await open('https://accounts.google.com/o/oauth2/v2/auth?' + query);
    const code = await callback.code;
    clearTimeout(timeout);
    const raw = config.streamchatApiUrl
      ? await new StreamChatApi(config.streamchatApiUrl, transport).request(
          '/v1/oauth/google/exchange',
          tokenResponse,
          { clientId, code, verifier, redirectUri: redirect },
          signal,
        )
      : await jsonRequest(
          'https://oauth2.googleapis.com/token',
          {
            ...form({
              client_id: clientId,
              ...(config.googleClientSecret ? { client_secret: config.googleClientSecret } : {}),
              code,
              code_verifier: verifier,
              grant_type: 'authorization_code',
              redirect_uri: redirect,
            }),
            signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
          },
          transport,
        );
    const tokens = tokensFromResponse(raw, 'youtube', clientId, youtubeScopes);
    if (signal.aborted) throw new PlatformError('OAUTH_CANCELLED', 'Авторизация отменена.');
    await completion?.saveAccount(tokens);
    if (signal.aborted) throw new PlatformError('OAUTH_CANCELLED', 'Авторизация отменена.');
    callback.succeed();
    return tokens;
  } catch (error) {
    callback.fail(error);
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    callback.finish(Boolean(completion) && !signal.aborted);
  }
}
export async function refreshTokens(tokens: Tokens, config: OAuthConfig, transport: Fetch = fetch) {
  const google = tokens.platform === 'youtube';
  const raw =
    google && config.streamchatApiUrl
      ? await new StreamChatApi(config.streamchatApiUrl, transport).request(
          '/v1/oauth/google/refresh',
          tokenResponse,
          { clientId: tokens.clientId, refreshToken: tokens.refreshToken },
        )
      : await jsonRequest(
          google ? 'https://oauth2.googleapis.com/token' : 'https://id.twitch.tv/oauth2/token',
          form({
            client_id: tokens.clientId,
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken,
            ...(google && config.googleClientSecret
              ? { client_secret: config.googleClientSecret }
              : {}),
          }),
          transport,
        );
  return tokensFromResponse(raw, tokens.platform, tokens.clientId, tokens.scopes, tokens);
}
export async function revokeTokens(tokens: Tokens, transport: Fetch = fetch) {
  const google = tokens.platform === 'youtube';
  const response = await transport(
    google ? 'https://oauth2.googleapis.com/revoke' : 'https://id.twitch.tv/oauth2/revoke',
    {
      ...form(
        google
          ? { token: tokens.refreshToken }
          : { client_id: tokens.clientId, token: tokens.accessToken },
      ),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok && response.status !== 400) throw apiError(response.status);
}
