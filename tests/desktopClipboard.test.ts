import { beforeEach, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
const { handlers, writeText } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, value: unknown) => unknown>(),
  writeText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined),
}));
vi.mock('electron', () => ({
  clipboard: { writeText },
  ipcMain: {
    handle: (channel: string, callback: (event: unknown, value: unknown) => unknown) =>
      handlers.set(channel, callback),
  },
}));
import { registerDesktopIPC } from '../src/main/ipc/desktop';
const contents = { mainFrame: {} };
const event = { sender: contents, senderFrame: contents.mainFrame };
beforeEach(() => {
  vi.resetAllMocks();
  handlers.clear();
  registerDesktopIPC({ webContents: contents, on: vi.fn() } as unknown as BrowserWindow);
});
it('copies Unicode text through native clipboard and propagates native failures', async () => {
  const copy = handlers.get('desktop:copy-text')!;
  await copy(event, 'Привет 👋\nstreamchat');
  expect(writeText).toHaveBeenCalledWith('Привет 👋\nstreamchat');
  writeText.mockRejectedValueOnce(new Error('Clipboard busy'));
  await expect(copy(event, 'retry')).rejects.toThrow('Clipboard busy');
});
it('rejects invalid payloads, other windows and subframes before clipboard access', () => {
  const copy = handlers.get('desktop:copy-text')!;
  expect(() => copy(event, { text: 'invalid' })).toThrow();
  expect(() => copy(event, 'x'.repeat(1_000_001))).toThrow();
  expect(() => copy({ ...event, sender: {} }, 'no')).toThrow('Request denied');
  expect(() => copy({ ...event, senderFrame: {} }, 'no')).toThrow('Request denied');
  expect(writeText).not.toHaveBeenCalled();
});
