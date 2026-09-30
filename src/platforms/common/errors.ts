export class PlatformError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}
export function apiError(status: number, reason = '', retryAfterMs = 0) {
  if (status === 401 || /invalid_grant|invalid_token|UNAUTHENTICATED/.test(reason))
    return new PlatformError(
      'AUTH_REQUIRED',
      'Авторизация истекла или отозвана. Подключите аккаунт заново.',
    );
  if (/quotaExceeded|dailyLimitExceeded/.test(reason))
    return new PlatformError(
      'QUOTA_EXCEEDED',
      'Квота YouTube исчерпана. Дождитесь её обновления и подключитесь снова.',
    );
  if (/liveChatEnded|LIVE_CHAT_ENDED|liveChatDisabled|LIVE_CHAT_DISABLED/.test(reason))
    return new PlatformError(
      'CHAT_OFFLINE',
      'Трансляция завершена или чат отключён. Выберите активную трансляцию.',
    );
  if (status === 403)
    return new PlatformError(
      'FORBIDDEN',
      'Недостаточно прав. Проверьте разрешения OAuth и права модератора в этом канале.',
    );
  if (status === 429 || /rateLimitExceeded/.test(reason))
    return new PlatformError(
      'RATE_LIMIT',
      'Слишком много запросов. Дождитесь повторного подключения.',
      true,
      Math.max(1000, retryAfterMs),
    );
  if (status >= 500)
    return new PlatformError(
      'SERVICE_UNAVAILABLE',
      'Платформа временно недоступна. Подключение будет восстановлено.',
      true,
    );
  return new PlatformError(
    'REQUEST_REJECTED',
    'Платформа отклонила запрос. Проверьте канал, сообщение и права аккаунта.',
  );
}
export function readableError(error: unknown) {
  return error instanceof PlatformError
    ? error.message
    : 'Не удалось выполнить операцию. Подробности доступны в диагностике.';
}
export function asPlatformError(error: unknown) {
  return error instanceof PlatformError
    ? error
    : new PlatformError(
        'NETWORK_ERROR',
        'Соединение прервано. Приложение попробует подключиться снова.',
        true,
      );
}
