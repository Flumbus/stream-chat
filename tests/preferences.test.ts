import { describe, it, expect } from 'vitest';
import { settingsSchema } from '../src/shared/validation';
import { defaultSettings } from '../src/shared/themes';
import { desktopDefaults, featureEnabled } from '../src/shared/preferences';
import { Store } from '../src/main/database/store';
describe('desktop preferences', () => {
  it('adds feedback defaults to existing desktop settings and validates volume', () => {
    const old = { ...defaultSettings, desktop: { ...desktopDefaults(), feedback: undefined } };
    expect(settingsSchema.parse(old).desktop.feedback).toEqual({
      sounds: true,
      volume: 0.25,
      reducedMotion: 'system',
    });
    expect(
      settingsSchema.safeParse({
        ...defaultSettings,
        desktop: {
          ...desktopDefaults(),
          feedback: { sounds: true, volume: 10, reducedMotion: 'system' },
        },
      }).success,
    ).toBe(false);
  });
  it('migrates old settings to a simple UI without removing developer preferences', () => {
    const old = { ...defaultSettings, desktop: undefined, developerMode: true };
    const settings = settingsSchema.parse(old);
    expect(settings.desktop.experimental.enabled).toBe(false);
    expect(settings.developerMode).toBe(true);
    expect(featureEnabled(settings, 'developerTools')).toBe(false);
  });
  it('supports independent experimental controls and master off', () => {
    const settings = {
      ...defaultSettings,
      desktop: {
        ...desktopDefaults(),
        experimental: { enabled: true, features: { urlChannels: false } },
      },
    };
    expect(featureEnabled(settings, 'urlChannels')).toBe(false);
    expect(featureEnabled(settings, 'diagnostics')).toBe(true);
    settings.desktop.experimental.enabled = false;
    expect(featureEnabled(settings, 'diagnostics')).toBe(false);
  });
  it('persists sender/filter preferences without changing overlay profiles', () => {
    const store = new Store(':memory:');
    try {
      store.seedProfiles();
      const before = store.getProfiles();
      const desktop = desktopDefaults();
      desktop.chat = { platform: 'youtube', category: 'members', senderId: 'youtube:owner' };
      store.saveSettings({ ...defaultSettings, desktop });
      expect(store.getSettings().desktop).toEqual(desktop);
      expect(store.getProfiles()).toEqual(before);
    } finally {
      store.close();
    }
  });
});
