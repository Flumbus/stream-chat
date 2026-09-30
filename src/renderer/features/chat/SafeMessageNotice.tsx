import { displayError } from '../../i18n';
import { uiText } from '../../i18n';
import { useState } from 'react';
import type { ChatMessage } from '../../../shared/models';
import { messageKey } from '../../../shared/events';
import { backend, perform } from '../../stores/app';
import { Modal } from '../../components/Modal';
export function SafeMessageNotice({ message }: { message: ChatMessage }) {
  const [original, setOriginal] = useState<string | null>(null);
  const info = message.safeChat;
  const display = message.displayPolicy;
  const changed = !!(info?.filtered || display?.command || display?.linksRemoved);
  if (!info && !changed && !display?.hidden) return null;
  return (
    <div className="safe-notice">
      {info && (
        <>
          <span className={`safe-badge ${info.category}`}>
            {info.category === 'blocked' ? uiText('releaseText91') : uiText('releaseText92')}
          </span>
          <span className="safe-action" key={info.status} title={displayError(info.reason)}>
            {info.status === 'success'
              ? `✓ ${info.action === 'timeout' ? `${uiText('releaseText159')} · ${info.duration} ${uiText('releaseText107')}` : info.action === 'delete' ? uiText('releaseText93') : uiText('releaseText94')}`
              : info.status === 'pending'
                ? uiText('releaseText95')
                : displayError(info.reason) ||
                  (info.filtered ? uiText('releaseText96') : uiText('releaseText97'))}
          </span>
        </>
      )}
      {display?.command && <span className="muted">{uiText('releaseText98')}</span>}
      {display?.linksRemoved && <span className="muted">{uiText('releaseText99')}</span>}
      {changed && (
        <button
          onClick={() =>
            void perform(async () =>
              setOriginal(await backend.originalMessage(messageKey(message))),
            )
          }
        >
          {' '}
          {uiText('releaseText79')}{' '}
        </button>
      )}
      {original !== null && (
        <Modal title={uiText('releaseText85')} close={() => setOriginal(null)}>
          <p className="original-message">{original}</p>
          <p className="muted">{uiText('releaseText100')}</p>
        </Modal>
      )}
    </div>
  );
}
