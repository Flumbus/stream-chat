import { describe, it, expect } from 'vitest';
import { deleteUnavailableReason, moderationAccess } from '../src/shared/moderationAccess';
import { MockPlatformAdapter } from '../src/platforms/mock/MockPlatformAdapter';
describe('context moderation access', () => {
  it('allows demo actions but prevents every write from a URL source', async () => {
    const a = new MockPlatformAdapter('twitch');
    await a.connect();
    const m = a.generate('message'),
      account = await a.getCurrentAccount();
    expect(moderationAccess(m, account).ban).toBe(true);
    expect(deleteUnavailableReason(m, account)).toBeNull();
    expect(deleteUnavailableReason(m, { ...account, readOnlyLink: 'https://twitch.tv/test' })).toBe(
      'readOnly',
    );
    expect(deleteUnavailableReason(m, { ...account, connectionStatus: 'disconnected' })).toBe(
      'offline',
    );
    expect(
      deleteUnavailableReason(m, {
        ...account,
        capabilities: { ...account.capabilities, delete: false },
      }),
    ).toBe('permission');
    expect(
      Object.values(
        moderationAccess(m, { ...account, readOnlyLink: 'https://twitch.tv/test' }),
      ).every((v) => !v),
    ).toBe(true);
    await a.disconnect();
  });
  it('protects moderators and requires confirmed unban capability', async () => {
    const a = new MockPlatformAdapter('youtube');
    await a.connect();
    const m = a.generate('message'),
      account = { ...(await a.getCurrentAccount()), authStatus: 'authorized' as const };
    m.user.roles = ['moderator'];
    expect(deleteUnavailableReason(m, account)).toBe('protectedUser');
    expect(moderationAccess(m, account).ban).toBe(false);
    m.user.roles = [];
    m.metadata = { banned: true };
    expect(moderationAccess(m, account).unban).toBe(false);
    expect(moderationAccess(m, account, { canUnban: true, history: [], banned: true }).unban).toBe(
      true,
    );
    await a.disconnect();
  });
});
