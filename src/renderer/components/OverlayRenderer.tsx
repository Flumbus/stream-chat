import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveAppearance } from '../../shared/chatAppearance';
import { chatStyle } from './chatStyle';
import type { ChatMessage, ChatTheme } from '../../shared/models';
import { messageKey } from '../../shared/events';
import { MessageRow } from './ChatRenderer';
export function OverlayRenderer({
  messages,
  theme: inputTheme,
}: {
  messages: ChatMessage[];
  theme: ChatTheme;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(900);
  const theme = useMemo(() => resolveAppearance(inputTheme, height), [inputTheme, height]);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [now, setNow] = useState(Date.now());
  const [rows, setRows] = useState<{ message: ChatMessage; leavingAt?: number }[]>([]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useLayoutEffect(() => {
    const visible = messages
      .filter(
        (m) =>
          !!m.text.trim() &&
          !m.displayPolicy?.hidden &&
          theme.platforms.includes(m.platform) &&
          !(theme.hideBots && m.metadata?.bot) &&
          !m.metadata?.banned &&
          !m.metadata?.overlayHidden &&
          !m.metadata?.timeoutUntil &&
          (!(theme.lifetime ?? 0) || now - Date.parse(m.createdAt) < theme.lifetime! * 1000),
      )
      .slice(-theme.maxMessages);
    setRows((previous) => {
      const ids = new Set(visible.map(messageKey));
      const leaving =
        theme.animation === 'none'
          ? []
          : previous
              .filter(
                (r) =>
                  !ids.has(messageKey(r.message)) &&
                  (!r.leavingAt || now - r.leavingAt < 180) &&
                  messages.some(
                    (m) =>
                      messageKey(m) === messageKey(r.message) &&
                      !!m.text.trim() &&
                      !m.displayPolicy?.hidden,
                  ),
              )
              .map((r) => ({ ...r, leavingAt: r.leavingAt ?? now }));
      return [...visible.map((message) => ({ message })), ...leaving]
        .sort((a, b) => a.message.createdAt.localeCompare(b.message.createdAt))
        .slice(-theme.maxMessages);
    });
  }, [messages, theme, now]);
  const style = {
    ...chatStyle(theme),
    background: `color-mix(in srgb, ${theme.background} ${theme.opacity}%, transparent)`,
    textShadow: theme.shadow ? '0 1px 3px #0008' : 'none',
  };
  return (
    <div
      ref={container}
      data-density={theme.appearance.density}
      data-display-limit={theme.maxMessages}
      className={`overlay-renderer chat-renderer layout-${theme.layout} animation-${theme.animation}`}
      style={style}
    >
      {rows.map((r) => (
        <div
          key={messageKey(r.message)}
          className={r.leavingAt ? 'overlay-row leaving' : 'overlay-row'}
        >
          <MessageRow message={r.message} theme={theme} />
        </div>
      ))}
    </div>
  );
}
