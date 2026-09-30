import { afterEach, expect, it, vi } from 'vitest';
import { SoundService } from '../src/renderer/services/SoundService';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('keeps muted events silent, scales volume and throttles repeated notifications', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29'));
  const envelope = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  const context = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn(async () => {}),
    createGain: vi.fn(() => ({ gain: envelope, connect: vi.fn(), disconnect: vi.fn() })),
    createOscillator: vi.fn(() => ({
      frequency: { value: 0 },
      type: '',
      connect: (gain: unknown) => gain,
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      onended: undefined,
    })),
  };
  const constructor = vi.fn(function () {
    return context;
  });
  vi.stubGlobal('AudioContext', constructor);
  const service = new SoundService();
  const settings = { sounds: false, volume: 0.5, reducedMotion: 'system' as const };
  await service.play('notification', settings);
  expect(constructor).not.toHaveBeenCalled();
  await service.play('notification', { ...settings, sounds: true });
  expect(envelope.linearRampToValueAtTime).toHaveBeenCalledWith(0.06, 0.008);
  await service.play('notification', { ...settings, sounds: true });
  expect(context.createOscillator).toHaveBeenCalledTimes(1);
  await service.play('notification', { ...settings, volume: 0 }, true);
  expect(context.createOscillator).toHaveBeenCalledTimes(1);
  await service.play('notification', { ...settings, volume: 0.25 }, true);
  expect(envelope.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.03, 0.008);
});
