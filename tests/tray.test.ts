import { beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
const mocks = vi.hoisted(() => ({
  destroy: vi.fn(), setToolTip: vi.fn(),
  setContextMenu: vi.fn<(menu: MenuItemConstructorOptions[]) => void>(),
  trays: [] as EventEmitter[],
}));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    Menu: { buildFromTemplate: (items: MenuItemConstructorOptions[]) => items },
    Tray: class extends EventEmitter {
      destroyed = false;
      constructor() { super(); mocks.trays.push(this); }
      setToolTip = mocks.setToolTip;
      setContextMenu = mocks.setContextMenu;
      isDestroyed() { return this.destroyed; }
      destroy() { this.destroyed = true; mocks.destroy(); }
    },
  };
});
import { TrayService } from '../src/main/services/TrayService';
import { applicationTitle } from '../src/shared/appVersion';
beforeEach(() => { vi.clearAllMocks(); mocks.trays.length = 0; });
function fixture() {
  let quitting = false;
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: vi.fn(() => false), isMinimized: vi.fn(() => false),
    hide: vi.fn(), show: vi.fn(), focus: vi.fn(), restore: vi.fn(),
  });
  const quit = vi.fn(() => { quitting = true; });
  const service = new TrayService(window as unknown as BrowserWindow, 'icon.ico', '0.5.0', 'ru',
    () => quitting, quit);
  return { service, window, quit, tray: mocks.trays[0] };
}
it('close hides the window while a real quit bypasses hiding', () => {
  const f = fixture();
  const event = { preventDefault: vi.fn() };
  f.window.emit('close', event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(f.window.hide).toHaveBeenCalledOnce();
  const items = mocks.setContextMenu.mock.calls[0][0];
  const quit = items.find((i) => i.id === 'quit')!;
  (quit.click as () => void)();
  expect(f.quit).toHaveBeenCalledOnce();
  const quitEvent = { preventDefault: vi.fn() };
  f.window.emit('close', quitEvent);
  expect(quitEvent.preventDefault).not.toHaveBeenCalled();
  f.service.close();
});
it('tray click restores a minimized window and the menu opens it too', () => {
  const f = fixture();
  f.window.isMinimized.mockReturnValue(true);
  f.tray.emit('click');
  expect(f.window.restore).toHaveBeenCalledOnce();
  expect(f.window.show).toHaveBeenCalledOnce();
  expect(f.window.focus).toHaveBeenCalledOnce();
  f.window.isMinimized.mockReturnValue(false);
  const open = mocks.setContextMenu.mock.calls[0][0].find((i) => i.id === 'open')!;
  (open.click as () => void)();
  expect(f.window.restore).toHaveBeenCalledOnce();
  expect(f.window.show).toHaveBeenCalledTimes(2);
  f.service.close();
});
it('updates menu language without creating duplicate tray icons', () => {
  const f = fixture();
  f.service.configure('ru');
  expect(mocks.setContextMenu).toHaveBeenCalledOnce();
  f.service.configure('en');
  expect(mocks.trays).toHaveLength(1);
  expect(mocks.setContextMenu.mock.calls[1][0].map((i) => i.label)).toContain('Quit StreamChat');
  expect(mocks.setToolTip).toHaveBeenCalledWith(applicationTitle('0.5.0'));
  f.service.close();
});
it('cleans up the close listener and never traps a window after tray destruction', () => {
  const f = fixture();
  f.service.close();
  f.service.close();
  expect(mocks.destroy).toHaveBeenCalledOnce();
  const event = { preventDefault: vi.fn() };
  f.window.emit('close', event);
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(f.window.hide).not.toHaveBeenCalled();
});
