import { uiText, localizeLabel } from '../../i18n';
import { MovingIndicator } from '../../components/MovingIndicator';
import { MotionPresence } from '../../components/MotionPresence';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Send, PanelRightClose, PanelRightOpen, Shield, Radio } from 'lucide-react';
import { ChatRenderer, PlatformIcon } from '../../components/ChatRenderer';
import { backend, perform, updateSettings, useApp } from '../../stores/app';
import { desktopDefaults } from '../../../shared/preferences';
import { useText } from '../../i18n';
import { themes } from '../../../shared/themes';
import type { ChatMessage, Platform } from '../../../shared/models';
import { UserCard } from './UserCard';
import { stateLabels } from '../accounts/AccountManager';
import { MessageActions, type MessageTarget } from './MessageActions';

export function ChatPage({
  onConnect,
  onDemo,
  onAccounts,
  replyTarget,
  consumeReply,
}: {
  onConnect: (p: Platform) => void;
  onDemo: () => void;
  onAccounts: () => void;
  replyTarget?: ChatMessage | null;
  consumeReply?: () => void;
}) {
  const snapshot = useApp((s) => s.snapshot);
  const t = useText();
  const preferences = snapshot.settings.desktop?.chat ?? desktopDefaults().chat;
  const platform = preferences.platform,
    category = preferences.category;
  const saveChat = (patch: Partial<typeof preferences>) =>
    void perform(() =>
      updateSettings((s) => {
        const d = s.desktop ?? desktopDefaults();
        return { ...s, desktop: { ...d, chat: { ...d.chat, ...patch } } };
      }),
    );
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [menu, setMenu] = useState<MessageTarget | null>(null);
  const context = useCallback(
    (message: ChatMessage, x: number, y: number) => setMenu({ message, position: { x, y } }),
    [],
  );
  const [info, setInfo] = useState(false);
  const [text, setText] = useState('');
  const [sender, setSender] = useState(preferences.senderId ?? 'mock-twitch');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (replyTarget) {
      setText(`@${replyTarget.user.username} `);
      setSender(replyTarget.accountId);
      consumeReply?.();
    }
  }, [replyTarget, consumeReply]);
  const senders = snapshot.accounts.filter(
    (a) => a.capabilities.send && a.connectionStatus === 'connected',
  );
  const selectedSender = senders.find((a) => a.id === sender) ?? senders[0];
  useEffect(() => {
    if (selectedSender && sender !== selectedSender.id) setSender(selectedSender.id);
  }, [selectedSender, sender]);
  useEffect(() => {
    if (preferences.senderId) setSender(preferences.senderId);
  }, [preferences.senderId]);
  const selectMessage = useCallback((message: ChatMessage) => {
    setSelected(message);
    setInfo(true);
  }, []);
  const theme = useMemo(
    () => ({
      ...(snapshot.profiles[0]?.theme ??
        themes.find((t) => t.id === snapshot.settings.activeTheme) ??
        themes[0]),
      maxMessages: 2000,
      fontFamily: preferences.fontFamily ?? 'Segoe UI',
    }),
    [snapshot.profiles, snapshot.settings.activeTheme, preferences.fontFamily],
  );
  const messages = snapshot.messages.filter(
    (m) =>
      (platform === 'all' || m.platform === platform) &&
      (category === 'all' ||
        (category === 'members'
          ? ['subscription', 'membership'].includes(m.kind)
          : m.kind === category)),
  );
  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      if (!selectedSender) return;
      await backend.send(selectedSender.id, text);
      setText('');
    } catch (e) {
      useApp.getState().setError(String(e));
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="chat-page">
      {menu && (
        <MessageActions
          target={menu}
          close={() => setMenu(null)}
          openUser={selectMessage}
          reply={(m) => {
            setText(`@${m.user.username} `);
            setSender(m.accountId);
            document.querySelector<HTMLInputElement>('.composer input')?.focus();
          }}
        />
      )}
      <section className="chat-main">
        <div className="page-heading">
          <div>
            <div className="eyebrow">{uiText('releaseText50')}</div>
            <h1>
              {' '}
              {uiText('releaseText51')} <span className="count">{snapshot.messages.length}</span>
            </h1>
            <p>{uiText('releaseText52')}</p>
          </div>
          <button
            className="icon-button"
            title={uiText('releaseText53')}
            onClick={() => setInfo(!info)}
          >
            {info ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}
          </button>
        </div>
        <div className="filter-bar">
          <div className="tabs moving-tabs">
            <MovingIndicator selected={platform} />
            {(['all', 'twitch', 'youtube'] as const).map((p) => (
              <button
                key={p}
                data-selected={platform === p}
                aria-label={
                  p === 'all' ? uiText('releaseText54') : p === 'twitch' ? 'Twitch' : 'YouTube'
                }
                className={platform === p ? 'active' : ''}
                onClick={() => saveChat({ platform: p })}
              >
                {p !== 'all' && <PlatformIcon platform={p} />}{' '}
                {p === 'all' ? uiText('releaseText54') : p === 'twitch' ? 'Twitch' : 'YouTube'}
              </button>
            ))}
          </div>
          <div
            className="tabs moving-tabs event-tabs"
            role="group"
            aria-label={uiText('releaseText55')}
          >
            <MovingIndicator selected={category} />
            {(
              [
                ['all', uiText('releaseText56')],
                ['message', uiText('releaseText57')],
                ['donation', uiText('releaseText58')],
                ['members', uiText('releaseText59')],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                data-selected={category === id}
                aria-pressed={category === id}
                onClick={() => saveChat({ category: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="stream-note">
          <Radio size={13} />
          <span>
            {snapshot.accounts.filter((a) => a.connectionStatus === 'connected').length}{' '}
            {uiText('releaseText60')}{' '}
          </span>
          <span className="muted">
            {snapshot.running ? uiText('releaseText61') : 'Twitch + YouTube'}
          </span>
          <span className="live-dot" />
        </div>
        {snapshot.messages.length === 0 ? (
          <div className="chat-onboarding">
            <span className="brand-mark large">
              <MessageSquare size={28} />
            </span>
            <h2>
              {t(
                snapshot.accounts.some((a) => a.authStatus !== 'demo') ? 'waitingChat' : 'welcome',
              )}
            </h2>
            <p>
              {t(
                snapshot.accounts.some((a) => a.authStatus !== 'demo')
                  ? 'waitingHint'
                  : 'welcomeHint',
              )}
            </p>
            {snapshot.accounts.some((a) => a.authStatus !== 'demo') ? (
              <button onClick={onAccounts}>{t('manageAccounts')}</button>
            ) : (
              <>
                <div className="connect-platforms">
                  {(['twitch', 'youtube'] as const).map((p) => (
                    <button key={p} onClick={() => onConnect(p)}>
                      <PlatformIcon platform={p} size={28} />
                      <strong>{t(p === 'twitch' ? 'connectTwitch' : 'connectYoutube')}</strong>
                    </button>
                  ))}
                </div>
                <button className="text-button" onClick={onDemo}>
                  {t('tryDemo')}
                </button>
              </>
            )}
          </div>
        ) : (
          <ChatRenderer
            selectedId={selected?.id}
            messages={messages}
            theme={theme}
            onSelect={selectMessage}
            onContext={context}
          />
        )}
        <div className="composer">
          <div className="compose-box">
            <select
              aria-label={uiText('releaseText62')}
              value={sender}
              onChange={(e) => {
                setSender(e.target.value);
                saveChat({ senderId: e.target.value });
              }}
            >
              {!senders.length && <option value="">{uiText('releaseText63')}</option>}
              {senders.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.platform} · {a.authStatus === 'demo' ? 'Demo' : a.displayName}
                </option>
              ))}
            </select>
            <input
              aria-label={uiText('releaseText64')}
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send();
              }}
              placeholder={
                selectedSender?.authStatus === 'demo'
                  ? uiText('releaseText65')
                  : uiText('releaseText66')
              }
              disabled={!selectedSender}
            />
            <button
              className="send-button"
              aria-label={uiText('releaseText67')}
              disabled={!selectedSender || !text.trim() || sending}
              onClick={() => void send()}
            >
              <Send size={18} />
            </button>
          </div>
          <div className="compose-hint">
            <span>{uiText('releaseText68')}</span>
            <span>
              {text.length}/500 ·{' '}
              {selectedSender?.authStatus === 'demo'
                ? uiText('releaseText69')
                : (selectedSender?.channel?.title ?? uiText('releaseText70'))}
            </span>
          </div>
        </div>
      </section>
      <MotionPresence show={info} className="user-panel-presence">
        <aside className="info-panel">
          <div key={selected?.user.platformUserId ?? 'overview'} className="panel-content">
            {selected ? (
              <UserCard
                message={snapshot.messages.find((m) => m.id === selected.id) ?? selected}
                close={() => setInfo(false)}
                reply={() => {
                  setText(`@${selected.user.username} `);
                  setSender(selected.accountId);
                }}
              />
            ) : (
              <>
                <div className="panel-title">
                  {' '}
                  {uiText('releaseText71')} <span className="badge">LOCAL</span>
                </div>
                <div className="session-art">
                  <MessageSquare size={30} />
                  <span className="orbit one" />
                  <span className="orbit two" />
                </div>
                <h3>{uiText('releaseText72')}</h3>
                <p className="muted"> {uiText('releaseText73')} </p>
                <div className="stat-grid">
                  <div>
                    <strong>{snapshot.messages.length}</strong>
                    <span>{uiText('releaseText74')}</span>
                  </div>
                  <div>
                    <strong>{snapshot.accounts.length}</strong>
                    <span>{uiText('releaseText75')}</span>
                  </div>
                </div>
                <div className="divider" />
                <div className="panel-title">{uiText('releaseText76')}</div>
                {snapshot.accounts.map((a) => (
                  <div className="source-row" key={a.id}>
                    <PlatformIcon platform={a.platform} size={20} />
                    <div>
                      <b>{a.displayName}</b>
                      <small>
                        {a.authStatus === 'demo' ? 'Demo · ' : ''}
                        {localizeLabel(stateLabels[a.connectionStatus])}
                      </small>
                    </div>
                    <span
                      className={a.connectionStatus === 'connected' ? 'status-dot' : 'offline-dot'}
                    />
                  </div>
                ))}
                <div className="tip">
                  <Shield size={17} />
                  <p> {uiText('releaseText77')} </p>
                </div>
              </>
            )}
          </div>
        </aside>
      </MotionPresence>
    </div>
  );
}
