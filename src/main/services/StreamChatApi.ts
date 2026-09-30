import { z } from 'zod';
import { PlatformError } from '../../platforms/common/errors';
import { STREAMCHAT_API_URL } from '../../shared/links';
import type { Fetch } from '../../platforms/common/http';
export class StreamChatApi {
  readonly base: string;
  constructor(
    base = STREAMCHAT_API_URL,
    private transport: Fetch = fetch,
  ) {
    const u = new URL(base);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== '/'
    )
      throw new Error('Invalid StreamChat API URL');
    this.base = u.origin;
  }
  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    if (
      !/^\/v1\/(config|oauth\/google\/(exchange|refresh)|youtube\/(channels|search|videos|liveChatMessages)(\?.*)?)$/.test(
        path,
      )
    )
      throw new Error('Invalid API operation');
    try {
      const response = await this.transport(this.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
          : AbortSignal.timeout(12000),
      });
      if (!response.ok)
        throw new PlatformError(
          response.status === 429 ? 'API_RATE_LIMIT' : 'API_UNAVAILABLE',
          'StreamChat API is unavailable. Please try again later.',
        );
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Empty response');
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('Response too large');
        }
        chunks.push(value);
      }
      return schema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch (error) {
      if (error instanceof PlatformError) throw error;
      throw new PlatformError(
        'API_UNAVAILABLE',
        'StreamChat API is unavailable. Please try again later.',
      );
    }
  }
  config() {
    return this.request(
      '/v1/config',
      z
        .object({ twitchClientId: z.string().max(200), googleClientId: z.string().max(200) })
        .strict(),
    );
  }
}
