import type { EventEmitter } from 'node:events';
import type { UpdateState, UpdateAction } from '../../shared/updater';
export interface UpdateDriver extends EventEmitter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}
export class UpdateService {
  private state: UpdateState;
  private busy = false;
  private timer?: ReturnType<typeof setTimeout>;
  private listeners: [string, (value: { version?: string; percent?: number }) => void][] = [];
  constructor(
    private driver: UpdateDriver,
    version: string,
    enabled: boolean,
    private changed: (state: UpdateState) => void,
    private prepareInstall: () => Promise<void>,
    private autoDownload = true,
  ) {
    this.state = { phase: 'idle', installedVersion: version, enabled };
    driver.autoDownload = false;
    driver.autoInstallOnAppQuit = false;
    driver.allowDowngrade = false;
    driver.allowPrerelease = false;
    const on = (name: string, fn: (value: { version?: string; percent?: number }) => void) => {
      driver.on(name, fn);
      this.listeners.push([name, fn]);
    };
    if (!enabled) return;
    on('checking-for-update', () => this.set({ phase: 'checking', error: undefined }));
    on('update-available', (info) => {
      this.set({ phase: 'update-available', availableVersion: info.version, progress: undefined });
      if (this.autoDownload) void this.download();
    });
    on('update-not-available', () =>
      this.set({ phase: 'up-to-date', availableVersion: undefined, progress: undefined }),
    );
    on('download-progress', (p) =>
      this.set({ phase: 'downloading', progress: Math.min(100, Math.max(0, p.percent ?? 0)) }),
    );
    on('update-downloaded', (info) =>
      this.set({ phase: 'downloaded', availableVersion: info.version, progress: 100 }),
    );
    on('error', () => this.fail());
  }
  snapshot() {
    return { ...this.state };
  }
  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.snapshot());
  }
  private fail() {
    this.set({ phase: 'error', error: 'UPDATE_FAILED' });
  }
  configure(autoDownload: boolean) {
    this.autoDownload = autoDownload;
    if (autoDownload && this.state.phase === 'update-available') void this.download();
  }
  start() {
    if (this.state.enabled) this.timer = setTimeout(() => void this.action('check'), 15000);
  }
  private async download() {
    if (this.state.phase !== 'update-available') return;
    this.set({ phase: 'downloading', progress: 0, error: undefined });
    try {
      await this.driver.downloadUpdate();
    } catch {
      this.fail();
    }
  }
  async action(action: UpdateAction) {
    if (!this.state.enabled || this.busy) return;
    if (action === 'download') {
      await this.download();
      return;
    }
    if (action === 'install') {
      if (this.state.phase !== 'downloaded') return;
      this.busy = true;
      try {
        await this.prepareInstall();
        this.driver.quitAndInstall(false, true);
      } catch {
        this.fail();
        this.busy = false;
      }
      return;
    }
    if (['checking', 'downloading', 'downloaded'].includes(this.state.phase)) return;
    this.busy = true;
    this.set({ phase: 'checking', error: undefined });
    try {
      await this.driver.checkForUpdates();
    } catch {
      this.fail();
    } finally {
      this.busy = false;
    }
  }
  close() {
    clearTimeout(this.timer);
    for (const [name, fn] of this.listeners) this.driver.removeListener(name, fn);
    this.listeners = [];
  }
}
