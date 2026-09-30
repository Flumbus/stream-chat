import { translate } from '../../shared/i18n';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { PlatformError, readableError } from '../../platforms/common/errors';
import { oauthCallbackPage } from './OAuthCallbackPage';

export class OAuthCallbackServer {
  private server = createServer({ maxHeaderSize: 8192 });
  private status = { state: 'pending', message: '' };
  private accepted = false;
  private returned = false;
  private timer?: ReturnType<typeof setTimeout>;
  private nonce = randomBytes(24).toString('base64url');
  readonly sessionPath = `/session/${randomBytes(32).toString('base64url')}`;
  redirect = '';
  private resolveCode!: (code: string) => void;
  private rejectCode!: (error: Error) => void;
  readonly code = new Promise<string>((resolve, reject) => {
    this.resolveCode = resolve;
    this.rejectCode = reject;
  });
  constructor(
    private state: string,
    private returnToApp: () => void,
    private locale: 'ru' | 'en' = 'ru',
  ) {
    void this.code.catch(() => undefined);
    this.server.requestTimeout = 5000;
    this.server.headersTimeout = 5000;
    this.server.maxConnections = 8;
  }
  async listen() {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', resolve);
    });
    this.server.unref();
    const port = (this.server.address() as { port: number }).port;
    this.redirect = `http://127.0.0.1:${port}/`;
    this.server.on('request', (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'none'; style-src 'nonce-${this.nonce}'; script-src 'nonce-${this.nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      );
      let url: URL;
      try {
        url = new URL(req.url ?? '/', this.redirect);
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (
        req.headers.host !== `127.0.0.1:${port}` ||
        url.origin !== new URL(this.redirect).origin
      ) {
        res.writeHead(400).end();
        return;
      }
      if (this.accepted && url.pathname === `${this.sessionPath}/status` && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(this.status));
        return;
      }
      if (this.accepted && url.pathname === `${this.sessionPath}/return` && req.method === 'POST') {
        if (
          req.headers.origin !== new URL(this.redirect).origin ||
          this.status.state === 'pending' ||
          this.returned
        ) {
          res.writeHead(403).end();
          return;
        }
        this.returned = true;
        try {
          this.returnToApp();
          res.writeHead(204).end();
        } catch {
          res.writeHead(500).end();
        }
        return;
      }
      if (req.method !== 'GET') {
        res.writeHead(405).end();
        return;
      }
      const page = () => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(oauthCallbackPage(this.nonce, this.sessionPath, this.locale));
      };
      if (this.accepted && url.pathname === this.sessionPath) {
        page();
        return;
      }
      if (url.pathname !== '/' || url.searchParams.get('state') !== this.state) {
        res.writeHead(400).end('Invalid OAuth response.');
        return;
      }
      if (this.accepted) {
        res.writeHead(409).end('Already received.');
        return;
      }
      const code = url.searchParams.get('code');
      if (!code && !url.searchParams.has('error')) {
        res.writeHead(400).end('Missing code.');
        return;
      }
      this.accepted = true;
      page();
      if (url.searchParams.has('error'))
        this.rejectCode(
          new PlatformError(
            'OAUTH_DENIED',
            'Вход в Google отменён или доступ не предоставлен. Повторите подключение в StreamChat.',
          ),
        );
      else this.resolveCode(code!);
    });
    return this.redirect;
  }
  fail(error: unknown) {
    this.status = {
      state: 'error',
      message: this.locale === 'en' ? translate('en', 'actionErrorDetail') : readableError(error),
    };
    this.rejectCode(error instanceof Error ? error : new Error('OAuth failed'));
  }
  succeed() {
    this.status = {
      state: 'success',
      message: translate(this.locale, 'oauthText15'),
    };
  }
  finish(retain: boolean) {
    if (retain && this.accepted) this.timer = setTimeout(() => this.close(), 5 * 60_000).unref();
    else this.close();
  }
  close() {
    clearTimeout(this.timer);
    this.server.close();
    this.server.closeAllConnections();
  }
}
