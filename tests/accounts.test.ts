import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, migrate, migrations } from '../src/main/database/store';
import { CredentialVault, type Tokens } from '../src/main/security/CredentialVault';
import { TokenSession } from '../src/main/security/TokenSession';
import { redact } from '../src/main/services/logger';
import { defaultSettings, themes } from '../src/shared/themes';
import type { PlatformAccount } from '../src/shared/models';
export const account: PlatformAccount = {
  id: 'youtube:owner',
  platform: 'youtube',
  platformAccountId: 'owner',
  username: 'Owner',
  displayName: 'Owner',
  authStatus: 'authorized',
  connectionStatus: 'disconnected',
  scopes: ['https://www.googleapis.com/auth/youtube.force-ssl'],
  capabilities: { send: true, ban: true, timeout: true, unban: true, delete: true },
};
describe('account storage and migration from Phase 1', () => {
  it('preserves v3 data and persists accounts, ban resource IDs, keys and encrypted payload across restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'streamchat-v3-'));
    const path = join(dir, 'db.sqlite');
    try {
      const old = new DatabaseSync(path);
      migrate(old, migrations.slice(0, 3));
      old.prepare('INSERT INTO settings VALUES(?,?)').run('app', JSON.stringify(defaultSettings));
      old
        .prepare('INSERT INTO chat_profiles VALUES(?,?,?,?,?)')
        .run(
          'default',
          'Old',
          JSON.stringify({ ...themes[0], fontSize: 23 }),
          '2026-01-01',
          '2026-01-01',
        );
      old.close();
      let store = new Store(path);
      expect(store.getProfiles()[0].theme.fontSize).toBe(23);
      store.accounts.save(account);
      store.accounts.setCredential(account.id, 'encrypted-test-payload');
      store.accounts.saveBan({
        accountId: account.id,
        liveChatId: 'live',
        userId: 'viewer',
        banId: 'ban-resource',
      });
      store.accounts.setOverlayKey('default', 'opaque-secret');
      store.close();
      store = new Store(path);
      expect(store.accounts.accounts()).toEqual([account]);
      expect(store.accounts.credential(account.id)).toBe('encrypted-test-payload');
      expect(
        store.accounts.ban({ accountId: account.id, liveChatId: 'live', userId: 'viewer' })?.banId,
      ).toBe('ban-resource');
      expect(store.accounts.overlayKey('default')).toBe('opaque-secret');
      store.accounts.saveBan({
        accountId: account.id,
        liveChatId: 'live',
        userId: 'expired',
        banId: 'expired-ban',
        expiresAt: '2020-01-01T00:00:00Z',
      });
      expect(
        store.accounts.ban({ accountId: account.id, liveChatId: 'live', userId: 'expired' }),
      ).toBeUndefined();
      store.accounts.remove(account.id);
      expect(store.accounts.credential(account.id)).toBeUndefined();
      expect(
        store.accounts.ban({ accountId: account.id, liveChatId: 'live', userId: 'viewer' }),
      ).toBeUndefined();
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
describe('credential abstraction and refresh', () => {
  const token: Tokens = {
    platform: 'twitch',
    clientId: 'public-client',
    accessToken: 'old-access',
    refreshToken: 'one-time-refresh',
    expiresAt: 0,
    scopes: ['user:read:chat'],
  };
  function fixture() {
    let stored: string | undefined;
    const cipher = {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(s.split('').reverse().join('')),
      decryptString: (b: Buffer) => b.toString().split('').reverse().join(''),
    };
    const vault = new CredentialVault(cipher, {
      read: async () => stored,
      write: async (_id, payload) => {
        stored = payload;
      },
    });
    return { vault, cipher, stored: () => stored };
  }
  it('never passes plaintext to the credential repository, refuses insecure fallback and removes values', async () => {
    const f = fixture();
    await f.vault.set('id', token);
    expect(f.stored()).not.toContain('one-time-refresh');
    expect(await f.vault.get('id')).toEqual(token);
    f.cipher.isEncryptionAvailable = () => false;
    await expect(f.vault.set('id', token)).rejects.toThrow();
    await f.vault.remove('id');
    expect(f.stored()).toBeUndefined();
  });
  it('rotates a one-time refresh token once for concurrent requests', async () => {
    const f = fixture();
    await f.vault.set('id', token);
    const transport = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'new-access',
            refresh_token: 'rotated-refresh',
            expires_in: 3600,
            scope: ['user:read:chat'],
          }),
          { status: 200 },
        ),
    );
    const session = new TokenSession('id', f.vault, {}, transport);
    const values = await Promise.all([session.get(), session.get(), session.get()]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(values.every((v) => v.refreshToken === 'rotated-refresh')).toBe(true);
    expect((await f.vault.get('id'))?.refreshToken).toBe('rotated-refresh');
    await session.close();
  });
  it('redacts nested credentials, headers and overlay query keys', () => {
    const result = JSON.stringify(
      redact({
        access_token: 'secret-a',
        nested: { refreshToken: 'secret-b', authorization: 'Bearer secret-c', cookie: 'secret-d' },
        url: 'http://127.0.0.1/overlay/a?key=secret-e&code=secret-f',
      }),
    );
    for (const secret of ['secret-a', 'secret-b', 'secret-c', 'secret-d', 'secret-e', 'secret-f'])
      expect(result).not.toContain(secret);
  });
});
