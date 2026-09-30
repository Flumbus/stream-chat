export const twitchScopes = ['user:read:chat', 'user:write:chat'];
export const twitchModScopes = [
  'moderator:manage:banned_users',
  'moderator:manage:chat_messages',
  'user:read:moderated_channels',
];
export const hasTwitchModerationScopes = (scopes: string[]) =>
  twitchModScopes.every((scope) => scopes.includes(scope));
