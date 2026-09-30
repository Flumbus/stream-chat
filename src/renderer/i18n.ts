import { useApp } from './stores/app';
import { strings, translate, type TextKey } from '../shared/i18n';
export { translate, type TextKey } from '../shared/i18n';
export function useText() {
  const locale = useApp((s) => s.snapshot.settings.desktop?.locale ?? 'ru');
  return (key: TextKey) => translate(locale, key);
}

export function presetTextKey(id: string): TextKey {
  const keys: Record<string, TextKey> = {
    modern: 'presetModern',
    minimal: 'presetMinimal',
    bubble: 'presetBubble',
    twitch: 'presetTwitch',
    'twitch-like': 'presetTwitch',
    youtube: 'presetYoutube',
    'youtube-like': 'presetYoutube',
    overlay: 'presetOverlay',
    neon: 'presetNeon',
  };
  return keys[id] ?? 'presetModern';
}

// Imperative labels (context menus and transient statuses) share the same dictionary.
export function uiText(key: TextKey) {
  return translate(useApp.getState().snapshot.settings.desktop?.locale ?? 'ru', key);
}
export function localizeLabel(value: string) {
  const entry = Object.values(strings).find((pair) => pair[0] === value);
  return entry
    ? entry[useApp.getState().snapshot.settings.desktop?.locale === 'en' ? 1 : 0]
    : value;
}

export function displayError(value: string | undefined) {
  if (!value) return '';
  const localized = localizeLabel(value);
  const locale = useApp.getState().snapshot.settings.desktop?.locale ?? 'ru';
  if (value.startsWith('StreamChat API is unavailable')) return uiText('apiUnavailable');
  if (locale === 'en' && /[А-Яа-яЁё]/u.test(localized)) return uiText('actionErrorDetail');
  return localized;
}

export function historyLabels() {
  return {
    automatic: uiText('automatic'),
    blocked: uiText('releaseText91'),
    soft: uiText('releaseText92'),
    deleted: uiText('deletedRule'),
  };
}
export function actionLabel(action: 'ban' | 'unban' | 'timeout' | 'delete' | 'none') {
  return uiText(
    (
      {
        ban: 'releaseText94',
        unban: 'releaseText115',
        timeout: 'releaseText159',
        delete: 'releaseText118',
        none: 'releaseText158',
      } as const
    )[action],
  );
}
