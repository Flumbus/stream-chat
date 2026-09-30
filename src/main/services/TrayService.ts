import { Menu, Tray, type BrowserWindow, type Event } from 'electron';
import { applicationTitle } from '../../shared/appVersion';
import { translate } from '../../shared/i18n';

export class TrayService {
  private tray: Tray;
  private locale?: 'ru' | 'en';
  private title: string;
  private onClose = (event: Event) => {
    // Real quit and updater restart must bypass close-to-tray.
    if (this.isQuitting() || this.tray.isDestroyed()) return;
    event.preventDefault();
    this.window.hide();
  };
  constructor(
    private window: BrowserWindow,
    icon: string,
    version: string,
    locale: 'ru' | 'en',
    private isQuitting: () => boolean,
    private quit: () => void,
  ) {
    this.title = applicationTitle(version);
    this.tray = new Tray(icon);
    this.tray.setToolTip(this.title);
    this.configure(locale);
    this.tray.on('click', this.restore);
    this.tray.on('double-click', this.restore);
    this.window.on('close', this.onClose);
  }
  restore = () => {
    if (this.window.isDestroyed() || this.isQuitting()) return;
    if (this.window.isMinimized()) this.window.restore();
    this.window.show();
    this.window.focus();
  };
  configure(locale: 'ru' | 'en') {
    if (this.locale === locale || this.tray.isDestroyed()) return;
    this.locale = locale;
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: this.title, enabled: false },
      { type: 'separator' },
      { id: 'open', label: translate(locale, 'trayOpen'), click: this.restore },
      { id: 'quit', label: translate(locale, 'trayQuit'), click: this.quit },
    ]));
  }
  close() {
    this.window.removeListener('close', this.onClose);
    if (!this.tray.isDestroyed()) this.tray.destroy();
  }
}
