import type { ChatMessage, PlatformAccount, UserCard } from './models';
export type DeleteUnavailableReason = 'readOnly' | 'offline' | 'permission' | 'protectedUser';
export function deleteUnavailableReason(
  message: ChatMessage,
  account: PlatformAccount | undefined,
): DeleteUnavailableReason | null {
  if (account?.readOnlyLink) return 'readOnly';
  if (account?.connectionStatus !== 'connected') return 'offline';
  if (!account.capabilities.delete) return 'permission';
  if (
    account.authStatus !== 'demo' &&
    (message.user.platformUserId === account.platformAccountId ||
      message.user.roles.some((r) => ['moderator', 'broadcaster'].includes(r)))
  )
    return 'protectedUser';
  return null;
}
export function moderationAccess(
  message: ChatMessage,
  account: PlatformAccount | undefined,
  card?: UserCard,
) {
  const active = account?.connectionStatus === 'connected' && !account.readOnlyLink;
  const protectedUser =
    account?.authStatus !== 'demo' &&
    (message.user.platformUserId === account?.platformAccountId ||
      message.user.roles.some((r) => ['moderator', 'broadcaster'].includes(r)));
  const blocked = Boolean(
    card?.banned ||
    message.metadata?.banned ||
    Date.parse(card?.timeoutUntil ?? message.metadata?.timeoutUntil ?? '') > Date.now(),
  );
  return {
    reply: Boolean(active && account?.capabilities.send),
    delete: deleteUnavailableReason(message, account) === null,
    timeout: Boolean(active && account?.capabilities.timeout && !protectedUser),
    ban: Boolean(active && account?.capabilities.ban && !protectedUser && !blocked),
    unban: Boolean(active && account?.capabilities.unban && blocked && card?.canUnban),
  };
}
