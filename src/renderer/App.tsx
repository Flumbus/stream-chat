import { uiText } from './i18n';
import { SupportLinks } from './components/SupportLinks';
import { MotionPresence } from './components/MotionPresence';
import { useMotionValue } from './motion';
import { MovingIndicator } from './components/MovingIndicator';
import { ConnectionFeedback } from './components/ConnectionFeedback';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  MessageSquare,
  Wrench,
  Settings,
  Layers,
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { backend, perform, updateSettings, useApp } from './stores/app';
import { ChatPage } from './features/chat/ChatPage';
import { AccountsPage } from './features/accounts/AccountManager';
import { SettingsPage } from './features/settings/SettingsPage';
import { UsersPage } from './features/users/UsersPage';
import { OverlaysPage } from './features/overlays/OverlaysPage';
import { PlatformIcon } from './components/ChatRenderer';
import { useText } from './i18n';
import { featureEnabled } from '../shared/preferences';
import type { Platform, ChatMessage } from '../shared/models';
import { WindowControls } from './components/WindowControls';
import { Feedback } from './components/Feedback';
const navigation = [
  { id: 'chat', name: 'chat', icon: MessageSquare },
  { id: 'accounts', name: 'accounts', icon: Link2 },
  { id: 'overlays', name: 'appearance', icon: Layers },
  { id: 'settings', name: 'settings', icon: Settings },
] as const;
export function App() {
  const settings = useApp((s) => s.snapshot.settings);
  const accounts = useApp((s) => s.snapshot.accounts);
  const oauth = useApp((s) => s.snapshot.oauth);
  const running = useApp((s) => s.snapshot.running);
  const overlay = useApp((s) => s.snapshot.overlay);
  const ready = useApp((s) => s.ready);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemReducedMotion(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const motion = settings.desktop?.feedback.reducedMotion ?? 'system';
  const t = useText();
  const [page, setPage] = useState('chat');
  const developerEnabled = featureEnabled(settings, 'developerTools');
  useEffect(() => {
    if (page === 'developer' && !developerEnabled) setPage('settings');
  }, [page, developerEnabled]);
  const route = useMotionValue(page === 'developer' && !developerEnabled ? 'settings' : page);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [systemDark, setSystemDark] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const pendingAuth = useRef<Platform[]>([]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing || event.altKey || !event.ctrlKey || event.shiftKey) return;
      const target = event.target as HTMLElement;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (target.closest('input,textarea,select,[contenteditable=true]')) return;
      const destination =
        event.key === ','
          ? 'settings'
          : event.key === '1'
            ? 'chat'
            : event.key === '2'
              ? 'accounts'
              : undefined;
      if (destination) {
        event.preventDefault();
        setPage(destination);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    const off = backend.subscribe(useApp.getState().accept);
    void useApp.getState().initialize();
    return off;
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setSystemDark(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);
  useEffect(() => {
    if (
      pendingAuth.current.some(
        (p) =>
          oauth?.some((a) => a.platform === p && a.state === 'idle') &&
          accounts.some((a) => a.platform === p && a.authStatus === 'authorized'),
      )
    )
      setPage('chat');
    pendingAuth.current =
      oauth?.filter((a) => a.state === 'authorizing').map((a) => a.platform) ?? [];
  }, [oauth, accounts]);
  async function connect(platform: Platform) {
    setPage('accounts');
    await updateSettings((s) => ({ ...s, onboardingComplete: true }));
    await backend.authorize(platform, false);
  }
  async function demo() {
    await updateSettings((s) => ({ ...s, onboardingComplete: true, developerMode: true }));
    await backend.setRunning(true);
    setPage('chat');
  }
  const mode = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
  return (
    <div
      className={'app theme-' + mode + (collapsed ? ' collapsed' : '')}
      data-reduced-motion={motion === 'on' || (motion === 'system' && systemReducedMotion)}
      onContextMenu={(e) => e.preventDefault()}
      style={{ '--accent': settings.accent, '--ui-scale': settings.uiScale / 100 } as CSSProperties}
    >
      <header
        className="titlebar"
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest('button'))
            void perform(() => window.desktop.windowAction('maximize'));
        }}
      >
        <div className="wordmark">
          <span className="brand-mark">
            <MessageSquare size={18} />
          </span>
          stream<span>chat</span>
        </div>
        <div className="connection-summary">
          {(['twitch', 'youtube'] as const).map((p) => (
            <span key={p}>
              <PlatformIcon platform={p} />
              {p === 'twitch' ? 'Twitch' : 'YouTube'}
              <ConnectionFeedback
                status={
                  accounts.find((a) => a.platform === p && a.connectionStatus === 'connected')
                    ?.connectionStatus ??
                  accounts.find((a) => a.platform === p)?.connectionStatus ??
                  'disconnected'
                }
              />
            </span>
          ))}
        </div>
        <WindowControls />
      </header>
      <aside className="sidebar">
        <MovingIndicator selected={`${page}-${collapsed}`} selector="[data-current='true']" />
        <div className="workspace-label">
          StreamChat
          <button
            aria-label={t('toggleNavigation')}
            title={t('toggleNavigation')}
            aria-expanded={!collapsed}
            className="icon-button"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.id}
              data-current={page === n.id}
              title={t(n.name)}
              className={page === n.id ? 'active' : ''}
              onClick={() => setPage(n.id)}
            >
              <n.icon size={19} />
              <span>{t(n.name)}</span>
            </button>
          ))}
          <MotionPresence show={developerEnabled}>
            <button
              data-current={page === 'developer'}
              title={t('developerTools')}
              className={page === 'developer' ? 'active' : ''}
              onClick={() => setPage('developer')}
            >
              <Wrench size={19} />
              <span>{t('developerTools')}</span>
            </button>
          </MotionPresence>
        </nav>
        <div className="sidebar-bottom">
          <SupportLinks />
          <details className="sidebar-more">
            <summary title={t('more')}>{collapsed ? '•••' : t('more')}</summary>
            <button data-current={page === 'users'} onClick={() => setPage('users')}>
              {t('viewers')}
            </button>
          </details>
        </div>
      </aside>
      <main key={route.shown} className="page-transition" data-phase={route.phase}>
        {ready &&
          (route.shown === 'chat' ? (
            <ChatPage
              replyTarget={replyTarget}
              consumeReply={() => setReplyTarget(null)}
              onConnect={(p) => void perform(() => connect(p))}
              onDemo={() => void perform(demo)}
              onAccounts={() => setPage('accounts')}
            />
          ) : route.shown === 'accounts' ? (
            <AccountsPage />
          ) : route.shown === 'overlays' ? (
            <OverlaysPage />
          ) : route.shown === 'users' ? (
            <UsersPage
              reply={(m) => {
                setReplyTarget(m);
                setPage('chat');
              }}
            />
          ) : (
            <SettingsPage developerOnly={route.shown === 'developer'} />
          ))}
      </main>
      <footer>
        <span className="attribution">
          by{' '}
          <button onClick={() => void perform(() => window.desktop.openExternal('developer'))}>
            fromflamb
          </button>
        </span>
        <span>
          {accounts.filter((a) => a.connectionStatus === 'connected').length}{' '}
          {settings.desktop?.locale === 'en' ? 'connected' : uiText('releaseText0')}
        </span>
        <span className="inline">
          <i className={overlay?.running ? 'status-dot' : 'offline-dot'} />
          {t(overlay?.running ? 'obsReady' : 'obsUnavailable')}
        </span>
        {running && (
          <button onClick={() => void perform(() => backend.setRunning(false))}>
            {t('stopDemo')}
          </button>
        )}
      </footer>
      <Feedback />
    </div>
  );
}
