import type { ChatMessage, StreamEvent } from '../../shared/models';
export interface YouTubeMessage {
  id: string;
  snippet: {
    type: string;
    liveChatId?: string;
    publishedAt: string;
    authorChannelId?: string;
    displayMessage?: string;
    textMessageDetails?: { messageText: string };
    userBannedDetails?: {
      bannedUserDetails: { channelId: string };
      banType: string;
      banDurationSeconds?: string | number;
    };
    superChatDetails?: { amountDisplayString: string };
    superStickerDetails?: {
      amountDisplayString: string;
      superStickerMetadata?: { altText: string };
    };
  };
  authorDetails?: {
    channelId: string;
    displayName: string;
    profileImageUrl?: string;
    isChatOwner?: boolean;
    isChatModerator?: boolean;
    isChatSponsor?: boolean;
    isVerified?: boolean;
  };
}
export function normalizeYouTube(
  item: YouTubeMessage,
  accountId: string,
  liveChatId: string,
): StreamEvent | undefined {
  const s = item.snippet;
  if (!s) return;
  const kind = s.type.replace(/_/g, '').toLowerCase();
  const common = {
    platform: 'youtube' as const,
    channelId: liveChatId,
    source: 'live' as const,
    occurredAt: s.publishedAt,
  };
  if (kind === 'tombstone')
    return {
      type: 'moderation',
      ...common,
      action: 'delete',
      messageId: item.id,
      targetUserId: '',
    };
  if (kind === 'userbannedevent' && s.userBannedDetails) {
    const b = s.userBannedDetails;
    return {
      type: 'moderation',
      ...common,
      action: b.banType.toLowerCase() === 'temporary' ? 'timeout' : 'ban',
      targetUserId: b.bannedUserDetails.channelId,
      duration: b.banDurationSeconds ? Number(b.banDurationSeconds) : undefined,
    };
  }
  if (kind === 'chatendedevent') return;
  const a = item.authorDetails;
  const roles = [
    ...(a?.isChatOwner ? ['broadcaster'] : []),
    ...(a?.isChatModerator ? ['moderator'] : []),
    ...(a?.isChatSponsor ? ['member'] : []),
    ...(a?.isVerified ? ['verified'] : []),
  ];
  const eventKind =
    kind === 'textmessageevent'
      ? 'message'
      : ['superchatevent', 'superstickerevent'].includes(kind)
        ? 'donation'
        : /sponsor|member/.test(kind)
          ? 'membership'
          : 'system';
  const message: ChatMessage = {
    id: item.id,
    accountId,
    ...common,
    createdAt: s.publishedAt,
    kind: eventKind,
    user: {
      platformUserId: a?.channelId ?? s.authorChannelId ?? 'system',
      username: a?.displayName ?? 'YouTube',
      displayName: a?.displayName ?? 'YouTube',
      avatarUrl: a?.profileImageUrl,
      roles,
      badges: roles.map((role) => ({ id: role, label: role })),
    },
    text:
      s.displayMessage ??
      s.textMessageDetails?.messageText ??
      s.superStickerDetails?.superStickerMetadata?.altText ??
      s.type,
    metadata: {
      amount: s.superChatDetails?.amountDisplayString ?? s.superStickerDetails?.amountDisplayString,
    },
  };
  return { type: eventKind === 'message' ? 'chat' : eventKind, message };
}
