import { uiText, useText } from '../i18n';
import { resolveNicknameColor } from '../../shared/nicknameColors';
import { SafeMessageNotice } from '../features/chat/SafeMessageNotice';
import { memo, useLayoutEffect, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ShieldCheck, ArrowDown } from 'lucide-react';
import type { ChatMessage, ChatTheme, Platform } from '../../shared/models';
import { resolveAppearance } from '../../shared/chatAppearance';
import { chatStyle } from './chatStyle';
import { fontStack } from '../../shared/fonts';
export function PlatformIcon({ platform, size = 14 }: { platform: Platform; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={platform}
      aria-label={platform === 'twitch' ? 'Twitch' : 'YouTube'}
    >
      {platform === 'twitch' ? (
        <>
          <path d="M4 3h17v12l-5 5h-5l-4 3v-3H3V7z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M10 7v6m6-6v6" stroke="currentColor" strokeWidth="2" />
        </>
      ) : (
        <>
          <rect x="2" y="5" width="20" height="14" rx="5" fill="currentColor" />
          <path d="m10 9 6 3-6 3z" fill="var(--bg)" />
        </>
      )}
    </svg>
  );
}
export const MessageRow = memo(function MessageRow({
  message: m,
  theme,
  onSelect,
  onContext,
  selected = false,
  enter = true,
  decorative = false,
}: {
  decorative?: boolean;
  selected?: boolean;
  enter?: boolean;
  message: ChatMessage;
  theme: ChatTheme;
  onSelect?: (m: ChatMessage) => void;
  onContext?: (m: ChatMessage, x: number, y: number) => void;
}) {
  useText(); // Re-render memoized rows when the interface language changes.
  const [arriving, setArriving] = useState(enter);
  const UserControl = decorative ? 'span' : 'button';
  return (
    <article
      data-enter={arriving}
      data-selected={selected}
      data-filtered={!!m.safeChat?.filtered}
      onAnimationEnd={() => setArriving(false)}
      className={`message ${m.kind !== 'message' ? 'special' : ''}`}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) onSelect?.(m);
      }}
      onContextMenu={(e) => {
        if (onContext) {
          e.preventDefault();
          onContext(m, e.clientX, e.clientY);
        }
      }}
      tabIndex={onContext ? 0 : undefined}
      onKeyDown={(e) => {
        if (onContext && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          onContext(m, rect.left + 30, rect.top + 20);
        }
      }}
    >
      {theme.showAvatar && (
        <UserControl
          tabIndex={onSelect ? 0 : -1}
          className="avatar"
          aria-label={m.user.displayName}
          onClick={() => onSelect?.(m)}
          style={{
            width: theme.avatarSize,
            height: theme.avatarSize,
            color: resolveNicknameColor(m, theme.nicknameColors),
          }}
        >
          {m.user.avatarUrl ? (
            <img src={m.user.avatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            m.user.displayName.slice(0, 2).toUpperCase()
          )}
        </UserControl>
      )}
      <div className="message-body">
        <div className="message-meta">
          {theme.showPlatformIcon && <PlatformIcon platform={m.platform} />}
          {(m.source === 'mock' || m.accountId.startsWith('mock-')) && (
            <span className="badge">DEMO</span>
          )}
          <UserControl
            className="username"
            style={{
              color: resolveNicknameColor(m, theme.nicknameColors),
              fontWeight: theme.usernameFontWeight,
            }}
            onClick={() => onSelect?.(m)}
          >
            {m.user.displayName}
          </UserControl>
          {theme.showBadges &&
            m.user.badges.map((b) => (
              <span className="badge" title={b.label} key={b.id}>
                <ShieldCheck size={12} />
                {b.label}
              </span>
            ))}
          {theme.showTimestamps && (
            <time>
              {new Date(m.createdAt).toLocaleTimeString('ru', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          )}
          {m.metadata?.banned && (
            <span className="badge danger-text">{uiText('releaseText1')}</span>
          )}
        </div>
        {m.kind !== 'message' && (
          <span className="event-label">
            {m.kind === 'donation'
              ? `${m.platform === 'youtube' ? 'SUPER CHAT' : uiText('releaseText2')} · ${m.metadata?.amount ?? ''}`
              : m.kind === 'subscription'
                ? uiText('releaseText3')
                : uiText('releaseText4')}
          </span>
        )}
        <div
          className="message-text"
          style={{
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            display: theme.appearance?.maxLines ? '-webkit-box' : undefined,
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: theme.appearance?.maxLines || undefined,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {m.fragments?.length
            ? m.fragments.map((f, i) => (
                <span key={i} className={f.type === 'emote' ? 'emote' : ''}>
                  {f.type === 'emote' && f.imageUrl ? (
                    <img src={f.imageUrl} alt={f.text} referrerPolicy="no-referrer" />
                  ) : (
                    f.text
                  )}
                </span>
              ))
            : m.text || (onContext && m.displayPolicy?.hidden ? uiText('releaseText5') : '')}
        </div>
        {onContext && <SafeMessageNotice message={m} />}
      </div>
    </article>
  );
});
export function ChatRenderer({
  messages,
  theme: inputTheme,
  onSelect,
  onContext,
  preview = false,
  selectedId,
}: {
  selectedId?: string;
  messages: ChatMessage[];
  theme: ChatTheme;
  onSelect?: (m: ChatMessage) => void;
  onContext?: (m: ChatMessage, x: number, y: number) => void;
  preview?: boolean;
}) {
  const theme = resolveAppearance(inputTheme);
  const seen = useRef(new Set(messages.map((m) => `${m.accountId}:${m.channelId}:${m.id}`)));
  useLayoutEffect(() => {
    seen.current = new Set(messages.map((m) => `${m.accountId}:${m.channelId}:${m.id}`));
  }, [messages]);
  const scroll = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const visible = messages
    .filter((m) => theme.platforms.includes(m.platform) && !(theme.hideBots && m.metadata?.bot))
    .slice(-inputTheme.maxMessages);
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 80,
    overscan: 6,
    getItemKey: (i) =>
      `${visible[i].source ?? visible[i].accountId}:${visible[i].platform}:${visible[i].channelId}:${visible[i].id}`,
  });
  const lastId = visible.at(-1)?.id;
  useEffect(() => {
    if (follow && visible.length) virtualizer.scrollToIndex(visible.length - 1, { align: 'end' });
  }, [lastId, follow, visible.length, virtualizer]);
  const style = {
    ...chatStyle(theme),
    '--chat-bg': theme.background,
    '--chat-opacity': `${theme.opacity}%`,
    '--chat-text': theme.textColor,
    '--gap': `${theme.messageSpacing}px`,
    '--radius': `${theme.borderRadius}px`,
    fontFamily: fontStack(theme.fontFamily),
    fontSize: theme.fontSize,
    lineHeight: theme.lineHeight,
  } as CSSProperties;
  return (
    <div
      className={`chat-renderer layout-${theme.layout} animation-${theme.animation} ${preview ? 'preview' : ''}`}
      style={style}
    >
      <div
        ref={scroll}
        className="chat-scroll"
        data-testid="chat-scroll"
        onScroll={() => {
          const el = scroll.current!;
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
        }}
      >
        {!visible.length && (
          <div className="empty">
            {' '}
            {uiText('releaseText6')}
            <span>{uiText('releaseText7')}</span>
          </div>
        )}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map((item) => (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
              }}
            >
              <MessageRow
                selected={selectedId === visible[item.index].id}
                enter={
                  follow &&
                  !seen.current.has(
                    `${visible[item.index].accountId}:${visible[item.index].channelId}:${visible[item.index].id}`,
                  )
                }
                message={visible[item.index]}
                theme={theme}
                onSelect={onSelect}
                onContext={onContext}
              />
            </div>
          ))}
        </div>
      </div>
      {!follow && visible.length > 0 && (
        <button className="follow pill" onClick={() => setFollow(true)}>
          <ArrowDown size={14} /> {uiText('releaseText8')}{' '}
        </button>
      )}
    </div>
  );
}
