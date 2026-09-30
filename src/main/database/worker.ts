import { parentPort, workerData } from 'node:worker_threads';
import { join } from 'node:path';
import { Store } from './store';
import type { DatabaseMethods } from './protocol';
import { sourceOf } from '../../shared/events';
const main = new Store(join(workerData.directory, 'streamchat.sqlite'));
const demo = new Store(join(workerData.directory, 'demo.sqlite'));
main.seedProfiles();
type Request = {
  [K in keyof DatabaseMethods]: { id: number; method: K; input: DatabaseMethods[K]['input'] };
}[keyof DatabaseMethods];
parentPort?.on('message', (r: Request) => {
  try {
    let value: unknown;
    switch (r.method) {
      case 'init':
        value = { settings: main.getSettings(), profiles: main.getProfiles() };
        break;
      case 'settings':
        main.saveSettings(r.input);
        break;
      case 'profile':
        main.saveProfile(r.input);
        break;
      case 'messages':
        demo.recordMessages(r.input.filter((m) => sourceOf(m) === 'mock'));
        main.recordMessages(r.input.filter((m) => sourceOf(m) === 'live'));
        break;
      case 'users':
        value = [
          ...main.getUsers().map((u) => ({ ...u, source: 'live' })),
          ...demo.getUsers().map((u) => ({ ...u, id: `mock:${u.id}`, source: 'mock' })),
        ];
        break;
      case 'moderation':
        (r.input.accountId.startsWith('mock-') ? demo : main).recordModeration(r.input);
        break;
      case 'history':
        value = [...main.history(), ...demo.history()].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
        break;
      case 'accounts':
        value = main.accounts.accounts();
        break;
      case 'saveAccount':
        main.accounts.save(r.input);
        break;
      case 'deleteAccount':
        main.accounts.remove(r.input);
        break;
      case 'credential':
        value = main.accounts.credential(r.input);
        break;
      case 'saveCredential':
        main.accounts.setCredential(r.input.id, r.input.payload);
        break;
      case 'ban':
        value = main.accounts.ban(r.input);
        break;
      case 'saveBan':
        main.accounts.saveBan(r.input);
        break;
      case 'deleteBan':
        main.accounts.deleteBan(r.input);
        break;
      case 'overlayKey':
        value = main.accounts.overlayKey(r.input);
        break;
      case 'saveOverlayKey':
        main.accounts.setOverlayKey(r.input.id, r.input.secret);
        break;
      case 'close':
        main.close();
        demo.close();
        break;
    }
    parentPort?.postMessage({ id: r.id, ok: true, value });
  } catch {
    parentPort?.postMessage({
      id: r.id,
      ok: false,
      error: 'Не удалось сохранить локальные данные. Проверьте доступ к папке приложения.',
    });
  }
});
