import { MovingIndicator } from './MovingIndicator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { defaultFont, fallbackFonts, fontStack } from '../../shared/fonts';
import type { SystemFontList } from '../../shared/desktop';
import { Modal } from './Modal';
import { useText } from '../i18n';
function FontPicker({
  value,
  apply,
  close,
}: {
  value: string;
  apply: (font: string) => void;
  close: () => void;
}) {
  const t = useText();
  const [fonts, setFonts] = useState<SystemFontList | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(value);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    void window.desktop
      .listFonts()
      .catch(() => ({ families: fallbackFonts, fallback: true }))
      .then((result) => {
        if (!cancelled) setFonts(result);
      });
    input.current?.focus();
    return () => {
      cancelled = true;
    };
  }, []);
  const filtered = useMemo(
    () =>
      (fonts?.families ?? []).filter((font) =>
        font.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()),
      ),
    [fonts, query],
  );
  const virtual = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => list.current,
    estimateSize: () => 76,
    overscan: 3,
  });
  const move = (index: number) => {
    const clamped = Math.max(0, Math.min(filtered.length - 1, index));
    if (!filtered[clamped]) return;
    setSelected(filtered[clamped]);
    virtual.scrollToIndex(clamped, { align: 'auto' });
  };
  return (
    <Modal title={t('chooseFont')} close={close}>
      <div className="font-picker">
        <div className="font-selected">
          <small>
            {t('selectedFont')} · {selected}
          </small>
          <p
            key={selected}
            className="content-crossfade"
            style={{ fontFamily: fontStack(selected) }}
          >
            {t('fontSample')}
          </p>
        </div>
        {fonts && !fonts.families.some((font) => font.toLowerCase() === selected.toLowerCase()) && (
          <p className="small muted">{t('fontUnavailable')}</p>
        )}
        {fonts?.fallback && <p className="small muted">{t('fontFallback')}</p>}
        <input
          ref={input}
          aria-label={t('searchFonts')}
          placeholder={t('searchFonts')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            list.current?.scrollTo(0, 0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              move(0);
              list.current?.focus();
            }
          }}
        />
        {!fonts && <p role="status">{t('loadingFonts')}</p>}
        {fonts && !filtered.length && <p role="status">{t('noFonts')}</p>}
        <div
          ref={list}
          className="font-list"
          role="listbox"
          aria-label={t('systemFonts')}
          tabIndex={0}
          aria-activedescendant={
            virtual.getVirtualItems().some((item) => filtered[item.index] === selected)
              ? `font-option-${filtered.indexOf(selected)}`
              : undefined
          }
          onKeyDown={(e) => {
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              move(
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? filtered.length - 1
                    : filtered.indexOf(selected) + (e.key === 'ArrowDown' ? 1 : -1),
              );
            }
          }}
        >
          <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
            <MovingIndicator
              selected={`${selected}-${query}-${virtual
                .getVirtualItems()
                .map((i) => i.index)
                .join()}`}
              selector="[aria-selected='true']"
            />
            {virtual.getVirtualItems().map((item) => {
              const font = filtered[item.index];
              return (
                <div
                  key={font}
                  id={`font-option-${item.index}`}
                  role="option"
                  aria-selected={font === selected}
                  aria-label={font}
                  aria-posinset={item.index + 1}
                  aria-setsize={filtered.length}
                  className="font-option"
                  style={{
                    position: 'absolute',
                    top: item.start,
                    height: item.size,
                    width: '100%',
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelected(font);
                    list.current?.focus();
                  }}
                >
                  <strong>{font}</strong>
                  <span style={{ fontFamily: fontStack(font) }}>{t('fontSample')}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="button-row">
          <button onClick={() => setSelected(defaultFont)}>{t('restoreFont')}</button>
          <button onClick={close}>{t('cancel')}</button>
          <button
            className="primary"
            onClick={() => {
              apply(selected);
              close();
            }}
          >
            {t('apply')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
export function FontControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (font: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const t = useText();
  return (
    <div className="font-control">
      <span>{t('chatFont')}</span>
      <div>
        <strong>{value}</strong>
        <button onClick={() => setOpen(true)}>{t('changeFont')}</button>
      </div>
      {open && <FontPicker value={value} apply={onChange} close={() => setOpen(false)} />}
    </div>
  );
}
