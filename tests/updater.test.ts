import { updatesEnabled } from '../src/shared/updater';
import { EventEmitter } from 'node:events';
import { it, expect, vi } from 'vitest';
import { UpdateService } from '../src/main/services/UpdateService';
import { allowedExternalUrl, externalLinks } from '../src/shared/links';
import { classifyUpdateError } from '../src/main/services/updateErrors';
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

it('reports an empty GitHub release feed and allows retry when a release appears', async () => {
  const d = driver();
  const error = Object.assign(new Error('No published versions on GitHub'), {
    code: 'ERR_XML_MISSED_ELEMENT',
  });
  d.checkForUpdates.mockImplementationOnce(async () => {
    d.emit('error', error);
    throw error;
  });
  const changed = vi.fn();
  const s = new UpdateService(d, '0.4.0', true, changed, async () => {});
  await s.action('check');
  expect(s.snapshot()).toMatchObject({ phase: 'error', error: 'UPDATE_NOT_PUBLISHED' });
  expect(changed.mock.calls.filter(([state]) => state.phase === 'error')).toHaveLength(1);
  expect(d.downloadUpdate).not.toHaveBeenCalled();
  d.checkForUpdates.mockImplementationOnce(async () => {
    d.emit('update-not-available', { version: '0.4.0' });
  });
  await s.action('check');
  expect(s.snapshot()).toMatchObject({ phase: 'up-to-date', error: undefined });
  s.close();
});

it.each([
  ['ERR_UPDATER_NO_PUBLISHED_VERSIONS', '', 'UPDATE_NOT_PUBLISHED'],
  ['ERR_UPDATER_CHANNEL_FILE_NOT_FOUND', '', 'UPDATE_RELEASE_INCOMPLETE'],
  ['ERR_UPDATER_ASSET_NOT_FOUND', '', 'UPDATE_RELEASE_INCOMPLETE'],
  ['ERR_XML_MISSED_ELEMENT', 'No element feed', 'UPDATE_FAILED'],
  ['ERR_UPDATER_INVALID_UPDATE_INFO', '', 'UPDATE_INVALID_RELEASE'],
  ['ERR_CHECKSUM_MISMATCH', '', 'UPDATE_INVALID_RELEASE'],
  ['ECONNRESET', '', 'UPDATE_NETWORK_ERROR'],
  ['', 'net::ERR_TUNNEL_CONNECTION_FAILED', 'UPDATE_NETWORK_ERROR'],
  ['ERR_UPDATER_LATEST_VERSION_NOT_FOUND', 'net::ERR_NAME_NOT_RESOLVED', 'UPDATE_NETWORK_ERROR'],
])('classifies %s without exposing provider text', (code, message, expected) => {
  expect(classifyUpdateError({ code, message }, 'check')).toBe(expected);
});

it('does not pass signed URLs, local paths or unknown error text to the renderer', async () => {
  const d = driver();
  const message = 'private-token https://example.test/update?signature=private';
  d.checkForUpdates.mockRejectedValueOnce(new Error(message));
  const s = new UpdateService(d, '0.4.0', true, () => {}, async () => {});
  await s.action('check');
  expect(s.snapshot().error).toBe('UPDATE_FAILED');
  expect(JSON.stringify(s.snapshot())).not.toContain('private');
  expect(classifyUpdateError(new Error(message), 'install')).toBe('UPDATE_INSTALL_FAILED');
  s.close();
});

it('clears stale release details before a failed retry', async () => {
  const d = driver();
  const s = new UpdateService(d, '0.4.0', true, () => {}, async () => {}, false);
  d.emit('update-available', { version: '0.4.1' });
  d.checkForUpdates.mockRejectedValueOnce({ code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' });
  await s.action('check');
  expect(s.snapshot()).toMatchObject({
    phase: 'error', error: 'UPDATE_RELEASE_INCOMPLETE', availableVersion: undefined,
  });
  s.close();
});

it('handles a synchronous installer error event and unlocks retry', async () => {
  const d = driver();
  const s = new UpdateService(d, '0.4.0', true, () => {}, async () => {});
  d.emit('update-downloaded', { version: '0.4.1' });
  d.quitAndInstall.mockImplementationOnce(() => {
    // NsisUpdater emits instead of rejecting when it cannot start the installer.
    d.emit('error', new Error('installer could not start'));
  });
  await s.action('install');
  expect(s.snapshot()).toMatchObject({ phase: 'error', error: 'UPDATE_INSTALL_FAILED' });
  await s.action('check');
  expect(d.checkForUpdates).toHaveBeenCalledTimes(1);
  s.close();
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
