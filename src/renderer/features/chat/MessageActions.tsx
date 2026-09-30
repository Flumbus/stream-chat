import { uiText, localizeLabel } from '../../i18n';
import { messageKey } from '../../../shared/events';
import { safeChatDefaults, type DictionaryEntry } from '../../../shared/safeChat';
import { changeSafety, categoryLabel } from '../settings/SafeChatSettings';
import { useEffect, useState } from 'react';
import type { ChatMessage, ModerationAction, UserCard } from '../../../shared/models';
import { deleteUnavailableReason, moderationAccess } from '../../../shared/moderationAccess';
import { backend, perform, useApp } from '../../stores/app';
import { useText } from '../../i18n';
import { ContextMenu, type MenuItem, type MenuPosition } from '../../components/ContextMenu';
import { Modal } from '../../components/Modal';
export interface MessageTarget {
  message: ChatMessage;
  position: MenuPosition;
}
export function MessageActions({
  target,
  close,
  openUser,
  reply,
}: {
  target: MessageTarget;
  close: () => void;
  openUser: (m: ChatMessage) => void;
  reply: (m: ChatMessage) => void;
}) {
  const t = useText();
  const dictionary =
    useApp((s) => s.snapshot.settings.safeChat?.dictionary) ?? safeChatDefaults().dictionary;
  const [original, setOriginal] = useState<string | null>(null);
  const [dictionaryDialog, setDictionaryDialog] = useState(false);
  const [word, setWord] = useState('');
  const [category, setCategory] = useState<DictionaryEntry['category']>('blocked');
  const account = useApp((s) => s.snapshot.accounts.find((a) => a.id === target.message.accountId));
  const [card, setCard] = useState<UserCard>();
  const [dialog, setDialog] = useState<'ban' | 'timeout' | 'delete' | null>(null);
  const [duration, setDuration] = useState(600);
  const liveMessage = useApp((s) => s.snapshot.messages.find((m) => m.id === target.message.id));
  const m = liveMessage ?? target.message;
  useEffect(() => {
    let cancelled = false;
    setCard(undefined);
    void backend
      .getUserCard({ accountId: m.accountId, userId: m.user.platformUserId })
      .then((c) => {
        if (!cancelled) setCard(c);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [m.accountId, m.user.platformUserId, m.metadata?.banned, m.metadata?.timeoutUntil]);
  const can = moderationAccess(m, account, card);
  const deleteReason = deleteUnavailableReason(m, account);
  const deleteHint = deleteReason
    ? t(
        {
          readOnly: 'deleteReadOnly',
          offline: 'deleteOffline',
          permission: 'deletePermission',
          protectedUser: 'deleteProtected',
        }[deleteReason] as
          'deleteReadOnly' | 'deleteOffline' | 'deletePermission' | 'deleteProtected',
      )
    : undefined;
  const moderate = (action: ModerationAction, seconds?: number) => {
    close();
    void perform(
      () =>
        backend.moderate({
          accountId: m.accountId,
          channelId: m.channelId,
          targetUserId: m.user.platformUserId,
          targetUsername: m.user.username,
          action,
          messageId: m.id,
          duration: seconds,
        }),
      t('moderationDone'),
      'moderation',
    );
  };
  const items: MenuItem[] = [
    ...(can.reply ? [{ label: t('reply'), action: () => reply(m) }] : []),
    {
      label: t('copyText'),
      copyText: m.text,
    },
    {
      label: t('copyName'),
      copyText: m.user.username,
    },
    {
      label: t('deleteMessage'),
      disabled: !can.delete,
      description: deleteHint,
      keepOpen: account?.authStatus !== 'demo',
      action: () => (account?.authStatus === 'demo' ? moderate('delete') : setDialog('delete')),
    },
    ...(can.timeout
      ? [
          {
            label: t('timeout'),
            children: [
              ...[10, 60, 300, 600, 1800, 3600].map((n) => ({
                label: n < 60 ? `${n} ${t('seconds')}` : `${n / 60} ${t('minutes')}`,
                action: () => moderate('timeout', n),
              })),
              { label: t('customTime'), keepOpen: true, action: () => setDialog('timeout') },
            ],
          },
        ]
      : []),
    ...(can.ban
      ? [{ label: t('ban'), danger: true, keepOpen: true, action: () => setDialog('ban') }]
      : []),
    ...(can.unban ? [{ label: t('unban'), action: () => moderate('unban') }] : []),
    { label: t('openUser'), action: () => openUser(m) },
    ...(m.displayPolicy?.linksRemoved
      ? [
          {
            label: uiText('releaseText78'),
            action: () =>
              void changeSafety((s) => ({
                ...s,
                trustedUsers: [
                  ...s.trustedUsers.filter(
                    (u) => !(u.platform === m.platform && u.userId === m.user.platformUserId),
                  ),
                  {
                    platform: m.platform,
                    userId: m.user.platformUserId,
                    label: m.user.displayName,
                  },
                ],
              })),
          },
        ]
      : []),
    ...(m.safeChat?.filtered || m.displayPolicy?.command || m.displayPolicy?.linksRemoved
      ? [
          {
            label: uiText('releaseText79'),
            keepOpen: true,
            action: () =>
              void perform(async () => setOriginal(await backend.originalMessage(messageKey(m)))),
          },
        ]
      : []),
    {
      label: uiText('releaseText80'),
      keepOpen: true,
      action: () => {
        setWord('');
        setCategory('blocked');
        setDictionaryDialog(true);
      },
    },
    ...(m.safeChat
      ? [
          {
            label: uiText('releaseText81'),
            children: m.safeChat.ruleIds.flatMap((id) => {
              const rule = dictionary.find((r) => r.id === id);
              return rule
                ? [
                    {
                      label: `${uiText('moveException')}: ${rule.text}`,
                      action: () =>
                        void changeSafety((s) => ({
                          ...s,
                          dictionary: s.dictionary.map((r) =>
                            r.id === id ? { ...r, category: 'exception' } : r,
                          ),
                        })),
                    },
                    {
                      label: `${rule.category === 'soft' ? uiText('releaseText82') : uiText('releaseText83')}: ${rule.text}`,
                      action: () =>
                        void changeSafety((s) => ({
                          ...s,
                          dictionary: s.dictionary.map((r) =>
                            r.id === id
                              ? { ...r, category: rule.category === 'soft' ? 'blocked' : 'soft' }
                              : r,
                          ),
                        })),
                    },
                  ]
                : [];
            }),
          },
        ]
      : [
          {
            label: uiText('releaseText84'),
            keepOpen: true,
            action: () => {
              setWord('');
              setCategory('exception');
              setDictionaryDialog(true);
            },
          },
        ]),
  ];
  if (original !== null)
    return (
      <Modal title={uiText('releaseText85')} close={close}>
        <p className="original-message">{original}</p>
        <p className="muted">{uiText('releaseText86')}</p>
      </Modal>
    );
  if (dictionaryDialog)
    return (
      <Modal title={uiText('releaseText87')} close={close}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (word.trim().length < 2) return;
            void changeSafety((s) => ({
              ...s,
              dictionary: [
                ...s.dictionary,
                { id: crypto.randomUUID(), text: word.trim(), category },
              ],
            })).then(close);
          }}
        >
          <label>
            {' '}
            {uiText('releaseText88')}{' '}
            <input
              autoFocus
              maxLength={100}
              value={word}
              onChange={(e) => setWord(e.target.value)}
            />
          </label>
          <label>
            {' '}
            {uiText('releaseText89')}{' '}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              {Object.entries(categoryLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {localizeLabel(label)}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={word.trim().length < 2}>
            {' '}
            {uiText('releaseText90')}{' '}
          </button>
        </form>
      </Modal>
    );
  return dialog ? (
    <Modal
      title={t(
        dialog === 'ban' ? 'confirmBan' : dialog === 'delete' ? 'confirmDelete' : 'customTime',
      )}
      close={close}
    >
      {dialog !== 'timeout' ? (
        <p>
          {t(dialog === 'ban' ? 'banWarning' : 'deleteWarning')} <b>{m.user.displayName}</b>
        </p>
      ) : (
        <label>
          {t('durationSeconds')}
          <input
            type="number"
            min={1}
            max={1209600}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </label>
      )}
      <div className="button-row">
        <button onClick={close}>{t('cancel')}</button>
        <button
          className="primary"
          disabled={
            dialog === 'timeout' &&
            (!Number.isInteger(duration) || duration < 1 || duration > 1209600)
          }
          onClick={() => moderate(dialog, dialog === 'timeout' ? duration : undefined)}
        >
          {t(dialog === 'ban' ? 'confirmBan' : dialog === 'delete' ? 'confirmDelete' : 'apply')}
        </button>
      </div>
    </Modal>
  ) : (
    <ContextMenu
      position={target.position}
      items={items}
      close={close}
      caption={`${m.user.displayName} · ${account?.channel?.title ?? account?.displayName ?? m.platform}`}
    />
  );
}
