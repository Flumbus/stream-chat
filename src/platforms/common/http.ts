import { apiError, PlatformError } from './errors';
export type Fetch = typeof fetch;
export async function jsonRequest<T>(
  url: string,
  init: RequestInit = {},
  transport: Fetch = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await transport(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
  } catch (e) {
    if (init.signal?.aborted) throw e;
    throw new PlatformError(
      'NETWORK_ERROR',
      'Не удалось связаться с платформой. Проверьте подключение к интернету.',
      true,
    );
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Classify known provider errors; never display raw responses containing credentials.
    if (url === 'https://oauth2.googleapis.com/token') {
      if (
        /client_secret.*missing|missing.*client_secret/i.test(String(data.error_description ?? ''))
      )
        throw new PlatformError(
          'GOOGLE_CLIENT_SECRET_REQUIRED',
          'Google требует Client secret. В Google Cloud → Google Auth Platform → Clients откройте ваш Desktop client и укажите его секрет в GOOGLE_CLIENT_SECRET в .env. Перезапустите StreamChat и повторите вход.',
        );
      if (data.error === 'invalid_client')
        throw new PlatformError(
          'GOOGLE_CLIENT_INVALID',
          'Google отклонил данные приложения. Проверьте, что GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET относятся к одному OAuth-клиенту типа Desktop app. После изменения .env перезапустите StreamChat.',
        );
    }
    if (
      url.startsWith('https://www.googleapis.com/youtube/v3/') &&
      (data.error?.errors?.some((e: { reason?: string }) => e.reason === 'accessNotConfigured') ||
        data.error?.details?.some((e: { reason?: string }) => e.reason === 'SERVICE_DISABLED'))
    )
      throw new PlatformError(
        'YOUTUBE_API_DISABLED',
        'В Google Cloud включите YouTube Data API v3 в проекте вашего OAuth-клиента, затем повторите подключение.',
      );
    const reason =
      typeof data.error === 'string'
        ? data.error
        : (data.error?.errors?.[0]?.reason ?? data.message ?? '');
    const wait = Math.max(
      Number(response.headers.get('retry-after') ?? 0) * 1000,
      Number(response.headers.get('ratelimit-reset') ?? 0) * 1000 - Date.now(),
    );
    throw apiError(response.status, String(reason), wait);
  }
  return data as T;
}
export function form(values: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  };
}
export function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Cancelled'));
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(new Error('Cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
