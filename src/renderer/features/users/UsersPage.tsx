import { historyLabels, actionLabel } from '../../i18n';
import { displayError } from '../../i18n';
import { uiText } from '../../i18n';
import { moderationHistoryReason } from '../../../shared/moderationHistory';
import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { ChatMessage, ModerationRecord, StoredUser } from '../../../shared/models';
import { backend, perform, useApp } from '../../stores/app';
import { ContextMenu, type MenuPosition } from '../../components/ContextMenu';
import { Modal } from '../../components/Modal';
import { UserCard } from '../chat/UserCard';
import { MessageActions } from '../chat/MessageActions';
import { useText } from '../../i18n';
import { PlatformIcon } from '../../components/ChatRenderer';
export function UsersPage({ reply }: { reply: (message: ChatMessage) => void }) {
  const t = useText();
  const dictionary = useApp((s) => s.snapshot.settings.safeChat?.dictionary) ?? [];
  const [menu, setMenu] = useState<{
    user: StoredUser;
    message?: ChatMessage;
    position: MenuPosition;
  } | null>(null);
  const [profile, setProfile] = useState<{ user: StoredUser; message?: ChatMessage } | null>(null);
  const context = (user: StoredUser, x: number, y: number) => {
    const message = useApp
      .getState()
      .snapshot.messages.findLast(
        (m) =>
          m.platform === user.platform &&
          m.user.platformUserId === user.platform_user_id &&
          (m.source ?? (m.accountId.startsWith('mock-') ? 'mock' : 'live')) === user.source,
      );
    setMenu({ user, message, position: { x, y } });
  };
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [history, setHistory] = useState<ModerationRecord[]>([]);
  const [tab, setTab] = useState('users');
  const [query, setQuery] = useState('');
  const reload = () =>
    perform(async () => {
      const [u, h] = await Promise.all([backend.getUsers(), backend.getModerationHistory()]);
      setUsers(u);
      setHistory(h);
    });
  useEffect(() => {
    void reload();
  }, []);
  return (
    <div className="page">
      {menu &&
        (menu.message ? (
          <MessageActions
            target={{ message: menu.message, position: menu.position }}
            close={() => setMenu(null)}
            openUser={(m) => setProfile({ user: menu.user, message: m })}
            reply={reply}
          />
        ) : (
          <ContextMenu
            position={menu.position}
            close={() => setMenu(null)}
            items={[
              { label: t('openUser'), action: () => setProfile(menu) },
              {
                label: t('copyName'),
                copyText: menu.user.username,
              },
            ]}
          />
        ))}
      {profile && (
        <Modal title={t('openUser')} close={() => setProfile(null)}>
          {profile.message ? (
            <UserCard
              message={profile.message}
              close={() => setProfile(null)}
              reply={() => {
                reply(profile.message!);
                setProfile(null);
              }}
            />
          ) : (
            <>
              <h3>{profile.user.display_name}</h3>
              <p>
                {profile.user.platform} · @{profile.user.username}
              </p>
              <p>
                {profile.user.message_count} {uiText('releaseText103')}
              </p>
            </>
          )}
        </Modal>
      )}
      <div className="page-heading">
        <div>
          <div className="eyebrow">{uiText('releaseText177')}</div>
          <h1>{uiText('releaseText178')}</h1>
          <p>{uiText('releaseText179')}</p>
        </div>
        <button onClick={() => void reload()}>
          <RefreshCw size={15} /> {uiText('releaseText180')}{' '}
        </button>
      </div>
      <div className="filter-bar">
        <div className="tabs">
          <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
            {' '}
            {uiText('releaseText181')} {users.length}
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            {' '}
            {uiText('releaseText182')} {history.length}
          </button>
        </div>
        <div className="search">
          <Search size={15} />
          <input
            aria-label={uiText('releaseText183')}
            placeholder={uiText('releaseText184')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            {tab === 'users' ? (
              <tr>
                <th>{uiText('releaseText185')}</th>
                <th>{uiText('releaseText186')}</th>
                <th>{uiText('releaseText57')}</th>
                <th>{uiText('releaseText187')}</th>
                <th>{uiText('releaseText188')}</th>
              </tr>
            ) : (
              <tr>
                <th>{uiText('releaseText185')}</th>
                <th>{uiText('releaseText189')}</th>
                <th>{uiText('releaseText111')}</th>
                <th>{uiText('releaseText190')}</th>
                <th>{uiText('releaseText191')}</th>
              </tr>
            )}
          </thead>
          <tbody>
            {tab === 'users'
              ? users
                  .filter((u) => u.display_name.toLowerCase().includes(query.toLowerCase()))
                  .map((u) => (
                    <tr
                      key={u.id}
                      tabIndex={0}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        context(u, e.clientX, e.clientY);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                          e.preventDefault();
                          const r = e.currentTarget.getBoundingClientRect();
                          context(u, r.left + 20, r.top + 20);
                        }
                      }}
                    >
                      <td>
                        <b>{u.display_name}</b>
                        <small>{u.platform_user_id}</small>
                      </td>
                      <td>
                        <span className="inline">
                          <PlatformIcon platform={u.platform} />
                          {u.platform}
                          {u.source === 'mock' && <span className="badge">DEMO</span>}
                        </span>
                      </td>
                      <td>{u.message_count}</td>
                      <td>{new Date(u.first_seen_at).toLocaleString('ru')}</td>
                      <td>{new Date(u.last_seen_at).toLocaleString('ru')}</td>
                    </tr>
                  ))
              : history
                  .filter((h) => h.targetUsername.toLowerCase().includes(query.toLowerCase()))
                  .map((h) => (
                    <tr key={h.id}>
                      <td>{h.targetUsername}</td>
                      <td>
                        {actionLabel(h.action)}
                        {h.duration ? ` · ${h.duration} ${uiText('releaseText107')}` : ''}
                      </td>
                      <td>{moderationHistoryReason(h, dictionary, historyLabels())}</td>
                      <td>{new Date(h.createdAt).toLocaleString('ru')}</td>
                      <td>
                        {h.success
                          ? `${uiText('doneLabel')}${h.accountId.startsWith('mock-') ? ' · demo' : ''}`
                          : displayError(h.error)}
                      </td>
                    </tr>
                  ))}
          </tbody>
        </table>
        {!(tab === 'users' ? users.length : history.length) && (
          <div className="empty">
            {' '}
            {uiText('releaseText192')}
            <span>{uiText('releaseText193')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
