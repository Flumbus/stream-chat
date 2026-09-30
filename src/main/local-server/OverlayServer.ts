import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import type { ChatMessage, ChatProfile, OverlayStatus, StreamEvent } from '../../shared/models';
import { publicMessage, type OverlayPacket } from '../../shared/overlay';
interface Options {
  directory: string;
  profiles: () => ChatProfile[];
  sanitize?: (message: ChatMessage) => ChatMessage;
  messages: () => ChatMessage[];
  readKey: (id: string) => Promise<string | undefined>;
  saveKey: (id: string, key: string) => Promise<void>;
  changed: () => void;
  error: (code: string) => void;
}
export class OverlayServer {
  private server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
    void this.http(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
      this.options.error('OVERLAY_HTTP_FAILED');
    });
  });
  private wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  private clients = new Map<WebSocket, string>();
  private keys = new Map<string, string>();
  private assets = new Map<string, { body: Buffer; type: string }>();
  private cutoffs = new Map<string, number>();
  private sequence = 0;
  private actualPort = 0;
  private closing = false;
  private heartbeat?: ReturnType<typeof setInterval>;
  private profileStates = new Map<string, string>();
  constructor(private options: Options) {
    this.server.requestTimeout = 5000;
    this.server.headersTimeout = 5000;
    this.server.maxConnections = 40;
    this.server.on('upgrade', (req, socket, head) => {
      const auth = this.authorize(req);
      if (
        !auth ||
        !this.validOrigin(req) ||
        this.clients.size >= 16 ||
        new URL(req.url ?? '/', this.origin()).pathname !== '/events'
      ) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.clients.set(ws, auth.id);
        let alive = true;
        ws.on('pong', () => {
          alive = true;
        });
        ws.on('message', () => ws.close(1008, 'Read-only transport'));
        ws.on('error', () => this.options.error('OVERLAY_SOCKET_ERROR'));
        ws.on('close', () => {
          this.clients.delete(ws);
          if (!this.closing) this.options.changed();
        });
        Object.assign(ws, {
          checkAlive: () => {
            if (!alive) {
              ws.terminate();
              return;
            }
            alive = false;
            ws.ping();
          },
        });
        this.send(ws, {
          type: 'overlay.ready',
          payload: { profile: auth, messages: this.snapshot(auth) },
        });
        this.options.changed();
      });
    });
    this.server.on('clientError', (_e, socket) =>
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'),
    );
  }
  private origin() {
    return `http://127.0.0.1:${this.actualPort}`;
  }
  status(): OverlayStatus {
    return { port: this.actualPort, clients: this.clients.size, running: this.server.listening };
  }
  private validOrigin(req: IncomingMessage) {
    return !req.headers.origin || req.headers.origin === this.origin();
  }
  private authorize(req: IncomingMessage): ChatProfile | undefined {
    if (req.headers.host !== `127.0.0.1:${this.actualPort}`) return;
    let url: URL;
    try {
      url = new URL(req.url ?? '/', this.origin());
    } catch {
      return;
    }
    const id =
      url.pathname === '/events'
        ? url.searchParams.get('profile')
        : url.pathname.startsWith('/overlay/')
          ? url.pathname.slice(9)
          : undefined;
    if (!id || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return;
    const key = url.searchParams.get('key') ?? '';
    const actual = this.keys.get(id);
    if (
      !actual ||
      !/^[A-Za-z0-9_-]{43}$/.test(key) ||
      key.length !== actual.length ||
      !timingSafeEqual(Buffer.from(key), Buffer.from(actual))
    )
      return;
    return this.options.profiles().find((p) => p.id === id);
  }
  async start(port: number) {
    this.closing = false;
    this.assets.clear();
    this.assets.set('/index.html', {
      body: await readFile(join(this.options.directory, 'index.html')),
      type: 'text/html; charset=utf-8',
    });
    for (const name of await readdir(join(this.options.directory, 'assets'))) {
      if (!/^[\w.-]+\.(js|css)$/.test(name)) continue;
      this.assets.set(`/assets/${name}`, {
        body: await readFile(join(this.options.directory, 'assets', name)),
        type: name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8',
      });
    }
    await this.syncProfiles();
    const listen = (p: number) =>
      new Promise<void>((resolve, reject) => {
        const fail = (error: Error) => {
          this.server.off('listening', success);
          reject(error);
        };
        const success = () => {
          this.server.off('error', fail);
          resolve();
        };
        this.server.once('error', fail);
        this.server.once('listening', success);
        this.server.listen(p, '127.0.0.1');
      });
    try {
      await listen(port);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
      await listen(0);
    }
    this.actualPort = (this.server.address() as { port: number }).port;
    this.heartbeat = setInterval(() => {
      for (const ws of this.clients.keys())
        (ws as WebSocket & { checkAlive: () => void }).checkAlive();
    }, 30_000);
    this.options.changed();
  }
  async syncProfiles() {
    for (const profile of this.options.profiles()) {
      if (!this.keys.has(profile.id)) {
        let key = await this.options.readKey(profile.id);
        if (!key) {
          key = randomBytes(32).toString('base64url');
          await this.options.saveKey(profile.id, key);
        }
        this.keys.set(profile.id, key);
      }
      const state = JSON.stringify(profile);
      if (this.profileStates.get(profile.id) !== state) {
        this.profileStates.set(profile.id, state);
        this.broadcast(profile.id, { type: 'profile.updated', payload: profile });
      }
    }
  }
  url(id: string) {
    const key = this.keys.get(id);
    if (!key || !this.server.listening)
      throw new Error('Overlay server недоступен. Сохраните профиль и проверьте диагностику.');
    return `${this.origin()}/overlay/${id}?key=${key}`;
  }
  private snapshot(profile: ChatProfile) {
    return this.options
      .messages()
      .filter((m) => Date.parse(m.createdAt) > (this.cutoffs.get(profile.id) ?? 0))
      .map((m) => publicMessage(this.options.sanitize?.(m) ?? m))
      .filter((m) => !!m.text.trim())
      .slice(
        -Math.min(
          500,
          profile.theme.appearance?.displayLimit.mode === 'manual'
            ? profile.theme.appearance.displayLimit.value
            : 200,
        ),
      );
  }
  refreshMessages() {
    for (const profile of this.options.profiles())
      this.broadcast(profile.id, {
        type: 'overlay.ready',
        payload: { profile, messages: this.snapshot(profile) },
      });
  }
  reset(id: string) {
    this.cutoffs.set(id, Date.now());
    this.broadcast(id, { type: 'chat.clear', payload: { type: 'clear' } });
    this.broadcast(id, { type: 'settings.updated', payload: { reset: true } });
  }
  publish(events: StreamEvent[]) {
    for (const e of events) {
      if ('message' in e) {
        const display = publicMessage(this.options.sanitize?.(e.message) ?? e.message);
        if (!display.text.trim()) continue;
        for (const p of this.options.profiles())
          if (Date.parse(e.message.createdAt) > (this.cutoffs.get(p.id) ?? 0))
            this.broadcast(p.id, {
              type: 'chat.message',
              payload: display,
            });
      } else if (e.type === 'clear') this.broadcast(undefined, { type: 'chat.clear', payload: e });
      else
        this.broadcast(undefined, {
          type:
            e.action === 'ban'
              ? 'moderation.userBanned'
              : e.action === 'timeout'
                ? 'moderation.userTimedOut'
                : 'chat.delete',
          payload: e,
        });
    }
  }
  private send(ws: WebSocket, packet: PacketBody) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 2 * 1024 * 1024) {
      ws.close(1013, 'Slow consumer');
      return;
    }
    ws.send(JSON.stringify({ version: 1, sequence: ++this.sequence, ...packet }));
  }
  private broadcast(profileId: string | undefined, packet: PacketBody) {
    for (const [ws, id] of this.clients) if (!profileId || profileId === id) this.send(ws, packet);
  }
  private async http(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src https: data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    if (
      req.method !== 'GET' ||
      req.headers.host !== `127.0.0.1:${this.actualPort}` ||
      !this.validOrigin(req) ||
      req.headers['transfer-encoding'] ||
      Number(req.headers['content-length'] ?? 0) > 0 ||
      /\.\.|%2e|%2f|%5c/i.test(req.url ?? '')
    ) {
      res.writeHead(403).end();
      return;
    }
    const path = new URL(req.url ?? '/', this.origin()).pathname;
    const asset = path.startsWith('/assets/')
      ? this.assets.get(path)
      : this.authorize(req)
        ? this.assets.get('/index.html')
        : undefined;
    if (!asset) {
      res.writeHead(404).end('Overlay not found or access key invalid.');
      return;
    }
    res.setHeader('Content-Type', asset.type);
    res.end(asset.body);
  }
  async close() {
    this.closing = true;
    clearInterval(this.heartbeat);
    for (const ws of this.clients.keys()) ws.terminate();
    this.clients.clear();
    await new Promise<void>((resolve) => {
      if (!this.server.listening) return resolve();
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
  }
}
type PacketBody = OverlayPacket extends infer P
  ? P extends OverlayPacket
    ? Omit<P, 'version' | 'sequence'>
    : never
  : never;
