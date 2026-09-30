import { contextBridge, ipcRenderer } from 'electron';
import type { ChatBackend } from '../shared/contracts';
import type { BackendEvent, Result } from '../shared/models';
import type { DesktopBridge, WindowState } from '../shared/desktop';
async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const result: Result<T> = await ipcRenderer.invoke(channel, payload);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
const api: ChatBackend = {
  originalMessage: (key) => call('chat:original', key),
  addChannelLink: (platform, url) => call('account:link', { platform, url }),
  authorize: (platform, moderation) => call('account:authorize', { platform, moderation }),
  cancelAuthorization: (platform) => call('account:cancel', platform),
  accountAction: (id, action) => call('account:action', { id, action }),
  listChannels: (id) => call('account:channels', id),
  selectChannel: (id, target) => call('account:select', { id, target }),
  getUserCard: (input) => call('account:user', input),
  overlayUrl: (id) => call('overlay:url', id),
  openOverlay: (id) => call('overlay:open', id),
  resetOverlay: (id) => call('overlay:reset', id),
  snapshot: () => call('chat:snapshot'),
  setRunning: (running) => call('chat:running', running),
  send: (accountId, message) => call('chat:send', { accountId, message }),
  moderate: (request) => call('chat:moderate', request),
  getUsers: () => call('chat:users'),
  getModerationHistory: () => call('chat:history'),
  saveSettings: (settings) => call('chat:settings', settings),
  saveProfile: (profile) => call('chat:profile', profile),
  generate: (platform, scenario, count) => call('chat:generate', { platform, scenario, count }),
  openLogs: () => call('chat:logs'),
  subscribe: (listener) => {
    const handler = (_: unknown, event: BackendEvent) => listener(event);
    ipcRenderer.on('chat:event', handler);
    return () => {
      ipcRenderer.removeListener('chat:event', handler);
    };
  },
};
contextBridge.exposeInMainWorld('streamchat', api);
const desktop: DesktopBridge = {
  openExternal: (link) => ipcRenderer.invoke('desktop:external', link),
  updateState: () => ipcRenderer.invoke('desktop:update-state'),
  updateAction: (action) => ipcRenderer.invoke('desktop:update-action', action),
  onUpdateState: (listener) => {
    const handler = (_: unknown, state: import('../shared/updater').UpdateState) => listener(state);
    ipcRenderer.on('desktop:update-state', handler);
    return () => ipcRenderer.removeListener('desktop:update-state', handler);
  },
  copyText: (text) => ipcRenderer.invoke('desktop:copy-text', text),
  listFonts: () => ipcRenderer.invoke('desktop:fonts'),
  windowAction: (action) => ipcRenderer.invoke('desktop:action', action),
  windowState: () => ipcRenderer.invoke('desktop:state'),
  onWindowState: (listener) => {
    const handler = (_: unknown, value: WindowState) => listener(value);
    ipcRenderer.on('desktop:state', handler);
    return () => ipcRenderer.removeListener('desktop:state', handler);
  },
};
contextBridge.exposeInMainWorld('desktop', desktop);
