import { MovingIndicator } from './MovingIndicator';
import { Check, Copy } from 'lucide-react';
import { perform } from '../stores/app';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useText } from '../i18n';
import { useMotionClose } from './useMotionClose';
import { createPortal } from 'react-dom';
export interface MenuItem {
  label: string;
  copyText?: string;
  description?: string;
  action?: () => void;
  disabled?: boolean;
  danger?: boolean;
  children?: MenuItem[];
  keepOpen?: boolean;
}
export interface MenuPosition {
  x: number;
  y: number;
}
export function ContextMenu({
  position,
  items,
  caption,
  close: onClose,
}: {
  position: MenuPosition;
  items: MenuItem[];
  caption?: string;
  close: () => void;
}) {
  const { close, leaving } = useMotionClose(onClose);
  const ref = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement);
  const [copied, setCopied] = useState<string>();
  const [focused, setFocused] = useState<string>();
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const [sub, setSub] = useState<MenuItem | null>(null);
  const [location, setLocation] = useState(position);
  const closeRef = useRef(close);
  closeRef.current = close;
  const t = useText();
  const visible = sub
    ? [
        { label: t('back'), action: () => setSub(null) },
        ...(items.find((i) => i.label === sub.label)?.children ?? []),
      ]
    : items;
  useLayoutEffect(() => {
    const rect = ref.current!.getBoundingClientRect();
    setLocation({
      x: Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8)),
    });
  }, [position, sub, visible.length]);
  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [position, sub]);
  useEffect(() => {
    const previous = previousFocus.current;
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', closeRef.current);
    const resize = closeRef.current;
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', resize);
      if (previous?.isConnected && document.activeElement === document.body) previous.focus();
    };
  }, []);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={sub?.label ?? t('messageActions')}
      className={'context-menu' + (leaving ? ' leaving' : '')}
      style={{ left: location.x, top: location.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const buttons = [
          ...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          const next =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? buttons.length - 1
                : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
        if (e.key === 'ArrowRight') {
          const item = visible.find((i) => i.label === focused);
          if (item?.children) {
            e.preventDefault();
            setSub(item);
          }
        }
        if (e.key === 'ArrowLeft' && sub) {
          e.preventDefault();
          setSub(null);
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          close();
        }
      }}
    >
      {caption && <div className="context-caption">{caption}</div>}
      <div key={sub?.label ?? 'root'} className={`menu-items ${sub ? 'forward' : 'back'}`}>
        <MovingIndicator selected={focused} />
        {visible.map((item, index) => (
          <button
            role="menuitem"
            data-selected={focused === item.label}
            onFocus={() => setFocused(item.label)}
            onMouseEnter={(e) => e.currentTarget.focus()}
            aria-haspopup={item.children ? 'menu' : undefined}
            className={item.danger ? 'danger-text' : ''}
            disabled={item.disabled}
            key={item.label}
            onClick={() => {
              if (item.copyText !== undefined) {
                void perform(async () => {
                  await window.desktop.copyText(item.copyText!);
                  setCopied(item.label);
                  clearTimeout(copyTimer.current);
                  copyTimer.current = setTimeout(() => closeRef.current(), 1400);
                });
                return;
              }
              if (item.children) setSub(item);
              else {
                if (!(sub && index === 0) && !item.keepOpen) close();
                item.action?.();
              }
            }}
          >
            <span>
              {item.copyText !== undefined && (
                <span className="icon-morph" key={String(copied === item.label)}>
                  {copied === item.label ? <Check size={14} /> : <Copy size={14} />}
                </span>
              )}
              {copied === item.label ? t('copied') : item.label}
              {item.description && (
                <small className="context-description">{item.description}</small>
              )}
            </span>
            {item.children && <span aria-hidden="true">›</span>}
          </button>
        ))}
      </div>
    </div>,
    document.querySelector('.app') ?? document.body,
  );
}
