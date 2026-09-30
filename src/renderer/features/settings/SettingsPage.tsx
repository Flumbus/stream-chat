import { UpdateStatus } from '../../components/UpdateStatus';
import { SafeChatSettings } from './SafeChatSettings';
import { AnimatedDetails } from '../../components/AnimatedDetails';
import { FolderOpen, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { backend, perform, updateSettings, useApp } from '../../stores/app';
import { desktopDefaults, featureEnabled } from '../../../shared/preferences';
import { useText } from '../../i18n';
import type { DemoScenario } from '../../../shared/models';
import { FeedbackSettings } from '../../components/FeedbackSettings';
import { useShallow } from 'zustand/react/shallow';
export function SettingsPage({ developerOnly = false }: { developerOnly?: boolean }) {
  const snapshot = useApp(
    useShallow(({ snapshot: s }) => ({
      settings: s.settings,
      overlay: s.overlay,
      databasePath: s.databasePath,
      running: s.running,
      accounts: s.accounts,
    })),
  );
  const settings = snapshot.settings;
  const t = useText();
  const desktop = settings.desktop ?? desktopDefaults();
  const [port, setPort] = useState(settings.overlayPort ?? 17832);
  const save = (patch: Partial<typeof settings>) =>
    void perform(() => updateSettings((s) => ({ ...s, ...patch })));
  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t('yourRhythm')}</div>
          <h1>{t(developerOnly ? 'developerTools' : 'settings')}</h1>
          <p>{t('preferencesHint')}</p>
        </div>
      </div>
      <div className="settings-columns">
        {!developerOnly && (
          <>
            <section className="card settings-section">
              <h3>{t('appearanceSettings')}</h3>
              <label>
                {t('language')}
                <select
                  aria-label={t('language')}
                  value={desktop.locale}
                  onChange={(e) =>
                    save({ desktop: { ...desktop, locale: e.target.value as 'ru' | 'en' } })
                  }
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                {t('appTheme')}
                <select
                  aria-label={t('appTheme')}
                  value={settings.theme}
                  onChange={(e) => save({ theme: e.target.value as typeof settings.theme })}
                >
                  <option value="dark">{t('dark')}</option>
                  <option value="light">{t('light')}</option>
                  <option value="system">{t('system')}</option>
                </select>
              </label>
              <label>
                {t('accent')}
                <input
                  aria-label={t('accent')}
                  type="color"
                  value={settings.accent}
                  onChange={(e) => save({ accent: e.target.value })}
                />
              </label>
              <label>
                {t('scale')}
                <select
                  aria-label={t('scale')}
                  value={settings.uiScale}
                  onChange={(e) => save({ uiScale: Number(e.target.value) })}
                >
                  {[80, 100, 125, 150].map((n) => (
                    <option key={n} value={n}>
                      {n}%
                    </option>
                  ))}
                </select>
              </label>
            </section>
            <FeedbackSettings />
            <SafeChatSettings />
            <UpdateStatus />
          </>
        )}
        {developerOnly && (
          <section className="card">
            <h3>{t(snapshot.overlay?.running ? 'obsReady' : 'obsUnavailable')}</h3>
            <p>{t('obsSettingsHint')}</p>
            {featureEnabled(settings, 'serverSettings') && (
              <AnimatedDetails>
                <summary>{t('details')}</summary>
                <p>
                  {snapshot.overlay?.running
                    ? `127.0.0.1:${snapshot.overlay.port} · ${snapshot.overlay.clients} ${t('clients')}`
                    : (snapshot.overlay?.error ?? t('serverStopped'))}
                </p>
                <label>
                  {t('preferredPort')}
                  <input
                    aria-label={t('overlayPort')}
                    type="number"
                    min={1024}
                    max={65535}
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                  />
                </label>
                <button
                  disabled={port < 1024 || port > 65535}
                  onClick={() => save({ overlayPort: port })}
                >
                  {t('applyPort')}
                </button>
              </AnimatedDetails>
            )}
            {featureEnabled(settings, 'diagnostics') && (
              <>
                <h3>{t('localData')}</h3>
                <code className="path">{snapshot.databasePath}</code>
                <p className="small muted">{t('localDataHint')}</p>
                <button onClick={() => void perform(() => backend.openLogs())}>
                  <FolderOpen size={16} />
                  {t('openLogs')}
                </button>
              </>
            )}
          </section>
        )}
        {!developerOnly && (
          <section className="card experimental-card">
            <h3>{t('experimental')}</h3>
            <label className="check-row">
              <span>{t('experimentalOn')}</span>
              <input
                type="checkbox"
                aria-label={t('experimentalOn')}
                checked={desktop.experimental.enabled}
                onChange={(e) =>
                  save({
                    desktop: {
                      ...desktop,
                      experimental: { ...desktop.experimental, enabled: e.target.checked },
                    },
                  })
                }
              />
            </label>
            <p className="muted">{t('experimentalHint')}</p>
          </section>
        )}
        {developerOnly && featureEnabled(settings, 'developerTools') && (
          <section className="card developer-card">
            <div className="inline">
              <FlaskConical size={18} />
              <h3>{t('developerMode')}</h3>
              <span className="badge">{t('localOnly')}</span>
            </div>
            <label className="check-row">
              <span>{t('demoPlatforms')}</span>
              <input
                aria-label={t('developerMode')}
                type="checkbox"
                checked={settings.developerMode}
                onChange={(e) => save({ developerMode: e.target.checked })}
              />
            </label>
            <p className="muted">{t('demoHint')}</p>
            <button
              disabled={!settings.developerMode}
              className="primary"
              onClick={() => void perform(() => backend.setRunning(!snapshot.running))}
            >
              {t(snapshot.running ? 'stopDemo' : 'startDemo')}
            </button>
            <div className="generator-grid">
              {(
                [
                  'message',
                  'member',
                  'donation',
                  'long',
                  'emotes',
                  'moderator',
                  'banned',
                ] as DemoScenario[]
              ).map((scenario, i) => (
                <div key={scenario}>
                  <span>
                    {
                      [
                        t('message'),
                        t('subscriber'),
                        'Super Chat',
                        t('longName'),
                        'Emotes',
                        t('moderator'),
                        t('bannedViewer'),
                      ][i]
                    }
                  </span>
                  <button
                    disabled={!snapshot.running}
                    onClick={() => void perform(() => backend.generate('twitch', scenario, 1))}
                  >
                    Twitch
                  </button>
                  <button
                    disabled={!snapshot.running}
                    onClick={() => void perform(() => backend.generate('youtube', scenario, 1))}
                  >
                    YouTube
                  </button>
                </div>
              ))}
            </div>
            <button
              disabled={!snapshot.running}
              onClick={() => void perform(() => backend.generate('twitch', 'message', 1000))}
            >
              {t('loadTest')}
            </button>
            {settings.developerMode && (
              <AnimatedDetails className="diagnostics">
                <summary>{t('diagnostics')}</summary>
                <p>
                  Overlay: {snapshot.overlay?.port ?? '—'} · OBS clients:{' '}
                  {snapshot.overlay?.clients ?? 0}
                </p>
                {snapshot.accounts.map((a) => (
                  <div key={a.id}>
                    <b>
                      {a.platform} · {a.displayName}
                    </b>
                    <p>
                      {a.connectionStatus} / {a.authStatus}
                      <br />
                      {a.transportState ?? 'Mock transport'}
                      <br />
                      {t('lastReconnect')}: {a.lastReconnectAt ?? '—'}
                      <br />
                      {t('error')}: {a.lastError ?? t('noError')} ({a.errorCode ?? '—'})
                    </p>
                  </div>
                ))}
              </AnimatedDetails>
            )}
          </section>
        )}
      </div>
      {featureEnabled(settings, 'diagnostics') && (
        <p className="muted small">{t('futureDesktop')}</p>
      )}
    </div>
  );
}
