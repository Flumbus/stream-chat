import type { ChatMessage, ChatProfile, StreamEvent } from './models';
import { sourceOf } from './events';
export type OverlayPacket = { version: 1; sequence: number } & (
  | { type: 'overlay.ready'; payload: { profile: ChatProfile; messages: ChatMessage[] } }
  | { type: 'chat.message'; payload: ChatMessage }
  | {
      type: 'chat.delete' | 'moderation.userBanned' | 'moderation.userTimedOut';
      payload: Extract<StreamEvent, { type: 'moderation' }>;
    }
  | { type: 'chat.clear'; payload: Extract<StreamEvent, { type: 'clear' }> }
  | { type: 'profile.updated'; payload: ChatProfile }
  | { type: 'settings.updated'; payload: { reset: true } }
);
export function publicMessage(m: ChatMessage): ChatMessage {
  return {
    id: m.id,
    accountId: '',
    platform: m.platform,
    channelId: m.channelId,
    user: m.user,
    text: m.text,
    fragments: m.fragments,
    createdAt: m.createdAt,
    kind: m.kind,
    source: sourceOf(m),
    reply: m.reply,
    metadata: m.metadata
      ? {
          amount: m.metadata.amount,
          banned: m.metadata.banned,
          timeoutUntil: m.metadata.timeoutUntil,
          bot: m.metadata.bot,
          overlayHidden: m.metadata.overlayHidden,
        }
      : undefined,
  };
}
