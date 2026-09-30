import { desktopDefaults } from '../../shared/preferences';
import { perform, updateSettings, useApp } from '../stores/app';
import { soundService } from '../services/SoundService';
import { useText } from '../i18n';
export function FeedbackSettings() {
  const t = useText();
  const feedback =
    useApp((s) => s.snapshot.settings.desktop?.feedback) ?? desktopDefaults().feedback;
  const save = (patch: Partial<typeof feedback>) =>
    void perform(() =>
      updateSettings((s) => {
        const desktop = s.desktop ?? desktopDefaults();
        return { ...s, desktop: { ...desktop, feedback: { ...desktop.feedback, ...patch } } };
      }),
    );
  return (
    <section className="card">
      <h3>{t('feedback')}</h3>
      <label className="check-row">
        <span>{t('sounds')}</span>
        <input
          type="checkbox"
          checked={feedback.sounds}
          onChange={(e) => save({ sounds: e.target.checked })}
        />
      </label>
      <label>
        {t('volume')}
        <span className="range-row">
          <input
            aria-label={t('volume')}
            type="range"
            min={0}
            max={100}
            value={Math.round(feedback.volume * 100)}
            onChange={(e) => save({ volume: Number(e.target.value) / 100 })}
          />
          <output>{Math.round(feedback.volume * 100)}%</output>
        </span>
      </label>
      <button onClick={() => void soundService.play('notification', feedback, true)}>
        {t('testSound')}
      </button>
      <p className="muted small">{t('soundHint')}</p>
      <label>
        {t('reduceMotion')}
        <select
          aria-label={t('reduceMotion')}
          value={feedback.reducedMotion}
          onChange={(e) => save({ reducedMotion: e.target.value as typeof feedback.reducedMotion })}
        >
          <option value="system">{t('followSystem')}</option>
          <option value="on">{t('enabled')}</option>
          <option value="off">{t('disabled')}</option>
        </select>
      </label>
    </section>
  );
}
