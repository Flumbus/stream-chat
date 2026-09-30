import { AnimatedDetails } from '../../components/AnimatedDetails';
import type { AutoValue, ChatAppearance, ChatTheme } from '../../../shared/models';
import { FontControl } from '../../components/FontPicker';
import { useText } from '../../i18n';
import {
  normalizeAppearance,
  resetPreciseAppearance,
  resolveAppearance,
} from '../../../shared/chatAppearance';

function Segments<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="appearance-segments" role="group" aria-label={label}>
      {options.map(([key, title]) => (
        <button
          type="button"
          key={key}
          aria-pressed={value === key}
          className={value === key ? 'selected' : ''}
          onClick={() => onChange(key)}
        >
          {title}
        </button>
      ))}
    </div>
  );
}
export function AppearanceRange({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="appearance-range">
      {label}
      <span className="range-row">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output>
          {value}
          {unit && ` ${unit}`}
        </output>
      </span>
    </label>
  );
}
function AutoControl({
  label,
  setting,
  computed,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  hint,
}: {
  label: string;
  setting: AutoValue<number>;
  computed: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: AutoValue<number>) => void;
  hint?: string;
}) {
  const t = useText();
  return (
    <div className="appearance-auto">
      <div className="appearance-auto-heading">
        <span>{label}</span>
        <output>
          {setting.mode === 'auto'
            ? `${t('auto')} · ${computed}${unit ? ` ${unit}` : ''}`
            : t('manual')}
        </output>
      </div>
      <Segments
        label={`${label}: ${t('mode')}`}
        value={setting.mode}
        options={[
          ['auto', t('auto')],
          ['manual', t('manual')],
        ]}
        onChange={(mode) =>
          onChange(
            mode === 'auto' ? { mode } : { mode, value: Math.min(max, Math.max(min, computed)) },
          )
        }
      />
      {setting.mode === 'manual' && (
        <AppearanceRange
          label={label}
          value={setting.value}
          min={min}
          max={Math.max(max, setting.value)}
          step={step}
          unit={unit}
          onChange={(value) => onChange({ mode: 'manual', value })}
        />
      )}
      {hint && <p className="appearance-hint">{hint}</p>}
    </div>
  );
}
export function AppearanceControls({
  theme,
  onChange,
}: {
  theme: ChatTheme;
  onChange: (theme: ChatTheme) => void;
}) {
  const t = useText();
  const appearance = normalizeAppearance(theme).appearance;
  const computed = resolveAppearance(theme);
  const update = <K extends keyof ChatTheme>(key: K, value: ChatTheme[K]) =>
    onChange({ ...theme, [key]: value });
  const precise = <K extends keyof ChatAppearance>(key: K, value: ChatAppearance[K]) =>
    update('appearance', { ...appearance, [key]: value });
  return (
    <>
      <h3>{t('display')}</h3>
      <FontControl value={theme.fontFamily} onChange={(font) => update('fontFamily', font)} />
      <div className="appearance-toggles">
        {(
          [
            ['showAvatar', t('avatars')],
            ['showBadges', t('badges')],
            ['showPlatformIcon', t('platformIcon')],
            ['showTimestamps', t('timestamps')],
            ['hideBots', t('hideBots')],
          ] as const
        ).map(([key, label]) => (
          <label className="check-row" key={key}>
            <span>{label}</span>
            <input
              type="checkbox"
              checked={theme[key]}
              onChange={(e) => update(key, e.target.checked)}
            />
          </label>
        ))}
      </div>
      <AppearanceRange
        label={t('textSize')}
        value={theme.fontSize}
        min={10}
        max={40}
        unit="px"
        onChange={(value) => update('fontSize', value)}
      />
      <div className="appearance-field">
        <span>{t('density')}</span>
        <Segments
          label={t('density')}
          value={appearance.density}
          options={[
            ['compact', t('compact')],
            ['normal', t('normalDensity')],
            ['spacious', t('spacious')],
          ]}
          onChange={(value) => precise('density', value)}
        />
        <p className="appearance-hint">
          {t('densityHint')}{' '}
          {[appearance.avatarSize, appearance.lineHeight, appearance.messageSpacing].some(
            (v) => v.mode === 'manual',
          ) && t('manualHint')}
        </p>
      </div>
      <AnimatedDetails className="appearance-advanced">
        <summary>{t('advanced')}</summary>
        <div className="appearance-advanced-body">
          <div className="eyebrow">{t('precise')}</div>
          <AutoControl
            label={t('avatarSize')}
            setting={appearance.avatarSize}
            computed={computed.avatarSize}
            min={16}
            max={80}
            unit="px"
            onChange={(v) => precise('avatarSize', v)}
          />
          <div className="appearance-field">
            <span>{t('nameWeight')}</span>
            <Segments
              label={t('nameWeight')}
              value={theme.usernameFontWeight}
              options={[
                [400, t('normalWeight')],
                [600, t('semibold')],
                [700, t('bold')],
              ]}
              onChange={(v) => update('usernameFontWeight', v)}
            />
            {![400, 600, 700].includes(theme.usernameFontWeight) && (
              <p className="appearance-hint">
                {t('savedValue')}: {theme.usernameFontWeight}
              </p>
            )}
          </div>
          <AutoControl
            label={t('lineHeight')}
            setting={appearance.lineHeight}
            computed={computed.lineHeight}
            min={1}
            max={2.5}
            step={0.01}
            onChange={(v) => precise('lineHeight', v)}
          />
          <AutoControl
            label={t('messageSpacing')}
            setting={appearance.messageSpacing}
            computed={computed.messageSpacing}
            min={0}
            max={64}
            unit="px"
            onChange={(v) => precise('messageSpacing', v)}
          />
          <AppearanceRange
            label={t('radius')}
            value={theme.borderRadius}
            min={0}
            max={24}
            unit="px"
            disabled={theme.layout !== 'bubble'}
            onChange={(v) => update('borderRadius', v)}
          />
          {theme.layout !== 'bubble' && <p className="appearance-hint">{t('radiusHint')}</p>}
          <div className="appearance-field">
            <span>{t('longMessages')}</span>
            <Segments
              label={t('longMessages')}
              value={appearance.maxLines}
              options={[
                [0, t('fullMessages')],
                [3, t('threeLines')],
                [5, t('fiveLines')],
              ]}
              onChange={(v) => precise('maxLines', v)}
            />
          </div>
          <AutoControl
            label={t('displayLimit')}
            setting={appearance.displayLimit}
            computed={computed.maxMessages}
            min={10}
            max={200}
            onChange={(v) => precise('displayLimit', v)}
            hint={t('limitHint')}
          />
          <button
            className="appearance-reset"
            onClick={() => onChange(resetPreciseAppearance(theme))}
          >
            {t('resetPrecise')}
          </button>
          <div className="appearance-extra">
            <label>
              {t('lifetime')}
              <input
                aria-label={t('lifetimeLabel')}
                type="number"
                min={0}
                max={3600}
                value={theme.lifetime ?? 0}
                onChange={(e) => update('lifetime', Number(e.target.value))}
              />
            </label>
            <label className="check-row">
              {t('shadow')}
              <input
                type="checkbox"
                checked={theme.shadow ?? false}
                onChange={(e) => update('shadow', e.target.checked)}
              />
            </label>
            <label>
              {t('animation')}
              <select
                aria-label={t('animation')}
                value={theme.animation}
                onChange={(e) => update('animation', e.target.value as ChatTheme['animation'])}
              >
                {(
                  [
                    ['none', t('noAnimation')],
                    ['fade', t('fade')],
                    ['slide-up', t('slideUp')],
                    ['slide-left', t('slideLeft')],
                    ['scale', t('zoom')],
                  ] as const
                ).map(([v, title]) => (
                  <option key={v} value={v}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <span>{t('showPlatforms')}</span>
            {(['twitch', 'youtube'] as const).map((p) => (
              <label className="check-row" key={p}>
                {p === 'twitch' ? 'Twitch' : 'YouTube'}
                <input
                  type="checkbox"
                  checked={theme.platforms.includes(p)}
                  onChange={(e) =>
                    update(
                      'platforms',
                      e.target.checked
                        ? [...theme.platforms, p]
                        : theme.platforms.filter((v) => v !== p),
                    )
                  }
                />
              </label>
            ))}
          </div>
        </div>
      </AnimatedDetails>
    </>
  );
}
