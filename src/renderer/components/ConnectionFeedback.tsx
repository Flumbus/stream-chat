import { Check, LoaderCircle, AlertCircle } from 'lucide-react';
import type { ConnectionStatus } from '../../shared/models';
export function ConnectionFeedback({ status }: { status: ConnectionStatus }) {
  const pending = ['connecting', 'reconnecting', 'authorizing'].includes(status);
  return (
    <span
      key={status}
      className={`connection-feedback state-${status}`}
      data-status={status}
      aria-hidden="true"
    >
      {pending ? (
        <LoaderCircle className="motion-spinner" size={14} />
      ) : status === 'connected' ? (
        <Check size={14} />
      ) : status === 'error' ? (
        <AlertCircle size={14} />
      ) : (
        <i className="offline-dot" />
      )}
    </span>
  );
}
