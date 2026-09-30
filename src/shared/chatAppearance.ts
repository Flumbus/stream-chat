import { migrateLegacyCommands } from './displayPolicy';
import type { AutoValue, ChatAppearance, ChatTheme, MessageDensity } from './models';

const metrics = {
  compact: { avatar: 2.1, spacing: 0.43, line: 1.33, padding: 0.29 },
  normal: { avatar: 2.43, spacing: 0.79, line: 1.45, padding: 0.5 },
  spacious: { avatar: 2.7, spacing: 1.14, line: 1.6, padding: 0.71 },
} satisfies Record<
  MessageDensity,
  { avatar: number; spacing: number; line: number; padding: number }
>;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const automaticAppearance = (): ChatAppearance => ({
  version: 1,
  density: 'normal',
  avatarSize: { mode: 'auto' },
  lineHeight: { mode: 'auto' },
  messageSpacing: { mode: 'auto' },
  displayLimit: { mode: 'auto' },
  maxLines: 0,
});
export const computeAvatarSize = (fontSize: number, density: MessageDensity) =>
  clamp(Math.round(fontSize * metrics[density].avatar), 24, 112);
export const computeLineHeight = (fontSize: number, density: MessageDensity) =>
  Math.round((metrics[density].line + clamp((fontSize - 14) * 0.002, -0.01, 0.04)) * 100) / 100;
export const computeMessageSpacing = (fontSize: number, density: MessageDensity) =>
  Math.round(fontSize * metrics[density].spacing);
const valueOf = (setting: AutoValue<number>, automatic: number) =>
  setting.mode === 'auto' ? automatic : setting.value;
type LegacyTheme = Omit<ChatTheme, 'avatarSize' | 'lineHeight' | 'messageSpacing' | 'maxMessages'> &
  Partial<Pick<ChatTheme, 'avatarSize' | 'lineHeight' | 'messageSpacing' | 'maxMessages'>>;
const legacyValue = (n: number | undefined): AutoValue<number> =>
  n === undefined ? { mode: 'auto' } : { mode: 'manual', value: n };

// JSON migration at the read/validation boundary. Presence is checked BEFORE defaults.
// Repeated loads keep explicit modes; no SQLite schema rewrite is necessary.
export function normalizeAppearance(
  theme: LegacyTheme,
): ChatTheme & { appearance: ChatAppearance } {
  theme = migrateLegacyCommands(theme);
  const appearance = theme.appearance ?? {
    ...automaticAppearance(),
    avatarSize: legacyValue(theme.avatarSize),
    lineHeight: legacyValue(theme.lineHeight),
    messageSpacing: legacyValue(theme.messageSpacing),
    displayLimit: legacyValue(theme.maxMessages),
  };
  return {
    ...theme,
    avatarSize: theme.avatarSize ?? 34,
    lineHeight: theme.lineHeight ?? 1.45,
    messageSpacing: theme.messageSpacing ?? 11,
    maxMessages: theme.maxMessages ?? 100,
    appearance,
  };
}
export function computeDisplayMessageLimit(theme: ChatTheme, height = 900): number {
  const a = normalizeAppearance(theme).appearance;
  if (a.displayLimit.mode === 'manual') return a.displayLimit.value;
  const avatar = theme.showAvatar
    ? valueOf(a.avatarSize, computeAvatarSize(theme.fontSize, a.density))
    : 0;
  const line = valueOf(a.lineHeight, computeLineHeight(theme.fontSize, a.density));
  const gap = valueOf(a.messageSpacing, computeMessageSpacing(theme.fontSize, a.density));
  const padding = Math.round(theme.fontSize * metrics[a.density].padding);
  const estimatedRow = Math.max(avatar, theme.fontSize * line * 3) + gap + padding * 2;
  return clamp(Math.ceil(Math.max(1, height) / estimatedRow), 3, 200);
}
export function resolveAppearance(theme: ChatTheme, height = 900) {
  const normalized = normalizeAppearance(theme);
  const a = normalized.appearance;
  return {
    ...normalized,
    avatarSize: valueOf(a.avatarSize, computeAvatarSize(theme.fontSize, a.density)),
    lineHeight: valueOf(a.lineHeight, computeLineHeight(theme.fontSize, a.density)),
    messageSpacing: valueOf(a.messageSpacing, computeMessageSpacing(theme.fontSize, a.density)),
    maxMessages: computeDisplayMessageLimit(theme, height),
    messagePadding: Math.round(theme.fontSize * metrics[a.density].padding),
    iconSize: clamp(Math.round(theme.fontSize * (a.density === 'compact' ? 0.9 : 1)), 12, 32),
    maxLines: a.maxLines,
    multiline: true,
  };
}
export function resetPreciseAppearance(theme: ChatTheme): ChatTheme {
  return {
    ...theme,
    appearance: {
      ...automaticAppearance(),
      density: normalizeAppearance(theme).appearance.density,
    },
    borderRadius: theme.layout === 'bubble' ? 14 : 10,
    usernameFontWeight: 600,
    multiline: true,
  };
}
