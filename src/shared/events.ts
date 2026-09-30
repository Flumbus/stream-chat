import type { ChatMessage, StreamEvent } from './models';
export const sourceOf = (m: ChatMessage) =>
  m.source ?? (m.accountId.startsWith('mock-') ? 'mock' : 'live');
export function messageKey(m: ChatMessage) {
  return `${sourceOf(m)}:${m.platform}:${m.channelId}:${m.id}`;
}
export function applyEvents(
  messages: ChatMessage[],
  events: StreamEvent[],
  limit = 2000,
): ChatMessage[] {
  let next = [...messages];
  for (const e of events) {
    if ('message' in e) {
      const key = messageKey(e.message);
      if (!next.some((m) => messageKey(m) === key)) next.push(e.message);
    } else if (e.type === 'clear') {
      next = next.filter(
        (m) =>
          !(
            (!e.platform || m.platform === e.platform) &&
            (!e.channelId || m.channelId === e.channelId) &&
            (!e.source || sourceOf(m) === e.source)
          ),
      );
    } else {
      const matches = (m: ChatMessage) =>
        m.platform === e.platform &&
        m.channelId === e.channelId &&
        sourceOf(m) === (e.source ?? 'mock');
      if (e.action === 'delete') next = next.filter((m) => !(matches(m) && m.id === e.messageId));
      else if (e.action === 'purge')
        next = next.filter((m) => !(matches(m) && m.user.platformUserId === e.targetUserId));
      else
        next = next.map((m) =>
          matches(m) && m.user.platformUserId === e.targetUserId
            ? {
                ...m,
                metadata: {
                  ...m.metadata,
                  overlayHidden:
                    m.metadata?.overlayHidden || e.action === 'ban' || e.action === 'timeout',
                  banned: e.action === 'ban',
                  timeoutUntil:
                    e.action === 'timeout'
                      ? new Date(
                          Date.parse(e.occurredAt ?? new Date().toISOString()) +
                            (e.duration ?? 0) * 1000,
                        ).toISOString()
                      : undefined,
                },
              }
            : m,
        );
    }
  }
  return next.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).slice(-limit);
}
export class Deduplicator {
  private keys = new Map<string, number>();
  constructor(
    private limit = 5000,
    private ttl = 600_000,
  ) {}
  accept(key: string, now = Date.now()) {
    if ((this.keys.get(key) ?? 0) > now) return false;
    this.keys.delete(key);
    this.keys.set(key, now + this.ttl);
    while (this.keys.size > this.limit) this.keys.delete(this.keys.keys().next().value!);
    return true;
  }
}
