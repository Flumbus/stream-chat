import { describe, it, expect, vi } from 'vitest';
import { ConnectionManager, backoff } from '../src/main/services/ConnectionManager';
import { PlatformError } from '../src/platforms/common/errors';
import { Deduplicator, applyEvents, sourceOf } from '../src/shared/events';
import { MockPlatformAdapter } from '../src/platforms/mock/MockPlatformAdapter';
describe('connection manager', () => {
  it('backs off, never starts twice, cancels retry and does not retry revoked auth', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(async () => {
        throw new PlatformError('NETWORK_ERROR', 'offline', true);
      });
      const changed = vi.fn();
      const manager = new ConnectionManager(run, changed);
      manager.start();
      manager.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(run).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(run).toHaveBeenCalledTimes(2);
      manager.stop();
      await vi.advanceTimersByTimeAsync(120000);
      expect(run).toHaveBeenCalledTimes(2);
      expect(backoff(100, () => 1)).toBeLessThanOrEqual(60000);
      const auth = vi.fn(async () => {
        throw new PlatformError('AUTH_REQUIRED', 'login');
      });
      const m = new ConnectionManager(auth, changed);
      m.start();
      await vi.advanceTimersByTimeAsync(120000);
      expect(auth).toHaveBeenCalledTimes(1);
      m.stop();
    } finally {
      vi.useRealTimers();
    }
  });
  it('aborts an old connection before resuming after sleep', async () => {
    let active = 0;
    let max = 0;
    const run = vi.fn(
      (signal: AbortSignal, ready: () => void) =>
        new Promise<void>((resolve) => {
          active++;
          max = Math.max(max, active);
          ready();
          signal.addEventListener(
            'abort',
            () => {
              active--;
              resolve();
            },
            { once: true },
          );
        }),
    );
    const manager = new ConnectionManager(run, () => undefined);
    manager.start();
    manager.resume();
    expect(max).toBe(1);
    expect(run).toHaveBeenCalledTimes(2);
    manager.stop();
  });
});
describe('unified event lifecycle', () => {
  it('separates live/mock identities, deduplicates replay and applies delete/timeout/unban', async () => {
    const mock = new MockPlatformAdapter('twitch');
    await mock.connect();
    const m = mock.generate('message');
    const live = { ...m, accountId: 'twitch:owner', source: 'live' as const };
    let messages = applyEvents(
      [],
      [
        { type: 'chat', message: m },
        { type: 'chat', message: live },
        { type: 'chat', message: m },
      ],
    );
    expect(messages).toHaveLength(2);
    messages = applyEvents(messages, [
      {
        type: 'moderation',
        platform: 'twitch',
        channelId: m.channelId,
        targetUserId: m.user.platformUserId,
        action: 'timeout',
        source: 'live',
        duration: 10,
        occurredAt: '2026-09-28T00:00:00Z',
      },
    ]);
    expect(messages.find((x) => sourceOf(x) === 'live')?.metadata?.timeoutUntil).toBe(
      '2026-09-28T00:00:10.000Z',
    );
    expect(messages.find((x) => sourceOf(x) === 'mock')?.metadata?.timeoutUntil).toBeUndefined();
    messages = applyEvents(messages, [
      {
        type: 'moderation',
        platform: 'twitch',
        channelId: m.channelId,
        targetUserId: m.user.platformUserId,
        action: 'unban',
        source: 'live',
      },
    ]);
    expect(messages[1].metadata?.timeoutUntil).toBeUndefined();
    messages = applyEvents(messages, [{ type: 'clear', source: 'mock' }]);
    expect(messages).toHaveLength(1);
    expect(sourceOf(messages[0])).toBe('live');
    await mock.disconnect();
  });
  it('bounds event replay memory and expires old IDs', () => {
    const d = new Deduplicator(2, 100);
    expect(d.accept('a', 1)).toBe(true);
    expect(d.accept('a', 2)).toBe(false);
    d.accept('b', 3);
    d.accept('c', 4);
    expect(d.accept('a', 5)).toBe(true);
    expect(d.accept('a', 200)).toBe(true);
  });
});
