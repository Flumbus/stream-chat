import { updatesEnabled } from '../src/shared/updater';
import { EventEmitter } from 'node:events';
import { it, expect, vi } from 'vitest';
import { UpdateService } from '../src/main/services/UpdateService';
import { allowedExternalUrl, externalLinks } from '../src/shared/links';
const driver = () =>
  Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowDowngrade: true,
    allowPrerelease: true,
    checkForUpdates: vi.fn(async () => {}),
    downloadUpdate: vi.fn(async () => {}),
    quitAndInstall: vi.fn(),
  });
it('disables every updater action and startup check in dev', async () => {
  const d = driver();
  const s = new UpdateService(
    d,
    '0.4.0',
    false,
    () => {},
    async () => {},
  );
  s.start();
  await s.action('check');
  await s.action('install');
  expect(d.checkForUpdates).not.toHaveBeenCalled();
  expect(d.quitAndInstall).not.toHaveBeenCalled();
  s.close();
});
it('downloads automatically but installs only by explicit action, after cleanup', async () => {
  const d = driver();
  const clean = vi.fn(async () => {});
  const s = new UpdateService(d, '0.4.0', true, () => {}, clean);
  d.emit('update-available', { version: '0.4.1' });
  expect(d.downloadUpdate).toHaveBeenCalledTimes(1);
  d.emit('download-progress', { percent: 45 });
  expect(s.snapshot().progress).toBe(45);
  d.emit('update-downloaded', { version: '0.4.1' });
  expect(d.autoInstallOnAppQuit).toBe(false);
  expect(d.quitAndInstall).not.toHaveBeenCalled();
  await s.action('install');
  expect(clean).toHaveBeenCalled();
  expect(d.quitAndInstall).toHaveBeenCalledTimes(1);
  s.close();
  expect(d.listenerCount('error')).toBe(0);
});
it('manual downloading and errors remain visible', async () => {
  const d = driver();
  const s = new UpdateService(
    d,
    '0.4.0',
    true,
    () => {},
    async () => {},
    false,
  );
  d.emit('update-available', { version: '0.4.1' });
  expect(s.snapshot().phase).toBe('update-available');
  expect(d.downloadUpdate).not.toHaveBeenCalled();
  d.downloadUpdate.mockRejectedValueOnce(new Error('network'));
  await s.action('download');
  expect(s.snapshot().phase).toBe('error');
  s.close();
});
it('blocks arbitrary external URLs', () => {
  for (const url of Object.values(externalLinks)) expect(allowedExternalUrl(url)).toBe(true);
  for (const url of [
    'javascript:alert(1)',
    'http://boosty.to/itsflamb',
    'https://boosty.to.evil.test/itsflamb',
    'https://evil@boosty.to/itsflamb',
    'https://boosty.to/itsflamb?redirect=evil',
    'file:///C:/windows/system32/cmd.exe',
    'https://boosty.to:444/itsflamb',
  ])
    expect(allowedExternalUrl(url)).toBe(false);
});

it('enables updates only in installed Windows builds with release metadata', () => {
  const installed = {
    packaged: true,
    platform: 'win32',
    portable: false,
    installed: true,
    metadata: true,
  };
  expect(updatesEnabled(installed)).toBe(true);
  for (const change of [
    { packaged: false },
    { platform: 'linux' },
    { portable: true },
    { installed: false },
    { metadata: false },
  ])
    expect(updatesEnabled({ ...installed, ...change })).toBe(false);
});
