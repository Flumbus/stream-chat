import { uiText } from '../../i18n';
import { SafeChatEngine, safeChatDefaults } from '../../../shared/safeChat';
import { motion, useReducedMotion } from '../../motion';
import { CopyButton } from '../../components/CopyButton';
import { MovingIndicator } from '../../components/MovingIndicator';
import { AnimatedDetails } from '../../components/AnimatedDetails';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, Monitor, Check } from 'lucide-react';
import { OverlayRenderer } from '../../components/OverlayRenderer';
import { backend, perform, useApp } from '../../stores/app';
import { AppearanceControls, AppearanceRange } from './AppearanceControls';
import { themes } from '../../../shared/themes';
import type { ChatProfile, ChatTheme } from '../../../shared/models';
import { createPreviewMessages } from './previewMessages';
import { featureEnabled } from '../../../shared/preferences';
import { useText, presetTextKey } from '../../i18n';
import { PresetPreview } from './PresetPreview';
import { NicknameControls } from './NicknameControls';
export function OverlaysPage() {
  const t = useText();
  const preview = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const technical = useApp((s) => featureEnabled(s.snapshot.settings, 'serverSettings'));
  const [showObs, setShowObs] = useState(false);
  const profiles = useApp((s) => s.snapshot.profiles);
  const messages = useApp((s) => s.snapshot.messages);
  const safetySettings = useApp((s) => s.snapshot.settings.safeChat);
  const experimental = useApp((s) => s.snapshot.settings.desktop?.experimental.enabled);
  const safety = useMemo(() => {
    const engine = new SafeChatEngine();
    const settings = safetySettings ?? safeChatDefaults();
    engine.configure({
      ...settings,
      kindMode: { ...settings.kindMode, enabled: settings.kindMode.enabled && !!experimental },
    });
    return engine;
  }, [safetySettings, experimental]);
  const [draft, setDraft] = useState<ChatProfile>(
    profiles[0] ?? { id: 'default', name: 'Default', theme: themes[0] },
  );
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const animation = preview.current?.animate([{ opacity: 0.75 }, { opacity: 1 }], {
      duration: motion.fast,
    });
    return () => animation?.cancel();
  }, [draft.theme, reduced]);
  const examples = useMemo(
    () => createPreviewMessages(draft.theme.platforms),
    [draft.theme.platforms],
  );
  const showingExamples = messages.length === 0;
  // Examples remain visible while editing, even when message lifetime is enabled.
  const previewTheme = useMemo(
    () => (showingExamples ? { ...draft.theme, lifetime: 0 } : draft.theme),
    [draft.theme, showingExamples],
  );
  const [url, setUrl] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(profiles.find((p) => p.id === draft.id));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1400);
    return () => clearTimeout(timer);
  }, [saved]);
  const server = useApp((s) => s.snapshot.overlay);
  useEffect(() => {
    setUrl('');

    if (profiles.some((p) => p.id === draft.id) && server?.running)
      void perform(async () => setUrl(await backend.overlayUrl(draft.id)));
  }, [draft.id, profiles, server?.port, server?.running]);
  const update = <K extends keyof ChatTheme>(key: K, value: ChatTheme[K]) => {
    setDraft({ ...draft, theme: { ...draft.theme, [key]: value } });
    setSaved(false);
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t('visualStyle')}</div>
          <h1>{t('chatAppearance')}</h1>
          <p>{t('appearanceHint')}</p>
        </div>
        <button
          className="primary"
          data-dirty={dirty}
          disabled={saving || (!dirty && !saved)}
          onClick={() =>
            void perform(async () => {
              setSaving(true);
              try {
                await backend.saveProfile(draft);
                setSaved(true);
              } finally {
                setSaving(false);
              }
            })
          }
        >
          <span key={String(saved)} className="icon-morph">
            {saved ? <Check size={16} /> : <Save size={16} />}
          </span>
          {dirty && (
            <span className="dirty-dot" aria-hidden="true" title={uiText('releaseText127')} />
          )}
          {t(saved ? 'saved' : 'saveProfile')}
        </button>
      </div>
      <div className="profile-tabs moving-tabs">
        <MovingIndicator selected={draft.id} />
        {profiles.map((p) => (
          <button
            key={p.id}
            data-selected={p.id === draft.id}
            className={p.id === draft.id ? 'selected' : ''}
            onClick={() => {
              setDraft(p);
              setSaved(false);
            }}
          >
            {p.name}
          </button>
        ))}
        <button
          onClick={() => {
            setDraft({
              id: crypto.randomUUID(),
              name: `${t('profile')} ${profiles.length + 1}`,
              theme: { ...themes[0] },
            });
            setSaved(false);
          }}
        >
          <Plus size={15} />
          {t('newProfile')}
        </button>
      </div>
      <div className="designer">
        <div className="designer-controls">
          <label>
            {t('profileName')}
            <input
              aria-label={t('profileName')}
              maxLength={80}
              value={draft.name}
              onChange={(e) => {
                setDraft({ ...draft, name: e.target.value });
                setSaved(false);
              }}
            />
          </label>
          <h3>{t('baseStyle')}</h3>
          <div className="theme-grid">
            {themes.map((preset) => (
              <button
                aria-label={t(presetTextKey(preset.id))}
                key={preset.id}
                className={draft.theme.id === preset.id ? 'selected' : ''}
                onClick={() => {
                  setDraft({ ...draft, theme: { ...preset } });
                  setSaved(false);
                }}
              >
                <PresetPreview theme={preset} />
                {t(presetTextKey(preset.id))}
              </button>
            ))}
          </div>
          <NicknameControls
            value={draft.theme.nicknameColors}
            onChange={(value) => update('nicknameColors', value)}
          />
          <AppearanceControls
            theme={draft.theme}
            onChange={(theme) => {
              setDraft({ ...draft, theme });
              setSaved(false);
            }}
          />
          <AnimatedDetails className="appearance-advanced appearance-colors">
            <summary>{t('colorsBackground')}</summary>
            <div className="appearance-advanced-body">
              <div className="color-row">
                <label>
                  {t('background')}
                  <input
                    type="color"
                    value={draft.theme.background}
                    onChange={(e) => update('background', e.target.value)}
                  />
                </label>
                <label>
                  {t('text')}
                  <input
                    type="color"
                    value={draft.theme.textColor}
                    onChange={(e) => update('textColor', e.target.value)}
                  />
                </label>
              </div>
              <AppearanceRange
                label={t('opacity')}
                value={draft.theme.opacity}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => update('opacity', v)}
              />
              <label>
                {t('messageBackground')}
                <input
                  type="color"
                  value={draft.theme.messageBackground ?? '#293135'}
                  onChange={(e) => update('messageBackground', e.target.value)}
                />
              </label>
            </div>
          </AnimatedDetails>
        </div>
        <div className="preview-panel">
          <div className="preview-heading">
            <span className="inline">
              <Monitor size={15} />
              {t('livePreview')}
            </span>
            <span className="badge">{showingExamples ? t('exampleMessages') : 'OBS'}</span>
          </div>
          <div
            ref={preview}
            className={`preview-canvas${showingExamples ? ' preview-examples' : ''}`}
          >
            <OverlayRenderer
              messages={showingExamples ? examples.map((m) => safety.display(m)) : messages}
              theme={previewTheme}
            />
          </div>
          <p className="preview-caption">{t('previewHint')}</p>
          <div className="overlay-info">
            <h3>{t(server?.running ? 'obsReady' : 'obsUnavailable')}</h3>
            <button
              className="primary"
              aria-expanded={showObs}
              onClick={() => setShowObs(!showObs)}
            >
              {t('obsAdd')}
            </button>
            {showObs && (
              <>
                <p>{t('obsInstructions')}</p>
                {url ? (
                  <>
                    <input aria-label="Browser Source URL" readOnly value={url} />
                    <div className="button-row">
                      <CopyButton text={url} label={t('copyLink')} />
                      <button onClick={() => void perform(() => backend.openOverlay(draft.id))}>
                        {t('openPreview')}
                      </button>
                      {technical && (
                        <button onClick={() => void perform(() => backend.resetOverlay(draft.id))}>
                          {t('resetOverlay')}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p>{server?.error ?? t('saveForUrl')}</p>
                )}
                <span className="badge">{t('recommendedSize')} · 500 × 900</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
