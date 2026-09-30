import type { Settings } from './models';

export const experimentalFeatureNames = [
  'urlChannels',
  'developerTools',
  'diagnostics',
  'serverSettings',
] as const;
export type ExperimentalFeature = (typeof experimentalFeatureNames)[number];
export interface DesktopPreferences {
  locale: 'ru' | 'en';
  feedback: { sounds: boolean; volume: number; reducedMotion: 'system' | 'on' | 'off' };
  experimental: { enabled: boolean; features: Partial<Record<ExperimentalFeature, boolean>> };
  chat: {
    fontFamily?: string;
    platform: 'all' | 'twitch' | 'youtube';
    category: 'all' | 'message' | 'donation' | 'members';
    senderId?: string;
  };
}
export const desktopDefaults = (): DesktopPreferences => ({
  locale: 'ru',
  feedback: { sounds: true, volume: 0.25, reducedMotion: 'system' },
  experimental: { enabled: false, features: {} },
  chat: { platform: 'all', category: 'all' },
});
export function featureEnabled(settings: Settings, feature: ExperimentalFeature) {
  return (
    settings.desktop?.experimental.enabled === true &&
    settings.desktop.experimental.features[feature] !== false
  );
}
