import { historyLabels, actionLabel } from '../../i18n';
import { displayError } from '../../i18n';
import { uiText } from '../../i18n';
import { moderationHistoryReason } from '../../../shared/moderationHistory';
import { CopyButton } from '../../components/CopyButton';
import { AnimatedDetails } from '../../components/AnimatedDetails';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { PlatformIcon } from '../../components/ChatRenderer';
import { backend, perform, useApp } from '../../stores/app';
import type { ChatMessage, ModerationAction, UserCard as CardData } from '../../../shared/models';
import { useText } from '../../i18n';
import { Modal } from '../../components/Modal';
export function UserCard({
  message: m,
  close,
  reply,
}: {
  message: ChatMessage;
  close: () => void;
  reply: () => void;
}) {
  const t = useText();
  const dictionary = useApp((s) => s.snapshot.settings.safeChat?.dictionary) ?? [];
  const [duration, setDuration] = useState(600);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<CardData>();
  const [now, setNow] = useState(Date.now());
  const accounts = useApp((s) => s.snapshot.accounts);
  const account = accounts.find((a) => a.id === m.accountId);
  const demo = account?.authStatus === 'demo';
  const active = account?.connectionStatus === 'connected';
  const protectedUser =
    !demo &&
    (m.user.platformUserId === account?.platformAccountId ||
      m.user.roles.some((r) => ['moderator', 'broadcaster'].includes(r)));
  useEffect(() => {
    let cancelled = false;
    setConfirm(false);
    setData(undefined);
    void perform(async () => {
      const result = await backend.getUserCard({
        accountId: m.accountId,
        userId: m.user.platformUserId,
      });
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [m.accountId, m.user.platformUserId, m.metadata?.banned, m.metadata?.timeoutUntil]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeoutUntil = data?.timeoutUntil ?? m.metadata?.timeoutUntil;
  const remaining = timeoutUntil
    ? Math.max(0, Math.ceil((Date.parse(timeoutUntil) - now) / 1000))
    : 0;
  const blocked = data?.banned || m.metadata?.banned || remaining > 0;
  async function moderate(action: ModerationAction) {
    setBusy(true);
    await perform(
      async () => {
        await backend.moderate({
          accountId: m.accountId,
          channelId: m.channelId,
          targetUserId: m.user.platformUserId,
          targetUsername: m.user.username,
          action,
          messageId: m.id,
          duration: action === 'timeout' ? duration : undefined,
          reason,
        });
        setData(
          await backend.getUserCard({ accountId: m.accountId, userId: m.user.platformUserId }),
        );
      },
      t('moderationDone'),
      'moderation',
    );
    setBusy(false);
    setConfirm(false);
  }
  const can = (action: ModerationAction) =>
    active && account?.capabilities[action] && !busy && (action === 'unban' || !protectedUser);
  const profile = data?.profile ?? m.user;
  return (
    <>
      {confirmDelete && (
        <Modal title={t('confirmDelete')} close={() => setConfirmDelete(false)}>
          <p>{t('deleteWarning')}</p>
          <div className="button-row">
            <button onClick={() => setConfirmDelete(false)}>{t('cancel')}</button>
            <button
              className="primary"
              onClick={() => {
                setConfirmDelete(false);
                void moderate('delete');
              }}
            >
              {t('confirmDelete')}
            </button>
          </div>
        </Modal>
      )}
      <div className="panel-title">
        {' '}
        {uiText('releaseText101')}{' '}
        <button className="icon-button" aria-label={uiText('releaseText102')} onClick={close}>
          <X size={16} />
        </button>
      </div>
      <div className="profile-avatar" style={{ color: m.user.color }}>
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          profile.displayName.slice(0, 2).toUpperCase()
        )}
      </div>
      <h3 className="break-word">{profile.displayName}</h3>
      <div className="inline muted">
        <PlatformIcon platform={m.platform} />
        {m.platform}
        {demo ? ' · DEMO' : ''}
      </div>
      <p className="muted small break-word">
        @{profile.username}
        <br />
        ID: {m.user.platformUserId}
      </p>
      <p className="small">{m.user.badges.map((b) => b.label).join(' · ')}</p>
      <div className="stat-grid">
        <div>
          <strong>{data?.user?.message_count ?? '—'}</strong>
          <span>{uiText('releaseText103')}</span>
        </div>
        <div>
          <strong className="small">
            {data?.user ? new Date(data.user.first_seen_at).toLocaleDateString('ru') : '—'}
          </strong>
          <span>{uiText('releaseText104')}</span>
        </div>
      </div>
      <p className="small muted">
        {' '}
        {uiText('releaseText105')}{' '}
        {data?.user ? new Date(data.user.last_seen_at).toLocaleString('ru') : '—'}
      </p>
      {remaining > 0 && (
        <p role="status">
          {uiText('releaseText106')} {remaining} {uiText('releaseText107')}
        </p>
      )}
      <div className="divider" />
      {account?.capabilities.timeout && (
        <>
          <label>
            Timeout
            <select
              aria-label={uiText('releaseText108')}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {[10, 30, 60, 300, 600, 1800, 3600].map((d) => (
                <option key={d} value={d}>
                  {d < 60
                    ? `${d} ${uiText('releaseText107')}`
                    : `${d / 60} ${uiText('minutesShort')}`}
                </option>
              ))}
              {![10, 30, 60, 300, 600, 1800, 3600].includes(duration) && (
                <option value={duration}>
                  {uiText('releaseText109')} {duration} {uiText('releaseText107')}
                </option>
              )}
            </select>
          </label>
          <label>
            {' '}
            {uiText('releaseText110')}{' '}
            <input
              type="number"
              min={1}
              max={1209600}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
        </>
      )}
      <label>
        {' '}
        {uiText('releaseText111')}
        {m.platform === 'youtube' ? uiText('releaseText112') : ''}
        <input
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={uiText('releaseText113')}
        />
      </label>
      <div className="action-stack">
        {account?.capabilities.timeout && (
          <button
            disabled={!can('timeout') || duration < 1 || duration > 1209600}
            onClick={() => void moderate('timeout')}
          >
            {' '}
            {uiText('releaseText114')}{' '}
          </button>
        )}
        {blocked ? (
          <button
            disabled={!can('unban') || !data?.canUnban}
            onClick={() => void moderate('unban')}
          >
            {' '}
            {uiText('releaseText115')}{' '}
          </button>
        ) : (
          account?.capabilities.ban && (
            <button
              className="danger-text"
              disabled={!can('ban')}
              onClick={() => (confirm ? void moderate('ban') : setConfirm(true))}
            >
              {confirm ? uiText('releaseText116') : uiText('releaseText117')}
            </button>
          )
        )}
        {confirm && <button onClick={() => setConfirm(false)}>{uiText('releaseText31')}</button>}
        {account?.capabilities.delete && (
          <button
            disabled={!can('delete')}
            onClick={() => (demo ? void moderate('delete') : setConfirmDelete(true))}
          >
            {' '}
            {uiText('releaseText118')}{' '}
          </button>
        )}
        {account?.capabilities.send && active && !account.readOnlyLink && (
          <button onClick={reply}>{t('reply')}</button>
        )}
        <CopyButton text={m.text} label={uiText('releaseText119')} />
        <CopyButton text={m.user.username} label={uiText('releaseText120')} />
      </div>
      {blocked && !data?.canUnban && <p className="small muted">{data?.banReason}</p>}
      {protectedUser && <p className="small muted">{uiText('releaseText121')}</p>}
      <AnimatedDetails>
        <summary>{uiText('releaseText122')}</summary>
        {data?.history.length ? (
          data.history.slice(0, 10).map((h) => (
            <p className="small" key={h.id}>
              {actionLabel(h.action)} · {new Date(h.createdAt).toLocaleString('ru')} ·{' '}
              {h.success ? uiText('releaseText123') : displayError(h.error)}
              {h.reason && (
                <span className="muted">
                  {' '}
                  · {moderationHistoryReason(h, dictionary, historyLabels())}
                </span>
              )}
            </p>
          ))
        ) : (
          <p>{uiText('releaseText124')}</p>
        )}
      </AnimatedDetails>
      <p className="small muted">{demo ? uiText('releaseText125') : uiText('releaseText126')}</p>
    </>
  );
}
