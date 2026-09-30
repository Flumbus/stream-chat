import { nicknameDefaults, type NicknameColors } from '../../../shared/nicknameColors';
import { useText } from '../../i18n';
export function NicknameControls({
  value = nicknameDefaults(),
  onChange,
}: {
  value?: NicknameColors;
  onChange: (value: NicknameColors) => void;
}) {
  const t = useText();
  return (
    <div className="nickname-controls">
      <label>
        {t('nicknameColors')}
        <select
          aria-label={t('nicknameColors')}
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as NicknameColors['mode'] })}
        >
          {value.mode === 'platform' && <option value="platform">{t('nicknamePlatform')}</option>}
          <option value="random">{t('nicknameRandom')}</option>
          <option value="role">{t('nicknameRole')}</option>
          <option value="single">{t('nicknameSingle')}</option>
        </select>
      </label>
      {value.mode === 'single' && (
        <input
          type="color"
          aria-label={t('nicknameSingle')}
          value={value.single}
          onChange={(e) => onChange({ ...value, single: e.target.value })}
        />
      )}
      {value.mode === 'role' && (
        <div className="color-row">
          {(['owner', 'moderator', 'bot', 'viewer'] as const).map((role) => (
            <label key={role}>
              {t(`${role}Color`)}
              <input
                type="color"
                value={value.roles[role]}
                onChange={(e) =>
                  onChange({ ...value, roles: { ...value.roles, [role]: e.target.value } })
                }
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
