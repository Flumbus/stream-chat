import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { useText } from '../i18n';
import { perform } from '../stores/app';
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const t = useText();
  useEffect(() => {
    const off = window.desktop.onWindowState((s) => setMaximized(s.maximized));
    void window.desktop.windowState().then((s) => setMaximized(s.maximized));
    return off;
  }, []);
  return (
    <div className="window-controls">
      <button
        aria-label={t('minimize')}
        title={t('minimize')}
        onClick={() => void perform(() => window.desktop.windowAction('minimize'))}
      >
        <Minus size={16} />
      </button>
      <button
        aria-label={t(maximized ? 'restore' : 'maximize')}
        title={t(maximized ? 'restore' : 'maximize')}
        onClick={() => void perform(() => window.desktop.windowAction('maximize'))}
      >
        {maximized ? <Copy size={14} /> : <Square size={14} />}
      </button>
      <button
        className="window-close"
        aria-label={t('closeWindow')}
        title={t('closeWindow')}
        onClick={() => void perform(() => window.desktop.windowAction('close'))}
      >
        <X size={17} />
      </button>
    </div>
  );
}
