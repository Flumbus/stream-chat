import { displayError } from '../i18n';
import { toastDuration } from '../../shared/notifications';
import { motion, useReducedMotion } from '../motion';
import { AnimatedDetails } from './AnimatedDetails';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../stores/app';
import { dismiss, notify, useNotifications, type Toast } from '../stores/notifications';
import { soundService } from '../services/SoundService';
import { desktopDefaults } from '../../shared/preferences';
import { useText } from '../i18n';
function ToastView({ item }: { item: Toast }) {
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const t = useText();
  const reduced = useReducedMotion();
  const remaining = useRef(toastDuration[item.kind]);
  const hovered = useRef(false);
  const focused = useRef(false);
  useEffect(() => {
    const preferences =
      useApp.getState().snapshot.settings.desktop?.feedback ?? desktopDefaults().feedback;
    void soundService.play(
      item.sound ?? (item.kind === 'error' ? 'error' : 'notification'),
      preferences,
    );
  }, [item]);
  useEffect(() => {
    if (held || leaving) return;
    const started = performance.now();
    const timer = setTimeout(() => setLeaving(true), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= performance.now() - started;
    };
  }, [held, item.kind, leaving]);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => dismiss(item.id), reduced ? 0 : motion.fast);
    return () => clearTimeout(timer);
  }, [leaving, item.id, reduced]);
  return (
    <div className="toast-slot" data-leaving={leaving}>
      <div className="toast-clip">
        <div
          className={`feedback-toast ${item.kind}${leaving ? ' leaving' : ''}`}
          role={item.kind === 'error' ? 'alert' : 'status'}
          onMouseEnter={() => {
            hovered.current = true;
            setHeld(true);
          }}
          onMouseLeave={() => {
            hovered.current = false;
            setHeld(focused.current);
          }}
          onFocus={() => {
            focused.current = true;
            setHeld(true);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              focused.current = false;
              setHeld(hovered.current);
            }
          }}
        >
          {
            <span
              className="toast-progress"
              aria-hidden="true"
              style={{
                animationPlayState: held ? 'paused' : 'running',
                animationDuration: `${toastDuration[item.kind]}ms`,
              }}
            />
          }
          <div>
            <strong>{item.message}</strong>
            {item.details && (
              <AnimatedDetails>
                <summary>{t('details')}</summary>
                <p>{item.details}</p>
              </AnimatedDetails>
            )}
          </div>
          <button
            className="icon-button"
            aria-label={t('dismissNotification')}
            onClick={() => setLeaving(true)}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
export function Feedback() {
  const items = useNotifications((s) => s.items);
  const accounts = useApp((s) => s.snapshot.accounts);
  const ready = useApp((s) => s.ready);
  const error = useApp((s) => s.error);
  const previous = useRef<Map<string, string> | null>(null);
  const t = useText();
  useEffect(() => {
    if (!ready) return;
    const old = previous.current;
    previous.current = new Map(accounts.map((a) => [a.id, a.connectionStatus]));
    if (!old) return;
    for (const account of accounts) {
      const before = old.get(account.id);
      if (account.authStatus === 'demo' || before === account.connectionStatus) continue;
      if (account.connectionStatus === 'connected')
        notify(`${account.displayName} · ${t('connected')}`, 'success', undefined, 'connect');
      else if (before === 'connected')
        notify(`${account.displayName} · ${t('disconnected')}`, 'warning', undefined, 'disconnect');
    }
  }, [accounts, ready, t]);
  useEffect(() => {
    if (!error) return;
    notify(t('actionFailed'), 'error', displayError(error));
    useApp.getState().setError(null);
  }, [error, t]);
  return (
    <div className="toast-stack" aria-label={t('notifications')}>
      {items.map((item) => (
        <ToastView item={item} key={item.id} />
      ))}
    </div>
  );
}
