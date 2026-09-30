import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useText } from '../i18n';
import { useMotionClose } from './useMotionClose';
import { createPortal } from 'react-dom';
export function Modal({
  title,
  close: onClose,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const { close, leaving } = useMotionClose(onClose);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  const t = useText();
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>('input,button,select,[tabindex="0"]')?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const items = [
          ...(ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ) ?? []),
        ];
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && index <= 0) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && index === items.length - 1) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', keys, true);
    return () => {
      document.removeEventListener('keydown', keys, true);
      before?.focus();
    };
  }, []);
  return createPortal(
    <div
      className={'modal-backdrop' + (leaving ? ' leaving' : '')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div ref={ref} className="utility-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-title">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label={t('cancel')}
            title={t('cancel')}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.querySelector('.app') ?? document.body,
  );
}
