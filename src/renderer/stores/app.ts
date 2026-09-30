import { create } from 'zustand';
import type { BackendEvent, ChatMessage, Snapshot, Settings } from '../../shared/models';
import { defaultSettings } from '../../shared/themes';
import { applyEvents } from '../../shared/events';
import { notify } from './notifications';
import type { SoundKind } from '../services/SoundService';
export const backend = window.streamchat;
let settingsQueue = Promise.resolve();
let pendingSettings = 0;
// Merge with the latest persisted snapshot, so quick changes don't overwrite each other.
export function updateSettings(change: (current: Settings) => Settings) {
  pendingSettings++;
  useApp.setState((s) => ({ snapshot: { ...s.snapshot, settings: change(s.snapshot.settings) } }));
  const task = settingsQueue.then(async () => {
    const current = (await backend.snapshot()).settings;
    await backend.saveSettings(change(current));
  });
  settingsQueue = task
    .catch(() => undefined)
    .finally(async () => {
      pendingSettings--;
      if (pendingSettings === 0) {
        const fresh = await backend.snapshot().catch(() => undefined);
        if (fresh && pendingSettings === 0)
          useApp.setState((s) => ({ snapshot: { ...s.snapshot, settings: fresh.settings } }));
      }
    });
  return task;
}
interface AppState {
  snapshot: Snapshot;
  error: string | null;
  ready: boolean;
  accept: (event: BackendEvent) => void;
  initialize: () => Promise<void>;
  setError: (error: string | null) => void;
}
function reduceEvents(messages: ChatMessage[], event: BackendEvent): ChatMessage[] {
  if (event.type === 'state') return event.snapshot.messages;
  return event.type === 'events' ? applyEvents(messages, event.events) : messages;
}
export const useApp = create<AppState>((set) => ({
  snapshot: {
    messages: [],
    accounts: [],
    settings: defaultSettings,
    profiles: [],
    running: false,
    databasePath: '',
  },
  error: null,
  ready: false,
  accept: (event) =>
    set((state) =>
      event.type === 'error'
        ? { error: event.message }
        : {
            snapshot:
              event.type === 'state'
                ? {
                    ...event.snapshot,
                    settings: pendingSettings ? state.snapshot.settings : event.snapshot.settings,
                  }
                : { ...state.snapshot, messages: reduceEvents(state.snapshot.messages, event) },
          },
    ),
  initialize: async () => {
    try {
      set({ snapshot: await backend.snapshot(), ready: true });
    } catch {
      set({
        error: 'Не удалось связаться с локальным приложением. Перезапустите StreamChat.',
        ready: true,
      });
    }
  },
  setError: (error) => set({ error }),
}));
export async function perform(action: () => Promise<unknown>, success?: string, sound?: SoundKind) {
  try {
    await action();
    if (success) notify(success, 'success', undefined, sound);
  } catch (error) {
    useApp
      .getState()
      .setError(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
  }
}
