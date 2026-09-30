import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { googleOAuth, twitchOAuth } from '../src/main/security/OAuth';
import { OAuthCallbackServer } from '../src/main/security/OAuthCallbackServer';
import { PlatformError } from '../src/platforms/common/errors';
import { jsonRequest } from '../src/platforms/common/http';
describe('OAuth flows without real credentials', () => {
  it('keeps success pending until the channel has been saved and exposes no credentials', async () => {
    let callback = '',
      sessionPath = '',
      release!: () => void,
      close!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const saveAccount = vi.fn(async () => {
      await gate;
    });
    const returnToApp = vi.fn();
    const task = googleOAuth(
      { googleClientId: 'test', googleClientSecret: 'private-secret' },
      async (url) => {
        const u = new URL(url);
        callback = u.searchParams.get('redirect_uri')!;
        const response = await fetch(
          `${callback}?state=${u.searchParams.get('state')}&code=private-code`,
        );
        expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
        const html = await response.text();
        expect(html).toContain('Завершаем подключение');
        expect(html).not.toContain('private-code');
        sessionPath = html.match(/\/session\/[A-Za-z0-9_-]+/)![0];
      },
      new AbortController().signal,
      async (_url, init) => {
        expect(new URLSearchParams(String(init?.body)).get('client_secret')).toBe('private-secret');
        return new Response(
          JSON.stringify({
            access_token: 'private-access',
            refresh_token: 'private-refresh',
            expires_in: 3600,
          }),
        );
      },
      {
        saveAccount,
        returnToApp,
        registerCleanup: (fn) => {
          close = fn;
        },
      },
    );
    try {
      await vi.waitFor(() => expect(saveAccount).toHaveBeenCalledOnce());
      const endpoint = new URL(sessionPath, callback).href;
      expect((await (await fetch(endpoint + '/status')).json()).state).toBe('pending');
      release();
      await task;
      const status = await (await fetch(endpoint + '/status')).text();
      expect(JSON.parse(status).state).toBe('success');
      expect(status).not.toContain('private-');
      expect(
        (
          await fetch(endpoint + '/return', {
            method: 'POST',
            headers: { Origin: 'https://evil.test' },
          })
        ).status,
      ).toBe(403);
      expect(returnToApp).not.toHaveBeenCalled();
      expect(
        (
          await fetch(endpoint + '/return', {
            method: 'POST',
            headers: { Origin: new URL(callback).origin },
          })
        ).status,
      ).toBe(204);
      expect(returnToApp).toHaveBeenCalledOnce();
    } finally {
      release();
      await task.catch(() => undefined);
      close?.();
    }
  });
  it('shows channel-saving errors on the callback page instead of a false success', async () => {
    let endpoint = '',
      close!: () => void;
    try {
      await expect(
        googleOAuth(
          { googleClientId: 'test' },
          async (url) => {
            const u = new URL(url),
              callback = u.searchParams.get('redirect_uri')!;
            const html = await (
              await fetch(`${callback}?state=${u.searchParams.get('state')}&code=test`)
            ).text();
            endpoint = new URL(html.match(/\/session\/[A-Za-z0-9_-]+/)![0], callback).href;
          },
          new AbortController().signal,
          async () =>
            new Response(
              JSON.stringify({
                access_token: 'access',
                refresh_token: 'refresh',
                expires_in: 3600,
              }),
            ),
          {
            saveAccount: async () => {
              throw new PlatformError('CHANNEL_MISSING', 'Канал не найден');
            },
            returnToApp: () => undefined,
            registerCleanup: (fn) => {
              close = fn;
            },
          },
        ),
      ).rejects.toThrow('Канал не найден');
      expect(await (await fetch(endpoint + '/status')).json()).toEqual({
        state: 'error',
        message: 'Канал не найден',
      });
    } finally {
      close?.();
    }
  });
  it('rejects replayed callbacks and closes expired sessions', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const page = new OAuthCallbackServer('expected', () => undefined);
    try {
      const redirect = await page.listen();
      const callback = redirect + '?state=expected&code=one';
      expect((await fetch(callback)).status).toBe(200);
      expect(await page.code).toBe('one');
      expect((await fetch(callback)).status).toBe(409);
      page.succeed();
      page.finish(true);
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      await expect(fetch(redirect)).rejects.toThrow();
    } finally {
      page.close();
      vi.useRealTimers();
    }
  });
  it('identifies missing Google client secret and disabled YouTube API without leaking provider details', async () => {
    await expect(
      jsonRequest(
        'https://oauth2.googleapis.com/token',
        {},
        async () =>
          new Response(
            JSON.stringify({
              error: 'invalid_request',
              error_description: 'client_secret is missing. private-value',
            }),
            { status: 400 },
          ),
      ),
    ).rejects.toMatchObject({ code: 'GOOGLE_CLIENT_SECRET_REQUIRED' });
    await expect(
      jsonRequest(
        'https://www.googleapis.com/youtube/v3/channels?mine=true',
        {},
        async () =>
          new Response(JSON.stringify({ error: { errors: [{ reason: 'accessNotConfigured' }] } }), {
            status: 403,
          }),
      ),
    ).rejects.toMatchObject({ code: 'YOUTUBE_API_DISABLED' });
  });
  it('uses Google system-browser loopback with state and PKCE and exchanges the matching verifier', async () => {
    let challenge = '';
    let verifier = '';
    let callback = '';
    const transport = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      verifier = body.get('code_verifier') ?? '';
      expect(body.get('code')).toBe('test-code');
      expect(body.get('redirect_uri')).toBe(callback);
      return new Response(
        JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }),
      );
    });
    const tokens = await googleOAuth(
      { googleClientId: 'test-desktop' },
      async (url) => {
        const u = new URL(url);
        expect(u.hostname).toBe('accounts.google.com');
        expect(u.searchParams.get('code_challenge_method')).toBe('S256');
        challenge = u.searchParams.get('code_challenge')!;
        callback = u.searchParams.get('redirect_uri')!;
        expect(new URL(callback).hostname).toBe('127.0.0.1');
        expect((await fetch(`${callback}?state=wrong&code=wrong`)).status).toBe(400);
        expect(
          (
            await fetch(
              `${callback}?${new URLSearchParams({ state: u.searchParams.get('state')!, code: 'test-code' })}`,
            )
          ).status,
        ).toBe(200);
      },
      new AbortController().signal,
      transport,
    );
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(challenge);
    expect(tokens.refreshToken).toBe('refresh');
    await expect(fetch(callback)).rejects.toThrow();
  });
  it('cancels Google listener and does not exchange a token', async () => {
    const c = new AbortController();
    const transport = vi.fn();
    let redirect = '';
    await expect(
      googleOAuth(
        { googleClientId: 'test' },
        async (url) => {
          redirect = new URL(url).searchParams.get('redirect_uri')!;
          c.abort();
        },
        c.signal,
        transport,
      ),
    ).rejects.toThrow(/отменена/);
    expect(transport).not.toHaveBeenCalled();
    await expect(fetch(redirect)).rejects.toThrow();
  });
  it('polls Twitch DCF at server interval and requests no client secret', async () => {
    vi.useFakeTimers();
    try {
      let polls = 0;
      const transport = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const body = new URLSearchParams(String(init?.body));
        expect(body.has('client_secret')).toBe(false);
        if (String(url).endsWith('/device'))
          return new Response(
            JSON.stringify({
              device_code: 'device',
              user_code: 'ABCD',
              verification_uri: 'https://www.twitch.tv/activate?device-code=ABCD',
              expires_in: 60,
              interval: 2,
            }),
          );
        polls++;
        expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
        return polls === 1
          ? new Response(JSON.stringify({ message: 'authorization_pending' }), { status: 400 })
          : new Response(
              JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
            );
      });
      const open = vi.fn(async () => undefined);
      const progress = vi.fn();
      const pending = twitchOAuth(
        'public',
        true,
        open,
        progress,
        new AbortController().signal,
        transport,
      );
      await vi.advanceTimersByTimeAsync(1999);
      expect(polls).toBe(0);
      await vi.advanceTimersByTimeAsync(2001);
      expect((await pending).platform).toBe('twitch');
      expect(polls).toBe(2);
      expect(progress).toHaveBeenCalledWith('ABCD');
      expect(open).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
