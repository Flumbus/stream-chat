import { useEffect, useState } from 'react';
import type { UpdateState, UpdateAction, UpdateError } from '../../shared/updater';
import { useText } from '../i18n';
import { perform, updateSettings, useApp } from '../stores/app';
const errorText = {
  UPDATE_FAILED: 'updateError',
  UPDATE_NOT_PUBLISHED: 'updateNotPublished',
  UPDATE_RELEASE_INCOMPLETE: 'updateReleaseIncomplete',
  UPDATE_INVALID_RELEASE: 'updateInvalidRelease',
  UPDATE_NETWORK_ERROR: 'updateNetworkError',
  UPDATE_INSTALL_FAILED: 'updateInstallError',
} as const satisfies Record<UpdateError, string>;
export function UpdateStatus() {
  const t = useText();
  const [state, setState] = useState<UpdateState>();
  const auto = useApp((s) => s.snapshot.settings.autoDownloadUpdates ?? true);
  useEffect(() => {
    const off = window.desktop.onUpdateState(setState);
    void window.desktop.updateState().then(setState);
    return off;
  }, []);
  const action = (value: UpdateAction) => void perform(() => window.desktop.updateAction(value));
  return (
    <section className="card update-settings">
      <h3>{t('updates')}</h3>
      <p>
        {t('installedVersion')}: {state?.installedVersion ?? '—'}
      </p>
      <p role="status">
        {state?.enabled
          ? t(
              (
                {
                  idle: 'updateIdle',
                  checking: 'updateChecking',
                  'update-available': 'updateAvailable',
                  downloading: 'updateDownloading',
                  downloaded: 'updateReady',
                  'up-to-date': 'updateCurrent',
                  error: errorText[state.error ?? 'UPDATE_FAILED'],
                } as const
              )[state.phase],
            )
          : t('updateDisabled')}
      </p>
      {state?.availableVersion && (
        <p>
          {t('availableVersion')}: {state.availableVersion}
        </p>
      )}
      {state?.phase === 'downloading' && (
        <progress max={100} value={state.progress ?? 0} aria-label={t('updateDownloading')} />
      )}
      <div className="button-row">
        <button
          disabled={
            !state?.enabled || ['checking', 'downloading', 'downloaded'].includes(state.phase)
          }
          onClick={() => action('check')}
        >
          {t('checkUpdates')}
        </button>
        {state?.phase === 'update-available' && (
          <button onClick={() => action('download')}>{t('downloadUpdate')}</button>
        )}
        {state?.phase === 'downloaded' && (
          <button className="primary" onClick={() => action('install')}>
            {t('installUpdate')}
          </button>
        )}
      </div>
      <label className="toggle">
        <span>{t('autoUpdates')}</span>
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) =>
            void perform(() =>
              updateSettings((s) => ({ ...s, autoDownloadUpdates: e.target.checked })),
            )
          }
        />
      </label>
    </section>
  );
}
