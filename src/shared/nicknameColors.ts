import type { ChatMessage } from './models';
import { normalizedViewerRoles } from './displayPolicy';
export type NicknameColorMode = 'platform' | 'random' | 'role' | 'single';
export interface NicknameColors {
  mode: NicknameColorMode;
  single: string;
  roles: { owner: string; moderator: string; bot: string; viewer: string };
}
export const nicknameDefaults = (mode: NicknameColorMode = 'platform'): NicknameColors => ({
  mode,
  single: '#c299ff',
  roles: { owner: '#f5ca78', moderator: '#72dbb2', bot: '#8fc8ff', viewer: '#c299ff' },
});
export const nicknamePalette = [
  '#c299ff',
  '#80caff',
  '#75ddb6',
  '#f4c77c',
  '#f49bba',
  '#a9c9ff',
  '#c3db83',
  '#e4adf7',
] as const;
export function deterministicUserColor(platform: string, userId: string) {
  let hash = 2166136261;
  for (const code of `${platform}:${userId}`) hash = Math.imul(hash ^ code.charCodeAt(0), 16777619);
  return nicknamePalette[(hash >>> 0) % nicknamePalette.length];
}
export function nicknameRole(message: ChatMessage): keyof NicknameColors['roles'] {
  const roles = normalizedViewerRoles(message);
  return roles.broadcaster ? 'owner' : roles.moderator ? 'moderator' : roles.bot ? 'bot' : 'viewer';
}
export function resolveNicknameColor(message: ChatMessage, settings = nicknameDefaults()) {
  if (settings.mode === 'single') return settings.single;
  if (settings.mode === 'role') return settings.roles[nicknameRole(message)];
  if (settings.mode === 'platform' && message.user.color) return message.user.color;
  return deterministicUserColor(message.platform, message.user.platformUserId);
}
