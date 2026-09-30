import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import type { DatabaseMethods } from './protocol';
export class DatabaseClient {
  private worker: Worker;
  private sequence = 0;
  private failed?: Error;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  constructor(directory: string) {
    this.worker = new Worker(join(__dirname, 'database-worker.js'), { workerData: { directory } });
    this.worker.on('message', (r) => {
      const p = this.pending.get(r.id);
      this.pending.delete(r.id);
      if (r.ok) p?.resolve(r.value);
      else p?.reject(new Error(r.error));
    });
    this.worker.on('error', () =>
      this.fail(new Error('Не удалось открыть локальную базу данных.')),
    );
    this.worker.on('exit', () => this.fail(new Error('База данных остановлена.')));
  }
  private fail(error: Error) {
    this.failed = error;
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
  }
  call<K extends keyof DatabaseMethods>(
    method: K,
    input: DatabaseMethods[K]['input'],
  ): Promise<DatabaseMethods[K]['output']> {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve: (v) => resolve(v as DatabaseMethods[K]['output']), reject });
      this.worker.postMessage({ id, method, input });
    });
  }
  async close() {
    await this.call('close', undefined);
    await this.worker.terminate();
  }
}
