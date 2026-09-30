import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store, migrate, migrations } from '../src/main/database/store';
import { MockPlatformAdapter } from '../src/platforms/mock/MockPlatformAdapter';
import { defaultSettings, themes } from '../src/shared/themes';
import { moderationSchema, settingsSchema, themeSchema } from '../src/shared/validation';
import type { StreamEvent } from '../src/shared/models';

describe('SQLite migrations and persistence', () => {
  it('upgrades an old database, preserves settings/profiles and separates platform identities', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'streamchat-test-'));
    const path = join(dir, 'test.sqlite');
    try {
      const old = new DatabaseSync(path);
      migrate(old, migrations.slice(0, 1));
      old.close();
      const store = new Store(path);
      expect(store.db.prepare('PRAGMA user_version').get()?.user_version).toBe(5);
      store.saveSettings({ ...defaultSettings, theme: 'light', onboardingComplete: true });
      store.saveProfile({ id: 'test', name: 'Custom', theme: { ...themes[0], fontSize: 22 } });
      const twitch = new MockPlatformAdapter('twitch');
      const youtube = new MockPlatformAdapter('youtube');
      await twitch.connect();
      await youtube.connect();
      const a = twitch.generate('message');
      const b = youtube.generate('message');
      store.recordMessages([a, a, b]);
      store.close();
      const reopened = new Store(path);
      expect(reopened.getSettings().theme).toBe('light');
      expect(reopened.getProfiles()[0].theme.fontSize).toBe(22);
      const users = reopened.getUsers();
      expect(users).toHaveLength(2);
      expect(users.find((u) => u.platform === 'twitch')?.message_count).toBe(2);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('rolls back a broken migration and rejects future schema versions', () => {
    const db = new DatabaseSync(':memory:');
    expect(() => migrate(db, ['CREATE TABLE sample(id TEXT); BROKEN SQL;'])).toThrow();
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(0);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='sample'").get()).toBeUndefined();
    db.exec('PRAGMA user_version=99');
    expect(() => migrate(db)).toThrow(/newer/);
    db.close();
  });
});
describe('MockPlatformAdapter', () => {
  it('uses one stream for sends, scenarios and moderation; stops timers and unsubscribes', async () => {
    vi.useFakeTimers();
    try {
      const a = new MockPlatformAdapter('youtube');
      const events: StreamEvent[] = [];
      const off = a.subscribe((e) => events.push(e));
      await expect(a.sendMessage('hello')).rejects.toThrow();
      await a.connect();
      await a.startChat();
      await a.startChat();
      await vi.advanceTimersByTimeAsync(4100);
      expect(events).toHaveLength(1);
      await a.sendMessage('Hello');
      expect(events.at(-1)).toMatchObject({ type: 'chat', message: { text: 'Hello' } });
      a.generate('donation');
      expect(events.at(-1)).toMatchObject({ type: 'donation' });
      await a.timeoutUser('viewer', 60);
      expect(a.bans.get('viewer')).toBe(Date.now() + 60000);
      await a.unbanUser('viewer');
      expect(a.bans.has('viewer')).toBe(false);
      await a.deleteMessage('message');
      expect(events.at(-1)).toMatchObject({ type: 'moderation', action: 'delete' });
      await a.stopChat();
      const count = events.length;
      await vi.advanceTimersByTimeAsync(20000);
      expect(events).toHaveLength(count);
      off();
      a.generate('message');
      expect(events).toHaveLength(count);
      await a.disconnect();
    } finally {
      vi.useRealTimers();
    }
  });
});
describe('untrusted IPC input', () => {
  it('rejects unexpected properties and out-of-range values', () => {
    expect(settingsSchema.safeParse({ ...defaultSettings, access_token: 'secret' }).success).toBe(
      false,
    );
    expect(themeSchema.safeParse({ ...themes[0], fontSize: 2000 }).success).toBe(false);
    expect(themeSchema.safeParse({ ...themes[0], background: 'url(https://evil)' }).success).toBe(
      false,
    );
    expect(
      moderationSchema.safeParse({
        accountId: 'a',
        channelId: 'b',
        targetUserId: 'c',
        targetUsername: 'u',
        action: 'timeout',
      }).success,
    ).toBe(false);
  });
});
