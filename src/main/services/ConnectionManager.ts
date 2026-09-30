import type { ConnectionStatus } from '../../shared/models';
import { asPlatformError } from '../../platforms/common/errors';
export function backoff(attempt: number, random = Math.random) {
  return Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6) * (0.75 + random() * 0.5));
}
/** One active attempt and one retry timer per adapter. Aborting invalidates callbacks immediately. */
export class ConnectionManager {
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private desired = false;
  private generation = 0;
  constructor(
    private run: (signal: AbortSignal, ready: () => void) => Promise<void>,
    private changed: (state: ConnectionStatus, error?: unknown) => void,
  ) {}
  start() {
    if (this.desired) return;
    this.desired = true;
    this.attempt = 0;
    this.launch();
  }
  stop() {
    this.desired = false;
    this.generation++;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.changed('disconnected');
  }
  resume() {
    if (!this.desired) return;
    this.generation++;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.attempt = 0;
    this.launch();
  }
  private launch() {
    if (!this.desired) return;
    const generation = ++this.generation;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.changed(this.attempt ? 'reconnecting' : 'connecting');
    void this.run(signal, () => {
      if (!signal.aborted && generation === this.generation) {
        this.attempt = 0;
        this.changed('connected');
      }
    })
      .then(() => {
        if (!signal.aborted && generation === this.generation) {
          this.desired = false;
          this.changed('offline');
        }
      })
      .catch((error) => {
        if (signal.aborted || generation !== this.generation || !this.desired) return;
        const problem = asPlatformError(error);
        if (!problem.retryable) {
          this.desired = false;
          this.changed(problem.code === 'CHAT_OFFLINE' ? 'offline' : 'error', problem);
          return;
        }
        this.changed('reconnecting', problem);
        this.timer = setTimeout(
          () => this.launch(),
          Math.max(backoff(this.attempt++), problem.retryAfterMs),
        );
      });
  }
}
