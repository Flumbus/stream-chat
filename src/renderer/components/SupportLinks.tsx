import { perform } from '../stores/app';
import { useText } from '../i18n';
export function SupportLinks() {
  const t = useText();
  return (
    <div className="support-links">
      <button
        className="support-button support-boosty"
        title={t('supportBoosty')}
        onClick={() => void perform(() => window.desktop.openExternal('boosty'))}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          <path fill="currentColor" d="M8 2h7L9 13h5l-2 9H5l2-8H3z" />
          <path fill="currentColor" d="M16 7h3c4 0 3 6 0 8l-5 4 2-7h-3z" />
        </svg>
        <span>{t('supportBoosty')}</span>
      </button>
      <button
        className="support-button support-donation"
        title={t('supportDonation')}
        onClick={() => void perform(() => window.desktop.openExternal('donationAlerts'))}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          <path d="M3 3h18v13H10l-5 5v-5H3z" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="M12 6v5m0 2v1" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span>{t('supportDonation')}</span>
      </button>
    </div>
  );
}
