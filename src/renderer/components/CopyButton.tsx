import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useText } from '../i18n';
import { perform } from '../stores/app';
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const t = useText();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      className="copy-feedback"
      data-state={copied ? 'success' : 'idle'}
      onClick={() =>
        void perform(async () => {
          await window.desktop.copyText(text);
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1400);
        })
      }
    >
      <span key={String(copied)} className="icon-morph">
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </span>
      {copied ? t('copied') : label}
    </button>
  );
}
