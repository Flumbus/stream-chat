import { displayError } from '../../i18n';
import { hasTwitchModerationScopes } from '../../../shared/twitchPermissions';
import { uiText, localizeLabel } from '../../i18n';
import { ConnectionFeedback } from '../../components/ConnectionFeedback';
import { AnimatedDetails } from '../../components/AnimatedDetails';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Link2, RefreshCw, LogOut, Unplug, ShieldCheck } from 'lucide-react';
import { PlatformIcon } from '../../components/ChatRenderer';
import { backend, perform, useApp } from '../../stores/app';
import { featureEnabled } from '../../../shared/preferences';
import { useText } from '../../i18n';
import type {
  ChannelTarget,
  ConnectionStatus,
  PlatformAccount,
  Platform,
} from '../../../shared/models';
export const stateLabels: Record<ConnectionStatus, string> = {
  disconnected: 'Отключён',
  authorizing: 'Ожидание авторизации',
  connecting: 'Подключение…',
  connected: 'Подключён',
  reconnecting: 'Переподключение…',
  offline: 'Нет активного чата',
  error: 'Ошибка',
};
export function AccountsPage() {
  const snapshot = useApp(
    useShallow(({ snapshot: s }) => ({
      settings: s.settings,
      accounts: s.accounts,
      configured: s.configured,
      oauth: s.oauth,
    })),
  );
  const t = useText();
  const experimental = featureEnabled(snapshot.settings, 'diagnostics');
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{uiText('releaseText16')}</div>
          <h1>{t('accounts')}</h1>
          <p>{t('connectionHint')}</p>
        </div>
      </div>
      <div className="account-grid">
        {(['twitch', 'youtube'] as const).map((p) => {
          const auth = snapshot.oauth?.find((s) => s.platform === p);
          return (
            <section className="card account-card" key={p}>
              <div className="account-header">
                <PlatformIcon platform={p} size={24} />
                <h2>{p === 'twitch' ? 'Twitch' : 'YouTube'}</h2>
              </div>
              {experimental && (
                <p>{p === 'twitch' ? uiText('releaseText17') : uiText('releaseText18')}</p>
              )}
              <div className="account-connect-row">
                <button
                  className="primary"
                  disabled={auth?.state === 'authorizing'}
                  onClick={() => void perform(() => backend.authorize(p, true))}
                >
                  <Link2 size={15} />
                  {t(p === 'twitch' ? 'connectTwitch' : 'connectYoutube')}
                </button>
                {featureEnabled(snapshot.settings, 'urlChannels') && (
                  <LinkChannelInput platform={p} />
                )}
              </div>
              {!snapshot.configured?.[p] && (
                <p className="small" role="status">
                  {t('serviceUnavailable')}
                </p>
              )}
              {!snapshot.configured?.[p] && experimental && (
                <AnimatedDetails>
                  <summary>{t('details')}</summary>
                  <p className="small">
                    {' '}
                    {uiText('releaseText19')}{' '}
                    {p === 'twitch' ? 'TWITCH_CLIENT_ID' : 'GOOGLE_CLIENT_ID'}
                    {uiText('releaseText20')}{' '}
                  </p>
                </AnimatedDetails>
              )}
              {auth?.state !== 'idle' && auth && (
                <div className="auth-state" role="status">
                  {auth.state === 'error' ? (
                    <>
                      <p>
                        {t('connectionError')} {p === 'twitch' ? 'Twitch' : 'YouTube'}
                      </p>
                      <button onClick={() => void perform(() => backend.authorize(p, true))}>
                        {t('retry')}
                      </button>
                      <AnimatedDetails>
                        <summary>{t('details')}</summary>
                        <p>{displayError(auth.message)}</p>
                      </AnimatedDetails>
                    </>
                  ) : (
                    <p>
                      {auth.state === 'authorizing'
                        ? t('authorizeInBrowser')
                        : displayError(auth.message)}
                    </p>
                  )}
                  {auth.userCode && <code>{auth.userCode}</code>}
                  {auth.state === 'authorizing' && (
                    <button onClick={() => void perform(() => backend.cancelAuthorization(p))}>
                      {' '}
                      {uiText('releaseText21')}{' '}
                    </button>
                  )}
                </div>
              )}
              {snapshot.accounts
                .filter((a) => a.platform === p)
                .map((a) => (
                  <AccountCard key={a.id} account={a} />
                ))}
            </section>
          );
        })}
      </div>
      {experimental && (
        <div className="notice">
          <ShieldCheck size={20} />
          <p> {uiText('releaseText23')} </p>
        </div>
      )}
    </div>
  );
}
function AccountCard({ account: a }: { account: PlatformAccount }) {
  const t = useText();
  const experimental = useApp((s) => featureEnabled(s.snapshot.settings, 'diagnostics'));
  const [channels, setChannels] = useState<ChannelTarget[]>([]);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [logout, setLogout] = useState(false);
  const action = async (type: 'connect' | 'disconnect' | 'logout') => {
    setBusy(true);
    await perform(
      () => backend.accountAction(a.id, type),
      type === 'logout' ? t('signedOut') : undefined,
      'disconnect',
    );
    setBusy(false);
  };
  return (
    <div className="connected-account" data-status={a.connectionStatus}>
      <div className="account-identity">
        {a.avatarUrl && (
          <img className="account-avatar" src={a.avatarUrl} alt="" referrerPolicy="no-referrer" />
        )}
        <div>
          <b>{a.displayName}</b>
          <small>{a.username}</small>
        </div>
        <ConnectionFeedback status={a.connectionStatus} />
      </div>
      {!a.readOnlyLink && a.platform === 'twitch' && a.authStatus !== 'demo' && (
        <div className="account-permissions">
          <p>
            {!hasTwitchModerationScopes(a.scopes)
              ? t('moderationLogin')
              : a.capabilities.delete
                ? t('moderationReady')
                : t('moderationChannel')}
          </p>
          {!hasTwitchModerationScopes(a.scopes) && (
            <button onClick={() => void perform(() => backend.authorize('twitch', true))}>
              {t('signInAgain')}
            </button>
          )}
        </div>
      )}
      <p role="status">
        {a.authStatus === 'expired'
          ? uiText('releaseText24')
          : localizeLabel(stateLabels[a.connectionStatus])}
      </p>
      <p>
        {a.readOnlyLink && a.platform === 'twitch'
          ? uiText('releaseText25')
          : a.channel
            ? `${a.channel.title} · ${a.channel.live ? t('liveLabel') : t('offlineLabel')}`
            : uiText('releaseText26')}
      </p>
      {a.readOnlyLink && (
        <>
          <p className="small break-word">{a.readOnlyLink}</p>
          <p className="small">{uiText('releaseText27')}</p>
        </>
      )}
      {a.lastError && (
        <AnimatedDetails className="account-error">
          <summary>
            {t('connectionError')} · {t('details')}
          </summary>
          <p className="danger-text">{displayError(a.lastError)}</p>
        </AnimatedDetails>
      )}
      <div className="button-row">
        <button className="reconnect-button" disabled={busy} onClick={() => void action('connect')}>
          <RefreshCw size={13} className={busy ? 'motion-spinner' : undefined} />
          {t('reconnect')}
        </button>
        <button disabled={busy} onClick={() => void action('disconnect')}>
          <Unplug size={13} />
          {t('disconnect')}
        </button>
        <button disabled={busy} onClick={() => (logout ? void action('logout') : setLogout(true))}>
          <LogOut size={13} />
          {logout
            ? a.readOnlyLink
              ? uiText('releaseText28')
              : uiText('releaseText29')
            : a.readOnlyLink
              ? uiText('releaseText30')
              : t('logout')}
        </button>
        {logout && <button onClick={() => setLogout(false)}>{uiText('releaseText31')}</button>}
      </div>
      {!a.readOnlyLink && (
        <>
          <button
            onClick={() => void perform(async () => setChannels(await backend.listChannels(a.id)))}
          >
            {' '}
            {uiText('releaseText32')}{' '}
          </button>
          {channels.length > 0 && (
            <select
              aria-label={`${uiText('channelLabel')} ${a.displayName}`}
              value={a.channel?.id ?? ''}
              onChange={(e) => void perform(() => backend.selectChannel(a.id, e.target.value))}
            >
              <option value="" disabled>
                {' '}
                {uiText('releaseText33')}{' '}
              </option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}
          {a.platform === 'twitch' && (
            <div className="button-row">
              <input
                aria-label={uiText('releaseText34')}
                placeholder={uiText('releaseText35')}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
              <button
                disabled={!target.trim()}
                onClick={() => void perform(() => backend.selectChannel(a.id, target.trim()))}
              >
                {' '}
                {uiText('releaseText36')}{' '}
              </button>
            </div>
          )}
        </>
      )}
      {experimental && (
        <AnimatedDetails>
          <summary>{uiText('releaseText37')}</summary>
          <p className="small break-word">
            ID: {a.platformAccountId}
            <br /> {uiText('releaseText38')}{' '}
            {a.readOnlyLink ? uiText('releaseText39') : a.authStatus}
            <br /> {uiText('releaseText40')}{' '}
            {a.lastValidatedAt ? new Date(a.lastValidatedAt).toLocaleString('ru') : '—'}
            <br />
            Transport: {a.transportState ?? '—'}
            <br /> {uiText('releaseText41')} {a.errorCode ?? '—'}
            <br />
            Scopes: {a.scopes.join(', ')}
          </p>
        </AnimatedDetails>
      )}
    </div>
  );
}
function LinkChannelInput({ platform }: { platform: Platform }) {
  const t = useText();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const name = platform === 'twitch' ? 'Twitch' : 'YouTube';
  return (
    <form
      className="channel-link-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || !url.trim()) return;
        setBusy(true);
        void perform(async () => {
          await backend.addChannelLink(platform, url.trim());
          setUrl('');
        }).finally(() => setBusy(false));
      }}
    >
      <label>
        {' '}
        {uiText('releaseText42')}{' '}
        <div className="channel-link-input">
          <input
            aria-label={`${uiText('linkLabel')} ${name}`}
            value={url}
            maxLength={2048}
            placeholder={platform === 'twitch' ? uiText('releaseText43') : uiText('releaseText44')}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" disabled={busy || !url.trim()}>
            {busy ? uiText('releaseText45') : uiText('releaseText46')}
          </button>
        </div>
      </label>
      <p className="small">
        {' '}
        {uiText('releaseText47')} {platform === 'twitch' ? uiText('releaseText48') : t('proxyHint')}
      </p>
    </form>
  );
}
