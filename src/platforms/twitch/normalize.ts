import type { StreamEvent, ChatMessage } from '../../shared/models';
export interface TwitchEvent {
  broadcaster_user_id: string;
  chatter_user_id?: string;
  chatter_user_login?: string;
  chatter_user_name?: string;
  message_id?: string;
  message?: {
    text: string;
    fragments?: { type: string; text: string; emote?: { id: string; emote_set_id?: string } }[];
  };
  color?: string;
  badges?: { set_id: string; id: string; info: string }[];
  target_user_id?: string;
  reply?: { parent_message_id: string; parent_user_name: string; parent_message_body: string };
  system_message?: string;
  notice_type?: string;
}
export function normalizeTwitch(
  type: string,
  event: TwitchEvent,
  accountId: string,
  timestamp: string,
): StreamEvent | undefined {
  const common = {
    platform: 'twitch' as const,
    channelId: event.broadcaster_user_id,
    source: 'live' as const,
    occurredAt: timestamp,
  };
  if (type === 'channel.chat.clear') return { type: 'clear', ...common };
  if (type === 'channel.chat.clear_user_messages')
    return {
      type: 'moderation',
      ...common,
      action: 'purge',
      targetUserId: event.target_user_id ?? '',
    };
  if (type === 'channel.chat.message_delete')
    return {
      type: 'moderation',
      ...common,
      action: 'delete',
      messageId: event.message_id,
      targetUserId: event.target_user_id ?? '',
    };
  if (!event.message_id || !event.chatter_user_id) return;
  const roles = (event.badges ?? []).map((b) => b.set_id);
  const message: ChatMessage = {
    id: event.message_id,
    accountId,
    ...common,
    createdAt: timestamp,
    user: {
      platformUserId: event.chatter_user_id,
      username: event.chatter_user_login ?? '',
      displayName: event.chatter_user_name ?? event.chatter_user_login ?? '',
      color: event.color || undefined,
      roles,
      badges: (event.badges ?? []).map((b) => ({ id: `${b.set_id}/${b.id}`, label: b.set_id })),
    },
    text: event.message?.text || event.system_message || '',
    kind: type === 'channel.chat.notification' ? 'subscription' : 'message',
    fragments: event.message?.fragments?.map((f) =>
      f.type === 'emote'
        ? {
            type: 'emote',
            text: f.text,
            imageUrl: f.emote
              ? `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(f.emote.id)}/default/dark/2.0`
              : undefined,
          }
        : { type: 'text', text: f.text },
    ),
    reply: event.reply
      ? {
          messageId: event.reply.parent_message_id,
          username: event.reply.parent_user_name,
          text: event.reply.parent_message_body,
        }
      : undefined,
  };
  return { type: message.kind === 'message' ? 'chat' : 'subscription', message };
}
