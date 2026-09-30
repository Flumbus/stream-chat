vi.mock('../src/renderer/stores/app', () => ({ useApp: () => 'ru' }));
import { describe, it, expect, vi } from 'vitest';
import {
  nicknameDefaults,
  nicknameRole,
  deterministicUserColor,
  resolveNicknameColor,
  nicknamePalette,
} from '../src/shared/nicknameColors';
import { themes } from '../src/shared/themes';
import { defaultSettings } from '../src/shared/themes';
import { hasTwitchModerationScopes, twitchModScopes } from '../src/shared/twitchPermissions';
import { themeSchema, settingsSchema } from '../src/shared/validation';
import { toastDuration } from '../src/shared/notifications';
import { translate, presetTextKey } from '../src/renderer/i18n';
import type { ChatMessage } from '../src/shared/models';
const message: ChatMessage = {
  id: '1',
  accountId: 'a',
  channelId: 'c',
  platform: 'twitch',
  kind: 'message',
  createdAt: '2026-01-01',
  text: 'hello',
  user: { platformUserId: '42', username: 'name', displayName: 'Name', roles: [], badges: [] },
};
describe('release UX', () => {
  it('assigns repeatable curated identity colors independent of display names', () => {
    const first = resolveNicknameColor(message, nicknameDefaults('random'));
    expect(nicknamePalette).toContain(first);
    expect(
      resolveNicknameColor(
        { ...message, user: { ...message.user, displayName: 'Changed' } },
        nicknameDefaults('random'),
      ),
    ).toBe(first);
    expect(deterministicUserColor('twitch', '42')).toBe(first);
  });
  it('uses normalized role priority including badge IDs', () => {
    expect(
      nicknameRole({
        ...message,
        user: {
          ...message.user,
          roles: ['bot', 'moderator'],
          badges: [{ id: 'broadcaster/1', label: 'owner' }],
        },
      }),
    ).toBe('owner');
    expect(
      nicknameRole({ ...message, user: { ...message.user, roles: ['bot', 'moderator'] } }),
    ).toBe('moderator');
    expect(nicknameRole({ ...message, user: { ...message.user, roles: ['subscriber'] } })).toBe(
      'viewer',
    );
  });
  it('supports one color and preserves old platform colors', () => {
    const settings = nicknameDefaults('single');
    expect(resolveNicknameColor(message, settings)).toBe(settings.single);
    const { nicknameColors: _old, ...old } = themes[0];
    void _old;
    expect(themeSchema.parse(old).nicknameColors?.mode).toBe('platform');
    expect(resolveNicknameColor({ ...message, user: { ...message.user, color: '#123456' } })).toBe(
      '#123456',
    );
  });
  it('auto-dismisses every severity', () => {
    expect(toastDuration).toEqual({ success: 4500, info: 5000, warning: 7000, error: 9000 });
  });
  it('localizes all presets without changing stored IDs', () => {
    for (const theme of themes) {
      expect(translate('ru', presetTextKey(theme.id))).not.toBe(
        translate('en', presetTextKey(theme.id)),
      );
    }
    expect(translate('en', 'developerTools')).toBe('Developer tools');
  });
});

it('migrates update settings and preset aliases without dropping legacy preferences', () => {
  const old = {
    ...defaultSettings,
    activeTheme: 'twitch-like',
    desktop: {
      ...defaultSettings.desktop!,
      chat: { ...defaultSettings.desktop!.chat, fontFamily: 'Consolas' },
    },
  };
  const parsed = settingsSchema.parse(old);
  expect(parsed.autoDownloadUpdates).toBe(true);
  expect(parsed.activeTheme).toBe('twitch');
  expect(parsed.desktop.chat.fontFamily).toBe('Consolas');
  expect(themeSchema.parse({ ...themes[0], layout: 'youtube-like' }).layout).toBe('youtube');
});
it('requires all supported Twitch moderation scopes', () => {
  expect(hasTwitchModerationScopes(['user:read:chat'])).toBe(false);
  expect(hasTwitchModerationScopes(twitchModScopes)).toBe(true);
});
