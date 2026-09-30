import { it, expect, vi } from 'vitest';
import { GitHubProvider } from 'electron-updater/out/providers/GitHubProvider';
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor';
import { NsisUpdater } from 'electron-updater/out/NsisUpdater';
import { classifyUpdateError } from '../src/main/services/updateErrors';

function fixture() {
  const updater = new NsisUpdater(null, {
    version: '0.4.0', name: 'streamchat', isPackaged: true,
    appUpdateConfigPath: '', userDataPath: '', baseCachePath: '',
    whenReady: async () => {}, relaunch: () => {}, quit: () => {}, onQuit: () => {},
  });
  updater.logger = null;
  updater.allowPrerelease = false;
  const executor = new ElectronHttpExecutor();
  const request = vi.spyOn(executor, 'request');
  const provider = new GitHubProvider(
    { provider: 'github', owner: 'Flumbus', repo: 'stream-chat' }, updater,
    { executor, platform: 'win32', isUseMultipleRangeRequest: false },
  );
  return { provider, request };
}

it('recognizes the real electron-updater error from an empty GitHub Atom feed', async () => {
  const { provider, request } = fixture();
  request.mockResolvedValue('<feed xmlns="http://www.w3.org/2005/Atom"><title>Release notes</title></feed>');
  const error = await provider.getLatestVersion().catch((e: unknown) => e);
  expect(error).toMatchObject({ code: 'ERR_XML_MISSED_ELEMENT' });
  expect(classifyUpdateError(error, 'check')).toBe('UPDATE_NOT_PUBLISHED');
});

it('resolves a public patch release with latest.yml to the NSIS installer', async () => {
  const { provider, request } = fixture();
  request.mockResolvedValueOnce(
    '<feed><entry><title>StreamChat 0.4.1</title>' +
    '<link href="https://github.com/Flumbus/stream-chat/releases/tag/v0.4.1"/>' +
    '<content>Update diagnostics</content></entry></feed>',
  );
  request.mockResolvedValueOnce(JSON.stringify({ tag_name: 'v0.4.1' }));
  request.mockResolvedValueOnce(
    'version: 0.4.1\nfiles:\n  - url: StreamChat-Setup-0.4.1.exe\n    sha512: fixture-checksum\n    size: 100\n',
  );
  const info = await provider.getLatestVersion();
  expect(info.version).toBe('0.4.1');
  expect(provider.resolveFiles(info)[0].url.href).toBe(
    'https://github.com/Flumbus/stream-chat/releases/download/v0.4.1/StreamChat-Setup-0.4.1.exe',
  );
  expect(request.mock.calls[2][0].path).toContain('/releases/download/v0.4.1/latest.yml');
});
