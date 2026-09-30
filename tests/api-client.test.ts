import { it, expect, vi } from 'vitest';
import { StreamChatApi } from '../src/main/services/StreamChatApi';
import { twitchOAuth } from '../src/main/security/OAuth';
import { twitchScopes, twitchModScopes } from '../src/shared/twitchPermissions';
it('validates public config and rejects leaked or malformed fields', async () => {
  for (const body of [
    'not-json',
    JSON.stringify({ twitchClientId: 'public', googleClientId: 'public', clientSecret: 'fake' }),
  ]) {
    const api = new StreamChatApi(undefined, async () => new Response(body));
    await expect(api.config()).rejects.toThrow('StreamChat API is unavailable');
  }
});
it('handles status, timeout and invalid endpoints without exposing response details', async () => {
  for (const response of [
    new Response('private', { status: 503 }),
    new Response('private', { status: 429 }),
  ]) {
    const api = new StreamChatApi(undefined, async () => response);
    await expect(api.config()).rejects.not.toThrow('private');
  }
  expect(() => new StreamChatApi('http://evil.test')).toThrow();
  expect(() => new StreamChatApi('https://user:pass@evil.test')).toThrow();
});
it('automatically asks for supported moderation scopes even for legacy false flag', async () => {
  const controller = new AbortController();
  const http = vi.fn(async () =>
    Response.json({
      device_code: 'fixture',
      user_code: 'fixture',
      verification_uri: 'https://www.twitch.tv/activate',
      expires_in: 60,
      interval: 1,
    }),
  );
  const task = twitchOAuth(
    'fixture',
    false,
    async () => {},
    () => controller.abort(),
    controller.signal,
    http,
  );
  await expect(task).rejects.toBeDefined();
  const form = new URLSearchParams(
    String((http.mock.calls[0] as unknown as [string, RequestInit])[1].body),
  );
  expect(form.get('scopes')?.split(' ')).toEqual([...twitchScopes, ...twitchModScopes]);
});
