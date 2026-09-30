import { describe, expect, it } from 'vitest';
import { Store } from '../src/main/database/store';
import {
  automaticAppearance,
  computeAvatarSize,
  computeLineHeight,
  computeMessageSpacing,
  normalizeAppearance,
  resetPreciseAppearance,
  resolveAppearance,
} from '../src/shared/chatAppearance';
import { themes } from '../src/shared/themes';
import { profileSchema, themeSchema } from '../src/shared/validation';

describe('automatic chat appearance', () => {
  it('scales avatars, spacing and padding across every font size and density', () => {
    for (const density of ['compact', 'normal', 'spacious'] as const) {
      let previous = 0;
      for (let fontSize = 10; fontSize <= 40; fontSize++) {
        const size = computeAvatarSize(fontSize, density);
        expect(size).toBeGreaterThanOrEqual(previous);
        expect(size).toBeGreaterThan(fontSize);
        previous = size;
        expect(computeMessageSpacing(fontSize, 'compact')).toBeLessThan(
          computeMessageSpacing(fontSize, 'normal'),
        );
        expect(computeMessageSpacing(fontSize, 'normal')).toBeLessThan(
          computeMessageSpacing(fontSize, 'spacious'),
        );
        expect(computeLineHeight(fontSize, density)).toBeGreaterThanOrEqual(1.3);
      }
    }
    expect(computeAvatarSize(14, 'normal')).toBe(34);
    expect(computeLineHeight(14, 'normal')).toBe(1.45);
    expect(computeMessageSpacing(14, 'normal')).toBe(11);
    const compact = resolveAppearance({
      ...themes[0],
      appearance: { ...automaticAppearance(), density: 'compact' },
    });
    expect(compact.messagePadding).toBeLessThan(resolveAppearance(themes[0]).messagePadding);
  });
  it('keeps manual values fixed and recalculates auto values', () => {
    const theme = {
      ...themes[0],
      appearance: {
        ...automaticAppearance(),
        avatarSize: { mode: 'manual' as const, value: 48 },
        lineHeight: { mode: 'manual' as const, value: 1.8 },
        messageSpacing: { mode: 'manual' as const, value: 7 },
      },
    };
    const large = resolveAppearance({
      ...theme,
      fontSize: 40,
      appearance: { ...theme.appearance, density: 'spacious' },
    });
    expect(large).toMatchObject({ avatarSize: 48, lineHeight: 1.8, messageSpacing: 7 });
    expect(resolveAppearance({ ...themes[0], fontSize: 40 }).avatarSize).toBeGreaterThan(
      resolveAppearance(themes[0]).avatarSize,
    );
  });
  it('migrates old JSON values as manual without overwriting the stored profile', () => {
    const store = new Store(':memory:');
    try {
      const legacy = {
        ...themes[0],
        appearance: undefined,
        avatarSize: 24,
        lineHeight: 1.8,
        messageSpacing: 9,
        maxMessages: 450,
      };
      const raw = JSON.stringify(legacy);
      store.db
        .prepare('INSERT INTO chat_profiles VALUES(?,?,?,?,?)')
        .run('old', 'Old', raw, '2026', '2026');
      const loaded = store.getProfiles()[0];
      expect(loaded.theme.appearance).toMatchObject({
        avatarSize: { mode: 'manual', value: 24 },
        lineHeight: { mode: 'manual', value: 1.8 },
        messageSpacing: { mode: 'manual', value: 9 },
        displayLimit: { mode: 'manual', value: 450 },
      });
      expect(store.db.prepare('SELECT theme_json FROM chat_profiles').get()?.theme_json).toBe(raw);
      store.saveProfile(loaded);
      expect(store.getProfiles()[0]).toEqual(loaded);
      expect(profileSchema.parse(loaded)).toEqual(loaded);
    } finally {
      store.close();
    }
  });
  it('uses auto only for missing fields in partial legacy profiles', () => {
    const loaded = themeSchema.parse({
      ...themes[0],
      appearance: undefined,
      avatarSize: undefined,
      lineHeight: undefined,
      messageSpacing: 0,
      maxMessages: undefined,
    });
    expect(loaded.appearance.avatarSize.mode).toBe('auto');
    expect(loaded.appearance.lineHeight.mode).toBe('auto');
    expect(loaded.appearance.displayLimit.mode).toBe('auto');
    expect(loaded.appearance.messageSpacing).toEqual({ mode: 'manual', value: 0 });
    expect(normalizeAppearance(loaded)).toEqual(loaded);
  });
  it('resets precise settings but preserves user design choices', () => {
    const before = {
      ...themes[2],
      fontSize: 22,
      background: '#112233',
      showAvatar: false,
      showBadges: false,
      showPlatformIcon: false,
      showTimestamps: false,
      hideBots: true,
      hideCommands: true,
      usernameFontWeight: 800,
      borderRadius: 23,
      appearance: {
        ...automaticAppearance(),
        density: 'spacious' as const,
        avatarSize: { mode: 'manual' as const, value: 60 },
        maxLines: 3 as const,
      },
    };
    const after = resetPreciseAppearance(before);
    for (const key of [
      'id',
      'layout',
      'fontSize',
      'background',
      'showAvatar',
      'showBadges',
      'showPlatformIcon',
      'showTimestamps',
      'hideBots',
      'hideCommands',
    ] as const)
      expect(after[key]).toEqual(before[key]);
    expect(after.appearance).toEqual({ ...automaticAppearance(), density: 'spacious' });
    expect(after.borderRadius).toBe(14);
    expect(after.usernameFontWeight).toBe(600);
  });
  it('limits display by height without changing the global buffer or manual limits', () => {
    const small = resolveAppearance(themes[0], 300);
    const tall = resolveAppearance(themes[0], 1800);
    expect(small.maxMessages).toBeLessThan(tall.maxMessages);
    expect(resolveAppearance({ ...themes[0], fontSize: 40 }, 900).maxMessages).toBeLessThan(
      resolveAppearance(themes[0], 900).maxMessages,
    );
    const manual = {
      ...themes[0],
      appearance: {
        ...automaticAppearance(),
        displayLimit: { mode: 'manual' as const, value: 80 },
      },
    };
    expect(resolveAppearance(manual, 300).maxMessages).toBe(80);
    expect(resolveAppearance(manual, 1800).maxMessages).toBe(80);
    expect(themes[0].maxMessages).toBe(100);
  });
  it('validates modes and rejects malicious or unsupported appearance values', () => {
    for (const appearance of [
      { ...automaticAppearance(), version: 2 },
      { ...automaticAppearance(), density: 'invalid' },
      { ...automaticAppearance(), avatarSize: { mode: 'manual', value: 1000 } },
      { ...automaticAppearance(), lineHeight: { mode: 'auto', value: 1 } },
      { ...automaticAppearance(), maxLines: 4 },
    ])
      expect(themeSchema.safeParse({ ...themes[0], appearance }).success).toBe(false);
  });
});
